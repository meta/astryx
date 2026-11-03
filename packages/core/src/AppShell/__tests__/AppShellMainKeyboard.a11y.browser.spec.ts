// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file AppShellMainKeyboard.a11y.browser.spec.ts
 * @input The `Core/AppShell` stories in a built Storybook, and real Chromium
 *   and WebKit keyboard input.
 * @output Browser evidence that the main region of a `fill` shell is reachable
 *   from the keyboard while it scrolls overflowing content (AST-025 FR12): Tab
 *   reaches it when nothing inside is focusable and Page Down then scrolls it,
 *   and the stop it reaches is exposed as the main landmark (its role names it);
 *   Tab entry moves on to its first link when there is one; keyboard focus
 *   draws the focus ring inset, following the elevated surface's rounded
 *   corner (also after Shift+Tab from the page start, and for as long as that
 *   focus stays when the content shrinks to fit), and pointer focus, the skip
 *   link's focus move and a script's focus() draw none; an
 *   overflowing main rounds its corner only while its ring shows; a main
 *   region that fits stays out of the tab order and keeps its square corner.
 * @position Cross-browser proof; jsdom has no layout, so AppShell.test.tsx can
 *   only assert the tab stop against mocked geometry.
 */

import {chromium, expect, test, type Page} from '@playwright/test';
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

test.use({viewport: {width: 1280, height: 720}});

