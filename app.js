'use strict';
(() => {
const $ = id => document.getElementById(id);
const el = (tag, text, attrs = {}) => {           // cria elemento SEM innerHTML
  const e = document.createElement(tag);
  if (text != null) e.textContent = text;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};
const stats = { q: 0, s: 0 };
const start = Date.now();

// ---------- fetch seguro com timeout ----------
async function getJSON(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, referrerPolicy: 'no-referrer', credentials: 'omit' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('tempo esgotado');
    throw e;
  } finally { clearTimeout(t); }
}
const throttle = {};                               // evita spam de requisições
function allowed(key, ms = 1500) {
  const now = Date.now();
  if (throttle[key] && now - throttle[key] < ms) return false;
  throttle[key] = now; return true;
}

// ---------- log / stats ----------
function log(msg) {
  $('log').prepend(el('li', `[${new Date().toLocaleTimeString('pt-BR')}] ${msg}`));
  while ($('log').children.length > 100) $('log').lastChild.remove();
}
function bumpQ() { stats.q++; $('stQ').textContent = stats.q; }
setInterval(() => {
  const s = Math.floor((Date.now() - start) / 1000);
  $('stU').textContent = [s / 3600, (s % 3600) / 60, s % 60].map(n => String(Math.floor(n)).padStart(2, '0')).join(':');
}, 1000);
$('logClear').addEventListener('click', () => $('log').replaceChildren());

// ---------- navegação ----------
function route() {
  const id = (location.hash || '#home').slice(1);
  const target = document.querySelector(`.view#${CSS.escape(id)}`) ? id : 'home';
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('on', v.id === target));
  document.querySelectorAll('.side a').forEach(a => a.classList.toggle('on', a.hash === '#' + target));
}
addEventListener('hashchange', route); route();

// ---------- Wikipédia ----------
async function wiki(term) {
  const url = 'https://pt.wikipedia.org/w/api.php?' + new URLSearchParams({
    action: 'query', list: 'search', srsearch: term, srlimit: '8', format: 'json', origin: '*' });
  const d = await getJSON(url);
  return d.query?.search ?? [];
}
$('wikiForm').addEventListener('submit', async e => {
  e.preventDefault();
  const q = $('wikiQ').value.trim(); if (!q || !allowed('wiki')) return;
  $('wikiStatus').textContent = 'Buscando…'; $('wikiOut').replaceChildren();
  try {
    const res = await wiki(q); bumpQ(); log(`wiki: ${res.length} resultados`);
    $('wikiStatus').textContent = res.length ? `${res.length} resultados` : 'Nada encontrado.';
    for (const r of res) {
      const card = el('div', null, { class: 'card' });
      const h = el('h3');
      h.append(el('a', r.title, { href: 'https://pt.wikipedia.org/wiki/' + encodeURIComponent(r.title.replace(/ /g, '_')), target: '_blank', rel: 'noopener noreferrer' }));
      // o snippet vem com HTML: extraímos só o texto (DOMParser não executa scripts)
      const txt = new DOMParser().parseFromString(r.snippet, 'text/html').body.textContent;
      card.append(h, el('p', txt + '…'));
      $('wikiOut').append(card);
    }
  } catch (err) { $('wikiStatus').textContent = 'Erro: ' + err.message; }
});

// ---------- Clima ----------
const WMO = {0:'Céu limpo',1:'Predom. limpo',2:'Parcialmente nublado',3:'Nublado',45:'Neblina',48:'Neblina c/ geada',
  51:'Garoa fraca',53:'Garoa',55:'Garoa forte',61:'Chuva fraca',63:'Chuva',65:'Chuva forte',71:'Neve fraca',73:'Neve',75:'Neve forte',
  80:'Pancadas fracas',81:'Pancadas',82:'Pancadas fortes',95:'Trovoadas',96:'Trovoadas c/ granizo',99:'Trovoadas fortes c/ granizo'};
