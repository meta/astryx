// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TokenizerTouchDelete.interaction.browser.spec.ts
 * @input The built "Core/Tokenizer" stories on a tablet-sized touch
 *   screen, real touch input and the keyboard's Backspace
 * @output Proofs of Tokenizer's two-press Delete on a touch screen. The first
 *   Backspace on the empty input selects the last token; the second removes
 *   it. Typing keeps a selected token, and leaving the field clears the
 *   selection. A storyboard holds stills of the three states.
 * @position Interaction proof for Tokenizer's touch Delete (Tokenizer.tsx)
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  openStory,
  touchDriver,
  withStorybook,
  writeEvidence,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

// The inline field on a touch screen is a tablet's: a phone's default field
// is the bottom sheet, which has no inline input.
test.use({viewport: {width: 1024, height: 1366}});

async function openField(page: Page) {
  await openStory(page, storybook(), 'core-tokenizer--with-preselected');
  const driver = await touchDriver(page);
  const input = page.getByRole('combobox');
  await expect(input).toBeVisible();
  const box = await input.boundingBox();
  if (box == null) {
    throw new Error('no input');
  }
  await driver.tap({x: box.x + box.width / 2, y: box.y + box.height / 2});
  await expect(input).toBeFocused();
  return input;
}

/** Each token's label and whether it is selected, in order. */
const tokens = async (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .filter(button =>
        (button.getAttribute('aria-label') ?? '').startsWith('Remove '),
      )
      .map(button => ({
        label: (button.getAttribute('aria-label') ?? '').slice(7),
        selected:
          button.parentElement?.hasAttribute('aria-description') ?? false,
        fill: getComputedStyle(button.parentElement as Element).backgroundColor,
      })),
  );

test('the first Delete selects the last token and the second removes it', async ({
  page,
}) => {
  await openField(page);
  const before = await tokens(page);
  expect(before.map(t => t.label)).toEqual(['Alice Johnson', 'Charlie Brown']);

  await page.keyboard.press('Backspace');
  const selected = await tokens(page);
  expect(selected.map(t => [t.label, t.selected])).toEqual([
    ['Alice Johnson', false],
    ['Charlie Brown', true],
  ]);
  // The selected token takes another fill.
  expect(selected[1].fill).not.toBe(before[1].fill);
  // And stays findable after the announcement, on the token. The input keeps
  // only the field's own description.
  const message = 'Charlie Brown selected. Delete again to remove it.';
  await expect(page.getByRole('combobox')).not.toHaveAttribute(
    'aria-description',
  );
  await expect(page.getByRole('combobox')).not.toHaveAccessibleDescription(
    message,
  );
  await expect(
    page.getByRole('button', {name: 'Remove Charlie Brown'}).locator('..'),
  ).toHaveAttribute('aria-description', message);

  await page.keyboard.press('Backspace');
  expect((await tokens(page)).map(t => t.label)).toEqual(['Alice Johnson']);
  await expect(page.getByRole('combobox')).toBeFocused();
});

test('typing with a token selected keeps it and clears the selection', async ({
  page,
}, testInfo) => {
  const input = await openField(page);
  await page.keyboard.press('Backspace');
  expect((await tokens(page))[1].selected).toBe(true);
  await page.keyboard.type('d');
  await expect(input).toHaveValue('d');
  expect((await tokens(page)).map(t => [t.label, t.selected])).toEqual([
    ['Alice Johnson', false],
    ['Charlie Brown', false],
  ]);
  await writeEvidence(
    'stills/tokenizer-touch-delete-typing-keeps',
    {
      [`${testInfo.project.name}.png`]: await page
        .getByRole('group', {name: 'Team Members'})
        .screenshot(),
    },
    testInfo,
  );
});

test('leaving the field clears the selection and keeps the token', async ({
  page,
}, testInfo) => {
  const input = await openField(page);
  await page.keyboard.press('Backspace');
  expect((await tokens(page))[1].selected).toBe(true);
  await input.evaluate(element => (element as HTMLInputElement).blur());
  await expect(input).not.toBeFocused();
  expect((await tokens(page)).map(t => [t.label, t.selected])).toEqual([
    ['Alice Johnson', false],
    ['Charlie Brown', false],
  ]);
  await writeEvidence(
    'stills/tokenizer-touch-delete-leaving-clears',
    {
      [`${testInfo.project.name}.png`]: await page
        .getByRole('group', {name: 'Team Members'})
        .screenshot(),
    },
    testInfo,
  );
});

test(
  'storyboard: two Deletes on a touch screen',
  {tag: '@storyboard'},
  async ({page}, testInfo) => {
    await openField(page);
    const field = page.getByRole('group', {name: 'Team Members'});
    const shots: Record<string, Buffer> = {};
    const trace: {step: string; tokens: Awaited<ReturnType<typeof tokens>>}[] =
      [];
    for (const step of ['0-focused', '1-first-delete', '2-second-delete']) {
      if (step !== '0-focused') {
        await page.keyboard.press('Backspace');
      }
      shots[`${step}.${testInfo.project.name}.png`] = await field.screenshot();
      trace.push({step, tokens: await tokens(page)});
    }
    await writeEvidence(
      'storyboards/tokenizer-touch-delete',
      {
        ...shots,
        [`trace.${testInfo.project.name}.json`]: JSON.stringify(trace, null, 1),
      },
      testInfo,
    );
    expect(trace.map(s => s.tokens.length)).toEqual([2, 2, 1]);
    expect(trace[1].tokens[1].selected).toBe(true);
  },
);
