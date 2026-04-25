# FUEL.GAUGE — Fitness Telemetry

A no-build, fully client-side fitness tracker with an instrument-cluster aesthetic. Track calories, macros (protein/carbs/fat), and burned calories. All data persists in your browser via `localStorage`.

## Files

```
index.html    Markup + script tags
styles.css    All styling
app.js        State, rendering, charts, API calls
```

## Run locally

Just open `index.html` in a browser. No build step, no server needed.

## Deploy to GitHub Pages

1. Create a new repo (e.g. `fuel-gauge`) and push these three files to the root.
2. In GitHub: **Settings → Pages → Source → Deploy from a branch → main / (root)**.
3. Wait ~30 seconds. Your app is live at `https://YOUR_USERNAME.github.io/fuel-gauge/`.

## Free APIs used (no token required)

| API | Used for | Endpoint |
|---|---|---|
| **Open Food Facts** | Live food/nutrition search | `world.openfoodfacts.org/cgi/search.pl` |
| **Quotable** | Daily motivational quote (with built-in fallback) | `api.quotable.io/random` |

## Other free, no-token APIs you could integrate

These all work from the browser without API keys — drop-in additions if you want to extend the app:

- **Wger Workout Manager** — `wger.de/api/v2/exercise/` — large exercise database, good for building an exercise picker with descriptions, muscle groups, and instructions.
- **FruityVice** — `fruityvice.com/api/fruit/all` — nutrition facts for fruits, no auth.
- **USDA FoodData Central** — `api.nal.usda.gov/fdc/v1/foods/search` — actually requires a free key, but the key is just a stamp; worth noting if you want a US-centric food DB later.
- **Open-Meteo** — `api.open-meteo.com/v1/forecast` — weather data; useful for "good day to run outside?" prompts based on Abdul's location.
- **TheMealDB** — `themealdb.com/api/json/v1/1/random.php` — random meal ideas with ingredients (no nutrition though).
- **Useless Facts** — `uselessfacts.jsph.pl/random.json` — fun random fact widget if you want a "did you know" tile.
- **Bored API (mirror)** — exercise/activity suggestions when stuck.

## Features

- Per-day food logging with **OpenFoodFacts search** or manual entry
- Per-day exercise logging with quick-pill activity presets (incl. off-roading 🚙)
- 4 animated ring gauges for calories + macros
- 7-day history bar+line chart
- Live macro split donut chart
- Editable daily goals with a 40/30/30 auto-calculator
- Streak counter (consecutive days hitting the calorie target ±15%)
- Date navigation (browse past days)
- Toast notifications, modal dialogs, full keyboard ESC support
- Fully responsive (works on phones)
- Reduced-motion support

## Tech

- Vanilla JS, no framework
- [Chart.js 4](https://www.chartjs.org/) via CDN (the only external runtime dep)
- Custom canvas-drawn ring gauges with tick marks
- Google Fonts: Anton (display), Manrope (body), JetBrains Mono (numerics)

## Storage

Single key: `fuelgauge.v1` in `localStorage`. Wipe via DevTools → Application → Local Storage → delete the key, or open `localStorage.clear()` in console.
