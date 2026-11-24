import test from 'node:test';
import assert from 'node:assert/strict';
import { sendToCard } from '../js/ble.js';
import { emulateCard } from './support/card-emulator.js';

Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { bluetooth: {} } });

for (const command of [1, 2]) {
  test(`full transfer validates all 103 packets after Edge busy on command ${command}`, async () => {
    const payload = Uint8Array.from({ length: 24686 }, (_, i) => (i * 37 + 11) & 255);
    const { device, stats } = emulateCard(payload, { busyCommand: command });
    const result = await sendToCard(payload, () => {}, () => {}, device);
    assert.equal(result.acked, true);
    assert.equal(result.blocks, 103);
    assert.equal(stats.busy, 2);
    assert.equal(stats.packets.length, 103);
    assert.equal(stats.confirmed, true);
    assert.equal(stats.connected, false);
    assert.deepEqual(stats.commands, [[1], [2, 0x90, 0x60, 0], [3]]);
    assert.ok(stats.writeMethods.every(method => method === 'withResponse'));
  });
}

test('control characteristic advertising only writeWithoutResponse uses supported API', async () => {
  const payload = new Uint8Array(24686);
  const { device, stats } = emulateCard(payload, { busyWrites: 0, controlMode: 'writeWithoutResponse' });
  assert.equal((await sendToCard(payload, () => {}, () => {}, device)).acked, true);
  assert.deepEqual(stats.writeMethods, ['withoutResponse', 'withoutResponse', 'withoutResponse']);
  assert.equal(stats.packets.length, 103);
});
