// Web Bluetooth 发送：与桌面版 sender.py 同一套握手。
// 只支持 Chrome / Edge（含安卓版），Safari / Firefox 没有 Web Bluetooth。

const SVC = [0xfef0, 0xfdf0];
const CTRL = [0xfef1, 0xfdf1];
const DATA = [0xfef2, 0xfdf2];
const CMD_BLOCK = 0x01, CMD_LEN = 0x02, CMD_START = 0x03, CMD_ACK = 0x05;

export function bleSupported() {
  return typeof navigator !== 'undefined' && !!navigator.bluetooth && globalThis.isSecureContext !== false;
}

let transferActive = false;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function requestCardDevice() {
  if (!bleSupported()) throw new Error('请在 HTTPS 页面使用 Chrome / Edge，当前浏览器不支持 Web Bluetooth');
  // 直接在点击事件中调用，避免生成图片期间丢失浏览器要求的用户手势。
  return navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: [...SVC] });
}

function waitForGattConnection(device, timeoutMs) {
  const deadline = performance.now() + timeoutMs;
  return (async () => {
    while (performance.now() < deadline) {
      if (device.gatt.connected) return true;
      await sleep(100);
    }
    return device.gatt.connected;
  })();
}

export async function connectCard(device, log = console.log) {
  if (!device?.gatt) throw new Error('设备没有可用的 GATT 服务，请重新选择卡片');
  if (device.gatt.connected) return device.gatt;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      log(`连接卡片…（${attempt + 1}/3）`);
      return await device.gatt.connect();
    } catch (error) {
      const message = String(error?.message || error);
      if (/connection already in progress/i.test(message)) {
        // Edge 可能仍在完成系统连接；先观察 connected，避免立刻再发起连接。
        log('Edge 正在完成蓝牙连接，等待连接状态…');
        if (await waitForGattConnection(device, 5000)) return device.gatt;
      }
      if (attempt === 2 || !/connection already in progress|networkerror|gatt|connect|连接/i.test(error.name + ' ' + message)) {
        if (/connection already in progress/i.test(message)) {
          throw new Error('Edge 中已有连接仍在进行。请关闭其他土豆片网页/PWA，并暂停桌面版或手机 App 后等几秒重试。');
        }
        throw error;
      }
      try { device.gatt.disconnect(); } catch { /* 已断开 */ }
      log('连接未完成，已清理旧连接，稍后重试…');
      await sleep(750 * (attempt + 1));
    }
  }
}

const isGattBusy = error => /connection already in progress|gatt operation already in progress/i.test(String(error?.message || error));

// On Windows, connect() can resolve before service discovery has settled. Retry
// reads on the current connection first; never replay image writes here.
async function gattReady(operation, stage, log) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await operation(); }
    catch (error) {
      if (!isGattBusy(error) || attempt === 2) {
        const failure = new Error(`${stage}失败：${error?.message || error}`, { cause: error });
        failure.name = error?.name || 'Error';
        throw failure;
      }
      log(`${stage}时蓝牙连接仍在准备，稍后重试…（${attempt + 1}/2）`);
      await sleep(500 * (attempt + 1));
    }
  }
}

async function discoverCard(device, log) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const server = await connectCard(device, log);
      log(`已连接，正在准备卡片服务…（${attempt + 1}/3）`);
      await sleep(350);
      // Only access the two services explicitly authorized in the chooser.
      // Enumerating all device services needlessly expands Windows discovery.
      for (let i = 0; i < SVC.length; i++) {
        const id = '0x' + SVC[i].toString(16);
        try {
          log(`查找卡片服务 ${id}…`);
          const service = await gattReady(() => server.getPrimaryService(SVC[i]), `查找服务 ${id}`, log);
          const ctrl = await gattReady(() => service.getCharacteristic(CTRL[i]), '查找控制特征', log);
          const data = await gattReady(() => service.getCharacteristic(DATA[i]), '查找数据特征', log);
          log(`卡片服务 ${id} 与控制 / 数据特征已就绪`);
          return { ctrl, data };
        } catch (error) {
          if (error.name !== 'NotFoundError') throw error;
        }
      }
      throw new Error('没找到卡片服务或控制 / 数据特征，请确认选中的是土豆片设备');
    } catch (error) {
      const retryable = isGattBusy(error) || error.name === 'NetworkError';
      if (!retryable || attempt === 2) throw error;
      try { device.gatt.disconnect(); } catch { /* Already disconnected. */ }
      log('服务发现尚未就绪，已释放本次连接，将重新连接并查找…');
      await sleep(750 * (attempt + 1));
    }
  }
}

export async function sendToCard(payload, log = console.log, onProgress = () => {}, reuse = null) {
  if (transferActive) throw new Error('正在发送上一张卡片，请等待完成后再试');
  transferActive = true;
  try {
    if (navigator.locks?.request) {
      return await navigator.locks.request('todoocard-web-bluetooth', { ifAvailable: true }, async (lock) => {
        if (!lock) throw new Error('另一个土豆片网页正在连接或发送，请等待完成，或关闭其他标签页后重试');
        return transfer(payload, log, onProgress, reuse);
      });
    }
    return await transfer(payload, log, onProgress, reuse);
  } finally {
    transferActive = false;
  }
}

