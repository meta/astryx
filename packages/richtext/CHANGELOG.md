# @astryxdesign/richtext

# 0.7.5

#### New Features

- Status colors are readable everywhere they appear, and Info is a status of its own. Each status (info, success, warning, error) now has a strong fill (`--color-<status>`) with content on it (`--color-on-<status>`, at least 4.5:1), a pale fill (`--color-<status>-muted`) with its content (`--color-on-<status>-muted`), and readable text for the page and cards (`--color-text-<status>`). Status icons (`--color-icon-<status>`) and borders (`--color-border-<status>`) default to the readable text color. The Info roles (`--color-info`, `--color-on-info`, `--color-info-muted`, …) are new and no longer borrow your accent color.

  `--color-success`, `--color-warning`, and `--color-error` and `bg-<status>` keep their meaning as the strong fills. In Tailwind, `bg-info`, `bg-info-muted`, `text-on-<status>`, `text-on-<status>-muted`, and `text-status-<status>` are new; `text-`, `decoration-`, `placeholder-`, and `caret-<status>` now use the readable text shade, and `border-`, `divide-`, `outline-`, and `ring-<status>` use the border shade, while `bg-`, `accent-`, `fill-`, `stroke-<status>`, shadows, and gradients keep the strong fill. For example, Core's light `text-warning` is now `#753F07` instead of `#E9AF08`. To keep the fill color on text, write `text-[var(--color-warning)]`.

  What changes on screen:

  - Core's dark Error content (`--color-on-error`) is now `#0A1317` instead of white, so text on dark-mode error fills reaches 4.5:1. Core's Info Badge uses `#0064E0` instead of the accent (`#2694FE` in dark mode).
  - Status icons (Icon `color="info|success|warning|error"`), Stepper status glyphs, and Chat tool-call status icons use the readable shades. Core's light success icon is now `#09441F` instead of `#0D8626`.
  - Input and FileInput status borders use the border shades. Core's light warning border is now `#753F07` instead of `#E9AF08`, and Butter's light success and warning input borders reach 3:1.
  - Banner draws its title, description, icon, and controls in the on-muted colors, and fills Info with `--color-info-muted`.
  - Status fills keep a visible edge in forced-colors mode.
  - Content on Chocolate and Matcha success and error fills, and on Stone success, warning, and error fills, now reaches 4.5:1.
  - Every first-party theme sets a blue Info. Chocolate and Matcha Info Badges move from the accent to that blue; Butter keeps its own Info Badge colors.
  - Neutral's `--color-success`, `--color-warning`, and `--color-error` are now the fills its Badges already showed, and its `--color-info` is `#0074E2` (`#6D9CFE` in dark mode). Its Badges, StatusDots, progress fills, and Stepper badges look the same; its accent ProgressBar, StatusDot, and Stepper now use Neutral's accent instead of blue.
  - Neutral no longer defines its undocumented local status tokens. Use the standard roles instead: `--astryx-theme-neutral-color-status-fill-success`, `-status-fill-warning`, and `-status-fill-error` → `--color-success`, `--color-warning`, `--color-error`; `-status-muted-accent` → `--color-info-muted`; `-on-tint-neutral` → `--color-neutral`; the `-on-tint-overlay-*` and `-destructive-overlay-*` tokens → `--color-overlay-hover` and `--color-overlay-pressed`. `--astryx-theme-neutral-color-status-fill-accent` keeps its value but is deprecated.

  Custom themes get the content and text roles they don't set: they are derived from the theme's status fills. To keep a component's previous color, set the matching role, for example `--color-icon-success` to your old `--color-success`.

- `RichTextEditor` and `RichTextView` take `codeLanguages`, the same list `Markdown` takes, so code looks the same while reading and editing.

#### Fixes

- Type declarations resolve in projects that use `moduleResolution: NodeNext`.
- In `RichTextEditor` and `RichTextView`, a code block with no language leaves room for its Copy button, so long lines wrap before it. The block is as tall as in `Markdown`, so switching between reading and editing no longer shifts the page.

#### Documentation

- Package links now point to the project's GitHub home, `meta/astryx`.

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang
- @harjothkhara
- @rubyycheung

---

# 0.7.4

---

# 0.7.3

---

# 0.7.2

#### New Features

- Tables draw a line on every cell edge, not only between rows, on both `Markdown` and the RichText surfaces, and the grid closes at the table's rim. A reader following one row across never needed vertical lines, but someone editing a table has to aim at a cell and judge where a selection stops, and the empty 3×3 a toolbar insert produces was three horizontal rules with no sign it had three columns. The line is the same `--color-border` already used between rows, the rim merges with it into one rule rather than doubling at the edge, and both surfaces move together — the read and edit renderings match block for block, more closely than before.

#### Documentation

- The `RichTextEditor` docs now list `isOptional`, `isRequired`, `labelTooltip` and `namespace`, four props the editor already accepted, so `astryx component RichTextEditor` and the docsite props table show the Required/Optional indicator, `aria-required`, the label tooltip and the Lexical namespace.

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang
- @potatowagon

---

# 0.7.1

#### New Features

- `@astryxdesign/richtext` is now a stable package, released together with `@astryxdesign/core` at the same version. Install it without the `@canary` tag: `npm install @astryxdesign/richtext`. It provides `RichTextEditor`, `RichTextView`, `RichTextEditorToolbar`, `RichTextEditorAutoLinkPlugin`, the headless Markdown serializers (also at `@astryxdesign/richtext/markdown`), and Markdown plugin support through `createRichTextExtension`. `RichTextView` and core `Markdown` render the same document the same way, and Markdown that is imported and exported without edits comes back byte for byte. `lexical` and the `@lexical/*` packages remain optional peer dependencies. (#7224)

#### Fixes

- `@astryxdesign/richtext` (and the Lab and Charts packages) now declare their stylesheet as a side effect, so a bundler that removes side-effect-free imports keeps `import '@astryxdesign/richtext/richtext.css'` instead of dropping it and leaving the editor unstyled. JavaScript modules stay tree-shakable. (#7586)
- `astryx.css`, `reset.css`, and every other package stylesheet (`richtext.css`, `lab.css`, `charts.css`) now open with `@layer reset, astryx-base, astryx-theme;`, the same line theme stylesheets carry. The Astryx layer order holds whichever Astryx stylesheet loads first: loading `reset.css` after `astryx.css` no longer lets the reset override component styles, and theme overrides keep winning. Setups that already declare the order on their own first line are unchanged. (#7585)

#### Documentation

- The `@astryxdesign/richtext` README shows the full stylesheet setup: Core's `reset.css` and `astryx.css`, your theme's CSS, and `richtext.css`. It says the package ships prebuilt CSS, so you never compile its source, and that `richtext.css` sits in `@layer astryx-base`, so theme overrides win once `reset.css` (or the layer-order line) loads first. (#7582)

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang

---

# 0.1.9
