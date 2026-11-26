// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y always

/**
 * @file FocusReturnReveal.a11y.browser.spec.ts
 * @input The `Core/Dialog`, `Core/BottomSheet` and `Core/DropdownMenu`
 *   stories in a built Storybook, placed in a tall page that the test
 *   scrolls.
 * @output Real-engine proof of the focus return's reveal: a Tab-stop opener
 *   that the page scrolled wholly or partly out of view is scrolled just into
 *   view at its nearest edge when the surface closes by Escape, by a control
 *   inside it, or by a press outside it; a Tab-stop opener taller than the
 *   viewport is not scrolled, and neither is a box with `overflow: hidden`
 *   that clips the opener.
 * @position Chromium and WebKit. A return target that is not a Tab stop (a
 *   `tabindex="-1"` region) is covered by DialogCloseScroll and
 *   BottomSheetCloseScroll, which require that the page does not move.
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
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

interface Member {
  name: string;
  story: string;
  opener: (page: Page) => Locator;
  surface: (page: Page) => Locator;
  /** Closes the surface with a control inside it. */
  closeInside: (page: Page) => Promise<void>;
}

const MEMBERS: Member[] = [
  {
    name: 'Dialog',
    story: 'core-dialog--default',
    opener: page => page.getByRole('button', {name: 'Open Modal', exact: true}),
    surface: page => page.getByRole('dialog'),
    closeInside: async page => {
      await page
        .getByRole('dialog')
        .getByRole('button', {name: 'Cancel', exact: true})
        .click();
    },
  },
  {
    name: 'BottomSheet',
    story: 'core-bottomsheet--showcase',
    opener: page => page.getByRole('button', {name: 'Open sheet', exact: true}),
    surface: page => page.getByRole('dialog', {name: 'Filters'}),
    closeInside: async page => {
      await page
        .getByRole('dialog', {name: 'Filters'})
        .getByRole('button', {name: 'Apply', exact: true})
        .click();
    },
  },
  {
    name: 'DropdownMenu',
    story: 'core-dropdownmenu--default',
    opener: page => page.getByRole('button', {name: /Actions|File/}),
    surface: page => page.getByRole('menu').first(),
    closeInside: async page => {
      await page.keyboard.press('Enter');
    },
  },
];

const TAIL = 3000;

