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

  it('gives an image the sources for its slot', () => {
    const html =
      '<img src="/photo.webp" alt="A &amp; B"/><img src="/logo.svg?a=1&amp;b=2" alt=""/>';
    const sources = (src: string) =>
      src === '/photo.webp'
        ? {
            src: '/_next/image?url=%2Fphoto.webp&w=256&q=75',
            srcSet:
              '/_next/image?url=%2Fphoto.webp&w=128&q=75 128w, /_next/image?url=%2Fphoto.webp&w=256&q=75 256w',
            sizes: '(min-width: 1024px) 86px, 101px',
          }
        : null;
    expect(finishSnapshotHtml(html, sources)).toBe(
      '<img fetchpriority="low" decoding="async" sizes="(min-width: 1024px) 86px, 101px" srcset="/_next/image?url=%2Fphoto.webp&amp;w=128&amp;q=75 128w, /_next/image?url=%2Fphoto.webp&amp;w=256&amp;q=75 256w" src="/_next/image?url=%2Fphoto.webp&amp;w=256&amp;q=75" alt="A &amp; B"/>' +
        '<img fetchpriority="low" decoding="async" src="/logo.svg?a=1&amp;b=2" alt=""/>',
    );
  });

  it('writes each value so that it stays inside its attribute', () => {
    expect(
      finishSnapshotHtml('<img src="/a.png" alt=""/>', () => ({
        src: '/a.png?x=1&y="2"',
        srcSet: '/a.png?x=1&y="2" 128w',
        sizes: '"86px"',
      })),
    ).toBe(
      '<img fetchpriority="low" decoding="async" sizes="&quot;86px&quot;" srcset="/a.png?x=1&amp;y=&quot;2&quot; 128w" src="/a.png?x=1&amp;y=&quot;2&quot;" alt=""/>',
    );
  });

  it('asks for the sources by the src as the page wrote it', () => {
    const asked: string[] = [];
    finishSnapshotHtml(
      '<img src="/a.png?x=1&amp;y=2" alt=""/><img data-src="/b.png" alt="" src="/c.png"/>',
      src => {
        asked.push(src);
        return null;
      },
    );
    expect(asked).toEqual(['/a.png?x=1&y=2', '/c.png']);
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
    expect(pkg.scripts.build).toMatch(
      /^pnpm generate && (?:node [\w./-]+ && )*next build/u,
    );
  });
});
