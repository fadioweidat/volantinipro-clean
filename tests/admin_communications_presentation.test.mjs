import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConversationIdentity, ConversationEmptyState } from '../src/pages/admin/communications/ConversationIdentity.jsx';
import { resolveCustomerIdentity, resolveDriverIdentity, getConversationPreview } from '../src/lib/admin/communicationIdentity.js';

const uuid = '58bb64af-7929-4de1-8375-b43fa52519a4';
const render = (conversation, header = false) => renderToStaticMarkup(React.createElement(ConversationIdentity, { conversation, header }));

test('Cliente: nome, ruolo, campagna, comune, preview e non letti in ordine', () => {
  const conversation = { kind: 'customer_admin', id: 'c', unread_count: 3, last_message: { text: 'hi' } };
  conversation.identity = resolveCustomerIdentity(conversation, { client_name: 'Fadi Oweidat', title: 'Preventivo', city: 'Legnano ( mi )' });
  const html = render(conversation);
  const labels = ['Fadi Oweidat', '>Cliente<', 'Campagna Preventivo', 'Legnano (MI)', '>hi<'];
  for (const label of labels) assert.ok(html.includes(label), label);
  for (let i = 1; i < labels.length; i++) assert.ok(html.indexOf(labels[i]) > html.indexOf(labels[i - 1]));
  assert.match(html, /aria-label="3 messaggi non letti"/);
  const header = render(conversation, true);
  assert.match(header, /conversation-header-title/);
  assert.match(header, /Legnano \(MI\)/);
  assert.doesNotMatch(header, /comms-preview|comms-unread/);
});

test('Driver: gruppo senza prefisso duplicato e assignment anche con nome disponibile', () => {
  const conversation = { kind: 'driver_admin', assignment_id: uuid, last_message: { text: 'dove sei' } };
  conversation.identity = resolveDriverIdentity(conversation, { group_name: 'Gruppo postini pubblicitari', city: 'Varedo (mb)' });
  const html = render(conversation);
  assert.match(html, />Gruppo postini pubblicitari</);
  assert.doesNotMatch(html, /Gruppo Gruppo/);
  assert.match(html, />Driver</);
  assert.match(html, /Assignment #58bb64af/);
  assert.match(html, /Varedo \(MB\)/);
  assert.match(html, /dove sei/);
  assert.match(render(conversation, true), /Assignment #58bb64af/);
});

test('Campagna e zona non sostituiscono il nome cliente; fallback espliciti', () => {
  assert.equal(resolveCustomerIdentity({}, { title: 'Preventivo' }).title, 'Cliente');
  const identity = resolveCustomerIdentity({}, { zone_name: 'Tradate (va)' });
  assert.equal(identity.title, 'Cliente');
  assert.equal(identity.campaign, 'Campagna');
  assert.equal(identity.locationLabel, 'Tradate (VA)');
  const html = render({ kind: 'customer_admin' });
  assert.match(html, />Cliente</);
  assert.match(html, />Campagna</);
  assert.match(html, /Località non disponibile/);
  assert.match(html, /Nessun messaggio ancora/);
  assert.doesNotMatch(html, /comms-unread/);
});

test('UUID in tutti i campi display non diventa un nome, una campagna o località', () => {
  const customer = resolveCustomerIdentity({ customer_name: uuid, campaign_id: uuid }, { company_name: uuid, title: uuid, city: uuid, zone_name: uuid });
  assert.equal(customer.title, 'Cliente');
  assert.equal(customer.campaign, 'Campagna');
  assert.equal(customer.locationLabel, 'Località non disponibile');
  const driver = resolveDriverIdentity({ operator_name: uuid, assignment_id: uuid }, { participant_label: uuid, group_name: uuid });
  assert.equal(driver.title, 'Driver');
  assert.equal(driver.assignmentLabel, 'Assignment #58bb64af');
});

test('Dati directory vuoti/UUID non nascondono i fallback della conversazione', () => {
  const identity = resolveCustomerIdentity({ campaign_name: 'Preventivo', city: 'Legnano' }, { campaign_name: uuid, city: '  ' });
  assert.equal(identity.campaign, 'Campagna Preventivo');
  assert.equal(identity.locationLabel, 'Legnano');
});

test('Preview conserva il messaggio e gestisce driver senza conversazione', () => {
  assert.equal(getConversationPreview({ last_message: { text: '  hi  ' } }), 'hi');
  assert.match(getConversationPreview({ kind: 'driver_admin', id: null }), /scrivi il primo messaggio/);
  assert.equal(getConversationPreview({ kind: 'driver_admin', id: 'c', last_message: { text: ' ' } }), 'Nessun messaggio ancora');
});

test('Campagna compatta: rimuove solo nome ripetuto e località duplicata, conserva altri qualificatori', () => {
  const identity = { title: 'Fadi Oweidat', kindLabel: 'Cliente', campaign: 'Campagna Preventivo (Fadi oweidat) · Legnano (MI)', locationLabel: 'Legnano (MI)' };
  const html = render({ kind: 'customer_admin', identity });
  assert.match(html, /class="comms-campaign" title="Campagna Preventivo">Campagna Preventivo</);
  assert.doesNotMatch(html, /\(Fadi oweidat\)/);
  assert.equal((html.match(/Legnano \(MI\)/g) || []).length, 1);
  assert.match(render({ kind: 'customer_admin', identity: { ...identity, campaign: 'Campagna Estate (fase 2)' } }), /Campagna Estate \(fase 2\)/);
});

test('Driver non può diventare una card Cliente anche con identity display incoerente', () => {
  const html = render({ kind: 'driver_admin', operator_name: 'Gruppo postini pubblicitari', assignment_id: uuid,
    identity: { title: 'Fadi Oweidat', kindLabel: 'Cliente', campaign: 'Campagna errata' } });
  assert.match(html, /data-kind="driver_admin"/);
  assert.match(html, />Driver</);
  assert.match(html, />Gruppo postini pubblicitari</);
  assert.doesNotMatch(html, /Fadi Oweidat|>Cliente<|Campagna errata|Località non disponibile/);
  assert.match(html, /Assignment #58bb64af/);
});

test('Cliente non può diventare una card Driver anche con identity display incoerente', () => {
  const html = render({ kind: 'customer_admin', customer_name: 'Fadi Oweidat',
    identity: { title: 'Gruppo errato', kindLabel: 'Driver', assignmentLabel: 'Assignment #errato' } });
  assert.match(html, /data-kind="customer_admin"/);
  assert.match(html, />Cliente</);
  assert.match(html, />Fadi Oweidat</);
  assert.doesNotMatch(html, /Gruppo errato|>Driver<|Assignment/);
});

test('Tipo sconosciuto resta neutro; empty state spiega la selezione', () => {
  const html = render({ kind: 'unknown', identity: { title: 'Driver estraneo', kindLabel: 'Driver' } });
  assert.match(html, /Tipo non disponibile/);
  assert.doesNotMatch(html, /Driver estraneo|>Driver<|>Cliente</);
  const empty = renderToStaticMarkup(React.createElement(ConversationEmptyState));
  assert.match(empty, /conversation-empty-state/);
  assert.match(empty, /Seleziona una conversazione/);
});