async function openStory(page: Page, story: string) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-appshell--${story}&viewMode=story`,
  );
  await expect(page.getByRole('main')).toBeVisible();
}

/**
 * Presses Tab from the top of a freshly opened story until focus reaches
 * `isTarget`, or gives up after `limit` presses. Returns how many presses it
 * took, or -1.
 */
async function tabUntil(
  page: Page,
  isTarget: () => boolean,
  limit = 60,
): Promise<number> {
  for (let presses = 1; presses <= limit; presses += 1) {
    await page.keyboard.press('Tab');
    if (await page.evaluate(isTarget)) {
      return presses;
    }
  }
  return -1;
}

test('Tab reaches an overflowing main region with nothing focusable in it, and Page Down scrolls it', async ({
  page,
}) => {
  await openStory(page, 'long-content');
  const main = page.getByRole('main');
  await expect(main).toHaveAttribute('tabindex', '0');

  const presses = await tabUntil(
    page,
    () => document.activeElement?.getAttribute('role') === 'main',
  );
  expect(presses).toBeGreaterThan(0);

  await page.keyboard.press('PageDown');
  await expect
    .poll(async () => main.evaluate(element => element.scrollTop))
    .toBeGreaterThan(100);
});

test('Tab onto an overflowing main with no name of its own exposes the main landmark', async ({
  page,
  browserName,
}) => {
  await openStory(page, 'long-content');
  const presses = await tabUntil(
    page,
    () => document.activeElement?.getAttribute('role') === 'main',
  );
  expect(presses).toBeGreaterThan(0);

  // The stop has no name of its own: its role, the main landmark, is what a
  // screen reader announces (AST-025 FR12 lets the single main rely on it).
  const focused = page.locator(':focus');
  await expect(focused).toHaveRole('main');
  await expect(focused).toHaveAccessibleName('');
  if (browserName !== 'chromium') {
    return;
  }
  // Chromium's own accessibility tree, the one screen readers read: the
  // focused element's node is the main landmark, exposed rather than ignored.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Accessibility.enable');
  const {result} = await cdp.send('Runtime.evaluate', {
    expression: 'document.activeElement',
  });
  const {node} = await cdp.send('DOM.describeNode', {
    objectId: result.objectId,
  });
  const {nodes} = await cdp.send('Accessibility.getPartialAXTree', {
    backendNodeId: node.backendNodeId,
    fetchRelatives: false,
  });
  await cdp.detach();
  expect(
    nodes.map(axNode => ({
      role: axNode.role?.value,
      name: axNode.name?.value ?? '',
      ignored: axNode.ignored,
      focused: axNode.properties?.some(
        property =>
          property.name === 'focused' && property.value.value === true,
      ),
    })),
  ).toEqual([{role: 'main', name: '', ignored: false, focused: true}]);
});

test('Tab entry moves on to the first link of an overflowing main region, and Shift+Tab skips the region', async ({
  page,
}) => {
  await openStory(page, 'long-content');
  const toMain = await tabUntil(
    page,
    () => document.activeElement?.getAttribute('role') === 'main',
  );
  expect(toMain).toBeGreaterThan(0);

  // A fresh load, so Tab starts from the top again.
  await openStory(page, 'long-content');
  await page.getByRole('main').evaluate(main => {
    const link = document.createElement('a');
    link.href = '#details';
    link.textContent = 'Details';
    main.prepend(link);
  });
  // The press that entered main now lands on its first link: no extra stop.
  const toLink = await tabUntil(
    page,
    () => document.activeElement?.textContent === 'Details',
  );
  expect(toLink).toBe(toMain);

  await page.keyboard.press('Shift+Tab');
  expect(
    await page.evaluate(() => document.activeElement?.getAttribute('role')),
  ).not.toBe('main');
});

test('keyboard focus draws the focus ring inside the overflowing main region, and pointer focus draws none', async ({
  page,
}) => {
  await openStory(page, 'long-content');
  const main = page.getByRole('main');
  const presses = await tabUntil(
    page,
    () => document.activeElement?.getAttribute('role') === 'main',
  );
  expect(presses).toBeGreaterThan(0);
  const ring = await main.evaluate(element => {
    const style = getComputedStyle(element);
    return {
      style: style.outlineStyle,
      width: Number.parseFloat(style.outlineWidth),
      offset: Number.parseFloat(style.outlineOffset),
    };
  });
  expect(ring.style).not.toBe('none');
  expect(ring.width).toBeGreaterThan(0);
  // Inset by its own width, so the shell's clipping around main cannot cut it.
  expect(ring.offset).toBeCloseTo(-ring.width, 1);
  // The ring follows the shape of the surface main sits on: with a top nav
  // and an inline side nav, the elevated surface rounds its top-start corner.
  const corners = await main.evaluate(element => {
    const surface = element.parentElement?.firstElementChild;
    if (surface == null || surface === element) {
      throw new Error('no elevated surface behind main');
    }
    return {
      main: getComputedStyle(element).borderTopLeftRadius,
      surface: getComputedStyle(surface).borderTopLeftRadius,
    };
  });
  expect(Number.parseFloat(corners.surface)).toBeGreaterThan(0);
  expect(corners.main).toBe(corners.surface);

  // A pointer press inside main focuses it too, without a ring.
  await openStory(page, 'long-content');
  const box = await main.boundingBox();
  if (box == null) {
    throw new Error('no main box');
  }
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  expect(
    await page.evaluate(() => document.activeElement?.getAttribute('role')),
  ).toBe('main');
  expect(
    await main.evaluate(element => getComputedStyle(element).outlineStyle),
  ).toBe('none');
});

test('the skip link moves focus to an overflowing main without drawing the ring', async ({
  page,
}) => {
  await openStory(page, 'long-content');
  const main = page.getByRole('main');
  const presses = await tabUntil(
    page,
    () =>
      document.activeElement?.getAttribute('data-testid') === 'skip-to-content',
  );
  expect(presses).toBeGreaterThan(0);

  await page.keyboard.press('Enter');
  expect(
    await page.evaluate(() => document.activeElement?.getAttribute('role')),
  ).toBe('main');
  expect(
    await main.evaluate(element => getComputedStyle(element).outlineStyle),
  ).toBe('none');
});

test("a script's focus on an overflowing main after keyboard input draws no ring", async ({
  page,
}) => {
  await openStory(page, 'long-content');
  const main = page.getByRole('main');
  await page.keyboard.press('Tab');
  await main.evaluate(element => element.focus());

  expect(
    await page.evaluate(() => document.activeElement?.getAttribute('role')),
  ).toBe('main');
  expect(
    await main.evaluate(element => getComputedStyle(element).outlineStyle),
  ).toBe('none');
  expect(
    await main.evaluate(
      element => getComputedStyle(element).borderTopLeftRadius,
    ),
  ).toBe('0px');
});

test('Shift+Tab from the start of the page reaches an overflowing main with its ring', async ({
  page,
}) => {
  await openStory(page, 'long-content');
  const main = page.getByRole('main');
  let presses = -1;
  for (let press = 1; press <= 60; press += 1) {
    await page.keyboard.press('Shift+Tab');
    if (
      await page.evaluate(
        () => document.activeElement?.getAttribute('role') === 'main',
      )
    ) {
      presses = press;
      break;
    }
  }
  expect(presses).toBeGreaterThan(0);
  expect(
    await main.evaluate(element => getComputedStyle(element).outlineStyle),
  ).toBe('solid');
});

test('a Tab-focused main keeps its ring when its content shrinks to fit', async ({
  page,
}) => {
  await openStory(page, 'long-content');
  const main = page.getByRole('main');
  const presses = await tabUntil(
    page,
    () => document.activeElement?.getAttribute('role') === 'main',
  );
  expect(presses).toBeGreaterThan(0);
  expect(
    await main.evaluate(element => getComputedStyle(element).outlineStyle),
  ).toBe('solid');

  await main.evaluate(element => {
    for (const child of element.children) {
      (child as HTMLElement).style.display = 'none';
    }
  });
  await expect(main).toHaveAttribute('tabindex', '-1');
  expect(
    await page.evaluate(() => document.activeElement?.getAttribute('role')),
  ).toBe('main');
  expect(
    await main.evaluate(element => getComputedStyle(element).outlineStyle),
  ).toBe('solid');
});

test('keyboard focus entering from the embedding page draws the ring on main', async ({
  page,
}) => {
  // Shift+Tab from a control after the frame: the key goes to the embedding
  // page, so main's document sees focus arrive with no Tab keydown of its own.
  await page.setContent(
    `<iframe title="App" style="width: 1280px; height: 720px; border: 0" src="${storybook.origin}/iframe.html?id=core-appshell--long-content&viewMode=story"></iframe><button>After the frame</button>`,
  );
  const frame = page.frameLocator('iframe');
  const main = frame.getByRole('main');
  await expect(main).toBeVisible();
  await expect(main).toHaveAttribute('tabindex', '0');

  await page.getByRole('button', {name: 'After the frame'}).focus();
  await page.keyboard.press('Shift+Tab');

  await expect
    .poll(async () =>
      main.evaluate(element => element.ownerDocument.activeElement === element),
    )
    .toBe(true);
  expect(
    await main.evaluate(element => getComputedStyle(element).outlineStyle),
  ).toBe('solid');
});

test("a script's focus on main after the embedding page focuses the frame draws no ring", async ({
  page,
}) => {
  // The window gains focus with nothing focused in it; a later focus() is
  // programmatic (FR4), not the focus move that entered the document.
  await page.setContent(
    `<button>Before the frame</button><iframe title="App" style="width: 1280px; height: 720px; border: 0" src="${storybook.origin}/iframe.html?id=core-appshell--long-content&viewMode=story"></iframe>`,
  );
  const main = page.frameLocator('iframe').getByRole('main');
  await expect(main).toHaveAttribute('tabindex', '0');
  await page.getByRole('button', {name: 'Before the frame'}).focus();
  await page.evaluate(() => {
    document.querySelector('iframe')?.contentWindow?.focus();
  });
  await page.waitForTimeout(50);

  await main.evaluate(element => (element as HTMLElement).focus());

  await expect
    .poll(async () =>
      main.evaluate(element => element.ownerDocument.activeElement === element),
    )
    .toBe(true);
  expect(
    await main.evaluate(element => getComputedStyle(element).outlineStyle),
  ).not.toBe('solid');
});

test("a script's focus on main inside a Tab keydown handler draws no ring", async ({
  page,
}) => {
  await openStory(page, 'long-content');
  const main = page.getByRole('main');
  await expect(main).toHaveAttribute('tabindex', '0');
  // A page's own Tab handler moves focus itself: programmatic focus (FR4),
  // even though a Tab key is down.
  await page.evaluate(() => {
    document.addEventListener('keydown', event => {
      if (event.key === 'Tab') {
        event.preventDefault();
        document.querySelector<HTMLElement>('[role="main"]')?.focus();
      }
    });
  });

  await page.keyboard.press('Tab');

  await expect
    .poll(async () =>
      page.evaluate(() => document.activeElement?.getAttribute('role')),
    )
    .toBe('main');
  expect(
    await main.evaluate(element => getComputedStyle(element).outlineStyle),
  ).not.toBe('solid');
});

test("a script's focus on main inside the frame window's own focus handler draws no ring", async ({
  page,
}) => {
  await page.setContent(
    `<button>Before the frame</button><iframe title="App" style="width: 1280px; height: 720px; border: 0" src="${storybook.origin}/iframe.html?id=core-appshell--long-content&viewMode=story"></iframe>`,
  );
  const main = page.frameLocator('iframe').getByRole('main');
  await expect(main).toHaveAttribute('tabindex', '0');
  const frame = page.frame({url: /iframe\.html/});
  expect(frame).not.toBeNull();
  await frame?.evaluate(() => {
    window.addEventListener('focus', () => {
      document.querySelector<HTMLElement>('[role="main"]')?.focus();
    });
  });
  await page.getByRole('button', {name: 'Before the frame'}).focus();

  await page.evaluate(() => {
    document.querySelector('iframe')?.contentWindow?.focus();
  });

  await expect
    .poll(async () =>
      main.evaluate(element => element.ownerDocument.activeElement === element),
    )
    .toBe(true);
  expect(
    await main.evaluate(element => getComputedStyle(element).outlineStyle),
  ).not.toBe('solid');
});

test('pointer focus entering from the embedding page draws no ring on main', async ({
  page,
}) => {
  await page.setContent(
    `<button>Before the frame</button><iframe title="App" style="width: 1280px; height: 720px; border: 0" src="${storybook.origin}/iframe.html?id=core-appshell--long-content&viewMode=story"></iframe>`,
  );
  const main = page.frameLocator('iframe').getByRole('main');
  await expect(main).toHaveAttribute('tabindex', '0');
  await page.getByRole('button', {name: 'Before the frame'}).focus();

  await main.click({position: {x: 40, y: 40}});

  await expect
    .poll(async () =>
      main.evaluate(element => element.ownerDocument.activeElement === element),
    )
    .toBe(true);
  expect(
    await main.evaluate(element => getComputedStyle(element).outlineStyle),
  ).not.toBe('solid');
});

test('a Tab-focused main keeps its ring after a window or tab switch', async ({
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'a real window switch needs full Chromium (launched below)',
  );
  // The headless shell never takes focus away from a page; full Chromium in
  // its headless mode does once focus emulation is off, firing what a real
  // switch fires: blur and focusout on main while main stays the active
  // element, then focus and focusin on return.
  const browser = await chromium.launch({channel: 'chromium'});
  try {
    const context = await browser.newContext({
      viewport: {width: 1280, height: 720},
    });
    const page = await context.newPage();
    await openStory(page, 'long-content');
    const main = page.getByRole('main');
    const presses = await tabUntil(
      page,
      () => document.activeElement?.getAttribute('role') === 'main',
    );
    expect(presses).toBeGreaterThan(0);
    expect(
      await main.evaluate(element => getComputedStyle(element).outlineStyle),
    ).toBe('solid');

    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setFocusEmulationEnabled', {enabled: false});
    const other = await context.newPage();
    await other.bringToFront();
    await expect
      .poll(async () => page.evaluate(() => document.hasFocus()))
      .toBe(false);
    await page.bringToFront();
    await expect
      .poll(async () => page.evaluate(() => document.hasFocus()))
      .toBe(true);

    expect(
      await page.evaluate(() => document.activeElement?.getAttribute('role')),
    ).toBe('main');
    expect(
      await main.evaluate(element => getComputedStyle(element).outlineStyle),
    ).toBe('solid');

    // A real focus move still ends the ring.
    await page.keyboard.press('Shift+Tab');
    expect(
      await main.evaluate(element => getComputedStyle(element).outlineStyle),
    ).not.toBe('solid');
  } finally {
    await browser.close();
  }
});

test('an overflowing main rounds its corner only while its ring shows', async ({
  page,
}) => {
  await openStory(page, 'long-content');
  const main = page.getByRole('main');
  await expect(main).toHaveAttribute('tabindex', '0');
  expect(
    await main.evaluate(
      element => getComputedStyle(element).borderTopLeftRadius,
    ),
  ).toBe('0px');
});

test('a main region that fits stays out of the tab order and keeps its square corner', async ({
  page,
}) => {
  await openStory(page, 'playground');
  const main = page.getByRole('main');
  await expect(main).toHaveAttribute('tabindex', '-1');
  // The rounded corner only shapes the ring of a main that is a stop.
  expect(
    await main.evaluate(
      element => getComputedStyle(element).borderTopLeftRadius,
    ),
  ).toBe('0px');

  const presses = await tabUntil(
    page,
    () => document.activeElement?.getAttribute('role') === 'main',
    40,
  );
  expect(presses).toBe(-1);
});
