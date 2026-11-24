import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { sendWithProfile } from '../js/transfer-profiles.js';
import { emulateCard } from './support/card-emulator.js';

Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { bluetooth: {} } });
const quiet = () => {};
const payload = Uint8Array.from({ length: 24686 }, (_, i) => (i * 37 + 11) & 255);
const manifest = JSON.parse(await readFile(new URL('./fixtures/ble-history/manifest.json', import.meta.url)));

for (const snapshot of manifest) {
  const source = await readFile(new URL(`./fixtures/ble-history/${snapshot.revision}.txt`, import.meta.url), 'utf8');
  assert.equal(createHash('sha256').update(source).digest('hex'), snapshot.sha256, 'historical source must remain unchanged');
  const module = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  test(`historical ${snapshot.revision}: identical 24686 bytes, all 103 packets and display acknowledgement`, async () => {
    const { device, stats } = emulateCard(payload, { busyWrites: 0, notificationOffset: false });
    navigator.bluetooth.requestDevice = async () => device;
    const result = await module.sendToCard(payload, quiet, quiet, device);
    assert.equal(result.acked, true);
    assert.equal(stats.packets.length, 103);
    assert.deepEqual(stats.commands, [[1], [2, 0x90, 0x60, 0], [3]]);
    assert.ok(stats.dataMethods.every(method => method === snapshot.dataMethod));
    assert.ok(stats.writeMethods.every(method => method === snapshot.controlMethod));
    assert.equal(stats.discoveries[0], snapshot.discovery);
    assert.equal(stats.connected, false);
  });
  test(`historical ${snapshot.revision}: delayed ACK and a 20-packet receive buffer`, async () => {
    const { device, stats } = emulateCard(payload, {
      busyWrites: 0, notificationOffset: false, ackDelayMs: 40, maxUnacked: 20,
    });
    navigator.bluetooth.requestDevice = async () => device;
    try {
      if (snapshot.revision === 'e8a928f') {
        await assert.rejects(module.sendToCard(payload, quiet, quiet, device), /receive buffer overflow/);
        assert.equal(stats.packets.length, 20);
      } else {
        assert.equal((await module.sendToCard(payload, quiet, quiet, device)).acked, true);
        assert.equal(stats.packets.length, 103);
      }
    } finally { device.gatt.disconnect(); }
  });
}

for (const profile of ['legacy', 'discovery', 'current']) {
  test(`published ${profile}: completes image and releases connection`, async () => {
    const { device, stats } = emulateCard(payload, { busyWrites: 0 });
    // B is kept as an exact historical implementation, including its original
    // notification parser. A additionally fixes the DataView boundary issue.
    if (profile === 'discovery') {
      const plain = emulateCard(payload, { busyWrites: 0, notificationOffset: false });
      const result = await sendWithProfile(payload, quiet, quiet, plain.device, profile);
      assert.equal(result.acked, true);
      assert.equal(plain.stats.packets.length, 103);
      assert.equal(plain.stats.connected, false);
      return;
    }
    const result = await sendWithProfile(payload, quiet, quiet, device, profile);
    assert.equal(result.acked, true);
    assert.equal(result.profile, profile);
    assert.equal(stats.packets.length, 103);
    assert.equal(stats.connected, false);
  });

  test(`published ${profile}: persistent first-write failure sends no image and never changes profile`, async () => {
    const { device, stats } = emulateCard(payload, { busyWrites: Infinity, notificationOffset: false });
    await assert.rejects(sendWithProfile(payload, quiet, quiet, device, profile), /Connection already in progress/);
    assert.equal(stats.packets.length, 0);
    assert.equal(stats.connected, false);
    assert.equal(stats.busy, profile === 'current' ? 5 : 1);
  });
}

test('two services demonstrate old last-match selection versus new first FEF0 selection', async () => {
  function dualServiceCard() {
    const first = emulateCard(payload, { busyWrites: Infinity, notificationOffset: false });
    const last = emulateCard(payload, { busyWrites: 0, notificationOffset: false });
    last.ctrl.uuid = last.ctrl.uuid.replace('fef1', 'fdf1');
    last.data.uuid = last.data.uuid.replace('fef2', 'fdf2');
    last.service.uuid = last.service.uuid.replace('fef0', 'fdf0');
    first.device.gatt.getPrimaryServices = async () => [first.service, last.service];
    return { first, last };
  }
  const old = dualServiceCard();
  assert.equal((await sendWithProfile(payload, quiet, quiet, old.first.device, 'legacy')).acked, true);
  assert.equal(old.first.stats.packets.length, 0);
  assert.equal(old.last.stats.packets.length, 103);
  const modern = dualServiceCard();
  await assert.rejects(sendWithProfile(payload, quiet, quiet, modern.first.device, 'current'), /Connection already in progress/);
  assert.equal(modern.last.stats.packets.length, 0);
});

test('control API compatibility can differ even when characteristic properties advertise both', async () => {
  for (const profile of ['legacy', 'discovery', 'current']) {
    const f = emulateCard(payload, { busyWrites: 0, notificationOffset: false });
    f.ctrl.properties.writeWithoutResponse = true;
    f.ctrl.writeValueWithResponse = async () => { throw new Error('Connection already in progress.'); };
    if (profile === 'current') {
      await assert.rejects(sendWithProfile(payload, quiet, quiet, f.device, profile), /Connection already in progress/);
      assert.equal(f.stats.packets.length, 0);
    } else {
      assert.equal((await sendWithProfile(payload, quiet, quiet, f.device, profile)).acked, true);
    }
  }
});
