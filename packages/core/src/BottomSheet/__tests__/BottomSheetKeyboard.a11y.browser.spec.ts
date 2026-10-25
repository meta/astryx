// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file BottomSheetKeyboard.a11y.browser.spec.ts
 * @input Built BottomSheet stories and real Chromium/WebKit keyboard input
 * @output Browser evidence for shared focus delegation, traversal, native
 *   scrolling, and Escape reaching a nested layer before the sheet
 * @position Cross-browser proof for useScrollableArea's contentOrViewport policy
 */

import {expect, test, type Page, type Locator} from '@playwright/test';
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

// macOS WebKit defaults to text-field traversal. Option+Tab selects its native
// all-controls traversal, equivalent to enabling Safari's keyboard preference.
function tabKey(browserName: string, reverse = false): string {
  return `${browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+' : ''}${reverse ? 'Shift+' : ''}Tab`;
}

async function mount(page: Page, browserName: string, variant = 'button') {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-bottomsheet--keyboard-delegation&viewMode=story`,
  );
  const viewport = page.getByRole('group', {
    name: 'Keyboard reading',
    exact: true,
  });
  await expect(viewport).toHaveAttribute('data-scrollable-block', 'true');
  await page.getByLabel('Content case').selectOption(variant);
  await expect(viewport).toHaveAttribute('tabindex', '0');
  // WebKit includes the non-modal dialog host in sequential navigation;
  // Chromium enters its descendants directly. Start immediately before the body.
  const before =
    browserName === 'webkit'
      ? page.getByRole('dialog', {name: 'Keyboard reading', exact: true})
      : page.getByRole('button', {name: 'Toggle modal', exact: true});
  await before.focus();
  return {viewport, before};
}

for (const variant of ['button', 'link']) {
  test(`${variant}: forward entry delegates once and reverse traversal exits`, async ({
    page,
    browserName,
  }) => {
    const {viewport, before} = await mount(page, browserName, variant);
    const first = page.getByRole(variant === 'button' ? 'button' : 'link', {
      name: variant === 'button' ? 'First action' : 'First link',
      exact: true,
    });
    await page.keyboard.press(tabKey(browserName));
    await expect(first).toBeFocused();
    await expect(viewport).toHaveAttribute('tabindex', '0');
    await expect(viewport).toHaveAccessibleName('Keyboard reading');
    await expect(first).toHaveAccessibleName(
      variant === 'button' ? 'First action' : 'First link',
    );
    await page.keyboard.press(tabKey(browserName));
    await expect(page.getByRole('button', {name: 'Last action'})).toBeFocused();
    await page.keyboard.press(tabKey(browserName, true));
    await expect(first).toBeFocused();
    await page.keyboard.press(tabKey(browserName, true));
    await expect(before).toBeFocused();
    await expect(viewport).toHaveAttribute('tabindex', '0');
    await page.keyboard.press(tabKey(browserName));
    await expect(first).toBeFocused();
  });
}

for (const variant of [
  'text',
  'input',
  'disabled',
  'nested',
  'native-scroll',
  'radiogroup',
  'slider',
  'combobox',
  'listbox',
  'menu',
  'grid',
  'tree',
  'tablist',
  'toolbar',
]) {
  test(`${variant}: retains a named viewport stop`, async ({
    page,
    browserName,
  }) => {
    const {viewport, before} = await mount(page, browserName, variant);
    await page.keyboard.press(tabKey(browserName));
    await expect(viewport).toBeFocused();
    await expect(viewport).toHaveAccessibleName('Keyboard reading');
    await page.keyboard.press(tabKey(browserName, true));
    await expect(before).toBeFocused();
  });
}

async function scrollRange(viewport: Locator) {
  return viewport.evaluate(element => ({
    position: element.scrollTop,
    max: element.scrollHeight - element.clientHeight,
  }));
}

for (const key of ['PageDown', 'ArrowDown']) {
  test(`${key}: reaches both scroll edges after delegation`, async ({
    page,
    browserName,
  }) => {
    const {viewport} = await mount(page, browserName);
    await page.keyboard.press(tabKey(browserName));
    const first = page.getByRole('button', {name: 'First action', exact: true});
    await expect(first).toBeFocused();
    for (let count = 0; count < 300; count++) {
      const {position, max} = await scrollRange(viewport);
      if (position >= max - 1) {
        break;
      }
      await page.keyboard.press(key, {delay: key === 'ArrowDown' ? 50 : 25});
    }
    await expect
      .poll(async () => {
        const {position, max} = await scrollRange(viewport);
        // WebKit can overshoot a native edge while showing rubber-band feedback.
        return max - position;
      })
      .toBeLessThanOrEqual(1);
    for (let count = 0; count < 300; count++) {
      if ((await scrollRange(viewport)).position <= 1) {
        break;
      }
      await page.keyboard.press(key === 'PageDown' ? 'PageUp' : 'ArrowUp', {
        delay: key === 'ArrowDown' ? 50 : 25,
      });
    }
    await expect
      .poll(async () => (await scrollRange(viewport)).position)
      .toBeLessThanOrEqual(1);
    await expect(first).toBeFocused();
  });
}

test('pointer and programmatic focus stay on the viewport, including during keydown', async ({
  page,
  browserName,
}) => {
  const {viewport, before} = await mount(page, browserName);
  await viewport.focus();
  await expect(viewport).toBeFocused();
  await before.focus();
  await viewport.click({position: {x: 4, y: 40}});
  await expect(viewport).toBeFocused();
  await before.focus();
  await before.evaluate(element => {
    element.addEventListener('keydown', event => {
      if (event instanceof KeyboardEvent && event.key === 'Tab') {
        event.preventDefault();
        document
          .querySelector<HTMLElement>(
            '[role="group"][aria-label="Keyboard reading"]',
          )
          ?.focus();
      }
    });
  });
  await page.keyboard.press(tabKey(browserName));
  await expect(viewport).toBeFocused();
});

test('dynamic eligibility is checked at the next entry without mutation observation', async ({
  page,
  browserName,
}) => {
  await page.addInitScript(() => {
    const Original = window.MutationObserver;
    const observers: MutationObserver[] = [];
    window.MutationObserver = class extends Original {
      constructor(callback: MutationCallback) {
        super(callback);
        observers.push(this);
      }
    };
    Object.assign(window, {
      stopMutationObservers: () =>
        observers.forEach(observer => observer.disconnect()),
    });
  });
  const {viewport, before} = await mount(page, browserName);
  await page.evaluate(() => {
    (
      window as unknown as {stopMutationObservers: () => void}
    ).stopMutationObservers();
  });
  await viewport.focus();
  const first = page.getByRole('button', {name: 'First action', exact: true});
  await first.evaluate(element => element.setAttribute('disabled', ''));
  await expect(viewport).toBeFocused();
  await before.focus();
  await page.keyboard.press(tabKey(browserName));
  await expect(page.getByRole('button', {name: 'Last action'})).toBeFocused();
  await before.focus();
  await first.evaluate(element => element.removeAttribute('disabled'));
  await page.keyboard.press(tabKey(browserName));
  await expect(first).toBeFocused();
  await before.focus();
  await viewport.locator('[data-scroll-content]').evaluate(element => {
    const input = document.createElement('input');
    input.setAttribute('aria-label', 'Inserted input');
    element.prepend(input);
  });
  await page.keyboard.press(tabKey(browserName));
  await expect(viewport).toBeFocused();
  await page.getByLabel('Inserted input').evaluate(element => element.remove());
  await expect(viewport).toBeFocused();
  await before.focus();
  await page.keyboard.press(tabKey(browserName));
  await expect(first).toBeFocused();
  await before.focus();
  await first.evaluate(element => element.setAttribute('role', 'combobox'));
  await page.keyboard.press(tabKey(browserName));
  await expect(viewport).toBeFocused();
});

test('modal BottomSheet keeps native focus containment without cycling through the viewport', async ({
  page,
  browserName,
}) => {
  await mount(page, browserName);
  await page.getByRole('button', {name: 'Toggle modal', exact: true}).click();
  const dialog = page.getByRole('dialog', {
    name: 'Keyboard reading',
    exact: true,
  });
  await expect
    .poll(async () => dialog.evaluate(element => element.matches(':modal')))
    .toBe(true);
  const viewport = page.getByRole('group', {
    name: 'Keyboard reading',
    exact: true,
  });
  await expect(viewport).toHaveAttribute('data-scrollable-block', 'true');
  const panel = dialog.locator('.astryx-bottom-sheet');
  await panel.focus();
  await page.keyboard.press(tabKey(browserName));
  const first = page.getByRole('button', {name: 'First action', exact: true});
  await expect(first).toBeFocused();
  await page.keyboard.press(tabKey(browserName, true));
  await expect(viewport).not.toBeFocused();
  await expect(first).not.toBeFocused();
  // Native dialog traversal may wrap to another sheet target or browser chrome;
  // it must never focus the inert background or create a viewport/child loop.
  await expect(
    page.getByRole('button', {name: 'Before sheet', includeHidden: true}),
  ).not.toBeFocused();
  await expect(viewport).toHaveAttribute('tabindex', '0');
});

test('fitting text removes the viewport stop while preserving current focus', async ({
  page,
  browserName,
}) => {
  const {viewport} = await mount(page, browserName, 'text');
  await viewport.focus();
  await viewport.locator('[data-scroll-content]').evaluate(element => {
    element.textContent = 'Short reading content';
  });
  await expect(viewport).not.toHaveAttribute('data-scrollable-block', 'true');
  await expect(viewport).toHaveAttribute('tabindex', '-1');
  await expect(viewport).toBeFocused();
});

test('horizontal overflow remains keyboard scrollable after delegation', async ({
  page,
  browserName,
}) => {
  const {viewport, before} = await mount(page, browserName);
  await viewport.evaluate(element => {
    const content = element.querySelector<HTMLElement>('[data-scroll-content]');
    if (content != null) {
      content.style.width = `${element.clientWidth + 320}px`;
    }
  });
  await expect(viewport).toHaveAttribute('data-scrollable-inline', 'true');
  await before.focus();
  await page.keyboard.press(tabKey(browserName));
  await expect(
    page.getByRole('button', {name: 'First action', exact: true}),
  ).toBeFocused();
  for (const key of ['ArrowRight', 'ArrowLeft']) {
    for (let count = 0; count < 100; count++) {
      const atEdge = await viewport.evaluate(
        (element, forward) =>
          forward
            ? element.scrollLeft >=
              element.scrollWidth - element.clientWidth - 1
            : element.scrollLeft <= 1,
        key === 'ArrowRight',
      );
      if (atEdge) {
        break;
      }
      await page.keyboard.press(key, {delay: 50});
    }
    await expect
      .poll(async () =>
        viewport.evaluate(
          (element, forward) =>
            forward
              ? element.scrollWidth - element.clientWidth - element.scrollLeft
              : element.scrollLeft,
          key === 'ArrowRight',
        ),
      )
      .toBeLessThanOrEqual(1);
  }
});

test('does not skip an aria-hidden first tab stop to delegate to a later action', async ({
  page,
  browserName,
}) => {
  const {viewport} = await mount(page, browserName);
  await page
    .getByRole('button', {name: 'First action', exact: true})
    .evaluate(element => {
      element.setAttribute('aria-hidden', 'true');
    });
  await page.keyboard.press(tabKey(browserName));
  await expect(viewport).toBeFocused();
});

// Issue #7194: one Escape press closes only the top-most layer. A Popover
// opened inside the sheet takes the first press; the sheet takes the next.
async function openNestedPopover(
  page: Page,
  {hasScrim, purpose}: {hasScrim: boolean; purpose: string},
) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-bottomsheet--nested-popover&viewMode=story`,
  );
  await page.getByLabel('Sheet purpose').selectOption(purpose);
  if (hasScrim) {
    await page.getByRole('checkbox', {name: 'Show scrim'}).check();
  }
  await page.getByRole('button', {name: 'Open sheet', exact: true}).click();
  const openSheets = page.locator('dialog[open]');
  await expect(openSheets).toHaveCount(1);
  const about = page.getByRole('button', {name: 'About', exact: true});
  // WebKit does not focus a button on mouse click, so open from the keyboard.
  await about.focus();
  await page.keyboard.press('Enter');
  const details = page.getByText('Nested information');
  await expect(details).toBeVisible();
  await expect(about).toBeFocused();
  return {openSheets, details};
}

for (const hasScrim of [false, true]) {
  test(`${hasScrim ? 'modal' : 'non-modal'}: Escape closes the nested Popover before the sheet`, async ({
    page,
  }) => {
    const {openSheets, details} = await openNestedPopover(page, {
      hasScrim,
      purpose: 'info',
    });

    await page.keyboard.press('Escape');
    await expect(details).toBeHidden();
    await expect(openSheets).toHaveCount(1);
    await expect(
      page.getByRole('button', {name: 'Close sheet', exact: true}),
    ).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(openSheets).toHaveCount(0);
  });
}

test('required: Escape closes the nested Popover and never the sheet', async ({
  page,
}) => {
  const {openSheets, details} = await openNestedPopover(page, {
    hasScrim: true,
    purpose: 'required',
  });

  await page.keyboard.press('Escape');
  await expect(details).toBeHidden();
  await expect(openSheets).toHaveCount(1);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await expect(openSheets).toHaveCount(1);
  await expect(
    page.getByRole('alertdialog', {name: 'Reference'}),
  ).toBeVisible();
});
