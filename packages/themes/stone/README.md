# @astryxdesign/theme-stone

Warm stone and slate theme with earthy neutral tones. Uses Montserrat for headings, Figtree for body text, and [Lucide](https://lucide.dev) icons.

## Install

```bash
npm install @astryxdesign/theme-stone
```

## Usage

Wrap your app with `XDSTheme` and pass the theme:

```tsx
import {XDSTheme} from '@astryxdesign/core/theme';
import {stoneTheme} from '@astryxdesign/theme-stone/built';

function App() {
  return <XDSTheme theme={stoneTheme}>{/* your app */}</XDSTheme>;
}
```

### Import paths

| Path                                  | Use case                                                    |
| ------------------------------------- | ----------------------------------------------------------- |
| `@astryxdesign/theme-stone`           | Source build (StyleX compilation via `@astryxdesign/build`) |
| `@astryxdesign/theme-stone/built`     | Pre-built dist (Tailwind, plain CSS, or no build step)      |
| `@astryxdesign/theme-stone/theme.css` | Pre-built CSS file (import in your stylesheet)              |

If you're using `@astryxdesign/build` for StyleX source compilation, import from the bare path. Otherwise, use `/built`.

## Approved palette

Stone keeps its generation request in `palette.config.json`, the reviewed
`astryx-oklch-v1` output in `src/stonePalettes.generated.ts`, and the detached
generation receipt beside it. `stonePaletteRefs.generated.ts` provides the
small runtime projection consumed by the maintained theme.

The palette preserves Stone's exact configured neutral and pastel anchors while
generating separate light and dark ramps. Green, Yellow, Teal, and Cyan use
reviewed re-seeded midtones rather than preserving their released compatibility
ramp values. The complete palette remains available for authoring and audits; the
runtime theme imports only the selected stops in
`stonePaletteRefs.generated.ts`.

Use semantic theme tokens in components. Stone's theme source maps those roles
to named palette stops; components never read raw palette values directly. The
prebuilt theme and CSS contain resolved values. Changing the generated palette
must include the regenerated receipt, selected-reference module, token diff,
tests, and visual review. Keep `stoneTheme.ts` and the CLI template copy
synchronized when changing a mapping.

The bare package export preserves the original `stonePalettes.family[stop]`,
`stonePalettes.family.hue`, and `stonePalettes.family.chroma` shape. The generated
light and dark ramps are private authoring artifacts used by the maintained theme,
tests, and review tooling rather than an expanded public palette API:

```ts
import {stonePalettes} from '@astryxdesign/theme-stone';

const existingSharedRampValue = stonePalettes.orange[90];
```

The palette is an authoring and audit reference, not a component styling API,
chart-color API, or accessibility guarantee. Components should read semantic
tokens, charts should use the data-visualization color API, and every custom
foreground/background pair still needs contextual contrast verification.

### CSS import

Add the theme CSS to your stylesheet:

```css
@import '@astryxdesign/theme-stone/theme.css';
```

## Fonts

This theme uses custom typefaces:

| Role    | Font           |
| ------- | -------------- |
| Body    | Figtree        |
| Heading | Montserrat     |
| Code    | JetBrains Mono |

**These fonts must be loaded separately.** The theme references them by name but does not bundle the font files.

Add this to your HTML `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  rel="stylesheet"
  href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&family=Montserrat:wght@400;500;600;700&display=swap" />
```

Without this, the theme falls back to system fonts.
