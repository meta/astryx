// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {usePathname} from '../router';
import {AppShell} from '@astryxdesign/core/AppShell';
import {SandboxNav} from './SandboxNav';

const FULLSCREEN_PATHS = [
  '/pages/color-studio',
  '/pages/palette-generator',
  '/pages/mobile-spacing',
  '/pages/mobile-type',
  '/pages/tap-targets',
];

export function SandboxShell({children}: {children: React.ReactNode}) {
  const pathname = usePathname();
  const isFullscreen = FULLSCREEN_PATHS.some(p => pathname.startsWith(p));

  if (isFullscreen) {
    return <>{children}</>;
  }

  return (
    <AppShell sideNav={<SandboxNav />} contentPadding={0}>
      {children}
    </AppShell>
  );
}
