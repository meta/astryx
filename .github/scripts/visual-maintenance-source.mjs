// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Validate a canonical visual baseline candidate before artifact upload.
 * @input The maintenance capture manifest, verdict, and exact workflow identity.
 * @output Acceptance of complete exact-main evidence, or a refusal.
 * @position Trusted capture boundary before a normal PR may update the baseline.
 */

import {validateReleasePlan} from './visual-gate/lib/compare.mjs';

function refuse(message) {
  throw new Error(`Visual maintenance source refused: ${message}`);
}

function positiveInteger(value, label) {
  if (!/^[1-9][0-9]*$/.test(String(value))) refuse(`${label} is invalid`);
  const result = Number(value);
  if (!Number.isSafeInteger(result)) refuse(`${label} is invalid`);
  return result;
}

/** A full maintenance capture may differ, but it may never be partial or stale. */
export function validateVisualMaintenanceCapture({
  manifest,
  verdict,
  sha,
  runId,
  runAttempt,
}) {
  const context = manifest?.context;
  if (
    !/^[0-9a-f]{40}$/.test(sha ?? '') ||
    context?.sha !== sha ||
    context.ref !== 'refs/heads/main' ||
    String(context.runId) !== String(positiveInteger(runId, 'run id')) ||
    String(context.runAttempt) !==
      String(positiveInteger(runAttempt, 'run attempt'))
  ) {
    refuse('capture manifest does not match the source identity');
  }
  const plan = validateReleasePlan(context.releasePlan, manifest);
  if (!plan.keys.length) refuse('canonical capture is empty');
  if (
    verdict?.context?.sha !== context.sha ||
    verdict.context.ref !== context.ref ||
    String(verdict.context.runId) !== String(context.runId) ||
    String(verdict.context.runAttempt) !== String(context.runAttempt) ||
    JSON.stringify(verdict.context.releasePlan) !== JSON.stringify(plan) ||
    !['pass', 'changed', 'failed'].includes(verdict.status)
  ) {
    refuse('capture verdict does not match its canonical source plan');
  }
}
