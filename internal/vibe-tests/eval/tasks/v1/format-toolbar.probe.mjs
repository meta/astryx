// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Probe: a labelled toolbar of toggle buttons with hover and focus tooltips
 * @input a page with the built app
 * @output named steps for runSteps in lib/probe-kit.mjs
 * @position Read by the grader for the task of the same name
 */

import {assert, eventually, hidden, isFocusedWithin, one, press, shown} from '../../lib/probe-kit.mjs';

const BUTTONS = [
  ['Bold', 'Bold (Ctrl+B)'],
  ['Italic', 'Italic (Ctrl+I)'],
  ['Underline', 'Underline (Ctrl+U)'],
];

/** @param {import('playwright-core').Page} page */
export default function steps(page) {
  const toolbar = page.getByRole('toolbar', {name: 'Formatting', exact: true});
  const button = name => toolbar.getByRole('button', {name, exact: true});
  // A tooltip may be role=tooltip or a plain popup with the text. Text at opacity 0 is not shown.
  const tipShown = text =>
    page.evaluate(
      tip =>
        [...document.querySelectorAll('body *')].some(
          element =>
            element.textContent?.replace(/\s+/g, ' ').trim() === tip &&
            element.checkVisibility({opacityProperty: true, visibilityProperty: true}) &&
            element.getBoundingClientRect().width > 1,
        ),
      text,
    );
  const showsTip = (text, description) => eventually(() => tipShown(text), `${description} is not shown`);
  const hidesTip = (text, description) => eventually(async () => !(await tipShown(text)), `${description} is still shown`);
  const pressed = async name => (await button(name).getAttribute('aria-pressed')) === 'true';
  const active = text => page.getByText(new RegExp(`Active:\\s*${text}\\s*$`));
  const clearHover = async () => {
    const viewport = page.viewportSize() ?? {width: 800, height: 600};
    await page.mouse.move(viewport.width - 10, viewport.height - 10, {steps: 4});
    for (const [, tip] of BUTTONS) await hidesTip(tip, `tooltip "${tip}" after the pointer left`);
  };
  return [
    ['a Formatting toolbar with three toggle buttons', async () => {
      await one(toolbar, 'toolbar named "Formatting"');
      for (const [name] of BUTTONS) {
        await one(button(name), `${name} button in the toolbar`);
        assert((await button(name).getAttribute('aria-pressed')) === 'false', `${name} does not report aria-pressed="false" on load`);
      }
      await shown(active('none'), '"Active: none"');
      for (const [, tip] of BUTTONS) await hidesTip(tip, `tooltip "${tip}" before any hover`);
    }],
    ['each button shows its tooltip on hover', async () => {
      for (const [name, tip] of BUTTONS) {
        // Leave the toolbar first, then arrive in two moves, as a hand does.
        await clearHover();
        await button(name).hover();
        await button(name).hover({position: {x: 6, y: 6}});
        await showsTip(tip, `tooltip "${tip}" on hover`);
      }
      await clearHover();
    }],
    ['keyboard focus shows the tooltip', async () => {
      // Tab in from the page start, as a keyboard user does, so :focus-visible applies.
      await page.mouse.click(5, 5);
      for (let tabs = 0; tabs < 10 && !(await isFocusedWithin(button('Bold'))); tabs++) await press(page, 'Tab');
      assert(await isFocusedWithin(button('Bold')), 'Tab from the page start never reached Bold');
      await showsTip('Bold (Ctrl+B)', 'tooltip "Bold (Ctrl+B)" on focus');
      await press(page, 'ArrowRight');
      if (!(await isFocusedWithin(button('Italic')))) await press(page, 'Tab');
      await eventually(() => isFocusedWithin(button('Italic')), 'neither ArrowRight nor Tab moved focus from Bold to Italic');
      await showsTip('Italic (Ctrl+I)', 'tooltip "Italic (Ctrl+I)" on keyboard focus');
      await hidesTip('Bold (Ctrl+B)', 'tooltip "Bold (Ctrl+B)" after focus left Bold');
    }],
    ['buttons toggle aria-pressed and the active list', async () => {
      await button('Underline').click();
      await eventually(() => pressed('Underline'), 'Underline is not aria-pressed="true" after a click');
      await shown(active('Underline'), '"Active: Underline"');
      await button('Bold').click();
      await eventually(() => pressed('Bold'), 'Bold is not aria-pressed="true" after a click');
      assert(!(await pressed('Italic')), 'Italic is pressed without a click');
      await shown(active('Bold, Underline'), '"Active: Bold, Underline" in toolbar order');
      await button('Italic').click();
      await eventually(() => pressed('Italic'), 'Italic is not aria-pressed="true" after a click');
      await shown(active('Bold, Italic, Underline'), '"Active: Bold, Italic, Underline"');
    }],
    ['a second press turns each format off', async () => {
      await button('Italic').click();
      await eventually(async () => !(await pressed('Italic')), 'Italic stays pressed after a second click');
      await shown(active('Bold, Underline'), '"Active: Bold, Underline" after Italic is off');
      await button('Bold').click();
      await button('Underline').click();
      await eventually(async () => !(await pressed('Bold')) && !(await pressed('Underline')), 'Bold or Underline stays pressed');
      await shown(active('none'), '"Active: none" after every format is off');
    }],
  ];
}
