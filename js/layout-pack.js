import * as T from './templates.js';

export const LIMIT = 256 * 1024;
const kinds = ['summary', 'quote', 'todo', 'progress', 'calendar', 'weather', 'weather2', 'countdown', 'poem', 'custom'];
const palette = { black: '#000', white: '#fff', blue: '#00f', red: '#f00', green: '#0f0', yellow: '#ff0' };
const fields = new Set(('weatherCity weatherText weatherTemp weatherHigh weatherLow weatherAqi weatherHumidity ' +
  'weatherFeels weatherSunrise weatherSunset weatherUpdated wearAdvice date time week year month day yearPercent ' +
  'quote quoteBy poemTitle poemBy poemText poemNote customTitle customText todoCount').split(' '));
const matching = /\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g;
const style = 'textSize color bold align lineHeight';
const options = {
  rect: 'fill border borderWidth radius', text: style + ' text wrap shrink',
  list: style + ' source numbered emptyText', weatherIcon: '', weatherHours: 'color',
  forecastBars: 'color', block: 'blockType text textSize centered color', builtin: 'kind',
};
const lists = ['todos', 'poemLines', 'customLines', 'weatherForecast', 'countdowns'];
const blocks = 'title bigdate weather todos quote poem dots countdown text qr rule'.split(' ');
const ranges = { x: [0, 527], y: [0, 791], width: [1, 528], height: [1, 792], textSize: [10, 160],
  lineHeight: [1, 2.5], borderWidth: [0, 20], radius: [0, 80] };

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function keys(object, allowed) {
  requireValue(object && typeof object === 'object' && !Array.isArray(object) &&
    Object.keys(object).every(key => allowed.split(' ').includes(key)), '版式含不支持的字段');
}

function label(value, key) {
  if (!Object.hasOwn(value, key)) return '';
  requireValue(typeof value[key] === 'string' && value[key].length <= 4096, key + ' 文字无效');
  return value[key];
}

function geometry({ x = 0, y = 0, width = 528 - x, height = 792 - y }) {
  return [x, y, width, height];
}

export function parsePack(raw) {
  requireValue(new TextEncoder().encode(raw).length <= LIMIT, '版式包不能超过 256 KB');
  const pack = JSON.parse(raw.replace(/^\uFEFF/, ''));
  keys(pack, 'schemaVersion name templates');
  requireValue(pack.schemaVersion === 1, '仅支持 schemaVersion 1');
  label(pack, 'name');
  keys(pack.templates, kinds.join(' '));
  requireValue(Object.keys(pack.templates).length, '版式包需要至少一张卡片');
  for (const template of Object.values(pack.templates)) {
    keys(template, 'name sources nodes');
    label(template, 'name');
    if (Object.hasOwn(template, 'sources')) {
      requireValue(Array.isArray(template.sources) && template.sources.every(s => ['weather', 'quote', 'poem'].includes(s)), '数据来源无效');
    }
    requireValue(Array.isArray(template.nodes) && template.nodes.length >= 1 && template.nodes.length <= 96, '每张卡片需要 1～96 个元素');
    for (const node of template.nodes) validateNode(node);
  }
  return pack;
}

function validateNode(node) {
  requireValue(node && Object.hasOwn(options, node.type), '元素类型无效');
  keys(node, 'type x y width height showIf ' + options[node.type]);
  for (const [key, [min, max]] of Object.entries(ranges)) {
    if (Object.hasOwn(node, key)) requireValue(Number.isFinite(node[key]) && node[key] >= min && node[key] <= max, key + ' 数值越界');
  }
  const [x, y, w, h] = geometry(node);
  requireValue(x + w <= 528.01 && y + h <= 792.01, '元素超出 528×792 画布');
  for (const key of ['fill', 'border', 'color']) {
    if (Object.hasOwn(node, key)) requireValue([...Object.keys(palette), 'aqiColor', 'aqiInk'].includes(node[key]), '请使用六色名称');
  }
  for (const key of ['bold', 'wrap', 'shrink', 'numbered', 'centered']) {
    if (Object.hasOwn(node, key)) requireValue(typeof node[key] === 'boolean', key + ' 必须为布尔值');
  }
  if (Object.hasOwn(node, 'align')) requireValue(['left', 'center', 'right'].includes(node.align), '文字对齐方式无效');
  const condition = label(node, 'showIf');
  requireValue(!condition || fields.has(condition), '条件字段无效');
  for (const key of ['text', 'emptyText']) {
    const value = label(node, key);
    requireValue([...value.matchAll(matching)].every(match => fields.has(match[1])) &&
      !value.replace(matching, '').includes('{{'), '内容绑定字段无效');
  }
  if (node.type === 'list') requireValue(lists.includes(node.source), '列表来源无效');
  if (node.type === 'block') requireValue(blocks.includes(node.blockType), '组合元素无效');
  if (node.type === 'builtin') requireValue(kinds.includes(node.kind), '内置卡片类型无效');
}

