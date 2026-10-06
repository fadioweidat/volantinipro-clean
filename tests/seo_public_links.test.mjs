import test from 'node:test';
import assert from 'node:assert/strict';
import PublicNavLink from '../src/components/common/PublicNavLink.jsx';

function event(overrides = {}) {
  return { button: 0, prevented: false, preventDefault() { this.prevented = true; }, ...overrides };
}

test('ordinary link click invokes the original SPA/analytics handler exactly once', () => {
  let calls = 0;
  const click = event();
  const link = PublicNavLink({ href: '/preventivo', onClick: received => {
    assert.equal(received, click);
    calls += 1;
  } });
  link.props.onClick(click);
  assert.equal(link.type, 'a');
  assert.equal(link.props.href, '/preventivo');
  assert.equal(click.prevented, true);
  assert.equal(calls, 1);
});

for (const overrides of [{ctrlKey:true}, {metaKey:true}, {shiftKey:true}, {altKey:true}, {button:1}, {defaultPrevented:true}]) {
  test(`native/previously handled click is preserved: ${JSON.stringify(overrides)}`, () => {
    let calls = 0;
    const click = event(overrides);
    PublicNavLink({ href: '/consulente', onClick: () => { calls += 1; } }).props.onClick(click);
    assert.equal(click.prevented, false);
    assert.equal(calls, 0);
  });
}

test('links without SPA handlers remain native and preserve styling/accessibility props', () => {
  const click = event();
  const link = PublicNavLink({ href: '/privacy', style: {color:'orange'}, 'aria-label':'Privacy', children:'Privacy' });
  link.props.onClick(click);
  assert.equal(click.prevented, false);
  assert.deepEqual(link.props.style, {textDecoration:'none', color:'orange'});
  assert.equal(link.props['aria-label'], 'Privacy');
  assert.equal(link.props.children, 'Privacy');
});
