// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Shared Sandbox route-group rendering for the server and browser.
 * @input Resolved page component and generated route metadata.
 * @output Identical providers, nested Motion Lab, sandbox/fullscreen/raw layouts.
 * @position Preserves Next route-group behavior in static HTML and hydration.
 */

import {Suspense, type ComponentType} from 'react';
import {LinkProvider} from '@astryxdesign/core/Link';
import type {SandboxRoute} from 'virtual:sandbox-routes';
import {Providers} from './app/providers';
import SandboxLayout from './app/(sandbox)/layout';
import FullscreenLayout from './app/(fullscreen)/layout';
import RawLayout from './app/(raw)/layout';
import MotionLabLayout from './app/(sandbox)/pages/motion-lab/layout';
import {SandboxLink} from './router';

export function RouteView({
  entry,
  Page,
  embed = false,
}: {
  entry: SandboxRoute;
  Page: ComponentType;
  embed?: boolean;
}) {
  const page = (
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  );
  const group =
    entry.group === 'fullscreen' ? (
      <FullscreenLayout forceEmbed={embed}>{page}</FullscreenLayout>
    ) : entry.group === 'sandbox' ? (
      <SandboxLayout>
        {entry.route.startsWith('/pages/motion-lab/') ? (
          <MotionLabLayout>{page}</MotionLabLayout>
        ) : (
          page
        )}
      </SandboxLayout>
    ) : (
      <RawLayout>{page}</RawLayout>
    );
  return (
    <Providers>
      <LinkProvider component={SandboxLink}>{group}</LinkProvider>
    </Providers>
  );
}
