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
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const ensureDay = (key) => {
    if (!state.days[key]) state.days[key] = { food: [], exercise: [] };
    return state.days[key];
  };
  const saveState = () => Store.write(state);

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

  // applyTheme only does DOM/storage work — visual refresh is separate
  // so it can safely be called before charts/rings are initialized.
  const applyTheme = (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    if (themeMeta) themeMeta.setAttribute('content', theme === 'light' ? '#f6f0e2' : '#0b0a08');
    try { localStorage.setItem(THEME_KEY, theme); } catch { }
    // Sync theme seg buttons in settings (DOM queries are always safe)
    document.querySelectorAll('#themeSegSettings .seg-btn').forEach(b => {
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
  };

  const initTheme = () => {
    let saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch { }
    applyTheme(saved || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
  };
  initTheme();

  $('#themeToggle').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    applyTheme(cur === 'light' ? 'dark' : 'light');
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
    const bmr = calcBMR(p), tdee = calcTDEE(p);
    $('#greetingStats').textContent = `BMR ${fmtNum(bmr)} KCAL · TDEE ${fmtNum(tdee)} KCAL`;
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
  const renderHero = (t) => {
    $('#netCal').textContent = fmtNum(t.net);
    $('#goalCal').textContent = fmtNum(state.goals.cal);
    $('#inCal').textContent = fmtNum(t.cal);
    $('#outCal').textContent = fmtNum(t.burned);
    $('#remainCal').textContent = fmtNum(state.goals.cal - t.net);
    const pct = Math.min(100, Math.max(0, (t.net / state.goals.cal) * 100));
    $('#heroBarFill').style.width = pct + '%';
  };

  // ═══════════════════════════════════════════════════════════
  // RENDER : RINGS (theme-aware canvas)
  // ═══════════════════════════════════════════════════════════
  const ringMacroVar = { protein: '--green', carbs: '--cyan', fat: '--coral' };

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
    const stroke  = cs.getPropertyValue(ringMacroVar[macro]).trim();
    const trackColor = cs.getPropertyValue('--surface-3').trim();
    const tickMajor  = cs.getPropertyValue('--line-2').trim();
    const tickMinor  = cs.getPropertyValue('--line').trim();
    const coralColor = cs.getPropertyValue('--coral').trim();
    const cx = size / 2, cy = size / 2, r = size * 0.4;
    const startAngle = -Math.PI / 2;
    const pct = Math.max(0, Math.min(1.2, value / goal));
    const endAngle = startAngle + pct * Math.PI * 2;

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = trackColor;
    ctx.lineWidth = size * 0.07;
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
      ctx.lineWidth = size * 0.07;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.shadowBlur = 0;
      if (pct > 1) {
        const overEnd = startAngle + Math.min(pct - 1, 1) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx, cy, r + size * 0.09, startAngle, overEnd);
        ctx.strokeStyle = coralColor;
        ctx.lineWidth = 2;
        ctx.stroke();
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
        <button class="delete-btn" data-action="delete-food" data-id="${f.id}" aria-label="Delete">${trashIcon}</button>
      </li>`).join('');
    $('#foodCount').textContent = `${day.food.length} ${day.food.length === 1 ? 'ENTRY' : 'ENTRIES'}`;
  };

  const renderExerciseList = (day) => {
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
        <button class="delete-btn" data-action="delete-exercise" data-id="${e.id}" aria-label="Delete">${trashIcon}</button>
      </li>`).join('');
    $('#exerciseCount').textContent = `${day.exercise.length} ${day.exercise.length === 1 ? 'ACTIVITY' : 'ACTIVITIES'}`;
  };

  // ═══════════════════════════════════════════════════════════
  // RENDER : STREAK
  // ═══════════════════════════════════════════════════════════
  const renderStreak = () => {
    let streak = 0;
    const d = new Date();
    for (let i = 0; i < 365; i++) {
      const k = d.toISOString().slice(0, 10);
      const t = totalsFor(k);
      const within = t.cal > 0 && Math.abs(t.net - state.goals.cal) <= state.goals.cal * 0.15;
      if (i === 0 && t.cal === 0) { d.setDate(d.getDate() - 1); continue; }
      if (within) streak++; else break;
      d.setDate(d.getDate() - 1);
    }
    $('#streakCount').textContent = streak;
  };

  // ═══════════════════════════════════════════════════════════
  // RENDER : DATE NAV
  // ═══════════════════════════════════════════════════════════
  const fmtDateLabel = (key) => {
    const d = new Date(key + 'T00:00:00');
    const today = todayKey();
    const yest = new Date(); yest.setDate(yest.getDate() - 1);
    const yKey = yest.toISOString().slice(0, 10);
    if (key === today) return 'TODAY';
    if (key === yKey) return 'YESTERDAY';
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
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
  const renderAll = () => {
    $('#dateLabel').textContent = fmtDateLabel(currentDate);
    const day = state.days[currentDate] || { food: [], exercise: [] };
    const t = totalsFor(currentDate);
    renderGreeting();
    renderHero(t);
    renderRings(t);
    renderFoodList(day);
    renderExerciseList(day);
    renderWeekChart();
    renderMacroChart(t);
    renderStreak();
    $('#todayLine').textContent = `${fmtNum(t.cal)} IN · ${fmtNum(t.burned)} OUT`;
  };

  // ═══════════════════════════════════════════════════════════
  // DATE NAV EVENTS
  // ═══════════════════════════════════════════════════════════
  $('#prevDay').addEventListener('click', () => shiftDate(-1));
  $('#nextDay').addEventListener('click', () => shiftDate(1));
  $('#dateLabel').addEventListener('click', () => { currentDate = todayKey(); renderAll(); });

  // ═══════════════════════════════════════════════════════════
  // SETUP WIZARD
  // ═══════════════════════════════════════════════════════════
  const setupSteps = $$('.setup-step');
  const totalSteps = setupSteps.length;
  let setupStep = 0;
  const setupData = { name: '', gender: 'male', age: null, units: 'metric', weightKg: null, heightCm: null, activityLevel: 1.55 };

  const goSetupStep = (dir) => {
    const next = setupStep + dir;
    if (next < 0 || next >= totalSteps) return;
    setupSteps[setupStep].classList.remove('active');
    if (dir > 0) setupSteps[setupStep].classList.add('done');
    else setupSteps[setupStep].classList.remove('done');
    setupStep = next;
    setupSteps[setupStep].classList.add('active');
    setupSteps[setupStep].classList.remove('done');
    // Update progress bar
    const pct = ((setupStep + 1) / totalSteps) * 100;
    $('#setupProgressBar').style.width = pct + '%';
    $('#setupStepLabel').textContent = `STEP ${setupStep + 1} OF ${totalSteps}`;
  };

  // Segmented control delegation — single global listener so reopening
  // settings views doesn't stack duplicate listeners on each button.
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

  registerSeg('genderSeg', v => { setupData.gender = v; });
  registerSeg('unitsSeg',  v => { setupData.units = v; buildBodyFields(v); });
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
  registerSeg('themeSegSettings', v => {
    applyTheme(v);
    refreshVisuals();
  });

  // Step 3: Build body fields based on units
  const buildBodyFields = (units) => {
    const container = $('#bodyFields');
    if (units === 'metric') {
      container.innerHTML = `
        <label class="field">
          <span>WEIGHT <em>kg</em></span>
          <input type="number" id="setupWeight" step="0.1" min="20" max="300" placeholder="80" inputmode="decimal" value="${setupData.weightKg || ''}" />
        </label>
        <label class="field">
          <span>HEIGHT <em>cm</em></span>
          <input type="number" id="setupHeight" step="1" min="50" max="280" placeholder="178" inputmode="numeric" value="${setupData.heightCm || ''}" />
        </label>`;
    } else {
      let ftVal = '', inVal = '';
      if (setupData.heightCm) {
        const totalIn = setupData.heightCm / 2.54;
        ftVal = Math.floor(totalIn / 12);
        inVal = Math.round(totalIn % 12);
      }
      const lbs = setupData.weightKg ? Math.round(setupData.weightKg / 0.453592) : '';
      container.innerHTML = `
        <label class="field">
          <span>WEIGHT <em>lbs</em></span>
          <input type="number" id="setupWeight" step="1" min="44" max="660" placeholder="175" inputmode="numeric" value="${lbs}" />
        </label>
        <div class="field">
          <span>HEIGHT</span>
          <div class="imperial-height">
            <label><span>FT</span><input type="number" id="setupHeightFt" min="1" max="8" inputmode="numeric" value="${ftVal}" /></label>
            <label><span>IN</span><input type="number" id="setupHeightIn" min="0" max="11" step="0.5" inputmode="decimal" value="${inVal}" /></label>
          </div>
        </div>`;
    }
  };
  buildBodyFields('metric');

  // Activity card selection
  $$('.activity-card').forEach(card => {
    card.addEventListener('click', () => {
      $$('.activity-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      setupData.activityLevel = parseFloat(card.dataset.level);
    });
  });
  // Default selection
  $('[data-level="1.55"]').classList.add('selected');

  // Step 5: populate summary
  const showSummary = () => {
    const bmr = calcBMR(setupData);
    const tdee = calcTDEE(setupData);
    $('#summaryBMR').textContent = fmtNum(bmr);
    $('#summaryTDEE').textContent = fmtNum(tdee);
    $('#summaryCalGoal').value = tdee;
  };

  // Step 1 next
  $('#step1Next').addEventListener('click', () => {
    const name = $('#setupName').value.trim();
    if (!name) { $('#setupName').focus(); return; }
    setupData.name = name;
    goSetupStep(1);
  });

  // Step 2 next/back
  $('#step2Back').addEventListener('click', () => goSetupStep(-1));
  $('#step2Next').addEventListener('click', () => {
    const age = parseInt($('#setupAge').value, 10);
    if (!age || age < 10 || age > 120) { $('#setupAge').focus(); return; }
    setupData.age = age;
    goSetupStep(1);
  });

  // Step 3 next/back
  $('#step3Back').addEventListener('click', () => goSetupStep(-1));
  $('#step3Next').addEventListener('click', () => {
    const wEl = $('#setupWeight');
    if (!wEl || !wEl.value) { wEl && wEl.focus(); return; }
    if (setupData.units === 'metric') {
      setupData.weightKg = parseFloat(wEl.value);
      const hEl = $('#setupHeight');
      if (!hEl || !hEl.value) { hEl && hEl.focus(); return; }
      setupData.heightCm = parseFloat(hEl.value);
    } else {
      setupData.weightKg = parseFloat(wEl.value) * 0.453592;
      const ft = parseFloat($('#setupHeightFt').value) || 0;
      const inches = parseFloat($('#setupHeightIn').value) || 0;
      setupData.heightCm = ft * 30.48 + inches * 2.54;
    }
    if (setupData.weightKg < 20 || setupData.heightCm < 50) { toast('Please check your measurements'); return; }
    goSetupStep(1);
  });

  // Step 4 next/back
  $('#step4Back').addEventListener('click', () => goSetupStep(-1));
  $('#step4Next').addEventListener('click', () => {
    showSummary();
    goSetupStep(1);
  });

  // Step 5 back/finish
  $('#step5Back').addEventListener('click', () => goSetupStep(-1));
  $('#step5Finish').addEventListener('click', async () => {
    const calGoal = parseInt($('#summaryCalGoal').value, 10) || calcTDEE(setupData);
    state.profile = {
      name:          setupData.name,
      gender:        setupData.gender,
      age:           setupData.age,
      weightKg:      setupData.weightKg,
      heightCm:      setupData.heightCm,
      activityLevel: setupData.activityLevel,
      units:         setupData.units
    };
    state.goals = {
      cal:     calGoal,
      protein: Math.round((calGoal * 0.30) / 4),
      carbs:   Math.round((calGoal * 0.40) / 4),
      fat:     Math.round((calGoal * 0.30) / 9)
    };
    await saveState();
    $('#setupScreen').setAttribute('aria-hidden', 'true');
    renderAll();
    loadQuote();
    toast(`Let's go, ${state.profile.name}!`);
  });

  // ═══════════════════════════════════════════════════════════
  // SETTINGS SCREEN
  // ═══════════════════════════════════════════════════════════
  let settingsViewStack = ['settingsRoot'];

  const openSettings = () => {
    // Reset to root
    $$('.settings-view').forEach(v => {
      v.classList.remove('active', 'exit-left');
    });
    $('#settingsRoot').classList.add('active');
    settingsViewStack = ['settingsRoot'];
    populateSettingsRoot();
    $('#settingsScreen').classList.add('open');
    $('#settingsScreen').setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  };

  const closeSettings = () => {
    $('#settingsScreen').classList.remove('open');
    $('#settingsScreen').setAttribute('aria-hidden', 'true');
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
  };

  $('#goalsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    state.goals = {
      cal:     parseInt(f.cal.value, 10),
      protein: parseInt(f.protein.value, 10),
      carbs:   parseInt(f.carbs.value, 10),
      fat:     parseInt(f.fat.value, 10)
    };
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
    $$('#themeSegSettings .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.val === cur));
    const m = Store.method();
    $('#storageMethodLabel').textContent = m === 'OPFS' ? 'Origin Private File System (OPFS) — more persistent than localStorage' : 'localStorage (OPFS not supported by this browser)';
    const badge = $('#storageBadge');
    badge.textContent = m;
    badge.className = 'storage-badge' + (m === 'OPFS' ? ' badge-opfs' : '');
  };

  // (theme segmented control is registered via the global seg delegation above)

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

  // Import data
  $('#importDataBtn').addEventListener('click', () => $('#importFileInput').click());
  $('#importFileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed.goals || !parsed.days) throw new Error('Invalid format');
      Object.assign(state, defaultState(), parsed);
      await saveState();
      renderAll();
      toast('Data imported');
    } catch {
      toast('Import failed — invalid file');
    }
    e.target.value = '';
  });

  // Reset all data
  $('#resetDataBtn').addEventListener('click', () => {
    pendingDelete = async () => {
      state = defaultState();
      await saveState();
      // Show setup
      setupStep = 0;
      setupSteps.forEach(s => s.classList.remove('active', 'done'));
      setupSteps[0].classList.add('active');
      $('#setupProgressBar').style.width = '20%';
      $('#setupStepLabel').textContent = 'STEP 1 OF 5';
      $('#setupName').value = '';
      closeSettings();
      $('#setupScreen').setAttribute('aria-hidden', 'false');
    };
    $('#confirmTitle').textContent = 'Reset ALL data?';
    $('#confirmDesc').textContent = 'Profile, goals and all logs will be erased.';
    openSheet('confirmSheet');
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
    if (id === 'foodModal') {
      clearTimeout(searchTimer);
      if (searchAbort) { try { searchAbort.abort(); } catch { } }
      searchAbort = null;
      $('#foodSearch').value = '';
      $('#searchResults').innerHTML = `<div class="search-empty">Search a database of millions of foods</div>`;
    }
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

  $('#addFoodBtn').addEventListener('click', () => {
    openSheet('foodModal');
    setTimeout(() => $('#foodSearch').focus(), 200);
  });
  $('#addExerciseBtn').addEventListener('click', () => openSheet('exerciseModal'));

  // Tabs
  $$('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      $$('.tab').forEach(t => t.classList.toggle('active', t === tab));
      $$('.tab-panel').forEach(p => p.classList.toggle('hidden', p.dataset.panel !== target));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // DELETE CONFIRMATION
  // ═══════════════════════════════════════════════════════════
  let pendingDelete = null;

  const askDelete = (label, action) => {
    pendingDelete = action;
    $('#confirmTitle').textContent = `Delete "${label}"?`;
    $('#confirmDesc').textContent = 'This can\'t be undone.';
    openSheet('confirmSheet');
  };

  $('#confirmYes').addEventListener('click', async () => {
    if (typeof pendingDelete === 'function') await pendingDelete();
    pendingDelete = null;
    closeSheet('confirmSheet');
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

  // ═══════════════════════════════════════════════════════════
  // FOOD SEARCH (Open Food Facts)
  // ═══════════════════════════════════════════════════════════
  let searchAbort = null, searchTimer = null;

  const searchFoods = async (q) => {
    if (searchAbort) { try { searchAbort.abort(); } catch { } }
    searchAbort = new AbortController();
    const myCtrl = searchAbort;
    const res = $('#searchResults');
    res.innerHTML = `<div class="search-loading">Searching…</div>`;
    try {
      const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=15&fields=code,product_name,brands,nutriments,serving_size`;
      const r = await fetch(url, { signal: myCtrl.signal });
      if (myCtrl !== searchAbort) return;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const items = (data.products || []).map(parseFoodResult).filter(p => p && p.cal > 0).slice(0, 12);
      if (myCtrl !== searchAbort) return;
      if (!items.length) { res.innerHTML = `<div class="search-empty">No matches for "${escapeHtml(q)}".<br>Try the Manual tab.</div>`; return; }
      res.innerHTML = items.map((it, idx) => `
        <button class="result-item" data-idx="${idx}">
          <div>
            <div class="result-name">${escapeHtml(it.name)}</div>
            ${it.brand ? `<div class="result-brand">${escapeHtml(it.brand)}</div>` : ''}
          </div>
          <div class="result-cal">${fmtNum(it.cal)}<small>${it.servingLabel}</small></div>
        </button>`).join('');
      res.querySelectorAll('.result-item').forEach((el, i) => el.addEventListener('click', () => addFromSearch(items[i])));
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (myCtrl === searchAbort) res.innerHTML = `<div class="search-empty">Couldn't reach the database.<br>Try Manual entry.</div>`;
    }
  };

  const parseFoodResult = (p) => {
    const n = p.nutriments || {};
    const name = p.product_name;
    if (!name) return null;
    const cal100  = +n['energy-kcal_100g'] || +n['energy-kcal'] || (+n['energy_100g'] || 0) / 4.184 || 0;
    const prot100 = +n['proteins_100g']    || +n['proteins']    || 0;
    const carb100 = +n['carbohydrates_100g'] || +n['carbohydrates'] || 0;
    const fat100  = +n['fat_100g']         || +n['fat']         || 0;
    if (!cal100) return null;
    let servingG = 100, servingLabel = 'PER 100G';
    if (p.serving_size) {
      const m = String(p.serving_size).match(/([\d.]+)\s*(g|ml)/i);
      if (m) { servingG = parseFloat(m[1]); servingLabel = `PER ${m[1]}${m[2].toUpperCase()}`; }
    }
    const f = servingG / 100;
    return { name: name.trim(), brand: (p.brands || '').split(',')[0].trim(), cal: cal100 * f, protein: prot100 * f, carbs: carb100 * f, fat: fat100 * f, servingLabel };
  };

  $('#foodSearch').addEventListener('input', (e) => {
    const q = e.target.value.trim();
    clearTimeout(searchTimer);
    if (q.length < 2) { $('#searchResults').innerHTML = `<div class="search-empty">Search a database of millions of foods</div>`; return; }
    searchTimer = setTimeout(() => searchFoods(q), 320);
  });

  const addFromSearch = async (item) => {
    const day = ensureDay(currentDate);
    day.food.push({ id: uid(), name: item.name, brand: item.brand || '', qty: 1, cal: item.cal, protein: item.protein, carbs: item.carbs, fat: item.fat, ts: Date.now() });
    await saveState(); renderAll();
    closeSheet('foodModal');
    toast('Logged: ' + item.name);
  };

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
  const toast = (msg) => {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
  };

  // ═══════════════════════════════════════════════════════════
  // UTIL
  // ═══════════════════════════════════════════════════════════
  function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Resize observer for rings
  const ro = new ResizeObserver(() => renderRings(totalsFor(currentDate)));
  $$('.ring-card').forEach(el => ro.observe(el));

  setInterval(() => { if (currentDate === todayKey()) renderAll(); }, 60_000);

  // ═══════════════════════════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════════════════════════
  (async () => {
    const method = await Store.init();
    const saved = await Store.read();
    if (saved) Object.assign(state, defaultState(), saved);

    initCharts();
    // Now that charts and renderRings exist, re-apply the theme to them
    refreshVisuals();

    if (!state.profile) {
      // First launch — show setup
      $('#setupScreen').setAttribute('aria-hidden', 'false');
    } else {
      // Returning user
      renderAll();
      loadQuote();
    }

    // Update storage badge if settings gets opened
    // (populateAppView handles it on demand)
    console.log(`FUEL.GAUGE — storage: ${method}`);
  })();

})();
