# @astryxdesign/theme-chocolate

Warm chocolate theme with rich brown tones and cozy beige backgrounds. Uses Fraunces for headings, Albert Sans for body text, and [Lucide](https://lucide.dev) icons.

## Install

```bash
npm install @astryxdesign/theme-chocolate
```

## Usage

Wrap your app with `Theme` and pass the theme:

```tsx
import {Theme} from '@astryxdesign/core/theme';
import {chocolateTheme} from '@astryxdesign/theme-chocolate/built';

function App() {
  return <Theme theme={chocolateTheme}>{/* your app */}</Theme>;
}
```

### Import paths

| Path                                      | Use case                                                    |
| ----------------------------------------- | ----------------------------------------------------------- |
| `@astryxdesign/theme-chocolate`           | Source build (StyleX compilation via `@astryxdesign/build`) |
| `@astryxdesign/theme-chocolate/built`     | Pre-built dist (Tailwind, plain CSS, or no build step)      |
| `@astryxdesign/theme-chocolate/theme.css` | Pre-built CSS file (import in your stylesheet)              |

If you're using `@astryxdesign/build` for StyleX source compilation, import from the bare path. Otherwise, use `/built`.

### CSS import

Add the theme CSS to your stylesheet:

```css
@import '@astryxdesign/theme-chocolate/theme.css';
```

## Fonts

This theme uses custom typefaces:

| Role    | Font           |
| ------- | -------------- |
| Body    | Albert Sans    |
| Heading | Fraunces       |
| Code    | JetBrains Mono |

**Load them with the theme's font stylesheet.** It loads each font from font files shipped in this package (in `fonts/`, with their licenses), each with `font-display: fallback`, so a page never waits on a network; served from the same machine or a fast connection, the text first draws in the theme's fonts (a face that takes more than about 3 s leaves that page in the fallback font) (an offline machine, a sandbox, CI):

```css
@import '@astryxdesign/theme-chocolate/fonts.css';
```

To use Google Fonts' CDN instead, add its stylesheet to your page in place of the import: `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Albert+Sans:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" />`.

Without it, the theme falls back to system fonts.