export function githubFile(link) {
  const url = new URL(link.trim());
  requireValue(url.protocol === 'https:' && !url.username && !url.password && !url.port, '请输入公开 GitHub HTTPS 文件链接');
  const path = url.pathname.split('/').slice(1);
  if (url.hostname === 'github.com' && path.length >= 6 &&
      (path.slice(2, 4).join('/') === 'releases/download' || path.slice(2, 5).join('/') === 'releases/latest/download')) {
    const [owner, repo,, mode, tagOrDownload, ...asset] = path;
    const selector = mode === 'latest' ? 'latest' : 'tags/' + tagOrDownload;
    return { release: 'https://api.github.com/repos/' + owner + '/' + repo + '/releases/' + selector, asset: decodeURIComponent(asset.join('/')) };
  }
  if (url.hostname === 'github.com' && ['blob', 'raw'].includes(path[2])) path.splice(2, 1);
  else requireValue(url.hostname === 'raw.githubusercontent.com', '请使用 GitHub 文件或 Release 附件下载链接');
  requireValue(path.length >= 4 && path.every(Boolean), '链接缺少文件路径');
  const [owner, repo, ...tail] = path;
  const fromRefs = tail[0] === 'refs' && ['heads', 'tags'].includes(tail[1]);
  const [ref, ...file] = fromRefs ? tail.slice(2) : tail;
  requireValue(file.length, '链接缺少文件路径');
  return {
    raw: 'https://raw.githubusercontent.com/' + path.join('/'),
    api: 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + file.join('/') + '?ref=' + encodeURIComponent(decodeURIComponent(ref)),
  };
}

async function response(url, accept) {
  const reply = await fetch(url, { cache: 'no-cache', credentials: 'omit', headers: { Accept: accept }, signal: AbortSignal.timeout(12000) });
  requireValue(reply.ok, 'GitHub 下载失败（HTTP ' + reply.status + '）');
  return reply;
}

async function packResponse(reply) {
  requireValue(Number(reply.headers.get('content-length')) <= LIMIT, '版式包不能超过 256 KB');
  const reader = reply.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let raw = '', total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      requireValue(total <= LIMIT, '版式包不能超过 256 KB');
      raw += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return parsePack(raw + decoder.decode());
}

export async function fetchPack(link) {
  const file = githubFile(link);
  if (file.release) {
    const release = await (await response(file.release, 'application/vnd.github+json')).json();
    const asset = release.assets?.find(item => item.name === file.asset);
    requireValue(asset, '该 Release 中没有这个附件');
    try {
      return await packResponse(await response(asset.url, 'application/octet-stream'));
    } catch {
      throw new Error('浏览器无法直接读取这个 Release 附件，请下载 JSON 后通过文件导入');
    }
  }
  let reply;
  try {
    reply = await response(file.raw, 'application/json, text/plain');
  } catch {
    reply = await response(file.api, 'application/vnd.github.raw+json');
  }
  return packResponse(reply);
}

export function needsWeather(template) {
  return template.sources?.includes('weather') || template.nodes.some(n =>
    ['weatherIcon', 'weatherHours', 'forecastBars'].includes(n.type) ||
    ['summary', 'weather', 'weather2'].includes(n.kind) || n.blockType === 'weather' ||
    n.source === 'weatherForecast' || n.showIf?.startsWith('weather') || n.showIf === 'wearAdvice' ||
    /\{\{(?:weather[A-Za-z]+|wearAdvice)\}\}/.test((n.text || '') + (n.emptyText || '')));
}

