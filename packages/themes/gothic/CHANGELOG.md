# @astryxdesign/theme-gothic

# 0.7.17

#### New Features

- Chat surfaces now default to the container radius: `--radius-chat` defaults to `var(--radius-container)` instead of `28px`, a theme that sets `--radius-container` but not `--radius-chat` declares the alias at its root, and a radius scale no longer sets `--radius-chat` (it set the page step), so chat follows the theme's container, also where the theme sets its container over the scale. This changes the corners of ChatComposer, its drawer and status bar, and ChatMessageBubble, and the buttons inside the composer take their normal corners. The send button stays circular inside a composer, as it is outside one: a theme whose composer corner made the send button a rounded square (controls taller than 32px, or a chat corner under 28px) now draws a circle, unless it sets the `chat-send-button` radius. Butter, Chocolate, Gothic, Matcha, Neutral and Stone set `--radius-chat: 28px`, and Butter keeps its 16px send-button corner, so they look the same; Y2K sets `--radius-chat: 0px` and stays square. A theme that extends one of them keeps that chat radius. To keep the 28px chat corners in another theme, add `--radius-chat: 28px` to its tokens. Set the token in the theme rather than on an ancestor such as `:root`: a theme scope that declares it now replaces an inherited value.
- The gothic theme exports `colorModes` (`['dark']`), from the package and from its built module, so tools judge it in the one mode it draws instead of guessing from the page.

#### Fixes

