// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Types for offline-media.js, for TypeScript callers.
 * @input None
 * @output The declarations of the offline-media exports.
 * @position Read by the shared Playwright base test in
 *   internal/a11y-spec/src/playwright.ts.
 * SYNC: Keep equal to the exports of offline-media.js.
 */

interface RequestFacts {
  url: string;
  resourceType: string;
}

interface Routable {
  route(
    url: RegExp,
    handler: (route: import('@playwright/test').Route) => Promise<void>,
  ): Promise<unknown>;
}

export const STAND_IN_IMAGE: Buffer;

export function isRemoteImage(
  request: RequestFacts,
  storyOrigin: string | undefined,
): boolean;

export function isRemoteNonImage(
  request: RequestFacts,
  storyOrigin: string | undefined,
): boolean;

export function routeRemoteImages(
  target: Routable,
  storyOrigin: string | undefined,
  options?: {abortOther?: boolean},
): Promise<void>;