const dayNumber = (y, m, d) => Date.UTC(y, m, d) / 86400000;
const pad = n => String(n).padStart(2, '0');
const valuesFor = st => {
  const now = st.now, w = st.weather || {}, p = st.poem || {};
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  const elapsed = dayNumber(y, m, d) - dayNumber(y, 0, 1) + 1;
  const total = dayNumber(y + 1, 0, 1) - dayNumber(y, 0, 1);
  const number = n => Number.isFinite(n) ? String(Math.round(n)) : '--';
  const temp = w.temp;
  const advice = !Number.isFinite(temp) ? '选择城市后显示' : temp < 10 ? '厚外套，注意保暖' :
    temp < 18 ? '外套加长袖' : temp < 26 ? '长袖或薄外套' : '轻薄短袖，注意补水';
  return {
    weatherCity: w.city || st.city || '', weatherText: w.text || '', weatherTemp: number(temp),
    weatherHigh: number(w.hi), weatherLow: number(w.lo), weatherAqi: number(w.aqi), weatherHumidity: number(w.hum),
    weatherFeels: number(w.feels), weatherSunrise: w.sunrise || '--:--', weatherSunset: w.sunset || '--:--',
    weatherUpdated: w.clock || '未更新', wearAdvice: advice,
    date: [y, pad(m + 1), pad(d)].join('-'), time: pad(now.getHours()) + ':' + pad(now.getMinutes()),
    week: '周' + '日一二三四五六'[now.getDay()], year: y, month: m + 1, day: d, yearPercent: Math.floor(elapsed * 100 / total),
    quote: st.quote || '', quoteBy: st.quoteBy || '', poemTitle: p.title || '',
    poemBy: [p.dynasty, p.author].filter(Boolean).join(' · '), poemText: (p.lines || []).join('\n'),
    poemNote: st.poemNote || '', customTitle: st.custom?.title || '', customText: (st.custom?.lines || []).join('\n'),
    todoCount: st.todos?.length || 0,
  };
};

function listFor(key, st) {
  if (key === 'todos') return st.todos || [];
  if (key === 'poemLines') return st.poem?.lines || [];
  if (key === 'customLines') return st.custom?.lines || [];
  if (key === 'weatherForecast') return (st.weather?.daily3 || []).map(d => d.label + ' ' + d.text + '  ' + d.lo + '~' + d.hi + '°');
  const now = st.now;
  const today = dayNumber(now.getFullYear(), now.getMonth(), now.getDate());
  return (st.countdowns || []).map(e => e.name + '  ' + (Math.round(Date.parse(e.date) / 86400000 - today)) + ' 天');
}

const bind = (s, values) => (s || '').replace(matching, (_, key) => String(values[key] ?? '').slice(0, 4000)).slice(0, 12000);
const color = (name, w) => {
  if (name === 'aqiInk') return w?.aqi > 100 ? palette.white : palette.black;
  if (name === 'aqiColor') return !Number.isFinite(w?.aqi) ? palette.white : w.aqi <= 50 ? palette.green : w.aqi <= 100 ? palette.yellow : palette.red;
  return palette[name];
};
const font = (size, bold = false) => (bold ? '700 ' : '400 ') + size + 'px "PingFang SC","Microsoft YaHei",sans-serif';
function rowsOf(text, measure, w, wrap) {
  return text.split('\n').flatMap(paragraph => {
    if (!wrap) return [paragraph];
    const rows = [];
    let row = '';
    for (const ch of paragraph) {
      if (row && measure(row + ch) > w) { rows.push(row); row = ''; }
      row += ch;
    }
    return [...rows, row];
  });
}

