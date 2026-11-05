// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Cross-platform assertions for generated palette receipts.
 * @input A freshly generated receipt and its committed counterpart.
 * @output Exact validation outside diagnostics and tolerant numeric diagnostics.
 * @position Shared test support for reproducible theme-palette generation.
 */

import assert from 'node:assert/strict';

function assertDiagnosticsClose(actual, expected, path, tolerance) {
  if (typeof expected === 'number') {
    assert.equal(typeof actual, 'number', `${path} must be numeric`);
    const scale = Math.max(1, Math.abs(expected), Math.abs(actual));
    assert.ok(
      Math.abs(actual - expected) <= tolerance * scale,
      `${path}: expected ${expected} ± ${tolerance * scale}, received ${actual}`,
    );
    return;
  }

  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), `${path} must be an array`);
    assert.equal(actual.length, expected.length, `${path} length`);
    for (let index = 0; index < expected.length; index += 1) {
      assertDiagnosticsClose(
        actual[index],
        expected[index],
        `${path}[${index}]`,
        tolerance,
      );
    }
    return;
  }

  if (expected && typeof expected === 'object') {
    assert.ok(
      actual && typeof actual === 'object',
      `${path} must be an object`,
    );
    assert.deepEqual(
      Object.keys(actual).sort(),
      Object.keys(expected).sort(),
      `${path} keys`,
    );
    for (const key of Object.keys(expected)) {
      assertDiagnosticsClose(
        actual[key],
        expected[key],
        `${path}.${key}`,
        tolerance,
      );
    }
    return;
  }

  assert.deepEqual(actual, expected, path);
}

/**
 * Compare stable receipt fields exactly while allowing insignificant differences
 * in floating-point diagnostics across Node architectures.
 */
export function assertPaletteReceiptsMatch(
  actual,
  expected,
  {diagnosticTolerance = 1e-12} = {},
) {
  const {diagnostics: actualDiagnostics, ...actualStable} = actual;
  const {diagnostics: expectedDiagnostics, ...expectedStable} = expected;

  assert.deepEqual(actualStable, expectedStable);
  assertDiagnosticsClose(
    actualDiagnostics,
    expectedDiagnostics,
    'diagnostics',
    diagnosticTolerance,
  );
}
