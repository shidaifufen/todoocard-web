// 与桌面版 card_render.py 对齐的绘制骨架：同一套外边距、线宽、字号层级。
export const W = 528, H = 792, M = 34, GW = W - M * 2;
const BLACK = '#000', WHITE = '#fff', RED = '#ff0000', YELLOW = '#ffff00', BLUE = '#0000ff', GREEN = '#00ff00';
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const F = (w, s) => `${w} ${s}px "PingFang SC","Microsoft YaHei",system-ui,sans-serif`;

let FS = 1.1;   // 字号基准（滑杆会在其上再乘）
let LS = 1.1;   // 行距基准
export function setLayout(fs, ls) {
  FS = Math.max(0.6, Math.min(2.2, fs || 1.1));
  LS = Math.max(0.8, Math.min(2.2, ls || 1.1));
}
const ctxFont = (ctx, size, weight = '400') => { ctx.font = F(weight, Math.round(size * FS)); };
const tw = (ctx, s, size, weight = '400') => { ctxFont(ctx, size, weight); return ctx.measureText(s).width; };
const txt = (ctx, s, x, y, size, weight = '400', color = BLACK) => { ctxFont(ctx, size, weight); ctx.fillStyle = color; ctx.fillText(s, x, y); };
const rtxt = (ctx, s, y, size, weight = '400', color = BLACK) => txt(ctx, s, W - M - tw(ctx, s, size, weight), y, size, weight, color);
const wrap = (ctx, s, maxW, size, weight = '400') => {
  const out = []; let line = '';
  for (const ch of String(s)) {
    if (tw(ctx, line + ch, size, weight) > maxW) { out.push(line); line = ch; } else line += ch;
  }
  if (line) out.push(line);
  return out;
};
const bg = (ctx) => { ctx.fillStyle = WHITE; ctx.fillRect(0, 0, W, H); };
/** 桌面版 _head：红方块 + 标题 + 右侧 meta + 3px 横线 + 90px 红段 */
function head(ctx, title, meta = '') {
  ctx.fillStyle = RED; ctx.fillRect(M, 34, 13, 13);
  txt(ctx, title, M + 24, 58, 30, '700');
  if (meta) rtxt(ctx, meta, 52, 16);
  ctx.fillStyle = BLACK; ctx.fillRect(M, 82, GW, 3);
  ctx.fillStyle = RED; ctx.fillRect(M, 82, 90, 6);
}
const rule = (ctx, y, w = GW) => { ctx.fillStyle = BLACK; ctx.fillRect(M, y, w, 2); };
/** 桌面版 _bar：3px 描边 + 内缩 3px 的填充 */
function bar(ctx, x, y, w, h, pct, color) {
  ctx.strokeStyle = BLACK; ctx.lineWidth = 3; ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x + 3, y + 3, Math.max(0, (w - 6) * Math.min(1, Math.max(0, pct))), h - 6);
}
const footer = (ctx, left = '土豆片 · 网页版', right = '') => {
  rule(ctx, H - 96);
  txt(ctx, left, M, H - 70, 16);
  if (right) rtxt(ctx, right, H - 70, 16);
};
const wxText = (c) => (c === 0 ? '晴' : c < 4 ? '多云' : c < 50 ? '雾' : c < 70 ? '雨' : c < 80 ? '雪' : '雨');
export { wxText };

/** 天气图标：实心色块 + 黑描边，墨水屏上才看得清 */
function wxIcon(ctx, x, y, size, code) {
  const cx = x + size / 2, cy = y + size / 2, r = size / 5;
  ctx.lineWidth = 5;
  if (code === 0 || code === 1) {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = YELLOW; ctx.fill(); ctx.strokeStyle = BLACK; ctx.stroke();
    ctx.strokeStyle = BLACK; ctx.lineWidth = 6;
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * i) / 4;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (r + 9), cy + Math.sin(a) * (r + 9));
      ctx.lineTo(cx + Math.cos(a) * (r + 24), cy + Math.sin(a) * (r + 24));
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = BLACK;
    for (const [dx, dy] of [[-r, 0], [0, -r], [r, 0]]) {
      ctx.beginPath(); ctx.arc(cx + dx, cy + dy, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillRect(cx - r, cy, r * 2, r);
    if (code >= 50) {
      ctx.strokeStyle = BLUE; ctx.lineWidth = 5;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.moveTo(cx - r + i * r, cy + r); ctx.lineTo(cx - r + i * r - 4, cy + r * 1.8); ctx.stroke();
      }
    }
  }
}

