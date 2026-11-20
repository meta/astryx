---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` and `set` handle one-mode and scoped asks more exactly.

- **Shadows per mode:** a part's shadow given for one mode keeps every layer the part shows. Their colors stay in the other mode and go transparent in this one, and the new layers' colors show in this mode only. Each mode paints exactly what it did, or what was asked. `set` still takes `--mode` only for colors.
- **Core's shadow layers:** a part whose shadow Core builds from layers of its own (a card's selection ring and elevation) keeps those layers under a theme's shadow, so a card shadow, or a shadow of none, never drops the ring.
- **One-mode removals:**
  - "remove card borders in dark mode" makes the border color transparent in dark mode.
  - "no shadows in dark mode" makes the shared shadows transparent in dark mode only.
  - A border width in one mode is refused, with the reason and the border-color line that does work.
- **Mode words:**
  - Mode words name a mode, never a direction: "darker in light mode" is darker.
  - A mode word that scopes another ask ("more colorful in dark mode") never changes the theme's modes.
- **See-through colors:** a see-through role color, such as a 10% wash, stays see-through when it gets lighter or darker. A border made lighter or darker in a named mode reads that mode's page.
- **Role words:**
  - "the accent text" is the accent text token, never the main text.
  - "labels on accent buttons" are the accent-filled variant's labels.
- **Corners by a length:** a corner step in px starts from the radius the part shows. It passes `set`, and a pill stays a pill.
- **Gradients:** a gradient of one named color uses that color.
- **Keeps and excepts:**
  - "…but keep the inputs" keeps the inputs.
  - An except list keeps every variant, state and heading level it names ("except primary and ghost buttons", "except hovered or disabled", "except h2 and h3").
- **Headings:** headings made bigger never grow the body text, and headings by a px amount move each level.
- **Comparisons with the page:**
  - "darker than the page" keeps each card variant apart.
  - "as dark as the page" takes the page's color.
- **No undo of a removal:** a removal the theme already has is never undone.
- **Swaps:** a swap of two role colors swaps each mode, and a named mode swaps only its own colors.

@josephfarina
