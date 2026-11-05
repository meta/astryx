// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file blog-live-examples.spec.ts
 * @input The built Docsite (canary target), its live-example fixture post
 *   (`src/content/blog/fixtures/live-example-sample.md`), that post's
 *   plain-text route, the RSS feed, the sitemap, and the blog index.
 * @output Real-browser proof of spec:AST-033 FR22: each `tsx live` block runs
 *   in its own sandboxed preview frame (opaque origin, `allow-scripts` only);
 *   an example imports a published package and a post-local asset; a block
 *   that throws or fails to compile shows its error inside its frame while the
 *   post renders on; the plain-text route shows the source as an ordinary code
 *   block; and the fixture is never listed.
 * @position Docsite browser contracts (`pnpm test:docsite-browser`).
 */

import {expect, test, type Frame, type Page} from '@playwright/test';

const POST = '/blog/live-example-sample';

// The frame loads the TypeScript compiler before it renders anything.
const POLL = {timeout: 45_000};

/** The live-example frames of the post, in document order. */
async function liveFrames(page: Page): Promise<Frame[]> {
  const figures = page.locator('figure[data-live-example]');
  await expect(figures).toHaveCount(4);
  const frames: Frame[] = [];
  for (let index = 0; index < 4; index += 1) {
    const iframe = figures.nth(index).locator('iframe');
    await expect(iframe).toHaveAttribute('sandbox', 'allow-scripts');
    const handle = await iframe.elementHandle();
    const frame = await handle?.contentFrame();
    if (frame == null) {
      throw new Error(`live example ${index} has no frame`);
    }
    frames.push(frame);
  }
  return frames;
}

test('runs each tsx live block in its own sandboxed frame and contains failures', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.setViewportSize({width: 1280, height: 900});
  await page.goto(POST);
  const [counter, asset, broken, uncompilable] = await liveFrames(page);

  // A running example, importing a published package: it renders and it runs.
  const count = counter.getByTestId('count');
  await expect(count).toHaveText('Clicked 0 times', POLL);
  await counter.getByRole('button', {name: 'Add one'}).click();
  await expect(count).toHaveText('Clicked 1 times');

  // An example importing its post's own asset.
  await expect(asset.getByTestId('sample-card')).toContainText(
    'The Star',
    POLL,
  );

  // A runtime error and a compile error each stay inside their own frame.
  await expect(broken.locator('body')).toContainText(
    'This example fails on purpose',
    POLL,
  );
  // The compiler transpiles without diagnostics, so a syntax error surfaces
  // when the frame evaluates the output.
  await expect(uncompilable.locator('body')).toContainText(
    'Unexpected token',
    POLL,
  );

  // The frame has an opaque origin: the example cannot reach the post.
  expect(
    await counter.evaluate(() => {
      try {
        return window.parent.document == null;
      } catch {
        return 'blocked';
      }
    }),
  ).toBe('blocked');

  // The post around the examples keeps rendering, and nothing the examples
  // did reached it as an error.
  await expect(
    page.getByText('The post keeps rendering after every example above.'),
  ).toBeVisible();
  await expect(
    page.locator('pre, code').filter({hasText: 'NotLive'}).first(),
  ).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('shows each live block as its source in the plain-text route', async ({
  request,
}) => {
  const response = await request.get(`${POST}.txt`);
  expect(response.ok()).toBe(true);
  const text = await response.text();
  expect(text).not.toMatch(/^\s*(`{3,}|~{3,})\s*tsx\s+live/m);
  expect(text).toContain('```tsx\nimport {SampleCard}');
  expect(text).toContain("throw new Error('This example fails on purpose');");
});

test('never lists the fixture in the blog index, the feed, or the sitemap', async ({
  page,
  request,
}) => {
  for (const path of ['/rss.xml', '/sitemap.xml']) {
    const body = await (await request.get(path)).text();
    expect(body, path).not.toContain('live-example-sample');
  }
  await page.goto('/blog');
  await expect(page.locator('a[href*="live-example-sample"]')).toHaveCount(0);
  // The fixture page itself asks search engines not to index it.
  await page.goto(POST);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    /noindex/,
  );
});
