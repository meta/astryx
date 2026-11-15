# #10863 round 3: a mixed value under an app override

Real Chrome (headless, 2x). The probe theme declares `--color-text-secondary: light-dark(#555555, #aaaaaa)`, `--color-background-muted: #00ff00` (does not depend on the scheme), and `--color-border-emphasized: color-mix(in srgb, var(--color-text-secondary) 50%, var(--color-background-muted))`. Each page has a wrapper element between the theme root and the media band, with a border outside the band and a border in the band. In the override rows the app sets `--color-background-muted: #ff00ff` on that wrapper. Revisions: `main`, the previous head 6df9563e, and this head 126fdf64.

Expected: the border in the band matches `main` as written: the theme value, in the band's scheme. The app override reaches neither border, as on `main`.

| Override | CSS | Page | Outside the band (all revisions) | In the band: main | previous head | this head |
| --- | --- | --- | --- | --- | --- | --- |
| no | as written | light page | #2baa2b | #55d455 | #55d455 | #55d455 |
| no | as written | dark page | #55d455 | #2baa2b | #2baa2b | #2baa2b |
| no | lowered | light page | #2baa2b | #2baa2b | #55d455 | #55d455 |
| no | lowered | dark page | #55d455 | #55d455 | #2baa2b | #2baa2b |
| yes | as written | light page | #2baa2b | #55d455 | #d455d4 | #55d455 |
| yes | as written | dark page | #55d455 | #2baa2b | #aa2baa | #2baa2b |
| yes | lowered | light page | #2baa2b | #2baa2b | #d455d4 | #55d455 |
| yes | lowered | dark page | #55d455 | #55d455 | #aa2baa | #2baa2b |
