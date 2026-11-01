# @astryxdesign/build

Build plugins for Astryx source builds. In the webpack and Vite setups, its babel, PostCSS, and Vite integrations compile Astryx library and product code with separate class name prefixes, which enables independent CSS layers:

```
reset < astryx-base (library, astryx prefix) < astryx-theme < product (app, x prefix)
```

Under Turbopack, `withAstryx()` and `@astryxdesign/build/next/postcss` compile Astryx the way its prebuilt stylesheets are compiled: the same class names, in `@layer astryx-base`.

## Why?

StyleX generates atomic CSS: same declaration = same class name. Without separate prefixes, library and product classes collide and can't be placed in independent CSS layers, which breaks theme overrides.

In the webpack and Vite setups, `@astryxdesign/build` solves this by:

1. Compiling Astryx library code with `astryx` prefix (`.astryx78zum5`)
2. Compiling product code with default `x` prefix (`.x78zum5`)
3. Placing each group in its own CSS `@layer`
4. Rejecting unsupported StyleX declarations instead of silently omitting them

## Packages

| Export                             | Purpose                                      | Platform                     |
| ---------------------------------- | -------------------------------------------- | ---------------------------- |
| `@astryxdesign/build/babel`        | Babel plugin: splits class prefixes per file | Next.js, any babel pipeline  |
| `@astryxdesign/build/postcss`      | PostCSS plugin: compiles + splits CSS layers | Next.js (webpack)            |
| `@astryxdesign/build/next`         | `withAstryx()`: the Next.js config helper    | Next.js (webpack, Turbopack) |
| `@astryxdesign/build/next/postcss` | PostCSS plugin: `@astryx;`                   | Next.js (Turbopack)          |
| `@astryxdesign/build/vite`         | Vite plugin: wraps unplugin + splits layers  | Vite, Storybook              |

## Install

```bash
npm install -D @astryxdesign/build @stylexjs/babel-plugin @babel/core
```

For Vite, also install:

```bash
npm install -D @stylexjs/unplugin
```

---

## Next.js Setup (Turbopack)

Under Turbopack, the default bundler since Next.js 16, `withAstryx()` compiles the
Astryx modules your app imports from source as the prebuilt stylesheets are compiled,
and `@astryxdesign/build/next/postcss` emits each source-built package's prebuilt
stylesheet from that source: the same rules and selectors, in the same order, inside
`@layer astryx-base`. Installed and workspace-linked packages both work; Astryx needs
no Babel config.

1. `next.config.mjs`, around your config and its own `turbopack.rules`:

   ```js
   import {withAstryx} from '@astryxdesign/build/next';
   export default withAstryx({/* your Next.js config */});
   ```

2. `postcss.config.js`, beside any plugin your app already uses:

   ```js
   module.exports = {plugins: {'@astryxdesign/build/next/postcss': {}}};
   ```

3. Your global stylesheet, with `@astryx;` in place of `astryx.css` and `lab.css` (only Core and Lab build from source, so keep any `richtext.css` or `charts.css` import):

   ```css
   @layer reset, astryx-base, astryx-theme;

   @import '@astryxdesign/core/reset.css';
   @import '@astryxdesign/theme-neutral/theme.css';

   @astryx;
   ```

Your own Turbopack rules are kept off Astryx source. Your Babel config file is not,
and Babel's `ignore` cannot exclude Astryx: to keep it off, set
`experimental.turbopackUseBuiltinBabel: false` and run `babel-loader` from a
`turbopack.rules` entry, which `withAstryx()` keeps off Astryx source like any rule.

## Next.js Setup (webpack)

These steps run under `next dev --webpack` and `next build --webpack`.

### 1. babel.config.js

```js
const path = require('path');

module.exports = {
  presets: ['next/babel'],
  plugins: [
    [
      '@astryxdesign/build/babel',
      {
        dev: process.env.NODE_ENV !== 'production',
        runtimeInjection: false,
        propertyValidationMode: 'throw',
        treeshakeCompensation: true,
        enableInlinedConditionalMerge: true,
        aliases: {
          '@astryxdesign/core/*': [
            path.join(__dirname, 'node_modules/@astryxdesign/core/*'),
          ],
          '@astryxdesign/core': [
            path.join(__dirname, 'node_modules/@astryxdesign/core'),
          ],
        },
        unstable_moduleResolution: {type: 'commonJS'},
      },
    ],
  ],
};
```

### 2. postcss.config.js

```js
const path = require('path');

module.exports = {
  plugins: {
    '@astryxdesign/build/postcss': {
      appDir: 'src',
      babelPlugins: [
        [
          '@stylexjs/babel-plugin',
          {
            dev: process.env.NODE_ENV !== 'production',
            runtimeInjection: false,
            treeshakeCompensation: true,
            enableInlinedConditionalMerge: true,
            aliases: {
              '@astryxdesign/core/*': [
                path.join(__dirname, 'node_modules/@astryxdesign/core/*'),
              ],
              '@astryxdesign/core': [
                path.join(__dirname, 'node_modules/@astryxdesign/core'),
              ],
            },
            unstable_moduleResolution: {type: 'commonJS'},
          },
        ],
      ],
    },
  },
};
```

