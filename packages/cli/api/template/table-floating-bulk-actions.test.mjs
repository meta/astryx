// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Regression coverage for the floating bulk-actions Table block.
 * @input The shipped TableFloatingBulkActionsTable source.
 * @output Assertions for width, logical scrolling, local stacking, and shared toolbar geometry.
 * @position Template contract test for the website example layout.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const sourcePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../assets/templates/blocks/components/Table/TableFloatingBulkActionsTable.tsx',
);
const source = fs.readFileSync(sourcePath, 'utf8');
const pageStyles = source.match(/page:\s*\{([\s\S]*?)\n\s{2}\},/)?.[1];
const tableRegionStyles = source.match(
  /tableRegion:\s*\{([\s\S]*?)\n\s{2}\},/,
)?.[1];
const toolbarStyles = source.match(/toolbar:\s*\{([\s\S]*?)\n\s{2}\},/)?.[1];
const columns = source.match(
  /const columns:[\s\S]*?=\s*\[([\s\S]*?)\n\];/,
)?.[1];

describe('Table floating bulk-actions template', () => {
  it('caps the demo height without capping its width', () => {
    expect(pageStyles).toContain('maxBlockSize: 640');
    expect(pageStyles).not.toContain('maxWidth');
    expect(pageStyles).not.toContain('marginInline');
  });

  it('uses the shared logical-axis scroll behavior', () => {
    expect(source).toContain(
      "import {ScrollableArea} from '@astryxdesign/core/ScrollableArea'",
    );
    expect(source).toMatch(
      /<ScrollableArea[\s\S]*?axis="block"[\s\S]*?label="Bulk actions example"[\s\S]*?overscroll="contain"/,
    );
    expect(source).not.toContain('role="region"');
    expect(source).not.toContain('tabIndex={0}');
    expect(source).not.toContain('aria-label="Metrics"');
    expect(pageStyles).not.toContain('overflowY');
    expect(pageStyles).not.toContain('overscrollBehavior');
  });

  it('keeps the floating toolbar inside an isolated local stacking context', () => {
    expect(pageStyles).toContain("isolation: 'isolate'");
    expect(toolbarStyles).toContain('zIndex: 1');
    expect(toolbarStyles).not.toContain('zIndex: 20');
  });

  it('shares one reserved-space variable across the placement geometry', () => {
    expect(tableRegionStyles).toContain("'--table-bulk-actions-space'");
    expect(source.match(/var\(--table-bulk-actions-space\)/g)).toHaveLength(4);
  });

  it('keeps the email column compact enough to avoid horizontal overflow', () => {
    expect(columns).toContain(
      "{key: 'email', header: 'Email', width: proportional(1)}",
    );
  });
});
