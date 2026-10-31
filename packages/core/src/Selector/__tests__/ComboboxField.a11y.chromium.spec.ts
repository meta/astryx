// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ComboboxField.a11y.chromium.spec.ts
 * @input The `Core/Hooks/useCombobox` stories in a built Storybook, the
 *   reusable Combobox contract, axe, and real keyboard and pointer input
 * @output Chromium proof that a combobox over a field the story renders itself
 *   keeps focus in the field, exposes its roles and relationships, and takes
 *   the keys and presses spec:AST-075 assigns to it
 * @position Run with `pnpm test:a11y-contract`. The unit suite in
 *   useCombobox.test.tsx covers the same requirements without an engine.
 */

import AxeBuilder from '@axe-core/playwright';
import {expect, test, type Locator, type Page} from '@playwright/test';
import {
  COMBOBOX_PATTERN,
  blockingResults,
  checkAccessibilitySpec,
  formatFailures,
  type ComboboxStateFacts,
} from '@astryxdesign/a11y-spec';
import {createChromiumHarness} from '@astryxdesign/a11y-spec/chromium';
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

const STORY = {
  search: 'core-hooks-usecombobox--search-field',
  layer: 'core-hooks-usecombobox--assignee-field',
  dialog: 'core-hooks-usecombobox--in-dialog',
} as const;

