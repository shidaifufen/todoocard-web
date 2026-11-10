// 模板绘制：全部在 Canvas 上画 528×792，颜色只用六色调色板里的精确值
export const W = 528, H = 792, M = 34;
const BLACK = '#000', WHITE = '#fff', RED = '#ff0000', YELLOW = '#ffff00', BLUE = '#0000ff', GREEN = '#00ff00';
const F = (w, s) => `${w} ${s}px "PingFang SC","Microsoft YaHei",system-ui,sans-serif`;
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function bg(ctx) { ctx.fillStyle = WHITE; ctx.fillRect(0, 0, W, H); }
function text(ctx, s, x, y, size, weight = '400', color = BLACK) {
  ctx.fillStyle = color; ctx.font = F(weight, size); ctx.fillText(s, x, y);
}
function measure(ctx, s, size, weight = '400') { ctx.font = F(weight, size); return ctx.measureText(s).width; }
function wrap(ctx, s, maxW, size, weight = '400') {
  const out = []; let line = '';
  for (const ch of String(s)) {
    if (measure(ctx, line + ch, size, weight) > maxW) { out.push(line); line = ch; }
    else line += ch;
  }
  if (line) out.push(line);
  return out;
}
function right(ctx, s, y, size, weight = '400', color = BLACK) {
  const w = measure(ctx, s, size, weight);
  text(ctx, s, W - M - w, y, size, weight, color);
}
function head(ctx, title, meta = '') {
  ctx.fillStyle = RED; ctx.fillRect(M, 34, 13, 13);
  text(ctx, title, M + 24, 58, 30, '700');
  if (meta) right(ctx, meta, 52, 16);
  ctx.fillStyle = BLACK; ctx.fillRect(M, 82, W - M * 2, 3);
  ctx.fillStyle = RED; ctx.fillRect(M, 82, 90, 6);
}
function bar(ctx, x, y, w, h, pct, color) {
  ctx.strokeStyle = BLACK; ctx.lineWidth = 3; ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x + 3, y + 3, Math.max(0, (w - 6) * Math.min(1, Math.max(0, pct))), h - 6);
}

