# Astryx Example: Vite

Reference application for building **@astryxdesign/core** from source in a Vite + React project.

Most apps don't need a source build. Astryx ships pre-built CSS: import `@astryxdesign/core/reset.css`, `@astryxdesign/core/astryx.css` and a theme's `theme.css`, and no build plugin is needed (see the [Vite quick start](../../packages/core/README.md#vite)). This example shows the other path: it compiles Astryx's TypeScript and StyleX source in your app with `astryxStylex()` from `@astryxdesign/build/vite`, which wraps `@stylexjs/unplugin`.

The [Next.js example](../example-nextjs/) uses the pre-built CSS path.

## Setup Steps

### 1. Install dependencies

```bash
npm install @stylexjs/stylex @astryxdesign/core @astryxdesign/theme-neutral react react-dom
npm install --save-dev @astryxdesign/build @stylexjs/unplugin @vitejs/plugin-react \
  typescript @types/react @types/react-dom vite
```

### 2. Browserslist

Add a `browserslist` to `package.json` so that Vite's CSS pipeline targets modern browsers. Astryx tokens use native `light-dark()` (baseline 2024); without modern targets, lightningcss lowers it into polyfill variables that break theming:

```json
{
  "browserslist": ["last 1 Chrome version"]
}
```

> For internal tools targeting latest Chrome, `"last 1 Chrome version"` is sufficient. For broader browser support, use targets that include Chrome 123+ / Firefox 120+ / Safari 17.5+ (when `light-dark()` shipped).

### 3. Vite config

`vite.config.ts`:

```ts
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {astryxStylex} from '@astryxdesign/build/vite';

export default defineConfig({
  plugins: [...astryxStylex(), react()],
});
```

`astryxStylex()` sets up StyleX compilation, the CSS layer order (reset < astryx-base < astryx-theme < product), the `resolve.alias` to the `@astryxdesign/core` source, `optimizeDeps.exclude` so Vite does not pre-bundle Astryx, and Lightning CSS targets that keep `light-dark()`. Plugin order matters: spread `astryxStylex()` before `react()`.

### 4. CSS entry point

`src/index.css`: a minimal CSS file so Vite emits a CSS asset for StyleX to append to:

```css
:root {
  --stylex-injection: 0;
}
```

Import it in `src/main.tsx`, along with the base reset and theme CSS:

```tsx
import '@astryxdesign/core/reset.css';
import '@astryxdesign/theme-neutral/theme.css';
import './index.css';
```

The CSS import order matters:

1. `reset.css`: baseline resets (`@layer reset`)
2. `theme.css`: theme token overrides (`@layer astryx-theme`)
3. `index.css`: StyleX extraction placeholder

The source build compiles the component styles, so this example does not import `@astryxdesign/core/astryx.css`.

### 5. Theme provider

Wrap your app with `Theme` and the default theme:

```tsx
import {Theme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme-neutral';

export default function App() {
  return <Theme theme={neutralTheme}>{/* your app */}</Theme>;
}
```

No `'use client'` needed; Vite doesn't have server/client boundaries.

## Commands

```bash
# Start dev server with HMR
npm run dev

# Production build
npm run build

# Preview the production build
npm run preview
```

## Gotchas

| Issue                   | Symptom                                    | Fix                                                                       |
| ----------------------- | ------------------------------------------ | ------------------------------------------------------------------------- |
| Old browser targets     | Colors broken: `light-dark()` gets lowered | Keep the `browserslist` above; don't pass older `lightningcssTargets`     |
| Missing CSS entry point | StyleX has no CSS asset to append to       | Create a minimal `index.css` and import it in `main.tsx`                  |
| Plugin order            | Styles not extracted or HMR broken         | Spread `astryxStylex()` before `react()` in the plugins array             |
| Duplicate React types   | JSX component type errors in monorepo      | Known monorepo issue with `@types/react` hoisting; doesn't affect runtime |

## Testing outside the monorepo

This example lives in the Astryx monorepo for convenience, but it should be representative of a real app consuming `@astryxdesign/core` from npm. Monorepo workspace symlinks can silently bypass issues that external consumers hit (Vite dep pre-bundling, missing dependencies, wrong resolve paths).

**Before merging changes to this example, test it as an external consumer.** See the [Testing Example Apps](https://github.com/meta/astryx/wiki/Testing-Example-Apps) wiki page for the full procedure.

## Related

- [Issue #145: Example apps for source distribution consumers](https://github.com/meta/astryx/issues/145)
- [StyleX Vite React example](https://github.com/facebook/stylex/tree/main/examples/example-vite-react)
- [Astryx Example: Next.js](../example-nextjs/)
