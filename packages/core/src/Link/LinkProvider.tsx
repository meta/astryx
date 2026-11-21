// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file LinkProvider.tsx
 * @input React, LinkContext, LinkComponentType
 * @output Exports LinkProvider component and LinkProviderProps
 * @position Provider component for polymorphic link support
 *
 * Sets the default link component for all Astryx components in the subtree.
 * Individual components can still override via the `as` prop.
 *
 * @example
 * ```
 * import Link from 'next/link';
 * <LinkProvider component={Link}>
 *   <App />
 * </LinkProvider>
 * ```
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Link/index.ts
 * - /packages/core/src/Link/Link.doc.mjs
 * - /packages/cli/assets/templates/blocks/components/Link/ (showcase blocks)
 * - /packages/cli/assets/templates/blocks/components/LinkProvider/ (example blocks)
 */

import {useMemo, type ReactNode} from 'react';
import {LinkContext} from './LinkContext';
import type {LinkComponentType} from './types';

export interface LinkProviderProps {
  /**
   * The component to use for all link elements in the subtree.
   * It receives the accepted `href`, and a `to` that equals `href` unless the
   * link passes its own accepted `to`; a native `'a'` receives no `to`. It also
   * receives the link's `ref`, `className`, `style`, event handlers, and
   * `children`. A rejected destination never reaches it.
   *
   * @example
   * ```
   * import Link from 'next/link';
   * <LinkProvider component={Link}>
   * ```
   */
  component: LinkComponentType;
  /**
   * The subtree. Astryx links in it that render through `useLinkComponent`,
   * such as Link and Button with `href`, use `component`, unless a link sets
   * its own `as` or a nearer LinkProvider sets another component. A disabled
   * Link does not use it.
   */
  children: ReactNode;
}

/**
 * Provides a custom link component to all Astryx components in the subtree.
 *
 * Wrap your app (or a section of it) in LinkProvider to replace
 * native `<a>` elements with your framework's link component
 * (e.g., Next.js Link, React Router Link).
 */
export function LinkProvider({component, children}: LinkProviderProps) {
  const value = useMemo(() => ({component}), [component]);
  return <LinkContext value={value}>{children}</LinkContext>;
}

LinkProvider.displayName = 'LinkProvider';
