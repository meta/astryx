// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file AvatarStatusLabelContext.ts
 * @input Uses createSharedContext, RefObject
 * @output Exports AvatarStatusLabelContext, AvatarStatusLabelTarget
 * @position Internal context; provided by Avatar, consumed by AvatarStatusDot
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Avatar/Avatar.doc.mjs
 */

import type {RefObject} from 'react';
import {createSharedContext} from '../utils/sharedContext';

/**
 * The box a status element writes its label into.
 *
 * `update` is the avatar's own recompose, set while its root element is
 * attached and null otherwise. Writing `label` alone is enough on mount (the
 * avatar reads the box when its root attaches, which happens after its
 * children's refs); calling `update` covers a label that changes later
 * without the avatar itself re-rendering.
 */
export interface AvatarStatusLabelTarget {
  label: string | undefined;
  update: (() => void) | null;
}

/**
 * Lets a status element hand its accessible label to the enclosing Avatar,
 * which composes it into its own accessible name ("Jane Doe, Online").
 *
 * The avatar root is `role="img"`, which prunes all descendant semantics, so
 * composing the label in is the only way the status reaches assistive tech
 * (WCAG 4.1.2). Reading `label` off the passed element only works when the
 * consumer passes `AvatarStatusDot` directly; this route works through a
 * consumer's own wrapper, at any depth.
 *
 * The value is a ref, written from the dot's own callback ref in the commit
 * phase, so reporting a label costs no render and no state. `null` outside an
 * Avatar, where a standalone dot names itself and has nobody to report to.
 */
export const AvatarStatusLabelContext =
  createSharedContext<RefObject<AvatarStatusLabelTarget> | null>(
    'AvatarStatusLabelContext',
    1,
    null,
  );
AvatarStatusLabelContext.displayName = 'AvatarStatusLabelContext';
