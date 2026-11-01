// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file reset.backdrop.a11y.browser.spec.ts
 * @input packages/core/src/reset.css, alone on a blank page
 * @output Browser evidence that `::backdrop` gets the reset's box model
 * @position reset.css integration proof. `*` never matches a pseudo-element,
 *   and only a shipping engine shows what a top-layer backdrop computes.
 */

import * as fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {expect, test, type Page} from '@playwright/test';

const RESET_CSS = fs.readFileSync(
  fileURLToPath(new URL('./reset.css', import.meta.url)),
  'utf8',
);

test.beforeEach(async ({page}) => {
  await page.setContent(`
    <dialog id="modal">A modal dialog</dialog>
    <div id="popover" popover>A popover</div>
  `);
  await page.addStyleTag({content: RESET_CSS});
});

async function backdropOf(page: Page, id: string) {
  return page.evaluate(target => {
    const element = document.getElementById(target);
    if (!element) {
      throw new Error(`missing #${target}`);
    }
    if (element instanceof HTMLDialogElement) {
      element.showModal();
    } else {
      element.showPopover();
    }
    const style = getComputedStyle(element, '::backdrop');
    return {
      boxSizing: style.boxSizing,
      borderTopStyle: style.borderTopStyle,
      borderTopWidth: style.borderTopWidth,
    };
  }, id);
}

test('a modal dialog and a popover get a border-box backdrop with the border reset', async ({
  page,
}) => {
  const expected = {
    boxSizing: 'border-box',
    borderTopStyle: 'solid',
    borderTopWidth: '0px',
  };
  expect(await backdropOf(page, 'modal')).toEqual(expected);
  expect(await backdropOf(page, 'popover')).toEqual(expected);
});

test('setting only border-width on a backdrop draws a solid border', async ({
  page,
}) => {
  await page.addStyleTag({content: '#modal::backdrop { border-width: 4px; }'});
  expect(await backdropOf(page, 'modal')).toEqual({
    boxSizing: 'border-box',
    borderTopStyle: 'solid',
    borderTopWidth: '4px',
  });
});
