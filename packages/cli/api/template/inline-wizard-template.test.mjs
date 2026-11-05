// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Regression coverage for the shipped inline wizard template.
 * @input The template API and the form-wizard-inline source it exposes.
 * @output Assertions that completed steps remain navigable and no dead skip
 *   action is rendered.
 * @position Focused interaction guard for the inline wizard page template.
 */

import {describe, expect, it} from 'vitest';
import {template} from './template.mjs';

describe('inline wizard template interactions', () => {
  it('ships step navigation without a dead skip action', async () => {
    const result = await template('form-wizard-inline');

    expect(result.type).toBe('template.show');
    expect(result.data.source).toContain('onStepClick={goToStep}');
    expect(result.data.source).not.toContain('without `onStepClick`');
    expect(result.data.source).not.toContain('Skip for now');
    expect(result.data.source).not.toContain('onClick={() => {}}');
  });
});
