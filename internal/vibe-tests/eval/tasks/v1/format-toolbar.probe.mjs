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
  // A tooltip may be role=tooltip or a plain popup that shows the text.
  const tooltip = text => page.getByRole('tooltip', {name: text}).or(page.getByText(text, {exact: true}));
  const pressed = async name => (await button(name).getAttribute('aria-pressed')) === 'true';
  const active = text => page.getByText(new RegExp(`Active:\\s*${text}\\s*$`));
  const onlyActive = async (text, description) => {
    await shown(active(text), description);
  };
  const clearHover = async () => {
    const viewport = page.viewportSize() ?? {width: 800, height: 600};
    await page.mouse.move(viewport.width - 10, viewport.height - 10, {steps: 4});
    for (const [, tip] of BUTTONS) await hidden(tooltip(tip), `tooltip "${tip}" after the pointer left`);
  };
  return [
    ['a Formatting toolbar with three toggle buttons', async () => {
      await one(toolbar, 'toolbar named "Formatting"');
      for (const [name] of BUTTONS) {
        await one(button(name), `${name} button in the toolbar`);
        assert((await button(name).getAttribute('aria-pressed')) === 'false', `${name} does not report aria-pressed="false" on load`);
      }
      await shown(active('none'), '"Active: none"');
      for (const [, tip] of BUTTONS) await hidden(tooltip(tip), `tooltip "${tip}" before any hover`);
    }],
    ['each button shows its tooltip on hover', async () => {
      for (const [name, tip] of BUTTONS) {
        // Leave the toolbar first, then arrive in two moves, as a hand does.
        await clearHover();
        await button(name).hover();
        await button(name).hover({position: {x: 6, y: 6}});
        await shown(tooltip(tip), `tooltip "${tip}" on hover`);
      }
      await clearHover();
    }],
    ['keyboard focus shows the tooltip', async () => {
      await button('Bold').focus();
      await shown(tooltip('Bold (Ctrl+B)'), 'tooltip "Bold (Ctrl+B)" on focus');
      await press(page, 'ArrowRight');
      if (!(await isFocusedWithin(button('Italic')))) await press(page, 'Tab');
      await eventually(() => isFocusedWithin(button('Italic')), 'neither ArrowRight nor Tab moved focus from Bold to Italic');
      await shown(tooltip('Italic (Ctrl+I)'), 'tooltip "Italic (Ctrl+I)" on keyboard focus');
      await hidden(tooltip('Bold (Ctrl+B)'), 'tooltip "Bold (Ctrl+B)" after focus left Bold');
    }],
    ['buttons toggle aria-pressed and the active list', async () => {
      await button('Underline').click();
      await eventually(() => pressed('Underline'), 'Underline is not aria-pressed="true" after a click');
      await onlyActive('Underline', '"Active: Underline"');
      await button('Bold').click();
      await eventually(() => pressed('Bold'), 'Bold is not aria-pressed="true" after a click');
      assert(!(await pressed('Italic')), 'Italic is pressed without a click');
      await onlyActive('Bold, Underline', '"Active: Bold, Underline" in toolbar order');
      await button('Italic').click();
      await eventually(() => pressed('Italic'), 'Italic is not aria-pressed="true" after a click');
      await onlyActive('Bold, Italic, Underline', '"Active: Bold, Italic, Underline"');
    }],
    ['a second press turns each format off', async () => {
      await button('Italic').click();
      await eventually(async () => !(await pressed('Italic')), 'Italic stays pressed after a second click');
      await onlyActive('Bold, Underline', '"Active: Bold, Underline" after Italic is off');
      await button('Bold').click();
      await button('Underline').click();
      await eventually(async () => !(await pressed('Bold')) && !(await pressed('Underline')), 'Bold or Underline stays pressed');
      await onlyActive('none', '"Active: none" after every format is off');
    }],
  ];
}
