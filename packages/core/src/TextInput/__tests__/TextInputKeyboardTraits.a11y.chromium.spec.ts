// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/TextInput/|packages/core/src/Field/textEntryTraits|apps/storybook/stories/TextInput)

/**
 * @file TextInputKeyboardTraits.a11y.chromium.spec.ts
 * @input The `Core/TextInput` KeyboardTraits story in a built Storybook, in
 *   Chromium on a phone viewport with touch emulation.
 * @output Real-browser proof of component:TextInput FR16 and AR6: a field a
 *   finger focuses carries the touch-keyboard attributes its props set and
 *   none its props leave unset, and a search field is a searchbox.
 * @position Runs in pr-a11y when TextInput, its keyboard traits or its
 *   stories change. jsdom has no touch input, so only a browser shows what the
 *   input a tap focuses carries when the keyboard opens.
 */

import {expect, test, type Locator} from '@playwright/test';
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

test.use({hasTouch: true, viewport: {width: 390, height: 844}});

const ATTRIBUTES = [
  'type',
  'enterkeyhint',
  'inputmode',
  'autocapitalize',
  'autocorrect',
  'spellcheck',
] as const;

type Attributes = Record<(typeof ATTRIBUTES)[number], string | null>;

/** Taps the field, then reads the touch-keyboard attributes of the focused input. */
async function tapAndRead(field: Locator): Promise<Attributes> {
  await field.tap();
  await expect(field).toBeFocused();
  return field.evaluate(
    (input, names) => {
      const read: Record<string, string | null> = {};
      for (const name of names) {
        read[name] = input.getAttribute(name);
      }
      return read;
    },
    ATTRIBUTES as unknown as string[],
  ) as Promise<Attributes>;
}

const NONE = {
  inputmode: null,
  autocapitalize: null,
  autocorrect: null,
  spellcheck: null,
};

test('the input a tap focuses carries exactly the keyboard attributes its props set', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-textinput--keyboard-traits&viewMode=story`,
  );
  // Present and painted before anything is judged: every field of the story
  // renders a visible input.
  const search = page.getByRole('searchbox', {name: 'Search'});
  const phone = page.getByRole('textbox', {name: 'Phone'});
  const website = page.getByRole('textbox', {name: 'Website'});
  const code = page.getByRole('textbox', {name: 'Verification code'});
  const username = page.getByRole('textbox', {name: 'Username'});
  for (const field of [search, phone, website, code, username]) {
    await expect(field).toBeVisible();
    const box = await field.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(0);
    expect(box?.height ?? 0).toBeGreaterThan(0);
  }

  // A search field is a searchbox (AR6) whose keyboard says Search and
  // neither capitalizes nor corrects.
  expect(await tapAndRead(search)).toEqual({
    ...NONE,
    type: 'search',
    enterkeyhint: 'search',
    autocapitalize: 'none',
    autocorrect: 'off',
  });
  // The phone and URL types bring their own keyboards; only the Return key
  // label is set.
  expect(await tapAndRead(phone)).toEqual({
    ...NONE,
    type: 'tel',
    enterkeyhint: 'next',
  });
  expect(await tapAndRead(website)).toEqual({
    ...NONE,
    type: 'url',
    enterkeyhint: 'go',
  });
  // A one-time code asks for the number pad without changing the type.
  expect(await tapAndRead(code)).toEqual({
    ...NONE,
    type: 'text',
    enterkeyhint: 'done',
    inputmode: 'numeric',
  });
  // A username turns off capitalization, correction and spell checking.
  expect(await tapAndRead(username)).toEqual({
    type: 'text',
    enterkeyhint: 'next',
    inputmode: null,
    autocapitalize: 'none',
    autocorrect: 'off',
    spellcheck: 'false',
  });
});
