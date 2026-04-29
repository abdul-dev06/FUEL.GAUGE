/* ===========================================================
   FUEL.GAUGE — app.js (phone-first, OPFS storage)
   =========================================================== */

// ── Visible error overlay (so silent failures aren't silent) ──
(() => {
  const showError = (label, msg) => {
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#ff5d5d;color:#000;padding:12px 16px;z-index:99999;font:11px/1.4 monospace;white-space:pre-wrap;border-bottom:2px solid #000;max-height:40vh;overflow:auto;';
    div.textContent = `${label}\n${msg}`;
    div.onclick = () => div.remove();
    document.body.appendChild(div);
  };
  window.addEventListener('error', e => showError('JS ERROR (tap to dismiss):', `${e.message}\nat ${e.filename || '?'}:${e.lineno || '?'}:${e.colno || '?'}`));
  window.addEventListener('unhandledrejection', e => showError('PROMISE REJECTION (tap to dismiss):', String(e.reason?.message || e.reason || e)));
})();

(() => {
  'use strict';

  // ═══════════════════════════════════════════════════════════
  // STORAGE — OPFS with localStorage fallback
  // ═══════════════════════════════════════════════════════════
  const Store = (() => {
    let _handle = null;
    let _method = 'localStorage';

    const init = async () => {
      if (navigator.storage && navigator.storage.getDirectory) {
        try {
          const root = await navigator.storage.getDirectory();
          _handle = await root.getFileHandle('fuelgauge-data.json', { create: true });
          _method = 'OPFS';
        } catch (e) { _handle = null; }
      }
      return _method;
    };

    const read = async () => {
      if (_handle) {
        try {
          const file = await _handle.getFile();
          const text = await file.text();
          return text ? JSON.parse(text) : null;
        } catch { return null; }
      }
      try {
        const raw = localStorage.getItem('fuelgauge.v1');
        return raw ? JSON.parse(raw) : null;
      } catch { return null; }
    };

    const write = async (data) => {
      if (_handle) {
        try {
          const w = await _handle.createWritable();
          await w.write(JSON.stringify(data));
          await w.close();
          return;
        } catch { /* fall through to localStorage */ }
      }
      try { localStorage.setItem('fuelgauge.v1', JSON.stringify(data)); } catch { }
    };

    const method = () => _method;
    return { init, read, write, method };
  })();

  // ═══════════════════════════════════════════════════════════
  // SYNC — JSONBin.io cloud storage
  // ═══════════════════════════════════════════════════════════
  const Sync = (() => {
    const KEY_K = 'fuelgauge.syncKey';
    const BIN_K = 'fuelgauge.syncBin';
    const BASE  = 'https://api.jsonbin.io/v3/b';

    const credentials = () => ({ key: localStorage.getItem(KEY_K), bin: localStorage.getItem(BIN_K) });
    const configure   = (key, bin) => { localStorage.setItem(KEY_K, key); localStorage.setItem(BIN_K, bin); };
    const clear       = () => { localStorage.removeItem(KEY_K); localStorage.removeItem(BIN_K); };
    const isConfigured = () => { const { key, bin } = credentials(); return !!(key && bin); };

    const pull = async () => {
      const { key, bin } = credentials();
      if (!key || !bin) return null;
      const res = await fetch(`${BASE}/${bin}/latest`, { headers: { 'X-Master-Key': key } });
      if (!res.ok) throw new Error(`JSONBin responded ${res.status}`);
      return (await res.json()).record;
    };

    const push = async (data) => {
      const { key, bin } = credentials();
      if (!key || !bin) return;
      const res = await fetch(`${BASE}/${bin}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Master-Key': key },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error(`JSONBin responded ${res.status}`);
    };

    return { configure, clear, isConfigured, pull, push, credentials };
  })();

  // ═══════════════════════════════════════════════════════════
  // DEFAULT STATE
  // ═══════════════════════════════════════════════════════════
  const defaultState = () => ({
    profile: null,           // null = setup not done
    goals: { cal: 2200, protein: 150, carbs: 250, fat: 70 },
    days: {}
  });

  let state = defaultState();
  let currentDate = todayKey();

  function todayKey() {
    return new Date().toISOString().slice(0, 10);
  }
  const yesterdayKey = () => { const d = new Date(); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };
  const isPastDay = () => currentDate < yesterdayKey();
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const ensureDay = (key) => {
    if (!state.days[key]) state.days[key] = { food: [], exercise: [] };
    return state.days[key];
  };
  let _syncTimer = null;
  const scheduleSyncPush = () => {
    if (!Sync.isConfigured()) return;
    clearTimeout(_syncTimer);
    _syncTimer = setTimeout(async () => {
      toast('Syncing...', 'loading');
      try {
        await Sync.push(state);
        toast('Synced', 'success');
      } catch {
        toast('Sync failed — check connection', 'error');
      }
    }, 1500);
  };

  const saveState = async () => {
    await Store.write(state);
    scheduleSyncPush();
  };

  // ═══════════════════════════════════════════════════════════
  // DOM HELPERS
  // ═══════════════════════════════════════════════════════════
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  // ═══════════════════════════════════════════════════════════
  // THEME (synchronous — runs before async storage load)
  // ═══════════════════════════════════════════════════════════
  const THEME_KEY = 'fuelgauge.theme';
  const themeMeta = $('meta[name="theme-color"]');
  const THEME_META_COLORS = { dark: '#131210', light: '#f6f0e2', forest: '#0a1a0d', ocean: '#060e1f', ember: '#140603', rose: '#160811' };
  const THEME_ORDER = ['dark', 'light', 'forest', 'ocean', 'ember', 'rose'];

  // applyTheme only does DOM/storage work — visual refresh is separate
  // so it can safely be called before charts/rings are initialized.
  const applyTheme = (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    if (themeMeta) themeMeta.setAttribute('content', THEME_META_COLORS[theme] || '#131210');
    try { localStorage.setItem(THEME_KEY, theme); } catch { }
    document.querySelectorAll('#themePicker .theme-pick-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.val === theme);
    });
  };

  // refreshVisuals re-themes charts and re-draws rings.
  // Safe to define here — only CALLED after charts and renderRings exist.
  const refreshVisuals = () => {
    if (typeof weekChart === 'undefined' || !weekChart) return;
    if (typeof macroChart === 'undefined' || !macroChart) return;
    applyChartTheme();
    weekChart.update();
    macroChart.update();
    renderRings(totalsFor(currentDate));
    renderSleep();
  };

  const initTheme = () => {
    let saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch { }
    applyTheme(saved || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
  };
  initTheme();

  $('#themeToggle').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const idx = THEME_ORDER.indexOf(cur);
    applyTheme(THEME_ORDER[(idx + 1) % THEME_ORDER.length]);
    refreshVisuals();
  });

  // ═══════════════════════════════════════════════════════════
  // BMR / TDEE CALCULATIONS (Mifflin-St Jeor)
  // ═══════════════════════════════════════════════════════════
  const calcBMR = (p) => {
    if (!p) return 0;
    const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
    return Math.round(p.gender === 'male' ? base + 5 : base - 161);
  };
  const calcTDEE = (p) => p ? Math.round(calcBMR(p) * p.activityLevel) : 0;

  // ═══════════════════════════════════════════════════════════
  // GREETING
  // ═══════════════════════════════════════════════════════════
  const GREETINGS = {
    morning:   ['RISE AND GRIND,', 'NEW DAY, NEW GAINS,', 'MORNING FUEL CHECK,', 'CLOCK IN,'],
    afternoon: ['STAY LOCKED IN,', 'KEEP THE MOMENTUM,', 'MIDDAY CHECK-IN,', 'HALFWAY THERE,'],
    evening:   ['FINISH STRONG,', 'GOLDEN HOUR,', 'END OF DAY PUSH,', 'CLOSE IT OUT,'],
    night:     ['NIGHT SESSION,', 'BURNING MIDNIGHT OIL,', 'LATE GRIND,', 'NIGHT OWL MODE,']
  };

  const dailySeed = () => {
    const k = todayKey().replace(/-/g, '');
    return parseInt(k) % 4;
  };

  const getGreeting = (name) => {
    const h = new Date().getHours();
    const pool =
      h >= 5  && h < 12 ? GREETINGS.morning   :
      h >= 12 && h < 17 ? GREETINGS.afternoon  :
      h >= 17 && h < 21 ? GREETINGS.evening    :
                          GREETINGS.night;
    const phrase = pool[dailySeed() % pool.length];
    return `${phrase} <span style="color:var(--amber)">${escapeHtml(name)}.</span>`;
  };

  const renderGreeting = () => {
    const p = state.profile;
    if (!p) return;
    $('#greetingText').innerHTML = getGreeting(p.name);
  };

  // ═══════════════════════════════════════════════════════════
  // TOTALS
  // ═══════════════════════════════════════════════════════════
  const totalsFor = (key) => {
    const day = state.days[key] || { food: [], exercise: [] };
    const food = day.food.reduce((acc, f) => {
      acc.cal     += (f.cal     || 0) * f.qty;
      acc.protein += (f.protein || 0) * f.qty;
      acc.carbs   += (f.carbs   || 0) * f.qty;
      acc.fat     += (f.fat     || 0) * f.qty;
      return acc;
    }, { cal: 0, protein: 0, carbs: 0, fat: 0 });
    const burned = day.exercise.reduce((acc, e) => acc + (e.cal || 0), 0);
    return { ...food, burned, net: food.cal - burned };
  };

  const fmtNum = (n) => Math.round(n).toLocaleString();

  // ═══════════════════════════════════════════════════════════
  // RENDER : HERO
  // ═══════════════════════════════════════════════════════════
  const buildCalCue = (t) => {
    const goal = state.goals.cal;
    if (!goal) return '';
    const pct      = t.net / goal;
    const protPct  = state.goals.protein > 0 ? t.protein / state.goals.protein : 1;
    const carbPct  = state.goals.carbs   > 0 ? t.carbs   / state.goals.carbs   : 1;
    const fatPct   = state.goals.fat     > 0 ? t.fat     / state.goals.fat     : 1;

    let macro = '';
    if (t.cal > 0 && protPct < 0.3) macro = ' · Protein needs attention';
    else if (fatPct > 0.9)          macro = ' · Fat is running high';
    else if (carbPct > 0.9)         macro = ' · Carbs are stacking up';
    else if (t.cal > 0 && protPct > 0.85 && pct < 0.9) macro = ' · Protein looking good';

    if (t.cal === 0)   return 'Just starting the day — log something to get going';
    if (pct < 0.15)    return 'Good start — plenty of budget left' + macro;
    if (pct < 0.35)    return 'Pacing nicely' + macro;
    if (pct < 0.50)    return 'Halfway through the budget' + macro;
    if (pct < 0.65)    return 'More than half in — plan the rest' + macro;
    if (pct < 0.80)    return 'Getting close — go lighter next meal' + macro;
    if (pct < 0.92)    return 'Almost there — watch the intake' + macro;
    if (pct < 1.08)    return 'Right at goal — well done' + macro;
    if (pct < 1.25)    return 'Slightly over budget today' + macro;
    return 'Well over budget — factor in tomorrow' + macro;
  };

  const renderHero = (t) => {
    $('#netCal').textContent = fmtNum(t.net);
    $('#goalCal').textContent = fmtNum(state.goals.cal);
    $('#inCal').textContent = fmtNum(t.cal);
    $('#outCal').textContent = fmtNum(t.burned);
    $('#remainCal').textContent = fmtNum(state.goals.cal - t.net);
    const pct = Math.min(100, Math.max(0, (t.net / state.goals.cal) * 100));
    $('#heroBarFill').style.width = pct + '%';
    $('#calCue').textContent = buildCalCue(t);
  };

  // ═══════════════════════════════════════════════════════════
  // RENDER : RINGS (theme-aware canvas)
  // ═══════════════════════════════════════════════════════════
  const ringMacroVar        = { protein: '--green', carbs: '--cyan',  fat: '--coral' };
  const ringOvershootVar    = { protein: '--amber', carbs: '--sleep', fat: '--green' };

  const drawRing = (canvas, value, goal, macro) => {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const size = Math.min(rect.width, rect.height);
    if (size === 0) return;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const cs = getComputedStyle(document.documentElement);
    const stroke       = cs.getPropertyValue(ringMacroVar[macro]).trim();
    const overColor    = cs.getPropertyValue(ringOvershootVar[macro]).trim();
    const trackColor   = cs.getPropertyValue('--surface-3').trim();
    const tickMajor    = cs.getPropertyValue('--line-2').trim();
    const tickMinor    = cs.getPropertyValue('--line').trim();
    const lineW        = size * 0.07;
    const cx = size / 2, cy = size / 2, r = size * 0.4;
    const startAngle   = -Math.PI / 2;
    const rawPct       = value / goal;
    const pct          = Math.max(0, Math.min(1, rawPct));
    const endAngle     = startAngle + pct * Math.PI * 2;

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = trackColor;
    ctx.lineWidth = lineW;
    ctx.lineCap = 'round';
    ctx.stroke();

    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
      const inner = r + size * 0.045, outer = r + size * 0.065;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
      ctx.strokeStyle = i % 5 === 0 ? tickMajor : tickMinor;
      ctx.lineWidth = i % 5 === 0 ? 1.5 : 1;
      ctx.stroke();
    }

    if (pct > 0) {
      ctx.shadowColor = stroke;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(cx, cy, r, startAngle, endAngle);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineW;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Overshoot — thin contrasting stripe within the same fill bar
      if (rawPct > 1) {
        const overPct = Math.min(1, rawPct - 1);
        ctx.beginPath();
        ctx.arc(cx, cy, r, startAngle, startAngle + overPct * Math.PI * 2);
        ctx.strokeStyle = overColor;
        ctx.lineWidth = lineW * 0.22;
        ctx.lineCap = 'round';
        ctx.shadowColor = overColor;
        ctx.shadowBlur = 8;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }
  };

  const renderRings = (t) => {
    const map = {
      protein: { value: t.protein, goal: state.goals.protein },
      carbs:   { value: t.carbs,   goal: state.goals.carbs },
      fat:     { value: t.fat,     goal: state.goals.fat }
    };
    Object.entries(map).forEach(([macro, { value, goal }]) => {
      const card = $(`.ring-card[data-macro="${macro}"]`);
      if (!card) return;
      drawRing($('.ring-canvas', card), value, goal, macro);
      $(`[data-val="${macro}"]`, card).textContent = fmtNum(value);
      $(`[data-goal="${macro}"]`, card).textContent = fmtNum(goal);
    });
  };

  // ═══════════════════════════════════════════════════════════
  // RENDER : CHARTS
  // ═══════════════════════════════════════════════════════════
  let weekChart, macroChart;

  const last7Keys = () => {
    const arr = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      arr.push(d.toISOString().slice(0, 10));
    }
    return arr;
  };

  const themeColors = () => {
    const cs = getComputedStyle(document.documentElement);
    const v = n => cs.getPropertyValue(n).trim();
    return {
      ink: v('--ink'), inkMute: v('--ink-mute'), line: v('--line'), line2: v('--line-2'),
      surface2: v('--surface-2'), bg2: v('--bg-2'),
      amber: v('--amber'), green: v('--green'), coral: v('--coral'), cyan: v('--cyan')
    };
  };

  const applyChartTheme = () => {
    const c = themeColors();
    weekChart.data.datasets[0].backgroundColor = c.green;
    weekChart.data.datasets[1].backgroundColor = c.coral;
    weekChart.data.datasets[2].borderColor = c.amber;
    weekChart.data.datasets[2].pointBackgroundColor = c.amber;
    weekChart.data.datasets[2].pointBorderColor = c.bg2;
    weekChart.data.datasets[2].backgroundColor = `color-mix(in srgb, ${c.amber} 12%, transparent)`;
    weekChart.options.scales.x.grid.color = c.line;
    weekChart.options.scales.x.ticks.color = c.inkMute;
    weekChart.options.scales.x.border.color = c.line2;
    weekChart.options.scales.y.grid.color = c.line;
    weekChart.options.scales.y.ticks.color = c.inkMute;
    [weekChart, macroChart].forEach(ch => {
      ch.options.plugins.tooltip.backgroundColor = c.surface2;
      ch.options.plugins.tooltip.borderColor = c.line2;
      ch.options.plugins.tooltip.titleColor = c.ink;
      ch.options.plugins.tooltip.bodyColor = c.inkMute;
    });
    macroChart.data.datasets[0].backgroundColor = [c.green, c.cyan, c.coral];
    macroChart.data.datasets[0].borderColor = c.bg2;
  };

  const initCharts = () => {
    const c = themeColors();
    weekChart = new Chart($('#weekChart').getContext('2d'), {
      type: 'bar',
      data: {
        labels: [],
        datasets: [
          { label: 'Intake', data: [], backgroundColor: c.green, borderRadius: 5, barPercentage: .7, categoryPercentage: .55 },
          { label: 'Burned', data: [], backgroundColor: c.coral, borderRadius: 5, barPercentage: .7, categoryPercentage: .55 },
          { label: 'Net',    data: [], type: 'line', borderColor: c.amber, backgroundColor: 'rgba(255,157,42,.12)', tension: .35, borderWidth: 2.5, pointRadius: 3, pointBackgroundColor: c.amber, pointBorderColor: c.bg2, pointBorderWidth: 1.5, fill: true, order: 0 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: c.surface2, borderColor: c.line2, borderWidth: 1, titleColor: c.ink, bodyColor: c.inkMute, titleFont: { family: 'JetBrains Mono', size: 10 }, bodyFont: { family: 'JetBrains Mono', size: 10 }, padding: 8, cornerRadius: 8, displayColors: true, boxPadding: 4, callbacks: { label: ctx => ` ${ctx.dataset.label}: ${Math.round(ctx.parsed.y)} kcal` } }
        },
        scales: {
          x: { grid: { color: c.line, drawTicks: false }, ticks: { color: c.inkMute, font: { family: 'JetBrains Mono', size: 9 }, padding: 6 }, border: { color: c.line2 } },
          y: { beginAtZero: true, grid: { color: c.line }, ticks: { color: c.inkMute, font: { family: 'JetBrains Mono', size: 9 }, padding: 4, maxTicksLimit: 5 }, border: { display: false } }
        }
      }
    });
    macroChart = new Chart($('#macroChart').getContext('2d'), {
      type: 'doughnut',
      data: { labels: ['Protein', 'Carbs', 'Fat'], datasets: [{ data: [0, 0, 0], backgroundColor: [c.green, c.cyan, c.coral], borderColor: c.bg2, borderWidth: 4, hoverOffset: 6 }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '68%',
        plugins: { legend: { display: false }, tooltip: { backgroundColor: c.surface2, borderColor: c.line2, borderWidth: 1, titleColor: c.ink, bodyColor: c.inkMute, titleFont: { family: 'JetBrains Mono', size: 10 }, bodyFont: { family: 'JetBrains Mono', size: 10 }, padding: 8, cornerRadius: 8, callbacks: { label: ctx => ` ${ctx.label}: ${Math.round(ctx.parsed)}g` } } }
      }
    });
  };

  const renderWeekChart = () => {
    const keys = last7Keys();
    const intake = [], burned = [], net = [], labels = [];
    keys.forEach(k => {
      const t = totalsFor(k);
      intake.push(Math.round(t.cal)); burned.push(Math.round(t.burned)); net.push(Math.round(t.net));
      labels.push(new Date(k + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase().slice(0, 3));
    });
    weekChart.data.labels = labels;
    weekChart.data.datasets[0].data = intake;
    weekChart.data.datasets[1].data = burned;
    weekChart.data.datasets[2].data = net;
    weekChart.update();
  };

  const renderMacroChart = (t) => {
    macroChart.data.datasets[0].data = [t.protein, t.carbs, t.fat];
    macroChart.update();
    const totalCal = t.protein * 4 + t.carbs * 4 + t.fat * 9;
    const items = [
      { label: 'PROT', val: t.protein, mult: 4, dot: 'dot-green' },
      { label: 'CARB', val: t.carbs,   mult: 4, dot: 'dot-cyan' },
      { label: 'FAT',  val: t.fat,     mult: 9, dot: 'dot-coral' }
    ];
    $('#macroLegend').innerHTML = items.map(i => {
      const pct = totalCal > 0 ? Math.round((i.val * i.mult / totalCal) * 100) : 0;
      return `<span><em class="dot ${i.dot}"></em>${i.label} <strong>${pct}%</strong></span>`;
    }).join('');
  };

  // ═══════════════════════════════════════════════════════════
  // RENDER : ENTRY LISTS
  // ═══════════════════════════════════════════════════════════
  const trashIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>`;

  const renderFoodList = (day) => {
    const pastDay = isPastDay();
    $('#foodList').innerHTML = day.food.map(f => `
      <li class="entry-row">
        <div>
          <div class="entry-name">${escapeHtml(f.name)}${f.brand ? ` <span style="color:var(--ink-mute);font-size:10px;font-family:var(--f-mono);text-transform:uppercase;letter-spacing:.05em">· ${escapeHtml(f.brand)}</span>` : ''}</div>
          <div class="entry-meta">
            <span>${f.qty}×</span>
            <span class="m-p">P${fmtNum(f.protein * f.qty)}g</span>
            <span class="m-c">C${fmtNum(f.carbs * f.qty)}g</span>
            <span class="m-f">F${fmtNum(f.fat * f.qty)}g</span>
          </div>
        </div>
        <div class="entry-cal">${fmtNum(f.cal * f.qty)}<small>KCAL</small></div>
        ${pastDay ? '' : `<button class="delete-btn" data-action="delete-food" data-id="${f.id}" aria-label="Delete">${trashIcon}</button>`}
      </li>`).join('');
    $('#foodCount').textContent = `${day.food.length} ${day.food.length === 1 ? 'ENTRY' : 'ENTRIES'}`;
  };

  const renderExerciseList = (day) => {
    const pastDay = isPastDay();
    $('#exerciseList').innerHTML = day.exercise.map(e => `
      <li class="entry-row">
        <div>
          <div class="entry-name">${escapeHtml(e.name)}</div>
          <div class="entry-meta">
            ${e.duration ? `<span>${e.duration} MIN</span>` : '<span>ACTIVITY</span>'}
            <span style="color:var(--ink-mute)">${new Date(e.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>
        <div class="entry-cal">${fmtNum(e.cal)}<small>KCAL</small></div>
        ${pastDay ? '' : `<button class="delete-btn" data-action="delete-exercise" data-id="${e.id}" aria-label="Delete">${trashIcon}</button>`}
      </li>`).join('');
    $('#exerciseCount').textContent = `${day.exercise.length} ${day.exercise.length === 1 ? 'ACTIVITY' : 'ACTIVITIES'}`;
  };

  // ═══════════════════════════════════════════════════════════
  // RENDER : STREAK
  // ═══════════════════════════════════════════════════════════
  const dayHasEntry = (key) => {
    const day = state.days[key];
    if (!day) return false;
    return (day.food?.length || 0) + (day.exercise?.length || 0) > 0;
  };

  const renderStreak = () => {
    const today = todayKey();
    const d = new Date();

    // If today has no entries yet, start counting from yesterday —
    // today is still "in progress" so it shouldn't break the streak.
    if (!dayHasEntry(today)) d.setDate(d.getDate() - 1);

    let streak = 0;
    for (let i = 0; i < 365; i++) {
      const k = d.toISOString().slice(0, 10);
      if (dayHasEntry(k)) { streak++; d.setDate(d.getDate() - 1); }
      else break;
    }

    $('#streakCount').textContent = streak;
    const chip = document.querySelector('.streak-chip');
    if (chip) chip.classList.toggle('streak-active', streak > 0);
  };

  // ═══════════════════════════════════════════════════════════
  // SLEEP — helpers, clock canvas, panel render
  // ═══════════════════════════════════════════════════════════

  // Convert "HH:MM" string ↔ minutes-from-midnight
  const timeStrToMin = (s) => {
    if (!s || !/^\d{1,2}:\d{2}$/.test(s)) return null;
    const [h, m] = s.split(':').map(Number);
    return h * 60 + m;
  };
  const minToTimeStr = (min) => {
    if (min == null) return '—';
    const h = Math.floor(min / 60) % 24;
    const m = min % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  // Compute sleep duration in minutes, handling wrap past midnight
  const sleepDuration = (bedMin, wakeMin) => {
    if (bedMin == null || wakeMin == null) return 0;
    let d = wakeMin - bedMin;
    if (d <= 0) d += 24 * 60;  // wraps past midnight
    return d;
  };

  // Format minutes as "Xh Ym"
  const fmtDuration = (min) => {
    if (!min) return '—';
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return m === 0 ? `${h}H` : `${h}H ${m}M`;
  };

  // Draw the sleep clock canvas — 24h face, arc from bedtime to wake time
  const drawSleepClock = (canvas, bedMin, wakeMin, goalHrs) => {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const size = Math.min(rect.width, rect.height);
    if (size === 0) return;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const cs = getComputedStyle(document.documentElement);
    const trackColor = cs.getPropertyValue('--surface-3').trim();
    const tickMajor  = cs.getPropertyValue('--line-2').trim();
    const tickMinor  = cs.getPropertyValue('--line').trim();
    const inkMute    = cs.getPropertyValue('--ink-mute').trim();
    const amber      = cs.getPropertyValue('--sleep').trim();
    const cyan       = cs.getPropertyValue('--cyan').trim();

    const cx = size / 2, cy = size / 2;
    const r = size * 0.4;
    const lineW = size * 0.07;

    // Background track (full circle)
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = trackColor;
    ctx.lineWidth = lineW;
    ctx.lineCap = 'round';
    ctx.stroke();

    // 24 tick marks (every hour) + larger ticks at 12/3/6/9 positions
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2 - Math.PI / 2;
      const isQuarter = (i % 6 === 0);
      const inner = r + size * 0.045;
      const outer = r + size * (isQuarter ? 0.075 : 0.06);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
      ctx.strokeStyle = isQuarter ? tickMajor : tickMinor;
      ctx.lineWidth = isQuarter ? 1.5 : 1;
      ctx.stroke();
    }

    // Hour labels at 0/6/12/18
    ctx.fillStyle = inkMute;
    ctx.font = `${size * 0.055}px JetBrains Mono, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const labelR = r + size * 0.13;
    const labels = [
      { hr: 0,  ang: -Math.PI / 2 },                  // top = 00
      { hr: 6,  ang: 0 },                              // right = 06
      { hr: 12, ang: Math.PI / 2 },                    // bottom = 12
      { hr: 18, ang: Math.PI }                         // left = 18
    ];
    labels.forEach(l => {
      ctx.fillText(String(l.hr).padStart(2, '0'),
        cx + Math.cos(l.ang) * labelR,
        cy + Math.sin(l.ang) * labelR);
    });

    // No data → just draw the empty face
    if (bedMin == null || wakeMin == null) return;

    const minToAngle = (m) => (m / (24 * 60)) * Math.PI * 2 - Math.PI / 2;
    const dur      = sleepDuration(bedMin, wakeMin) / 60;
    const deficit  = goalHrs - dur;                   // negative when over goal
    const meetsGoal = dur >= goalHrs * 0.875;         // within 12.5% of goal counts as hit
    const overshoot = dur > goalHrs * 1.15;           // >15% over goal
    const arcColor  = meetsGoal ? amber : cyan;

    // Main arc — capped at 100% so the track never overflows
    const pct      = Math.min(1, dur / goalHrs);
    const arcStart = -Math.PI / 2;
    const arcEnd   = arcStart + pct * Math.PI * 2;

    ctx.beginPath();
    ctx.arc(cx, cy, r, arcStart, arcEnd);
    ctx.strokeStyle = arcColor;
    ctx.lineWidth = lineW;
    ctx.lineCap = 'round';
    ctx.shadowColor = arcColor;
    ctx.shadowBlur = 14;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Overshoot — thin cyan stripe drawn on top of the main arc at the same radius,
    // so it appears as a line within the fill bar rather than a separate ring
    if (overshoot) {
      const overPct = Math.min(1, (dur - goalHrs) / goalHrs);
      ctx.beginPath();
      ctx.arc(cx, cy, r, arcStart, arcStart + overPct * Math.PI * 2);
      ctx.strokeStyle = cyan;
      ctx.lineWidth = lineW * 0.22;
      ctx.lineCap = 'round';
      ctx.shadowColor = cyan;
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Bedtime dot at its actual clock position
    const bedA = minToAngle(bedMin);
    ctx.beginPath();
    ctx.arc(cx + Math.cos(bedA) * r, cy + Math.sin(bedA) * r, lineW * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = arcColor;
    ctx.fill();

    // Wake dot at its actual clock position
    const wakeA = minToAngle(wakeMin);
    ctx.beginPath();
    ctx.arc(cx + Math.cos(wakeA) * r, cy + Math.sin(wakeA) * r, lineW * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = arcColor;
    ctx.fill();
  };

  const renderSleep = () => {
    const day = state.days[currentDate] || {};
    const sleep = day.sleep || null;
    const goalHrs = state.profile?.sleepGoalHours || 8;
    const canvas = $('#sleepClockCanvas');

    $('#sleepClockGoal').textContent = Number.isInteger(goalHrs) ? goalHrs : goalHrs.toFixed(1);

    if (sleep && sleep.bedtimeMin != null && sleep.wakeMin != null) {
      const dur = sleep.durationMin || sleepDuration(sleep.bedtimeMin, sleep.wakeMin);
      const hrs = dur / 60;
      $('#sleepClockHours').textContent = hrs.toFixed(1) + 'H';
      $('#sleepBedTime').textContent = minToTimeStr(sleep.bedtimeMin);
      $('#sleepWakeTime').textContent = minToTimeStr(sleep.wakeMin);
      $('#sleepEditBtnLabel').textContent = 'EDIT SLEEP';
      const status    = $('#sleepStatus');
      const meetsGoal = hrs >= goalHrs * 0.875;
      const overshoot = hrs > goalHrs * 1.15;
      let statusText, statusClass;
      if (overshoot) {
        const extra = hrs - goalHrs;
        statusText  = `${fmtDuration(dur)} · +${fmtDuration(Math.round(extra * 60))} OVER`;
        statusClass = 'card-tag tag-good';
      } else if (meetsGoal) {
        statusText  = `${fmtDuration(dur)} · GOAL HIT`;
        statusClass = 'card-tag tag-good';
      } else {
        const short = goalHrs - hrs;
        statusText  = `${fmtDuration(dur)} · −${fmtDuration(Math.round(short * 60))} SHORT`;
        statusClass = 'card-tag tag-low';
      }
      status.textContent = statusText;
      status.className   = statusClass;
      drawSleepClock(canvas, sleep.bedtimeMin, sleep.wakeMin, goalHrs);
    } else {
      $('#sleepClockHours').textContent = '—';
      $('#sleepBedTime').textContent = '—';
      $('#sleepWakeTime').textContent = '—';
      $('#sleepEditBtnLabel').textContent = 'LOG SLEEP';
      $('#sleepStatus').textContent = 'NOT LOGGED';
      $('#sleepStatus').className = 'card-tag';
      drawSleepClock(canvas, null, null, goalHrs);
    }
  };

  // ═══════════════════════════════════════════════════════════
  // RENDER : DATE NAV
  // ═══════════════════════════════════════════════════════════
  const fmtDateLabel = (key) => {
    if (key === todayKey()) return 'TODAY';
    if (key === yesterdayKey()) return 'YESTERDAY';
    return new Date(key + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
  };

  const shiftDate = (delta) => {
    const d = new Date(currentDate + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    if (d > new Date()) return;
    currentDate = d.toISOString().slice(0, 10);
    renderAll();
  };

  // ═══════════════════════════════════════════════════════════
  // RENDER ALL
  // ═══════════════════════════════════════════════════════════
  const lockIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>`;
  const plusIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`;

  const applyDayLock = () => {
    const locked = isPastDay();
    const fabMain = $('#fabMain');
    fabMain.disabled = locked;
    fabMain.innerHTML = locked ? lockIcon : plusIcon;
    fabMain.title = locked ? 'Past days are view-only' : '';
    $('#sleepEditBtn').disabled = locked;
    $('#sleepEditBtn').classList.toggle('btn-locked', locked);
    $('#dayLockRibbon').style.display = locked ? 'flex' : 'none';
  };

  const renderAll = () => {
    $('#dateLabel').textContent = fmtDateLabel(currentDate);
    const day = state.days[currentDate] || { food: [], exercise: [] };
    const t = totalsFor(currentDate);
    renderGreeting();
    renderHero(t);
    renderRings(t);
    renderSleep();
    renderFoodList(day);
    renderExerciseList(day);
    renderWeekChart();
    renderMacroChart(t);
    renderStreak();
    $('#todayLine').textContent = `${fmtNum(t.cal)} IN · ${fmtNum(t.burned)} OUT`;
    applyDayLock();
  };

  // ═══════════════════════════════════════════════════════════
  // DATE NAV EVENTS
  // ═══════════════════════════════════════════════════════════
  $('#prevDay').addEventListener('click', () => shiftDate(-1));
  $('#nextDay').addEventListener('click', () => shiftDate(1));
  $('#dateLabel').addEventListener('click', () => { currentDate = todayKey(); renderAll(); });

  // ═══════════════════════════════════════════════════════════
  // SEGMENTED CONTROLS
  // ═══════════════════════════════════════════════════════════
  const segHandlers = {};
  const registerSeg = (containerId, callback) => { segHandlers[containerId] = callback; };

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    const container = btn.closest('.seg-control');
    if (!container) return;
    container.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const cb = segHandlers[container.id];
    if (cb) cb(btn.dataset.val);
  });

  registerSeg('infoGenderSeg', v => {
    if (!state.profile) return;
    state.profile.gender = v;
    updateInfoStats();
  });
  registerSeg('infoUnitsSeg', v => {
    if (!state.profile) return;
    state.profile.units = v;
    updateInfoBodyFields(v);
  });
  document.querySelectorAll('#themePicker .theme-pick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      applyTheme(btn.dataset.val);
      refreshVisuals();
    });
  });

  // ═══════════════════════════════════════════════════════════
  // AUTH — login screen + session management
  // ═══════════════════════════════════════════════════════════
  const SESSION_KEY = 'fuelgauge.session';

  const getSession = () => {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
  };

  const applySession = (session) => {
    if (session.jsonbin_key && session.jsonbin_bin) Sync.configure(session.jsonbin_key, session.jsonbin_bin);
    if (session.groq_key) try { localStorage.setItem('fuelgauge.groq_key', session.groq_key); } catch {}
  };

  const showLoginScreen = () => {
    $('#loginScreen').setAttribute('aria-hidden', 'false');
  };

  const hideLoginScreen = () => {
    $('#loginScreen').setAttribute('aria-hidden', 'true');
  };

  const doLogout = async () => {
    try { localStorage.removeItem(SESSION_KEY); } catch {}
    try { localStorage.removeItem('fuelgauge.groq_key'); } catch {}
    Sync.clear();
    state = defaultState();
    await saveState();
    closeSettings();
    showLoginScreen();
  };

  const doLogin = async () => {
    const id  = $('#loginId').value.trim().toLowerCase();
    const pw  = $('#loginPassword').value;
    const err = $('#loginError');
    const btn = $('#loginBtn');
    if (!id || !pw) { err.textContent = 'Enter your ID and password.'; return; }
    btn.textContent = 'SIGNING IN...'; btn.disabled = true;
    err.textContent = '';
    try {
      toast('Authenticating...', 'loading');
      const res = await fetch('./users.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('Could not load user list.');
      const users = await res.json();
      const user  = users.find(u => u.id.toLowerCase() === id);
      if (!user) throw new Error('User not found.');
      if (pw !== user.password) throw new Error('Incorrect password.');
      const session = { id: user.id, jsonbin_key: user.jsonbin_key, jsonbin_bin: user.jsonbin_bin, groq_key: user.groq_key };
      try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch {}
      applySession(session);
      toast('Loading your data...', 'loading');
      try {
        const remote = await Sync.pull();
        if (remote) { Object.assign(state, defaultState(), remote); await Store.write(state); }
      } catch { toast('Starting fresh — no cloud data', 'error'); await new Promise(r => setTimeout(r, 1800)); }
      hideLoginScreen();
      renderAll();
      loadQuote();
      toast(`Welcome, ${user.id}!`, 'success');
    } catch (e) {
      clearToast();
      err.textContent = e.message;
    } finally {
      btn.textContent = 'SIGN IN'; btn.disabled = false;
    }
  };

  $('#loginBtn').addEventListener('click', doLogin);
  $('#loginId').addEventListener('keydown',       e => { if (e.key === 'Enter') $('#loginPassword').focus(); });
  $('#loginPassword').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

  // ═══════════════════════════════════════════════════════════
  // SETTINGS SCREEN
  // ═══════════════════════════════════════════════════════════
  let settingsViewStack = ['settingsRoot'];

  const openSettings = () => {
    $$('.settings-view').forEach(v => {
      v.classList.remove('active', 'exit-left');
    });
    $('#settingsRoot').classList.add('active');
    settingsViewStack = ['settingsRoot'];
    populateSettingsRoot();
    $('#settingsScreen').classList.add('open');
    $('#settingsScreen').setAttribute('aria-hidden', 'false');
    document.body.classList.add('settings-open');
    document.body.style.overflow = 'hidden';
  };

  const closeSettings = () => {
    $('#settingsScreen').classList.remove('open');
    $('#settingsScreen').setAttribute('aria-hidden', 'true');
    document.body.classList.remove('settings-open');
    document.body.style.overflow = '';
  };

  const navTo = (viewId) => {
    const current = settingsViewStack[settingsViewStack.length - 1];
    $(`.settings-view#${current}`).classList.add('exit-left');
    $(`.settings-view#${viewId}`).classList.remove('exit-left');
    $(`.settings-view#${viewId}`).classList.add('active');
    settingsViewStack.push(viewId);
    // Populate the target view
    if (viewId === 'settingsInfo') populateInfoView();
    if (viewId === 'settingsGoals') populateGoalsView();
    if (viewId === 'settingsHealth') populateHealthView();
    if (viewId === 'settingsApp') populateAppView();
  };

  const navBack = () => {
    if (settingsViewStack.length <= 1) { closeSettings(); return; }
    const current = settingsViewStack.pop();
    const prev = settingsViewStack[settingsViewStack.length - 1];
    $(`.settings-view#${current}`).classList.remove('active');
    $(`.settings-view#${prev}`).classList.remove('exit-left');
  };

  // Nav wiring
  $('#settingsClose').addEventListener('click', closeSettings);
  $$('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => navTo(btn.dataset.nav));
  });
  $$('[data-back]').forEach(btn => {
    btn.addEventListener('click', navBack);
  });
  $('#openSettings').addEventListener('click', openSettings);

  // ── Populate root ────────────────────────────────────────────
  const populateSettingsRoot = () => {
    const p = state.profile;
    if (p) {
      $('#settingsAvatar').textContent = p.name.charAt(0).toUpperCase();
      $('#settingsProfileName').textContent = p.name;
      $('#settingsProfileStats').textContent = `BMR ${fmtNum(calcBMR(p))} KCAL · TDEE ${fmtNum(calcTDEE(p))} KCAL`;
    }
  };

  // ── Populate My Info ─────────────────────────────────────────
  const populateInfoView = () => {
    const p = state.profile;
    if (!p) return;
    const f = $('#infoForm');
    f.name.value = p.name;
    f.age.value = p.age;
    f.activityLevel.value = p.activityLevel;
    const units = p.units || 'metric';
    // Sync segmented control active states (handlers already wired globally)
    $$('#infoUnitsSeg .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.val === units));
    $$('#infoGenderSeg .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.val === (p.gender || 'male')));
    updateInfoBodyFields(units);
    updateInfoStats();
  };

  const updateInfoBodyFields = (units) => {
    const p = state.profile;
    const wLabel = $('#infoWeightUnit'), hLabel = $('#infoHeightUnit');
    const wField = $('#infoForm').weight, hField = $('#infoForm').height;
    const imperialH = $('#infoHeightImperialField');
    const metricH = $('#infoHeightField');
    if (units === 'metric') {
      wLabel.textContent = 'kg';
      hLabel.textContent = 'cm';
      wField.value = p ? Math.round(p.weightKg * 10) / 10 : '';
      hField.value = p ? Math.round(p.heightCm) : '';
      metricH.classList.remove('hidden');
      imperialH.classList.add('hidden');
    } else {
      wLabel.textContent = 'lbs';
      wField.value = p ? Math.round(p.weightKg / 0.453592) : '';
      metricH.classList.add('hidden');
      imperialH.classList.remove('hidden');
      if (p && p.heightCm) {
        const totalIn = p.heightCm / 2.54;
        $('#infoForm').heightFt.value = Math.floor(totalIn / 12);
        $('#infoForm').heightIn.value = Math.round(totalIn % 12);
      }
    }
  };

  const updateInfoStats = () => {
    if (!state.profile) return;
    $('#infoBMR').textContent = fmtNum(calcBMR(state.profile));
    $('#infoTDEE').textContent = fmtNum(calcTDEE(state.profile));
  };

  // Save info
  $('#infoForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const units = $$('#infoUnitsSeg .seg-btn').find(b => b.classList.contains('active'))?.dataset.val || 'metric';
    const gender = $$('#infoGenderSeg .seg-btn').find(b => b.classList.contains('active'))?.dataset.val || 'male';
    let weightKg, heightCm;
    if (units === 'metric') {
      weightKg = parseFloat(f.weight.value);
      heightCm = parseFloat(f.height.value);
    } else {
      weightKg = parseFloat(f.weight.value) * 0.453592;
      heightCm = (parseFloat(f.heightFt.value) || 0) * 30.48 + (parseFloat(f.heightIn.value) || 0) * 2.54;
    }
    state.profile = {
      ...state.profile,
      name: f.name.value.trim(),
      gender,
      age: parseInt(f.age.value, 10),
      weightKg, heightCm,
      activityLevel: parseFloat(f.activityLevel.value),
      units
    };
    await saveState();
    populateSettingsRoot();
    renderAll();
    toast('Profile saved');
    // Offer to update calorie goal
    const newTDEE = calcTDEE(state.profile);
    if (Math.abs(newTDEE - state.goals.cal) > 50) {
      setTimeout(() => toast(`TDEE is now ${fmtNum(newTDEE)} kcal — update goal in MY GOALS`), 2400);
    }
  });

  // ── Populate My Goals ────────────────────────────────────────
  const populateGoalsView = () => {
    const f = $('#goalsForm');
    f.cal.value = state.goals.cal;
    f.protein.value = state.goals.protein;
    f.carbs.value = state.goals.carbs;
    f.fat.value = state.goals.fat;
    const tdee = state.profile ? calcTDEE(state.profile) : 0;
    $('#goalsTDEE').textContent = fmtNum(tdee);
    $('#goalsCalDisplay').textContent = fmtNum(state.goals.cal);
    // Sleep slider
    const goalSlider = $('#goalsSleepSlider');
    const sleepHrs = state.profile?.sleepGoalHours || 8;
    goalSlider.value = sleepHrs;
    updateGoalsSleepDisplay();
  };

  const updateGoalsSleepDisplay = () => {
    const slider = $('#goalsSleepSlider');
    if (!slider) return;
    const v = +slider.value;
    const min = +slider.min, max = +slider.max;
    const pct = ((v - min) / (max - min)) * 100;
    slider.style.setProperty('--fill', pct + '%');
    $('#goalsSleepVal').textContent = Number.isInteger(v) ? v : v.toFixed(2).replace(/\.?0+$/, '');
  };

  // Live update when dragging
  document.addEventListener('input', (e) => {
    if (e.target && e.target.id === 'goalsSleepSlider') updateGoalsSleepDisplay();
  });

  $('#goalsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    state.goals = {
      cal:     parseInt(f.cal.value, 10),
      protein: parseInt(f.protein.value, 10),
      carbs:   parseInt(f.carbs.value, 10),
      fat:     parseInt(f.fat.value, 10)
    };
    if (state.profile) {
      state.profile.sleepGoalHours = parseFloat($('#goalsSleepSlider').value);
    }
    await saveState();
    renderAll();
    toast('Goals saved');
  });

  $('#autoMacros').addEventListener('click', () => {
    const cal = parseInt($('#goalsForm').cal.value, 10) || state.goals.cal;
    $('#goalsForm').protein.value = Math.round((cal * 0.30) / 4);
    $('#goalsForm').carbs.value   = Math.round((cal * 0.40) / 4);
    $('#goalsForm').fat.value     = Math.round((cal * 0.30) / 9);
  });

  $('#setToTDEE').addEventListener('click', () => {
    if (!state.profile) return;
    $('#goalsForm').cal.value = calcTDEE(state.profile);
    $('#goalsCalDisplay').textContent = fmtNum(calcTDEE(state.profile));
  });

  // ── Populate App prefs ───────────────────────────────────────
  const populateAppView = () => {
    const cur = document.documentElement.getAttribute('data-theme');
    $$('#themePicker .theme-pick-btn').forEach(b => b.classList.toggle('active', b.dataset.val === cur));
    populateAccountSection();
  };

  const populateAccountSection = () => {
    const session = getSession();
    if (session) $('#accountIdLabel').textContent = session.id;
  };


  // ═══════════════════════════════════════════════════════════
  // HEALTH OVERVIEW — fully local rule-based generator
  // ═══════════════════════════════════════════════════════════

  // Build a compact, structured summary of the user's logged data
  const buildHealthDataSummary = () => {
    const profile = state.profile;
    const goals = state.goals;
    const days = Object.entries(state.days).sort(([a], [b]) => a.localeCompare(b));

    if (!days.length) return null;

    const dayStats = days.map(([date, day]) => {
      const t = totalsFor(date);
      const sleep = day.sleep
        ? { hours: +(day.sleep.durationMin / 60).toFixed(2), bedtime: minToTimeStr(day.sleep.bedtimeMin), wake: minToTimeStr(day.sleep.wakeMin), bedtimeMin: day.sleep.bedtimeMin }
        : null;
      return {
        date,
        calIn: Math.round(t.cal),
        calBurn: Math.round(t.burned),
        calNet: Math.round(t.net),
        protein: Math.round(t.protein),
        carbs: Math.round(t.carbs),
        fat: Math.round(t.fat),
        foodEntries: day.food?.length || 0,
        activities: (day.exercise || []).map(e => ({ name: e.name, kcal: e.cal, mins: e.duration || null })),
        sleep
      };
    });

    const loggedDays = dayStats.filter(d => d.calIn > 0 || d.activities.length || d.sleep);
    const sleptDays = dayStats.filter(d => d.sleep);
    const exerciseDays = dayStats.filter(d => d.activities.length > 0);
    const avg = (arr, key) => arr.length ? +(arr.reduce((s, x) => s + x[key], 0) / arr.length).toFixed(1) : 0;

    return {
      profile: {
        name: profile.name,
        bmr: calcBMR(profile),
        tdee: calcTDEE(profile),
        sleepGoalHrs: profile.sleepGoalHours || 8
      },
      goals: { ...goals },
      stats: {
        totalDaysLogged: loggedDays.length,
        daysWithSleep: sleptDays.length,
        daysWithExercise: exerciseDays.length,
        avgCalIn:    avg(loggedDays, 'calIn'),
        avgCalBurn:  avg(loggedDays, 'calBurn'),
        avgCalNet:   avg(loggedDays, 'calNet'),
        avgProtein:  avg(loggedDays, 'protein'),
        avgCarbs:    avg(loggedDays, 'carbs'),
        avgFat:      avg(loggedDays, 'fat'),
        avgSleepHrs: avg(sleptDays.map(d => d.sleep), 'hours'),
        avgBedtimeMin: sleptDays.length ? Math.round(sleptDays.reduce((s, d) => {
          // Normalize bedtimes near midnight: treat 22:00-04:00 as a continuous range
          let m = d.sleep.bedtimeMin;
          if (m < 240) m += 1440;  // 0:00-3:59 → add 24h so it averages with late-night times
          return s + m;
        }, 0) / sleptDays.length) % 1440 : null
      },
      dayStats
    };
  };

  // Pick a random element using a seeded RNG so refreshes give variety
  const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

  // Mulberry32 PRNG — deterministic from a numeric seed
  const seededRng = (seed) => {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // Insight pools — multiple phrasings per category for variety
  const PHRASINGS = {
    headlines: {
      // When user is mostly hitting goals
      strong: [
        "{name}, you're running a tight ship — keep that rhythm.",
        "{name}, the data says you're dialed in. Don't break the streak.",
        "Telemetry looks clean, {name}. The system is firing.",
        "{name}, your numbers are doing the talking — and they're loud.",
        "{name}, you're in the green across the board. Cruise altitude.",
        "Strong week of signals, {name}. The discipline shows."
      ],
      // When mixed
      mixed: [
        "{name}, some lights are green, others need attention.",
        "{name}, the data shows real effort with a couple of soft spots.",
        "Mixed signals this stretch, {name} — but the foundation is there.",
        "{name}, you're 75% there. Let's tighten up the rest.",
        "{name}, decent telemetry — a few tunable knobs are showing.",
        "{name}, your habits are forming — time to refine, not restart."
      ],
      // When struggling
      weak: [
        "{name}, the data's pointing at some friction. Let's sort it.",
        "{name}, time to recalibrate — a few systems are running rich.",
        "{name}, no shame in the gaps — they're flagged for a reason.",
        "Telemetry says you're due for a tune-up, {name}.",
        "{name}, the numbers are honest. Let's make them work for you."
      ],
      // Not enough data
      sparse: [
        "{name}, early days. Keep logging and the pattern will emerge.",
        "{name}, the picture's still developing — log a few more days.",
        "Not enough signal yet, {name}, but the dashboard's listening."
      ]
    },

    proteinStrong: [
      "Your protein game is locked in — averaging {avg}g against a {goal}g target. Muscle and recovery are getting what they need.",
      "Hitting {avg}g of protein on average ({pct}% of goal) is the kind of consistency that compounds.",
      "Protein is a non-issue for you. {avg}g daily means you're walking past the bar most other people trip over.",
      "Your protein consistency at {avg}g/day is doing the heavy lifting on body composition. Don't underestimate it."
    ],
    proteinLow: [
      "Protein's coming in light at {avg}g — about {gap}g shy of your {goal}g target. That's the gap most affecting recovery.",
      "{avg}g of protein is below your {goal}g goal. A scoop of whey or an extra egg-and-yogurt move closes most of it.",
      "Your average protein is {avg}g — the {gap}g shortfall is small individually but adds up across a week.",
      "Protein's the weakest macro here at {avg}g/day. Front-loading it at breakfast usually fixes the math fast."
    ],

    calorieOnTarget: [
      "Calorie intake is right on the money at {avg} kcal — tracking within 5% of your {goal} target.",
      "Eating {avg} kcal/day against a {goal} goal means your energy balance is exactly where it should be.",
      "Calories landing at {avg} is precision-level — the kind of consistency that produces actual results."
    ],
    calorieOver: [
      "Average intake is {avg} kcal — {over} above your {goal} goal. Small overshoot, but it adds up to about {weekly} extra per week.",
      "You're trending {over} kcal over goal each day. Not catastrophic, but worth noticing if your aim is a cut.",
      "Calorie intake's running hot at {avg} — that's {over} over your daily target. Trim the late-night logging or evening snacks first."
    ],
    calorieUnder: [
      "You're eating {under} kcal under your goal on average. If that's intentional, fine — if not, you're probably leaving energy on the table.",
      "Intake is {under} kcal short of your {goal} target. Underfueling can quietly tank workouts and sleep before it shows on the scale.",
      "Coming in {under} kcal under goal — make sure that's by design. Chronic deficits beyond ~500 kcal stop being productive."
    ],

    sleepStrong: [
      "Sleep is your superpower right now — averaging {avg}h against a {goal}h goal. Recovery is the whole game.",
      "{avg}h of sleep on {nights} nights is enviable consistency. Nervous system, hormones, hunger signals — all benefit.",
      "Sleeping {avg}h on average is the kind of base that makes everything else easier. Don't trade it for early workouts."
    ],
    sleepLow: [
      "Sleep is averaging {avg}h — {gap}h short of your {goal}h goal. That deficit shows up everywhere: hunger, motivation, recovery.",
      "Only {avg}h of sleep on average. Bumping that toward {goal}h is the single highest-leverage change in this dashboard.",
      "Sleep gap of {gap}h vs goal. Cardio at 6am isn't worth it if it costs you the {goal}h you need.",
      "{avg}h is below your target — and below what most adults function well on. This one's worth fixing first."
    ],
    sleepInconsistent: [
      "Sleep's logged on {nights} of {total} days — the inconsistency itself matters as much as the average.",
      "Tracking sleep only {nights} out of {total} days makes patterns hard to spot. Log it nightly and the data starts working harder for you."
    ],
    sleepLate: [
      "Bedtime's averaging around {time} — late nights are fine if mornings work for you, just check that {avg}h still adds up.",
      "Average bedtime: {time}. Compressing the schedule into late-night windows costs deep sleep, even at the same total hours."
    ],

    exerciseStrong: [
      "Movement on {days} of {total} days — that's the consistency stat most apps would brag about.",
      "Logging activity on {days} of {total} days is the engine making your TDEE math actually work.",
      "Exercise frequency at {days}/{total} days is in elite-amateur territory. The compounding here is real."
    ],
    exerciseLow: [
      "Activity logged on {days} of {total} days — there's room to add even a 20-minute walk and shift the trajectory.",
      "Only {days} active days out of {total}. Movement isn't just calories — it's where the metabolic and mood wins live.",
      "Exercise is light on the log: {days} of {total} days. Even one extra session a week shifts the system."
    ],

    recommendations: {
      protein: [
        "Park 30g of protein at breakfast — Greek yogurt + a hard-boiled egg, or a scoop of whey in oats — and most days take care of themselves.",
        "Try the 'protein first' rule: build every plate around the protein source, then add carbs and fat. Hits goal almost passively.",
        "Stash a 25g protein snack (jerky, cottage cheese, edamame) for the 3pm window when most days fall apart on macros."
      ],
      sleep: [
        "Set a 'phone away' alarm 45 minutes before your target bedtime — works better than telling yourself to sleep earlier.",
        "Pick one sleep variable to fix this week: bedtime, screens, or caffeine cutoff. Trying to fix all three at once usually fixes none.",
        "Even on bad nights, get up at the same time. Anchoring the wake-up does more for your rhythm than chasing a perfect bedtime.",
        "Cool the room (16-18°C / 60-65°F) — small lever, surprisingly large effect on deep sleep."
      ],
      calorieOver: [
        "If your goal is fat loss, audit one meal a day for 'invisible' calories — oils, dressings, drinks. Usually where the {over} kcal slip lives.",
        "Swap one carb-and-fat snack daily for a protein-and-fiber pairing — apple + cheese, hummus + carrots. Same volume, fewer calories.",
        "Pre-log dinner before lunch. The decision gets easier and the {over} kcal overshoot tends to disappear."
      ],
      calorieUnder: [
        "Add a 200-kcal snack between meals — nuts and fruit, a smoothie, peanut butter on toast. Closes the deficit without forcing it.",
        "If energy's flat, the under-eating is likely the cause before anything else. Start with breakfast — most under-eaters skip or skimp it."
      ],
      exercise: [
        "The lowest-friction win: a 20-minute walk after dinner. Counts as activity, helps glucose response, doubles as decompression time.",
        "Pick a non-negotiable 'minimum' — 10 minutes of anything. Beats the all-or-nothing trap that kills consistency.",
        "Pair workouts with something you already do — coffee, podcasts, a show. The habit anchors itself to the existing one."
      ],
      logging: [
        "Log breakfast within 30 minutes of eating. The 'I'll log it later' move is where most weeks unravel.",
        "Log sleep right when you wake up — even before getting out of bed. The phone's already in your hand."
      ],
      generic: [
        "The single biggest lever in this data isn't a macro or a workout — it's just keeping the streak alive. Show up tomorrow.",
        "Don't optimize what's already working. Pick the one weakest signal and put your attention there for two weeks.",
        "Boring consistency beats exciting overhauls. Your data already proves that — keep the system simple."
      ]
    },

    fun: [
      "If your average day were a vehicle, it'd be a {avg} kcal engine running at {pct}% efficiency.",
      "The math: {totalCal} kcal logged across {days} days. That's {avgWk} kcal/week — about {meals} solid meals.",
      "{streak} days of logging in a row is more than most people manage in a year. Just saying.",
      "Net average: {net} kcal/day. If kept up, that's roughly {monthlyKg} kg of body composition shift per month — depending on which direction you're pointing.",
      "Total minutes of activity logged: {mins}. That's {hrs} hours of moving on purpose — not bad."
    ]
  };

  const fillTemplate = (str, vars) =>
    str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{${k}}`));

  // Generate the overview using rule-based logic + randomized phrasings
  const generateOverview = (summary, seed) => {
    const rng = seededRng(seed);
    const { profile, goals, stats } = summary;
    const sections = { headline: '', strengths: '', gaps: '', recommendation: '', fun: '' };

    // ─── Health checks ────────────────────────────────────
    const days = stats.totalDaysLogged;

    // Sparse data path
    if (days < 3) {
      sections.headline = fillTemplate(pick(PHRASINGS.headlines.sparse, rng), { name: profile.name });
      sections.strengths = `You've logged ${days} day${days === 1 ? '' : 's'} so far — already further than most people get with tracking apps. The point of this view sharpens up quickly once you have about a week of data.`;
      sections.gaps = `Not enough data yet to flag patterns. Log food, sleep, and activity for 5+ days and this view fills in with real signal.`;
      sections.recommendation = pick(PHRASINGS.recommendations.logging, rng);
      sections.fun = `Day ${days} of the journey. Keep going.`;
      return sections;
    }

    // Compute scores and pick health state
    const proteinPct = goals.protein > 0 ? stats.avgProtein / goals.protein : 0;
    const calPct     = goals.cal > 0 ? stats.avgCalIn / goals.cal : 0;
    const sleepPct   = profile.sleepGoalHrs > 0 ? (stats.avgSleepHrs || 0) / profile.sleepGoalHrs : 0;
    const exerciseFrac = days > 0 ? stats.daysWithExercise / days : 0;
    const sleepFrac    = days > 0 ? stats.daysWithSleep    / days : 0;

    // Score each domain: 1 = great, 0 = bad, 0.5 = mid
    const scores = {
      protein:  proteinPct >= 0.9 ? 1 : (proteinPct >= 0.7 ? 0.5 : 0),
      cal:      Math.abs(calPct - 1) <= 0.05 ? 1 : (Math.abs(calPct - 1) <= 0.15 ? 0.5 : 0),
      sleep:    sleepFrac >= 0.6 && sleepPct >= 0.9 ? 1 : (sleepPct >= 0.75 ? 0.5 : 0),
      exercise: exerciseFrac >= 0.6 ? 1 : (exerciseFrac >= 0.3 ? 0.5 : 0)
    };
    const score = Object.values(scores).reduce((s, x) => s + x, 0) / 4;

    // Pick headline tone based on overall score
    const tone = score >= 0.75 ? 'strong' : (score >= 0.4 ? 'mixed' : 'weak');
    sections.headline = fillTemplate(pick(PHRASINGS.headlines[tone], rng), { name: profile.name });

    // ─── Strengths ────────────────────────────────────────
    const strengths = [];
    if (scores.protein === 1) {
      strengths.push(fillTemplate(pick(PHRASINGS.proteinStrong, rng), {
        avg: stats.avgProtein,
        goal: goals.protein,
        pct: Math.round(proteinPct * 100)
      }));
    }
    if (scores.cal === 1) {
      strengths.push(fillTemplate(pick(PHRASINGS.calorieOnTarget, rng), {
        avg: fmtNum(stats.avgCalIn),
        goal: fmtNum(goals.cal)
      }));
    }
    if (scores.sleep === 1) {
      strengths.push(fillTemplate(pick(PHRASINGS.sleepStrong, rng), {
        avg: stats.avgSleepHrs,
        goal: profile.sleepGoalHrs,
        nights: stats.daysWithSleep
      }));
    }
    if (scores.exercise === 1) {
      strengths.push(fillTemplate(pick(PHRASINGS.exerciseStrong, rng), {
        days: stats.daysWithExercise,
        total: days
      }));
    }
    sections.strengths = strengths.length
      ? strengths.join(' ')
      : `Logging ${days} days of data is itself the win. Most people quit tracking apps inside a week — you're past that bar.`;

    // ─── Gaps ─────────────────────────────────────────────
    const gaps = [];
    if (scores.protein === 0) {
      gaps.push(fillTemplate(pick(PHRASINGS.proteinLow, rng), {
        avg: stats.avgProtein,
        goal: goals.protein,
        gap: Math.max(0, goals.protein - stats.avgProtein).toFixed(0)
      }));
    }
    if (scores.cal === 0) {
      if (calPct > 1) {
        const over = Math.round(stats.avgCalIn - goals.cal);
        gaps.push(fillTemplate(pick(PHRASINGS.calorieOver, rng), {
          avg: fmtNum(stats.avgCalIn),
          goal: fmtNum(goals.cal),
          over: fmtNum(over),
          weekly: fmtNum(over * 7)
        }));
      } else {
        const under = Math.round(goals.cal - stats.avgCalIn);
        gaps.push(fillTemplate(pick(PHRASINGS.calorieUnder, rng), {
          avg: fmtNum(stats.avgCalIn),
          goal: fmtNum(goals.cal),
          under: fmtNum(under)
        }));
      }
    }
    if (scores.sleep === 0) {
      if (sleepFrac < 0.5) {
        gaps.push(fillTemplate(pick(PHRASINGS.sleepInconsistent, rng), {
          nights: stats.daysWithSleep,
          total: days
        }));
      } else {
        gaps.push(fillTemplate(pick(PHRASINGS.sleepLow, rng), {
          avg: stats.avgSleepHrs,
          goal: profile.sleepGoalHrs,
          gap: Math.max(0, profile.sleepGoalHrs - stats.avgSleepHrs).toFixed(1)
        }));
      }
    } else if (stats.avgBedtimeMin && (stats.avgBedtimeMin < 4 * 60 || (stats.avgBedtimeMin >= 23 * 60 + 30 && stats.avgBedtimeMin < 24 * 60))) {
      // Average bedtime past 23:30 or before 04:00 ⇒ flag it
      gaps.push(fillTemplate(pick(PHRASINGS.sleepLate, rng), {
        time: minToTimeStr(stats.avgBedtimeMin % 1440),
        avg: stats.avgSleepHrs
      }));
    }
    if (scores.exercise === 0) {
      gaps.push(fillTemplate(pick(PHRASINGS.exerciseLow, rng), {
        days: stats.daysWithExercise,
        total: days
      }));
    }
    sections.gaps = gaps.length
      ? gaps.join(' ')
      : `No major gaps to flag — your numbers are landing where they should. The risk now is autopilot. Keep the attention high.`;

    // ─── Recommendation ───────────────────────────────────
    // Pick the weakest area to target
    const weakest = Object.entries(scores).sort((a, b) => a[1] - b[1])[0];
    let recPool;
    if (weakest[1] === 1) {
      recPool = PHRASINGS.recommendations.generic;
    } else if (weakest[0] === 'protein') {
      recPool = PHRASINGS.recommendations.protein;
    } else if (weakest[0] === 'sleep') {
      recPool = PHRASINGS.recommendations.sleep;
    } else if (weakest[0] === 'exercise') {
      recPool = PHRASINGS.recommendations.exercise;
    } else if (weakest[0] === 'cal') {
      recPool = calPct > 1 ? PHRASINGS.recommendations.calorieOver : PHRASINGS.recommendations.calorieUnder;
    } else {
      recPool = PHRASINGS.recommendations.generic;
    }
    sections.recommendation = fillTemplate(pick(recPool, rng), {
      over: fmtNum(Math.round(stats.avgCalIn - goals.cal))
    });

    // ─── Fun fact ─────────────────────────────────────────
    const totalCal = Math.round(stats.avgCalIn * days);
    const avgWk = Math.round(stats.avgCalIn * 7);
    const meals = Math.round(totalCal / 600);
    const totalMins = summary.dayStats.reduce((s, d) => s + d.activities.reduce((a, x) => a + (x.mins || 0), 0), 0);
    const monthlyKg = Math.abs(((stats.avgCalNet - profile.tdee) * 30) / 7700).toFixed(1);
    sections.fun = fillTemplate(pick(PHRASINGS.fun, rng), {
      avg: fmtNum(stats.avgCalIn),
      pct: Math.round(calPct * 100),
      totalCal: fmtNum(totalCal),
      days,
      avgWk: fmtNum(avgWk),
      meals,
      streak: days,
      net: fmtNum(stats.avgCalNet),
      monthlyKg,
      mins: totalMins,
      hrs: Math.round(totalMins / 60)
    });

    return sections;
  };

  // Render the Health Overview view
  const populateHealthView = (forceRefresh = false) => {
    const body = $('#healthBody');
    const summary = buildHealthDataSummary();

    if (!summary || summary.stats.totalDaysLogged === 0) {
      body.innerHTML = `
        <div class="health-empty">
          <div class="health-empty-icon"><i class="fa-solid fa-utensils"></i></div>
          <h3>NOT ENOUGH DATA YET</h3>
          <p>Log a few days of food, sleep, and activity, then come back here for your personalized analysis.</p>
        </div>`;
      return;
    }

    // Seed: combination of data fingerprint + forceRefresh roll
    // Same data, no force → same output. Force refresh → re-roll.
    const baseSeed = JSON.stringify(summary.stats).split('').reduce((s, c) => ((s * 31) + c.charCodeAt(0)) | 0, 0);
    const seed = forceRefresh ? (baseSeed ^ Math.floor(Math.random() * 1e9)) : baseSeed;

    const overview = generateOverview(summary, seed);
    renderHealthOverview(body, overview, summary);
  };

  // Render the actual overview content
  const renderHealthOverview = (body, result, summary) => {
    const { stats } = summary;
    body.innerHTML = `
      <div class="health-summary-card">
        <div class="health-summary-meta">
          <span class="health-summary-meta-label"><i class="fa-solid fa-chart-line"></i>&nbsp;PATTERN ANALYSIS</span>
          <span class="health-summary-meta-time">${stats.totalDaysLogged} DAYS LOGGED</span>
        </div>

        <div class="health-stats-grid">
          <div class="health-stat-tile">
            <div class="health-stat-tile-label">DAYS LOGGED</div>
            <div class="health-stat-tile-value">${stats.totalDaysLogged}</div>
          </div>
          <div class="health-stat-tile">
            <div class="health-stat-tile-label">AVG CAL IN</div>
            <div class="health-stat-tile-value">${fmtNum(stats.avgCalIn)}</div>
            <div class="health-stat-tile-unit">vs ${fmtNum(state.goals.cal)} goal</div>
          </div>
          <div class="health-stat-tile">
            <div class="health-stat-tile-label">AVG PROTEIN</div>
            <div class="health-stat-tile-value">${fmtNum(stats.avgProtein)}<small style="font-family:var(--f-mono);font-size:10px;color:var(--ink-mute)">G</small></div>
            <div class="health-stat-tile-unit">vs ${fmtNum(state.goals.protein)}g goal</div>
          </div>
          <div class="health-stat-tile">
            <div class="health-stat-tile-label">AVG SLEEP</div>
            <div class="health-stat-tile-value">${stats.avgSleepHrs || '—'}<small style="font-family:var(--f-mono);font-size:10px;color:var(--ink-mute)">H</small></div>
            <div class="health-stat-tile-unit">${stats.daysWithSleep} of ${stats.totalDaysLogged} nights</div>
          </div>
        </div>

        <div class="health-section">
          <h3 class="health-section-title"><i class="fa-solid fa-comment-dots"></i>&nbsp;HEADLINE</h3>
          <div class="health-section-body" style="font-size:15px;color:var(--ink);line-height:1.4;font-weight:500">${escapeHtml(result.headline)}</div>
        </div>

        <div class="health-section health-section--strong">
          <h3 class="health-section-title"><i class="fa-solid fa-medal"></i>&nbsp;STRENGTHS</h3>
          <div class="health-section-body">${escapeHtml(result.strengths)}</div>
        </div>

        <div class="health-section health-section--gap">
          <h3 class="health-section-title"><i class="fa-solid fa-triangle-exclamation"></i>&nbsp;WHERE YOU'RE FALLING SHORT</h3>
          <div class="health-section-body">${escapeHtml(result.gaps)}</div>
        </div>

        <div class="health-section health-section--rec">
          <h3 class="health-section-title"><i class="fa-solid fa-lightbulb"></i>&nbsp;RECOMMENDATION</h3>
          <div class="health-section-body">${escapeHtml(result.recommendation)}</div>
        </div>

        <div class="health-section">
          <h3 class="health-section-title"><i class="fa-solid fa-circle-info"></i>&nbsp;FUN FACT</h3>
          <div class="health-section-body" style="font-style:italic;color:var(--ink-soft)">${escapeHtml(result.fun)}</div>
        </div>
      </div>

      <div class="health-refresh-row">
        <button class="ghost-btn full" id="healthRefreshBtn"><i class="fa-solid fa-shuffle"></i>&nbsp;RE-ROLL ANALYSIS</button>
      </div>`;
    $('#healthRefreshBtn').addEventListener('click', () => populateHealthView(true));
  };

  // (theme segmented control is registered via the global seg delegation above)

  // Logout
  $('#logoutBtn').addEventListener('click', () => {
    pendingDelete = doLogout;
    $('#confirmTitle').textContent = 'Sign out?';
    $('#confirmDesc').textContent  = 'You\'ll need to sign back in. Local data stays on this device.';
    $('#confirmYes').textContent   = 'SIGN OUT';
    openSheet('confirmSheet');
  });

  // Clear all days (double confirmation)
  $('#clearDaysBtn').addEventListener('click', () => {
    pendingDelete = () => {
      pendingDelete = async () => {
        state.days = {};
        await saveState();
        renderAll();
        toast('All days cleared', 'success');
      };
      $('#confirmTitle').textContent = 'Are you absolutely sure?';
      $('#confirmDesc').textContent  = 'This cannot be undone. Every logged day will be permanently deleted.';
      $('#confirmYes').textContent   = 'YES, DELETE EVERYTHING';
      openSheet('confirmSheet');
    };
    $('#confirmTitle').textContent = 'Clear all logged days?';
    $('#confirmDesc').textContent  = 'Food, exercise and sleep for every day will be deleted. Your profile and goals are kept.';
    $('#confirmYes').textContent   = 'CLEAR ALL';
    openSheet('confirmSheet');
  });

  // Export data
  $('#exportDataBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fuelgauge-backup-${todayKey()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Data exported');
  });

  // ═══════════════════════════════════════════════════════════
  // SHEETS
  // ═══════════════════════════════════════════════════════════
  const openSheet = (id) => {
    $(`#${id}`).classList.add('open');
    $(`#${id}`).setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  };
  const closeSheet = (id) => {
    $(`#${id}`).classList.remove('open');
    $(`#${id}`).setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  };

  $$('.sheet').forEach(m => {
    m.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]') || e.target.classList.contains('sheet-backdrop')) closeSheet(m.id);
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      $$('.sheet.open').forEach(m => closeSheet(m.id));
      closeSettings();
    }
  });

  // Swipe down to close sheets
  $$('.sheet-panel').forEach(panel => {
    let startY = 0, currentY = 0, dragging = false;
    panel.addEventListener('touchstart', (e) => {
      if (e.touches[0].clientY - panel.getBoundingClientRect().top > 60) return;
      startY = e.touches[0].clientY; dragging = true;
    }, { passive: true });
    panel.addEventListener('touchmove', (e) => {
      if (!dragging) return;
      currentY = e.touches[0].clientY;
      panel.style.transform = `translateY(${Math.max(0, currentY - startY)}px)`;
    }, { passive: true });
    panel.addEventListener('touchend', () => {
      if (!dragging) return;
      dragging = false; panel.style.transform = '';
      if (currentY - startY > 100) {
        const sheet = panel.closest('.sheet');
        if (sheet) closeSheet(sheet.id);
      }
    });
  });

  const fabWrap = $('#fabWrap');
  const closeFab = () => { fabWrap.classList.remove('open'); document.body.classList.remove('fab-open'); };
  const toggleFab = () => { fabWrap.classList.toggle('open'); document.body.classList.toggle('fab-open', fabWrap.classList.contains('open')); };

  $('#fabMain').addEventListener('click', (e) => { e.stopPropagation(); toggleFab(); });
  document.addEventListener('click', (e) => { if (!fabWrap.contains(e.target)) closeFab(); });

  $('#addFoodBtn').addEventListener('click', () => {
    if (isPastDay()) return;
    closeFab();
    openSheet('foodModal');
  });
  $('#addExerciseBtn').addEventListener('click', () => { if (isPastDay()) return; closeFab(); openSheet('exerciseModal'); });

  $('#goToCardioBtn').addEventListener('click', () => {
    closeSheet('exerciseModal');
    switchTab('exercises');
    // Activate the cardio segment
    activeExSeg = 'cardio';
    $$('.ex-seg').forEach(b => b.classList.toggle('active', b.dataset.seg === 'cardio'));
    $('#exStrengthList').style.display = 'none';
    $('#exCardioList').style.display   = '';
    window.scrollTo(0, 0);
  });

  // ═══════════════════════════════════════════════════════════
  // SLEEP EDIT SHEET
  // ═══════════════════════════════════════════════════════════
  const updateSleepDurationDisplay = () => {
    const bedMin = timeStrToMin($('#sleepBedInput').value);
    const wakeMin = timeStrToMin($('#sleepWakeInput').value);
    const dur = sleepDuration(bedMin, wakeMin);
    $('#sleepDurationDisplay').textContent = fmtDuration(dur);
    const goalHrs = state.profile?.sleepGoalHours || 8;
    $('#sleepDurationVs').innerHTML = `vs <span>${goalHrs}</span>h goal`;
  };

  $('#sleepEditBtn').addEventListener('click', () => {
    if (isPastDay()) return;
    const day = state.days[currentDate] || {};
    const sleep = day.sleep;
    if (sleep && sleep.bedtimeMin != null) {
      $('#sleepBedInput').value = minToTimeStr(sleep.bedtimeMin);
      $('#sleepWakeInput').value = minToTimeStr(sleep.wakeMin);
    }
    // Otherwise leave defaults (23:00 / 07:00)
    updateSleepDurationDisplay();
    openSheet('sleepSheet');
  });

  $('#sleepBedInput').addEventListener('input', updateSleepDurationDisplay);
  $('#sleepWakeInput').addEventListener('input', updateSleepDurationDisplay);

  // Preset chips
  $$('.sleep-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      $('#sleepBedInput').value = btn.dataset.bed;
      $('#sleepWakeInput').value = btn.dataset.wake;
      updateSleepDurationDisplay();
    });
  });

  $('#sleepSaveBtn').addEventListener('click', async () => {
    const bedMin = timeStrToMin($('#sleepBedInput').value);
    const wakeMin = timeStrToMin($('#sleepWakeInput').value);
    if (bedMin == null || wakeMin == null) { toast('Invalid times'); return; }
    const day = ensureDay(currentDate);
    day.sleep = {
      bedtimeMin: bedMin,
      wakeMin: wakeMin,
      durationMin: sleepDuration(bedMin, wakeMin)
    };
    await saveState();
    renderSleep();
    closeSheet('sleepSheet');
    toast('Sleep logged');
  });

  $('#sleepClearBtn').addEventListener('click', async () => {
    const day = state.days[currentDate];
    if (day && day.sleep) {
      delete day.sleep;
      await saveState();
      renderSleep();
    }
    closeSheet('sleepSheet');
    toast('Sleep cleared');
  });


  // ═══════════════════════════════════════════════════════════
  // DELETE CONFIRMATION
  // ═══════════════════════════════════════════════════════════
  let pendingDelete = null;

  const askDelete = (label, action) => {
    pendingDelete = action;
    $('#confirmTitle').textContent = `Delete "${label}"?`;
    $('#confirmDesc').textContent = 'This can\'t be undone.';
    $('#confirmYes').textContent = 'DELETE';
    openSheet('confirmSheet');
  };

  $('#confirmYes').addEventListener('click', async () => {
    const fn = pendingDelete;
    pendingDelete = null;
    closeSheet('confirmSheet');
    if (typeof fn === 'function') await fn();
  });
  $('#confirmSheet').addEventListener('click', (e) => {
    if (e.target.closest('[data-close]') || e.target.classList.contains('sheet-backdrop')) pendingDelete = null;
  });

  $('#foodList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="delete-food"]');
    if (!btn) return;
    const item = (state.days[currentDate]?.food || []).find(f => f.id === btn.dataset.id);
    if (!item) return;
    askDelete(item.name, async () => {
      const day = ensureDay(currentDate);
      day.food = day.food.filter(f => f.id !== btn.dataset.id);
      await saveState(); renderAll(); toast('Food entry removed');
    });
  });

  $('#exerciseList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="delete-exercise"]');
    if (!btn) return;
    const item = (state.days[currentDate]?.exercise || []).find(x => x.id === btn.dataset.id);
    if (!item) return;
    askDelete(item.name, async () => {
      const day = ensureDay(currentDate);
      day.exercise = day.exercise.filter(x => x.id !== btn.dataset.id);
      await saveState(); renderAll(); toast('Activity removed');
    });
  });

  // Manual food form
  $('#manualFoodForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const day = ensureDay(currentDate);
    day.food.push({ id: uid(), name: f.name.value.trim(), qty: parseFloat(f.qty.value) || 1, cal: parseFloat(f.cal.value) || 0, protein: parseFloat(f.protein.value) || 0, carbs: parseFloat(f.carbs.value) || 0, fat: parseFloat(f.fat.value) || 0, ts: Date.now() });
    await saveState(); renderAll();
    f.reset(); f.qty.value = 1;
    closeSheet('foodModal');
    toast('Food logged');
  });

  // Exercise form
  $('#exerciseForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const day = ensureDay(currentDate);
    day.exercise.push({ id: uid(), name: f.name.value.trim(), cal: parseInt(f.cal.value, 10) || 0, duration: parseInt(f.duration.value, 10) || null, ts: Date.now() });
    await saveState(); renderAll();
    f.reset();
    closeSheet('exerciseModal');
    toast('Activity logged');
  });

  $('#quickActivities').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-name]');
    if (!btn) return;
    $('#exerciseForm').name.value = btn.dataset.name;
    const calField = $('#exerciseForm').cal;
    const dur = $('#exerciseForm').duration;
    if (!calField.value) calField.value = Math.round(parseFloat(btn.dataset.rate) * (parseFloat(dur.value) || 30));
    if (!dur.value) dur.value = 30;
  });

  // ═══════════════════════════════════════════════════════════
  // QUOTE
  // ═══════════════════════════════════════════════════════════
  const fallbackQuotes = [
    { q: "What gets measured gets managed.", a: "Peter Drucker" },
    { q: "Discipline is choosing between what you want now and what you want most.", a: "Abraham Lincoln" },
    { q: "Strength does not come from winning. Your struggles develop your strengths.", a: "Arnold Schwarzenegger" },
    { q: "The body achieves what the mind believes.", a: "Napoleon Hill" },
    { q: "Take care of your body. It's the only place you have to live.", a: "Jim Rohn" },
    { q: "Small daily improvements over time lead to stunning results.", a: "Robin Sharma" },
    { q: "Energy and persistence conquer all things.", a: "Benjamin Franklin" }
  ];
  const loadQuote = async () => {
    try {
      const r = await fetch('https://api.quotable.io/random?tags=inspirational|wisdom|fitness', { signal: AbortSignal.timeout(3500) });
      if (!r.ok) throw 0;
      const d = await r.json();
      if (d?.content) { $('#quoteText').textContent = '"' + d.content + '"'; $('#quoteAuthor').textContent = d.author || '—'; return; }
    } catch { }
    const f = fallbackQuotes[Math.floor(Math.random() * fallbackQuotes.length)];
    $('#quoteText').textContent = '"' + f.q + '"';
    $('#quoteAuthor').textContent = f.a;
  };

  // ═══════════════════════════════════════════════════════════
  // TOAST
  // ═══════════════════════════════════════════════════════════
  let toastTimer;
  const toast = (msg, type = 'info') => {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show' + (type !== 'info' ? ` toast--${type}` : '');
    clearTimeout(toastTimer);
    if (type !== 'loading') {
      toastTimer = setTimeout(() => t.classList.remove('show'), type === 'error' ? 3500 : 2400);
    }
  };
  const clearToast = () => { clearTimeout(toastTimer); $('#toast').classList.remove('show'); };

  // ═══════════════════════════════════════════════════════════
  // UTIL
  // ═══════════════════════════════════════════════════════════
  function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Resize observer for rings
  const ro = new ResizeObserver(() => { renderRings(totalsFor(currentDate)); renderSleep(); });
  $$('.ring-card, .sleep-clock-wrap').forEach(el => ro.observe(el));

  setInterval(() => { if (currentDate === todayKey()) renderAll(); }, 60_000);

  // ═══════════════════════════════════════════════════════════
  // EXERCISES TAB
  // ═══════════════════════════════════════════════════════════

  // Cal/min from MET + stored body weight
  const calcCalPerMin = (met) => {
    const wkg = state.profile?.weightKg || 70;
    return (met * wkg * 3.5) / 200;
  };

  let currentExDetail = null;  // exercise or cardio activity currently shown
  let activeExSeg = 'strength'; // which segment is active in exercises tab

  // Show/hide the list panels (respects active segment)
  const showExList = () => {
    $('#exSegmentBar').style.display       = '';
    $('#exStrengthList').style.display     = activeExSeg === 'strength' ? '' : 'none';
    $('#exCardioList').style.display       = activeExSeg === 'cardio'   ? '' : 'none';
    $('#exStrengthDetail').style.display   = 'none';
  };

  // Switch between Home and Exercises tabs
  const switchTab = (tab) => {
    closeSettings();
    $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    $('#homeView').hidden           = tab !== 'home';
    $('#exercisesView').hidden      = tab !== 'exercises';
    $('#coachView').style.display   = tab === 'coach' ? 'flex' : 'none';
    $('#dateNav').style.display = tab === 'home' ? '' : 'none';
    document.querySelector('.bottom-bar').style.display = tab === 'home' ? '' : 'none';
    if (tab === 'exercises') showExList();
    if (tab === 'coach' && window.GeminiCoach) window.GeminiCoach.onTabOpen();
  };

  $$('.nav-btn').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

  // Open strength exercise as full-page view within exercises tab
  const openStrengthDetail = (ex, groupName) => {
    currentExDetail = { ...ex, type: 'strength' };
    $('#exDetailNavGroup').textContent      = groupName;
    $('#exDetailFullName').textContent      = ex.name;
    $('#exDetailFullChips').innerHTML       = ex.muscles.map(m => `<span class="ex-detail-chip">${escapeHtml(m)}</span>`).join('');
    $('#exDetailFullOverview').textContent  = ex.overview;
    $('#exDetailFullMistakes').innerHTML    = ex.mistakes.map(m => `<li class="ex-detail-mistake">${escapeHtml(m)}</li>`).join('');
    $('#exSegmentBar').style.display        = 'none';
    $('#exStrengthList').style.display      = 'none';
    $('#exCardioList').style.display        = 'none';
    $('#exStrengthDetail').style.display    = '';
    window.scrollTo(0, 0);
  };

  $('#exDetailBackBtn').addEventListener('click', showExList);

  // Open cardio activity as bottom sheet (log action)
  const openExDetail = (item, type) => {
    currentExDetail = { ...item, type };
    $('#exDetailName').textContent = item.name;
    $('#exDetailSubtitle').textContent = item.desc;
    const cpm = calcCalPerMin(item.met);
    $('#exCalPerMin').textContent = cpm.toFixed(1);
    $('#exCalNote').textContent   = `based on your ${Math.round(state.profile?.weightKg || 70)} kg`;
    // Strength-specific sections never shown for cardio sheet
    $('#exDetailChipsSec').hidden    = true;
    $('#exDetailOverviewSec').hidden  = true;
    $('#exDetailMistakesSec').hidden  = true;
    $('#exLogDuration').value = '';
    $('#exLogCals').value     = '';
    openSheet('exDetailSheet');
  };

  // Auto-compute calories when duration changes
  $('#exLogDuration').addEventListener('input', () => {
    if (!currentExDetail) return;
    const mins = parseFloat($('#exLogDuration').value);
    if (isFinite(mins) && mins > 0)
      $('#exLogCals').value = Math.round(calcCalPerMin(currentExDetail.met) * mins);
  });

  // Log the activity
  $('#exLogBtn').addEventListener('click', async () => {
    if (!currentExDetail) return;
    const cal = parseInt($('#exLogCals').value, 10);
    const dur = parseInt($('#exLogDuration').value, 10) || null;
    if (!cal || cal < 1) { toast('Enter a duration or calories'); return; }
    const day = ensureDay(currentDate);
    day.exercise.push({ id: uid(), name: currentExDetail.name, cal, duration: dur, ts: Date.now() });
    await saveState(); renderAll();
    closeSheet('exDetailSheet');
    toast('Activity logged');
  });

  // Build strength accordion
  const renderStrengthList = () => {
    const container = $('#exStrengthList');
    container.innerHTML = EXERCISE_DATA.strength.map(group => `
      <div class="ex-group">
        <button class="ex-group-header" type="button">
          <span>${escapeHtml(group.group.toUpperCase())}</span>
          <svg class="ex-group-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <div class="ex-group-body">
          ${group.exercises.map(ex => `
            <button class="ex-item" type="button" data-exid="${escapeHtml(ex.id)}">
              <span class="ex-item-name">${escapeHtml(ex.name)}</span>
              <svg class="ex-item-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>
            </button>
          `).join('')}
        </div>
      </div>
    `).join('');

    // Accordion toggle — open one, close all others
    $$('.ex-group-header', container).forEach(btn => {
      btn.addEventListener('click', () => {
        const group = btn.closest('.ex-group');
        const isOpen = group.classList.contains('open');
        $$('.ex-group', container).forEach(g => g.classList.remove('open'));
        if (!isOpen) group.classList.add('open');
      });
    });

    // Exercise item → full-page detail
    $$('.ex-item', container).forEach(btn => {
      btn.addEventListener('click', () => {
        const group = EXERCISE_DATA.strength.find(g => g.exercises.some(e => e.id === btn.dataset.exid));
        const ex    = group?.exercises.find(e => e.id === btn.dataset.exid);
        if (ex) openStrengthDetail(ex, group.group);
      });
    });
  };

  // Build cardio machine list — same accordion pattern as strength
  const renderCardioList = () => {
    const container = $('#exCardioList');
    container.innerHTML = `
      <div class="cardio-estimate-notice">
        <i class="fa-solid fa-triangle-exclamation"></i>
        Cal/min values are MET-based estimates. Actual burn varies with fitness level, intensity, and equipment. Always cross-check with your device or a trusted source.
      </div>
    ` + EXERCISE_DATA.cardio.map(machine => `
      <div class="ex-group">
        <button class="ex-group-header" type="button">
          <span>${escapeHtml(machine.machine.toUpperCase())}</span>
          <svg class="ex-group-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <div class="ex-group-body">
          ${machine.activities.map(act => `
            <button class="ex-cardio-item" type="button" data-actid="${escapeHtml(act.id)}">
              <span class="ex-cardio-name">${escapeHtml(act.name)}</span>
              <span class="ex-cardio-cal" id="calBadge_${escapeHtml(act.id)}">— cal/min</span>
              <svg class="ex-cardio-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>
            </button>
          `).join('')}
        </div>
      </div>
    `).join('');

    // Populate cal/min badges with user-specific values
    EXERCISE_DATA.cardio.forEach(machine =>
      machine.activities.forEach(act => {
        const badge = $(`#calBadge_${act.id}`, container);
        if (badge) badge.textContent = `${calcCalPerMin(act.met).toFixed(1)} cal/min`;
      })
    );

    // Accordion toggle — open one, close all others
    $$('.ex-group-header', container).forEach(btn => {
      btn.addEventListener('click', () => {
        const group = btn.closest('.ex-group');
        const isOpen = group.classList.contains('open');
        $$('.ex-group', container).forEach(g => g.classList.remove('open'));
        if (!isOpen) group.classList.add('open');
      });
    });

    // Activity item → detail sheet
    $$('.ex-cardio-item', container).forEach(btn => {
      btn.addEventListener('click', () => {
        const act = EXERCISE_DATA.cardio.flatMap(m => m.activities).find(a => a.id === btn.dataset.actid);
        if (act) openExDetail(act, 'cardio');
      });
    });
  };

  // Segment toggle (STRENGTH / CARDIO)
  $$('.ex-seg').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.ex-seg').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeExSeg = btn.dataset.seg;
      $('#exStrengthList').style.display = activeExSeg === 'strength' ? '' : 'none';
      $('#exCardioList').style.display   = activeExSeg === 'cardio'   ? '' : 'none';
    });
  });

  // Render both lists (called after state loads so cal/min is accurate)
  const initExercisesView = () => {
    renderStrengthList();
    renderCardioList();
    // Initial visibility: strength shown, cardio hidden
    $('#exStrengthList').style.display = '';
    $('#exCardioList').style.display   = 'none';
  };

  // ═══════════════════════════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════════════════════════
  (async () => {
    // Clean up any legacy AI artifacts from prior versions
    try {
      localStorage.removeItem('fuelgauge.aiKey');
      localStorage.removeItem('fuelgauge.aiCache');
    } catch {}

    const method = await Store.init();
    const local  = await Store.read();
    let saved = local;

    // Pull from JSONBin — merge with local so data never regresses
    const session = getSession();

    if (session) {
      applySession(session);
      toast('Fetching data...', 'loading');
      try {
        const remote = await Sync.pull();
        if (remote) {
          // Merge: remote wins for profile/goals (explicitly saved there).
          // For days: union all dates; per-day prefer the source with more entries,
          // and always keep local sleep if remote doesn't have it yet (push may be in-flight).
          const merged = { ...remote, days: { ...(remote.days || {}) } };
          for (const [date, localDay] of Object.entries(local?.days || {})) {
            if (!merged.days[date]) {
              merged.days[date] = localDay;
            } else {
              const r = merged.days[date];
              const l = localDay;
              merged.days[date] = {
                food:     (r.food?.length || 0) >= (l.food?.length || 0)     ? (r.food     || []) : (l.food     || []),
                exercise: (r.exercise?.length || 0) >= (l.exercise?.length || 0) ? (r.exercise || []) : (l.exercise || []),
              };
              const sleep = r.sleep ?? l.sleep;
              if (sleep) merged.days[date].sleep = sleep;
            }
          }
          saved = merged;
          await Store.write(saved);
          toast('Up to date', 'success');
        } else { clearToast(); }
      } catch { toast('Offline — using local data', 'error'); }
    }

    if (saved) Object.assign(state, defaultState(), saved);

    initCharts();
    refreshVisuals();

    if (!session) {
      showLoginScreen();
    } else {
      renderAll();
      loadQuote();
    }

    initExercisesView();
    switchTab('home');

    console.log(`FUEL.GAUGE — storage: ${method} | auth: ${session ? session.id : 'none'}`);
  })();

  // ── Public bridge for coach.js ────────────────────────────
  window.FuelGauge = {
    getState:       () => state,
    getCurrentDate: () => currentDate,
    getTotals:      (date) => totalsFor(date),
    minToTimeStr:   (min) => {
      if (min == null) return null;
      const h = Math.floor(((min % 1440) + 1440) % 1440 / 60);
      const m = ((min % 1440) + 1440) % 1440 % 60;
      return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    },
    askConfirm: (title, desc, action, btnLabel = 'CONFIRM') => {
      pendingDelete = action;
      $('#confirmTitle').textContent = title;
      $('#confirmDesc').textContent  = desc;
      $('#confirmYes').textContent   = btnLabel;
      openSheet('confirmSheet');
    }
  };

})();
