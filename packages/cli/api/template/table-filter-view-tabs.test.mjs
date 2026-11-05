// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Regression coverage for the table-filter page's compact view-options tabs.
 * @input The shipped table-filter page template source.
 * @output Assertions that the shared tabpanel is labelled by its selected tab.
 * @position Template contract test for the tabs relationship in the narrow-view sheet.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const sourcePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../assets/templates/pages/table-filter/page.tsx',
);
const source = fs.readFileSync(sourcePath, 'utf8');
const sheet = source.match(
  /const viewOptionsSheet = \(([\s\S]*?)\n {2}\);/,
)?.[1];
const tab = sheet?.match(/<Tab\b([\s\S]*?)\/>/)?.[1];
const panel = sheet?.match(/<VStack\b([^>]*?role="tabpanel"[^>]*?)>/)?.[1];

describe('table-filter view-options tabs', () => {
  it('finds the compact sheet, its tab and its panel', () => {
    expect(sheet).toBeDefined();
    expect(tab).toBeDefined();
    expect(panel).toBeDefined();
  });

  it('gives every tab an id derived from the panel id and its section', () => {
    expect(tab).toContain('id={`${viewPanelId}-tab-${section.key}`}');
    expect(tab).toContain('panelId={viewPanelId}');
  });

  it('labels the shared panel by the selected tab, not a fixed string', () => {
    expect(panel).toContain('id={viewPanelId}');
    expect(panel).toContain(
      'aria-labelledby={`${viewPanelId}-tab-${viewSection}`}',
    );
    expect(panel).not.toContain('aria-label=');
  });
});
