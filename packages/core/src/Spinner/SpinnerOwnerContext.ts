// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file SpinnerOwnerContext.ts
 * @input React
 * @output SpinnerOwnerContext: true inside a Core component that owns the
 *   task a composed Spinner shows, so that Spinner announces nothing
 * @position Internal to core: not exported from Spinner/index.ts, and core's
 *   `exports` do not list this module. The owner of a task announces it, so
 *   a Spinner it composes stays silent; app code hides a composed Spinner
 *   with `aria-hidden` instead.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Spinner/Spinner.tsx
 */

import {createSharedContext} from '../utils/sharedContext';

export const SpinnerOwnerContext = createSharedContext(
  'SpinnerOwnerContext',
  1,
  false,
);
SpinnerOwnerContext.displayName = 'SpinnerOwnerContext';