// ── 各模板 ──
export function drawQuote(ctx, st) {
  bg(ctx);
  const t = st.now;
  ctx.fillStyle = RED; ctx.fillRect(M, 34, 13, 13);
  text(ctx, '每日一句', M + 24, 58, 30, '700');
  right(ctx, `${t.getMonth() + 1}/${String(t.getDate()).padStart(2, '0')}`, 52, 16);
  // 复刻桌面版：引号 + 红色竖条 + 出处 + 三色圆点 + 页脚
  text(ctx, '“', M + 6, 150, 72, '700', RED);
  ctx.fillStyle = RED; ctx.fillRect(M, 168, 8, Math.min(300, 96 + st.quote.length * 6));
  const lines = wrap(ctx, st.quote, W - M * 2 - 46, 40, '700').slice(0, 6);
  let y = 210;
  lines.forEach((l) => { text(ctx, l, M + 34, y, 40, '700'); y += 58; });
  text(ctx, '— 今日一句', M + 34, y + 10, 18);
  [RED, YELLOW, BLUE].forEach((c, i) => { ctx.beginPath(); ctx.arc(M + 10 + i * 22, H - 118, 7, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill(); });
  ctx.fillStyle = BLACK; ctx.fillRect(M, H - 100, W - M * 2, 1);
  text(ctx, 'hitokoto', M, H - 76, 14);
  right(ctx, new Date(st.now).toLocaleDateString('zh-CN'), H - 76, 14);
  text(ctx, '土豆片 · 网页版', M, H - 40, 16);
}

export function drawTodo(ctx, st) {
  bg(ctx);
  const t = st.now;
  ctx.fillStyle = YELLOW; ctx.fillRect(0, 0, W, 104);
  text(ctx, '今日待办', M, 62, 34, '700');
  text(ctx, `${t.getMonth() + 1}月${t.getDate()}日 ${WEEK[t.getDay()]}`, M, 90, 16);
  right(ctx, `${st.todos.length}`, 62, 46, '700');
  let y = 150;
  st.todos.slice(0, 7).forEach((item) => {
    ctx.strokeStyle = BLACK; ctx.lineWidth = 3; ctx.strokeRect(M, y, 26, 26);
    const lines = wrap(ctx, item, W - M * 2 - 50, 24).slice(0, 1);
    text(ctx, lines[0] || '', M + 40, y + 22, 24);
    ctx.fillStyle = BLACK; ctx.fillRect(M + 40, y + 34, W - M * 2 - 44, 2);
    y += 62;
  });
  text(ctx, '勾掉一件算一件', M, H - 40, 16);
}

export function drawProgress(ctx, st) {
  bg(ctx);
  const now = st.now;
  const y0 = new Date(now.getFullYear(), 0, 1), y1 = new Date(now.getFullYear() + 1, 0, 1);
  const total = Math.round((y1 - y0) / 86400000), passed = Math.round((now - y0) / 86400000) + 1;
  const pct = passed / total;
  head(ctx, '时间进度', String(now.getFullYear()));
  ctx.fillStyle = RED; ctx.font = F('400', 96); ctx.fillText(String(Math.round(pct * 100)), M, 200);
  const pw = measure(ctx, String(Math.round(pct * 100)), 96);
  text(ctx, '%', M + pw + 4, 200, 40, '400', RED);
  text(ctx, `已过 ${passed} / ${total} 天`, M + 4, 236, 21);

  const cols = 32, gapw = (W - M * 2 - 6) / (cols - 1);
  let y = 268;
  for (let i = 0; i < total; i++) {
    const cx = M + (i % cols) * gapw, cy = y + Math.floor(i / cols) * gapw;
    ctx.beginPath(); ctx.arc(cx, cy, 5.5, 0, Math.PI * 2);
    if (i < passed) { ctx.fillStyle = RED; ctx.fill(); }
    else { ctx.strokeStyle = BLACK; ctx.lineWidth = 2; ctx.stroke(); }
  }
  y += Math.ceil(total / cols) * gapw + 26;
  ctx.fillStyle = BLACK; ctx.fillRect(M, y, W - M * 2, 2);
  y += 26;
  const m0 = new Date(now.getFullYear(), now.getMonth(), 1), m1 = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const rows = [
    ['本月', (now - m0) / (m1 - m0), GREEN],
    ['本周', ((now.getDay() || 7) - 1 + now.getHours() / 24) / 7, BLUE],
    ['今天', (now.getHours() * 60 + now.getMinutes()) / 1440, RED],
  ];
  rows.forEach(([label, p, c]) => {
    text(ctx, label, M, y + 18, 19, '700');
    text(ctx, `${Math.round(p * 100)}%`, M + 58, y + 18, 19);
    bar(ctx, M + 136, y, W - M * 2 - 136, 22, p, c);
    y += 42;
  });
  text(ctx, '今年还剩', M, H - 92, 19, '700');
  ctx.fillStyle = RED; ctx.fillRect(M, H - 78, 10, 38);
  text(ctx, String(total - passed), M + 24, H - 48, 30, '400');
  text(ctx, '天', M + 24 + measure(ctx, String(total - passed), 30) + 8, H - 48, 18, '700');
}

export function drawSummary(ctx, st) {
  bg(ctx);
  const t = st.now;
  head(ctx, '每日总结', `${String(t.getMonth() + 1).padStart(2, '0')}/${String(t.getDate()).padStart(2, '0')} ${WEEK[t.getDay()]}`);
  ctx.fillStyle = RED; ctx.font = F('400', 96); ctx.fillText(String(t.getDate()).padStart(2, '0'), M, 200);
  text(ctx, `${t.getMonth() + 1}月`, M + 2, 234, 18, '700');
  if (st.weather?.temp != null) {
    const tx = W * 0.42;
    ctx.fillStyle = BLACK; ctx.font = F('400', 84); ctx.fillText(String(Math.round(st.weather.temp)), tx, 200);
    const tw = measure(ctx, String(Math.round(st.weather.temp)), 84);
    text(ctx, '°C', tx + tw + 4, 178, 34, '400', RED);
    text(ctx, `${st.weather.text} · ${st.weather.city}`, tx, 236, 17);
  }
  ctx.fillStyle = YELLOW; ctx.fillRect(M, 262, W - M * 2, 8);
  text(ctx, '今日待办', M, 316, 20, '700');
  right(ctx, `${st.todos.length} 项`, 312, 16);
  let y = 352;
  if (!st.todos.length) { text(ctx, '今天还没有安排', M, y, 20); y += 40; }
  st.todos.slice(0, 3).forEach((item) => { text(ctx, '· ' + item, M, y, 22); y += 34; });
  const mp = t.getDate() / new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  text(ctx, '本月', M, y + 24, 15, '700');
  right(ctx, `${Math.round(mp * 100)}%`, y + 20, 15);
  bar(ctx, M, y + 34, W - M * 2, 16, mp, GREEN);
  text(ctx, '土豆片 · 网页版', M, H - 30, 16);
}

export function drawCalendar(ctx, st) {
  bg(ctx);
  const t = st.now;
  head(ctx, `${t.getFullYear()} 年 ${t.getMonth() + 1} 月`, `第 ${Math.ceil((t - new Date(t.getFullYear(), 0, 1)) / 86400000) + 1} 天`);
  const first = new Date(t.getFullYear(), t.getMonth(), 1);
  const days = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  const startCol = (first.getDay() + 6) % 7;
  const colW = (W - M * 2) / 7;
  const names = ['一', '二', '三', '四', '五', '六', '日'];
  names.forEach((n, i) => {
    const w = measure(ctx, n, 18, '700');
    text(ctx, n, M + i * colW + (colW - w) / 2, 150, 18, '700', i >= 5 ? RED : BLACK);
  });
  const rows = Math.ceil((startCol + days) / 7);
  const cellH = Math.min(70, (H - 250 - 150) / rows);
  for (let d = 1; d <= days; d++) {
    const idx = startCol + d - 1, col = idx % 7, row = Math.floor(idx / 7);
    const cx = M + col * colW + colW / 2, cy = 180 + row * cellH;
    const red = col >= 5;
    if (d === t.getDate()) {
      ctx.beginPath(); ctx.arc(cx, cy - 8, 20, 0, Math.PI * 2); ctx.fillStyle = RED; ctx.fill();
      const w = measure(ctx, String(d), 26);
      text(ctx, String(d), cx - w / 2, cy, 26, '400', WHITE);
    } else {
      const w = measure(ctx, String(d), 26);
      text(ctx, String(d), cx - w / 2, cy, 26, '400', red ? RED : BLACK);
    }
  }
  text(ctx, '土豆片 · 网页版', M, H - 30, 16);
}

export function drawCountdown(ctx, st) {
  bg(ctx);
  head(ctx, '倒计时', `${st.now.getMonth() + 1}/${st.now.getDate()}`);
  let y = 150;
  if (!st.countdowns.length) text(ctx, '还没有纪念日（在右侧添加）', M, y, 18);
  st.countdowns.slice(0, 6).forEach((c) => {
    const d = Math.ceil((new Date(c.date + 'T00:00:00') - new Date(st.now.toDateString())) / 86400000);
    text(ctx, c.name, M, y, 22, '700');
    right(ctx, `${d} 天`, y + 4, 22);
    ctx.fillStyle = BLACK; ctx.fillRect(M, y + 12, W - M * 2, 1);
    y += 62;
  });
  text(ctx, '土豆片 · 网页版', M, H - 30, 16);
}

export function drawWeather(ctx, st) {
  bg(ctx);
  const w = st.weather;
  head(ctx, '今日天气', w?.city || '');
  if (!w || w.temp == null) { text(ctx, '天气获取失败（检查网络或城市）', M, 200, 22); return; }
  ctx.fillStyle = BLACK; ctx.font = F('400', 128); ctx.fillText(String(Math.round(w.temp)), M, 230);
  const tw = measure(ctx, String(Math.round(w.temp)), 128);
  text(ctx, '°C', M + tw + 4, 190, 54, '400', RED);
  text(ctx, w.text, M, 292, 44, '700');
  ctx.fillStyle = BLACK; ctx.fillRect(M, 316, W - M * 2, 3);
  const cells = [['最高', w.hi, RED], ['最低', w.lo, BLUE], ['体感', w.feels, GREEN]];
  cells.forEach(([label, v, c], i) => {
    const x = M + i * ((W - M * 2) / 3);
    text(ctx, label, x, 350, 15);
    text(ctx, `${Math.round(v)}°`, x, 382, 28);
    ctx.fillStyle = c; ctx.fillRect(x, 396, 32, 6);
  });
  text(ctx, '未来几小时', M, 448, 19, '700');
  ctx.fillStyle = BLACK; ctx.fillRect(M + 120, 441, W - M * 2 - 120, 3);
  const hrs = st.hourly || [];
  if (hrs.length) {
    const top = 500, bottom = 590, temps = hrs.map((h) => h.temp);
    const lo = Math.min(...temps), hi = Math.max(...temps), span = Math.max(6, hi - lo);
    const colW = (W - M * 2) / hrs.length;
    const pts = hrs.map((h, i) => [M + colW * (i + 0.5), bottom - ((h.temp - (hi + lo) / 2 + span / 2) / span) * (bottom - top)]);
    ctx.strokeStyle = BLUE; ctx.lineWidth = 4; ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    pts.forEach(([x, y], i) => {
      ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fillStyle = BLUE; ctx.fill();
      const tw2 = measure(ctx, `${hrs[i].temp}°`, 17);
      text(ctx, `${hrs[i].temp}°`, x - tw2 / 2, y - 14, 17);
      const hw = measure(ctx, hrs[i].t, 15);
      text(ctx, hrs[i].t, x - hw / 2, bottom + 26, 15);
      const cw = measure(ctx, hrs[i].text || '', 14);
      text(ctx, hrs[i].text || '', x - cw / 2, bottom + 48, 14);
    });
  }
  text(ctx, '土豆片 · 网页版', M, H - 30, 16);
}
