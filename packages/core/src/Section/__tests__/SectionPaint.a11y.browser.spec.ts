// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Layout/(container|padding)|apps/storybook/stories/Section)

/**
 * @file SectionPaint.a11y.browser.spec.ts
 * @input The built Storybook's Section stories in Chromium and WebKit
 * @output Real-browser proof that each variant and divider paints its token
 *   on its logical edge in both directions, that the painted container fills
 *   a fixed or a percentage minHeight, that padding resolves an edge over its
 *   axis and an axis over the uniform step, and that a nested Section escapes
 *   its parent's inset
 * @position Ongoing browser check for Section; jsdom computes no StyleX layout
 *   or paint
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});

test.afterAll(async () => {
  await storybook?.close();
});

async function open(page: Page, story: string, direction = 'ltr') {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-section--${story}&viewMode=story&globals=astryxTheme:neutral;colorMode:light;direction:${direction}`,
    {waitUntil: 'load'},
  );
  await page.locator('#storybook-root .astryx-section').first().waitFor();
  await page.evaluate(async () => document.fonts.ready);
}

/** The wrapper box, the painted box and the painted box's computed paint. */
async function readSection(page: Page, evidence: string) {
  return page.locator(`[data-evidence="${evidence}"]`).evaluate(wrapper => {
    const painted = wrapper.firstElementChild as HTMLElement;
    const style = getComputedStyle(painted);
    const resolve = (token: string, property: 'color' | 'backgroundColor') => {
      const probe = document.createElement('span');
      probe.style[property] = `var(${token})`;
      painted.append(probe);
      const value = getComputedStyle(probe)[property];
      probe.remove();
      return value;
    };
    const box = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return {top: rect.top, bottom: rect.bottom, height: rect.height};
    };
    return {
      wrapper: box(wrapper),
      painted: box(painted),
      background: style.backgroundColor,
      surface: resolve('--color-background-surface', 'backgroundColor'),
      muted: resolve('--color-background-muted', 'backgroundColor'),
      border: resolve('--color-border', 'color'),
      edges: {
        top: `${style.borderTopWidth} ${style.borderTopStyle} ${style.borderTopColor}`,
        bottom: `${style.borderBottomWidth} ${style.borderBottomStyle} ${style.borderBottomColor}`,
        left: `${style.borderLeftWidth} ${style.borderLeftStyle} ${style.borderLeftColor}`,
        right: `${style.borderRightWidth} ${style.borderRightStyle} ${style.borderRightColor}`,
      },
    };
  });
}

test('each variant paints its token and transparent paints nothing', async ({
  page,
}) => {
  await open(page, 'dividers');
  const muted = await readSection(page, 'dividers-block');
  expect(muted.background).toBe(muted.muted);
  const surface = await readSection(page, 'dividers-start');
  expect(surface.background).toBe(surface.surface);
  expect(surface.surface).not.toBe(surface.muted);
  const transparent = await readSection(page, 'dividers-end');
  expect(transparent.background).toBe('rgba(0, 0, 0, 0)');
});

test('dividers draw a 1px border token on the selected logical edges only', async ({
  page,
}) => {
  for (const direction of ['ltr', 'rtl'] as const) {
    await open(page, 'dividers', direction);
    const block = await readSection(page, 'dividers-block');
    const line = `1px solid ${block.border}`;
    expect(block.edges.top).toBe(line);
    expect(block.edges.bottom).toBe(line);
    expect(block.edges.left).toMatch(/^0px /);
    expect(block.edges.right).toMatch(/^0px /);

    const start = await readSection(page, 'dividers-start');
    const end = await readSection(page, 'dividers-end');
    const [startSide, endSide] =
      direction === 'rtl'
        ? (['right', 'left'] as const)
        : (['left', 'right'] as const);
    expect(start.edges[startSide]).toBe(line);
    expect(start.edges[endSide]).toMatch(/^0px /);
    expect(end.edges[endSide]).toBe(line);
    expect(end.edges[startSide]).toMatch(/^0px /);
    expect(start.edges.top).toMatch(/^0px /);
    expect(start.edges.bottom).toMatch(/^0px /);
    expect(end.edges.top).toMatch(/^0px /);
    expect(end.edges.bottom).toMatch(/^0px /);
  }
});

test('a nested Section reaches its parent painted edges inline and at its first and last block edges', async ({
  page,
}) => {
  await open(page, 'nested-padding-inheritance');
  const pairs = await page.evaluate(() =>
    [...document.querySelectorAll('#storybook-root .astryx-section')]
      .map(painted => {
        const wrapper = painted.parentElement as HTMLElement;
        const parent = wrapper.parentElement?.closest('.astryx-section');
        if (parent == null) {
          return null;
        }
        const child = wrapper.getBoundingClientRect();
        const outer = parent.getBoundingClientRect();
        const padding = getComputedStyle(parent).paddingLeft;
        return {
          padding,
          left: child.left - outer.left,
          right: outer.right - child.right,
          top: child.top - outer.top,
          bottom: outer.bottom - child.bottom,
        };
      })
      .filter(pair => pair != null),
  );
  expect(pairs).toHaveLength(3);
  for (const pair of pairs) {
    expect(pair.padding).not.toBe('0px');
    expect(pair).toMatchObject({left: 0, right: 0, top: 0, bottom: 0});
  }
});

