// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ButtonHitArea.interaction.browser.spec.ts
 * @input The built "Touch targets" Button story and real touch input on a
 *   phone-sized touch context
 * @output Browser proofs that a Button's touch target grows toward 44 px
 *   through an invisible band, stops halfway to a neighbor, never takes a
 *   neighbor's tap, and changes no box (spec:AST-094 FR42)
 * @position Browser layer of Button's hit band; the band itself is
 *   internal/touchHitArea.stylex.ts
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  openStory,
  tap,
  touchDriver,
  withStorybook,
  type TouchDriver,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);
const STORY = 'core-button--touch-targets';
// The clear button's name is the field's label in the default locale.
const CLEAR = /^Clear/;

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

async function tapAt(
  driver: TouchDriver,
  at: {x: number; y: number},
): Promise<void> {
  if (driver.engine === 'webkit') {
    await driver.tap(at);
  } else {
    await driver.play(tap(at, {holdMs: 50}));
  }
}

function buttonNamed(page: Page, name: string | RegExp) {
  return page
    .locator('#storybook-root')
    .getByRole('button', {name, exact: true});
}

/** Waits until utils/hitArea has written the insets of every named button. */
async function waitForHitArea(
  page: Page,
  names: (string | RegExp)[],
): Promise<void> {
  for (const name of names) {
    await expect
      .poll(async () =>
        buttonNamed(page, name).evaluate(button =>
          (button as HTMLElement).style.getPropertyValue(
            '--astryx-hit-inset-top',
          ),
        ),
      )
      .not.toBe('');
  }
}

async function measure(page: Page, name: string | RegExp) {
  return buttonNamed(page, name).evaluate(element => {
    const button = element as HTMLElement;
    const r = button.getBoundingClientRect();
    const inset = (side: string) =>
      Number.parseFloat(
        button.style.getPropertyValue(`--astryx-hit-inset-${side}`) || '0',
      );
    return {
      box: {left: r.left, top: r.top, right: r.right, bottom: r.bottom},
      insets: {
        top: inset('top'),
        right: inset('right'),
        bottom: inset('bottom'),
        left: inset('left'),
      },
    };
  });
}

const middleY = (box: Box) => (box.top + box.bottom) / 2;

