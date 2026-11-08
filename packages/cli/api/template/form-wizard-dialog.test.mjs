// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file form-wizard-dialog.test.mjs
 * @input Reads the generated dialog wizard page template as source
 * @output Regression coverage for close/completion reset wiring and stable date defaults
 * @position Template contract test; keeps the scaffold safe as calendar time advances
 *
 * SYNC: When form-wizard-dialog/page.tsx changes its draft lifecycle, update these assertions
 */

import {describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';

const PAGE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../assets/templates/pages/form-wizard-dialog/page.tsx',
);
const source = fs.readFileSync(PAGE_PATH, 'utf8');

const between = (start, end) =>
  source.slice(source.indexOf(start), source.indexOf(end));

describe('form-wizard-dialog template', () => {
  it('resets the same draft on close and successful completion', () => {
    const resetDraft = between('const resetDraft', 'const handleOpenChange');
    const handleOpenChange = between(
      'const handleOpenChange',
      'const errorsByStep',
    );
    const goNext = between('const goNext', 'return (');

    expect(resetDraft).toContain('setStartDate(undefined)');
    expect(handleOpenChange).toContain('if (!isOpen)');
    expect(handleOpenChange).toContain('resetDraft();');
    expect(goNext).toContain('resetDraft();');
    expect(source.match(/onOpenChange={handleOpenChange}/g)).toHaveLength(2);
  });

  it('asks the user for a start date without shipping expiring defaults', () => {
    expect(source).toContain('useState<ISODateString | undefined>();');
    expect(source).not.toMatch(/\b20\d{2}-\d{2}-\d{2}\b/);
    expect(source).not.toMatch(/\bmin=/);
  });
});