- Each built-in theme ships its open-licensed fonts. `fonts.css` loads every face from a woff2 file in the package (licenses in `fonts/`), with `font-display: fallback` (served from the same machine or a fast connection, a face arrives before the text first draws, so there is no fallback flash; a face that takes more than about 3 s leaves that page in the fallback font), instead of a Google Fonts `@import` that held the page until the request answered (chocolate's Fraunces as its variable face, keeping its optical size), so an app or screenshot offline (a sandbox, CI) draws at once and shows the theme's real fonts.
- Links on coloured cards take the card's own category ink. Inside a coloured card, a nested card, a field, inline code, an open menu, a selected segment, an input group addon, a step number, a banner and a striped table row draw the theme's own text again, and a transparent card keeps the card's ink, so card text and links meet WCAG AA (4.5:1). Secondary text on default and muted cards takes the next stop, so it reads on the accent tint of a selected row or a numbered citation there.
- The error toast keeps one deep red in both modes, so its text reads at 4.97:1 in dark mode, where it read at 4.11:1.
- A plain table's rows keep the text colour around them in Butter, Y2K and Gothic; only a striped table's even rows take the stripe's text. Inside a coloured card in dark mode, every second row of a plain table read white on the pastel card, at 1.15:1 to 2.12:1. Those themes' striped-row rule now reads the row's `striped` state, in their packages and in the copies the CLI bundles.

#### Contributors

Thanks to everyone who contributed to this release:

- @josephfarina
- @kentonquatman

---

# 0.7.16

#### Documentation

- Fix the theme README usage examples to import `Theme` from `@astryxdesign/core/theme` instead of the removed `XDSTheme` alias, and refresh the bundled theme lists in the package index and contributor guide. ([#11016](https://github.com/meta/astryx/pull/11016))

#### Contributors

Thanks to everyone who contributed to this release:

- @karlmoriaty

---

# 0.7.15

---

# 0.7.14

---

# 0.7.13

#### Fixes

- dependency floors move to current releases: the build package needs autoprefixer 10.6.2, browserslist 4.29.5 and lightningcss 1.33.0; the CLI needs ignore 7.0.14, jscodeshift 17.4.0, linkedom 0.18.15, zod 4.6.7 and @stylexjs/babel-plugin 0.19.1; each theme needs lucide-react 1.66.0. Peer ranges do not change. (#10709)

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang

---

# 0.7.12

#### Fixes

- Gothic: accent text and accent icons stay readable on a light media surface. They used Gothic's light accent there, near-white on a light band (1.14:1); now they follow the surface's dark accent (18.7:1 against a white surface). The CLI's Gothic theme template carries the same change. (#10852)
- Theme packages publish the declarations of their `./theme.css` export. The export pointed `types` at `theme.css.d.ts`, which the package didn't ship, so TypeScript found no types for `import '@astryxdesign/theme-<name>/theme.css'`. The export is unchanged; the file is now published. (#10903)
- Theme packages declare `"type": "module"`, so bundlers and Node read the `./built` entry as the ES module it is. Before, it was an ES module in a `.js` file in a package without a `type`, which tools that follow the package's `type` read as CommonJS. Every export subpath stays the same. The CommonJS build of the source entry is now `dist/source.cjs` behind the same `require` condition, with its own CommonJS declarations (`dist/source.d.cts`), so TypeScript types each condition in the format it loads. As before, `require('…/built')` loads an ES module, so it needs a Node version with `require(esm)` (22.12 or later). Deep imports that reach past `exports` into `dist/` change too: `dist/source.js` is now `dist/source.cjs`, and a `require` of `dist/<theme>.js` gets an ES module (`require(esm)`, Node 22.12 or later). (#10876)

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang

---

# 0.7.11

---

# 0.7.10

---

# 0.7.9

---

# 0.7.8

---

# 0.7.7

---

# 0.7.6

#### Fixes

- Published packages no longer include repository test and benchmark files, reducing install size without changing exports. (#9153)

#### Contributors

Thanks to everyone who contributed to this release:

- @parinith-web

---

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

- Keep Gothic's released flat `gothicPalettes` compatibility export unchanged while moving the maintained dark theme to a reproducible generated palette and named stop mappings. The card changes from `#1A1D20` to `#191D20`; Gray background and border from `#3D4248` / `#5D646B` to `#3E454B` / `#5E676E`; syntax comment and punctuation from `#6B7079` / `#7A8290` to `#7E8791` / `#7E8791`; and diff backgrounds from `#081408` / `#1E0A0A` to `#071607` / `#220806`. Success, warning, and error inset rings move from `#87B06A50` / `#D6B56A50` / `#D4485150` to `#869B7250` / `#D3C49050` / `#C6A6A250`. Yellow text moves from `#6C5010` to `#573F0B`, and Pink text from `#71223C` to `#5C182F`; both darker named stops clear 4.5:1 on their categorical surfaces. Consumers that need the former appearance can extend `gothicTheme` and override these color, syntax, shadow, and component tokens with their previous values. The CLI template ships the same request, receipt, and runtime-sized references. (#7670)

#### Contributors

Thanks to everyone who contributed to this release:

- @rubyycheung

---

# 0.7.3

---

# 0.7.2

---

# 0.7.1

#### Fixes

- Stone, Y2K, and Gothic set `CodeBlock`'s diff row slots in their own syntax palettes, so a reader of a diff on those themes gets added and removed rows whose code, line numbers, and `+`/`-` glyphs stay readable: every syntax token keeps at least 4.5:1 on the tinted rows in Stone (light and dark) and Y2K (light and dark), and in Gothic the rows take a deep green and a deep red at the background's own luminance, so every token keeps the contrast it has on the plain background. Line numbers and glyphs on changed rows use each theme's own green and red. The CLI's bundled copies of the three themes (`astryx theme eject`) carry the same palettes. (#7428)
- A `secondary` Selector, MultiSelector, or ComplexSelector now matches the theme's secondary Button: under butter, chocolate, gothic, stone, and y2k it takes that Button's border, fill, text color, and hover instead of the default borderless neutral fill, so a toolbar mixing secondary buttons and selectors reads as one set of controls. Disabled and read-only triggers keep a still fill on hover, as a disabled Button does, and a Selector or MultiSelector inside an InputGroup keeps the group's neutral fill and edges. The default theme is unchanged, the selector docs now say `secondary` follows the theme's secondary Button, and themes added with the CLI get the same parity. (#7548)

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang

---

# 0.7.0

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

#### Fixes

- `--radius-none` no longer overrides to `0.125rem`. `--radius-none` and `--radius-full` are documented as always fixed (never scaled by a theme), matching `@astryxdesign/core`'s own defaults — each of these themes' radius group bumps swept `--radius-none` along with it by mistake, the same bug fixed for `theme-neutral` in #4856. Anything opting out of rounding via `--radius-none` under these themes now renders with a true `0px` radius again, instead of a silent 2px.

#### Contributors

Thanks to everyone who contributed to this release:

- @is-jain

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

- Theme polish — color-token and type-scale refinements for visual consistency with the other themes. (#2856)
- Tracks `@astryxdesign/core@0.0.15` (bare-name migration + data-attribute selector surface).
