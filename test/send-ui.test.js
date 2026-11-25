import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const source = html.split('// ── 发送 ──')[1].split('// ── 定时 ──')[0];
function page({ send, select } = {}) {
  const nodes = new Map(), logs = [], calls = [];
  const element = id => {
    if (!nodes.has(id)) nodes.set(id, { disabled: false, style: {}, textContent: '', value: 'legacy' });
    return nodes.get(id);
  };
  const context = vm.createContext({
    $: element, log: message => logs.push(message), performance,
    W: 528, H: 792, ctx: { getImageData: () => ({}) }, st: { template: 'quote' },
    navigator: { bluetooth: {} }, bleSupported: () => true,
    buildPayloads: () => { calls.push('build'); return { payload: new Uint8Array(240) }; },
    requestCardDevice: async () => { calls.push('select'); return select ? select() : { id: 'card' }; },
    sendWithProfile: async (...args) => { calls.push('send'); return send ? send(...args) : { ok: true, acked: true }; },
  });
  vm.runInContext(source, context);
  return { context, nodes, logs, calls, run: () => vm.runInContext('sendNow()', context) };
}

test('chooser opens before image preparation; busy scan and duplicate send cannot race', async () => {
  let finish;
  const ui = page({ send: () => new Promise(resolve => { finish = resolve; }) });
  const pending = ui.run();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(ui.calls, ['select', 'build', 'send']);
  assert.equal(ui.nodes.get('scan').disabled, true);
  assert.equal(await ui.run(), false);
  finish({ ok: true, acked: true });
  assert.equal(await pending, true);
  assert.equal(ui.nodes.get('scan').disabled, false);
  assert.equal(ui.nodes.get('send').disabled, false);
});

test('failed connection keeps selected device for retry and exposes status', async () => {
  let tries = 0;
  const ui = page({ send: async () => {
    if (++tries === 1) throw new Error('Connection already in progress.');
    return { ok: true, acked: true };
  } });
  assert.equal(await ui.run(), false);
  assert.match(ui.nodes.get('state').textContent, /发送失败/);
  assert.equal(ui.nodes.get('send').disabled, false);
  assert.equal(await ui.run(), true);
  assert.equal(ui.calls.filter(call => call === 'select').length, 1);
});

test('cancelled chooser restores both controls without building a payload', async () => {
  const ui = page({ select: async () => { throw new Error('User cancelled'); } });
  assert.equal(await ui.run(), false);
  assert.deepEqual(ui.calls, ['select']);
  assert.equal(ui.nodes.get('send').disabled, false);
  assert.equal(ui.nodes.get('scan').disabled, false);
});

test('sending is pinned to D and unconfirmed writes show a warning', async () => {
  let chosen;
  const ui = page({ send: async (...args) => {
    chosen = args[4];
    return { ok: true, acked: false };
  } });
  ui.context.$('transferProfile').value = 'discovery';
  await ui.run();
  assert.equal(chosen, 'prepared');
  assert.match(ui.nodes.get('state').textContent, /未收到显影确认/);
  assert.equal(ui.nodes.get('state').className, 'hint warn');
});
