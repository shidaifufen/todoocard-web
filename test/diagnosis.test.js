import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnoseCard } from '../js/ble.js';

Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { bluetooth: {} } });

test('diagnosis tries both advertised write types using only block queries and cleans up', async () => {
  const commands = [];
  let listener, stopped = false;
  const ctrl = {
    properties: { write: true, writeWithoutResponse: true },
    addEventListener: (_type, fn) => { listener = fn; },
    removeEventListener: () => { listener = null; },
    startNotifications: async () => {}, stopNotifications: async () => { stopped = true; },
    writeValueWithResponse: async bytes => { commands.push(['with', ...bytes]); throw new Error('Connection already in progress.'); },
    writeValueWithoutResponse: async bytes => {
      commands.push(['without', ...bytes]);
      listener({ target: { value: new DataView(Uint8Array.from([1, 244, 0]).buffer) } });
    },
  };
  const device = { id: 'diagnosis-test', addEventListener() {}, removeEventListener() {}, gatt: {
    connected: true, disconnect() { this.connected = false; },
    getPrimaryService: async () => ({ getCharacteristic: async id => id === 0xfef1 ? ctrl : {} }),
  } };
  const result = await diagnoseCard(device, () => {});
  assert.equal(result.ok, true);
  assert.equal(result.method, 'writeValueWithoutResponse');
  assert.deepEqual(commands, [['with', 1], ['without', 1]]);
  assert.equal(device.gatt.connected, false);
  assert.equal(listener, null);
  assert.equal(stopped, true);
});