### 3. next.config.mjs

Or `withAstryx()` from `@astryxdesign/build/next`, which sets both of these for you.
Either way the work happens in the `webpack` hook, so the build has to run with
`--webpack` — see the note at the top of this section.

```js
const nextConfig = {
  transpilePackages: ['@astryxdesign/core', '@astryxdesign/theme-neutral'],
  webpack: config => {
    // Resolve to source TypeScript instead of dist
    config.resolve.conditionNames = ['source', 'import', 'require', 'default'];
    return config;
  },
};

export default nextConfig;
```

### 4. CSS files

`src/app/layers.css`:

```css
@layer reset, astryx-base, astryx-theme, product;
```

`src/app/globals.css`:

```css
@import './layers.css';
@import '@astryxdesign/core/reset.css';
@import '@astryxdesign/theme-neutral/theme.css';

@stylex;
```

> `layers.css` must be a separate file because webpack hoists `@import` content above inline CSS.

### 5. Browserslist

```json
{
  "browserslist": ["last 1 Chrome version"]
}
```

---

## Vite Setup

```ts
import {astryxStylex} from '@astryxdesign/build/vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    ...astryxStylex({
      stylexOptions: {
        dev: process.env.NODE_ENV === 'development',
        runtimeInjection: false,
        propertyValidationMode: 'throw',
        treeshakeCompensation: true,
        unstable_moduleResolution: {
          type: 'commonJS',
          rootDir: __dirname,
        },
      },
    }),
    react(),
  ],
  resolve: {
    alias: {
      '@astryxdesign/core': path.resolve(
        __dirname,
        'node_modules/@astryxdesign/core/src',
      ),
    },
  },
  optimizeDeps: {
    exclude: ['@astryxdesign/core', '@astryxdesign/theme-neutral'],
  },
});
```

---

## How it works

### Babel plugin (`@astryxdesign/build/babel`)

Wraps `@stylexjs/babel-plugin` with two internal instances: one with `classNamePrefix: 'astryx'` for library files, one with default `'x'` for product files. Routes each file to the correct instance based on its path.

Library patterns (configurable):

- `packages/core/`
- `packages/themes/`
- `node_modules/@astryxdesign/`

### PostCSS plugin (`@astryxdesign/build/postcss`)

Compiles StyleX from both library and product source files in two separate passes with different prefixes. Wraps the results in named `@layer` blocks:

- Library rules → `@layer astryx-base`
- Product rules → `@layer product`

### Vite plugin (`@astryxdesign/build/vite`)

Wraps `@stylexjs/unplugin` and intercepts the dev CSS endpoint (`/virtual:stylex.css`). Partitions the collected rules by file path and serves split-layer CSS. Production builds write those rules to one cache-safe shared stylesheet and link it from every emitted HTML entry, without cross-loading entry-owned CSS.

Unsupported declarations fail the build by default with StyleX's replacement guidance. Set `propertyValidationMode` explicitly in `stylexOverrides` (modern API) or `stylexOptions` (legacy API) only when a migration needs the upstream `warn` or `silent` behavior.

A production build also checks the StyleX stylesheet for generated custom properties (`--<prefix><hash>`) that it reads but no stylesheet in the build declares, which browsers drop: a `.stylex.ts` export read in a style that is not a `defineVars`/`defineConsts` value, or one whose module never reached the build. It warns, naming the variable and the rule that reads it. Only stylesheets count as declarations, so a property the app sets at runtime (an inline style) is reported too: give it a name outside the StyleX class-name prefixes.

---

## Advanced Options

### Babel plugin

```js
[
  '@astryxdesign/build/babel',
  {
    // Patterns to identify library files (default shown)
    libraryPatterns: [
      'packages/core/',
      'packages/themes/',
      'node_modules/@astryxdesign/',
    ],

    // Class name prefix for library styles (default: 'astryx')
    libraryPrefix: 'astryx',

    // Class name prefix for product styles (default: 'x')
    classNamePrefix: 'x',

    // ... all @stylexjs/babel-plugin options
  },
];
```

### PostCSS plugin

```js
'@astryxdesign/build/postcss': {
  appDir: 'src',           // Your app source directory
  babelPlugins: [...],     // StyleX babel plugin config
  libraryPrefix: 'astryx',   // Prefix for library CSS (default: 'astryx')
  extraInclude: [...],     // Additional glob patterns
  layers: {                // Layer names (defaults shown)
    library: 'astryx-base',
    product: 'product',
  },
}
```

## Related

- [example-nextjs-source](../../apps/example-nextjs-source/): full Next.js source build example
- [`@stylexjs/babel-plugin`](https://github.com/facebook/stylex): the underlying StyleX compiler
