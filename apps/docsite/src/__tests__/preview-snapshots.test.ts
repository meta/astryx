// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Build-time preview snapshots: the generate step renders them, and the
 * snapshot images load at low priority, after the page's own resources.
 *
 * @input scripts/lib/preview-snapshot-html.mjs and the docsite package scripts
 * @output Regression coverage for the snapshot markup and its wiring
 * @position Build-time docsite tooling verification
 * Run: pnpm -F @astryxdesign/docsite test
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {describe, expect, it} from 'vitest';
import {finishSnapshotHtml} from '../../scripts/lib/preview-snapshot-html.mjs';

const DOCSITE = path.resolve(__dirname, '../..');

describe('finishSnapshotHtml', () => {
  it('removes the image preload hints that React adds', () => {
    const html =
      '<link rel="preload" as="image" href="/a.png"/><div><img src="/a.png" alt=""/></div>';
    expect(finishSnapshotHtml(html)).not.toContain('<link');
  });

  it('gives each image low priority and keeps an image that sets its own', () => {
    const html =
      '<img src="/a.png" alt=""/><img fetchpriority="high" src="/b.png" alt=""/>';
    expect(finishSnapshotHtml(html)).toBe(
      '<img fetchpriority="low" decoding="async" src="/a.png" alt=""/><img fetchpriority="high" src="/b.png" alt=""/>',
    );
  });
});

describe('generate step', () => {
  it('renders the snapshots in every build and dev start', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(DOCSITE, 'package.json'), 'utf8'),
    );
    expect(pkg.scripts.generate).toContain(
      'node scripts/generate-landing-template-previews.mjs',
    );
    expect(pkg.scripts.build).toMatch(/^pnpm generate && next build/u);
  });
});
