// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Probe: archive a message, announce it in a live region, undo in place
 * @input a page with the built app
 * @output named steps for runSteps in lib/probe-kit.mjs
 * @position Read by the grader for the task of the same name
 */

import {assert, eventually, hidden, one, shown} from '../../lib/probe-kit.mjs';

const TITLES = ['Welcome to Orbit', 'Your invoice is ready', 'Weekly summary'];
const NOTICE = 'Message archived';

/** @param {import('playwright-core').Page} page */
export default function steps(page) {
  const archive = title => page.getByRole('button', {name: `Archive ${title}`, exact: true});
  // A button can repeat the title in screen-reader-only text, so titles come from outside buttons.
  const title = text =>
    page.getByText(text, {exact: true}).filter({visible: true}).and(page.locator(':not(button *)'));
  const notice = page.getByText(new RegExp(NOTICE)).filter({visible: true});
  const undo = page.getByRole('button', {name: 'Undo', exact: true});
  /** True when an element with live-region semantics contains the text. */
  const announced = () =>
    page.evaluate(text => {
      const isLive = element => {
        const role = element.getAttribute('role');
        const live = element.getAttribute('aria-live');
        return ['status', 'alert', 'log'].includes(role ?? '') || (live !== null && live !== 'off') || element.localName === 'output';
      };
      return [...document.querySelectorAll('[role], [aria-live], output')].some(
        element => isLive(element) && (element.textContent ?? '').includes(text),
      );
    }, NOTICE);
  /** Titles in the order they appear on screen, top to bottom. */
  const order = async () => {
    const placed = [];
    for (const text of TITLES) {
      const box = (await title(text).count()) === 1 ? await title(text).boundingBox() : null;
      if (box) placed.push([box.y, text]);
    }
    return placed.sort((a, b) => a[0] - b[0]).map(([, text]) => text);
  };
  return [
    ['three messages with archive buttons', async () => {
      for (const text of TITLES) {
        await shown(title(text), `"${text}" title`);
        await one(archive(text), `Archive ${text} button`);
      }
    }],
    ['archiving removes the row and shows a notice', async () => {
      await archive(TITLES[1]).click();
      await hidden(archive(TITLES[1]), `Archive ${TITLES[1]} button`);
      await hidden(title(TITLES[1]), `"${TITLES[1]}" row`);
      await shown(notice, `"${NOTICE}" notification`);
      await one(undo, 'Undo button');
    }],
    ['the notice is in a live region', async () => {
      await eventually(announced, `no role=status/alert/log or aria-live region contains "${NOTICE}"`);
    }],
    ['Undo restores the row in place and hides the notice', async () => {
      await undo.filter({visible: true}).click();
      await one(archive(TITLES[1]), `Archive ${TITLES[1]} button after Undo`);
      await hidden(notice, `"${NOTICE}" notification after Undo`);
      await eventually(async () => (await order()).length === 3, 'not every title is visible after Undo');
      const restored = await order();
      assert(
        restored.join('|') === TITLES.join('|'),
        `order after Undo is ${restored.join(', ')}; expected ${TITLES.join(', ')}`,
      );
    }],
  ];
}
