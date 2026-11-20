# #12324 Selector-family trigger press: main ee65f4f0 vs head 413dc492

Real Google Chrome 157 (headless), DPR 2, Core defaults, Storybook built at each revision. A mouse press is held 250 ms before the frame. `pressed-while-open` presses the trigger while its own list is open. Transform, tint and edge are read on the trigger's root; text contrast is the label on the page with the tint over it; edge contrast is against the page. Frames: `selector-<side>-<story>-<mode>-<state>.png`.

| Story | Page | State | Transform main → head | Press tint (same both sides?) | Label contrast main → head | Edge main → head | `data-expanded` main → head |
| --- | --- | --- | --- | --- | --- | --- | --- |
| selector--ghost-variant | light | rest | `matrix(1, 0, 0, 1, 0, 0)` → `none` | `none` (same) | 17.01 → 17.01 | `rgb(204, 211, 219)` → `rgb(204, 211, 219)` | None → None |
| selector--ghost-variant | light | pressed | `matrix(0.98, 0, 0, 0.98, 0, 0)` → `none` | `rgba(5, 54, 89, 0.098)` (same) | 14.26 → 14.26 | `rgb(0, 100, 224)` → `rgb(0, 100, 224)` | None → None |
| selector--ghost-variant | light | open | `matrix(1, 0, 0, 1, 0, 0)` → `none` | `none` (same) | 17.01 → 17.01 | `rgb(0, 100, 224)` → `rgb(0, 100, 224)` | None → expanded |
| selector--ghost-variant | light | pressed-while-open | `matrix(1, 0, 0, 1, 0, 0)` → `none` | `none` (same) | 17.01 → 17.01 | `rgb(204, 211, 219)` → `rgb(204, 211, 219)` | None → expanded |
| selector--ghost-variant | dark | rest | `matrix(1, 0, 0, 1, 0, 0)` → `none` | `none` (same) | 14.51 → 14.51 | `rgb(73, 77, 83)` → `rgb(73, 77, 83)` | None → None |
| selector--ghost-variant | dark | pressed | `matrix(0.98, 0, 0, 0.98, 0, 0)` → `none` | `rgba(255, 255, 255, 0.098)` (same) | 11.28 → 11.28 | `rgb(1, 113, 227)` → `rgb(1, 113, 227)` | None → None |
| selector--ghost-variant | dark | open | `matrix(1, 0, 0, 1, 0, 0)` → `none` | `none` (same) | 14.51 → 14.51 | `rgb(1, 113, 227)` → `rgb(1, 113, 227)` | None → expanded |
| selector--ghost-variant | dark | pressed-while-open | `matrix(1, 0, 0, 1, 0, 0)` → `none` | `none` (same) | 14.51 → 14.51 | `rgb(73, 77, 83)` → `rgb(73, 77, 83)` | None → expanded |
| selector--secondary-variant | light | rest | `matrix(1, 0, 0, 1, 0, 0)` → `none` | `none` (same) | 14.21 → 14.21 | `rgb(204, 211, 219)` → `rgb(204, 211, 219)` | None → None |
| selector--secondary-variant | light | pressed | `matrix(0.98, 0, 0, 0.98, 0, 0)` → `none` | `rgba(5, 54, 89, 0.098)` (same) | 11.99 → 11.99 | `rgb(0, 100, 224)` → `rgb(0, 100, 224)` | None → None |
| selector--secondary-variant | light | open | `matrix(1, 0, 0, 1, 0, 0)` → `none` | `none` (same) | 14.21 → 14.21 | `rgb(0, 100, 224)` → `rgb(0, 100, 224)` | None → expanded |
| selector--secondary-variant | light | pressed-while-open | `matrix(1, 0, 0, 1, 0, 0)` → `none` | `none` (same) | 14.21 → 14.21 | `rgb(204, 211, 219)` → `rgb(204, 211, 219)` | None → expanded |
| selector--secondary-variant | dark | rest | `matrix(1, 0, 0, 1, 0, 0)` → `none` | `none` (same) | 8.64 → 8.64 | `rgb(73, 77, 83)` → `rgb(73, 77, 83)` | None → None |
| selector--secondary-variant | dark | pressed | `matrix(0.98, 0, 0, 0.98, 0, 0)` → `none` | `rgba(255, 255, 255, 0.098)` (same) | 6.4 → 6.4 | `rgb(1, 113, 227)` → `rgb(1, 113, 227)` | None → None |
| selector--secondary-variant | dark | open | `matrix(1, 0, 0, 1, 0, 0)` → `none` | `none` (same) | 8.64 → 8.64 | `rgb(1, 113, 227)` → `rgb(1, 113, 227)` | None → expanded |
| selector--secondary-variant | dark | pressed-while-open | `matrix(1, 0, 0, 1, 0, 0)` → `none` | `none` (same) | 8.64 → 8.64 | `rgb(73, 77, 83)` → `rgb(73, 77, 83)` | None → expanded |
| multiselector--ghost-variant | light | rest | `matrix(1, 0, 0, 1, 0, 0)` → `none` | `none` (same) | 17.01 → 17.01 | `rgb(204, 211, 219)` → `rgb(204, 211, 219)` | None → None |
| multiselector--ghost-variant | light | pressed | `matrix(0.98, 0, 0, 0.98, 0, 0)` → `none` | `rgba(5, 54, 89, 0.098)` (same) | 14.26 → 14.26 | `rgb(0, 100, 224)` → `rgb(0, 100, 224)` | None → None |
| multiselector--ghost-variant | light | open | `matrix(1, 0, 0, 1, 0, 0)` → `none` | `none` (same) | 17.01 → 17.01 | `rgb(0, 100, 224)` → `rgb(0, 100, 224)` | None → None |
| multiselector--ghost-variant | light | pressed-while-open | `matrix(1, 0, 0, 1, 0, 0)` → `none` | `rgba(5, 54, 89, 0.098)` (same) | 14.26 → 14.26 | `rgb(0, 100, 224)` → `rgb(0, 100, 224)` | None → None |
| multiselector--ghost-variant | dark | rest | `matrix(1, 0, 0, 1, 0, 0)` → `none` | `none` (same) | 14.51 → 14.51 | `rgb(73, 77, 83)` → `rgb(73, 77, 83)` | None → None |
| multiselector--ghost-variant | dark | pressed | `matrix(0.98, 0, 0, 0.98, 0, 0)` → `none` | `rgba(255, 255, 255, 0.098)` (same) | 11.28 → 11.28 | `rgb(1, 113, 227)` → `rgb(1, 113, 227)` | None → None |
| multiselector--ghost-variant | dark | open | `matrix(1, 0, 0, 1, 0, 0)` → `none` | `none` (same) | 14.51 → 14.51 | `rgb(1, 113, 227)` → `rgb(1, 113, 227)` | None → None |
| multiselector--ghost-variant | dark | pressed-while-open | `matrix(1, 0, 0, 1, 0, 0)` → `none` | `rgba(255, 255, 255, 0.098)` (same) | 11.28 → 11.28 | `rgb(1, 113, 227)` → `rgb(1, 113, 227)` | None → None |
| complexselector--secondary-variant | light | rest | `matrix(1, 0, 0, 1, 0, 0)` → `none` | `none` (same) | 14.21 → 14.21 | `rgb(204, 211, 219)` → `rgb(204, 211, 219)` | None → None |
| complexselector--secondary-variant | light | pressed | `matrix(0.98, 0, 0, 0.98, 0, 0)` → `none` | `rgba(5, 54, 89, 0.098)` (same) | 11.99 → 11.99 | `rgb(0, 100, 224)` → `rgb(0, 100, 224)` | None → None |
| complexselector--secondary-variant | light | open | `matrix(1, 0, 0, 1, 0, 0)` → `none` | `none` (same) | 14.21 → 14.21 | `rgb(204, 211, 219)` → `rgb(204, 211, 219)` | None → None |
| complexselector--secondary-variant | light | pressed-while-open | `matrix(1, 0, 0, 1, 0, 0)` → `none` | `rgba(5, 54, 89, 0.098)` (same) | 11.99 → 11.99 | `rgb(0, 100, 224)` → `rgb(0, 100, 224)` | None → None |
| complexselector--secondary-variant | dark | rest | `matrix(1, 0, 0, 1, 0, 0)` → `none` | `none` (same) | 8.64 → 8.64 | `rgb(73, 77, 83)` → `rgb(73, 77, 83)` | None → None |
| complexselector--secondary-variant | dark | pressed | `matrix(0.98, 0, 0, 0.98, 0, 0)` → `none` | `rgba(255, 255, 255, 0.098)` (same) | 6.4 → 6.4 | `rgb(1, 113, 227)` → `rgb(1, 113, 227)` | None → None |
| complexselector--secondary-variant | dark | open | `matrix(1, 0, 0, 1, 0, 0)` → `none` | `none` (same) | 8.64 → 8.64 | `rgb(73, 77, 83)` → `rgb(73, 77, 83)` | None → None |
| complexselector--secondary-variant | dark | pressed-while-open | `matrix(1, 0, 0, 1, 0, 0)` → `none` | `rgba(255, 255, 255, 0.098)` (same) | 6.4 → 6.4 | `rgb(1, 113, 227)` → `rgb(1, 113, 227)` | None → None |
