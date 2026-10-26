# @astryxdesign/core

Core UI components, theme system, and utilities for the Astryx design system. For project setup, see [Quick Start](#quick-start) below.

> **Building with an AI agent?** Add the CLI, then run `init`:
>
> ```bash
> npm install -D @astryxdesign/cli   # or: pnpm add -D / yarn add -D / bun add -d
> npx @astryxdesign/cli init         # the CLI you just installed
> ```
>
> `init` writes the Astryx component index into your `AGENTS.md`/`CLAUDE.md` so your agent discovers components, templates, and design tokens instead of guessing. Need a single command without installing? The same scoped command works: `npx @astryxdesign/cli <cmd>`. Always use the scoped name: the unscoped `astryx` resolves to an unrelated npm package until `@astryxdesign/cli` is a dependency. See [XDS CLI](#xds-cli).

## Component Docs

Look up any component's full API (props, variants, examples, best practices, and theming) via the Astryx CLI:

```bash
npx @astryxdesign/cli init                   # one-time: writes the component guide into AGENTS.md / CLAUDE.md
npx @astryxdesign/cli component Button        # full docs for a component
npx @astryxdesign/cli component --list        # list all components
```

> Use the scoped `@astryxdesign/cli`: it runs with or without installing, while the unscoped `astryx` resolves to an unrelated npm package until the CLI is a dependency.

## Page Layouts

Building a full page? Start with a template rather than composing from scratch.
Templates are content-only; they compose `Layout` with header, content, and
panel slots into common page patterns (dashboards, settings, forms, detail pages).
Wrap them in your own app chrome (`AppShell`, `TopNav`, `SideNav`) to add
global navigation.

Requires `@astryxdesign/cli` (`npm install -D @astryxdesign/cli`):

```bash
astryx template --list              # browse all page and block templates
astryx template dashboard           # emit full page source
astryx template settings --skeleton # layout skeleton with spatial annotations
```

## Astryx CLI

The CLI (`@astryxdesign/cli`) provides additional tooling:

```bash
astryx --help                       # full listing of all commands
astryx component Button             # full docs + related block templates
astryx docs                         # reference docs (principles, tokens, theming, styling)
astryx docs theme                   # theming guide (Theme, defineTheme, light/dark)
astryx docs tokens                  # spacing, color, radius, typography token reference
astryx init                         # initialize Astryx in your project
astryx theme build                  # build theme CSS for production
astryx swizzle Button               # eject component source for customization
astryx upgrade --apply              # run codemods to migrate between versions
astryx discover                     # discover external Astryx packages
astryx gap-report                   # report a missing capability
```

> Run these as `npx @astryxdesign/cli …`, or `pnpm exec astryx …` (or your package manager's equivalent) once the CLI is installed.

## Related Packages

| Package                                                                                               | Description                                                   |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| [`@astryxdesign/cli`](https://github.com/facebook/astryx/tree/main/packages/cli)                      | CLI tooling: component docs, templates, scaffolding, codemods |
| [`@astryxdesign/theme-neutral`](https://github.com/facebook/astryx/tree/main/packages/themes/neutral) | Muted, minimal theme (Lucide icons)                           |

## Resources

- [Component Storybook](https://astryx.atmeta.com/storybook/)
- [GitHub Repository](https://github.com/facebook/astryx)

---

## Quick Start

Astryx requires **React 19** or later (`react` and `react-dom` >= 19.0.0 are peer dependencies).

Install Astryx and a theme:

```bash
npm install @astryxdesign/core @astryxdesign/theme-neutral @stylexjs/stylex
```

Then pick your setup below based on your framework and styling approach.

### Next.js (simplest)

The fastest way to get started. No build plugins, no PostCSS, no Babel config — Astryx ships pre-built CSS and JS, so you import three stylesheets (order matters) and wrap your app in a theme provider.

**`src/app/globals.css`**

```css
@import '@astryxdesign/core/reset.css';
@import '@astryxdesign/core/astryx.css';
@import '@astryxdesign/theme-neutral/theme.css';
```

The import order maps to the layer cascade: `reset.css` (`@layer reset`) → `astryx.css` component styles (`@layer astryx-base`) → `theme.css` token overrides (`@layer astryx-theme`).

**`src/app/providers.tsx`**

```tsx
'use client';

import Link from 'next/link';
import {Theme} from '@astryxdesign/core/theme';
import {LinkProvider} from '@astryxdesign/core/Link';
import {neutralTheme} from '@astryxdesign/theme-neutral/built';

export function Providers({children}: {children: React.ReactNode}) {
  return (
    <Theme theme={neutralTheme}>
      <LinkProvider component={Link}>{children}</LinkProvider>
    </Theme>
  );
}
```

**`src/app/layout.tsx`**

```tsx
import './globals.css';
import {Providers} from './providers';

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

### Next.js + Tailwind

No build plugins needed; Astryx ships pre-built CSS that works alongside Tailwind.

**`src/app/globals.css`**

```css
@layer reset, theme, base, astryx-base, astryx-theme, components, utilities;

@import 'tailwindcss/theme.css' layer(theme);
@import 'tailwindcss/preflight.css' layer(base);
@import '@astryxdesign/core/reset.css';
@import '@astryxdesign/core/astryx.css';
@import '@astryxdesign/theme-neutral/theme.css';
@import '@astryxdesign/core/tailwind-theme.css';
@import 'tailwindcss/utilities.css' layer(utilities);
```

The `tailwind-theme.css` import maps system tokens to Tailwind utilities via `@theme reference inline`, so the mappings generate utilities without redeclaring the tokens at runtime:

```tsx
// Without the bridge — verbose:
<div className="rounded-[var(--radius-container)] bg-[var(--color-background-surface)] text-[var(--color-text-primary)]">

// With the bridge — just works:
<div className="rounded-lg bg-surface text-primary">
```

Some useful mappings:

| Tailwind class                                               | Astryx token                                                     |
| ------------------------------------------------------------ | ---------------------------------------------------------------- |
| `text-primary` / `text-secondary`                            | `--color-text-primary` / `--color-text-secondary`                |
| `bg-surface` / `bg-card` / `bg-body`                         | `--color-background-surface` / `card` / `body`                   |
| `border-border` / `border-strong`                            | `--color-border` / `--color-border-emphasized`                   |
| `bg-info` / `bg-success` / `bg-warning` / `bg-error`         | Strong status fills (`--color-<status>`)                         |
| `text-on-info` / `bg-info-muted` / `text-on-info-muted`      | Strong-fill content, pale fill, pale-fill content                |
| `text-success` / `text-warning` / `text-error` / `text-info` | Status text on the page (`--color-text-*`; also `text-status-*`) |
| `border-success` / `border-warning` / `border-error`         | Status borders (`--color-border-*`)                              |
| `bg-blue-subtle` / `border-blue-ring` / `text-blue-vivid`    | Hue palette (×10 hues)                                           |
| `rounded-sm` / `rounded-md` / `rounded-lg`                   | `--radius-inner` / `element` / `container`                       |
| `shadow-sm` / `shadow-md` / `shadow-lg`                      | `--shadow-low` / `med` / `high`                                  |

Spacing references `var(--spacing-1)` as the base unit, so `p-4` = 16px, matching Astryx's `--spacing-4`. Arbitrary values still work as an escape hatch: `bg-[var(--color-background-surface)]`.

**`src/app/providers.tsx`**

```tsx
'use client';

import Link from 'next/link';
import {Theme} from '@astryxdesign/core/theme';
import {LinkProvider} from '@astryxdesign/core/Link';
import {neutralTheme} from '@astryxdesign/theme-neutral/built';

export function Providers({children}: {children: React.ReactNode}) {
  return (
    <Theme theme={neutralTheme}>
      <LinkProvider component={Link}>{children}</LinkProvider>
    </Theme>
  );
}
```

**`src/app/layout.tsx`**

```tsx
import './globals.css';
import {Providers} from './providers';

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

That's it. Start using components:

```tsx
import {Button} from '@astryxdesign/core/Button';

export default function Page() {
  return <Button label="Hello Astryx" variant="primary" />;
}
```

### Next.js + StyleX

Use the pre-built dist alongside StyleX for your own styles.

```bash
npm install @astryxdesign/core @astryxdesign/theme-neutral @stylexjs/stylex
```

**`src/app/globals.css`**

```css
@import '@astryxdesign/core/reset.css';
@import '@astryxdesign/core/astryx.css';
@import '@astryxdesign/theme-neutral/theme.css';
```

Providers and layout are the same as the Tailwind example (use `@astryxdesign/theme-neutral/built`).

### Vite

```bash
npm install @astryxdesign/core @astryxdesign/theme-neutral @stylexjs/stylex
```

Same CSS imports and providers as above. No build plugins needed; Astryx ships pre-built.

### No build step (CDN)

For prototypes, embeds, or pages without a bundler, load the components straight
from a public CDN as ES modules. React 19 removed its UMD builds ("To load React
19 with a script tag, we recommend using an ESM-based CDN such as esm.sh"), so an
import map is the way in — there is no `window.React` left for a global bundle to
bind to.

The CLI writes this page for you, annotated and pinned to the version you have
installed:

```bash
npx @astryxdesign/cli template --cdn   # writes cdn.template.html
```

```html
<!doctype html>
<html lang="en" data-astryx-theme="neutral">
  <head>
    <meta charset="utf-8" />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&display=swap" />
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/npm/@astryxdesign/core@0.4.1/src/reset.css" />
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/npm/@astryxdesign/core@0.4.1/dist/astryx.css" />
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/npm/@astryxdesign/theme-neutral@0.4.1/dist/theme.css" />
    <script type="importmap">
      {
        "imports": {
          "react": "https://esm.sh/react@19.2.0",
          "react/jsx-runtime": "https://esm.sh/react@19.2.0/jsx-runtime",
          "react-dom": "https://esm.sh/react-dom@19.2.0",
          "react-dom/client": "https://esm.sh/react-dom@19.2.0/client",
          "@astryxdesign/core": "https://esm.sh/@astryxdesign/core@0.4.1?external=react,react-dom"
        }
      }
    </script>
    <style>
      body {
        font-family: var(--font-family-body);
      }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module">
      import * as React from 'react';
      import {createRoot} from 'react-dom/client';
      import {Card, Stack, Heading, Text, Button} from '@astryxdesign/core';
      const e = React.createElement;
      createRoot(document.getElementById('root')).render(
        e(
          Stack,
          {padding: 6, align: 'start'},
          e(
            Card,
            {maxWidth: 480, elevation: 'low'},
            e(
              Stack,
              {gap: 3, align: 'start'},
              e(Heading, {level: 1}, 'Hello from a CDN'),
              e(Text, null, 'No bundler, no install, no build step.'),
              e(Button, {variant: 'primary', label: 'Try me'}),
            ),
          ),
        ),
      );
    </script>
  </body>
</html>
```

Six details carry the whole recipe:

- **`data-astryx-theme` on `<html>`.** Theme CSS is scoped to that attribute, so
  without it the page renders with the built-in defaults instead of the theme you
  just loaded.
- **`?external=react,react-dom`.** Without it esm.sh bundles its own React and
  every hook throws `Cannot read properties of null (reading 'useState')`.
- **`react/jsx-runtime` in the import map.** The published bundle imports it;
  omit the entry and the page dies with `Failed to resolve module specifier`.
- **A font on `body`.** Nothing in the three stylesheets sets a document font:
  the theme styles prose elements and each component styles itself, and `Button`
  is `font: inherit`. Without that one declaration its label renders in the
  browser's default serif.
- **The webfont itself.** The theme _names_ Figtree; it never loads it. Without
  the Google Fonts link every viewer silently gets the next family in the stack.
- **No JSX.** Nothing is compiling this file, so elements are created with
  `React.createElement`.

> Pin every version. Unversioned CDN URLs resolve to the latest release and are
> cached aggressively (0.4.1 above is a real pin; `astryx template --cdn` writes
> yours). The raw ESM entry (`dist/index.js`) uses bare `react` imports and will
> not run from a plain `<script src>` — the import map is what makes those
> specifiers resolvable.
