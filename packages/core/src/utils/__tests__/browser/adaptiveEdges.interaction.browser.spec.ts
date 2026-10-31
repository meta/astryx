// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file adaptiveEdges.interaction.browser.spec.ts
 * @input fixture.ts bundled with esbuild, mounted in four frames sized at the
 *   compact edges; the interaction harness's phone
 *   (playwright.interaction.config.ts), and the same engines with a mouse
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
import {expect, test, type Page} from '@playwright/test';

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

async function expectEdges(page: Page, coarse: boolean) {
  await page.goto('about:blank');
  await page.setContent(
    '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><body></body>',
  );
  expect(
    await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
  ).toBe(coarse);
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
    const frame = page.frame({name: edge.name});
    if (frame == null) {
      throw new Error(`no frame named ${edge.name}`);
    }
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
}

test('under a finger, an adaptive menu takes the sheet only below the compact edges', async ({
  page,
}) => {
  await expectEdges(page, true);
});

test.describe('with a mouse', () => {
  test.use({hasTouch: false, isMobile: false});

  test('an adaptive menu never takes the sheet', async ({page}) => {
    await expectEdges(page, false);
  });
});
