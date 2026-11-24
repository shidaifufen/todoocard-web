import test from 'node:test';
import assert from 'node:assert/strict';
import { openCardConnection } from '../js/card-connection.js';
import { sendWithProfile } from '../js/transfer-profiles.js';
import { emulateCard } from './support/card-emulator.js';

Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { bluetooth: {} } });
const quiet = () => {};
const payload = Uint8Array.from({ length: 24686 }, (_, i) => i & 255);
function card() {
  const c = emulateCard(payload, { busyWrites: 0 });
  const original = c.device.gatt.getPrimaryService;
  c.order = [];
  c.device.gatt.getPrimaryService = async id => {
    c.order.push(id);
    if (id === 0x180f) return { getCharacteristic: async () => ({ readValue: async () => new DataView(Uint8Array.of(75).buffer) }) };
    return original(id);
  };
  return c;
}
const fast = { securePause: 0, retryPause: 0, operationTimeout: 100, replyTimeout: 10 };

test('encrypted battery is read before image controls; verification sends only 01 and cleans up', async () => {
  const c = card();
  const session = await openCardConnection(c.device, quiet, quiet, fast);
  assert.deepEqual(c.order, [0x180f, 0xfef0]);
  assert.deepEqual(c.stats.commands, [[1]]);
  assert.equal(c.stats.packets.length, 0);
  assert.equal(session.blockSize, 240);
  await session.close();
  assert.equal(c.device.gatt.connected, false);
});

test('prepared sending reuses one connection, subscription and block query for all 103 packets', async () => {
  const c = card(); let connections = 0, subscriptions = 0;
  const connect = c.device.gatt.connect, subscribe = c.ctrl.startNotifications;
  c.device.gatt.connect = async () => { connections++; return connect(); };
  c.ctrl.startNotifications = async () => { subscriptions++; return subscribe(); };
  const result = await sendWithProfile(payload, quiet, quiet, c.device, 'prepared');
  assert.equal(result.acked, true);
  assert.equal(connections, 1);
  assert.equal(subscriptions, 1);
  assert.equal(c.stats.commands.filter(b => b[0] === 1).length, 1);
  assert.equal(c.stats.packets.length, 103);
  assert.equal(c.device.gatt.connected, false);
});

test('authentication failure stops before control writes and does not masquerade as optional battery', async () => {
  const c = card();
  c.device.gatt.getPrimaryService = async () => { throw new DOMException('Insufficient Authentication', 'SecurityError'); };
  await assert.rejects(openCardConnection(c.device, quiet, quiet, fast), /Insufficient Authentication/);
  assert.deepEqual(c.stats.commands, []);
  assert.equal(c.device.gatt.connected, false);
});

test('only missing battery service is optional for legacy firmware', async () => {
  const c = card(), original = c.device.gatt.getPrimaryService;
  c.device.gatt.getPrimaryService = async id => {
    if (id === 0x180f) throw new DOMException('missing', 'NotFoundError');
    return original(id);
  };
  const session = await openCardConnection(c.device, quiet, quiet, fast);
  assert.equal(session.blockSize, 240);
  await session.close();
});

test('missing control reply prevents length/start/image commands', async () => {
  const c = card(); c.ctrl.writeValue = async () => {};
  await assert.rejects(openCardConnection(c.device, quiet, quiet, fast), /未收到有效分块回执/);
  assert.equal(c.stats.packets.length, 0);
  assert.equal(c.device.gatt.connected, false);
});

test('timed out connect cleans up even when the native connect completes late', async () => {
  const c = card(); let finish;
  c.device.gatt.connect = () => new Promise(resolve => { finish = () => { c.device.gatt.connected = true; resolve(c.device.gatt); }; });
  await assert.rejects(openCardConnection(c.device, quiet, quiet, { ...fast, operationTimeout: 5 }), /超时/);
  finish();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(c.device.gatt.connected, false);
  assert.equal(c.stats.packets.length, 0);
});
