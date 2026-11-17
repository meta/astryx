# @astryxdesign/theme-glass

**Dark-only** theme for Astryx dashboards and data-dense apps: a deep navy
canvas with soft glows, glass cards with a light top edge, and one vivid hue per
colored card. Uses Figtree for body and heading text, and
[Lucide](https://lucide.dev) icons.

> Glass is a single-mode theme: it always renders dark, whatever the user's
> system color preference. For the best browser-chrome integration (scrollbars,
> native form controls), pass `mode="dark"` to your `Theme` provider.

## Install

```bash
npm install @astryxdesign/theme-glass
```

## Usage

Wrap your app with `Theme` and pass the theme:

```tsx
import {Theme} from '@astryxdesign/core/theme';
import {glassTheme} from '@astryxdesign/theme-glass/built';

function App() {
  return (
    <Theme theme={glassTheme} mode="dark">
      {/* your app */}
    </Theme>
  );
}
```

### Import paths

| Path                                  | Use case                                                    |
| ------------------------------------- | ----------------------------------------------------------- |
| `@astryxdesign/theme-glass`           | Source build (StyleX compilation via `@astryxdesign/build`) |
| `@astryxdesign/theme-glass/built`     | Pre-built dist (Tailwind, plain CSS, or no build step)      |
| `@astryxdesign/theme-glass/theme.css` | Pre-built CSS file (import in your stylesheet)              |
| `@astryxdesign/theme-glass/fonts.css` | Figtree from Google Fonts                                   |

If you're using `@astryxdesign/build` for StyleX source compilation, import from
the bare path. Otherwise, use `/built`.

### CSS import

Add the theme CSS to your stylesheet:

```css
@import '@astryxdesign/theme-glass/theme.css';
```

## Color a card

`<Card variant="blue">` (or `cyan`, `gray`, `green`, `orange`, `pink`,
`purple`, `red`, `teal`, `yellow`) tints the card from its top-left corner,
gives it a hued edge, and points its accent at the hue. Charts, progress bars,
links, and focus rings inside the card then match it. A card with no variant is
plain glass.

```tsx
<Card variant="purple">
  <Heading level={3}>Weekly active</Heading>
  <ProgressBar value={72} label="Goal" />
</Card>
```

Pages name variants and tokens, never Glass's colors, so they render in every
other theme too.

## Aesthetic

Glass is dark-only by design: every color token is a single value, and the
output CSS contains no `light-dark()`, so the theme renders the same whether
the user prefers light or dark.

| Aspect      | Choice                                                      |
| ----------- | ----------------------------------------------------------- |
| Mode        | Dark only, no light variant                                 |
| Canvas      | Deep navy (#060A17); purple and cyan glows on the app shell |
| Cards       | Glass: a cool tint from the top-left corner, a light edge   |
| Accent      | Bright blue (#6EA8FF)                                       |
| Categorical | One vivid hue per card; data colors match the card hues     |
| Radius      | 1.25rem containers, 0.625rem elements                       |
| Spacing     | 16px card padding (spacing step 4)                          |
| Type scale  | 14px base, 1.2 ratio; 16px base on touch and narrow screens |

## Fonts

| Role    | Font         |
| ------- | ------------ |
| Body    | Figtree      |
| Heading | Figtree      |
| Code    | ui-monospace |

**Figtree must be loaded separately.** The theme references it by name but does
not bundle the font files. Import `@astryxdesign/theme-glass/fonts.css`, or add
this to your HTML `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  rel="stylesheet"
  href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&display=swap" />
```

Without it, the theme falls back to system fonts.

## Palette

Glass keeps its generation request in `palette.config.json`, the reviewed
`astryx-oklch-v2` output in `src/glassPalettes.generated.ts`, and the detached
generation receipt beside it. The runtime theme imports only the selected stops
in `src/glassPaletteRefs.generated.ts`; the complete palette is private
authoring data.

Use semantic theme tokens in components. Glass's theme source maps the roles it
owns to named palette stops, and the prebuilt theme and CSS contain resolved
values. A palette change includes the regenerated receipt, the selected-reference
module (`pnpm generate:glass-palette-refs`), the tests, and a visual review.
Every custom foreground and background pair still needs its own contrast check.
