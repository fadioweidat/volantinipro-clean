import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { randomUUID } from 'node:crypto';

// Explicit opt-in, fixed loopback, fixed disposable DB; never accepts a remote URL.
const enabled = process.env.CHAT_HARDENING_LOCAL_DB === '1';
const config = { host: '127.0.0.1', port: 55439, database: 'chat_hardening_test', user: 'supabase_admin', password: 'local-only-test', connectionTimeoutMillis: 4000 };
const read = (name) => readFileSync(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8');
const rpcFile = '20260905131000_messaging_and_modification_rpcs.sql';
const groupFile = '20260829170000_driver_group_access_model.sql';
function functionSql(file, name) {
  const source = read(file);
  const start = source.toLowerCase().indexOf('create or replace function public.' + name + '(');
  assert.ok(start >= 0, name);
  const tail = source.slice(start);
  const delimiter = tail.match(/as\s+(\$\w*\$)/i)[1];
  const end = tail.indexOf(delimiter + ';', tail.indexOf(delimiter) + delimiter.length) + delimiter.length + 1;
  return tail.slice(0, end);
}

test('local PostgreSQL: chat, outbox, group concurrency and structured issues', { skip: !enabled, timeout: 60000 }, async (t) => {
  const db = new pg.Client(config); await db.connect();
  const sessions = [];
  const connect = async (role = 'anon', uid = '', appRole = '') => {
    const c = new pg.Client(config); await c.connect(); sessions.push(c);
    await c.query(`set role ${role}`);
    await c.query("select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claim.app_role',$2,false)", [uid, appRole]);
    return c;
  };
  const value = async (c, sql, params = []) => (await c.query(sql, params)).rows[0]?.value;
  const call = (c, name, params) => value(c, `select to_jsonb(public.${name}(${params.map((_, i) => '$' + (i + 1)).join(',')})) as value`, params);
  try {
    assert.equal(await value(db, 'select current_database() as value'), 'chat_hardening_test');
    await db.query('create extension if not exists pg_cron');
    await db.query("select cron.unschedule(jobid) from cron.job where jobname like 'chat-realtime-outbox%'");
    await db.query('drop schema if exists public cascade; drop schema if exists auth cascade; drop schema if exists storage cascade; drop schema if exists realtime cascade; create schema public authorization postgres; grant usage on schema public to public');
    await db.query(readFileSync(new URL('./fixtures/chat-driver-hardening.sql.fixture', import.meta.url), 'utf8'));
    // Table definitions are the actual existing migration, including FK + RLS.
    const groupSource = read(groupFile);
    await db.query(groupSource.slice(groupSource.indexOf('create table if not exists public.driver_group_access_links'), groupSource.indexOf('-- 3. driver_group_participants')));
    await db.query('alter table public.driver_group_access_links add column driver_secret text');
    await db.query(read('20260905130000_messaging_and_modification_requests.sql'));
    for (const name of ['hub_get_or_create_customer_conversation', 'hub_get_or_create_driver_conversation', 'hub_resolve_driver_assignment', 'customer_send_message', 'customer_list_messages', 'driver_send_message', 'driver_list_messages', 'admin_send_message', 'admin_list_messages', 'driver_mark_messages_seen']) {
      await db.query(functionSql(rpcFile, name));
    }
    await db.query(functionSql('20260905140000_admin_driver_first_message.sql', 'admin_send_driver_message'));
    await db.query(functionSql(groupFile, 'log_assignment_event'));
    for (const [file, names] of [
      ['20260919150000_driver_one_zone_at_a_time_and_issue_zone.sql', ['customer_create_issue', 'driver_list_issues']],
      ['20260905120000_customer_issue_zone_routing.sql', ['driver_transition_issue', 'get_customer_issues', 'admin_list_issues']],
      ['20260830094000_customer_issue_rpcs.sql', ['driver_register_issue_photo']],
    ]) for (const name of names) await db.query(functionSql(file, name));
    await db.query("create publication supabase_realtime").catch((e) => { if (e.code !== '42710') throw e; });
    await db.query(read('20260912130000_realtime_conversation_messages.sql'));
    // Production baseline (already applied there as 20260923184105).
    await db.query(read('20260923184105_chat_channel_isolation.sql'));
    await db.query(`do $$ declare r record; begin
      for r in select c.oid::regclass as name from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'
      loop execute format('alter table %s owner to postgres', r.name); end loop;
      for r in select p.oid::regprocedure as name from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
      loop execute format('alter function %s owner to postgres', r.name); end loop;
    end $$`);
    await db.query('grant all on all tables in schema public to postgres; grant usage, select on all sequences in schema public to postgres');
    // Run candidate migrations as their intended owner. No migration sent remotely.
    await db.query('set role postgres');
    await db.query(read('20261002120000_chat_realtime_outbox.sql'));
    await db.query(read('20261002121000_driver_group_link_lock_scope.sql'));
    await db.query('reset role');
    assert.equal(await value(db, "select schedule as value from cron.job where jobname='chat-realtime-outbox'"), '5 seconds');
    assert.equal(await value(db, "select command as value from cron.job where jobname='chat-realtime-outbox'"), 'call public.dispatch_chat_realtime_outbox()');
    assert.equal(await value(db, "select schedule as value from cron.job where jobname='chat-realtime-outbox-housekeeping'"), '*/10 * * * *');
    // Keep automatic dispatcher from consuming the fault-injection fixture.
    await db.query("update cron.job set active=false where jobname='chat-realtime-outbox'");

    const customer = randomUUID(), admin = randomUUID(), campaign = randomUUID(), group = randomUUID(), a = randomUUID(), b = randomUUID(), zone = randomUUID();
    await db.query('insert into auth.users values($1),($2);', [customer, admin]);
    await db.query('insert into public.profiles values($1)', [admin]);
    await db.query('insert into public.campaigns(id,customer_id) values($1,$2)', [campaign, customer]);
    await db.query('insert into public.operational_groups values($1,$2)', [group, campaign]);
    await db.query("insert into public.operator_assignments(id,campaign_id,group_id,access_token) values($1,$3,$4,'fixture-a'),($2,$3,$4,'fixture-b')", [a,b,campaign,group]);
    const driver = await connect(), client = await connect('authenticated',customer), administrator = await connect('authenticated',admin,'admin');
    let driverMessage, customerMessage;
    await t.test('1 Driver → Admin persists and is visible through Admin RPC', async () => {
      driverMessage = await call(driver,'driver_send_message',[a,'driver message','fixture-a',null]);
      assert.equal(driverMessage.recipient_role,'admin');
      assert.equal(driverMessage.sender_id,a);
      assert.equal((await call(administrator,'admin_list_messages',[driverMessage.conversation_id])).length,1);
    });
    await t.test('2 Admin → Driver, including first message', async () => {
      const msg = await call(administrator,'admin_send_driver_message',[b,'first admin message']);
      assert.equal(msg.recipient_role,'driver');
      assert.equal((await call(driver,'driver_list_messages',[b,'fixture-b']))[0].id,msg.id);
    });
    await t.test('3 Customer → Admin', async () => {
      customerMessage = await call(client,'customer_send_message',[campaign,'customer message',null,null]);
      assert.equal(customerMessage.sender_id,customer); assert.equal(customerMessage.recipient_role,'admin');
      assert.equal((await call(administrator,'admin_list_messages',[customerMessage.conversation_id]))[0].id,customerMessage.id);
    });
    await t.test('4 Admin → Customer', async () => {
      const msg = await call(administrator,'admin_send_message',[customerMessage.conversation_id,'reply',null,null]);
      assert.equal(msg.recipient_role,'customer');
      assert.ok((await call(client,'customer_list_messages',[campaign])).some(m=>m.id===msg.id));
    });
    for (const [number,sender,recipient] of [[5,'customer','driver'],[6,'driver','customer']]) await t.test(`${number} ${sender} → ${recipient} impossible`, async () => {
      await assert.rejects(db.query('insert into public.conversation_messages(conversation_id,sender_role,recipient_role,text) values($1,$2,$3,$4)',[driverMessage.conversation_id,sender,recipient,'forbidden']), {code:'23514'});
      await assert.rejects(call(sender==='customer'?client:driver,'admin_send_message',[driverMessage.conversation_id,'forbidden',null,null]), {code:'42501'});
    });
    await t.test('7 real statement timeout and ordinary realtime failure cannot roll back committed messages', async () => {
      const candidate = await value(db,"select pg_get_functiondef('public.on_conversation_message_inserted()'::regprocedure) as value");
      const before = await value(db,'select count(*)::int as value from public.conversation_messages');
      await db.query(functionSql('20260912130000_realtime_conversation_messages.sql','on_conversation_message_inserted'));
      await driver.query("set chat_test.realtime_failure='cancel'; set statement_timeout='150ms'");
      try {
        await assert.rejects(call(driver,'driver_send_message',[a,'baseline cancelled message','fixture-a',null]),{code:'57014'});
        assert.equal(await value(db,'select count(*)::int as value from public.conversation_messages'),before);
      } finally {
        await db.query(candidate); await driver.query('reset statement_timeout');
      }
      const expected = { ordinary: /REALTIME_SEND_NOT_PERSISTED/, cancel: /^DISPATCH_INTERRUPTED$/ };
      for (const mode of ['ordinary','cancel']) {
        await db.query("select set_config('chat_test.realtime_failure',$1,false)",[mode]);
        await driver.query("select set_config('chat_test.realtime_failure',$1,false)",[mode]);
        await driver.query("set statement_timeout='500ms'");
        const saved = await call(driver,'driver_send_message',[a,'persistent '+mode,'fixture-a',null]);
        await driver.query('reset statement_timeout');
        await db.query("update public.chat_realtime_outbox set next_attempt_at = now()");
        const count = await value(db,'select count(*)::int as value from public.chat_realtime_outbox');
        if (mode === 'cancel') {
          await db.query("set statement_timeout='100ms'");
          await assert.rejects(db.query('call public.dispatch_chat_realtime_outbox()'), {code:'57014'});
          await db.query('reset statement_timeout; reset transaction_timeout');
        } else {
          await db.query('call public.dispatch_chat_realtime_outbox()');
        }
        // Nothing is deleted on failure: every row records the attempt and error.
        assert.equal(await value(db,'select count(*)::int as value from public.chat_realtime_outbox'),count);
        const rows = (await db.query("select status, attempts, last_error, last_attempt_at from public.chat_realtime_outbox")).rows;
        for (const row of rows) {
          assert.equal(row.status,'pending'); assert.ok(row.attempts >= 1); assert.ok(row.last_attempt_at);
          assert.match(row.last_error, expected[mode]);
        }
        assert.ok((await call(driver,'driver_list_messages',[a,'fixture-a'])).some(m=>m.id===saved.id));
      }
      await db.query("set chat_test.realtime_failure='' ");
      await db.query("update public.chat_realtime_outbox set next_attempt_at = now()");
      await db.query('call public.dispatch_chat_realtime_outbox()');
      assert.equal(await value(db,'select count(*)::int as value from public.chat_realtime_outbox'),0);
      const deliveries = (await db.query('select * from realtime.messages')).rows;
      assert.ok(deliveries.length > 0);
      for (const row of deliveries) { assert.equal(row.event,'messages_changed'); assert.deepEqual(row.payload,{changed:true}); }
      await assert.rejects(driver.query('call public.dispatch_chat_realtime_outbox()'), {code:'42501'});
      await assert.rejects(driver.query('select public.chat_realtime_outbox_housekeeping()'), {code:'42501'});
    });
    await t.test('10 concurrent same/different assignments share one link and token', async () => {
      const peers = await Promise.all(Array.from({length:8},()=>connect()));
      const results = await Promise.all(peers.map((c,i)=>call(c,'driver_get_or_create_group_access_link',[i%2?a:b,i%2?'fixture-a':'fixture-b'])));
      assert.equal(new Set(results.map(r=>r.link_id)).size,1);
      assert.equal(new Set(results.map(r=>r.token)).size,1);
      assert.equal(results.filter(r=>r.created).length,1);
      assert.equal((await call(driver,'driver_get_or_create_group_access_link',[a,'fixture-a'])).token,results[0].token);
      await assert.rejects(call(driver,'driver_get_or_create_group_access_link',[a,'wrong']),{code:'42501'});
      await db.query('update public.operator_assignments set group_access_link_id=$1 where id=$2',[results[0].link_id,b]);
      await assert.rejects(call(driver,'driver_get_or_create_group_access_link',[b,'fixture-b']),{code:'42501'});
      await db.query('update public.operator_assignments set group_access_link_id=null where id=$1',[b]);
    });
    await t.test('11 opened → confirmed while link transaction remains open; confirmation cannot precede opening', async () => {
      await assert.rejects(call(driver,'log_assignment_event',[a,'assignment_program_confirmed','fixture-a']), /PROGRAM_NOT_OPENED/);
      const candidate = await value(db,"select pg_get_functiondef('public.driver_get_or_create_group_access_link(uuid,text)'::regprocedure) as value");
      // Reproduce the old FK lock wait on this same synthetic assignment.
      await db.query(functionSql('20260924120000_driver_group_link_self_service.sql','driver_get_or_create_group_access_link'));
      const baseline = await connect(); await baseline.query('begin');
      try {
        await call(baseline,'driver_get_or_create_group_access_link',[a,'fixture-a']);
        await driver.query("set statement_timeout='150ms'");
        await assert.rejects(call(driver,'log_assignment_event',[a,'assignment_program_opened','fixture-a']), {code:'57014'});
      } finally {
        await baseline.query('rollback'); await driver.query('reset statement_timeout');
        await db.query(candidate);
      }
      await driver.query("set chat_test.realtime_failure='' ");
      const held = await connect(); await held.query('begin');
      try {
        await call(held,'driver_get_or_create_group_access_link',[a,'fixture-a']);
        await driver.query("set statement_timeout='500ms'");
        const started = performance.now();
        await call(driver,'log_assignment_event',[a,'assignment_program_opened','fixture-a']);
        t.diagnostic(`Local FK experiment: original RPC hits 150ms timeout; candidate opened succeeds in ${Math.round(performance.now()-started)}ms with link transaction still open.`);
        await call(driver,'log_assignment_event',[a,'assignment_program_confirmed','fixture-a']);
        await call(driver,'log_assignment_event',[a,'assignment_program_confirmed','fixture-a']);
        assert.equal(await value(db,"select count(*)::int as value from public.assignment_event_log where assignment_id=$1 and event_type='assignment_program_confirmed'",[a]),1);
      } finally { await held.query('rollback'); await driver.query('reset statement_timeout'); }
    });
    await t.test('Admin regeneration and Driver retrieval serialize on the group', async () => {
      const admin2 = await connect('authenticated',admin,'admin');
      await admin2.query('begin');
      try {
        await call(admin2,'admin_create_group_access_link',[campaign,group,null,null]);
        let settled = false;
        const pending = call(driver,'driver_get_or_create_group_access_link',[a,'fixture-a']).finally(()=>{settled=true;});
        await new Promise(r=>setTimeout(r,100)); assert.equal(settled,false);
        await admin2.query('commit');
        const result = await pending; assert.equal(result.recoverable,false); assert.equal(result.token,null);
        assert.equal(await value(db,"select count(*)::int as value from public.driver_group_access_links where status='active'"),1);
      } finally { await admin2.query('rollback'); }
    });
    await t.test('12 structured Customer issue → assigned Driver seen/take/photo/resolve stays separate from chat', async () => {
      await db.query("update public.operator_assignments set status='revoked' where id=$1",[b]);
      await db.query('insert into public.campaign_zones(id,campaign_id,group_id,zone_name) values($1,$2,$3,$4)',[zone,campaign,group,'Synthetic zone']);
      const before = await value(db,'select count(*)::int as value from public.conversation_messages');
      const issue = await call(client,'customer_create_issue',[campaign,'Synthetic town','Synthetic street','1',null,null,'non_ricevuto',null,zone]);
      assert.equal(issue.assignment_id,a);
      assert.ok((await call(driver,'driver_list_issues',[a,'fixture-a'])).some(i=>i.id===issue.id));
      for (const [action,status] of [['seen','seen'],['take','in_progress']]) assert.equal((await call(driver,'driver_transition_issue',[issue.id,action,null,a,'fixture-a'])).status,status);
      const path = `campaign/${campaign}/issue/${issue.id}/photo/fixture.jpg`;
      await db.query("insert into storage.objects values('proof-photos',$1)",[path]);
      const photo = await call(driver,'driver_register_issue_photo',[issue.id,path,45,9,5,'Synthetic location',null,a,'fixture-a']);
      assert.equal(photo.issue_id,issue.id);
      assert.equal((await call(driver,'driver_transition_issue',[issue.id,'resolve','Verified synthetic fixture',a,'fixture-a'])).status,'resolved');
      assert.equal((await call(client,'get_customer_issues',[campaign]))[0].status,'resolved');
      assert.equal((await call(administrator,'admin_list_issues',[campaign]))[0].status,'resolved');
      assert.equal(await value(db,'select count(*)::int as value from public.conversation_messages'),before);
    });
    await t.test('pg_cron executes the separately committed outbox dispatcher', async () => {
      await call(driver,'driver_send_message',[a,'scheduled fixture','fixture-a',null]);
      assert.ok(await value(db,'select count(*)::int as value from public.chat_realtime_outbox') > 0);
      await db.query("update cron.job set active=true where jobname='chat-realtime-outbox'");
      const deadline = Date.now()+8000;
      while (Date.now()<deadline && await value(db,'select count(*)::int as value from public.chat_realtime_outbox') > 0) {
        await new Promise(r=>setTimeout(r,250));
      }
      await db.query("update cron.job set active=false where jobname='chat-realtime-outbox'");
      assert.equal(await value(db,'select count(*)::int as value from public.chat_realtime_outbox'),0);
    });
  } finally {
    await Promise.all(sessions.map(c=>c.end()));
    await db.end();
  }
});
