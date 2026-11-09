# Astryx Example: Next.js (Dist)

Reference application for consuming **@astryxdesign/core** as a pre-built dist package in a Next.js project.

No StyleX build plugin needed; Astryx ships pre-compiled CSS and JS. This is the simplest way to get started.

## Setup Steps

### 1. Install dependencies

```bash
npm install @astryxdesign/core @astryxdesign/theme-neutral next react react-dom
npm install --save-dev @types/react @types/react-dom typescript
```

### 2. CSS imports

In `src/app/globals.css`, import the reset, component styles, and theme:

```css
@import '@astryxdesign/core/reset.css';
@import '@astryxdesign/core/astryx.css';
@import '@astryxdesign/theme-neutral/theme.css';
```

The CSS import order matters:

1. `reset.css`: baseline resets (`@layer reset`)
2. `astryx.css`: all component styles (`@layer astryx-base`)
3. `theme.css`: theme token overrides (`@layer astryx-theme`)

Import the CSS file in your root layout:

```tsx
import './globals.css';
```

### 3. Theme + Link provider (client boundary)

```tsx
// src/app/providers.tsx
'use client';
import Link from 'next/link';
import {Theme} from '@astryxdesign/core/theme';
import {LinkProvider} from '@astryxdesign/core/Link';
import {neutralTheme} from '@astryxdesign/theme-neutral/built';

export function Providers({children}) {
  return (
    <Theme theme={neutralTheme}>
      <LinkProvider component={Link}>{children}</LinkProvider>
    </Theme>
  );
}
```

`LinkProvider` wires up Next.js client-side navigation for all Astryx link-based components (Link, Button with href, TopNav, SideNav, Breadcrumbs, TabList).

## Gotchas

| Issue                         | Symptom                                     | Fix                                         |
| ----------------------------- | ------------------------------------------- | ------------------------------------------- |
| Wrong CSS import order        | Missing theme tokens or broken layers       | Import reset → astryx → theme in that order |
| No `'use client'` on provider | Server component error from `createContext` | Mark the provider file with `'use client'`  |

## Testing outside the monorepo

This example lives in the Astryx monorepo for convenience, but it should be representative of a real app consuming `@astryxdesign/core` from npm. Monorepo workspace resolution can silently bypass issues that external consumers hit.

**Before merging changes to this example, test it as an external consumer.** See the [Testing Example Apps](https://github.com/meta/astryx/wiki/Testing-Example-Apps) wiki page for the full procedure.

## Related

- [Issue #145: Add example-nextjs project](https://github.com/meta/astryx/issues/145)
- [Astryx + Tailwind example](../example-nextjs-tailwind/): same dist approach with Tailwind for custom layout styles
