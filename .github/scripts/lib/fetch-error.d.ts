// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Types for fetch-error.js, for TypeScript callers.
 * @input None
 * @output The declaration of the fetch-error export.
 * @position Read by the docsite's end-to-end specs and by the shared
 *   Playwright base test in internal/a11y-spec/src/playwright.ts.
 * SYNC: Keep equal to the exports of fetch-error.js.
 */

/**
 * The error of a failed request without its call log, which lists the
 * request's headers: the first line, the method and the address of the last
 * request, and the status of the answer to it. Each address keeps only its
 * origin and path.
 */
export function safeFetchError(error: unknown): Error;
