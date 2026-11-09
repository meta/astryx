// Copyright (c) Meta Platforms, Inc. and affiliates.

/// <reference types="vite/client" />

declare module 'virtual:sandbox-routes' {
  import type {ComponentType} from 'react';
  export interface SandboxRoute {
    route: string;
    group: 'sandbox' | 'fullscreen' | 'raw';
    slug?: string;
    load: () => Promise<{
      default?: ComponentType;
      CategoryContent?: ComponentType<{slug: string}>;
    }>;
  }
  export const routes: SandboxRoute[];
}
