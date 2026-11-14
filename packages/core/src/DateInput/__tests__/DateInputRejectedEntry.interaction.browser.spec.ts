// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DateInputRejectedEntry.interaction.browser.spec.ts
 * @input Storybook stories core-dateinput--default, core-dateinput--with-min-max,
 *   core-datetimeinput--default, and core-datetimeinput--with-min-max
 * @output In a real browser: a native date control's partial years show no
 *   rejection while the year is typed, Enter shows the rejection, and blur
 *   restores the committed date and keeps the message; on the typed
 *   surfaces, text that is not a date shows nothing while typed, and Enter or
 *   blur keeps it with its message; under entryErrorBehavior="blur-or-enter",
 *   a date the calendar does not have shows nothing until Enter or blur.
 * @position DateInput and DateTimeInput rejected-entry evidence; jsdom has no
 *   native date control and no real focus order.
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {openStory, withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

// A fine pointer on a desktop-sized page, where the date control takes keys.
test.use({
  isMobile: false,
  hasTouch: false,
  viewport: {width: 1024, height: 768},
});

const INVALID = 'Invalid date';
const NONEXISTENT = 'Enter a real date';

/** Blurs the field with a press on empty page space, as a person does. */
async function pressOutside(page: Page) {
  await page.mouse.click(1000, 740);
}

/** The text of every element that describes the control. */
async function describedText(control: Locator): Promise<string> {
  return control.evaluate(element =>
    (element.getAttribute('aria-describedby') ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .map(id => element.ownerDocument.getElementById(id)?.textContent ?? '')
      .join(' '),
  );
}

/**
 * Types each key into the focused control and asserts that no rejection shows
 * after it. Returns the values the control reported, for the evidence log.
 */
async function typeWithoutRejection(
  page: Page,
  control: Locator,
  keys: string,
  message: string,
): Promise<string[]> {
  const values: string[] = [];
  for (const key of keys) {
    await page.keyboard.press(key);
    values.push(await control.inputValue());
    await expect(control).not.toHaveAttribute('aria-invalid', 'true');
    expect(await describedText(control)).not.toContain(message);
  }
  return values;
}

for (const {name, story, message, committed} of [
  {
    name: 'DateInput',
    story: 'core-dateinput--with-min-max',
    message: 'Enter a date from January 15, 2026 to February 15, 2026',
    committed: ['02012026', '2026-02-01'],
  },
  {
    name: 'DateTimeInput date segment',
    story: 'core-datetimeinput--with-min-max',
    message: 'Enter a date from March 15, 2026 to March 15, 2026',
    committed: ['03152026', '2026-03-15'],
  },
] as const) {
  test(`${name}: a native date shows its rejection at Enter and keeps it after blur restores the committed date`, async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName === 'webkit',
      "Playwright's Linux WebKit date control takes no typed digits, so it reports no partial year.",
    );
    await openStory(page, storybook(), story, {presentation: 'native'});
    const control = page.locator('input[type="date"]');
    await control.focus();
    const [keys, date] = committed;
    const typed = await typeWithoutRejection(page, control, keys, message);
    await expect(control).toHaveValue(date);

    // The year stays selected, so the next digits type a new year outside
    // the bounds. The control reports each partial year as a date.
    const partial = await typeWithoutRejection(page, control, '2027', message);
    test.info().annotations.push({
      type: 'reported values',
      description: JSON.stringify({typed, partial}),
    });

    await page.keyboard.press('Enter');
    await expect(control).toHaveAttribute('aria-invalid', 'true');
    expect(await describedText(control)).toContain(message);
    await expect(control).not.toHaveValue(date);

    await pressOutside(page);
    await expect(control).not.toBeFocused();
    await expect(control).toHaveValue(date);
    await expect(control).toHaveAttribute('aria-invalid', 'true');
    expect(await describedText(control)).toContain(message);
  });
}

for (const {name, story} of [
  {name: 'DateInput', story: 'core-dateinput--default'},
  {name: 'DateTimeInput date segment', story: 'core-datetimeinput--default'},
] as const) {
  for (const commit of ['Enter', 'blur'] as const) {
    test(`${name}: ${commit} keeps text that is not a date and shows why`, async ({
      page,
    }) => {
      await openStory(page, storybook(), story, {presentation: 'popover'});
      const control = page.getByRole('combobox').first();
      await control.focus();
      await typeWithoutRejection(page, control, 'tomorrowish', INVALID);

      if (commit === 'Enter') {
        await page.keyboard.press('Enter');
      } else {
        await pressOutside(page);
        await expect(control).not.toBeFocused();
      }
      await expect(control).toHaveValue('tomorrowish');
      await expect(control).toHaveAttribute('aria-invalid', 'true');
      expect(await describedText(control)).toContain(INVALID);
    });
  }
}

for (const {name, story} of [
  {name: 'DateInput', story: 'core-dateinput--default'},
  {name: 'DateTimeInput date segment', story: 'core-datetimeinput--default'},
] as const) {
  for (const commit of ['Enter', 'blur'] as const) {
    test(`${name}: under blur-or-enter, a date the calendar does not have shows nothing until ${commit}`, async ({
      page,
    }) => {
      await openStory(page, storybook(), story, {
        presentation: 'popover',
        entryErrorBehavior: 'blur-or-enter',
      });
      const control = page.getByRole('combobox').first();
      await control.focus();
      await typeWithoutRejection(page, control, '02/31/2026', NONEXISTENT);

      if (commit === 'Enter') {
        await page.keyboard.press('Enter');
      } else {
        await pressOutside(page);
        await expect(control).not.toBeFocused();
      }
      await expect(control).toHaveValue('02/31/2026');
      await expect(control).toHaveAttribute('aria-invalid', 'true');
      expect(await describedText(control)).toContain(NONEXISTENT);
    });
  }
}
