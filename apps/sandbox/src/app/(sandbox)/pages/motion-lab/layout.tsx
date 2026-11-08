// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file layout.tsx
 * @input The Motion Lab provider, the link provider, and the shell
 * @output The /pages/motion-lab section frame
 * @position Motion Lab route-group layout (shared by every Vite page in the section)
 *
 * Every lab page reads its durations, curves and springs from one store, so the
 * provider wraps the whole section rather than each page. The Vite route
 * manifest preserves this shared layout across navigation.
 *
 * LinkProvider routes Astryx Link and ListItem through the Sandbox router,
 * which applies the configured base path exactly once. Keep authored links
 * unprefixed for both root-local and /sandbox/ deployments.
 */

'use client';

import NextLink from '../../../../router';
import type {ReactNode} from 'react';
import {LinkProvider} from '@astryxdesign/core/Link';
import {MotionLabProvider} from './MotionLabStore';
import {MotionLabShell} from './MotionLabShell';

export default function MotionLabLayout({children}: {children: ReactNode}) {
  return (
    <LinkProvider component={NextLink}>
      <MotionLabProvider>
        <MotionLabShell>{children}</MotionLabShell>
      </MotionLabProvider>
    </LinkProvider>
  );
}