function write(ctx, n, text, w, h, ink, scale, spacing) {
  const measure = s => ctx.measureText(s).width;
  let size = Math.max(10, Math.round((n.textSize || 24) * scale));
  let step, rows;
  for (;;) {
    ctx.font = font(size, n.bold);
    step = size * Math.max(1, (n.lineHeight || 1.4) * spacing);
    rows = rowsOf(text, measure, w, n.wrap !== false);
    if (n.shrink === false || size <= 10 || (size + (rows.length - 1) * step <= h && rows.every(row => measure(row) <= w))) break;
    size--;
  }
  const count = Math.max(0, Math.floor((h - size) / step) + 1);
  ctx.textBaseline = 'top';
  ctx.textAlign = n.align || 'left';
  const x = { left: 0, center: w / 2, right: w }[ctx.textAlign];
  ctx.fillStyle = ink;
  rows.slice(0, count).forEach((str, i) => {
    let row = str;
    if (measure(row) > w || (i === count - 1 && rows.length > count)) {
      while (row && measure(row + '…') > w) row = row.slice(0, -1);
      row += '…';
    }
    ctx.fillText(row, x, i * step);
  });
}

function graph(ctx, type, st, w, h, ink) {
  ctx.font = font(Math.max(8, Math.min(19, Math.round(h / (type === 'weatherHours' ? 5 : 4.6)))));
  ctx.fillStyle = palette.black;
  ctx.textBaseline = 'middle';
  if (type === 'weatherHours') {
    const hours = (st.hourly || []).filter(v => Number.isFinite(v.temp)).slice(0, 6);
    if (hours.length > 1) {
      const lo = Math.min(...hours.map(x => x.temp)) - 2, hi = Math.max(...hours.map(x => x.temp)) + 2;
      const points = hours.map((v, i) => [w * (.065 + .87 * i / (hours.length - 1)), h * (.72 - .34 * (v.temp - lo) / (hi - lo))]);
      ctx.fillText('未来时段 · 温度趋势', 0, h * .11);
      ctx.strokeStyle = ink; ctx.lineWidth = 3;
      ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
      ctx.textAlign = 'center';
      points.forEach(([x, y], i) => {
        ctx.fillStyle = palette.red; ctx.fillRect(x - 3, y - 3, 6, 6);
        ctx.fillStyle = palette.black; ctx.fillText(hours[i].temp + '°', x, y - h * .14); ctx.fillText(hours[i].t, x, h * .91);
      });
      return;
    }
  } else {
    const days = (st.weather?.daily3 || []).filter(v => Number.isFinite(v.lo) && Number.isFinite(v.hi)).slice(0, 3);
    if (days.length) {
      const lo = Math.min(...days.map(v => v.lo)), hi = Math.max(...days.map(v => v.hi));
      days.forEach((v, i) => {
        const y = h * (i + .5) / 3;
        const [a, b] = [v.lo, v.hi].map(t => w * (.42 + .30 * (t - lo) / Math.max(1, hi - lo)));
        ctx.fillStyle = palette.black;
        ctx.fillText(v.label + ' ' + v.text, 0, y, w * .38);
        ctx.fillText(v.lo + '~' + v.hi + '°', w * .77, y, w * .23);
        ctx.fillStyle = ink; ctx.fillRect(a, y - 4, Math.max(4, b - a), 8);
      });
      return;
    }
  }
  ctx.fillText('刷新天气后显示', 0, h / 2, w);
}

const native = { summary: T.drawSummary, quote: T.drawQuote, todo: T.drawTodo, progress: T.drawProgress,
  calendar: T.drawCalendar, weather: T.drawWeather, weather2: T.drawWeather2, countdown: T.drawCountdown,
  poem: T.drawPoem, custom: T.drawCustom };

