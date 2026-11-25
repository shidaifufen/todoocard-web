// Upstream order: read encrypted Battery Level, then discover image controls.
// Web Bluetooth has no native pair() API: the browser/OS owns system bonding.
// A successful query proves GATT readiness, not readable OS bond status.
import { withCardLock } from './ble.js?v=20261124f';

const SERVICES = [0xfef0, 0xfdf0];
const CONTROLS = [0xfef1, 0xfdf1];
const DATA = [0xfef2, 0xfdf2];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function openCardConnection(device, log = console.log, onState = () => {}, options = {}) {
  if (!device?.gatt) throw new Error('请先在网页选择卡片');
  const operationTimeout = options.operationTimeout ?? 25000;
  const replyTimeout = options.replyTimeout ?? 5000;
  const retryPause = options.retryPause ?? 1200;
  for (let attempt = 0; attempt < 2; attempt++) {
    let ctrl, listener, closed = false, subscribed = false, stage = '连接卡片';
    const close = async () => {
      if (closed) return;
      closed = true;
      if (ctrl && listener) ctrl.removeEventListener('characteristicvaluechanged', listener);
      // Disconnect also cancels the subscription. No new GATT operation is
      // queued after an unfinished pairing/read/write times out.
      try { device.gatt.disconnect(); } catch {}
    };
    const step = async (name, operation) => {
      stage = name;
      onState(name);
      log(`[连接准备 ${attempt + 1}/2] ${name}`);
      let timeout;
      const work = Promise.resolve().then(operation);
      // A late connect result must not leave a hidden connection after timeout.
      work.then(() => { if (closed) { try { device.gatt.disconnect(); } catch {} } }, () => {});
      try {
        return await Promise.race([work, new Promise((_, reject) => {
          timeout = setTimeout(() => reject(new DOMException(`${name}超时`, 'TimeoutError')), operationTimeout);
        })]);
      } finally { clearTimeout(timeout); }
    };
    try {
      const server = await step('连接卡片；如出现配对窗口请完成确认', () => device.gatt.connected ? device.gatt : device.gatt.connect());
      // The upstream secure firmware verifies encryption through Battery Level
      // BEFORE using the image control service. Never ignore authentication errors.
      try {
        const battery = await step('读取电量特征 180F/2A19，验证认证', async () => {
          const service = await server.getPrimaryService(0x180f);
          const characteristic = await service.getCharacteristic(0x2a19);
          const value = await characteristic.readValue();
          if (value.byteLength !== 1 || value.getUint8(0) > 100) throw new Error('电量回执无效');
          return value.getUint8(0);
        });
        log('加密电量读取通过：' + battery + '%');
        if (options.pairingOnly) return { device, battery, close };
        await sleep(options.securePause ?? 1800);
      } catch (error) {
        if (error.name !== 'NotFoundError') throw error;
        if (options.pairingOnly) throw new Error('设备未提供 180F/2A19，无法用电量读取验证配对', { cause: error });
        log('未找到电量特征，继续检查传图服务');
      }
      let data;
      for (let i = 0; i < SERVICES.length; i++) {
        try {
          const svc = await step(`发现服务 0x${SERVICES[i].toString(16)}`, () => server.getPrimaryService(SERVICES[i]));
          ctrl = await step('查找控制特征', () => svc.getCharacteristic(CONTROLS[i]));
          data = await step('查找数据特征', () => svc.getCharacteristic(DATA[i]));
          break;
        } catch (error) { if (error.name !== 'NotFoundError') throw error; ctrl = null; }
      }
      if (!ctrl || !data) throw new Error('未找到完整的卡片控制 / 数据服务');
      log(`准备使用控制特征 ${ctrl.uuid}；数据特征 ${data.uuid}`);
      let blockSize = 0, replyError = '';
      listener = event => {
        const v = event.target.value;
        const bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
        log('连接验证回执 ← ' + [...bytes].map(b => b.toString(16).padStart(2, '0')).join(' '));
        if (bytes[0] !== 1) return;
        if (bytes.length >= 3 && bytes[2] === 0 && bytes[1] > 4) blockSize = bytes[1] - 4;
        else replyError = '卡片拒绝分块查询';
      };
      ctrl.addEventListener('characteristicvaluechanged', listener);
      await step('订阅卡片通知，等待系统完成准备', () => ctrl.startNotifications());
      subscribed = true;
      await sleep(300);
      // Same 01 request as the existing sender. No length/start/image is sent.
      // Legacy writeValue is retained for this candidate's control semantics.
      const writeMethod = typeof ctrl.writeValue === 'function' ? 'writeValue'
        : ctrl.properties?.write ? 'writeValueWithResponse' : 'writeValueWithoutResponse';
      await step('验证控制写入；如出现系统配对提示请确认', () => ctrl[writeMethod](new Uint8Array([1])));
      await step('等待卡片分块回执', async () => {
        const end = performance.now() + replyTimeout;
        while (!blockSize && !replyError && device.gatt.connected && performance.now() < end) await sleep(25);
        if (replyError) throw new Error(replyError);
        if (!device.gatt.connected) throw new DOMException('验证时卡片已断开', 'NetworkError');
        if (!blockSize) throw new Error('未收到有效分块回执，连接尚未验证通过');
      });
      ctrl.removeEventListener('characteristicvaluechanged', listener);
      listener = null;
      onState('连接验证通过，可以发送');
      log(`✅ 已收到卡片回执，分块数据 ${blockSize} B；此状态不代表已读取系统配对信息`);
      return { device, ctrl, data, blockSize, subscribed, close };
    } catch (error) {
      await close();
      log(`连接准备失败（${stage}）：${error.name || 'Error'}: ${error.message || error}`);
      const details = [error.name, error.message].join(' ');
      const retryable = !/TimeoutError|SecurityError|NotAllowedError|authentication|authorization|encryption|already in progress/i.test(details)
        && /NetworkError|GATT|断开/i.test(details);
      if (!retryable || attempt === 1) throw new Error(`${stage}失败：${error.message || error}`, { cause: error });
      log('已释放连接，按原项目流程等待 1.2 秒后重新准备；尚未发送图片');
      await sleep(retryPause);
    }
  }
}

export async function verifyCardPairing(device, log, onState) {
  return withCardLock(async () => {
    const session = await openCardConnection(device, log, onState, { pairingOnly: true });
    try { return { ok: true, battery: session.battery }; }
    finally { await session.close(); }
  });
}
