// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file appShellActivity.tsx
 * @input React's Activity, where the React version has it
 * @output Exports `HasActivity` and `ActivityWrapper`: an Activity boundary,
 *   or a plain fragment on React versions without Activity
 * @position Internal to Core, not exported from the AppShell entry. AppShell
 *   pauses its mobile nav and its hidden regions with it, and TopNav pauses
 *   its own drawer items while the top nav is hidden.
 */

import * as React from 'react';

/** Whether this React version has Activity (19.2 and later). */
export const HasActivity = typeof React.Activity !== 'undefined';

/**
 * Hides and pauses `children` while `mode` is `'hidden'`: their effects clean
 * up and their state stays. On React versions without Activity, `children`
 * stay mounted and their effects keep running.
 */
export const ActivityWrapper = HasActivity
  ? ({
      mode,
      children,
    }: {
      mode: 'visible' | 'hidden';
      children: React.ReactNode;
    }) => <React.Activity mode={mode}>{children}</React.Activity>
  : ({children}: {mode: string; children: React.ReactNode}) => <>{children}</>;