function drawBlock(ctx, n, st, values, w, h, ink, scale, spacing) {
  const value = {
    title: values.customTitle, bigdate: values.date + '  ' + values.week,
    weather: [values.weatherCity, values.weatherText, values.weatherTemp + '°'].filter(Boolean).join('  '),
    todos: listFor('todos', st).map((v, i) => (i + 1) + '. ' + v).join('\n') || '今天还没有安排',
    quote: [values.quote, values.quoteBy].filter(Boolean).join('\n'),
    poem: [values.poemTitle, values.poemBy, values.poemText].filter(Boolean).join('\n'),
    countdown: listFor('countdowns', st).join('\n') || '在倒计时中添加纪念日',
  };
  const text = bind(n.text, values);
  if (n.blockType === 'rule') {
    ctx.fillStyle = ink; ctx.fillRect(0, 0, w, Math.min(h, 3));
  } else if (n.blockType === 'dots') {
    const step = w / 52;
    const passed = Math.floor(values.yearPercent * .52);
    for (let i = 0; i < 52; i++) {
      ctx.beginPath(); ctx.arc((i + .5) * step, h * .22, Math.min(step * .34, h * .12), 0, Math.PI * 2);
      ctx.fillStyle = ink; ctx.strokeStyle = palette.black; if (i < passed) ctx.fill(); else ctx.stroke();
    }
    ctx.translate(0, h * .45);
    write(ctx, n, '已过 ' + values.yearPercent + '%', w, h * .55, palette.black, scale, spacing);
  } else if (n.blockType === 'qr') {
    requireValue(typeof window.qrcode === 'function', '二维码组件未加载，请联网后重试');
    const qr = window.qrcode(0, 'M'); qr.addData(text || 'https://github.com/shidaifufen'); qr.make();
    const count = qr.getModuleCount(), unit = Math.floor(Math.min(w, h) / (count + 8));
    requireValue(unit > 0, '二维码区域太小');
    const size = unit * (count + 8), x = n.centered ? Math.floor((w - size) / 2) : 0;
    ctx.fillStyle = palette.white; ctx.fillRect(x, 0, size, size);
    ctx.fillStyle = palette.black;
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) if (qr.isDark(row, col)) ctx.fillRect(x + (col + 4) * unit, (row + 4) * unit, unit, unit);
    }
  } else {
    write(ctx, { ...n, align: n.centered ? 'center' : 'left' }, n.blockType === 'title' ? text || value.title : value[n.blockType] ?? text, w, h, ink, scale, spacing);
  }
}

export function renderPack(ctx, template, st, { scale = 1, spacing = 1 } = {}) {
  ctx.save();
  try {
    ctx.fillStyle = palette.white;
    ctx.fillRect(0, 0, 528, 792);
    const values = valuesFor(st);
    for (const n of template.nodes) {
      if (n.showIf && String(values[n.showIf] ?? '').trim() === '') continue;
      const [x, y, w, h] = geometry(n);
      const ink = color(n.color || (['weatherHours', 'forecastBars'].includes(n.type) ? 'blue' : 'black'), st.weather);
      ctx.save();
      try {
        ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.translate(x, y);
        if (n.type === 'rect') {
          ctx.beginPath(); ctx.roundRect(0, 0, w, h, n.radius || 0);
          ctx.fillStyle = color(n.fill || 'white', st.weather); ctx.fill();
          if (n.border && n.borderWidth !== 0) {
            const stroke = n.borderWidth ?? 2;
            if (w > stroke && h > stroke) {
              ctx.beginPath(); ctx.roundRect(stroke / 2, stroke / 2, w - stroke, h - stroke, Math.max(0, (n.radius || 0) - stroke / 2));
              ctx.strokeStyle = color(n.border, st.weather); ctx.lineWidth = stroke; ctx.stroke();
            }
          }
        } else if (n.type === 'text' || n.type === 'list') {
          let value = bind(n.text, values);
          if (n.type === 'list') value = listFor(n.source, st).slice(0, 80).map((row, i) => n.numbered ? (i + 1) + '. ' + row : row).join('\n') || bind(n.emptyText, values);
          write(ctx, n, value.slice(0, 12000), w, h, ink, scale, spacing);
        } else if (n.type === 'weatherIcon') {
          const size = Math.min(w, h);
          T.wxIcon(ctx, size * .16, size * .16, size * .68, st.weather?.code ?? -1);
        } else if (n.type === 'weatherHours' || n.type === 'forecastBars') {
          graph(ctx, n.type, st, w, h, ink);
        } else if (n.type === 'builtin') {
          ctx.scale(w / 528, h / 792); native[n.kind](ctx, st);
        } else drawBlock(ctx, n, st, values, w, h, ink, scale, spacing);
      } finally {
        ctx.restore();
      }
    }
  } finally {
    ctx.restore();
  }
}
