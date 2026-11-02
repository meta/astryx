# @xds/theme-matcha

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

#### Documentation

- Package links now point to the project's GitHub home, `meta/astryx`.

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang
- @rubyycheung

---

# 0.7.4

#### New Features

- Move Matcha's existing color roles onto its reviewed light and dark ramps, including Tea Gold. Warning and Yellow move from `#FFB600` / `#FFC940` to `#F2C000` / `#F6D066`; related syntax colors and warning inset rings follow the same palette. Consumers that need the former appearance can extend `matchaTheme` and override the affected color, syntax, shadow, and component tokens with their previous values. The complete Matcha palette remains private authoring data, and the CLI template ships the same request, receipt, and runtime-sized references. (#7671)

#### Contributors

Thanks to everyone who contributed to this release:

- @rubyycheung

---

# 0.7.3

---

# 0.7.2

---

# 0.7.1

---

# 0.7.0

#### Breaking Changes

- matcha's and y2k's spacing steps are rem (`--spacing-2: 0.75rem`), so their gaps and padding follow the reader's root font size like the core scale. Every step is the same pixel value at the default 16px root; a reader with a larger root font size now sees proportionally larger spacing on these themes. The CLI's copies of both theme templates and the annotated theme template's spacing example change the same way. (#7374)
  Migration: nothing to change to take the new behaviour. To keep fixed pixel spacing on one of these themes, extend it and override the steps in px, which is honoured as written: `defineTheme({name: 'app', extends: matchaTheme, tokens: {'--spacing-2': '12px'}})`.

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang

---

# 0.6.8

---

# 0.6.7

#### New Features

- Each theme package now exports `/fonts.css` beside `/built` and `/theme.css`. Import it when the theme uses non-system fonts.

#### Contributors

Thanks to everyone who contributed to this release:

- @josephfarina

---

# 0.6.6

#### New Features

- Add a shared `upload` icon, and use it for FileInput's upload affordance instead of the directional `arrowUp`
  Themes draw `upload` through `icons.upload`, separately from `arrowUp`, so sort arrows and every other `arrowUp` use stay unchanged. Every bundled theme and theme template draws `upload` in its own icon style. FileInput keeps its icon size, placement, color, and accessibility in both modes; a theme with no `upload` artwork shows the default upload-into-tray glyph there.

  A complete `IconRegistry` may still omit `upload` in this release. The next minor makes it required, so add an `upload` entry to any registry you type as `IconRegistry`.

#### Contributors

Thanks to everyone who contributed to this release:

- @rubyycheung

---

# 0.6.5

---

# 0.6.4

#### New Features

- Ship a typed `ThemeDoc` descriptor beside each first-party theme source. (#6498)

#### Contributors

Thanks to everyone who contributed to this release:

- @josephfarina

---

# 0.6.3

---

# 0.6.2

---

# 0.6.1

---

# 0.6.0

#### Breaking Changes

- Requires `@astryxdesign/core@0.6.0` as part of the coordinated stable release. Upgrade Core and this theme together.

---

# 0.5.4

---

# 0.5.3

#### Fixes

- Rename built-in syntax theme identifiers. (#5847)

#### Contributors

Thanks to everyone who contributed to this release:

- @rubyycheung

---

# 0.5.2

---

# 0.5.1

#### Fixes

- Theme packages no longer ship an unused CommonJS `icons.js` artifact. Their root entry keeps its advertised CommonJS and ESM outputs, while the standalone icon companion used by `/built` is emitted only as `icons.mjs`. (#5512)

#### Contributors

Thanks to everyone who contributed to this release:

- @jiunshinn

---

# 0.5.0

---

# 0.4.7

---

# 0.4.6

---

# 0.4.5

---

# 0.4.4

---

# 0.4.3

#### Fixes

- The `/built` entry now loads under Node ESM and externalized SSR (Vite `--ssr`, Remix / React Router v7): it imports `./icons.mjs` instead of the extensionless `./icons` Node cannot resolve.

#### Contributors

Thanks to everyone who contributed to this release:

- @AKnassa

---

# 0.4.2

---

# 0.4.1

---

# 0.4.0

---

# 0.3.0

---

# 0.2.0

---

# 0.1.9

---

# 0.1.8

---

# 0.1.7

---

# 0.1.6

---

# 0.1.5

---

# 0.1.4

---

# 0.1.3

---

# 0.1.2

---

# 0.1.1

---

# 0.1.0

---

# 0.0.15

#### Changes

- Theme polish — aligned the type scale with the other themes (base 16, ratio 1.25) and softened the sage border tokens in light mode. (#2856)
- Tracks `@xds/core@0.0.15` (bare-name migration + data-attribute selector surface).

# 0.0.13

#### New

- Initial release — earthy green palette with Figtree typography (#1803)
