// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Unit coverage for the integration-template conflict release boundary.
 * @input CLI versions and explicit warning-only or expanded projections.
 * @output Boolean activation assertions for the expanded conflict schema.
 * @position Colocated coverage for the private release gate.
 */

import {describe, expect, it} from 'vitest';
import {expandedTemplateConflictSchemaActive} from './template-conflict-release.mjs';

describe('expandedTemplateConflictSchemaActive', () => {
  it.each(['0.6.3', '0.6.4', '0.6.99'])(
    'keeps %s narrow even when the expanded projection is requested',
    version => {
      expect(expandedTemplateConflictSchemaActive(version, 'expanded')).toBe(
        false,
      );
    },
  );

  it.each(['0.7.0-rc.1', '0.7.0', '0.8.0'])(
    'does not let version %s expand the warning-only projection',
    version => {
      expect(
        expandedTemplateConflictSchemaActive(version, 'warning-only'),
      ).toBe(false);
    },
  );

  it.each(['0.7.0-rc.1', '0.7.0', '0.8.0'])(
    'allows the deliberate expanded projection in %s',
    version => {
      expect(expandedTemplateConflictSchemaActive(version, 'expanded')).toBe(
        true,
      );
    },
  );
});
