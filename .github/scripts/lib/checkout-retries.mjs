// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A ci.yml checkout runs as three steps: its first try, a second try that
 * runs only when the first did not succeed, and a step that stops the job
 * when both failed (ci-checkout-timeout.test.mjs owns that shape).
 * withoutCheckoutRetries leaves only the first try, so a test of a job's other
 * steps reads them as one checkout.
 */

/** @param {any} step */
export const isCheckoutRetry = step =>
  String(step?.id ?? '').endsWith('_again') ||
  step?.name === 'Stop when the checkout failed twice';

/** @param {any[]} steps */
export const withoutCheckoutRetries = steps =>
  steps.filter(step => !isCheckoutRetry(step));
