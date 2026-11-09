# Astryx Example: Vite

Reference application for consuming **@astryxdesign/core** as a source distribution in a Vite + React project.

Astryx ships as raw TypeScript + StyleX source. Consumers compile it at the application level; there's no pre-built CSS or JS bundle. This example shows the complete setup using `@stylexjs/unplugin`, which handles both StyleX compilation and CSS extraction in a single Vite plugin.

## How it differs from Next.js

| Concern             | Next.js                                                     | Vite                                 |
| ------------------- | ----------------------------------------------------------- | ------------------------------------ |
| StyleX integration  | Babel plugin + PostCSS plugin                               | `@stylexjs/unplugin` (single plugin) |
| CSS extraction      | PostCSS replaces `@stylex;` at-rule                         | Handled automatically by unplugin    |
| Config files needed | `babel.config.js` + `postcss.config.js` + `next.config.mjs` | `vite.config.ts` only                |
| Theme provider      | Needs `'use client'` boundary                               | No client/server boundary needed     |

## Setup Steps

### 1. Install dependencies

```bash
npm install @stylexjs/stylex @astryxdesign/core @astryxdesign/theme-neutral react react-dom
npm install --save-dev @stylexjs/unplugin @vitejs/plugin-react typescript \
  @types/react @types/react-dom vite
```

### 2. Browserslist

Add a `browserslist` to `package.json` so that both Vite's CSS pipeline and the StyleX unplugin target modern browsers. Astryx tokens use native `light-dark()` (baseline 2024); without modern targets, lightningcss lowers it into polyfill variables that break theming:

```json
{
  "browserslist": ["last 1 Chrome version"]
}
```

> For internal tools targeting latest Chrome, `"last 1 Chrome version"` is sufficient. For broader browser support, use targets that include Chrome 123+ / Firefox 120+ / Safari 17.5+ (when `light-dark()` shipped).

### 3. Vite config

`vite.config.ts`: configure the StyleX unplugin, React plugin, and resolve aliases:

```ts
import path from 'path';
import {fileURLToPath} from 'url';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import stylex from '@stylexjs/unplugin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Required: tells the StyleX plugin's internal lightningcss transform
// not to lower light-dark() into broken polyfill variables.
// Astryx tokens use light-dark() which is baseline 2024.
const lightningcssTargets = {
  chrome: 123 << 16,
  firefox: 120 << 16,
  safari: (17 << 16) | (5 << 8),
};

export default defineConfig({
  plugins: [
    // Declare CSS layer order so theme overrides beat component base styles.
    {
      name: 'astryx-css-layer-order',
      transformIndexHtml() {
        return [
          {
            tag: 'style',
            children:
              '@layer reset, priority1, priority2, priority3, priority4, priority5, priority6, priority7, priority8, priority9, astryx-theme;',
            injectTo: 'head-prepend',
          },
        ];
      },
    },
    stylex.vite({
      dev: process.env.NODE_ENV === 'development',
      runtimeInjection: false,
      treeshakeCompensation: true,
      useCSSLayers: true,
      unstable_moduleResolution: {
        type: 'commonJS',
        rootDir: __dirname,
      },
      // The StyleX unplugin runs its own internal lightningcss with
      // default targets of browserslist('>= 1%'). Override explicitly
      // so light-dark() is preserved as native CSS.
      lightningcssOptions: {
        targets: lightningcssTargets,
      },
    }),
    react(),
  ],
  resolve: {
    alias: {
      '@astryxdesign/core/theme/tokens.stylex': path.resolve(
        __dirname,
        'node_modules/@astryxdesign/core/src/theme/tokens.stylex.ts',
      ),
      '@astryxdesign/core': path.resolve(
        __dirname,
        'node_modules/@astryxdesign/core/src',
      ),
    },
  },
  // Prevent Vite from pre-bundling Astryx with esbuild. Astryx ships as source
  // that must be compiled by the StyleX plugin — pre-bundling strips the
  // stylex.create/defineVars calls and causes a runtime error.
  optimizeDeps: {
    exclude: ['@astryxdesign/core', '@astryxdesign/theme-neutral'],
  },
});
```

> **Important:** The `lightningcssOptions.targets` config is required; the StyleX unplugin's internal lightningcss defaults to `browserslist('>= 1%')` which includes Chrome 112, a browser that doesn't support `light-dark()`. Without explicit targets, all theming colors silently break. The `resolve.alias` points `@astryxdesign/core` to source so Vite compiles from TypeScript. Plugin order matters: `stylex.vite()` must come before `react()`.

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

| Issue                         | Symptom                                          | Fix                                                                                    |
| ----------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Missing `lightningcssOptions` | Colors broken: `light-dark()` gets lowered       | Add `lightningcssOptions: { targets: lightningcssTargets }` to StyleX plugin           |
| Vite pre-bundles Astryx       | `Unexpected stylex.defineVars at runtime`        | Add `optimizeDeps: { exclude: ['@astryxdesign/core', '@astryxdesign/theme-neutral'] }` |
| Missing resolve aliases       | Module not found errors for `@astryxdesign/core` | Add `resolve.alias` pointing to source directory                                       |
| Missing CSS entry point       | StyleX has no CSS asset to append to             | Create a minimal `index.css` and import it in `main.tsx`                               |
| Plugin order                  | Styles not extracted or HMR broken               | `stylex.vite()` must come before `react()` in the plugins array                        |
| Duplicate React types         | JSX component type errors in monorepo            | Known monorepo issue with `@types/react` hoisting; doesn't affect runtime              |

## Testing outside the monorepo

This example lives in the Astryx monorepo for convenience, but it should be representative of a real app consuming `@astryxdesign/core` from npm. Monorepo workspace symlinks can silently bypass issues that external consumers hit (Vite dep pre-bundling, missing dependencies, wrong resolve paths).

**Before merging changes to this example, test it as an external consumer.** See the [Testing Example Apps](https://github.com/meta/astryx/wiki/Testing-Example-Apps) wiki page for the full procedure.

## Related

- [Issue #145: Example apps for source distribution consumers](https://github.com/meta/astryx/issues/145)
- [StyleX Vite React example](https://github.com/facebook/stylex/tree/main/examples/example-vite-react)
- [Astryx Example: Next.js](../example-nextjs/)
