import test from 'node:test';
import assert from 'node:assert/strict';
import { connectCard, sendToCard } from '../js/ble.js';

Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { bluetooth: {} } });

function fixture({ connectFailures = 0, delayedConnect = false, serviceError = false, dataError = false, offset = false,
  serviceBusy = 0, characteristicBusy = 0, notificationBusy = 0, variant = 0 } = {}) {
  const state = { connects: 0, disconnects: 0, stops: 0, writes: [], listeners: new Map(),
    services: 0, characteristics: 0, notifications: 0, servicesRequested: [], writesAtConnect: [] };
  const ctrl = {
    uuid: '0000fef1-0000-1000-8000-00805f9b34fb',
    addEventListener: (name, listener) => state.listeners.set(name, listener),
    removeEventListener: (name) => state.listeners.delete(name),
    startNotifications: async () => {
      if (++state.notifications <= notificationBusy) throw new Error('Connection already in progress.');
    },
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
        state.writesAtConnect.push(state.writes.length);
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
      getPrimaryServices: async () => { throw new Error('Must not enumerate unrelated services'); },
      getPrimaryService: async uuid => {
        state.services++;
        state.servicesRequested.push(uuid);
        if (serviceError) throw new Error('Service discovery failed');
        if (state.services <= serviceBusy) throw new Error('Connection already in progress.');
        if (uuid !== [0xfef0, 0xfdf0][variant]) throw Object.assign(new Error('No matching service'), { name: 'NotFoundError' });
        return { getCharacteristic: async uuid => {
          if (++state.characteristics <= characteristicBusy) throw new Error('GATT operation already in progress.');
          if (uuid === [0xfef1, 0xfdf1][variant]) return ctrl;
          if (uuid === [0xfef2, 0xfdf2][variant]) return data;
          throw new Error('Unexpected characteristic');
        } };
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

test('Edge service discovery pending after connect retries without image writes or reconnect', async () => {
  const { device, state } = fixture({ serviceBusy: 2 });
  const logs = [];
  const result = await sendToCard(new Uint8Array(240), s => logs.push(s), quiet, device);
  assert.equal(result.acked, true);
  assert.equal(state.connects, 1);
  assert.equal(state.services, 3);
  assert.deepEqual(state.writesAtConnect, [0]);
  assert.deepEqual(state.writes, [[1], [2, 240, 0, 0], [3]]);
  assert.ok(logs.some(s => s.includes('查找服务 0xfef0时')));
});

test('persistent busy discovery reconnects and reacquires service before first handshake', async () => {
  const { device, state } = fixture({ serviceBusy: 3 });
  const result = await sendToCard(new Uint8Array(240), quiet, quiet, device);
  assert.equal(result.acked, true);
  assert.equal(state.connects, 2);
  assert.equal(state.disconnects, 2); // Recovery, then final cleanup.
  assert.deepEqual(state.writesAtConnect, [0, 0]);
  assert.equal(state.writes.length, 3);
  assert.equal(state.listeners.size, 0);
});

test('characteristic discovery and notification subscription each wait for Edge readiness', async () => {
  const { device, state } = fixture({ characteristicBusy: 1, notificationBusy: 1 });
  const result = await sendToCard(new Uint8Array(240), quiet, quiet, device);
  assert.equal(result.acked, true);
  assert.equal(state.characteristics, 3);
  assert.equal(state.notifications, 2);
  assert.equal(state.connects, 1);
  assert.equal(state.stops, 1);
});

test('alternate FDF0 service is found without querying unapproved services', async () => {
  const { device, state } = fixture({ variant: 1 });
  const result = await sendToCard(new Uint8Array(240), quiet, quiet, device);
  assert.equal(result.acked, true);
  assert.deepEqual(state.servicesRequested, [0xfef0, 0xfdf0]);
  assert.equal(state.connects, 1);
});

test('exhausted service retries report the stage, clean up, and allow a fresh send', async () => {
  const { device, state } = fixture({ serviceBusy: Infinity });
  await assert.rejects(sendToCard(new Uint8Array(240), quiet, quiet, device), /查找服务 0xfef0失败：Connection already in progress/);
  assert.equal(state.connects, 3);
  assert.equal(state.services, 9);
  assert.equal(state.listeners.size, 0);
  assert.equal(state.writes.length, 0);
  assert.equal((await sendToCard(new Uint8Array(240), quiet, quiet, fixture().device)).acked, true);
});
