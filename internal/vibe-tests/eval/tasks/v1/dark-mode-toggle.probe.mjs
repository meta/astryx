// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Probe: a "Dark mode" switch that turns the page background dark and the text light
 * @input a page with the built app
 * @output named steps for runSteps in lib/probe-kit.mjs
 * @position Read by the grader for the task of the same name
 */

import {assert, eventually, one, shown} from '../../lib/probe-kit.mjs';

/**
 * Runs in the page. Returns the relative luminance of a CSS color, or null
 * when the color is mostly transparent. A canvas converts any color syntax
 * (oklch, lab, color-mix results) to sRGB bytes.
 */
const LUMINANCE_SOURCE = `(color => {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d', {willReadFrequently: true});
  context.clearRect(0, 0, 1, 1);
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
  if (a < 128) return null;
  const linear = value => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
})`;

/**
 * Luminance of what is painted near the bottom-left corner: the first
 * opaque background from the element at that point up to <html>, or the
 * canvas color the browser paints for <html> when none is opaque.
 */
async function backgroundLuminance(page) {
  return page.evaluate(source => {
    const luminance = (0, eval)(source);
    let element = document.elementFromPoint(4, window.innerHeight - 4) ?? document.documentElement;
    for (; element; element = element.parentElement) {
      const value = luminance(getComputedStyle(element).backgroundColor);
      if (value !== null) return value;
    }
    const probe = document.createElement('span');
    probe.style.backgroundColor = 'Canvas';
    document.documentElement.appendChild(probe);
    const canvasColor = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return luminance(canvasColor);
  }, LUMINANCE_SOURCE);
}

async function textLuminance(locator) {
  return locator.evaluate((element, source) => (0, eval)(source)(getComputedStyle(element).color), LUMINANCE_SOURCE);
}

/** @param {import('playwright-core').Page} page */
export default function steps(page) {
  const toggle = page.getByRole('switch', {name: 'Dark mode', exact: true});
  const title = page.getByText('Appearance', {exact: true}).filter({visible: true});
  const round = value => (value === null ? 'transparent' : value.toFixed(2));
  return [
    ['card title and switch', async () => {
      await shown(title, '"Appearance" title');
      await one(toggle, 'Dark mode switch');
    }],
    ['starts off with a light page', async () => {
      assert(!(await toggle.isChecked()), 'Dark mode is on at load');
      const background = await backgroundLuminance(page);
      assert(background > 0.6, `page background luminance is ${round(background)} at load; expected above 0.6`);
    }],
    ['on makes the page dark and the text light', async () => {
      await toggle.click();
      await eventually(() => toggle.isChecked(), 'Dark mode is not on after a click');
      let background = null;
      await eventually(
        async () => (background = await backgroundLuminance(page)) < 0.25,
        () => `page background luminance is ${round(background)} in dark mode; expected below 0.25`,
      );
      let text = null;
      await eventually(
        async () => (text = await textLuminance(title.first())) > 0.6,
        () => `"Appearance" text luminance is ${round(text)} in dark mode; expected above 0.6`,
      );
    }],
    ['off returns to the light page', async () => {
      await toggle.click();
      await eventually(async () => !(await toggle.isChecked()), 'Dark mode is still on after a second click');
      let background = null;
      await eventually(
        async () => (background = await backgroundLuminance(page)) > 0.6,
        () => `page background luminance is ${round(background)} after turning dark mode off; expected above 0.6`,
      );
    }],
  ];
}
