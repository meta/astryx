// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/TextArea/|packages/core/src/Field/textEntryTraits|apps/storybook/stories/TextArea)

/**
 * @file TextAreaKeyboardTraits.a11y.chromium.spec.ts
 * @input The `Core/TextArea` KeyboardTraits story in a built Storybook, in
 *   Chromium on a phone viewport with touch emulation.
 * @output Real-browser proof of component:TextArea FR13: a textarea a finger
 *   focuses carries the touch-keyboard attributes its props set and none its
 *   props leave unset.
 * @position Runs in pr-a11y when TextArea, its keyboard traits or its stories
 *   change. jsdom has no touch input, so only a browser shows what the
 *   textarea a tap focuses carries when the keyboard opens.
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
  'enterkeyhint',
  'inputmode',
  'autocapitalize',
  'autocorrect',
] as const;

type Attributes = Record<(typeof ATTRIBUTES)[number], string | null>;

/** Taps the field, then reads the touch-keyboard attributes of the focused textarea. */
async function tapAndRead(field: Locator): Promise<Attributes> {
  await field.tap();
  await expect(field).toBeFocused();
  return field.evaluate(
    (textarea, names) => {
      const read: Record<string, string | null> = {};
      for (const name of names) {
        read[name] = textarea.getAttribute(name);
      }
      return read;
    },
    ATTRIBUTES as unknown as string[],
  ) as Promise<Attributes>;
}

test('the textarea a tap focuses carries exactly the keyboard attributes its props set', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-textarea--keyboard-traits&viewMode=story`,
  );
  // Present and painted before anything is judged.
  const command = page.getByRole('textbox', {name: 'Shell command'});
  const caption = page.getByRole('textbox', {name: 'Photo caption'});
  for (const field of [command, caption]) {
    await expect(field).toBeVisible();
    const box = await field.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(0);
    expect(box?.height ?? 0).toBeGreaterThan(0);
  }

  // A shell command is typed exactly: no capitalization or correction.
  expect(await tapAndRead(command)).toEqual({
    enterkeyhint: null,
    inputmode: null,
    autocapitalize: 'none',
    autocorrect: 'off',
  });
  // A caption capitalizes each word and leaves the rest to the browser.
  expect(await tapAndRead(caption)).toEqual({
    enterkeyhint: null,
    inputmode: null,
    autocapitalize: 'words',
    autocorrect: null,
  });
});
