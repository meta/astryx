# PowerSearch date-range token: main f51e61da vs head 6f269a5f

Chromium 149 (headless, Playwright 1.61.1), Storybook built at each revision. One "Created / is between" filter sits in a 700 px box, as in the Date Filters story. Its range is absolute (Jan 5 to Jan 7, 2026) or relative (7 days back to now). Each locale comes from `InternationalizationProvider` with the shipped catalog; the field and operator labels come from the story's config, so they stay English. The page clock is fixed at 2026-11-25 20:00 UTC and the time zone is UTC. Desktop and 390 px stills are DPR 2; the sheet pair is Chromium phone emulation (390 × 844, DPR 3, touch, coarse pointer). `measures.json` has each token's accessible name.

| Pair | Range | Locale | Width | Mode | Token value, main → head |
| --- | --- | --- | --- | --- | --- |
| `token-{main,head}-absolute-en-us-1280-light.png` | Jan 5 – 7, 2026 | en-US | 1280 | light | date range → Jan 5 – 7, 2026 |
| `token-{main,head}-relative-de-de-390-dark.png` | last 7 days | de-DE | 390 | dark | Datumsbereich → 18.–25. Nov. 2026 |
| `token-{main,head}-absolute-ar-sa-rtl-1280-light.png` | Jan 5 – 7, 2026 | ar-SA (RTL) | 1280 | light | نطاق التاريخ → ٥–٧ يناير ٢٠٢٦ |
| `sheet-{main,head}-absolute-en-us-phone-390.png` | Jan 5 – 7, 2026 | en-US | 390 (phone) | light | date range → Jan 5 – 7, 2026 |

Each sheet still shows the trigger before the tap (top) and the Filters sheet after it (below the grey band).
