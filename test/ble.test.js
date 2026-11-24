import test from 'node:test';
import assert from 'node:assert/strict';
import { connectCard, sendToCard } from '../js/ble.js';

Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { bluetooth: {} } });

function fixture({ connectFailures = 0, delayedConnect = false, serviceError = false, dataError = false, offset = false } = {}) {
  const state = { connects: 0, disconnects: 0, stops: 0, writes: [], listeners: new Map() };
  const ctrl = {
    uuid: '0000fef1-0000-1000-8000-00805f9b34fb',
    addEventListener: (name, listener) => state.listeners.set(name, listener),
    removeEventListener: (name) => state.listeners.delete(name),
    startNotifications: async () => {},
    stopNotifications: async () => { state.stops++; },
    writeValue: async (bytes) => {
      state.writes.push([...bytes]);
      if (bytes[0] === 1) notify([1, 244, 0]);
    },
  };
  function notify(bytes) {
    const buffer = offset ? Uint8Array.from([99, 99, ...bytes, 88]).buffer : Uint8Array.from(bytes).buffer;
    const value = new DataView(buffer, offset ? 2 : 0, bytes.length);
    state.listeners.get('characteristicvaluechanged')?.({ target: { value } });
  }
  const data = {
    uuid: '0000fef2-0000-1000-8000-00805f9b34fb',
    writeValueWithResponse: async () => {
      if (dataError) throw new Error('GATT write failed');
      notify([5, 8]);
    },
  };
  const device = {
    name: 'TodooCard',
    addEventListener: (name, callback) => state.listeners.set(name, callback),
    removeEventListener: (name) => state.listeners.delete(name),
    gatt: {
      connected: false,
      connect: async () => {
        state.connects++;
        if (delayedConnect && state.connects === 1) {
          setTimeout(() => {
            device.gatt.connected = true;
            state.listeners.get('gattserverconnected')?.();
          }, 30);
          throw new Error('Connection already in progress.');
        }
        if (state.connects <= connectFailures) throw new Error('Connection already in progress.');
        device.gatt.connected = true;
        return device.gatt;
      },
      disconnect: () => {
        state.disconnects++;
        device.gatt.connected = false;
        state.listeners.get('gattserverdisconnected')?.();
      },
      getPrimaryServices: async () => {
        if (serviceError) throw new Error('Service discovery failed');
        return [{ getCharacteristics: async () => [ctrl, data] }];
      },
    },
  };
  return { device, state };
}
const quiet = () => {};

test('Edge pending connection is cancelled, then retried', async () => {
  const { device, state } = fixture({ connectFailures: 1 });
  await connectCard(device, quiet);
  assert.equal(state.connects, 2);
  assert.equal(state.disconnects, 1);
});

test('Edge pending connection is adopted when its original attempt completes', async () => {
  const { device, state } = fixture({ delayedConnect: true });
  await connectCard(device, quiet);
  assert.equal(state.connects, 1);
  assert.equal(device.gatt.connected, true);
  assert.equal(state.disconnects, 0);
});

test('service discovery failure disconnects and releases the next send', async () => {
  const bad = fixture({ serviceError: true });
  await assert.rejects(sendToCard(new Uint8Array(240), quiet, quiet, bad.device), /Service discovery/);
  assert.equal(bad.state.disconnects, 1);
  assert.equal(bad.state.listeners.size, 0);
  const good = fixture();
  const result = await sendToCard(new Uint8Array(240), quiet, quiet, good.device);
  assert.equal(result.acked, true);
  assert.equal(good.state.stops, 1);
  assert.equal(good.state.listeners.size, 0);
  // 连接修复保留现有桌面版握手字节与数据格式。
  assert.deepEqual(good.state.writes, [[1], [2, 240, 0, 0], [3]]);
});

test('data failure removes notification handlers and disconnects', async () => {
  const { device, state } = fixture({ dataError: true });
  await assert.rejects(sendToCard(new Uint8Array(240), quiet, quiet, device), /GATT write failed/);
  assert.equal(state.disconnects, 1);
  assert.equal(state.stops, 1);
  assert.equal(state.listeners.size, 0);
});

test('simultaneous sends never open a second GATT connection', async () => {
  const first = fixture();
  const second = fixture();
  const sending = sendToCard(new Uint8Array(240), quiet, quiet, first.device);
  await assert.rejects(sendToCard(new Uint8Array(240), quiet, quiet, second.device), /正在发送/);
  assert.equal(second.state.connects, 0);
  await sending;
});

test('notifications respect DataView offset, including after pending connection recovery', async () => {
  const { device } = fixture({ offset: true, connectFailures: 1 });
  const result = await sendToCard(new Uint8Array(240), quiet, quiet, device);
  assert.equal(result.acked, true);
});

test('a different tab holding the Web Lock prevents GATT access', async () => {
  navigator.locks = { request: async (_name, options, callback) => {
    assert.equal(options.ifAvailable, true);
    return callback(null);
  } };
  try {
    const { device, state } = fixture();
    await assert.rejects(sendToCard(new Uint8Array(240), quiet, quiet, device), /另一个土豆片网页/);
    assert.equal(state.connects, 0);
  } finally { delete navigator.locks; }
});
