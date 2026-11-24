// A strict peripheral state machine, not a physical Bluetooth adapter. Used by
// Node and the isolated Edge harness to verify protocol bytes and full packets.
export function emulateCard(payload, { busyWrites = 2, busyCommand = 1, failCommand = 0, controlMode = 'write', notificationOffset = true, ackDelayMs = 0, maxUnacked = Infinity } = {}) {
  const events = new Map(), deviceEvents = new Map();
  const stats = { commands: [], packets: [], busy: 0, connected: false, stops: 0, confirmed: false, writeMethods: [], dataMethods: [], discoveries: [] };
  let phase = 'connected', expectedLength = 0, acknowledged = -1;
  const fail = message => { throw new Error('Emulator: ' + message); };
  const notify = bytes => {
    const storage = Uint8Array.from(notificationOffset ? [0xaa, ...bytes, 0xbb] : bytes);
    events.get('characteristicvaluechanged')?.({ target: { value: new DataView(storage.buffer, notificationOffset ? 1 : 0, bytes.length) } });
  };
  const ctrl = {
    uuid: '0000fef1-0000-1000-8000-00805f9b34fb',
    properties: { write: controlMode === 'write', writeWithoutResponse: controlMode === 'writeWithoutResponse', notify: true },
    addEventListener: (type, fn) => events.set(type, fn),
    removeEventListener: type => events.delete(type),
    startNotifications: async () => { phase = 'subscribed'; },
    stopNotifications: async () => { stats.stops++; },
    writeValue: async bytes => {
      if (bytes[0] === failCommand || (bytes[0] === busyCommand && stats.busy < busyWrites)) {
        stats.busy++;
        throw new DOMException('Connection already in progress.', 'NetworkError');
      }
      stats.commands.push([...bytes]);
      if (bytes[0] === 1) {
        if (phase !== 'subscribed' || bytes.length !== 1) fail('invalid block request');
        notify([1, 244, 0]); phase = 'block';
      } else if (bytes[0] === 2) {
        if (phase !== 'block' || bytes.length !== 4) fail('invalid length command');
        expectedLength = bytes[1] | (bytes[2] << 8) | (bytes[3] << 16);
        if (expectedLength !== Math.ceil(payload.length / 240) * 240) fail('wrong padded length');
        notify([2, 0]); phase = 'length';
      } else if (bytes[0] === 3) {
        if (phase !== 'length' || bytes.length !== 1) fail('invalid start');
        phase = 'sending';
      } else fail('unknown control command');
    },
  };
  const acceptControl = ctrl.writeValue;
  ctrl.writeValue = async bytes => { stats.writeMethods.push('deprecated'); return acceptControl(bytes); };
  ctrl.writeValueWithResponse = async bytes => {
    if (!ctrl.properties.write) fail('write with response unsupported');
    stats.writeMethods.push('withResponse'); return acceptControl(bytes);
  };
  ctrl.writeValueWithoutResponse = async bytes => {
    if (!ctrl.properties.writeWithoutResponse) fail('write without response unsupported');
    stats.writeMethods.push('withoutResponse'); return acceptControl(bytes);
  };
  const data = {
    uuid: '0000fef2-0000-1000-8000-00805f9b34fb',
    writeValueWithResponse: async packet => {
      if (phase !== 'sending' || packet.length !== 244) fail('data before start or incorrect packet size');
      const index = new DataView(packet.buffer, packet.byteOffset, packet.byteLength).getUint32(0, true);
      if (index !== stats.packets.length) fail('skipped or duplicate block');
      if (index - acknowledged > maxUnacked) fail('peripheral receive buffer overflow');
      for (let i = 0; i < 240; i++) if (packet[i + 4] !== (payload[index * 240 + i] ?? 0)) fail('payload/padding mismatch');
      stats.packets.push(index);
      if ((index + 1) % 16 === 0) {
        const ack = () => { acknowledged = index; notify([5, 0, index & 255, (index >>> 8) & 255, (index >>> 16) & 255, (index >>> 24) & 255]); };
        if (ackDelayMs) setTimeout(ack, ackDelayMs); else ack();
      }
      if ((index + 1) * 240 === expectedLength) {
        phase = 'done'; stats.confirmed = true; notify([5, 8]);
      }
    },
  };
  const acceptData = data.writeValueWithResponse;
  data.writeValueWithResponse = async packet => { stats.dataMethods.push('withResponse'); return acceptData(packet); };
  data.writeValueWithoutResponse = async packet => { stats.dataMethods.push('withoutResponse'); return acceptData(packet); };
  const service = {
    uuid: '0000fef0-0000-1000-8000-00805f9b34fb',
    getCharacteristics: async () => [ctrl, data],
    getCharacteristic: async id => id === 0xfef1 ? ctrl : id === 0xfef2 ? data : fail('unexpected characteristic'),
  };
  const device = {
    id: 'simulated-card', name: 'SIMULATED FFFF99803901',
    addEventListener: (type, fn) => deviceEvents.set(type, fn),
    removeEventListener: type => deviceEvents.delete(type),
    gatt: {
      connected: false,
      connect: async () => { device.gatt.connected = stats.connected = true; return device.gatt; },
      disconnect: () => { device.gatt.connected = stats.connected = false; deviceEvents.get('gattserverdisconnected')?.(); },
      getPrimaryServices: async () => { stats.discoveries.push('enumerate'); return [service]; },
      getPrimaryService: async id => {
        stats.discoveries.push('specific');
        if (id !== 0xfef0) fail('unexpected service');
        return service;
      },
    },
  };
  return { device, stats, ctrl, data, service };
}