async function openStory(page: Page, story: string): Promise<void> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=${story}&viewMode=story`,
    {waitUntil: 'load'},
  );
}

/** Whether DOM focus is on exactly this element. */
async function hasFocus(locator: Locator): Promise<boolean> {
  return locator.evaluate(el => el === el.ownerDocument.activeElement);
}

/** The id the field names as its active option, which must be rendered. */
async function activeOptionName(page: Page, field: Locator): Promise<string> {
  const id = await field.getAttribute('aria-activedescendant');
  expect(id).not.toBeNull();
  const option = page.locator(`[id="${id}"]`);
  await expect(option).toHaveAttribute('role', 'option');
  await expect(option).toHaveAttribute('aria-selected', 'true');
  return (await option.textContent()) ?? '';
}

const AXE_DISABLED_RULES = [
  // A story is a fragment, not a page.
  'landmark-one-main',
  'page-has-heading-one',
  'region',
  // A long list scrolls without a Tab stop of its own by design: focus stays
  // in the field, whose arrows reach every option and scroll it into view.
  'scrollable-region-focusable',
];

async function axeViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({page})
    .disableRules(AXE_DISABLED_RULES)
    .analyze();
  return results.violations.map(
    violation =>
      `${violation.id}: ${violation.nodes.map(node => node.target.join(' ')).join(', ')}`,
  );
}

const closedFacts: ComboboxStateFacts = {
  name: '',
  expanded: false,
  popupRole: 'listbox',
  popupVisible: false,
  activeDescendant: false,
  readOnly: false,
  busy: false,
  inertUnderOwnModal: false,
};

interface Scenario {
  readonly id: string;
  readonly story: string;
  readonly name: string;
  readonly open: boolean;
  /** Puts the story in the state, starting from a focused field. */
  readonly arrange: (page: Page, field: Locator) => Promise<void>;
}

const SCENARIOS: ReadonlyArray<Scenario> = [
  {
    id: 'input-hidden',
    story: STORY.search,
    name: 'Search settings',
    open: false,
    arrange: async () => {},
  },
  {
    id: 'input-shown-in-flow',
    story: STORY.search,
    name: 'Search settings',
    open: true,
    arrange: async page => {
      await page.keyboard.type('no');
      await page.keyboard.press('ArrowDown');
    },
  },
  {
    id: 'input-shown-in-layer',
    story: STORY.layer,
    name: 'Assignee',
    open: true,
    arrange: async page => {
      await page.keyboard.type('ar');
    },
  },
  {
    id: 'input-shown-in-dialog',
    story: STORY.dialog,
    name: 'Add people',
    open: true,
    arrange: async page => {
      await page.keyboard.type('a');
    },
  },
];

for (const scenario of SCENARIOS) {
  test(`Combobox contract over a caller-rendered field — ${scenario.id}`, async ({
    page,
  }) => {
    await openStory(page, scenario.story);
    const field = page.getByRole('combobox', {name: scenario.name});
    await field.click();
    await scenario.arrange(page, field);
    const listbox = page.getByRole('listbox');
    if (scenario.open) {
      await expect(listbox).toBeVisible();
    } else {
      await expect(listbox).toHaveCount(0);
    }

    const related: Record<string, Locator> = {};
    if (scenario.open) {
      related.popup = listbox;
      const id = await field.getAttribute('aria-activedescendant');
      expect(id).not.toBeNull();
      related['active-descendant'] = page.locator(`[id="${id}"]`);
    }
    const cdp = await page.context().newCDPSession(page);
    const run = await checkAccessibilitySpec({
      spec: COMBOBOX_PATTERN,
      binding: 'useCombobox.field',
      state: scenario.id,
      facts: {
        ...closedFacts,
        name: scenario.name,
        expanded: scenario.open,
        popupVisible: scenario.open,
        activeDescendant: scenario.open,
      },
      mount: async () =>
        createChromiumHarness({page, cdp, subject: field, related}),
    });
    expect(formatFailures(blockingResults([run]))).toBe('');
    expect(
      run.results
        .filter(result => result.status === 'unrun')
        .map(result => `${result.expectation}: ${result.detail ?? ''}`),
    ).toEqual([]);
    // Arranging the state never moved focus out of the field (FR1).
    expect(await hasFocus(field)).toBe(true);
    expect(await axeViolations(page)).toEqual([]);
  });
}

test('arrows move the active option and Enter picks it, with focus kept in the field', async ({
  page,
}) => {
  await openStory(page, STORY.search);
  const field = page.getByRole('combobox', {name: 'Search settings'});
  await field.click();
  await page.keyboard.type('no');
  await expect(page.getByRole('option')).toHaveText([
    'Notifications',
    'Notification sound',
  ]);
  // A new query activates nothing, so Enter would stay the field's.
  await expect(field).not.toHaveAttribute('aria-activedescendant');

  await page.keyboard.press('ArrowDown');
  expect(await activeOptionName(page, field)).toBe('Notifications');
  await page.keyboard.press('ArrowDown');
  expect(await activeOptionName(page, field)).toBe('Notification sound');
  await page.keyboard.press('ArrowDown');
  expect(await activeOptionName(page, field)).toBe('Notifications');
  await page.keyboard.press('ArrowUp');
  expect(await activeOptionName(page, field)).toBe('Notification sound');
  expect(await hasFocus(field)).toBe(true);

  await page.keyboard.press('Enter');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(page.getByText('Opened Notification sound')).toBeVisible();
  await expect(field).toHaveAttribute('aria-expanded', 'false');
  expect(await hasFocus(field)).toBe(true);
});

test('ArrowDown brings back a hidden list in a single-line field', async ({
  page,
}) => {
  await openStory(page, STORY.search);
  const field = page.getByRole('combobox', {name: 'Search settings'});
  await field.click();
  await page.keyboard.type('pass');
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(field).toHaveValue('pass');

  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('listbox')).toBeVisible();
  expect(await activeOptionName(page, field)).toBe('Password');
});

test('Escape hides the list before it closes the dialog around the field', async ({
  page,
}) => {
  await openStory(page, STORY.dialog);
  const dialog = page.getByRole('dialog', {name: 'Share'});
  await expect(dialog).toBeVisible();
  const field = page.getByRole('combobox', {name: 'Add people'});
  await field.click();
  await page.keyboard.type('al');
  await expect(page.getByRole('listbox')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(dialog).toBeVisible();
  expect(await hasFocus(field)).toBe(true);

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('Shift+Escape also hides the list before it closes the dialog around the field', async ({
  page,
}) => {
  await openStory(page, STORY.dialog);
  const dialog = page.getByRole('dialog', {name: 'Share'});
  const field = page.getByRole('combobox', {name: 'Add people'});
  await field.click();
  await page.keyboard.type('al');
  await expect(page.getByRole('listbox')).toBeVisible();

  await page.keyboard.press('Shift+Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  // Give a close request time to land if the press had reached the dialog.
  await page.waitForTimeout(300);
  await expect(dialog).toBeVisible();
  expect(await hasFocus(field)).toBe(true);

  await page.keyboard.press('Shift+Escape');
  await expect(dialog).toHaveCount(0);
});

test('with no matches in the dialog, the first Escape hides the empty message and the dialog stays', async ({
  page,
}) => {
  await openStory(page, STORY.dialog);
  const dialog = page.getByRole('dialog', {name: 'Share'});
  const field = page.getByRole('combobox', {name: 'Add people'});
  await field.click();
  await page.keyboard.type('zz');
  // The shown paragraph, not the dialog's live region, which announces the
  // same words for a moment.
  const empty = dialog.locator('p').filter({hasText: /^No one matches$/});
  await expect(empty).toBeVisible();
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(field).toHaveAttribute('aria-expanded', 'false');

  await page.keyboard.press('Escape');
  await expect(empty).toHaveCount(0);
  await expect(dialog).toBeVisible();
  expect(await hasFocus(field)).toBe(true);

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('hovering makes an option active and a press picks it, with focus kept in the field', async ({
  page,
}) => {
  await openStory(page, STORY.dialog);
  const field = page.getByRole('combobox', {name: 'Add people'});
  await field.click();
  await page.keyboard.type('a');
  const grace = page.getByRole('option', {name: 'Grace Hopper (away)'});
  await expect(grace).toHaveAttribute('aria-disabled', 'true');

  await page.getByRole('option', {name: 'Katherine Johnson'}).hover();
  expect(await activeOptionName(page, field)).toBe('Katherine Johnson');
  await grace.hover();
  expect(await activeOptionName(page, field)).toBe('Katherine Johnson');
  // Playwright waits for an aria-disabled element to enable; press it anyway.
  await grace.click({force: true});
  await expect(page.getByRole('listbox')).toBeVisible();
  await expect(page.getByText('Not shared yet')).toBeVisible();
  expect(await hasFocus(field)).toBe(true);

  await page.getByRole('option', {name: 'Margaret Hamilton'}).click();
  await expect(page.getByText('Shared with Margaret Hamilton')).toBeVisible();
  await expect(page.getByRole('listbox')).toHaveCount(0);
  expect(await hasFocus(field)).toBe(true);
});

/**
 * Records every non-empty text written to a polite region, by where it is:
 * the page body's shared region, or an open dialog's own.
 */
async function recordPoliteWrites(
  page: Page,
): Promise<() => Promise<{body: string[]; dialog: string[]}>> {
  await page.addInitScript(() => {
    const writes = {body: [] as string[], dialog: [] as string[]};
    (window as unknown as {__writes: typeof writes}).__writes = writes;
    new MutationObserver(records => {
      for (const record of records) {
        const target = record.target;
        if (!(target instanceof Element)) {
          continue;
        }
        const where = target.matches('[data-astryx-live-region="polite"]')
          ? 'body'
          : target.matches('[data-astryx-modal-live-region="polite"]')
            ? 'dialog'
            : null;
        for (const node of where == null ? [] : record.addedNodes) {
          if (node.textContent) {
            writes[where as 'body' | 'dialog'].push(node.textContent);
          }
        }
      }
    }).observe(document, {childList: true, subtree: true});
  });
  return async () =>
    page.evaluate(() => {
      const writes = (
        window as unknown as {__writes: {body: string[]; dialog: string[]}}
      ).__writes;
      return {body: [...writes.body], dialog: [...writes.dialog]};
    });
}

/** Two frames: the shared channel joins messages written within one (AST-086 FR9). */
async function nextFrames(page: Page): Promise<void> {
  await page.evaluate(
    async () =>
      new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}

test('the search story announces each new query’s count, and the words it shows for none', async ({
  page,
}) => {
  const writes = await recordPoliteWrites(page);
  await openStory(page, STORY.search);
  await page.getByRole('combobox', {name: 'Search settings'}).click();
  // Nothing is announced on mount.
  await nextFrames(page);
  await page.waitForTimeout(300);
  expect(await writes()).toEqual({body: [], dialog: []});
  const expected: string[] = [];
  for (const [key, words] of [
    ['n', '5 results'],
    ['o', '2 results'],
    ['z', 'No settings match'],
  ] as const) {
    await page.keyboard.press(key);
    expected.push(words);
    await expect.poll(writes).toEqual({body: expected, dialog: []});
    await nextFrames(page);
  }
  await expect(
    page.locator('p').filter({hasText: /^No settings match$/}),
  ).toBeVisible();
  // A trailing space leaves the query unchanged, so nothing new is announced.
  await page.keyboard.press(' ');
  await nextFrames(page);
  await page.waitForTimeout(300);
  expect(await writes()).toEqual({body: expected, dialog: []});
});

test('in a layer, the active option crosses into it, focus stays in the input, and Escape hides only the layer', async ({
  page,
}) => {
  await openStory(page, STORY.layer);
  const field = page.getByRole('combobox', {name: 'Assignee'});
  await field.click();
  await page.keyboard.type('ar');
  const listbox = page.getByRole('listbox', {name: 'People'});
  await expect(listbox).toBeVisible();
  await expect(field).toHaveAttribute('aria-expanded', 'true');
  await expect(field).toHaveAttribute(
    'aria-controls',
    (await listbox.getAttribute('id')) ?? '',
  );
  expect(await activeOptionName(page, field)).toBe('Barbara Liskov');
  await page.keyboard.press('ArrowDown');
  expect(await activeOptionName(page, field)).toBe('Margaret Hamilton');
  expect(await hasFocus(field)).toBe(true);

  await page.keyboard.press('Escape');
  await expect(listbox).toHaveCount(0);
  await expect(field).toHaveAttribute('aria-expanded', 'false');
  expect(await hasFocus(field)).toBe(true);
  await expect(page.getByText('Unassigned', {exact: true})).toBeVisible();
});

test('the dialog story announces in the dialog’s own live region, never the page body’s', async ({
  page,
}) => {
  const writes = await recordPoliteWrites(page);
  await openStory(page, STORY.dialog);
  await page.getByRole('combobox', {name: 'Add people'}).click();
  const expected: string[] = [];
  for (const [key, words] of [
    ['a', '7 results'],
    ['l', '1 result'],
    ['z', 'No one matches'],
  ] as const) {
    await page.keyboard.press(key);
    expected.push(words);
    await expect.poll(writes).toEqual({body: [], dialog: expected});
    await nextFrames(page);
  }
});
