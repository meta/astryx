// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/(Layout/Layout(Content|Panel)|Stack/StackItem|hooks/useScrollRegionProps|AppShell/observeMainOverflow)|apps/storybook/stories/ScrollRegionA11y)
/**
 * Chromium's accessibility tree for a scrolling region: while it scrolls,
 * a screen reader that reaches it announces a named group.
 */
import {
  expect,
  test,
  type CDPSession,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const REGION = '[data-scroll-region]';

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});

test.afterAll(async () => storybook?.close());

async function open(page: Page, story: string): Promise<void> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=a11y-scroll-region-name--${story}&viewMode=story`,
    {waitUntil: 'load'},
  );
}

/** Chromium's computed role and name for the region, as a screen reader reads them. */
async function announced(
  cdp: CDPSession,
): Promise<{role: string; name: string}> {
  const {root} = await cdp.send('DOM.getDocument', {depth: -1});
  const {nodeId} = await cdp.send('DOM.querySelector', {
    nodeId: root.nodeId,
    selector: REGION,
  });
  const {nodes} = await cdp.send('Accessibility.getPartialAXTree', {
    nodeId,
    fetchRelatives: false,
  });
  const node = nodes[0];
  return {
    role: String(node?.role?.value ?? ''),
    name: String(node?.name?.value ?? ''),
  };
}

/** The region is on screen with a real box, and whether it overflows. */
async function presentAndOverflowing(page: Page): Promise<boolean> {
  const region = page.locator(REGION);
  await expect(region).toHaveCount(1);
  const box = await region.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(0);
  expect(box?.height ?? 0).toBeGreaterThan(0);
  return region.evaluate(
    element =>
      element.scrollHeight > element.clientHeight + 1 ||
      element.scrollWidth > element.clientWidth + 1,
  );
}

async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });
}

const SCROLLING = [
  {story: 'content-scrolls', role: 'group', name: 'Content'},
  {story: 'content-labelled', role: 'group', name: 'Messages'},
  // A caller's landmark keeps its role, named only by the caller.
  {story: 'content-main', role: 'main', name: ''},
  {story: 'panel-scrolls', role: 'group', name: 'Content'},
  {story: 'stack-item-scrolls', role: 'group', name: 'Content'},
  // Another element keeps its own role.
  {story: 'stack-item-list-scrolls', role: 'list', name: ''},
] as const;

for (const {story, role, name} of SCROLLING) {
  test(`a scrolling region is announced [${story}]: ${role} "${name}"`, async ({
    page,
  }) => {
    await open(page, story);
    expect(await presentAndOverflowing(page)).toBe(true);
    const cdp = await page.context().newCDPSession(page);
    await expect.poll(async () => announced(cdp)).toEqual({role, name});
    // Tab behavior stays the browser's: no tab index is set.
    expect(await page.locator(REGION).getAttribute('tabindex')).toBeNull();
  });
}

const QUIET = [
  {story: 'content-fits', overflows: false},
  {story: 'stack-item-static', overflows: true},
] as const;

for (const {story, overflows} of QUIET) {
  test(`a region that does not scroll adds no role or name [${story}]`, async ({
    page,
  }) => {
    await open(page, story);
    expect(await presentAndOverflowing(page)).toBe(overflows);
    await settle(page);
    const cdp = await page.context().newCDPSession(page);
    // A plain element: Chromium exposes it as generic, or leaves it out of
    // the tree.
    const {role, name} = await announced(cdp);
    expect(['generic', 'none']).toContain(role);
    expect(name).toBe('');
  });
}
