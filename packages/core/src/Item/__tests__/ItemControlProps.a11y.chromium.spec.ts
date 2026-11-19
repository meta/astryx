// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ItemControlProps.a11y.chromium.spec.ts
 * @input The checked-in Core/Item › Disclosure Row story, a built Storybook
 *   and real Chromium
 * @output Proof, from the browser's accessibility tree, that a disclosure
 *   row's state rides the control keyboard focus lands on: the focused
 *   button is named by the label and reports expanded false, then true after
 *   Enter; the row's root reports no state; axe is clean before and after
 * @position Browser-only regression test for Item's controlProps. jsdom can
 *   show where an attribute landed, not what the accessibility tree reports
 *   for the focused node.
 */

import AxeBuilder from '@axe-core/playwright';
import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

interface AxValue {
  value?: unknown;
}
interface AxNode {
  role?: AxValue;
  name?: AxValue;
  properties?: ReadonlyArray<{name: string; value: AxValue}>;
}

/**
 * What Chromium's accessibility tree reports for the focused element: role,
 * name and the expanded state, read through CDP rather than approximated
 * from the DOM.
 */
async function focusedAxNode(
  page: Page,
): Promise<{role: unknown; name: unknown; expanded: unknown}> {
  const cdp = await page.context().newCDPSession(page);
  const {root} = (await cdp.send('DOM.getDocument', {depth: 0})) as unknown as {
    root: {nodeId: number};
  };
  const {nodeId} = await cdp.send('DOM.querySelector', {
    nodeId: root.nodeId,
    selector: ':focus',
  });
  const {nodes} = (await cdp.send('Accessibility.getPartialAXTree', {
    nodeId,
    fetchRelatives: false,
  })) as unknown as {nodes: ReadonlyArray<AxNode>};
  const node = nodes[0];
  const expanded = node?.properties?.find(p => p.name === 'expanded')?.value
    .value;
  await cdp.detach();
  return {role: node?.role?.value, name: node?.name?.value, expanded};
}

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});

test.afterAll(async () => {
  await storybook?.close();
});

test('the disclosure state rides the focused control, the root carries none, and axe is clean in both states', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-item--disclosure-row&viewMode=story`,
    {waitUntil: 'load'},
  );
  const control = page.getByRole('button', {name: 'Changed files'});
  await expect(control).toBeVisible();
  await expect(control).toHaveAttribute('aria-expanded', 'false');
  await expect(control).toHaveAttribute(
    'aria-controls',
    'disclosure-row-panel',
  );
  // The root is the control's parent row and reports no disclosure state.
  const root = page.locator('.astryx-item').first();
  await expect(root).not.toHaveAttribute('aria-expanded');
  await expect(root).not.toHaveAttribute('aria-controls');

  const closed = await new AxeBuilder({page})
    .include('#storybook-root')
    .analyze();
  expect(closed.violations).toEqual([]);

  // Keyboard: Tab lands on the control, and the accessibility tree reports
  // the state on that focused node.
  await page.keyboard.press('Tab');
  await expect(control).toBeFocused();
  const before = await focusedAxNode(page);
  expect(before.role).toBe('button');
  expect(before.name).toBe('Changed files 3 files');
  expect(before.expanded).toBe(false);

  await page.keyboard.press('Enter');
  await expect(control).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#disclosure-row-panel')).toBeVisible();
  const after = await focusedAxNode(page);
  expect(after.expanded).toBe(true);
  // Focus stays on the control through the state change.
  await expect(control).toBeFocused();

  const open = await new AxeBuilder({page})
    .include('#storybook-root')
    .analyze();
  expect(open.violations).toEqual([]);
});
