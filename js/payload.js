// 六色墨水屏 payload：与桌面版 payload.py / quicklz_payload.py 逐字节等价。
// 全部在浏览器本地完成，不经服务器。

export const W = 528, H = 792;

// 调色板顺序必须与固件一致（等距时取靠前者）
const PALETTE = [
  [0, 0, 0, 0],        // 黑
  [255, 255, 255, 1],  // 白
  [255, 255, 0, 2],    // 黄
  [255, 0, 0, 3],      // 红
  [0, 0, 255, 5],      // 蓝
  [0, 255, 0, 6],      // 绿
];

/** 画布 → 4bit/像素位图（Floyd–Steinberg 量化） */
export function quantize(imgData) {
  const { width: w, height: h, data } = imgData;
  const work = new Float32Array(w * h * 3);
  for (let i = 0, p = 0; i < w * h; i++, p += 4) {
    work[i * 3] = data[p];
    work[i * 3 + 1] = data[p + 1];
    work[i * 3 + 2] = data[p + 2];
  }
  const codes = new Uint8Array(w * h);

  const add = (x, y, er, eg, eb, k) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const o = (y * w + x) * 3;
    work[o] += er * k; work[o + 1] += eg * k; work[o + 2] += eb * k;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x, o = i * 3;
      const r = Math.min(255, Math.max(0, work[o]));
      const g = Math.min(255, Math.max(0, work[o + 1]));
      const b = Math.min(255, Math.max(0, work[o + 2]));
      let best = PALETTE[0], bestD = Infinity;
      for (const c of PALETTE) {
        const dr = r - c[0], dg = g - c[1], db = b - c[2];
        const d = dr * dr + dg * dg + db * db;
        if (d < bestD) { bestD = d; best = c; }
      }
      codes[i] = best[3];
      const er = r - best[0], eg = g - best[1], eb = b - best[2];
      add(x + 1, y, er, eg, eb, 7 / 16);
      add(x - 1, y + 1, er, eg, eb, 3 / 16);
      add(x, y + 1, er, eg, eb, 5 / 16);
      add(x + 1, y + 1, er, eg, eb, 1 / 16);
    }
  }

  const out = new Uint8Array((w * h + 1) >> 1);
  for (let i = 0; i < w * h; i++) {
    if (i % 2 === 0) out[i >> 1] = (codes[i] & 0x0f) << 4;
    else out[i >> 1] |= codes[i] & 0x0f;
  }
  return out;
}

const get = (buf, i) => (i % 2 === 0 ? buf[i >> 1] >> 4 : buf[i >> 1] & 0x0f);
const set = (buf, i, v) => {
  if (i % 2 === 0) buf[i >> 1] = (buf[i >> 1] & 0x0f) | ((v & 0x0f) << 4);
  else buf[i >> 1] = (buf[i >> 1] & 0xf0) | (v & 0x0f);
};

/** T3 面板标定：整体旋转 180° 再水平翻转 */
export function panelCalibrate(buf, w = W, h = H) {
  const n = w * h;
  const a = new Uint8Array(buf.length);
  for (let i = 0; i < n; i++) set(a, n - 1 - i, get(buf, i));
  const b = new Uint8Array(buf.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) set(b, y * w + (w - 1 - x), get(a, y * w + x));
  return b;
}

/** 控制器视角：顺时针旋转 + 镜像 */
export function controllerView(buf, w = W, h = H) {
  const out = new Uint8Array(buf.length);
  const destW = h;
  for (let di = 0; di < w * h; di++) {
    const dx = di % destW, dy = (di / destW) | 0;
    const sx = w - 1 - dy, sy = h - 1 - dx;
    set(out, di, get(buf, sy * w + sx));
  }
  return out;
}

/** 老固件兼容包：64 字节一块，每块加 0x74 0x43 0x40 */
export function legacyPayload(raw, block = 64) {
  const out = new Uint8Array(4 + Math.ceil(raw.length / block) * (block + 3));
  out.set([0, 0, 0, 0], 0);
  let o = 4;
  for (let i = 0; i < raw.length; i += block) {
    out[o++] = 0x74; out[o++] = 0x43; out[o++] = 0x40;
    out.set(raw.subarray(i, i + block), o);
    o += block;
  }
  return out.subarray(0, o);
}

// ── QuickLZ 1.5 level-3（与 quicklz_payload.py 同算法）──
const BS = 2048, HASHN = 4096, PTRS = 16;

const rd = (s, o, n) => (s[o] | (s[o + 1] << 8) | (s[o + 2] << 16) | (s[o + 3] << 24)) >>> 0;
const wr = (t, o, v, n) => { for (let i = 0; i < n; i++) t[o + i] = (v >>> (i * 8)) & 0xff; };
const hash3 = (v) => ((v >>> 12) ^ v) & (HASHN - 1);

