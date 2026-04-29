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

    const lines = [
      'You are an AI health coach inside an app called FUEL.GAUGE.',
      `Today is ${date}. Only discuss today's data — do not speculate about other days.`,
      'Be concise, honest, and specific. Skip generic motivational phrases.',
      'Use short paragraphs. Interpret the numbers — don\'t just repeat them.',
      '',
      '── USER PROFILE ──',
      `Age: ${p.age || '?'} | Gender: ${p.gender || '?'}`,
      `Weight: ${p.weightKg ? p.weightKg + ' kg' : '?'} | Height: ${p.heightCm ? p.heightCm + ' cm' : '?'}`,
      `Activity level factor: ${p.activityLevel || '?'}`,
      '',
      '── DAILY GOALS ──',
      `Calories: ${g.cal || '?'} kcal`,
      `Protein: ${g.protein || '?'} g | Carbs: ${g.carbs || '?'} g | Fat: ${g.fat || '?'} g`,
      `Sleep goal: ${p.sleepGoalHours || 8} h`,
      '',
      '── TODAY\'S NUTRITION ──',
      `Calories in: ${Math.round(t.cal)} kcal`,
      `Burned (exercise): ${Math.round(t.burned)} kcal`,
      `Net: ${Math.round(t.net)} kcal`,
      `Protein: ${Math.round(t.protein)} g | Carbs: ${Math.round(t.carbs)} g | Fat: ${Math.round(t.fat)} g`,
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
          temperature: 0.75,
          max_tokens:  900
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

  const showNoKey = () => {
    $('coachNoKey').style.display  = '';
    $('coachChat').style.display   = 'none';
  };

  const showChat = () => {
    $('coachNoKey').style.display  = 'none';
    $('coachChat').style.display   = 'flex';
  };

  // ── Called each time the Coach tab opens ──────────────────
  const onTabOpen = () => {
    try { apiKey = localStorage.getItem(KEY_STORAGE) || ''; } catch {}
    if (!apiKey) { showNoKey(); return; }
    showChat();
    if (!briefSent) {
      briefSent = true;
      send('Give me a brief summary of how my day looks so far — nutrition, sleep, and exercise. Be concise and honest.');
    }
  };

  // ── Wire events ───────────────────────────────────────────
  const wire = () => {
    $('coachGoSettings').addEventListener('click', () => {
      document.getElementById('openSettings')?.click();
    });

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
