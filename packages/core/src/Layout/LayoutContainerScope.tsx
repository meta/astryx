// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file LayoutContainerScope.tsx
 * @input A container name and the children it holds
 * @output Exports LayoutContainerScope, the client island that provides
 *   LayoutContainerContext
 * @position Rendered by Card, which stays a server-safe component: the island
 *   adds no element and renders nothing of its own on the server.
 */

import type {ReactNode} from 'react';
import {
  LayoutContainerContext,
  type LayoutContainer,
} from './LayoutContainerContext';

export function LayoutContainerScope({
  container,
  children,
}: {
  container: LayoutContainer;
  children: ReactNode;
}): ReactNode {
  return (
    <LayoutContainerContext value={container}>
      {children}
    </LayoutContainerContext>
  );
}