export function encodeLevel3Block(src) {
  const core = new Uint8Array(src.length + 400);
  const hashOffsets = new Int32Array(HASHN * PTRS).fill(-1);
  const hashCounters = new Uint16Array(HASHN);

  const lastByte = src.length - 1;
  const lastMatchStart = lastByte - 10;
  let so = 0, cwo = 0, to = 4;
  let cw = 0x80000000;

  const flush = () => wr(core, cwo, ((cw >>> 1) | 0x80000000) >>> 0, 4);

  while (so <= lastMatchStart) {
    if (cw & 1) { flush(); cwo = to; to += 4; cw = 0x80000000; }
    const fetch = rd(src, so, 3);
    const hv = hash3(fetch);
    const maxLen = Math.min(258, src.length - 4 - so);
    const base = hv * PTRS;
    const count = hashCounters[hv];
    let prev = -1, bestLen = 0;
    const cands = Math.min(count, PTRS);
    for (let ci = 0; ci < cands; ci++) {
      const co = hashOffsets[base + ci];
      const dist = so - co;
      if (co < 0 || dist < 3 || dist > 131071) continue;
      if (src[co] !== src[so] || src[co + 1] !== src[so + 1] || src[co + 2] !== src[so + 2]) continue;
      let len = 3;
      while (len < maxLen && src[co + len] === src[so + len]) len++;
      if (len > bestLen) { bestLen = len; prev = co; }
    }
    hashOffsets[base + (count & (PTRS - 1))] = so;
    hashCounters[hv] = (count + 1) & 0xffff;

    if (bestLen >= 3) {
      const off = so - prev;
      cw = ((cw >>> 1) | 0x80000000) >>> 0;
      for (let i = 1; i < bestLen; i++) {
        const io = so + i;
        if (io <= lastMatchStart) {
          const ih = hash3(rd(src, io, 3));
          const ic = hashCounters[ih];
          hashOffsets[ih * PTRS + (ic & (PTRS - 1))] = io;
          hashCounters[ih] = (ic + 1) & 0xffff;
        }
      }
      so += bestLen;
      if (bestLen === 3 && off <= 63) { core[to++] = off << 2; }
      else if (bestLen === 3 && off <= 16383) { wr(core, to, (off << 2) | 1, 2); to += 2; }
      else if (bestLen <= 18 && off <= 1023) { wr(core, to, ((bestLen - 3) << 2) | (off << 6) | 2, 2); to += 2; }
      else if (bestLen <= 33) { wr(core, to, ((bestLen - 2) << 2) | (off << 7) | 3, 3); to += 3; }
      else { wr(core, to, ((bestLen - 3) << 7) | (off << 15) | 3, 4); to += 4; }
    } else {
      core[to++] = src[so++];
      cw >>>= 1;
    }
  }

  while (so <= lastByte) {
    if (cw & 1) { flush(); cwo = to; to += 4; cw = 0x80000000; }
    core[to++] = src[so++];
    cw >>>= 1;
  }
  while (!(cw & 1)) cw >>>= 1;
  flush();

  const coreLen = Math.max(to, 9);
  const headerSize = src.length < 216 ? 3 : 9;
  if (headerSize + coreLen >= headerSize + src.length) {
    const stored = new Uint8Array(headerSize + src.length);
    stored[0] = 0x7c | (headerSize === 9 ? 2 : 0);
    if (headerSize === 3) { stored[1] = stored.length; stored[2] = src.length; }
    else { wr(stored, 1, stored.length, 4); wr(stored, 5, src.length, 4); }
    stored.set(src, headerSize);
    return stored;
  }
  const out = new Uint8Array(headerSize + coreLen);
  out[0] = 0x7d | (headerSize === 9 ? 2 : 0);
  if (headerSize === 3) { out[1] = out.length; out[2] = src.length; }
  else { wr(out, 1, out.length, 4); wr(out, 5, src.length, 4); }
  out.set(core.subarray(0, coreLen), headerSize);
  return out;
}

/** 完整链路：ImageData → {payload(L3), legacy, raw} */
export function buildPayloads(imageData) {
  const bitmap = quantize(imageData);
  const calibrated = panelCalibrate(bitmap);
  const controller = controllerView(calibrated);
  const chunks = [];
  for (let i = 0; i < controller.length; i += BS) chunks.push(encodeLevel3Block(controller.subarray(i, i + BS)));
  const total = 4 + chunks.reduce((a, c) => a + c.length, 0);
  const payload = new Uint8Array(total);
  payload.set([0, 0, 0, 0], 0);
  let o = 4;
  for (const c of chunks) { payload.set(c, o); o += c.length; }
  return { payload, legacy: legacyPayload(controller), raw: controller };
}
