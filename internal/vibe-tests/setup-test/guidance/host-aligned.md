## Strategy: host-aligned adoption

This app already has an established visual language. Adopt this strategy when the
host application stays authoritative over typography and color and the design
system is expected to disappear into it.

This is the normal objective for an established app, and the whole recipe below
is supported: an app-owned theme built from the published theme APIs, a provider
used as documented, no unsupported behavior anywhere in it. Its cost is real and
is stated rather than hidden — an app-owned theme has to be maintained as the
host's own tokens change, and it deliberately gives up the design system's stock
visual identity — but that is a maintenance cost, not a missing capability.

The other documented strategy, guest-contained adoption, is not an alternative
to this one for an app that simply wants to look like itself. It exists for the
narrower case where containing the design system to one subtree is a hard
requirement, and it is described in its own document.

### Before you start — the four rules that are not judgement calls

Everything else in this document is reasoning you are expected to apply. These
four are not:

1. **Commit the generated theme output. Never add it to `.gitignore`.** A
   deterministic build step is a reason the output is reproducible, not a reason
   to stop tracking it. Detail below.
2. **Do not import a stock theme stylesheet**, and do not import
   `@astryxdesign/core/tailwind-theme.css`. Detail below.
3. **Leave `.gitignore` exactly as you found it.** If the build writes somewhere
   already ignored, change where it writes.
4. **If you move existing host UI into an Astryx overlay, the moved subtree must
   keep the host boundary that was scoping its tokens.** Not the token values —
   the boundary itself: the attribute, class, or id the host's own CSS keys on.
   Copying the colours instead is a defect, and it is measured. Detail below,
   including how to find that boundary.

### Own the theme; do not import the stock one

Do **not** import a stock theme stylesheet such as
`@astryxdesign/theme-neutral/theme.css`. Build an app-specific theme that
extends the neutral theme and overrides only what the host already defines:

- body, heading, and code/mono font families, matching the host's own stacks;
- the host's semantic colors, defined as explicit light and dark pairs so both
  modes resolve to the host's existing values.

Build that theme as a deterministic step of the app's own build — the same
inputs must always produce the same CSS — and import the generated stylesheet
and built theme object. Do not generate the theme at runtime on each boot.

### Commit the theme source **and** its generated output

Both the theme source and everything the build writes from it are project
files, and both belong in version control:

- commit the theme source (for example `src/hostTheme.ts`);
- commit the generated stylesheet and every sibling artifact the build emits
  beside it (for example `src/hostaligned.css` and its generated type and
  variant files).

Do **not** add the generated output to `.gitignore`. A deterministic build step
is a reason the output is reproducible, not a reason to stop tracking it: this
app's own history keeps its generated theme artifacts in the tree, a reviewer
has to be able to see the CSS a theme change actually produces, and a build that
regenerates the file on `predev`/`prebuild` still leaves the committed copy as
the reviewable record. Ignoring the output also hides a drifted or hand-edited
artifact, which is exactly what the committed copy exists to catch.

If the build writes the artifact somewhere that is already ignored, change where
it writes rather than what is ignored. Leave `.gitignore` as you found it.

### Keep the host's cascade

- Keep `@import 'tailwindcss';` where the host already has it, and declare the
  layer order **above** it so the emitted order is explicit:

  ```css
  @layer reset, theme, base, astryx-base, astryx-theme, components, utilities;

  @import 'tailwindcss';
  @import '@astryxdesign/core/reset.css';
  @import '@astryxdesign/core/astryx.css';
  /* the app's own generated theme, not a stock theme.css */
  @import './<theme-name>.css';
  ```

  The build names its output after the **theme**, not after the source file,
  and writes it beside that source: a theme named `hostaligned` declared in
  `src/hostTheme.ts` becomes `src/hostaligned.css`. Import that file.

- Verify the layer order in the **emitted** CSS, not in source order. A build
  step can reorder or hoist imports.
- Do **not** import `@astryxdesign/core/tailwind-theme.css`. It intentionally
  maps common color, radius, shadow, type, and spacing names and would hand the
  host's Tailwind vocabulary to the design system.

