// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Table/|packages/core/src/hooks/(useTreeFocus|isRtlElement)|packages/core/src/utils/(focusReturn|useFocusLeavingChange|focusOutline)|apps/storybook/stories/TableTree\.stories)

/**
 * @file TableTreeSemantics.a11y.chromium.spec.ts
 * @input Built Core/TableTree stories and Chromium's own accessibility tree
 * @output Accessibility-tree evidence for the tree plugin's static semantics.
 *   A table with expandable rows is a treegrid, and its rows report level and
 *   expanded state. After Tab, the focused node is the active row. Flat data
 *   keeps a native table whose rows report no level.
 * @position Chromium-only partner of TableTreeKeyboard.a11y.browser.spec.ts.
 *   Role and state come from the engine, which the jsdom suite does not have.
 */

import {
  expect,
  test,
  type CDPSession,
  type Locator,
  type Page,
} from '@playwright/test';
import {
  createChromiumHarness,
  holdMotionStill,
} from '@astryxdesign/a11y-spec/chromium';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

/** The story's own table. Storybook's hidden docs table is outside the root. */
const TABLE = '#storybook-root table';

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});

test.afterAll(async () => {
  await storybook?.close();
});

async function mount(page: Page, story: string): Promise<void> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-tabletree--${story}&viewMode=story`,
    {waitUntil: 'load'},
  );
  await holdMotionStill(page);
  await page.locator(`${TABLE} tbody tr`).first().waitFor({state: 'attached'});
}

/** A body row of the default story, by the id its record has in the data. */
function rowSelector(id: string): string {
  return `${TABLE} tbody tr[data-tree-id="${id}"]`;
}

/** The role Chromium computes for an element, read through the shared harness. */
async function computedRole(
  page: Page,
  cdp: CDPSession,
  subject: Locator,
): Promise<string | null> {
  const harness = createChromiumHarness({page, cdp, subject});
  return (await (await harness.subject()).computed()).role;
}

/**
 * Chromium's own accessibility nodes for the elements a selector finds. The
 * harness reports no level or expanded state, so this reads the protocol.
 */
async function axNodes(cdp: CDPSession, selector: string) {
  const {root} = await cdp.send('DOM.getDocument', {depth: 0});
  const {nodeIds} = await cdp.send('DOM.querySelectorAll', {
    nodeId: root.nodeId,
    selector,
  });
  const found = [];
  for (const nodeId of nodeIds) {
    const {nodes} = await cdp.send('Accessibility.getPartialAXTree', {
      nodeId,
      fetchRelatives: false,
    });
    found.push(...nodes.slice(0, 1));
  }
  return found;
}

/** A node's properties by name, with the values the protocol reports. */
function propertiesOf(node: {
  properties?: ReadonlyArray<{name: string; value: {value?: unknown}}>;
}): Record<string, unknown> {
  return Object.fromEntries(
    (node.properties ?? []).map(property => [
      property.name,
      property.value.value,
    ]),
  );
}

test('a table with expandable rows is a treegrid in the accessibility tree', async ({
  page,
}) => {
  await mount(page, 'default');
  const cdp = await page.context().newCDPSession(page);

  expect(await computedRole(page, cdp, page.locator(TABLE))).toBe('treegrid');
});

const ROWS = [
  {
    id: 'eng',
    kind: 'an expanded parent',
    level: 1,
    expanded: true,
    position: 1,
    setSize: 3,
  },
  {
    id: 'eng-platform',
    kind: 'a collapsed child parent',
    level: 2,
    expanded: false,
    position: 1,
    setSize: 2,
  },
  // A leaf has nothing to open, so it reports no expanded state.
  {
    id: 'ops',
    kind: 'a leaf',
    level: 1,
    expanded: undefined,
    position: 3,
    setSize: 3,
  },
] as const;

for (const expected of ROWS) {
  const states =
    expected.expanded === undefined
      ? 'its level and no expanded state'
      : 'its level and expanded state';
  test(`${expected.kind} row reports ${states} in the accessibility tree, and carries its place in its set`, async ({
    page,
  }) => {
    await mount(page, 'default');
    const cdp = await page.context().newCDPSession(page);
    const row = page.locator(rowSelector(expected.id));

    expect(await computedRole(page, cdp, row)).toBe('row');
    const nodes = await axNodes(cdp, rowSelector(expected.id));
    expect(nodes).toHaveLength(1);
    const properties = propertiesOf(nodes[0] ?? {});
    expect({level: properties.level, expanded: properties.expanded}).toEqual({
      level: expected.level,
      expanded: expected.expanded,
    });
    // The protocol reports no position in a set, so the attributes the engine
    // reads are the evidence for it.
    await expect(row).toHaveAttribute(
      'aria-posinset',
      String(expected.position),
    );
    await expect(row).toHaveAttribute('aria-setsize', String(expected.setSize));
  });
}

test("Tab into the rows puts the accessibility tree's focus on the active row", async ({
  page,
}) => {
  await mount(page, 'default');
  const active = page.locator(rowSelector('eng'));
  await expect(active).toHaveAttribute('tabindex', '0');
  // The story renders the table alone, so a button before it starts the Tab.
  await page.evaluate(() => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Before table';
    document.body.prepend(button);
    button.focus();
  });

  await page.keyboard.press('Tab');
  await expect(active).toBeFocused();

  const cdp = await page.context().newCDPSession(page);
  const {nodes} = await cdp.send('Accessibility.getFullAXTree');
  // The root web area also reports focus while its document has it.
  const focused = nodes.filter(
    node =>
      node.role?.value !== 'RootWebArea' && propertiesOf(node).focused === true,
  );
  const rows = await axNodes(cdp, rowSelector('eng'));
  expect(rows).toHaveLength(1);
  expect(
    focused.map(node => ({
      role: node.role?.value,
      node: node.backendDOMNodeId,
    })),
  ).toEqual([{role: 'row', node: rows[0]?.backendDOMNodeId}]);
});

test('flat data keeps the native table, and its rows report no level', async ({
  page,
}) => {
  await mount(page, 'flat-data-is-a-no-op');
  const cdp = await page.context().newCDPSession(page);

  expect(await computedRole(page, cdp, page.locator(TABLE))).toBe('table');
  const rows = await axNodes(cdp, `${TABLE} tbody tr`);
  expect(rows).toHaveLength(3);
  for (const row of rows) {
    const properties = propertiesOf(row);
    expect({
      role: row.role?.value,
      level: properties.level,
      expanded: properties.expanded,
    }).toEqual({role: 'row', level: undefined, expanded: undefined});
  }
});
