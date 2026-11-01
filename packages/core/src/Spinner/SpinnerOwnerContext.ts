// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file SpinnerOwnerContext.ts
 * @input React
 * @output SpinnerOwnerContext: true inside a Core component that owns the
 *   task a composed Spinner shows, so that Spinner announces nothing
 * @position Internal to core: not exported from Spinner/index.ts, and core's
 *   `exports` do not list this module (`architecture:public-component-api`
 *   INV12). A composed indicator is silent and its owner announces
 *   (`spec:AST-086` FR8); app code hides a composed Spinner with
 *   `aria-hidden` instead.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Spinner/Spinner.tsx
 */

import {createContext} from 'react';

export const SpinnerOwnerContext = createContext(false);
SpinnerOwnerContext.displayName = 'SpinnerOwnerContext';
