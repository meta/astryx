// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PopoverTabBehavior.interaction.browser.spec.ts
 * @input The built Popover Tab Behavior stories, real keyboard and pointer
 *   input and the interaction harness
 * @output Proofs that a `'pageOrder'` popover follows the page's Tab order
 *   after its trigger (a wrapper trigger, a separate anchor, and a trigger
 *   with a tooltip, a cut label or the keyboard hint included),
 *   takes Escape only while focus is inside it or on its
 *   trigger, closes for a press outside it and stays open when another
 *   popover opens from the keyboard; and that a popover with
 *   `isModal: false` still holds Tab and closes on Escape from anywhere
 * @position Browser proofs for Popover/usePopover.tsx's `tabBehavior`; jsdom
 *   has no popover invoker order and no close watcher
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {openStory, withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

function controls(page: Page) {
  return {
    trigger: page.getByRole('button', {name: 'Show tip'}),
    gotIt: page.getByRole('button', {name: 'Got it'}),
    learnMore: page.getByRole('button', {name: 'Learn more'}),
    after: page.getByRole('button', {name: 'After'}),
    before: page.getByRole('button', {name: 'Before'}),
  };
}

test('Tab moves from the trigger into a pageOrder popover and on to the control after the trigger', async ({
  page,
}) => {
  await openStory(page, storybook(), 'core-popover-tab-behavior--page-order');
  const {trigger, gotIt, learnMore, after} = controls(page);
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(gotIt).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(learnMore).toBeFocused();
  // The fallback close control ends the popover's own Tab stops.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', {name: 'Close popover'})).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(after).toBeFocused();
  // Leaving focus does not close it.
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');

  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(learnMore).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(trigger).toBeFocused();

  // Tab from the trigger enters the open popover: its controls follow it.
  await page.keyboard.press('Tab');
  await expect(gotIt).toBeFocused();
});

test('Tab from a button inside a wrapper trigger enters its pageOrder popover', async ({
  page,
}) => {
  await openStory(
    page,
    storybook(),
    'core-popover-tab-behavior--wrapped-trigger',
  );
  const {trigger, gotIt, after} = controls(page);
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(gotIt).toBeFocused();

  await page.keyboard.press('Shift+Tab');
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(gotIt).toBeFocused();

  // Past the tip's other control and its close control comes the page.
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(after).toBeFocused();
});

test('a pageOrder popover with an anchor of its own follows its trigger, not the anchor', async ({
  page,
}) => {
  await openStory(
    page,
    storybook(),
    'core-popover-tab-behavior--separate-anchor',
  );
  const {trigger, gotIt} = controls(page);
  const target = page.getByRole('button', {name: 'Target'});
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(gotIt).toBeFocused();

  // From the anchor, Tab reaches the trigger, and only then the tip.
  await target.focus();
  await page.keyboard.press('Tab');
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(gotIt).toBeFocused();
});

test('a tooltip on the trigger does not take a pageOrder popover out of the Tab order', async ({
  page,
}) => {
  await openStory(
    page,
    storybook(),
    'core-popover-tab-behavior--tooltip-trigger',
  );
  const {trigger, gotIt, learnMore, before} = controls(page);
  const tooltip = page.getByRole('tooltip').filter({hasText: 'Opens the tip'});
  // Keyboard focus shows the trigger's tooltip before the tip opens.
  await trigger.focus();
  await expect(tooltip).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(gotIt).toBeFocused();
  // The tooltip hides a moment after focus leaves the trigger. The tip keeps
  // its place after the trigger through that hide and the next show.
  await expect(tooltip).toBeHidden();

  await page.keyboard.press('Shift+Tab');
  await expect(trigger).toBeFocused();
  await expect(tooltip).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(gotIt).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(learnMore).toBeFocused();

  // A trip round the page comes back into the tip from its trigger.
  await before.focus();
  await expect(tooltip).toBeHidden();
  await page.keyboard.press('Tab');
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(gotIt).toBeFocused();
});

test('a cut label on the trigger does not take a pageOrder popover out of the Tab order', async ({
  page,
}) => {
  await openStory(
    page,
    storybook(),
    'core-popover-tab-behavior--cut-label-trigger',
  );
  const {trigger, gotIt} = controls(page);
  const tooltip = page.getByRole('tooltip').filter({hasText: 'Show tip'});
  // The row cuts the label, so keyboard focus shows it in a tooltip.
  await trigger.focus();
  await expect(tooltip).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(gotIt).toBeFocused();
  await expect(tooltip).toBeHidden();

  await page.keyboard.press('Shift+Tab');
  await expect(trigger).toBeFocused();
  await expect(tooltip).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(gotIt).toBeFocused();
});

test('the keyboard hint on a toolbar trigger does not take a pageOrder popover out of the Tab order', async ({
  page,
}) => {
  await openStory(
    page,
    storybook(),
    'core-popover-tab-behavior--toolbar-trigger',
  );
  const {trigger, gotIt, before} = controls(page);
  const hint = page.locator('[popover]').filter({hasText: 'to navigate'});
  await before.focus();
  // Keyboard focus into the toolbar shows its hint from the focused item.
  await page.keyboard.press('Tab');
  await expect(trigger).toBeFocused();
  await expect(hint).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(gotIt).toBeFocused();
  // Focus left the toolbar, so the hint hides.
  await expect(hint).toBeHidden();

  await page.keyboard.press('Shift+Tab');
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(gotIt).toBeFocused();
});

test('Escape passes a pageOrder popover while focus is elsewhere, and closes it from its trigger', async ({
  page,
}) => {
  await openStory(page, storybook(), 'core-popover-tab-behavior--page-order');
  const {trigger, after} = controls(page);
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');

  await after.focus();
  await page.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');

  await trigger.focus();
  await page.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

test('a press outside closes a pageOrder popover; a press inside it or on its trigger is not one', async ({
  page,
}) => {
  await openStory(page, storybook(), 'core-popover-tab-behavior--page-order');
  const {trigger, learnMore, after} = controls(page);
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');

  await learnMore.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');

  // The pressed control still takes the press.
  await after.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(after).toBeFocused();

  // A press on the trigger closes the open popover once. A watch that also
  // closed it would let the trigger's toggle open it again.
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

test('a pageOrder popover stays open when another popover opens from the keyboard', async ({
  page,
}) => {
  await openStory(page, storybook(), 'core-popover-tab-behavior--page-order');
  const {trigger} = controls(page);
  const more = page.getByRole('button', {name: 'More', exact: true});
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');

  await more.focus();
  await page.keyboard.press('Enter');
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
});

test('a popover with isModal false holds Tab, carries no aria-modal and closes on Escape from anywhere', async ({
  page,
}) => {
  await openStory(page, storybook(), 'core-popover-tab-behavior--not-modal');
  const {trigger, gotIt, learnMore, after} = controls(page);
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(gotIt).toBeFocused();
  await expect(page.getByRole('dialog', {name: 'Tip'})).not.toHaveAttribute(
    'aria-modal',
  );

  await page.keyboard.press('Tab');
  await expect(learnMore).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', {name: 'Close popover'})).toBeFocused();
  // Tab wraps to the popover's first control: it does not reach the page.
  await page.keyboard.press('Tab');
  await expect(gotIt).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', {name: 'Close popover'})).toBeFocused();

  // The page is not inert, and Escape closes the popover wherever focus is.
  await after.focus();
  await expect(after).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
});
