// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Regression coverage for the form-wizard-vertical review banner icon.
 * @input The shipped form-wizard-vertical page template source and its
 *   descriptor.
 * @output Assertions that the review banner's icon declares the meaning the
 *   banner shows.
 * @position Template contract test for the review step's info banner.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {doc} from '../../assets/templates/pages/form-wizard-vertical/template.doc.mjs';

const source = fs.readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../assets/templates/pages/form-wizard-vertical/page.tsx',
  ),
  'utf8',
);

describe('form-wizard-vertical review banner icon', () => {
  it('declares the info banner icon as info', () => {
    const banner = source.match(
      /<Banner\s+status="info"\s+title="Review takes up to 5 business days"\s+icon=\{<Icon icon=\{(\w+)\}/,
    )?.[1];
    expect(banner).toBe('CheckBadgeIcon');
    expect(doc.icons?.[/** @type {string} */ (banner)]).toBe('info');
  });
});
