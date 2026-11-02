# @xds/theme-neutral

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

---

# 0.7.3

---

# 0.7.2

---

# 0.7.1

---

# 0.7.0

#### Breaking Changes

- On touch devices narrower than the `lg` breakpoint (`(width < 1024px) and (pointer: coarse)`), the 14px-base first-party themes now floor their type base to 16px and re-derive the ratio so Display 1 keeps its desktop size: neutral and chocolate (base 14, ratio 1.2 → 1.1736) and butter and stone (base 14, ratio 1.25 → 1.2225). On phones, body, label and code text rise from 14px to 16px; supporting text, the headings and Display 2 and 3 grow by 1–2px; only Display 1 holds its desktop size. Desktop sizes are unchanged. gothic, matcha and y2k already use a 16px base and need no rule. The CLI's theme templates carry the same rule, so a newly scaffolded theme gets it too. (#6699)
  An app theme that extends one of these four themes and sets its own `typography.scale` or type-size tokens inherits this rule, and on touch + narrow screens the rule replaces those values (a base-18 child drops to a 16px body and a 42px Display 1). Append your own rule for the same condition with the values you want; a later rule for the same condition wins.

  Migration: nothing to change to take the new phone scale. To keep the previous 14px phone scale in an app, extend the theme and append a later rule for the same condition: `defineTheme({name: 'app', extends: neutralTheme, adaptations: {rules: [{when: {pointer: 'coarse', width: {below: 'lg'}}, value: {typography: {scale: {base: 14, ratio: 1.2}}}}]}})`. For butter and stone use `ratio: 1.25` and also set `tokens: {'--text-supporting-size': '12px'}` in that rule's value, because those themes pin supporting text at 12px rather than the 11px the scale alone gives. This cannot be rewritten by a codemod: whether an app wants the floor is a product choice.

#### Fixes

- Generate Neutral's runtime palette references from the stops its theme uses, and fail verification when the package or CLI template copy drifts. (#7255)

#### Contributors

Thanks to everyone who contributed to this release:

- @imdreamrunner
- @rubyycheung

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

#### Documentation