async function transfer(payload, log, onProgress, reuse) {
  if (!bleSupported()) throw new Error('这个浏览器不支持 Web Bluetooth，请用 Chrome / Edge');

  let device = reuse;
  if (device) {
    log(`复用已授权的设备：${device.name || device.id}`);
  } else {
    log('选择设备…');
    // 回到最宽松的方式：列出所有 BLE 设备。过滤条件越严，安卓/macOS 上越容易一个都匹配不到。
    device = await requestCardDevice();
    log(`已选择：${device.name || device.id}`);
  }

  let ctrl = null, data = null;
  let disconnected = false, listening = false;
  const onDisconnect = () => { disconnected = true; };
  device.addEventListener('gattserverdisconnected', onDisconnect);
  let onAck;
  try {
  ({ ctrl, data } = await discoverCard(device, log));
  disconnected = false;

  let blockSize = 0, ackEnd = false, error = '', acked = -1;
  onAck = (ev) => {
    const value = ev.target.value;
    const b = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    log('control ← ' + [...b].map((x) => x.toString(16).padStart(2, '0')).join(' '));
    if (!b.length) return;
    if (b[0] === CMD_BLOCK) {
      if (b.length >= 3 && b[2] === 0) blockSize = Math.max(0, b[1] - 4);
      else error = '设备拒绝了 block size';
    } else if (b[0] === CMD_LEN) {
      if (b[1] !== 0) error = '设备拒绝了 payload 长度';
    } else if (b[0] === CMD_ACK) {
      if (b[1] === 0x08) ackEnd = true;
      else if (b[1] !== 0) error = '设备返回错误 0x' + b[1].toString(16);
      else if (b.length >= 6) {
        // 设备逐块回执：05 00 <idx 4字节小端>
        acked = Math.max(acked, b[2] | (b[3] << 8) | (b[4] << 16) | (b[5] << 24));
      }
    }
  };

  ctrl.addEventListener('characteristicvaluechanged', onAck);
  listening = true;
  log('正在开启卡片状态通知…');
  await gattReady(() => ctrl.startNotifications(), '开启状态通知', log);
  await new Promise((r) => setTimeout(r, 300));

  const waitFor = async (pred, ms = 5000) => {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      if (error) throw new Error(error);
      if (pred()) return true;
      if (disconnected) throw new Error('卡片连接已断开，请靠近卡片并重新发送');
      await new Promise((r) => setTimeout(r, 50));
    }
    return false;
  };

  log('状态通知已就绪，正在请求分块大小…');
  await ctrl.writeValue(new Uint8Array([CMD_BLOCK]));
  if (!(await waitFor(() => blockSize > 0))) throw new Error('等不到 block size 响应');
  log(`block payload = ${blockSize} 字节`);

  let buf = payload;
  if (buf.length % blockSize) {
    const pad = blockSize - (buf.length % blockSize);
    const nb = new Uint8Array(buf.length + pad);
    nb.set(buf); buf = nb;
  }
  const n = buf.length / blockSize;
  log(`共 ${n} 块`);

  const lenBytes = new Uint8Array([CMD_LEN, buf.length & 0xff, (buf.length >> 8) & 0xff, (buf.length >> 16) & 0xff]);
  await ctrl.writeValue(lenBytes);
  await new Promise((r) => setTimeout(r, 200));
  await ctrl.writeValue(new Uint8Array([CMD_START]));

  // 关键：按设备的逐块回执做流控。写太快会把设备缓冲灌爆，
  // 表现就是 "GATT Service no longer exists"（设备端直接重启/掉线）。
  const WINDOW = 20;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < n; i++) {
    if (error) throw new Error(error);
    if (disconnected) throw new Error('卡片连接已断开，请重新发送');
    // 领先设备太多就等它回执
    let guard = 0;
    while (i - acked > WINDOW && !ackEnd) {
      if (error) throw new Error(error);
      if (disconnected) throw new Error('卡片连接已断开，请重新发送');
      await sleep(20);
      if (++guard > 500) throw new Error('设备回执停滞（超过 10 秒没有进展）');
    }
    const packet = new Uint8Array(4 + blockSize);
    packet[0] = i & 0xff; packet[1] = (i >> 8) & 0xff;
    packet[2] = (i >> 16) & 0xff; packet[3] = (i >> 24) & 0xff;
    packet.set(buf.subarray(i * blockSize, (i + 1) * blockSize), 4);
    // 用 withResponse 写：蓝牙栈会等对端 ATT 确认才发下一包，
    // 天然流控（Swift 版就是这么写的）。设备不支持时退回 withoutResponse。
    try {
      await data.writeValueWithResponse(packet);
    } catch (e) {
      if (String(e).includes('not supported')) {
        await data.writeValueWithoutResponse(packet);
        await sleep(8);
      } else {
        await sleep(300);
        await data.writeValueWithResponse(packet);
      }
    }
    if ((i + 1) % 32 === 0) onProgress((i + 1) / n);
    if ((i + 1) % 128 === 0) log(`已发送 ${i + 1}/${n} 块（设备回执到 ${acked + 1}）`);
  }

  log('数据写完，等显影确认…');
  if (!(await waitFor(() => ackEnd, 20000))) {
    log('⚠️ 没收到显影确认（0x05 0x08）：画面可能已经刷新，也可能失败');
  } else {
    log('✅ 显影确认已收到');
  }
  onProgress(1);
  return { ok: true, acked: ackEnd, blocks: n, device };
  } finally {
    // 所有失败路径都要清理，包括 connect / 服务发现 / 握手失败。
    if (listening) {
      ctrl.removeEventListener('characteristicvaluechanged', onAck);
      if (device.gatt.connected) {
        try { await ctrl.stopNotifications(); } catch { /* 连接可能已经失效 */ }
      }
    }
    device.removeEventListener('gattserverdisconnected', onDisconnect);
    try { device.gatt.disconnect(); } catch { /* 已断开 */ }
  }
}
