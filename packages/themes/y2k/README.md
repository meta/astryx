# @astryxdesign/theme-y2k

Playful Y2K pop theme for Astryx: a soft periwinkle body, charcoal accent, holographic categorical colors derived from HCT tonal palettes, Poppins for body/headings, and a Crimson Text serif for display sizes.

## Install

```bash
npm install @astryxdesign/theme-y2k
```

## Usage

Wrap your app with `XDSTheme` and pass the theme:

```tsx
import {XDSTheme} from '@astryxdesign/core/theme';
import {y2kTheme} from '@astryxdesign/theme-y2k/built';

function App() {
  return <XDSTheme theme={y2kTheme}>{/* your app */}</XDSTheme>;
}
```

### Import paths

| Path                                | Use case                                                    |
| ----------------------------------- | ----------------------------------------------------------- |
| `@astryxdesign/theme-y2k`           | Source build (StyleX compilation via `@astryxdesign/build`) |
| `@astryxdesign/theme-y2k/built`     | Pre-built dist (Tailwind, plain CSS, or no build step)      |
| `@astryxdesign/theme-y2k/theme.css` | Pre-built CSS file (import in your stylesheet)              |

If you're using `@astryxdesign/build` for StyleX source compilation, import from the bare path. Otherwise, use `/built`.

### CSS import

Add the theme CSS to your stylesheet:

```css
@import '@astryxdesign/theme-y2k/theme.css';
```

## Colors

Y2K's approved palette is generated from `palette.config.json`. It contains
complete light and dark ramps for neutral, signature periwinkle, and nine
categorical families. The light neutral keeps Y2K's warm canvas, while the dark
neutral follows the navy dark surfaces from `#0E0F1A` toward lavender `#EDEFFC`.
The periwinkle body `#CCCFFA` and neon green
`#C5E17A` are exact anchors. Blue uses an anchorless electric ramp while its
component surface stays close to the original airy blue.

Theme and component roles use semantic tokens backed by the small generated
`y2kPaletteRefs` selection. Components should consume those semantic tokens,
not raw palette values. Data-visualization colors remain separate and are not
overridden by this theme.

The existing `y2kPalettes` export remains unchanged as a compatibility
snapshot. The complete reviewed mode-aware palette is private to authoring,
tests, and selected-reference generation, so adopting it does not change the
public API shape or force the full candidate into theme evaluation.

After changing `palette.config.json`, regenerate the candidate and receipt with:

```bash
node packages/cli/clients/cli/bin/astryx.mjs theme palette generate \
  packages/themes/y2k/palette.config.json \
  --out packages/themes/y2k/src/y2kPalettes.generated.ts \
  --preview .tmp-y2k-palette-preview.html \
  --overwrite
```

Keep the standard copyright header on the committed TypeScript candidate,
review the preview in both modes, remove `.tmp-y2k-palette-preview.html`, then
run `pnpm generate:y2k-palette-refs`. Keep the theme package and CLI template
copies synchronized.

## Fonts

This theme uses custom typefaces:

| Role            | Font           |
| --------------- | -------------- |
| Body / Headings | Poppins        |
| Display         | Crimson Text   |
| Code            | JetBrains Mono |

**These fonts must be loaded separately.** The theme references them by name but does not bundle the font files.

Add this to your HTML `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  rel="stylesheet"
  href="https://fonts.googleapis.com/css2?family=Crimson+Text:ital,wght@0,400;0,600;0,700;1,400;1,600;1,700&family=JetBrains+Mono:wght@400;500;600;700&family=Poppins:wght@400;500;600;700&display=swap" />
```

Without this, the theme falls back to system fonts (Crimson Text falls back to a serif).
