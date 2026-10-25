// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file adaptiveEdges.browser.spec.ts
 * @input fixture.ts bundled with esbuild, mounted in four frames sized at the
 *   compact edges; the engines and pointers of playwright.config.ts beside
 *   this file
 * @output Where an adaptive menu takes the bottom sheet: at 767 px wide and
 *   499 px tall under a finger, never at 768 or 500, never with a mouse
 * @position Real-engine proof of the compact definition (`spec:AST-012`
 *   FR9) as useAdaptivePresentation reads it
 *
 * A frame's media queries read the frame's own size, so one page holds all
 * four edges; the pointer is the device's. The same page, opened in Safari,
 * is the manual Safari check.
 */

import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {expect, test} from '@playwright/test';

const EDGES = [
  {name: 'w767', width: 767, height: 900, compact: true},
  {name: 'w768', width: 768, height: 900, compact: false},
  {name: 'h499', width: 1024, height: 499, compact: true},
  {name: 'h500', width: 1024, height: 500, compact: false},
] as const;

let bundle = '';

test.beforeAll(async () => {
  const result = await build({
    entryPoints: [
      path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixture.ts'),
    ],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    define: {'process.env.NODE_ENV': '"production"'},
  });
  bundle = result.outputFiles[0].text;
});

test('an adaptive menu takes the sheet only below the compact edges, and only under a finger', async ({
  page,
}) => {
  await page.goto('about:blank');
  await page.setContent(
    '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><body></body>',
  );
  const coarse = await page.evaluate(
    () => matchMedia('(pointer: coarse)').matches,
  );
  await page.evaluate(
    ({edges, script}) => {
      for (const edge of edges) {
        const frame = document.createElement('iframe');
        frame.name = edge.name;
        frame.width = String(edge.width);
        frame.height = String(edge.height);
        frame.style.border = '0';
        frame.style.display = 'block';
        frame.srcdoc = `<!doctype html><body><script>${script}</script></body>`;
        document.body.append(frame);
      }
    },
    {edges: EDGES, script: bundle.replace(/<\/script/gi, '<\\/script')},
  );
  for (const edge of EDGES) {
    await expect.poll(() => page.frame({name: edge.name}) != null).toBe(true);
    const frame = page.frame({name: edge.name})!;
    await frame.waitForFunction(() => window.__answers != null);
    const answers = await frame.evaluate(() => window.__answers);
    expect(answers, edge.name).toMatchObject({
      width: edge.width,
      height: edge.height,
      coarse,
      presentation: {isTouch: coarse, isCompact: edge.compact},
      adaptive: coarse && edge.compact ? 'bottom-sheet' : 'popover',
    });
  }
});