// ── 每日一句 ──
export function drawQuote(ctx, st) {
  bg(ctx);
  const t = st.now;
  ctx.fillStyle = RED; ctx.fillRect(M, 34, 13, 13);
  txt(ctx, '每日一句', M + 24, 58, 30, '700');
  rtxt(ctx, `${t.getMonth() + 1}/${String(t.getDate()).padStart(2, '0')}`, 52, 16);
  txt(ctx, '“', M + 4, 150, 72, '700', RED);
  ctx.fillStyle = RED; ctx.fillRect(M, 168, 8, 210);
  const lines = wrap(ctx, st.quote, GW - 50, 40, '700').slice(0, 6);
  let y = 205;
  lines.forEach((l) => { txt(ctx, l, M + 34, y, 40, '700'); y += Math.round(58 * LS); });
  txt(ctx, '— 今日一句', M + 34, y + 10, 18);
  [RED, YELLOW, BLUE].forEach((c, i) => { ctx.beginPath(); ctx.arc(M + 10 + i * 22, H - 122, 7, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill(); });
  footer(ctx, 'hitokoto', `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`);
}

// ── 每日总结 ──
export function drawSummary(ctx, st) {
  bg(ctx);
  const t = st.now;
  head(ctx, '每日总结', `${String(t.getMonth() + 1).padStart(2, '0')}/${String(t.getDate()).padStart(2, '0')} ${WEEK[t.getDay()]}`);
  ctx.fillStyle = RED; ctx.font = F('400', 96); ctx.fillText(String(t.getDate()).padStart(2, '0'), M, 200);
  txt(ctx, `${t.getMonth() + 1}月`, M + 2, 236, 18, '700');
  if (st.weather?.temp != null) {
    const tx = W * 0.44;
    ctx.fillStyle = BLACK; ctx.font = F('400', 84); ctx.fillText(String(Math.round(st.weather.temp)), tx, 200);
    const w2 = tw(ctx, String(Math.round(st.weather.temp)), 84);
    txt(ctx, '°C', tx + w2 + 4, 178, 34, '400', RED);
    txt(ctx, `${st.weather.text} · ${st.weather.city}`, tx, 238, 17);
  }
  ctx.fillStyle = YELLOW; ctx.fillRect(M, 266, GW, 8);
  txt(ctx, '今日待办', M, 320, 20, '700');
  rtxt(ctx, `${st.todos.length} 项`, 316, 16);
  let y = 358;
  if (!st.todos.length) { txt(ctx, '今天还没有安排', M, y, 20); y += Math.round(40 * LS); }
  st.todos.slice(0, 3).forEach((item) => { txt(ctx, '· ' + item, M, y, 22); y += Math.round(34 * LS); });
  const mp = t.getDate() / new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  txt(ctx, '本月', M, y + 26, 15, '700');
  rtxt(ctx, `${Math.round(mp * 100)}%`, y + 22, 15);
  bar(ctx, M, y + 36, GW, 16, mp, GREEN);
  footer(ctx);
}

// ── 今日待办 ──
export function drawTodo(ctx, st) {
  bg(ctx);
  const t = st.now;
  ctx.fillStyle = YELLOW; ctx.fillRect(0, 0, W, 108);
  txt(ctx, '今日待办', M, 64, 34, '700');
  txt(ctx, `${t.getMonth() + 1}月${t.getDate()}日 ${WEEK[t.getDay()]}`, M, 92, 16);
  rtxt(ctx, String(st.todos.length), 64, 46, '700');
  let y = 156;
  st.todos.slice(0, 7).forEach((item) => {
    ctx.strokeStyle = BLACK; ctx.lineWidth = 3; ctx.strokeRect(M, y, 26, 26);
    const l = wrap(ctx, item, GW - 50, 24)[0] || '';
    txt(ctx, l, M + 40, y + 22, 24);
    ctx.fillStyle = BLACK; ctx.fillRect(M + 40, y + 34, GW - 44, 2);
    y += Math.round(64 * LS);
  });
  footer(ctx, '勾掉一件算一件');
}

// ── 时间进度 ──
export function drawProgress(ctx, st) {
  bg(ctx);
  const now = st.now;
  const y0 = new Date(now.getFullYear(), 0, 1), y1 = new Date(now.getFullYear() + 1, 0, 1);
  const total = Math.round((y1 - y0) / 86400000), passed = Math.round((now - y0) / 86400000) + 1;
  const pct = passed / total;
  head(ctx, '时间进度', String(now.getFullYear()));
  ctx.fillStyle = RED; ctx.font = F('400', 96); ctx.fillText(String(Math.round(pct * 100)), M, 206);
  const pw = tw(ctx, String(Math.round(pct * 100)), 96);
  txt(ctx, '%', M + pw + 4, 206, 40, '400', RED);
  txt(ctx, `已过 ${passed} / ${total} 天`, M + 4, 244, 21);

  const cols = 32, gap = (GW - 6) / (cols - 1);
  const dy = 280;
  for (let i = 0; i < total; i++) {
    const cx = M + (i % cols) * gap, cy = dy + Math.floor(i / cols) * gap;
    ctx.beginPath(); ctx.arc(cx, cy, 5.5, 0, Math.PI * 2);
    if (i < passed) { ctx.fillStyle = RED; ctx.fill(); } else { ctx.strokeStyle = BLACK; ctx.lineWidth = 2; ctx.stroke(); }
  }
  let y = dy + Math.ceil(total / cols) * gap + 24;
  ctx.fillStyle = BLACK; ctx.fillRect(M, y, GW, 2);
  y += Math.round(28 * LS);
  const m0 = new Date(now.getFullYear(), now.getMonth(), 1), m1 = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const rows = [
    ['本月', (now - m0) / (m1 - m0), GREEN],
    ['本周', ((now.getDay() || 7) - 1 + now.getHours() / 24) / 7, BLUE],
    ['今天', (now.getHours() * 60 + now.getMinutes()) / 1440, RED],
  ];
  rows.forEach(([label, p, c]) => {
    txt(ctx, label, M, y + 18, 19, '700');
    txt(ctx, `${Math.round(p * 100)}%`, M + 58, y + 16, 19);
    bar(ctx, M + 136, y, GW - 136, 22, p, c);
    y += Math.round(42 * LS);
  });
  txt(ctx, '今年还剩', M, H - 100, 19, '700');
  ctx.fillStyle = RED; ctx.fillRect(M, H - 86, 10, 38);
  const left = total - passed;
  txt(ctx, String(left), M + 24, H - 56, 30);
  txt(ctx, '天', M + 24 + tw(ctx, String(left), 30) + 8, H - 56, 18, '700');
  rtxt(ctx, '土豆片 · 网页版', H - 56, 16);
}

// ── 月历 ──
export function drawCalendar(ctx, st) {
  bg(ctx);
  const t = st.now;
  head(ctx, `${t.getFullYear()} 年 ${t.getMonth() + 1} 月`, `第 ${Math.round((t - new Date(t.getFullYear(), 0, 1)) / 86400000) + 1} 天`);
  const first = new Date(t.getFullYear(), t.getMonth(), 1);
  const days = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  const startCol = (first.getDay() + 6) % 7;
  const colW = GW / 7;
  ['一', '二', '三', '四', '五', '六', '日'].forEach((n, i) => {
    const w = tw(ctx, n, 18, '700');
    txt(ctx, n, M + i * colW + (colW - w) / 2, 140, 18, '700', i >= 5 ? RED : BLACK);
  });
  const rows = Math.ceil((startCol + days) / 7);
  const cellH = Math.min(72, (H - 250 - 150) / rows);
  for (let d = 1; d <= days; d++) {
    const idx = startCol + d - 1, col = idx % 7, row = Math.floor(idx / 7);
    const cx = M + col * colW + colW / 2, cy = 176 + row * cellH;
    const w = tw(ctx, String(d), 26);
    if (d === t.getDate()) {
      ctx.beginPath(); ctx.arc(cx, cy - 9, 21, 0, Math.PI * 2); ctx.fillStyle = RED; ctx.fill();
      txt(ctx, String(d), cx - w / 2, cy, 26, '400', WHITE);
    } else txt(ctx, String(d), cx - w / 2, cy, 26, '400', col >= 5 ? RED : BLACK);
  }
  footer(ctx, '土豆片 · 月历');
}

// ── 倒计时 ──
export function drawCountdown(ctx, st) {
  bg(ctx);
  head(ctx, '倒计时', `${st.now.getMonth() + 1}/${st.now.getDate()}`);
  let y = 160;
  if (!st.countdowns.length) txt(ctx, '还没有纪念日（在右侧添加）', M, y, 18);
  st.countdowns.slice(0, 6).forEach((c) => {
    const d = Math.ceil((new Date(c.date + 'T00:00:00') - new Date(st.now.toDateString())) / 86400000);
    txt(ctx, c.name, M, y, 22, '700');
    rtxt(ctx, `${d} 天`, y + 4, 22);
    ctx.fillStyle = BLACK; ctx.fillRect(M, y + 12, GW, 1);
    y += Math.round(64 * LS);
  });
  footer(ctx);
}

// ── 天气 ──
export function drawWeather(ctx, st) {
  bg(ctx);
  const w = st.weather;
  head(ctx, '今日天气', w?.city || '');
  if (!w || w.temp == null) { txt(ctx, '天气获取失败（点右侧「拉取」）', M, 200, 22); return; }
  ctx.fillStyle = BLACK; ctx.font = F('400', 128); ctx.fillText(String(Math.round(w.temp)), M, 226);
  const w2 = tw(ctx, String(Math.round(w.temp)), 128);
  txt(ctx, '°C', M + w2 + 4, 188, 52, '400', RED);
  wxIcon(ctx, W - M - 92, 96, 92, w.code ?? 0);
  txt(ctx, w.text, M, 288, 44, '700');
  ctx.fillStyle = BLACK; ctx.fillRect(M, 316, GW, 3);
  [['最高', w.hi, RED], ['最低', w.lo, BLUE], ['体感', w.feels, GREEN]].forEach(([label, v, c], i) => {
    const x = M + i * (GW / 3);
    txt(ctx, label, x, 350, 15);
    txt(ctx, `${Math.round(v)}°`, x, 382, 28);
    ctx.fillStyle = c; ctx.fillRect(x, 396, 32, 6);
    if (i) { ctx.fillStyle = BLACK; ctx.fillRect(x - 14, 340, 1, 62); }
  });
  txt(ctx, '未来几小时', M, 452, 19, '700');
  ctx.fillStyle = BLACK; ctx.fillRect(M + 120, 445, GW - 120, 3);
  const hrs = st.hourly || [];
  if (hrs.length) {
    const top = 500, bottom = 596, temps = hrs.map((h) => h.temp);
    const lo = Math.min(...temps), hi = Math.max(...temps), span = Math.max(6, hi - lo);
    const colW = GW / hrs.length;
    const pts = hrs.map((h, i) => [M + colW * (i + 0.5), bottom - ((h.temp - (hi + lo) / 2 + span / 2) / span) * (bottom - top)]);
    ctx.strokeStyle = BLUE; ctx.lineWidth = 4; ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    pts.forEach(([x, y], i) => {
      ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fillStyle = BLUE; ctx.fill();
      txt(ctx, `${hrs[i].temp}°`, x - tw(ctx, `${hrs[i].temp}°`, 17) / 2, y - 16, 17);
      txt(ctx, hrs[i].t, x - tw(ctx, hrs[i].t, 15) / 2, bottom + 28, 15);
      txt(ctx, hrs[i].text || '', x - tw(ctx, hrs[i].text || '', 14) / 2, bottom + 50, 14);
    });
  }
  footer(ctx, '土豆片 · 天气');
}

// ── 诗词（含赏析）──
export function drawPoem(ctx, st) {
  bg(ctx);
  const p = st.poem || { title: '今日诗词', lines: ['在右侧填写诗句'] };
  head(ctx, p.title, p.dynasty ? `${p.dynasty} · ${p.author || ''}` : '');
  const f = 36, lh = 58;
  const bodyTop = 132;
  const lines = [];
  p.lines.forEach((l) => lines.push(...wrap(ctx, l, GW, f, '700')));
  const noteLines = st.poemNote ? wrap(ctx, st.poemNote, GW, 21).slice(0, 6) : [];
  const maxBody = Math.floor((H - 190 - noteLines.length * 34 - 40) / lh);
  const show = st.poemFull ? lines : lines.slice(0, Math.max(2, maxBody));
  // 先用临时游标算总高，再整体垂直居中，避免上面挤、下面空一大片
  const blockH = show.length * lh + (lines.length > show.length ? lh : 0)
    + (noteLines.length ? noteLines.length * 34 + 52 : 0);
  let y = bodyTop + Math.max(0, Math.floor((H - 150 - blockH - bodyTop) / 3));
  show.forEach((l) => { txt(ctx, l, M, y, f, '700'); y += lh; });
  if (lines.length > show.length) { txt(ctx, '……', M, y, f, '700'); y += lh; }
  if (noteLines.length) {
    y += Math.round(6 * LS); rule(ctx, y); y += Math.round(16 * LS);
    txt(ctx, '赏析', M, y, 17, '700', RED); y += Math.round(30 * LS);
    noteLines.forEach((l) => { txt(ctx, l, M, y, 21); y += Math.round(34 * LS); });
  }
  ctx.fillStyle = RED; ctx.fillRect(W - M - 54, H - 118, 54, 54);
  txt(ctx, '诗', W - M - 44, H - 78, 26, '700', WHITE);
  footer(ctx, '每日诗词 · 土豆片');
}

// ── 自定义积木（标题 + 若干行）──
export function drawCustom(ctx, st) {
  bg(ctx);
  const c = st.custom || { title: '我的卡片', lines: [] };
  head(ctx, c.title || '我的卡片', `${st.now.getMonth() + 1}/${st.now.getDate()}`);
  ctx.fillStyle = RED; ctx.font = F('400', 96); ctx.fillText(String(st.now.getDate()).padStart(2, '0'), M, 220);
  txt(ctx, `${st.now.getMonth() + 1}月`, M + 2, 254, 18, '700');
  txt(ctx, WEEK[st.now.getDay()], M + 2, 278, 15);
  let y = 340;
  (c.lines || []).slice(0, 6).forEach((l) => { txt(ctx, l, M, y, 24); y += Math.round(44 * LS); });

  // 二维码：内容填在 c.qr，靠 CDN 的 qrcode-generator 生成矩阵
  if (c.qr && typeof window.qrcode === 'function') {
    const qr = window.qrcode(0, 'M');
    qr.addData(String(c.qr));
    qr.make();
    const n = qr.getModuleCount();
    const cell = Math.max(2, Math.floor(Math.min(300, H - y - 120) / n));
    const size = cell * n;
    const ox = M + Math.floor((W - M * 2 - size) / 2);
    ctx.fillStyle = WHITE; ctx.fillRect(ox - 6, y - 6, size + 12, size + 12);
    ctx.strokeStyle = BLACK; ctx.lineWidth = 2; ctx.strokeRect(ox - 6, y - 6, size + 12, size + 12);
    ctx.fillStyle = BLACK;
    for (let r = 0; r < n; r++) {
      for (let col = 0; col < n; col++) {
        if (qr.isDark(r, col)) ctx.fillRect(ox + col * cell, y + r * cell, cell, cell);
      }
    }
  }
  footer(ctx);
}


// ── 色块天气（与桌面版同一版式）──
export function drawWeather2(ctx, st) {
  bg(ctx);
  const w = st.weather;
  const C = (x0, y0, x1, y1, fill = WHITE, outline = BLACK) => {
    ctx.fillStyle = fill; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.strokeStyle = outline; ctx.lineWidth = 3; ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  };
  const aqiColor = (a) => (a <= 50 ? GREEN : a <= 100 ? YELLOW : RED);
  const d = new Date();
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  if (!w || w.temp == null) {
    txt(ctx, '天气获取失败：点右侧「拉取」', M, 200, 22);
    return;
  }

  const top = M;
  C(M, top, W - M, top + 84);
  txt(ctx, w.city || '本地', M + 16, top + 44, 34, '700');
  txt(ctx, '色块天气', M + 16, top + 70, 14);
  C(W - M - 210, top, W - M, top + 84, YELLOW);
  txt(ctx, `${week[d.getDay()]} ${d.toTimeString().slice(0,5)}`, W - M - 194, top + 52, 26, '700');

  const y0 = top + 84, y1 = y0 + 250, midX = M + Math.round((W - M * 2) * 0.60);
  C(M, y0, midX, y1);
  txt(ctx, String(Math.round(w.temp)), M + 18, y0 + 96, 92, '700');
  txt(ctx, '°C', M + 18 + tw(ctx, String(Math.round(w.temp)), 92), y0 + 60, 34);
  txt(ctx, w.text || '', M + 20, y0 + 176, 36, '700');
  txt(ctx, `今日 ${Math.round(w.lo)}—${Math.round(w.hi)}℃`, M + 20, y0 + 220, 19);

  const aq = w.aqi ?? 0;
  C(midX, y0, W - M, y0 + 132, aqiColor(aq));
  const light = aqiColor(aq) === YELLOW;
  txt(ctx, '空气质量', midX + 14, y0 + 26, 17, '700', light ? BLACK : WHITE);
  txt(ctx, String(aq), midX + 14, y0 + 84, 48, '700', light ? BLACK : WHITE);
  txt(ctx, 'AQI', midX + 14, y0 + 118, 15, '400', light ? BLACK : WHITE);
  C(midX, y0 + 132, W - M, y1);
  txt(ctx, `湿度 ${Math.round(w.hum ?? 0)}%`, midX + 14, y0 + 176, 19, '700');
  txt(ctx, `体感 ${Math.round(w.feels ?? w.temp)}°`, midX + 14, y0 + 214, 19, '700');

  const y2 = y1;
  C(M, y2, M + 48, y2 + 156, BLUE);
  '3天预报'.split('').forEach((ch, i) => txt(ctx, ch, M + 12, y2 + 34 + i * 30, 20, '700', WHITE));
  const days = (w.daily3 || []).slice(0, 3);
  const colw = Math.floor((W - M - (M + 48)) / 3);
  for (let i = 0; i < 3; i++) C(M + 48 + i * colw, y2, M + 48 + (i + 1) * colw, y2 + 156);
  days.forEach((day, i) => {
    const cx = M + 48 + i * colw + colw / 2;
    const ctr = (t, y, size, weight = '400') => txt(ctx, t, cx - tw(ctx, t, size, weight) / 2, y, size, weight);
    ctr(day.label || '', y2 + 30, 18);
    ctr(day.text || '', y2 + 76, 30, '700');
    ctr(`${Math.round(day.lo)}～${Math.round(day.hi)}°`, y2 + 124, 20, '700');
  });

  const y3 = y2 + 156, halfX = M + Math.round((W - M * 2) * 0.5);
  C(M, y3, halfX, y3 + 140, BLUE);
  txt(ctx, '日出 / 日落', M + 14, y3 + 30, 20, '700', WHITE);
  txt(ctx, w.sunrise || '--', M + 14, y3 + 76, 29, '700', WHITE);
  txt(ctx, w.sunset || '--', M + 14, y3 + 122, 29, '700', WHITE);
  C(halfX, y3, W - M, y3 + 140);
  const tmr = days[1] || {};
  txt(ctx, `明天 ${tmr.date || ''}`, halfX + 14, y3 + 30, 18);
  txt(ctx, `${tmr.text || ''} ${Math.round(tmr.lo ?? 0)}—${Math.round(tmr.hi ?? 0)}℃`, halfX + 14, y3 + 72, 22, '700');
  txt(ctx, `今日：${w.text || ''}`, halfX + 14, y3 + 120, 18);

  const y4 = y3 + 140;
  C(M, y4, W - M, y4 + 76, YELLOW);
  txt(ctx, '穿衣参考', M + 14, y4 + 28, 20, '700');
  const t = Number(w.temp);
  const advice = t < 0 ? '气温很低，建议羽绒服、厚毛衣。' : t < 10 ? '气温较低，建议厚外套加毛衣。'
    : t < 18 ? '天气偏凉，外套加长袖合适。' : t < 26 ? '温度舒适，长袖或薄外套即可。' : '天气较热，短袖出行。';
  txt(ctx, advice, M + 14, y4 + 58, 16);

  const y5 = y4 + 76;
  if (y5 + 36 <= H - 16) {
    C(M, y5, W - M, y5 + 36);
    txt(ctx, '来源：Open-Meteo · 非实时更新', M + 14, y5 + 24, 14);
  }
}
