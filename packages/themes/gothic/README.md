# @astryxdesign/theme-gothic

**Dark-only** atmospheric gothic theme for Astryx — deep blue-gray surfaces, distressed display heading, and pastel categorical accents that glow against the dark page like illuminated panels. Uses Manufacturing Consent for headings, Fustat for body text, and [Lucide](https://lucide.dev) icons.

> Gothic is a single-mode theme: it always renders dark, regardless of the user's system color preference. For best browser-chrome integration (scrollbars, native form controls), pass `mode="dark"` to your `XDSTheme` provider.

## Install

```bash
npm install @astryxdesign/theme-gothic
```

## Usage

Wrap your app with `XDSTheme` and pass the theme:

```tsx
import {XDSTheme} from '@astryxdesign/core/theme';
import {gothicTheme} from '@astryxdesign/theme-gothic/built';

function App() {
  return (
    <XDSTheme theme={gothicTheme} mode="dark">
      {/* your app */}
    </XDSTheme>
  );
}
```

### Import paths

| Path                                   | Use case                                                    |
| -------------------------------------- | ----------------------------------------------------------- |
| `@astryxdesign/theme-gothic`           | Source build (StyleX compilation via `@astryxdesign/build`) |
| `@astryxdesign/theme-gothic/built`     | Pre-built dist (Tailwind, plain CSS, or no build step)      |
| `@astryxdesign/theme-gothic/theme.css` | Pre-built CSS file (import in your stylesheet)              |

If you're using `@astryxdesign/build` for StyleX source compilation, import from the bare path. Otherwise, use `/built`.

### CSS import

Add the theme CSS to your stylesheet:

```css
@import '@astryxdesign/theme-gothic/theme.css';
```

## Aesthetic

Gothic is dark-only by design: every token is a single value, and the
output CSS contains no `light-dark()`, so the theme renders identically
whether the user prefers light or dark.

| Aspect      | Choice                                          |
| ----------- | ----------------------------------------------- |
| Mode        | Dark only, no light variant                     |
| Neutral     | Cool blue-gray (#101314 → #E8F1F6)              |
| Status      | Forest moss, blood crimson, candlelight amber   |
| Categorical | Pastel-on-dark: light backgrounds, dark text    |
| Radius      | Subtle rounding (2–24px)                        |
| Motion      | Slower / theatrical (150ms → 800ms, 0.75 ratio) |
| Type scale  | 14px base, 1.2 ratio                            |

## Fonts

This theme uses custom typefaces:

| Role    | Font                  | Vibe               |
| ------- | --------------------- | ------------------ |
| Body    | Fustat                | Clean modern sans  |
| Heading | Manufacturing Consent | Distressed display |
| Code    | JetBrains Mono        | Crisp, monospaced  |

**These fonts must be loaded separately.** The theme references them by name but does not bundle the font files.

Add this to your HTML `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  rel="stylesheet"
  href="https://fonts.googleapis.com/css2?family=Fustat:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&family=Manufacturing+Consent&display=swap" />
```

Without this, the theme falls back to system fonts (heading falls through Manufacturing Consent → UnifrakturMaguntia → Old English Text MT → serif).

## Reviewed palette and compatibility ramp

Gothic keeps its generation request in `palette.config.json`, the reviewed
`astryx-oklch-v1` output in `src/gothicPalettes.generated.ts`, and the detached
generation receipt beside it. The maintained theme renders selected values from
that private generated palette.

The public `gothicPalettes.family[stop]` export shown below is a frozen released
compatibility ramp, not the palette the maintained theme renders. Its numeric
stops and each family's `hue` and `chroma` metadata remain byte-identical in
`gothicTheme.ts` so existing consumers do not need to migrate.

The palette is dark-only. It preserves Gothic's pastel categorical colors and
uses deliberate jewel-tone anchors for syntax highlighting. The complete
generated palette is private authoring data; the runtime theme imports only the
selected stops in `gothicPaletteRefs.generated.ts`.

Use semantic theme tokens in components. Gothic's theme source maps the roles
it owns to named palette stops; components never read raw palette values
directly. The prebuilt theme and CSS contain resolved values. Changing the
palette must include the regenerated receipt, selected-reference module, token
diff, tests, and visual review. Keep `gothicTheme.ts` and the CLI template copy
synchronized when changing a mapping.

```ts
import {gothicPalettes} from '@astryxdesign/theme-gothic';

const purple = gothicPalettes.purple[80];
const neutral = gothicPalettes.neutral[10];
```

The palette is an authoring and audit reference, not a component styling API,
chart-color API, or accessibility guarantee. Components should read semantic
tokens, charts should use the data-visualization color API, and every custom
foreground/background pair still needs contextual contrast verification.
