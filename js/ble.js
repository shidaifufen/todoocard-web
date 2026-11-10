// Web Bluetooth 发送：与桌面版 sender.py 同一套握手。
// 只支持 Chrome / Edge（含安卓版），Safari / Firefox 没有 Web Bluetooth。

const SVC = [0xfef0, 0xfdf0];
const CTRL = [0xfef1, 0xfdf1];
const DATA = [0xfef2, 0xfdf2];
const CMD_BLOCK = 0x01, CMD_LEN = 0x02, CMD_START = 0x03, CMD_ACK = 0x05;

export function bleSupported() {
  return 'bluetooth' in navigator;
}

export async function sendToCard(payload, log = console.log, onProgress = () => {}, reuse = null) {
  if (!bleSupported()) throw new Error('这个浏览器不支持 Web Bluetooth，请用 Chrome / Edge');

  let device = reuse;
  if (device) {
    log(`复用已授权的设备：${device.name || device.id}`);
  } else {
    log('选择设备…');
    // 优先按名字过滤：macOS 上 Chrome 会把"所有 BLE 设备"都丢进系统配对框，
    // 里面全是 iPhone/耳机，反而选不到卡片。按名字过滤能只留 TodooCard。
    try {
      device = await navigator.bluetooth.requestDevice({
        // 同时给 services 和 namePrefix：安卓只按服务过滤，macOS 只按名字过滤
        filters: [
          // 卡片广播里带厂商 ID 0x5053（"PS"），这是唯一能稳定命中它的条件：
          // 安卓上它不一定带名字、也不一定在广播里带服务 UUID。
          { manufacturerData: [{ companyIdentifier: 0x5053 }] },
          { services: [SVC[0]] },
          { services: [SVC[1]] },
          { namePrefix: 'Todoo' },
          { namePrefix: 'FFFF' },
        ],
        optionalServices: [...SVC],
      });
    } catch (e) {
      if (e?.name === 'NotFoundError') {
        log('按名字没找到，改为列出全部设备…');
        device = await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: [...SVC],
        });
      } else throw e;
    }
    log(`已选择：${device.name || device.id}`);
  }

  const server = await device.gatt.connect();
  const services = await server.getPrimaryServices();
  let ctrl = null, data = null;
  for (const s of services) {
    for (const c of await s.getCharacteristics()) {
      const u = parseInt(c.uuid.slice(4, 8), 16);
      if (CTRL.includes(u)) ctrl = c;
      if (DATA.includes(u)) data = c;
    }
  }
  if (!ctrl || !data) throw new Error('没找到控制点/数据点特征值');

  let blockSize = 0, ackEnd = false, error = '', acked = -1;
  const onAck = (ev) => {
    const b = new Uint8Array(ev.target.value.buffer);
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

  await ctrl.startNotifications();
  ctrl.addEventListener('characteristicvaluechanged', onAck);
  await new Promise((r) => setTimeout(r, 300));

  const waitFor = async (pred, ms = 5000) => {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      if (error) throw new Error(error);
      if (pred()) return true;
      await new Promise((r) => setTimeout(r, 50));
    }
    return false;
  };

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
    // 领先设备太多就等它回执
    let guard = 0;
    while (i - acked > WINDOW && !ackEnd) {
      if (error) throw new Error(error);
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
  try { await ctrl.stopNotifications(); } catch (e) { /* ignore */ }
  try { device.gatt.disconnect(); } catch (e) { /* ignore */ }
  return { ok: true, acked: ackEnd, blocks: n, device };
}
