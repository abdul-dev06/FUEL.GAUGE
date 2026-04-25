/* ===========================================================
   FUEL.GAUGE — fitness telemetry app (phone-first)
   Vanilla JS, localStorage persistence, Chart.js for graphs.
   =========================================================== */

(() => {
  'use strict';

  // ============== STATE ==============
  const STORAGE_KEY = 'fuelgauge.v1';
  const todayKey = () => new Date().toISOString().slice(0, 10);

  const defaultState = () => ({
    goals: { cal: 2200, protein: 150, carbs: 250, fat: 70 },
    days: {}
  });

  const loadState = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return {
        ...defaultState(),
        ...parsed,
        goals: { ...defaultState().goals, ...(parsed.goals || {}) }
      };
    } catch (e) {
      console.warn('State load failed, resetting.', e);
      return defaultState();
    }
  };

  const saveState = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { console.warn('Could not save state', e); }
  };

  const ensureDay = (key) => {
    if (!state.days[key]) state.days[key] = { food: [], exercise: [] };
    return state.days[key];
  };

  const state = loadState();
  let currentDate = todayKey();
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  // ============== DOM HELPERS ==============
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  // ============== DATE NAV ==============
  const fmtDateLabel = (key) => {
    const d = new Date(key + 'T00:00:00');
    const today = todayKey();
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const yKey = yesterday.toISOString().slice(0, 10);
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

  $('#prevDay').addEventListener('click', () => shiftDate(-1));
  $('#nextDay').addEventListener('click', () => shiftDate(1));
  $('#dateLabel').addEventListener('click', () => {
    currentDate = todayKey();
    renderAll();
  });

  // ============== TOTALS ==============
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
    return {
      ...food,
      burned,
      net: food.cal - burned,
      foodCount: day.food.length,
      exerciseCount: day.exercise.length
    };
  };

  // ============== RENDER : HERO ==============
  const fmtNum = (n) => Math.round(n).toLocaleString();

  const renderHero = (t) => {
    $('#netCal').textContent = fmtNum(t.net);
    $('#goalCal').textContent = fmtNum(state.goals.cal);
    $('#inCal').textContent = fmtNum(t.cal);
    $('#outCal').textContent = fmtNum(t.burned);
    $('#remainCal').textContent = fmtNum(state.goals.cal - t.net);
    const pct = Math.min(100, Math.max(0, (t.net / state.goals.cal) * 100));
    $('#heroBarFill').style.width = pct + '%';
  };

  // ============== RENDER : RINGS ==============
  const ringMacroVar = {
    protein: '--green',
    carbs:   '--cyan',
    fat:     '--coral'
  };
  const ringStyleFor = (macro) => {
    const cs = getComputedStyle(document.documentElement);
    const stroke = cs.getPropertyValue(ringMacroVar[macro]).trim();
    const trackColor = cs.getPropertyValue('--surface-3').trim();
    const tickMajor = cs.getPropertyValue('--line-2').trim();
    const tickMinor = cs.getPropertyValue('--line').trim();
    return { stroke, trackColor, tickMajor, tickMinor, glow: stroke };
  };

  const drawRing = (canvas, value, goal, macro) => {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const size = Math.min(rect.width, rect.height);
    if (size === 0) return;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const cx = size / 2, cy = size / 2;
    const r = size * 0.4;
    const startAngle = -Math.PI / 2;
    const pct = Math.max(0, Math.min(1.2, value / goal));
    const endAngle = startAngle + pct * Math.PI * 2;
    const c = ringStyleFor(macro);

    // Track
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = c.trackColor;
    ctx.lineWidth = size * 0.07;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Tick marks
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
      const inner = r + size * 0.045;
      const outer = r + size * 0.065;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
      ctx.strokeStyle = i % 5 === 0 ? c.tickMajor : c.tickMinor;
      ctx.lineWidth = i % 5 === 0 ? 1.5 : 1;
      ctx.stroke();
    }

    // Progress arc
    if (pct > 0) {
      ctx.shadowColor = c.glow;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(cx, cy, r, startAngle, endAngle);
      ctx.strokeStyle = c.stroke;
      ctx.lineWidth = size * 0.07;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Overshoot indicator
      if (pct > 1) {
        const overEnd = startAngle + Math.min(pct - 1, 1) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx, cy, r + size * 0.09, startAngle, overEnd);
        const cs2 = getComputedStyle(document.documentElement);
        ctx.strokeStyle = cs2.getPropertyValue('--coral').trim();
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
      const canvas = $('.ring-canvas', card);
      drawRing(canvas, value, goal, macro);
      $(`[data-val="${macro}"]`, card).textContent = fmtNum(value);
      $(`[data-goal="${macro}"]`, card).textContent = fmtNum(goal);
    });
  };

  // ============== RENDER : CHARTS ==============
  let weekChart, macroChart;

  const last7Keys = () => {
    const arr = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      arr.push(d.toISOString().slice(0, 10));
    }
    return arr;
  };

  const initWeekChart = () => {
    const ctx = $('#weekChart').getContext('2d');
    weekChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: [],
        datasets: [
          { label: 'Intake',  data: [], backgroundColor: '#b6ff3c', borderRadius: 5, barPercentage: .7, categoryPercentage: .55 },
          { label: 'Burned',  data: [], backgroundColor: '#ff5d5d', borderRadius: 5, barPercentage: .7, categoryPercentage: .55 },
          { label: 'Net',     data: [], type: 'line', borderColor: '#ff9d2a', backgroundColor: 'rgba(255,157,42,.12)',
            tension: .35, borderWidth: 2.5, pointRadius: 3, pointBackgroundColor: '#ff9d2a',
            pointBorderColor: '#1a0c00', pointBorderWidth: 1.5, fill: true, order: 0 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1c1814', borderColor: '#38302a', borderWidth: 1,
            titleColor: '#f4ecd8', bodyColor: '#c9bfa9',
            titleFont: { family: 'JetBrains Mono', size: 10 },
            bodyFont:  { family: 'JetBrains Mono', size: 10 },
            padding: 8, cornerRadius: 8, displayColors: true, boxPadding: 4,
            callbacks: { label: (c) => ` ${c.dataset.label}: ${Math.round(c.parsed.y)} kcal` }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(56,48,42,.4)', drawTicks: false },
            ticks: { color: '#837868', font: { family: 'JetBrains Mono', size: 9 }, padding: 6 },
            border: { color: '#38302a' }
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(56,48,42,.3)' },
            ticks: { color: '#837868', font: { family: 'JetBrains Mono', size: 9 }, padding: 4, maxTicksLimit: 5 },
            border: { display: false }
          }
        }
      }
    });
  };

  const renderWeekChart = () => {
    const keys = last7Keys();
    const intake = [], burned = [], net = [], labels = [];
    keys.forEach(k => {
      const t = totalsFor(k);
      intake.push(Math.round(t.cal));
      burned.push(Math.round(t.burned));
      net.push(Math.round(t.net));
      const d = new Date(k + 'T00:00:00');
      labels.push(d.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase().slice(0, 3));
    });
    weekChart.data.labels = labels;
    weekChart.data.datasets[0].data = intake;
    weekChart.data.datasets[1].data = burned;
    weekChart.data.datasets[2].data = net;
    weekChart.update();
  };

  const initMacroChart = () => {
    const ctx = $('#macroChart').getContext('2d');
    macroChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Protein', 'Carbs', 'Fat'],
        datasets: [{
          data: [0, 0, 0],
          backgroundColor: ['#b6ff3c', '#4ad9ff', '#ff5d5d'],
          borderColor: '#100e0b',
          borderWidth: 4,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1c1814', borderColor: '#38302a', borderWidth: 1,
            titleColor: '#f4ecd8', bodyColor: '#c9bfa9',
            titleFont: { family: 'JetBrains Mono', size: 10 },
            bodyFont:  { family: 'JetBrains Mono', size: 10 },
            padding: 8, cornerRadius: 8,
            callbacks: { label: (c) => ` ${c.label}: ${Math.round(c.parsed)}g (${Math.round(c.parsed * (c.label === 'Fat' ? 9 : 4))} kcal)` }
          }
        }
      }
    });
  };

  const renderMacroChart = (t) => {
    macroChart.data.datasets[0].data = [t.protein, t.carbs, t.fat];
    macroChart.update();

    const legend = $('#macroLegend');
    const totalCal = t.protein * 4 + t.carbs * 4 + t.fat * 9;
    const items = [
      { label: 'PROT',  val: t.protein, mult: 4, dot: 'dot-green' },
      { label: 'CARB', val: t.carbs,   mult: 4, dot: 'dot-cyan' },
      { label: 'FAT',  val: t.fat,     mult: 9, dot: 'dot-coral' }
    ];
    legend.innerHTML = items.map(i => {
      const pct = totalCal > 0 ? Math.round((i.val * i.mult / totalCal) * 100) : 0;
      return `<span><em class="dot ${i.dot}"></em>${i.label} <strong>${pct}%</strong></span>`;
    }).join('');
  };

  // ============== RENDER : LISTS ==============
  const trashIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>`;

  const renderFoodList = (day) => {
    const list = $('#foodList');
    list.innerHTML = day.food.map(f => `
      <li class="entry-row" data-id="${f.id}">
        <div>
          <div class="entry-name">${escapeHtml(f.name)}${f.brand ? ` <span style="color:var(--ink-mute);font-size:10px;font-family:var(--f-mono);text-transform:uppercase;letter-spacing:.05em">· ${escapeHtml(f.brand)}</span>` : ''}</div>
          <div class="entry-meta">
            <span>${f.qty}×</span>
            <span class="m-p">P${fmtNum(f.protein * f.qty)}</span>
            <span class="m-c">C${fmtNum(f.carbs * f.qty)}</span>
            <span class="m-f">F${fmtNum(f.fat * f.qty)}</span>
          </div>
        </div>
        <div class="entry-cal">${fmtNum(f.cal * f.qty)}<small>KCAL</small></div>
        <button class="delete-btn" data-action="delete-food" data-id="${f.id}" aria-label="Delete">${trashIcon}</button>
      </li>
    `).join('');
    $('#foodCount').textContent = `${day.food.length} ${day.food.length === 1 ? 'ENTRY' : 'ENTRIES'}`;
  };

  const renderExerciseList = (day) => {
    const list = $('#exerciseList');
    list.innerHTML = day.exercise.map(e => `
      <li class="entry-row" data-id="${e.id}">
        <div>
          <div class="entry-name">${escapeHtml(e.name)}</div>
          <div class="entry-meta">
            ${e.duration ? `<span>${e.duration} MIN</span>` : '<span>ACTIVITY</span>'}
            <span style="color:var(--ink-mute)">${new Date(e.ts).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
          </div>
        </div>
        <div class="entry-cal">${fmtNum(e.cal)}<small>KCAL</small></div>
        <button class="delete-btn" data-action="delete-exercise" data-id="${e.id}" aria-label="Delete">${trashIcon}</button>
      </li>
    `).join('');
    $('#exerciseCount').textContent = `${day.exercise.length} ${day.exercise.length === 1 ? 'ACTIVITY' : 'ACTIVITIES'}`;
  };

  // ============== RENDER : ALL ==============
  const renderAll = () => {
    $('#dateLabel').textContent = fmtDateLabel(currentDate);
    const day = state.days[currentDate] || { food: [], exercise: [] };
    const t = totalsFor(currentDate);

    renderHero(t);
    renderRings(t);
    renderFoodList(day);
    renderExerciseList(day);
    renderWeekChart();
    renderMacroChart(t);
    renderStreak();

    $('#todayLine').textContent = `${fmtNum(t.cal)} IN · ${fmtNum(t.burned)} OUT`;
  };

  // ============== STREAK ==============
  const renderStreak = () => {
    let streak = 0;
    const d = new Date();
    for (let i = 0; i < 365; i++) {
      const k = d.toISOString().slice(0, 10);
      const t = totalsFor(k);
      const goalRange = state.goals.cal;
      const within = t.cal > 0 && Math.abs(t.net - goalRange) <= goalRange * 0.15;
      if (i === 0 && t.cal === 0) { d.setDate(d.getDate() - 1); continue; }
      if (within) streak++;
      else break;
      d.setDate(d.getDate() - 1);
    }
    $('#streakCount').textContent = streak;
  };

  // ============== EVENTS : ENTRY DELETE (with confirmation) ==============
  let pendingDelete = null;

  const askDelete = (label, action) => {
    pendingDelete = action;
    $('#confirmTitle').textContent = `Delete "${label}"?`;
    openSheet('confirmSheet');
  };

  $('#confirmYes').addEventListener('click', () => {
    if (typeof pendingDelete === 'function') pendingDelete();
    pendingDelete = null;
    closeSheet('confirmSheet');
  });
  // Clear pending action if user cancels via backdrop / close / esc
  $('#confirmSheet').addEventListener('click', (e) => {
    if (e.target.closest('[data-close]') || e.target.classList.contains('sheet-backdrop')) {
      pendingDelete = null;
    }
  });

  $('#foodList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="delete-food"]');
    if (!btn) return;
    const day = ensureDay(currentDate);
    const item = day.food.find(f => f.id === btn.dataset.id);
    if (!item) return;
    askDelete(item.name, () => {
      const d = ensureDay(currentDate);
      d.food = d.food.filter(f => f.id !== btn.dataset.id);
      saveState();
      renderAll();
      toast('Food entry removed');
    });
  });

  $('#exerciseList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="delete-exercise"]');
    if (!btn) return;
    const day = ensureDay(currentDate);
    const item = day.exercise.find(x => x.id === btn.dataset.id);
    if (!item) return;
    askDelete(item.name, () => {
      const d = ensureDay(currentDate);
      d.exercise = d.exercise.filter(x => x.id !== btn.dataset.id);
      saveState();
      renderAll();
      toast('Activity removed');
    });
  });

  // ============== SHEET CONTROLS ==============
  const openSheet = (id) => {
    $('#' + id).classList.add('open');
    $('#' + id).setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  };
  const closeSheet = (id) => {
    $('#' + id).classList.remove('open');
    $('#' + id).setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    // If closing the food sheet, clean up search state so a stale debounced
    // request doesn't fire after the modal is dismissed.
    if (id === 'foodModal') {
      clearTimeout(searchTimer);
      if (searchAbort) { try { searchAbort.abort(); } catch (_) {} }
      searchAbort = null;
      $('#foodSearch').value = '';
      $('#searchResults').innerHTML = `<div class="search-empty">Search a database of millions of foods</div>`;
    }
  };
  $$('.sheet').forEach(m => {
    m.addEventListener('click', (e) => {
      const closeEl = e.target.closest('[data-close]');
      const isBackdrop = e.target.classList.contains('sheet-backdrop');
      if ((closeEl && m.contains(closeEl)) || isBackdrop) {
        closeSheet(m.id);
      }
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') $$('.sheet.open').forEach(m => closeSheet(m.id));
  });

  $('#addFoodBtn').addEventListener('click', () => {
    openSheet('foodModal');
    setTimeout(() => $('#foodSearch').focus(), 200);
  });
  $('#addExerciseBtn').addEventListener('click', () => openSheet('exerciseModal'));
  $('#openSettings').addEventListener('click', () => {
    const f = $('#goalsForm');
    f.cal.value     = state.goals.cal;
    f.protein.value = state.goals.protein;
    f.carbs.value   = state.goals.carbs;
    f.fat.value     = state.goals.fat;
    openSheet('settingsModal');
  });

  // Touch swipe-down to close (basic)
  $$('.sheet-panel').forEach(panel => {
    let startY = 0, currentY = 0, dragging = false;
    panel.addEventListener('touchstart', (e) => {
      // Only start drag if touching near the top (handle area)
      const rect = panel.getBoundingClientRect();
      if (e.touches[0].clientY - rect.top > 60) return;
      startY = e.touches[0].clientY;
      dragging = true;
    }, { passive: true });
    panel.addEventListener('touchmove', (e) => {
      if (!dragging) return;
      currentY = e.touches[0].clientY;
      const dy = Math.max(0, currentY - startY);
      panel.style.transform = `translateY(${dy}px)`;
    }, { passive: true });
    panel.addEventListener('touchend', () => {
      if (!dragging) return;
      dragging = false;
      const dy = currentY - startY;
      panel.style.transform = '';
      if (dy > 100) {
        const sheet = panel.closest('.sheet');
        if (sheet) closeSheet(sheet.id);
      }
    });
  });

  // ============== TABS ==============
  $$('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      $$('.tab').forEach(t => t.classList.toggle('active', t === tab));
      $$('.tab-panel').forEach(p => p.classList.toggle('hidden', p.dataset.panel !== target));
    });
  });

  // ============== FOOD : SEARCH (Open Food Facts) ==============
  let searchAbort = null;
  let searchTimer = null;

  const searchFoods = async (q) => {
    // Cancel any in-flight request
    if (searchAbort) { try { searchAbort.abort(); } catch (_) {} }
    searchAbort = new AbortController();
    const myController = searchAbort;
    const res = $('#searchResults');
    res.innerHTML = `<div class="search-loading">Searching…</div>`;
    try {
      const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=15&fields=code,product_name,brands,nutriments,serving_size,quantity`;
      const r = await fetch(url, { signal: myController.signal });
      // If a newer search has started, drop these results
      if (myController !== searchAbort) return;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const items = (data.products || [])
        .map(p => parseFoodResult(p))
        .filter(p => p && p.cal > 0)
        .slice(0, 12);
      if (myController !== searchAbort) return;
      if (!items.length) {
        res.innerHTML = `<div class="search-empty">No matches for "${escapeHtml(q)}".<br><span style="opacity:.7">Try the Manual tab to add it yourself.</span></div>`;
        return;
      }
      res.innerHTML = items.map((it, idx) => `
        <button class="result-item" data-idx="${idx}">
          <div>
            <div class="result-name">${escapeHtml(it.name)}</div>
            ${it.brand ? `<div class="result-brand">${escapeHtml(it.brand)}</div>` : ''}
          </div>
          <div class="result-cal">${fmtNum(it.cal)}<small>${it.servingLabel}</small></div>
        </button>
      `).join('');
      res.querySelectorAll('.result-item').forEach((el, i) => {
        el.addEventListener('click', () => addFromSearch(items[i]));
      });
    } catch (err) {
      if (err.name === 'AbortError') return;
      // Only surface error if this is still the current request
      if (myController === searchAbort) {
        res.innerHTML = `<div class="search-empty">Couldn't reach the food database.<br><span style="opacity:.7">Check your connection or use Manual entry.</span></div>`;
      }
    }
  };

  const parseFoodResult = (p) => {
    const n = p.nutriments || {};
    const name = p.product_name || p.generic_name;
    if (!name) return null;
    const cal100  = +n['energy-kcal_100g']   || +n['energy-kcal']   || (+n['energy_100g'] || 0) / 4.184 || 0;
    const prot100 = +n['proteins_100g']      || +n['proteins']      || 0;
    const carb100 = +n['carbohydrates_100g'] || +n['carbohydrates'] || 0;
    const fat100  = +n['fat_100g']           || +n['fat']           || 0;
    if (!cal100) return null;
    let servingG = 100;
    let servingLabel = 'PER 100G';
    if (p.serving_size) {
      const m = String(p.serving_size).match(/([\d.]+)\s*(g|ml)/i);
      if (m) {
        servingG = parseFloat(m[1]);
        servingLabel = `PER ${m[1]}${m[2].toUpperCase()}`;
      }
    }
    const factor = servingG / 100;
    return {
      name: name.trim(),
      brand: (p.brands || '').split(',')[0].trim(),
      cal: cal100 * factor,
      protein: prot100 * factor,
      carbs: carb100 * factor,
      fat: fat100 * factor,
      servingLabel
    };
  };

  $('#foodSearch').addEventListener('input', (e) => {
    const q = e.target.value.trim();
    clearTimeout(searchTimer);
    if (q.length < 2) {
      $('#searchResults').innerHTML = `<div class="search-empty">Search a database of millions of foods</div>`;
      return;
    }
    searchTimer = setTimeout(() => searchFoods(q), 320);
  });

  const addFromSearch = (item) => {
    const day = ensureDay(currentDate);
    day.food.push({
      id: uid(),
      name: item.name,
      brand: item.brand || '',
      qty: 1,
      cal: item.cal,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
      ts: Date.now()
    });
    saveState();
    renderAll();
    closeSheet('foodModal');
    toast('Logged: ' + item.name);
  };

  // ============== FOOD : MANUAL ==============
  $('#manualFoodForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const day = ensureDay(currentDate);
    day.food.push({
      id: uid(),
      name: f.name.value.trim(),
      qty: parseFloat(f.qty.value) || 1,
      cal: parseFloat(f.cal.value) || 0,
      protein: parseFloat(f.protein.value) || 0,
      carbs: parseFloat(f.carbs.value) || 0,
      fat: parseFloat(f.fat.value) || 0,
      ts: Date.now()
    });
    saveState();
    renderAll();
    f.reset(); f.qty.value = 1;
    closeSheet('foodModal');
    toast('Food logged');
  });

  // ============== EXERCISE ==============
  $('#exerciseForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const day = ensureDay(currentDate);
    day.exercise.push({
      id: uid(),
      name: f.name.value.trim(),
      cal: parseInt(f.cal.value, 10) || 0,
      duration: parseInt(f.duration.value, 10) || null,
      ts: Date.now()
    });
    saveState();
    renderAll();
    f.reset();
    closeSheet('exerciseModal');
    toast('Activity logged');
  });

  $('#quickActivities').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-name]');
    if (!btn) return;
    $('#exerciseForm').name.value = btn.dataset.name;
    const dur = $('#exerciseForm').duration;
    const calField = $('#exerciseForm').cal;
    const rate = parseFloat(btn.dataset.rate);
    const minutes = parseFloat(dur.value) || 30;
    if (!calField.value) calField.value = Math.round(rate * minutes);
    if (!dur.value) dur.value = minutes;
  });

  // ============== GOALS ==============
  $('#goalsForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    state.goals = {
      cal:     parseInt(f.cal.value, 10),
      protein: parseInt(f.protein.value, 10),
      carbs:   parseInt(f.carbs.value, 10),
      fat:     parseInt(f.fat.value, 10)
    };
    saveState();
    renderAll();
    closeSheet('settingsModal');
    toast('Targets updated');
  });

  $('#autoMacros').addEventListener('click', () => {
    const f = $('#goalsForm');
    const cal = parseInt(f.cal.value, 10) || 2200;
    f.carbs.value   = Math.round((cal * 0.40) / 4);
    f.protein.value = Math.round((cal * 0.30) / 4);
    f.fat.value     = Math.round((cal * 0.30) / 9);
  });

  // ============== QUOTE ==============
  const fallbackQuotes = [
    { q: "What gets measured gets managed.", a: "Peter Drucker" },
    { q: "Discipline is choosing between what you want now and what you want most.", a: "Abraham Lincoln" },
    { q: "Strength does not come from winning. Your struggles develop your strengths.", a: "Arnold Schwarzenegger" },
    { q: "The body achieves what the mind believes.", a: "Napoleon Hill" },
    { q: "It's never too late to be what you might have been.", a: "George Eliot" },
    { q: "Take care of your body. It's the only place you have to live.", a: "Jim Rohn" },
    { q: "Small daily improvements over time lead to stunning results.", a: "Robin Sharma" },
    { q: "The clock is ticking. Are you becoming the person you want to be?", a: "Greg Plitt" },
    { q: "Energy and persistence conquer all things.", a: "Benjamin Franklin" }
  ];

  const loadQuote = async () => {
    const qBox = $('#quoteText'), aBox = $('#quoteAuthor');
    try {
      const r = await fetch('https://api.quotable.io/random?tags=inspirational|wisdom|fitness', { signal: AbortSignal.timeout(3500) });
      if (!r.ok) throw 0;
      const d = await r.json();
      if (d && d.content) {
        qBox.textContent = '"' + d.content + '"';
        aBox.textContent = d.author || '—';
        return;
      }
    } catch (e) { /* fall through */ }
    const f = fallbackQuotes[Math.floor(Math.random() * fallbackQuotes.length)];
    qBox.textContent = '"' + f.q + '"';
    aBox.textContent = f.a;
  };

  // ============== TOAST ==============
  let toastTimer;
  const toast = (msg) => {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  };

  // ============== UTIL ==============
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ============== RESIZE OBSERVER ==============
  const ro = new ResizeObserver(() => {
    const t = totalsFor(currentDate);
    renderRings(t);
  });
  $$('.ring-card').forEach(el => ro.observe(el));

  // ============== THEME ==============
  const THEME_KEY = 'fuelgauge.theme';
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  const setTheme = (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch (_) {}
    if (themeMeta) themeMeta.setAttribute('content', theme === 'light' ? '#f6f0e2' : '#0b0a08');
    // Only re-theme & re-render once charts have been initialized.
    // (Initial call from initTheme runs before charts exist; the INIT block handles first paint.)
    if (typeof weekChart !== 'undefined' && weekChart && typeof macroChart !== 'undefined' && macroChart) {
      applyChartTheme();
      weekChart.update();
      macroChart.update();
      renderRings(totalsFor(currentDate));
    }
  };
  const initTheme = () => {
    let saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (_) {}
    const theme = saved || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    setTheme(theme);
  };
  // Initialize theme BEFORE chart init so initial chart colors are correct
  initTheme();

  // Theme toggle button
  document.getElementById('themeToggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    setTheme(current === 'light' ? 'dark' : 'light');
  });

  // Read color values from CSS variables for chart theming
  const themeColors = () => {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    return {
      ink:      v('--ink'),
      inkMute:  v('--ink-mute'),
      line:     v('--line'),
      line2:    v('--line-2'),
      surface2: v('--surface-2'),
      bg2:      v('--bg-2'),
      amber:    v('--amber'),
      green:    v('--green'),
      coral:    v('--coral'),
      cyan:     v('--cyan')
    };
  };
  const applyChartTheme = () => {
    const c = themeColors();
    // Week chart datasets
    weekChart.data.datasets[0].backgroundColor = c.green;
    weekChart.data.datasets[1].backgroundColor = c.coral;
    weekChart.data.datasets[2].borderColor = c.amber;
    weekChart.data.datasets[2].pointBackgroundColor = c.amber;
    weekChart.data.datasets[2].pointBorderColor = c.bg2;
    // Week chart scales/grid
    weekChart.options.scales.x.grid.color = `${c.line}`;
    weekChart.options.scales.x.ticks.color = c.inkMute;
    weekChart.options.scales.x.border.color = c.line2;
    weekChart.options.scales.y.grid.color = `${c.line}`;
    weekChart.options.scales.y.ticks.color = c.inkMute;
    // Tooltips
    [weekChart, macroChart].forEach(ch => {
      ch.options.plugins.tooltip.backgroundColor = c.surface2;
      ch.options.plugins.tooltip.borderColor = c.line2;
      ch.options.plugins.tooltip.titleColor = c.ink;
      ch.options.plugins.tooltip.bodyColor = c.inkMute;
    });
    // Macro chart
    macroChart.data.datasets[0].backgroundColor = [c.green, c.cyan, c.coral];
    macroChart.data.datasets[0].borderColor = c.bg2;
  };

  // ============== INIT ==============
  initWeekChart();
  initMacroChart();
  applyChartTheme();
  weekChart.update();
  macroChart.update();
  renderAll();
  loadQuote();

  setInterval(() => {
    if (currentDate === todayKey()) renderAll();
  }, 60_000);

  window.__fuel = { state, renderAll, totalsFor };
})();
