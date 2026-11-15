# #10863 round 4: mixed values under an app override

Real Chrome (headless, 2x). Two probe themes declare `--color-text-secondary: light-dark(#555555, #aaaaaa)` and `--color-border-emphasized: color-mix(in srgb, var(--color-text-secondary) 50%, var(--color-background-muted))`. In `mix`, the theme declares `--color-background-muted: #00ff00`; in `coremix`, the theme leaves it unset and the page supplies `#777777` on `:root`, as Core does. Each page has a wrapper between the theme root and the media band, with a border outside the band and one in the band. In the override rows the app sets `--color-background-muted: #ff00ff` on the wrapper. Revisions: `main`, the previous head 962f6fd8, and this head 7b23455a.

Expected: the border in the band matches `main` as written, and the override reaches neither border.

| Theme | Override | CSS | Page | Outside the band | In the band: main | previous head | this head |
| --- | --- | --- | --- | --- | --- | --- | --- |
| mix | no | as written | light page | #2baa2b | #55d455 | #55d455 | #55d455 |
| mix | no | as written | dark page | #55d455 | #2baa2b | #2baa2b | #2baa2b |
| mix | no | lowered | light page | #2baa2b | #2baa2b | #55d455 | #55d455 |
| mix | no | lowered | dark page | #55d455 | #55d455 | #2baa2b | #2baa2b |
| mix | yes | as written | light page | #2baa2b | #55d455 | #55d455 | #55d455 |
| mix | yes | as written | dark page | #55d455 | #2baa2b | #2baa2b | #2baa2b |
| mix | yes | lowered | light page | #2baa2b | #2baa2b | #55d455 | #55d455 |
| mix | yes | lowered | dark page | #55d455 | #55d455 | #2baa2b | #2baa2b |
| coremix | no | as written | light page | #666666 | #919191 | #919191 | #919191 |
| coremix | no | as written | dark page | #919191 | #666666 | #666666 | #666666 |
| coremix | no | lowered | light page | #666666 | #666666 | #919191 | #919191 |
| coremix | no | lowered | dark page | #919191 | #919191 | #666666 | #666666 |
| coremix | yes | as written | light page | #666666 | #919191 | #d455d4 | #919191 |
| coremix | yes | as written | dark page | #919191 | #666666 | #aa2baa | #666666 |
| coremix | yes | lowered | light page | #666666 | #666666 | #d455d4 | #919191 |
| coremix | yes | lowered | dark page | #919191 | #919191 | #aa2baa | #666666 |