test.describe('Button touch target (spec:AST-094 FR42), under a finger', () => {
  test('a toolbar button’s band grows toward 44 px, stops at half the gap, and grows no box', async ({
    page,
  }) => {
    await openStory(page, storybook(), STORY);
    await waitForHitArea(page, ['Bold', 'Italic', 'Underline']);
    const bold = await measure(page, 'Bold');
    const italic = await measure(page, 'Italic');
    const height = italic.box.bottom - italic.box.top;
    expect(height).toBeLessThan(44);
    const gap = italic.box.left - bold.box.right;
    expect(italic.insets.left).toBeLessThanOrEqual(gap / 2 + 0.5);
    expect(bold.insets.right).toBeLessThanOrEqual(gap / 2 + 0.5);
    expect(italic.insets.top).toBeGreaterThan(0);
  });

  test('a tap in the gap goes to the nearer button, never its neighbor', async ({
    page,
  }) => {
    await openStory(page, storybook(), STORY);
    await waitForHitArea(page, ['Bold', 'Italic', 'Underline']);
    const driver = await touchDriver(page);
    const bold = await measure(page, 'Bold');
    const italic = await measure(page, 'Italic');
    const taps = page.locator('#storybook-root output[aria-label="Taps"]');
    const y = middleY(italic.box);
    await tapAt(driver, {x: italic.box.left - 0.75, y});
    await expect(taps).toHaveText('Bold 0, Italic 1, Underline 0');
    await tapAt(driver, {x: bold.box.right + 0.75, y});
    await expect(taps).toHaveText('Bold 1, Italic 1, Underline 0');
    await tapAt(driver, {
      x: (italic.box.left + italic.box.right) / 2,
      y: italic.box.top - italic.insets.top + 1,
    });
    await expect(taps).toHaveText('Bold 1, Italic 2, Underline 0');
  });

  test('a tap nearer an offset neighbour never presses the farther button', async ({
    page,
  }) => {
    await openStory(page, storybook(), STORY);
    await waitForHitArea(page, ['Undo', 'Redo']);
    const driver = await touchDriver(page);
    const undo = await measure(page, 'Undo');
    const redo = await measure(page, 'Redo');
    const taps = page.locator(
      '#storybook-root output[aria-label="Offset taps"]',
    );
    // Redo sits past Undo's corner on both axes. This point is in Undo's
    // band but nearer Redo's box. It is a whole pixel because the WebKit
    // driver rounds a tap to one.
    const at = {
      x: Math.ceil(undo.box.right) + 1,
      y: Math.floor(redo.box.top) + 3,
    };
    expect(at.x).toBeLessThanOrEqual(undo.box.right + undo.insets.right);
    expect(at.y).toBeLessThanOrEqual(undo.box.bottom + undo.insets.bottom);
    expect(redo.box.left - at.x).toBeLessThan(at.y - undo.box.bottom);
    await tapAt(driver, at);
    await expect(taps).toContainText('Undo 0');
  });

  test('the clear button’s band stops short of the field’s text', async ({
    page,
  }) => {
    await openStory(page, storybook(), STORY);
    await waitForHitArea(page, [CLEAR]);
    const driver = await touchDriver(page);
    const clear = await measure(page, CLEAR);
    const input = page.locator('#storybook-root input');
    const inputBox = await input.evaluate(element => {
      const r = element.getBoundingClientRect();
      return {left: r.left, top: r.top, right: r.right, bottom: r.bottom};
    });
    // The band never reaches into the text box: at most half the gap.
    expect(clear.insets.left).toBeLessThanOrEqual(
      Math.max(0, (clear.box.left - inputBox.right) / 2) + 0.5,
    );
    // A tap in the text, beside the gap, places the caret and clears nothing.
    await tapAt(driver, {x: inputBox.right - 2, y: middleY(clear.box)});
    await expect(input).toHaveValue('quarterly report');
    await expect(input).toBeFocused();
  });

  test('a tap on the band just past the clear button’s edge clears', async ({
    page,
  }) => {
    await openStory(page, storybook(), STORY);
    await waitForHitArea(page, [CLEAR]);
    const driver = await touchDriver(page);
    const clear = await measure(page, CLEAR);
    expect(clear.insets.bottom).toBeGreaterThan(1);
    await tapAt(driver, {
      x: (clear.box.left + clear.box.right) / 2,
      y: clear.box.bottom + clear.insets.bottom - 1,
    });
    await expect(page.locator('#storybook-root input')).toHaveValue('');
  });

  test('a tap on a clearable selector’s chevron opens it and keeps the value', async ({
    page,
  }) => {
    await openStory(page, storybook(), 'core-selector--clearable');
    await waitForHitArea(page, [CLEAR]);
    const driver = await touchDriver(page);
    const clear = await measure(page, CLEAR);
    // The chevron is the next part of the field that has a box.
    const chevron = await buttonNamed(page, CLEAR).evaluate(button => {
      let part = button.nextElementSibling;
      while (part != null && part.getBoundingClientRect().width === 0) {
        part = part.nextElementSibling;
      }
      if (part == null) {
        return null;
      }
      const r = part.getBoundingClientRect();
      return {
        x: (r.left + r.right) / 2,
        y: (r.top + r.bottom) / 2,
        gap: r.left - button.getBoundingClientRect().right,
      };
    });
    expect(chevron).not.toBeNull();
    // The band stops at half the gap to the chevron, and within 2 px of the
    // clear button: WebKit moves a tap toward a clickable element near it.
    expect(clear.insets.right).toBeLessThanOrEqual(chevron!.gap / 2 + 0.5);
    expect(clear.insets.right).toBeLessThanOrEqual(2.5);
    await tapAt(driver, {x: Math.round(chevron!.x), y: Math.round(chevron!.y)});
    await expect(
      page.locator('#storybook-root').getByRole('combobox'),
    ).toHaveAttribute('aria-expanded', 'true');
    await expect(buttonNamed(page, CLEAR)).toBeVisible();
  });
});
