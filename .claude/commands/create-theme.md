# Create Astryx Theme

Create a new Astryx theme using `defineTheme`.

> Read `packages/cli/assets/theme.template.ts` first (`astryx theme template` writes it into a consumer project). It is the annotated,
> drift-guarded map of the whole theme surface — every field, the token
> families, the override syntax — and it names the CLI command that prints the
> authoritative reference for each. What follows is the packaging around a
> theme; the template is what goes inside it.

## Theme Name

$ARGUMENTS

## Instructions

Create a new theme package at `packages/themes/{themeName}/`.

### File Structure

```
packages/themes/{themeName}/
├── package.json
└── src/
    └── index.ts
```

### package.json

```json
{
  "name": "@astryxdesign/theme-{themeName}",
  "version": "0.0.1",
  "private": false,
  "description": "{Description} theme for Astryx",
  "license": "MIT",
  "sideEffects": false,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./theme.css": "./dist/theme.css"
  },
  "files": ["dist", "src"],
  "scripts": {
    "build:theme": "astryx theme build src/index.ts -o dist/theme.css"
  },
  "peerDependencies": {
    "@astryxdesign/core": "*"
  },
  "devDependencies": {
    "@astryxdesign/cli": "*"
  }
}
```

### Theme File (src/index.ts)

```tsx
import {defineTheme} from '@astryxdesign/core/theme';

export const {themeName}Theme = defineTheme({
  name: '{themeName}',

  tokens: {
    // Colors — use [light, dark] tuples for automatic light-dark() conversion
    '--color-accent': ['#YOUR_LIGHT', '#YOUR_DARK'],
    '--color-accent-muted': ['#YOUR_LIGHT33', '#YOUR_DARK3F'],
    '--color-background-surface': ['#FFFFFF', '#1C1C1C'],
    '--color-background-body': ['#F5F5F5', '#121212'],

    // Radius — customize for different feel
    '--radius-page': '28px',
    '--radius-container': '12px',
    '--radius-element': '8px',
    '--radius-inner': '4px',

    // Typography — font families
    '--font-family-body': '-apple-system, BlinkMacSystemFont, sans-serif',
    '--font-family-heading': '-apple-system, BlinkMacSystemFont, sans-serif',
    '--font-family-code': '"SF Mono", Monaco, Consolas, monospace',

    // Only include tokens you want to override.
    // See packages/core/src/theme/tokens.stylex.ts for all available tokens.
  },

  components: {
    // Component style overrides using CSS class selectors
    // Keys: 'base' for all instances, 'prop:value' for variants
    button: {
      base: { fontWeight: '600' },
      'variant:secondary': { backgroundColor: 'rgba(0,0,0,0.06)' },
    },
    heading: {
      'level:1': {
        fontFamily: 'var(--font-family-heading)',
        fontSize: 'var(--font-size-2xl)',
        fontWeight: 'var(--font-weight-semibold)',
        lineHeight: '1.2',
        color: 'var(--color-text-primary)',
        margin: '0',
      },
      // ... levels 2-6
    },
    text: {
      'type:body': {
        fontFamily: 'var(--font-family-body)',
        fontSize: 'var(--font-size-base)',
        fontWeight: 'var(--font-weight-normal)',
        lineHeight: 'var(--leading-base)',
        color: 'var(--color-text-primary)',
        margin: '0',
      },
      // ... other types: large, label, supporting, code
    },
  },

  // Optional: icon registry (import from a separate icons file)
  // icons: myIconRegistry,
});
```

## Key Concepts

### Token Values

- **String**: Used as-is for both light and dark modes
- **[light, dark] tuple**: Converted to CSS `light-dark(light, dark)`

### Component Override Keys

- `base` — styles applied to all instances
- `prop:value` — styles when a visual prop matches (e.g. `variant:secondary`)
- `prop:value+prop:value` — intersection of multiple props (e.g. `variant:editorial+level:1`)

### CSS Output

Component overrides generate scoped CSS:

```css
@scope ([data-astryx-theme="{themeName}"]) to ([data-astryx-theme]) {
  .astryx-button[data-variant='secondary'] {
    background-color: ...;
  }
  .astryx-heading[data-level='1'] {
    font-size: var(--font-size-2xl);
  }
}
```

### Distribution

- **Unbuilt**: `Theme` generates CSS and injects `<style>` at runtime
- **Built**: `astryx theme build` pre-compiles to a CSS file

## Extending an Existing Theme

Use `extends` to derive from another theme — inherits tokens, components, icons, fonts. Only specify overrides.

```tsx
import {defineTheme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme-neutral';

export const brandTheme = defineTheme({
  name: 'brand',
  extends: neutralTheme,
  icons: myIcons, // swap icons
  tokens: {
    '--color-accent': ['#7B61FF', '#9B85FF'], // override accent
  },
});
```

Child values win. Tokens and components are deep-merged; scale configs (typography, motion, radius) replace entirely.

## Reference

See existing themes for examples:

- `packages/themes/neutral/src/neutralTheme.ts` — Grayscale reference theme with Geist font
- `packages/themes/stone/src/stoneTheme.ts` — Warm neutral theme with component overrides
- `packages/themes/y2k/src/y2kTheme.ts` — Showcase theme with bold component overrides

## After Creation

1. Add to workspace in root `package.json` if needed
2. Add theme to Storybook preview: `apps/storybook/.storybook/preview.tsx`
3. Test in both light and dark modes
