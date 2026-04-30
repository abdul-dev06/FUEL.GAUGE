/* ===========================================================
   FUEL.GAUGE — coach.js  (AI Coach tab, powered by Groq)
   Reads day data via window.FuelGauge bridge from app.js.
   Groq uses the OpenAI-compatible API — stream via SSE.
   =========================================================== */

window.GeminiCoach = (() => {
  'use strict';

  const KEY_STORAGE = 'fuelgauge.groq_key';
  const MODEL       = 'llama-3.3-70b-versatile';
  const API_URL     = 'https://api.groq.com/openai/v1/chat/completions';

  let apiKey    = '';
  let history   = [];   // [{role:'user'|'assistant', content:string}]
  let streaming = false;
  let briefSent = false;

  // ── Tiny helpers ──────────────────────────────────────────
  const $   = id => document.getElementById(id);
  const esc = s  => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/\n/g, '<br>');

  const fmtMin = min => window.FuelGauge?.minToTimeStr(min) ?? '?';

  // ── Build system prompt from today's data ─────────────────
  const buildSystemPrompt = () => {
    const fg = window.FuelGauge;
    if (!fg) return 'You are a personal health coach.';

    const state = fg.getState();
    const date  = fg.getCurrentDate();
    const t     = fg.getTotals(date);
    const p     = state.profile || {};
    const g     = state.goals   || {};
    const day   = state.days?.[date] || {};
    const sleep = day.sleep || null;

    // BMR + TDEE
    let bmr = null, tdee = null;
    if (p.weightKg && p.heightCm && p.age && p.gender && p.activityLevel) {
      const s = p.gender === 'male' ? 5 : -161;
      bmr  = Math.round((10 * p.weightKg) + (6.25 * p.heightCm) - (5 * p.age) + s);
      tdee = Math.round(bmr * p.activityLevel);
    }

    // Goal vs TDEE — projected weight change
    let goalLine = `Calorie goal: ${g.cal || '?'} kcal`;
    if (tdee && g.cal) {
      const diff   = g.cal - tdee;
      const weekKg = (Math.abs(diff) * 7 / 7700).toFixed(2);
      const dir    = diff < -50
        ? `${Math.abs(diff)} kcal BELOW TDEE — projected ~${weekKg} kg/week loss`
        : diff > 50
        ? `${diff} kcal ABOVE TDEE — projected ~${weekKg} kg/week gain`
        : 'at maintenance (within ±50 kcal of TDEE)';
      goalLine = `Calorie goal: ${g.cal} kcal (${dir})`;
    }

    // Today's actual balance vs TDEE
    let todayBalanceLine = '';
    if (tdee) {
      const bal     = Math.round(t.net - tdee);
      const balSign = bal >= 0 ? '+' : '';
      const balType = bal < -50 ? 'deficit' : bal > 50 ? 'surplus' : 'balanced';
      const weekKg  = (Math.abs(bal) * 7 / 7700).toFixed(2);
      todayBalanceLine = `Balance vs TDEE today: ${balSign}${bal} kcal (${balType}) — if sustained: ~${weekKg} kg/week`;
    }

    const lines = [
      'You are an elite personal coach embedded in FUEL.GAUGE, a precision fitness tracking app.',
      'Your job: read the data, cut through noise, and tell the user exactly what they need to hear.',
      '',
      'TONE: Firm, direct, and genuinely motivating — like a coach who respects the user enough not to sugarcoat.',
      'No filler. No "great job logging your food." No vague encouragement. Pure signal.',
      '',
      'RESPONSE RULES:',
      '- Summary requests: 1 sentence per area max. Only flag what is off-track or notable. Skip areas that are fine.',
      '- Specific questions: 3-5 sentences. Lead with the direct answer, add one key mechanism, give one concrete action. Cut everything else.',
      '- Never pad. If the answer is one sentence, stop at one sentence.',
      '- Always interpret — never echo numbers back.',
      '- Use BMR, TDEE, and projected weight change to ground advice in real physiology.',
      '',
      `Today is ${date}.`,
      '',
      '── USER PROFILE ──',
      `Age: ${p.age || '?'} | Gender: ${p.gender || '?'}`,
      `Weight: ${p.weightKg ? p.weightKg + ' kg' : '?'} | Height: ${p.heightCm ? p.heightCm + ' cm' : '?'}`,
      `Activity level factor: ${p.activityLevel || '?'}`,
      bmr  ? `BMR: ${bmr} kcal/day (Mifflin-St Jeor — calories burned at complete rest)` : 'BMR: unavailable — profile incomplete',
      tdee ? `TDEE: ${tdee} kcal/day (estimated total daily energy expenditure)` : 'TDEE: unavailable',
      '',
      '── GOALS ──',
      goalLine,
      `Protein: ${g.protein || '?'} g | Carbs: ${g.carbs || '?'} g | Fat: ${g.fat || '?'} g`,
      `Sleep goal: ${p.sleepGoalHours || 8} h`,
      '',
      '── TODAY\'S NUTRITION ──',
      `Calories in: ${Math.round(t.cal)} kcal`,
      `Burned (exercise): ${Math.round(t.burned)} kcal`,
      `Net calories: ${Math.round(t.net)} kcal`,
      `Protein: ${Math.round(t.protein)} g | Carbs: ${Math.round(t.carbs)} g | Fat: ${Math.round(t.fat)} g`,
      ...(todayBalanceLine ? [todayBalanceLine] : []),
    ];

    if (sleep && (sleep.bedtimeMin != null || sleep.wakeMin != null)) {
      const durH = sleep.durationMin ? (sleep.durationMin / 60).toFixed(1) : '?';
      lines.push('', '── SLEEP LAST NIGHT ──',
        `Duration: ${durH} h (goal: ${p.sleepGoalHours || 8} h)`);
      if (sleep.bedtimeMin != null) lines.push(`Bedtime: ${fmtMin(sleep.bedtimeMin)}`);
      if (sleep.wakeMin    != null) lines.push(`Wake:    ${fmtMin(sleep.wakeMin)}`);
    } else {
      lines.push('', '── SLEEP ──', 'No sleep data logged today.');
    }

    if (day.exercise?.length) {
      lines.push('', '── EXERCISE TODAY ──');
      day.exercise.forEach(e => {
        lines.push(`- ${e.name}: ${e.cal} kcal${e.duration ? ` | ${e.duration} min` : ''}`);
      });
    } else {
      lines.push('', '── EXERCISE TODAY ──', 'Nothing logged yet.');
    }

    if (day.food?.length) {
      lines.push('', `── FOOD TODAY (${day.food.length} items) ──`);
      day.food.forEach(f => {
        const cal  = Math.round((f.cal     || 0) * f.qty);
        const prot = Math.round((f.protein || 0) * f.qty);
        const carb = Math.round((f.carbs   || 0) * f.qty);
        const fat  = Math.round((f.fat     || 0) * f.qty);
        lines.push(`- ${f.name}: ${cal} kcal | P ${prot}g C ${carb}g F ${fat}g`);
      });
    } else {
      lines.push('', '── FOOD TODAY ──', 'Nothing logged yet.');
    }

    return lines.join('\n');
  };

  // ── Groq streaming fetch (OpenAI-compatible SSE) ──────────
  const streamGroq = async ({ onChunk, onDone, onError }) => {
    const messages = [
      { role: 'system', content: buildSystemPrompt() },
      ...history
    ];

    let res;
    try {
      res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model:       MODEL,
          messages,
          stream:      true,
          temperature: 0.72,
          max_tokens:  4096
        })
      });
    } catch {
      onError('Network error — check your connection.'); return;
    }

    if (!res.ok) {
      let msg = `API error ${res.status}`;
      try { const j = await res.json(); msg = j.error?.message || msg; } catch {}
      onError(msg); return;
    }

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buf  = '';
    let full = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const j     = JSON.parse(data);
          const chunk = j.choices?.[0]?.delta?.content ?? '';
          if (chunk) { full += chunk; onChunk(chunk); }
        } catch { /* partial JSON — skip */ }
      }
    }
    onDone(full);
  };

  // ── DOM helpers ───────────────────────────────────────────
  const scrollBottom = () => {
    const el = $('coachMessages');
    el.scrollTop = el.scrollHeight;
  };

  const addBubble = (role, html) => {
    const d = document.createElement('div');
    d.className = `coach-msg coach-msg--${role}`;
    d.innerHTML = `<div class="coach-bubble">${html}</div>`;
    $('coachMessages').appendChild(d);
    scrollBottom();
    return d.querySelector('.coach-bubble');
  };

  const addStreamingBubble = () => {
    const d = document.createElement('div');
    d.className = 'coach-msg coach-msg--model';
    d.innerHTML = '<div class="coach-bubble"><span class="coach-cursor">&#9613;</span></div>';
    $('coachMessages').appendChild(d);
    scrollBottom();
    return d.querySelector('.coach-bubble');
  };

  // ── Send ──────────────────────────────────────────────────
  const send = async (text) => {
    if (streaming || !apiKey || !text.trim()) return;
    streaming = true;
    $('coachSend').disabled  = true;
    $('coachInput').disabled = true;

    history.push({ role: 'user', content: text });
    addBubble('user', esc(text));
    $('coachInput').value = '';
    $('coachInput').blur();
    autoResize($('coachInput'));

    const bubble = addStreamingBubble();
    let accumulated = '';

    await streamGroq({
      onChunk: (chunk) => {
        accumulated += chunk;
        bubble.innerHTML = esc(accumulated) + '<span class="coach-cursor">&#9613;</span>';
        scrollBottom();
      },
      onDone: (full) => {
        bubble.innerHTML = esc(full);
        history.push({ role: 'assistant', content: full });
        streaming = false;
        $('coachSend').disabled  = false;
        $('coachInput').disabled = false;
      },
      onError: (msg) => {
        bubble.innerHTML = `<span class="coach-error">${esc(msg)}</span>`;
        history.pop();
        streaming = false;
        $('coachSend').disabled  = false;
        $('coachInput').disabled = false;
      }
    });
  };

  // ── Auto-resize textarea ──────────────────────────────────
  const autoResize = (el) => {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  };

  // ── Called each time the Coach tab opens ──────────────────
  const onTabOpen = () => {
    try { apiKey = localStorage.getItem(KEY_STORAGE) || ''; } catch {}
    if (!briefSent) {
      briefSent = true;
      send('Quick summary — calories, macros, sleep, exercise. One to two sentences each. Tell me what actually matters right now.');
    }
  };

  // ── Wire events ───────────────────────────────────────────
  const wire = () => {
    $('coachSend').addEventListener('click', () => send($('coachInput').value.trim()));
    $('coachInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send($('coachInput').value.trim()); }
    });
    $('coachInput').addEventListener('input', () => autoResize($('coachInput')));
  };

  // ── Boot ──────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    try { apiKey = localStorage.getItem(KEY_STORAGE) || ''; } catch {}
    wire();
  });

  return { onTabOpen };

})();
