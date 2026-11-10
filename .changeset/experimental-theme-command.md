---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme`: make and change a theme one checked change at a time. Only the new experimental command group changes; `astryx theme` and its output stay as they were.

- **Checked changes.** `set <theme> <thing> <value>` takes a dial (corners, spacing, accent, font, headings, surfaces, buttons, type, text-size, base, mode), a design token, or a CSS property on a part, with `--on <part|family>`, `--when <prop>:<value>`, `--state`, `--mode light|dark` and `--only`. Each change is checked against what the installed Core's parts really read and against the token's type. A change that cannot take effect is refused (exit 1, an `ERR_THEME_*` code, nothing written), and the error leads with the command that works.
- **What parts read.** It is derived from the installed Core itself, version for version: a catalog of every component renders on the server with the project's own React, joined to Core's stylesheet. The result is cached under `node_modules/.cache/astryx-theme/`. No new dependency.
- **An ordinary local theme.** `<theme>.settings.json` holds the settings; `<theme>.settings.ts` is generated from it; `<theme>.theme.ts` extends it, is written once, and keeps your own edits; the CSS and JS are built by the same build as `astryx theme build`. A plain part setting that a more specific base-theme rule would beat is repeated on those variant keys, and the result says so.
- **Families, modes, contrast.** Styling one input or check styles its whole family unless `--only`; `--on containers` and `--on menus` style every member. Only colors and shadows take `--mode`. Text this theme makes unreadable (below 4.5:1, and not that low in the base theme) is reported.
- **Commands.** `new`, `set`, `reset` (back to the base theme's value), `show`, `undo`, `preview` (the theme-building page, rendered to one HTML file or written into the app), and `explain` (a part, family, setting or aspect; a question in plain words, answered with exact commands; a PNG picture's colors; or `--list dials|tokens|parts|families|properties`). Previews are self-contained HTML; PNG pictures only with `--png`, using a Playwright or Chrome found on the machine.
- **Experimental copies of `astryx theme`.** `compile` (the copy of `theme build`), `list`, `add`, `remove`, `use`, `eject`, `template`, `targets` and `palette generate` run the same functions with the same flags and JSON. Each experimental command doc names the stable command it will replace in a new `replaces` field, shown in its help as "Will replace: astryx theme build".

@josephfarina
