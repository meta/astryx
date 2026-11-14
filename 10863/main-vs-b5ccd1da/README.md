# #10863 media surfaces: main vs b5ccd1da

Real Chrome (headless, 2x). Each still shows a light page with a dark media band and a dark page with a light media band. "As written" keeps `light-dark()`; "lowered" is the same CSS after lightningcss lowers it for Chrome 100 / Safari 15. Theme CSS comes from the generator at each revision. `overlap` is a probe theme with two adaptation rules: `prefers-contrast: more` sets `--color-accent: #ff0000`; `width < 1024px` sets `--color-border-emphasized: var(--color-accent)`.

| Theme | Condition | CSS | Page | Caption (secondary text) main → head | Link main → head | Button border main → head |
| --- | --- | --- | --- | --- | --- | --- |
| neutral | default | as written | light page | #9e9e9e (same) | #f1f1f1 (same) | #525252 (same) |
| neutral | default | as written | dark page | #474747 (same) | #1b1b1b (same) | #d4d4d4 (same) |
| neutral | default | lowered | light page | #474747 → **#9e9e9e** | #1b1b1b → **#f1f1f1** | #d4d4d4 → **#525252** |
| neutral | default | lowered | dark page | #9e9e9e → **#474747** | #f1f1f1 → **#1b1b1b** | #525252 → **#d4d4d4** |
| overlap | no-rule | as written | light page | #aaaaaa (same) | #ffffff (same) | #aaaaaa (same) |
| overlap | no-rule | as written | dark page | #555555 (same) | #111111 (same) | #555555 (same) |
| overlap | no-rule | lowered | light page | #555555 → **#aaaaaa** | #ffffff (same) | #555555 → **#aaaaaa** |
| overlap | no-rule | lowered | dark page | #aaaaaa → **#555555** | #111111 (same) | #aaaaaa → **#555555** |
| overlap | contrast-more | as written | light page | #aaaaaa (same) | #ffffff (same) | #aaaaaa (same) |
| overlap | contrast-more | as written | dark page | #555555 (same) | #111111 (same) | #555555 (same) |
| overlap | contrast-more | lowered | light page | #555555 → **#aaaaaa** | #ffffff (same) | #555555 → **#aaaaaa** |
| overlap | contrast-more | lowered | dark page | #aaaaaa → **#555555** | #111111 (same) | #aaaaaa → **#555555** |
| overlap | narrow | as written | light page | #aaaaaa (same) | #ffffff (same) | #eeeeee (same) |
| overlap | narrow | as written | dark page | #555555 (same) | #111111 (same) | #111111 (same) |
| overlap | narrow | lowered | light page | #555555 → **#aaaaaa** | #ffffff (same) | #111111 → **#eeeeee** |
| overlap | narrow | lowered | dark page | #aaaaaa → **#555555** | #111111 (same) | #eeeeee → **#111111** |
| overlap | contrast-more+narrow | as written | light page | #aaaaaa (same) | #ffffff (same) | #ff0000 (same) |
| overlap | contrast-more+narrow | as written | dark page | #555555 (same) | #111111 (same) | #ff0000 (same) |
| overlap | contrast-more+narrow | lowered | light page | #555555 → **#aaaaaa** | #ffffff (same) | #ff0000 (same) |
| overlap | contrast-more+narrow | lowered | dark page | #aaaaaa → **#555555** | #111111 (same) | #ff0000 (same) |
