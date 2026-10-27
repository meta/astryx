// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.ts
 * @input Re-exports the harness modules
 * @output The `@astryxdesign/interaction-harness` entry point for Playwright
 *   specs. Pure helpers are also reachable without Playwright through
 *   `@astryxdesign/interaction-harness/math` and `/scripts` (unit tests).
 * @position Imported only from `*.interaction.browser.spec.ts` files (run by
 *   playwright.interaction.config.ts) and from this package's own tests.
 *
 * SYNC: When a module is added, export it here and describe it in README.md.
 */

export * from './curves';
export * from './math';
export * from './output';
export * from './scripts';
export * from './story';
export * from './storyboard';
export * from './touch';
