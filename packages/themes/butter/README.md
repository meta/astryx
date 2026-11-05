# @astryxdesign/theme-butter

Golden buttery theme for Astryx with blue accents. Sarina for display type, Outfit for headings and body.

## Install

```bash
npm install @astryxdesign/theme-butter
```

## Usage

```tsx
import {butterTheme} from '@astryxdesign/theme-butter/built';
import {XDSTheme} from '@astryxdesign/core/theme';
import '@astryxdesign/theme-butter/theme.css';

function App() {
  return <XDSTheme theme={butterTheme}>{/* Your app content */}</XDSTheme>;
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

Sarina and Outfit ship via Google Fonts. Add the appropriate
`<link rel="stylesheet" href="...">` to your document `<head>` to avoid
runtime font fetching.