### Establish the theme attribute before first paint

`data-astryx-theme` must be present on the document element before the first
paint, not written by an effect after hydration. Otherwise the first painted
frame is unthemed and the page visibly reflows. Set it in the server-rendered
markup or in a blocking inline script in `<head>`.

Keep `data-theme` and `color-scheme` synchronized with the host's own mode
control. The host owns the light/dark switch; the design system follows it.
Never replace or disable the host's mode control.

### Bare element rules — know what the theme brings

A built theme always emits rules for bare prose elements — `h1`–`h6`, `p`,
`small`, `code`/`pre`, covering font family, size, weight, line height, and
color, plus `hr`, whose border it replaces outright. They are emitted whatever
the theme overrides; a theme that changes one color still carries the full
typographic scale. They land in `@layer reset` at zero specificity, so any host
class wins over them, but a host element with no class does not.

Because this strategy puts the theme attribute at document scope, those rules
reach the host's own bare elements. Before adopting this strategy, check what
the host actually renders unclassed. If any bare prose element's resolved font
family, size, weight, line height, letter spacing, or color would change — or
any `hr`'s border — the theme must restate the host's values for those tokens so
the result is pixel-identical. A near-match is host damage.

If the host's bare-element styling cannot be reproduced exactly — for example
because it varies by region — this strategy is not currently safe for that host,
and there is no supported way to suppress the emitted prose rules. Report that
rather than papering over it with a blanket override or `!important`.

### Host UI placed inside a design-system overlay

A task may ask for host markup to be composed _inside_ a design-system overlay —
the host's own menu opened from within a dialog, for example. Moving host markup
into an overlay moves it in the DOM, and an established app's surfaces are
routinely painted by custom properties scoped to a region of the DOM rather than
defined globally:

```css
[data-app-region='settings'] {
  --panel: #f5f3ff;
  --border: #c4b5fd;
}
```

A host surface that was a descendant of that region resolves those values. The
same markup rendered inside an overlay declared elsewhere is no longer a
descendant of it, so the _same classes_ resolve to the app's global values
instead and the surface silently changes colour. Promoting the element to the
top layer does not help: `popover` and `<dialog>` change where an element
paints, not where it inherits from.

So, when host markup moves into an overlay, **carry the boundary with the
markup**. Find the boundary, put it back on the moved subtree, and verify.

**Finding it.** Do not guess, and do not assume it is the same hook that carries
light/dark — an app very often has one attribute for mode and a different one
for a region's palette, and copying only the mode hook leaves the palette
behind. Work backwards from the tokens:

1. In the host's stylesheet, find where the surface's colours actually come
   from. Read the classes already on the element — `bg-panel`, `border-border`,
   `text-foreground` — and note the custom properties behind them.
2. Search the stylesheet for every rule that _redeclares_ those properties. One
   will be `:root` or equivalent; that is the global set. Any other is a region.
3. The selector on that region rule is the boundary. It is whatever this host
   calls it — an attribute, a class, an id.
4. Confirm the surface's original position is inside it, walking up from the
   element itself. The boundary is frequently on the element already, in which
   case moving the element moves the boundary with it — and dropping the
   attribute during the move is exactly the mistake.

**Applying it.** Put the same boundary on the moved subtree — the same
attribute, spelled the same way — so the host's own rules resolve as they did.
Carry the host's mode signal too if the host scopes light and dark separately.
Keep the host's markup, classes, and tokens otherwise unchanged. Restating a
colour as a literal is not the same fix: it duplicates a value the host can
change, and it drifts silently the next time the host retunes its palette.

**Verifying.** Compare the relocated surface's computed background, border, and
text colour against the same host surface in its original position, in **both**
modes. They must match exactly. A near-match is host damage. The measurement
checks the boundary as well as the colours, and reports them separately: a
`host-boundary` failure means the moved subtree fell out of the host's token
region, and no amount of restated colour will clear it.

### Check the rendered app

Build **and** view the app in both modes. Cascade, inherited color, and
font-metric changes all compile cleanly.
