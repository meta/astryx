// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file LinkContext.ts
 * @input createSharedContext, LinkComponentType
 * @output Exports LinkContext and LinkContextValue
 * @position Context definition for polymorphic link support
 *
 * Separated from LinkProvider.tsx to allow components to consume
 * the context without pulling in the full provider implementation.
 * Follows the ThemeContext.ts / Theme.tsx pattern.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Link/LinkProvider.tsx
 * - /packages/core/src/Link/useLinkComponent.ts
 * - /packages/core/src/Link/index.ts
 * - /packages/core/src/Link/Link.doc.mjs
 */

import type {LinkComponentType} from './types';
import {createSharedContext} from '../utils/sharedContext';

/**
 * Context value for the link provider.
 */
export interface LinkContextValue {
  component: LinkComponentType;
}

/**
 * Context for providing a custom link component to all Astryx components.
 * Defaults to null (components fall back to native `<a>`).
 */
export const LinkContext = createSharedContext<LinkContextValue | null>(
  'LinkContext',
  1,
  null,
);
LinkContext.displayName = 'LinkContext';