- Describe Neutral as Figtree typography and add the font-loading snippet; the README claimed system fonts while the theme declares Figtree. (#5991)

#### Contributors

Thanks to everyone who contributed to this release:

- @AKnassa
- @josephfarina

---

# 0.6.3

---

# 0.6.2

---

# 0.6.1

#### Fixes

- Prefer canonical component target names in maintained themes and new examples while preserving deprecated runtime aliases and released bare prop/state selector classes through the 0.7.0 removal window. Theme discovery labels deprecated targets, theme build warns with each exact canonical replacement, and `astryx upgrade --apply` provides the forward-compatible bare-selector migration. (#6126)

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang

---

# 0.6.0

#### Breaking Changes

- Requires `@astryxdesign/core@0.6.0` as part of the coordinated stable release. Upgrade Core and this theme together.

#### New Features

- Add an authoring-time OKLCH palette generator with a pure API, terminal and HTML previews, typed palette output, custom stops, deterministic receipts, and overwrite protection.
  [feat] Expose exact solid black and white values as `neutralPalettes.black` and `neutralPalettes.white` for use in semantic theme tokens.

#### Fixes

- Align Neutral light-mode foreground colors to darker palette stops.

#### Contributors

Thanks to everyone who contributed to this release:

- @rubyycheung

---

# 0.5.4

---

# 0.5.3

#### New Components

- Reuse Neutral-owned local tokens for semantic status fills across badges, status dots, step indicators, and progress bars. (#5854)
- Add Neutral's reproducible, theme-owned OKLCH palette without changing
  its runtime token mappings. The request, receipt, generated result, and CLI template artifacts are committed together for review. (#5987)

#### New Features

- Mute the low-tone edge of Neutral's dark chromatic palette while preserving its light and neutral ramps. (#6069)

#### Fixes

- Correct Neutral Banner interaction tints so light mode uses translucent light overlays and dark mode uses translucent dark overlays. (#5936)
- Use palette-backed red interaction overlays for Neutral destructive
  buttons, solid dark-palette tone-25 backgrounds (tone 20 for gray), and calmer dark-mode text colors. Use a palette-backed muted blue tint for dark info banners while preserving the existing light-mode non-semantic color mappings. (#6049)
- Give Neutral segmented controls a roomier inset while preserving their outside height. (#5851)
- Rename built-in syntax theme identifiers. (#5847)
- Remap Neutral's semantic, syntax, and categorical color tokens to the
  reviewed theme-owned palette through named stop references. Keep the maintained CLI template synchronized. (#6034)

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

#### Fixes

- neutral theme: darken the light-mode error red from `#e33f4a` to `#c9303a` so the filled `Badge variant="error"` label clears WCAG 2.1 AA. White on `#e33f4a` is 4.14:1 and the badge label is 12px/weight 500, so the 4.5:1 normal-text threshold applies rather than the 3:1 large-text allowance; `#c9303a` gives 5.29:1 while holding the hue (OKLCH H 21.9 -> 22.8, C 0.200 -> 0.189). StatusDot and the ProgressBar `--color-error` rebinding move with it — both are documented as tracking the badge fill so the dot and its badge read as one status language. Dark mode is untouched (dark text on `#ff705d`, 6.60:1). Adds `scripts/check-badge-contrast.test.mjs`, which resolves every theme's badge label/fill pair through `light-dark()`, `var()` indirection and alpha compositing, and holds all of them to 4.5:1 (#4446).

#### Contributors

Thanks to everyone who contributed to this release:

- @AKnassa

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

- Banner: a dismissed banner no longer drops focus, a custom status no longer loses its ARIA role, and the info banner paints again under the neutral theme.
  Dismissing unmounted the focused dismiss button, so focus landed on `<body>` and a keyboard user lost their place in the page. Banner now records where focus entered from and returns it there, the same handoff `ToastViewport` makes for a dismissed toast. Measured in Chromium: `document.activeElement` was `BODY`, and is now the control the user tabbed in from.

  `BannerStatusMap` is documented as augmentable, but all four status lookups were closed `Record<BannerStatus, ...>` maps. Adding the augmentation the docs show produced four TypeScript errors inside `Banner.tsx` itself, which a consumer cannot fix, and at runtime an unknown status resolved to `undefined` for its icon, its background and its ARIA role, so the banner stopped being a live region at all. The lookups are partial now: an unrecognized status renders with no status fill, no default glyph and `role="status"`.

  A theme could not reach the banner's radius. `--_banner-radius` was declared in the doc file and in `derivedVarRegistry.ts`, but no rule read it, so a theme's `borderRadius` on the `banner` target expanded into a variable nothing consumed. The four card-silhouette radii read it now, falling back to `--radius-container`.

  Under `@astryxdesign/theme-neutral` the info banner had no background at all, light or dark: the override set `background-color` directly and forced `--color-accent-muted` to `transparent`, and a plain CSS property written by a theme lands in `@layer astryx-theme`, which StyleX's `@layer priority4` outranks. Info now goes through `--color-accent-muted` like the other three statuses and like the stone theme already did.

  Also in this change: `children={false}` (the ordinary `{cond && <ul/>}` idiom) no longer produces an expand toggle that opens an empty box, and `description=""` no longer leaves an empty 20px row, both via `isRenderable`; a long unbroken word in the title or description no longer forces the page into horizontal scrolling at a 320px viewport, measured at `document.scrollWidth` 529px before; and the content area's bottom border uses logical `border-block-end` alongside its inline siblings.

- The `/built` entry now loads under Node ESM and externalized SSR (Vite `--ssr`, Remix / React Router v7): it imports `./icons.mjs` instead of the extensionless `./icons` Node cannot resolve.

#### Contributors

Thanks to everyone who contributed to this release:

- @AKnassa
- @cixzhang

---

# 0.4.2

---

# 0.4.1

---

# 0.4.0

#### Fixes

- `--radius-none` no longer overrides to `0.25rem`. `--radius-none` and `--radius-full` are documented as always fixed (never scaled by a theme), matching `@astryxdesign/core`'s own defaults — this theme's radius group bump swept `--radius-none` along with it by mistake. Anything opting out of rounding via `--radius-none` under this theme now renders with a true `0px` radius again, instead of a silent 4px. (#4856)

#### Contributors

Thanks to everyone who contributed to this release:

- @HelloOjasMutreja

---

# 0.3.0

#### Fixes

- neutral theme: darken light-mode `--color-text-secondary` from neutral-500 (#737373) to neutral-600 (#525252). 500 only reached 4.19:1 on the T95 body background (#f1f1f1), just under WCAG AA 1.4.3 (4.5:1); 600 clears it. Dark mode is unchanged.

#### Contributors

Thanks to everyone who contributed to this release:

- @humbertovirtudes

---

# 0.2.0

#### Fixes

- Neutral theme: express the light `--color-border` as `#00000014` (translucent black) instead of the opaque `#ebebeb`. Same rendered color over a white surface, but it now blends over any background — matching the translucent dark-mode value.

#### Contributors

Thanks to everyone who contributed to this release:

- @kentonquatman

---

# 0.1.9

---

# 0.1.8

---

# 0.1.7

#### Fixes

- StatusDot now uses the same vivid fills as the filled Badge in the neutral theme. Previously the dots mapped to the dark text/icon stops (dark green, maroon, brown), which read muddy in light mode; success/warning/error/accent now match their badge counterparts so a dot and its badge share one status color.

#### Contributors

Thanks to everyone who contributed to this release:

- @ernestt

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

- Tracks `@xds/core@0.0.15` (bare-name migration + data-attribute selector surface).

# 0.0.13

#### Changes

- Icon renames: `checkCircle`/`xCircle` → `success`/`error` (#1503)

#### Patch Changes

- Updated dependencies
  - @xds/core@0.0.13

---

# 0.0.5

#### Changes

- Updated token names to match naming audit (shadow, radius, elevation renames)
- Motion token primitives: duration and easing values
- Dynamic radius and type scale support via `defineTheme` config

#### Patch Changes

- Updated dependencies
  - @xds/core@0.0.5

---

# 0.0.4

#### Patch Changes

- Updated dependencies — aligned with @xds/core@0.0.4

---

# 0.0.3

#### Patch Changes

- Fix theme package to produce proper JS/TS module output via tsup (#541)

---

# 0.0.2

#### Changes

- Migrated to CSS-based theming with `defineTheme()`

---

# 0.0.1

- Initial release — neutral theme with Lucide icons
