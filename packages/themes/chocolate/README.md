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

**Load them with the theme's font stylesheet.** It loads each font from font files shipped in this package (in `fonts/`, with their licenses), each with `font-display: swap`, so a page draws at once with its fallback fonts and never waits on a network (an offline machine, a sandbox, CI):

```css
@import '@astryxdesign/theme-chocolate/fonts.css';
```

To load them from Google Fonts instead, import `@astryxdesign/theme-chocolate/fonts.google.css`; a page offline then waits on that request.

Without it, the theme falls back to system fonts.