test('stacked nested Sections escape the top edge only as the first child and the bottom edge only as the last', async ({
  page,
}) => {
  await open(page, 'dividers');
  const stack = await page
    .locator('[data-evidence="stack"]')
    .evaluate(wrapper => {
      const parent = wrapper.firstElementChild as HTMLElement;
      const outer = parent.getBoundingClientRect();
      return [...parent.children].map(child => {
        const rect = child.getBoundingClientRect();
        return {
          top: rect.top - outer.top,
          bottom: rect.bottom - outer.top,
          height: outer.height,
        };
      });
    });
  expect(stack).toHaveLength(3);
  const [first, middle, last] = stack;
  // The first reaches the parent's top edge and the last its bottom edge.
  expect(first.top).toBe(0);
  expect(last.bottom).toBe(last.height);
  // The siblings touch: a middle or last child that escapes upward, or a
  // first or middle child that escapes downward, overlaps its neighbour.
  expect(middle.top).toBe(first.bottom);
  expect(last.top).toBe(middle.bottom);
  expect(first.bottom).toBeLessThan(last.height);
});

test('the painted container fills a fixed and a percentage minHeight', async ({
  page,
}) => {
  await open(page, 'min-height');
  for (const [evidence, minimum] of [
    ['min-height-fixed', 240],
    ['min-height-percent', 200],
  ] as const) {
    const section = await readSection(page, evidence);
    // The wrapper reaches the minimum, and the paint and the bottom divider
    // reach the wrapper's bottom edge.
    expect(section.wrapper.height).toBe(minimum);
    expect(section.painted.height).toBe(minimum);
    expect(section.painted.bottom).toBe(section.wrapper.bottom);
    expect(section.background).toBe(section.muted);
    expect(section.edges.bottom).toBe(`1px solid ${section.border}`);
  }
});

test('a child margin collapses out of a zero-padding Section without minHeight and stays inside with one', async ({
  page,
}) => {
  await open(page, 'min-height');
  const gaps = async (evidence: string) =>
    page.locator(`[data-evidence="${evidence}"]`).evaluate(wrapper => {
      const painted = (
        wrapper.firstElementChild as HTMLElement
      ).getBoundingClientRect();
      const child = (
        wrapper.firstElementChild?.firstElementChild as HTMLElement
      ).getBoundingClientRect();
      return {
        top: child.top - painted.top,
        bottom: painted.bottom - child.bottom,
      };
    });
  // Without minHeight the paint keeps its block layout, so the 16px margins
  // collapse outside it.
  const collapsed = await gaps('margin-collapse');
  expect(collapsed.top).toBe(0);
  expect(collapsed.bottom).toBe(0);
  // With minHeight the painted container is a flex item and holds them.
  const contained = await gaps('margin-contained');
  expect(contained.top).toBe(16);
  expect(contained.bottom).toBeGreaterThanOrEqual(16);
});

/** The painted padding per physical edge, and the padding a child that reads
 * the published container-padding variables would take. */
async function readPadding(page: Page, evidence: string) {
  return page.locator(`[data-evidence="${evidence}"]`).evaluate(wrapper => {
    const painted = wrapper.firstElementChild as HTMLElement;
    const style = getComputedStyle(painted);
    const probe = document.createElement('div');
    probe.style.paddingInlineStart = 'var(--container-padding-inline-start)';
    probe.style.paddingInlineEnd = 'var(--container-padding-inline-end)';
    probe.style.paddingBlockStart = 'var(--container-padding-block-start)';
    probe.style.paddingBlockEnd = 'var(--container-padding-block-end)';
    painted.append(probe);
    const published = getComputedStyle(probe);
    const result = {
      padding: {
        top: style.paddingTop,
        bottom: style.paddingBottom,
        left: style.paddingLeft,
        right: style.paddingRight,
      },
      published: {
        top: published.paddingTop,
        bottom: published.paddingBottom,
        left: published.paddingLeft,
        right: published.paddingRight,
      },
    };
    probe.remove();
    return result;
  });
}

test('padding takes an edge over its axis and an axis over the uniform step, and publishes what it applies', async ({
  page,
}) => {
  for (const direction of ['ltr', 'rtl'] as const) {
    await open(page, 'padding-precedence', direction);
    const axis = await readPadding(page, 'axis-over-uniform');
    const axisEdges = {top: '8px', bottom: '8px', left: '4px', right: '4px'};
    expect(axis.padding).toEqual(axisEdges);
    expect(axis.published).toEqual(axisEdges);

    const edge = await readPadding(page, 'edge-over-axis-start');
    const [start, end] =
      direction === 'rtl'
        ? (['right', 'left'] as const)
        : (['left', 'right'] as const);
    const edgeEdges = {
      top: '8px',
      bottom: '24px',
      [start]: '8px',
      [end]: '24px',
    };
    expect(edge.padding).toEqual(edgeEdges);
    expect(edge.published).toEqual(edgeEdges);
  }
});
