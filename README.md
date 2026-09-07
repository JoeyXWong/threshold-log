# Threshold Log

A single-file training tracker for a 5-week calisthenics block run on Jack H. Woods'
method: six movement patterns, one continuous max-effort set per pattern per week,
difficulty adjusted mid-rep so the whole range of motion sits at your limit.

Block dates are baked in — calibration Aug 29 2026, training Aug 31 – Oct 4,
retest Oct 5. Change them in `src/app.jsx` if you run another block.

The build produces one `index.html` with React and all CSS inlined. No external
requests, no CDN, works offline in a garage with no signal.

## Quick start

```bash
npm install
npm run dev      # builds, watches, serves http://localhost:8000
npm run build    # writes dist/index.html
```

To test on your phone, find your machine's LAN IP (`ipconfig getifaddr en0` on
macOS) and open `http://<that-ip>:8000`. An `http://` origin is required —
Safari refuses `localStorage` on `file://` URLs, so opening `dist/index.html`
directly from Finder will run but never persist.

## Deploy

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds and
publishes `dist/` to GitHub Pages. One-time setup: **Settings → Pages → Source:
GitHub Actions**.

Then open the Pages URL on your phone and **Share → Add to Home Screen**. It's
configured as a standalone web app, so it launches without Safari chrome.

Keep the URL stable. `localStorage` is scoped to the origin, so a new URL means
an empty log.

## How the data works

Everything lives in `localStorage` under the key `threshold-log-v1`, written 300 ms
after any change and again whenever the tab goes to the background. Nothing leaves
the device.

```jsonc
{
  "stages": { "hpush": 4, "vpull": 1, ... },   // current notch, 0–7 per pattern
  "log": [                                      // one entry per max-effort set
    { "date": "2026-09-02", "pattern": "hpush", "stage": 4,
      "setting": "lean 4 in", "duration": "1:50", "notes": "" }
  ],
  "days": {                                     // per-day conditioning
    "2026-09-02": { "zone2": true, "gear": "7", "watts": "135",
                    "hr": "129", "mins": "60", "steps": true }
  },
  "z2target": "135",
  "tests": { "base": {}, "retest": {} }         // calibration vs retest
}
```

Safari clears site data for origins untouched for seven days. Training four days
a week keeps you inside that window, but use **Save file** in the Tests tab every
week or two — that JSON download is the only copy that survives an eviction or a
device wipe. **Load file** restores it.

## Editing the training content

All of it is data at the top of `src/app.jsx`:

- **`PATTERNS`** — the six patterns. Each has a `goal`, the `variable` you dial
  (lean distance, foot assist, box height), the `gear` needed, a `suggested`
  starting notch, and eight `stages` as `[name, description]`. Edit a stage
  description or add rungs here.
- **`SESSIONS`** — which patterns fall on which weekday, keyed by
  `Date.getDay()` (0 = Sunday). Currently Mon A, Tue B, Thu C, Sat weak-link,
  with Zone 2 on Wed/Fri/Sun.
- **`dayInfo()`** — week numbering and the per-week effort notes (week 1 at 80%,
  week 5 taper, Saturday dropped in the taper week).
- **`CALIBRATION` / `BLOCK_START` / `BLOCK_END` / `RETEST`** — block dates.

The stage index is the progress metric, not reps or duration. Move up a notch
only when you can hold that setting at real intensity for a full 1–3 minute set.

## Zone 2

Logged from the Keiser M3's display: gear, average watts, average heart rate,
minutes. The app computes **watts per beat** and trends it across the block —
same power costing fewer beats is the aerobic progress signal. Set a target
wattage on the Zone 2 tab after your first ride.

## Layout

```
src/app.jsx        the whole app — patterns, schedule, UI, storage
src/shell.html     HTML shell, meta tags, hand-written utility CSS
build.mjs          esbuild bundle + inline into dist/index.html
```

There's no Tailwind. `src/shell.html` defines by hand only the utility classes
the app uses — if you add a class in JSX, add the rule there too.

## License

Private project. The training method is Jack H. Woods'; the code is yours.
