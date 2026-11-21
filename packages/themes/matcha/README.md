# @astryxdesign/theme-matcha

Earthy green theme with Playwrite US Trad for headings and DM Sans for body text. Uses [Lucide](https://lucide.dev) icons.

## Install

```bash
npm install @astryxdesign/theme-matcha
```

## Usage

Wrap your app with `Theme` and pass the theme:

```tsx
import {Theme} from '@astryxdesign/core/theme';
import {matchaTheme} from '@astryxdesign/theme-matcha/built';

function App() {
  return <Theme theme={matchaTheme}>{/* your app */}</Theme>;
}
```

### Import paths

| Path                                   | Use case                                                    |
| -------------------------------------- | ----------------------------------------------------------- |
| `@astryxdesign/theme-matcha`           | Source build (StyleX compilation via `@astryxdesign/build`) |
| `@astryxdesign/theme-matcha/built`     | Pre-built dist (Tailwind, plain CSS, or no build step)      |
| `@astryxdesign/theme-matcha/theme.css` | Pre-built CSS file (import in your stylesheet)              |

If you're using `@astryxdesign/build` for StyleX source compilation, import from the bare path. Otherwise, use `/built`.

### CSS import

Add the theme CSS to your stylesheet:

```css
@import '@astryxdesign/theme-matcha/theme.css';
```

## Approved palette

Matcha keeps its generation request in `palette.config.json`, the reviewed
`astryx-oklch-v1` output in `src/matchaPalettes.generated.ts`, and the detached
generation receipt beside it. The palette uses separate light and dark ramps;
Tea Gold is generated from an anchorless golden seed so the family stays smooth.
The runtime theme imports only the selected stops in
`matchaPaletteRefs.generated.ts`.

Use semantic theme tokens in components. Matcha's theme source maps the color
roles it owns to named palette stops; components never read raw palette values
directly. The full palette is a private authoring and audit artifact rather than
a package export, and the prebuilt theme and CSS contain only resolved values.
Changing the palette must include the regenerated receipt,
selected-reference module, token diff, tests, and visual review. Keep
`matchaTheme.ts` and the CLI template copy synchronized when changing a mapping.

The palette is not a component styling API, chart-color API, or accessibility
guarantee. Components should read semantic tokens, charts should use the
data-visualization color API, and every custom foreground/background pair still
needs contextual contrast verification.

## Fonts

This theme uses custom typefaces:

| Role    | Font              |
| ------- | ----------------- |
| Body    | DM Sans           |
| Heading | Playwrite US Trad |
| Code    | JetBrains Mono    |

**Load them with the theme's font stylesheet.** It loads each font from font files shipped in this package (in `fonts/`, with their licenses), each with `font-display: fallback`, so a page never waits on a network; served from the same machine or a fast connection, the text first draws in the theme's fonts (a face that takes more than about 3 s leaves that page in the fallback font) (an offline machine, a sandbox, CI):

```css
@import '@astryxdesign/theme-matcha/fonts.css';
```

To use Google Fonts' CDN instead, add its stylesheet to your page in place of the import: `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&family=Playwrite+US+Trad&display=swap" />`.

Without it, the theme falls back to system fonts.
