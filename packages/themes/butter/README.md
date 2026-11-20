# @astryxdesign/theme-butter

Golden buttery theme for Astryx with blue accents. Sarina for display type, Outfit for headings and body.

## Install

```bash
npm install @astryxdesign/theme-butter
```

## Usage

```tsx
import {butterTheme} from '@astryxdesign/theme-butter/built';
import {Theme} from '@astryxdesign/core/theme';
import '@astryxdesign/theme-butter/theme.css';

function App() {
  return <Theme theme={butterTheme}>{/* Your app content */}</Theme>;
}
```

## Colors

Butter's approved palette is generated from `palette.config.json`. It contains
complete light and dark ramps for the warm neutral, signature blue, and nine
categorical families. `#225BFF` and `#FDEE8C` are exact anchors for Butter's
signature blue and yellow. Green remains anchorless so its ramp stays smooth.

Theme and component roles use semantic tokens backed by the small generated
`butterPaletteRefs` selection. Components should consume those semantic tokens,
not raw palette values. Error, warning, and success share Red, Yellow, and Green
rather than maintaining duplicate ramps. Data-visualization colors remain
separate and are not overridden by this theme.

The existing `butterPalettes` export remains unchanged as a compatibility
snapshot. The complete reviewed mode-aware palette is private to authoring,
tests, and selected-reference generation, so adopting it does not change the
public API shape or force the full candidate into theme evaluation.

After changing `palette.config.json`, regenerate the candidate and receipt with:

```bash
pnpm -F @astryxdesign/theme-butter exec astryx theme palette generate \
  palette.config.json \
  --out src/butterPalettes.generated.ts \
  --preview .tmp-butter-palette-preview.html \
  --overwrite
```

Keep the standard copyright header on the committed TypeScript candidate, review
the preview in both modes, remove `.tmp-butter-palette-preview.html`, then run
`pnpm generate:butter-palette-refs`. Keep the theme package and CLI template
copies synchronized.

## Typography

- **Display**: Sarina (cursive), applied per-page via inline style.
- **Heading & Body**: Outfit, base 14px, ratio 1.25.
- **Code**: JetBrains Mono.

The theme's font stylesheet loads Sarina, Outfit and JetBrains Mono from font
files shipped in this package (in `fonts/`, with their licenses), each with
`font-display: fallback`, so a page never waits on a network; served from the same
machine or a fast connection, the text first draws in the theme's fonts (a face
that takes more than about 3 s leaves that page in the fallback font):

```css
@import '@astryxdesign/theme-butter/fonts.css';
```

To use Google Fonts' CDN instead, add its stylesheet to your page in place of the import: `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Outfit:wght@400;500;600;700&family=Sarina&display=swap" />`.
