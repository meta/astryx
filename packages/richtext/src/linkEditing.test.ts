// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file linkEditing.test.ts
 * @input Uses vitest and linkEditing's toLinkHref
 * @output Tests which address an entered link becomes, and which entries the
 *   link rules refuse
 * @position Testing; validates linkEditing.ts
 */

import {describe, expect, it} from 'vitest';
import {toLinkHref} from './linkEditing';

describe('toLinkHref', () => {
  it('keeps an allowed address, without the spaces around it', () => {
    expect(toLinkHref('  https://example.com/a  ')).toBe(
      'https://example.com/a',
    );
    expect(toLinkHref('mailto:team@example.com')).toBe(
      'mailto:team@example.com',
    );
  });

  it('refuses an address the link rules do not allow', () => {
    expect(toLinkHref('javascript:alert(1)')).toBeNull();
  });
});