async function clima(city) {
  const g = await getJSON('https://geocoding-api.open-meteo.com/v1/search?' + new URLSearchParams({ name: city, count: '1', language: 'pt' }));
  const p = g.results?.[0]; if (!p) throw new Error('cidade não encontrada');
  const f = await getJSON('https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
    latitude: p.latitude, longitude: p.longitude, timezone: 'auto',
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' }));
  return { p, f };
}
$('climaForm').addEventListener('submit', async e => {
  e.preventDefault();
  const q = $('climaQ').value.trim(); if (!q || !allowed('clima')) return;
  $('climaStatus').textContent = 'Buscando…'; $('climaOut').replaceChildren();
  try {
    const { p, f } = await clima(q); bumpQ(); log(`clima: ${p.name}`);
    const c = f.current;
    $('climaStatus').textContent = `${p.name}${p.admin1 ? ', ' + p.admin1 : ''} — ${p.country ?? ''}`;
    const now = el('div', null, { class: 'card' });
    now.append(el('h2', `${Math.round(c.temperature_2m)} °C — ${WMO[c.weather_code] ?? 'código ' + c.weather_code}`),
      el('p', `Sensação ${Math.round(c.apparent_temperature)} °C · Umidade ${c.relative_humidity_2m}% · Vento ${Math.round(c.wind_speed_10m)} km/h`));
    const tb = el('table'), head = el('tr');
    head.append(el('th', 'Dia'), el('th', 'Condição'), el('th', 'Mín/Máx'), el('th', 'Chuva'));
    tb.append(head);
    f.daily.time.forEach((d, i) => {
      const tr = el('tr');
      const dia = new Date(d + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
      tr.append(el('td', dia), el('td', WMO[f.daily.weather_code[i]] ?? '—'),
        el('td', `${Math.round(f.daily.temperature_2m_min[i])}° / ${Math.round(f.daily.temperature_2m_max[i])}°`),
        el('td', (f.daily.precipitation_probability_max[i] ?? '—') + '%'));
      tb.append(tr);
    });
    $('climaOut').append(now, tb);
  } catch (err) { $('climaStatus').textContent = 'Erro: ' + err.message; }
});

// ---------- Banco Mundial ----------
const fmt = v => Math.abs(v) >= 1e9 ? (v / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' bi'
  : Math.abs(v) >= 1e6 ? (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi'
  : v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
$('wbForm').addEventListener('submit', async e => {
  e.preventDefault(); if (!allowed('wb')) return;
  const pais = $('wbPais').value, ind = $('wbInd').value;
  if (!/^[A-Z]{3}$/.test(pais) || !/^[A-Z0-9.]+$/.test(ind)) return;   // whitelist
  $('wbStatus').textContent = 'Buscando…'; $('wbOut').replaceChildren();
  try {
    const y = new Date().getFullYear();
    const d = await getJSON(`https://api.worldbank.org/v2/country/${pais}/indicator/${ind}?format=json&per_page=100&date=2010:${y}`);
    if (!Array.isArray(d) || !d[1]) throw new Error(d?.[0]?.message?.[0]?.value || 'sem dados');
    const rows = d[1].filter(r => r.value != null).reverse();
    bumpQ(); log(`banco mundial: ${pais} ${ind}`);
    if (!rows.length) { $('wbStatus').textContent = 'Sem dados para essa combinação.'; return; }
    $('wbStatus').textContent = `${d[1][0].country.value} — ${d[1][0].indicator.value}`;
    const max = Math.max(...rows.map(r => Math.abs(r.value))) || 1;
    const chart = el('div', null, { class: 'chart', role: 'img', 'aria-label': 'Gráfico da série' });
    rows.forEach(r => { const b = el('div', null, { title: `${r.date}: ${fmt(r.value)}` }); b.style.height = (Math.abs(r.value) / max * 100) + '%'; chart.append(b); });
    const tb = el('table'), h = el('tr'); h.append(el('th', 'Ano'), el('th', 'Valor')); tb.append(h);
    rows.slice().reverse().forEach(r => { const tr = el('tr'); tr.append(el('td', r.date), el('td', fmt(r.value))); tb.append(tr); });
    $('wbOut').append(chart, tb);
  } catch (err) { $('wbStatus').textContent = 'Erro: ' + err.message; }
});

// ---------- Notas (localStorage, validadas) ----------
const KEY = 'lilith.notes.v1';
function loadNotes() {
  try {
    const arr = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(arr) ? arr.filter(n => n && typeof n.t === 'string' && typeof n.c === 'string').slice(0, 500) : [];
  } catch { return []; }
}
function saveNotes(n) {
  try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { alert('Não foi possível salvar (armazenamento cheio ou bloqueado).'); }
  renderNotes();
}
function renderNotes() {
  const notes = loadNotes();
  $('noteCount').textContent = notes.length; $('stN').textContent = notes.length;
  $('noteList').replaceChildren(...notes.map((n, i) => {
    const c = el('div', null, { class: 'card' });
    const del = el('button', 'Apagar', { class: 'ghost' });
    del.addEventListener('click', () => { if (confirm('Apagar esta nota?')) { notes.splice(i, 1); saveNotes(notes); log('nota apagada'); } });
    c.append(el('h3', n.t), el('p', n.c), el('small', new Date(n.d || 0).toLocaleString('pt-BR') + ' '), del);
    return c;
  }));
}
$('noteForm').addEventListener('submit', e => {
  e.preventDefault();
  const t = $('noteT').value.trim().slice(0, 120), c = $('noteC').value.slice(0, 5000);
  if (!t) return;
  const n = loadNotes(); n.unshift({ t, c, d: Date.now() }); saveNotes(n);
  e.target.reset(); log('nota salva');
});
renderNotes();

// ---------- Gerador de senhas (sem viés de módulo) ----------
const SETS = { U: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', L: 'abcdefghijklmnopqrstuvwxyz', D: '0123456789', S: '!@#$%^&*()-_=+[]{};:,.?/~' };
function randInt(n) {                     // rejeição: descarta valores que causariam viés
  const lim = Math.floor(0x100000000 / n) * n, b = new Uint32Array(1);
  do crypto.getRandomValues(b); while (b[0] >= lim);
  return b[0] % n;
}
function genPw(len, keys) {
  const sets = keys.map(k => SETS[k]); if (!sets.length) return '';
  const all = sets.join('');
  const out = sets.map(s => s[randInt(s.length)]);          // garante 1 de cada tipo
  while (out.length < len) out.push(all[randInt(all.length)]);
  for (let i = out.length - 1; i > 0; i--) { const j = randInt(i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out.join('');
}
$('pwLen').addEventListener('input', () => { $('pwLenV').textContent = $('pwLen').value; });
$('pwGen').addEventListener('click', () => {
  const keys = ['U', 'L', 'D', 'S'].filter(k => $('pw' + k).checked);
  if (!keys.length) { $('pwInfo').textContent = 'Marque ao menos um tipo.'; return; }
  const len = +$('pwLen').value, pw = genPw(len, keys);
  $('pwOut').textContent = pw;
  const pool = keys.reduce((a, k) => a + SETS[k].length, 0);
  $('pwInfo').textContent = `≈ ${Math.round(len * Math.log2(pool))} bits de entropia`;
  stats.s++; $('stS').textContent = stats.s; log('senha gerada');   // a senha nunca vai pro log
});
$('pwCopy').addEventListener('click', async () => {
  const v = $('pwOut').textContent; if (!v) return;
  try {
    await navigator.clipboard.writeText(v);
    $('pwInfo').textContent = 'Copiada. A área de transferência será limpa em 30 s.';
    setTimeout(() => navigator.clipboard.writeText('').catch(() => {}), 30000);
  } catch { $('pwInfo').textContent = 'Não foi possível copiar (exige HTTPS ou localhost).'; }
});

// ---------- Verificação de senha ----------
const COMMON = ['123456','senha','password','qwerty','abc123','111111','123123','admin','brasil','iloveyou','12345678','000000','senha123','mudar123'];
function analyze(p) {
  const tips = []; let pool = 0;
  if (/[a-z]/.test(p)) pool += 26; else tips.push('Adicione letras minúsculas.');
  if (/[A-Z]/.test(p)) pool += 26; else tips.push('Adicione letras maiúsculas.');
  if (/\d/.test(p)) pool += 10; else tips.push('Adicione números.');
  if (/[^A-Za-z0-9]/.test(p)) pool += 32; else tips.push('Adicione símbolos.');
  let bits = p.length * Math.log2(pool || 1);
  if (p.length < 12) tips.push('Use pelo menos 12 caracteres (ideal: 16+).');
  if (/(.)\1{2,}/.test(p)) { bits *= .7; tips.push('Evite caracteres repetidos em sequência.'); }
  if (/(0123|1234|2345|3456|4567|5678|6789|abcd|qwer|asdf)/i.test(p)) { bits *= .6; tips.push('Evite sequências de teclado ou números.'); }
  if (/(19|20)\d{2}/.test(p)) { bits *= .85; tips.push('Evite anos (datas são fáceis de adivinhar).'); }
  if (COMMON.some(c => p.toLowerCase().includes(c))) { bits = Math.min(bits, 15); tips.push('Contém uma senha muito comum.'); }
  return { bits: Math.round(bits), tips };
}
$('chkIn').addEventListener('input', () => {
  const p = $('chkIn').value;
  if (!p) { $('chkRes').textContent = ''; $('chkTips').replaceChildren(); $('chkBar').style.width = 0; return; }
  const { bits, tips } = analyze(p);
  const [lbl, col] = bits < 28 ? ['Muito fraca', '#e74c3c'] : bits < 45 ? ['Fraca', '#e67e22'] : bits < 60 ? ['Razoável', '#f1c40f'] : bits < 80 ? ['Forte', '#2ecc71'] : ['Muito forte', '#1abc9c'];
  $('chkBar').style.width = Math.min(100, bits) + '%'; $('chkBar').style.background = col;
  $('chkRes').textContent = `${lbl} — ≈ ${bits} bits`;
  $('chkTips').replaceChildren(...tips.map(t => el('li', t)));
});
$('chkShow').addEventListener('change', e => { $('chkIn').type = e.target.checked ? 'text' : 'password'; });

// ---------- Rastro digital ----------
$('telForm').addEventListener('submit', e => {
  e.preventDefault();
  if (!$('telOk').checked) { $('telStatus').textContent = 'Confirme que o número é seu ou que você tem autorização.'; return; }
  const digits = $('telIn').value.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 13) { $('telStatus').textContent = 'Número inválido (use DDD + número).'; return; }
  const local = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits;
  const ddd = local.slice(0, 2), num = local.slice(2);
  const fmtNum = `(${ddd}) ${num.slice(0, -4)}-${num.slice(-4)}`;
  const q = `"${fmtNum}" OR "+55${local}" OR "${local}"`;
  const links = [
    ['Google', 'https://www.google.com/search?q='],
    ['Bing', 'https://www.bing.com/search?q='],
    ['DuckDuckGo', 'https://duckduckgo.com/?q='],
    ['Brave Search', 'https://search.brave.com/search?q=']
  ];
  $('telOut').replaceChildren(...links.map(([n, base]) => {
    const li = el('li');
    li.append(el('a', `Buscar no ${n}`, { href: base + encodeURIComponent(q), target: '_blank', rel: 'noopener noreferrer' }));
    return li;
  }));
  $('telStatus').textContent = `Links prontos para ${fmtNum}.`; log('rastro: links montados');
});

// ---------- Terminal ----------
const out = $('termOut'), hist = []; let hi = 0;
const print = (t = '') => { out.append(el('div', t)); out.scrollTop = out.scrollHeight; };
const CMDS = {
  help: () => print('help, clear, date, uptime, whoami, echo <txt>, gen [tam], notas, wiki <termo>, clima <cidade>'),
  clear: () => out.replaceChildren(),
  date: () => print(new Date().toLocaleString('pt-BR')),
  uptime: () => print($('stU').textContent),
  whoami: () => print('lilith@local'),
  echo: a => print(a),
  gen: a => { const n = Math.min(128, Math.max(8, parseInt(a) || 20)); print(genPw(n, ['U', 'L', 'D', 'S'])); },
  notas: () => { const n = loadNotes(); print(n.length ? n.map((x, i) => `${i + 1}. ${x.t}`).join('\n') : 'Nenhuma nota.'); },
  wiki: async a => { if (!a) return print('uso: wiki <termo>'); print('buscando…');
    try { const r = await wiki(a); bumpQ(); print(r.slice(0, 5).map(x => '• ' + x.title).join('\n') || 'nada encontrado'); } catch (e) { print('erro: ' + e.message); } },
  clima: async a => { if (!a) return print('uso: clima <cidade>'); print('buscando…');
    try { const { p, f } = await clima(a); bumpQ(); print(`${p.name}: ${Math.round(f.current.temperature_2m)} °C, ${WMO[f.current.weather_code] ?? ''}`); } catch (e) { print('erro: ' + e.message); } }
};
$('termForm').addEventListener('submit', e => {
  e.preventDefault();
  const line = $('termIn').value.trim(); $('termIn').value = ''; if (!line) return;
  hist.push(line); hi = hist.length; print('λ ' + line);
  const [cmd, ...rest] = line.split(' ');
  const fn = Object.prototype.hasOwnProperty.call(CMDS, cmd) ? CMDS[cmd] : null;
  fn ? fn(rest.join(' ')) : print(`comando não encontrado: ${cmd}`);
});
$('termIn').addEventListener('keydown', e => {
  if (e.key === 'ArrowUp' && hi > 0) { e.preventDefault(); $('termIn').value = hist[--hi]; }
  if (e.key === 'ArrowDown') { e.preventDefault(); hi = Math.min(hist.length, hi + 1); $('termIn').value = hist[hi] ?? ''; }
});
// ---------- Chuva de código (fundo) ----------
(() => {
  const cv = $('matrix'); if (!cv || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cx = cv.getContext('2d'), chars = 'アイウエオカキクケコサシスセソ0123456789ABCDEF<>/{}[]λ', fs = 16;
  let cols = [];
  const size = () => { cv.width = innerWidth; cv.height = innerHeight; cols = Array.from({ length: Math.ceil(cv.width / fs) }, () => Math.random() * -50); };
  size(); addEventListener('resize', size);
  setInterval(() => {
    if (document.hidden) return;
    cx.fillStyle = 'rgba(2,6,4,.08)'; cx.fillRect(0, 0, cv.width, cv.height);
    cx.fillStyle = '#00ff66'; cx.font = fs + 'px monospace';
    cols.forEach((y, i) => {
      cx.fillText(chars[Math.floor(Math.random() * chars.length)], i * fs, y * fs);
      cols[i] = y * fs > cv.height && Math.random() > .975 ? 0 : y + 1;
    });
  }, 55);
})();

// ---------- Boot ----------
['[ OK ] kernel lilith carregado', '[ OK ] CSP ativa — 3 hosts autorizados', '[ OK ] gerador CSPRNG pronto', '[ OK ] armazenamento local montado']
  .forEach((m, i) => setTimeout(() => print(m), i * 180));
setTimeout(() => print('Lilith shell. Digite "help".'), 800);
log('sistema iniciado');
})();