/** Mounts the story below a tall header and above a long tail. */
async function mountTall(page: Page, member: Member, headerHeight: number) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=${member.story}&viewMode=story`,
  );
  await expect(member.opener(page)).toBeVisible();
  await page.evaluate(
    ({header, tail}) => {
      const root = document.getElementById('storybook-root');
      if (root?.parentNode == null) {
        throw new Error('no story root');
      }
      const spacer = (height: number) => {
        const node = document.createElement('div');
        node.style.height = `${height}px`;
        return node;
      };
      root.parentNode.insertBefore(spacer(header), root);
      root.after(spacer(tail));
    },
    {header: headerHeight, tail: TAIL},
  );
}

/**
 * Focuses the opener, then scrolls the page down until the opener's top edge
 * sits `above` pixels above the viewport's top edge, as a person who scrolls
 * away with the wheel leaves focus behind.
 */
async function scrollOpenerAbove(page: Page, opener: Locator, above: number) {
  await opener.evaluate(node => (node as HTMLElement).focus());
  await opener.evaluate((node, offset) => {
    const top = node.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, top + offset);
  }, above);
  await expect
    .poll(async () => opener.evaluate(node => node.getBoundingClientRect().top))
    .toBeLessThan(0);
}

async function openFromKeyboard(page: Page, member: Member): Promise<void> {
  await page.keyboard.press('Enter');
  const surface = member.surface(page);
  await expect(surface).toBeVisible();
  await expect
    .poll(async () =>
      surface.evaluate(node => node.getAnimations({subtree: true}).length),
    )
    .toBe(0);
}

/**
 * The opener holds focus and is wholly in view. With `atNearestEdge`, it is
 * at the viewport's top edge, the nearest edge for an opener scrolled above.
 */
async function expectRevealed(
  page: Page,
  member: Member,
  {atNearestEdge}: {atNearestEdge: boolean},
): Promise<void> {
  const opener = member.opener(page);
  await expect(opener).toBeFocused();
  // A reveal scroll lands a rendering update after the focus move.
  if (atNearestEdge) {
    await expect
      .poll(async () =>
        opener.evaluate(node => Math.round(node.getBoundingClientRect().top)),
      )
      .toBe(0);
  } else {
    await expect
      .poll(async () =>
        opener.evaluate(node => node.getBoundingClientRect().top),
      )
      .toBeGreaterThanOrEqual(0);
  }
  const bottom = await opener.evaluate(
    node => node.getBoundingClientRect().bottom,
  );
  expect(bottom).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerHeight),
  );
}

/**
 * A keyboard open focuses the menu's first row with a plain focus. WebKit and
 * Chromium 155 then scroll the page to centre the menu, which brings the
 * opener into view before the close. The close then has nothing to reveal,
 * and the opener is not at its nearest edge. Older Chromium builds do not
 * scroll at the open.
 */
function browserCentres(member: Member): boolean {
  return member.name === 'DropdownMenu';
}

for (const member of MEMBERS) {
  test.describe(`${member.name} focus return`, () => {
    test('an Escape close shows an opener the page scrolled out of view', async ({
      page,
    }) => {
      await mountTall(page, member, 400);
      await scrollOpenerAbove(page, member.opener(page), 600);
      await openFromKeyboard(page, member);
      await page.keyboard.press('Escape');
      await expect(member.surface(page)).toBeHidden();
      await expectRevealed(page, member, {
        atNearestEdge: !browserCentres(member),
      });
    });

    test('a close from a control inside shows an opener the page scrolled partly out of view', async ({
      page,
    }) => {
      await mountTall(page, member, 400);
      const opener = member.opener(page);
      const height = await opener.evaluate(
        node => node.getBoundingClientRect().height,
      );
      await scrollOpenerAbove(page, opener, Math.ceil(height / 2));
      await openFromKeyboard(page, member);
      await member.closeInside(page);
      await expect(member.surface(page)).toBeHidden();
      await expectRevealed(page, member, {atNearestEdge: true});
    });

    test('a press outside shows an opener the page scrolled out of view', async ({
      page,
    }) => {
      await mountTall(page, member, 400);
      await scrollOpenerAbove(page, member.opener(page), 600);
      await openFromKeyboard(page, member);
      const box = await member.surface(page).boundingBox();
      const viewport = page.viewportSize();
      if (box == null || viewport == null) {
        throw new Error('no surface box');
      }
      // A point outside the surface: below it, or above it near the top.
      const y =
        box.y + box.height + 10 < viewport.height
          ? box.y + box.height + 10
          : 10;
      await page.mouse.click(10, y);
      await expect(member.surface(page)).toBeHidden();
      await expectRevealed(page, member, {
        atNearestEdge: !browserCentres(member),
      });
    });
  });
}

test('a Tab-stop return target taller than the viewport is not scrolled', async ({
  page,
}) => {
  const member = MEMBERS[0];
  await page.goto(
    `${storybook.origin}/iframe.html?id=${member.story}&viewMode=story`,
  );
  const opener = member.opener(page);
  await expect(opener).toBeVisible();
  const scrollY = await page.evaluate(() => {
    const root = document.getElementById('storybook-root');
    if (root?.parentNode == null) {
      throw new Error('no story root');
    }
    const spacer = (height: number) => {
      const node = document.createElement('div');
      node.style.height = `${height}px`;
      return node;
    };
    // A Tab stop taller than the screen, such as a scrollable table viewport.
    const region = document.createElement('div');
    region.tabIndex = 0;
    root.parentNode.insertBefore(spacer(300), root);
    root.parentNode.insertBefore(region, root);
    region.append(spacer(200), root, spacer(window.innerHeight * 3));
    region.after(spacer(2000));
    window.scrollTo(0, 900);
    region.focus({preventScroll: true});
    return window.scrollY;
  });
  // A programmatic click moves no focus, so the region is the recorded
  // opener.
  await opener.evaluate(node => (node as HTMLElement).click());
  await expect(member.surface(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(member.surface(page)).toBeHidden();
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
});

test('an opener that a box with overflow hidden clips is not scrolled into that box', async ({
  page,
}) => {
  const member = MEMBERS[0];
  await page.goto(
    `${storybook.origin}/iframe.html?id=${member.story}&viewMode=story`,
  );
  const opener = member.opener(page);
  await expect(opener).toBeVisible();
  await page.evaluate(() => {
    const root = document.getElementById('storybook-root');
    if (root?.parentNode == null) {
      throw new Error('no story root');
    }
    const spacer = (height: number) => {
      const node = document.createElement('div');
      node.style.height = `${height}px`;
      return node;
    };
    // A clipped track, as a carousel or a truncation wrapper uses: a person
    // cannot scroll it, and the opener sits below its visible part.
    const track = document.createElement('div');
    track.id = 'clipped-track';
    track.style.overflow = 'hidden';
    track.style.height = '200px';
    root.parentNode.insertBefore(track, root);
    track.append(spacer(400), root, spacer(600));
  });
  const track = page.locator('#clipped-track');
  await opener.evaluate(node =>
    (node as HTMLElement).focus({preventScroll: true}),
  );
  await openFromKeyboard(page, member);
  await page.keyboard.press('Escape');
  await expect(member.surface(page)).toBeHidden();
  await expect(opener).toBeFocused();
  await page.waitForTimeout(250);
  expect(await track.evaluate(node => node.scrollTop)).toBe(0);
});

test('an opener inside a scroller that a box with overflow hidden frames is shown by that scroller', async ({
  page,
}) => {
  const member = MEMBERS[0];
  await page.goto(
    `${storybook.origin}/iframe.html?id=${member.story}&viewMode=story`,
  );
  const opener = member.opener(page);
  await expect(opener).toBeVisible();
  await page.evaluate(() => {
    const root = document.getElementById('storybook-root');
    if (root?.parentNode == null) {
      throw new Error('no story root');
    }
    const spacer = (height: number) => {
      const node = document.createElement('div');
      node.style.height = `${height}px`;
      return node;
    };
    // A clipped frame around a scrolling body, as a dialog or a sheet lays
    // out its content.
    const frame = document.createElement('div');
    frame.id = 'clipped-frame';
    frame.style.overflow = 'hidden';
    frame.style.height = '300px';
    const body = document.createElement('div');
    body.id = 'scrolling-body';
    body.style.overflow = 'auto';
    body.style.height = '300px';
    root.parentNode.insertBefore(frame, root);
    frame.append(body);
    body.append(spacer(400), root, spacer(1200));
    body.scrollTop = 900;
  });
  const frame = page.locator('#clipped-frame');
  const body = page.locator('#scrolling-body');
  await opener.evaluate(node =>
    (node as HTMLElement).focus({preventScroll: true}),
  );
  await openFromKeyboard(page, member);
  await page.keyboard.press('Escape');
  await expect(member.surface(page)).toBeHidden();
  await expect(opener).toBeFocused();
  // The body scrolls the opener just into its view, at its top edge.
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const node = document.querySelector<HTMLElement>(
          '#scrolling-body button',
        );
        const area = document.getElementById('scrolling-body');
        if (node == null || area == null) {
          return null;
        }
        return Math.round(
          node.getBoundingClientRect().top - area.getBoundingClientRect().top,
        );
      }),
    )
    .toBe(0);
  expect(await body.evaluate(node => node.scrollTop)).toBeLessThan(900);
  expect(await frame.evaluate(node => node.scrollTop)).toBe(0);
});

for (const [kind, markup] of [
  ['a contenteditable region', '<div contenteditable="true">Notes</div>'],
  ['a video with controls', '<video controls width="160" height="90"></video>'],
] as const) {
  test(`a Dialog close shows ${kind} the page scrolled out of view`, async ({
    page,
  }) => {
    const member = MEMBERS[0];
    await page.goto(
      `${storybook.origin}/iframe.html?id=${member.story}&viewMode=story`,
    );
    await expect(member.opener(page)).toBeVisible();
    // Tab reaches this element, though its tabIndex property is -1 where it
    // has no tabindex attribute. It is the return target when it holds focus
    // as the Dialog opens.
    await page.evaluate(html => {
      const root = document.getElementById('storybook-root');
      if (root?.parentNode == null) {
        throw new Error('no story root');
      }
      const spacer = (height: number) => {
        const node = document.createElement('div');
        node.style.height = `${height}px`;
        return node;
      };
      const holder = document.createElement('div');
      holder.id = 'return-target';
      holder.innerHTML = html;
      root.parentNode.insertBefore(spacer(400), root);
      root.parentNode.insertBefore(holder, root);
      root.after(spacer(3000));
    }, markup);
    const target = page.locator('#return-target > *');
    await target.evaluate(node => (node as HTMLElement).focus());
    await expect(target).toBeFocused();
    await target.evaluate(node => {
      const top = node.getBoundingClientRect().top + window.scrollY;
      window.scrollTo(0, top + 600);
    });
    // A programmatic click moves no focus, so the element stays the recorded
    // return target.
    await member.opener(page).evaluate(node => (node as HTMLElement).click());
    await expect(member.surface(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(member.surface(page)).toBeHidden();
    await expect(target).toBeFocused();
    await expect
      .poll(async () =>
        target.evaluate(node => Math.round(node.getBoundingClientRect().top)),
      )
      .toBe(0);
  });
}
