// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Probe: links in the bar when wide, behind an "Open menu" panel when narrow
 * @input a page with the built app
 * @output named steps for runSteps in lib/probe-kit.mjs
 * @position Read by the grader for the task of the same name
 */

import {assert, eventually, hidden, isFocusedWithin, one, press, shown} from '../../lib/probe-kit.mjs';

const LINKS = ['Home', 'Projects', 'Team', 'Settings'];

/** @param {import('playwright-core').Page} page */
export default function steps(page) {
  const link = name => page.getByRole('link', {name, exact: true});
  const menuButton = page.getByRole('button', {name: 'Open menu', exact: true});
  const homeIsCurrent = async () =>
    (await link('Home').filter({visible: true}).getAttribute('aria-current')) === 'page';
  const allLinksShown = async where => {
    for (const name of LINKS) await one(link(name), `${name} link ${where}`);
  };
  const allLinksHidden = async where => {
    for (const name of LINKS) await hidden(link(name), `${name} link ${where}`);
  };
  const openMenu = async () => {
    await one(menuButton, 'Open menu button');
    await menuButton.click();
    await allLinksShown('in the open panel');
  };
  return [
    ['wide: site name and links in the bar', async () => {
      await page.setViewportSize({width: 1280, height: 800});
      await shown(page.getByText('Orbit', {exact: true}).filter({visible: true}), 'site name "Orbit"');
      await allLinksShown('at 1280px');
      await hidden(menuButton, 'Open menu button at 1280px');
    }],
    ['wide: Home is the current page', async () => {
      assert(await homeIsCurrent(), 'the Home link does not have aria-current="page"');
      for (const name of LINKS.slice(1)) {
        const current = await link(name).filter({visible: true}).getAttribute('aria-current');
        assert(current === null || current === 'false', `the ${name} link has aria-current="${current}"`);
      }
    }],
    ['narrow: links hide behind the menu button', async () => {
      await page.setViewportSize({width: 390, height: 844});
      await one(menuButton, 'Open menu button at 390px');
      await allLinksHidden('at 390px before opening the menu');
    }],
    ['narrow: the panel shows the links, Home current', async () => {
      await openMenu();
      await eventually(homeIsCurrent, 'the Home link in the panel does not have aria-current="page"');
    }],
    ['narrow: Escape closes the panel and returns focus', async () => {
      await press(page, 'Escape');
      await allLinksHidden('after Escape');
      await one(menuButton, 'Open menu button after Escape');
      await eventually(() => isFocusedWithin(menuButton), 'focus did not return to the Open menu button after Escape');
    }],
    ['narrow: choosing a link closes the panel', async () => {
      await openMenu();
      await link('Team').filter({visible: true}).click();
      await allLinksHidden('after choosing Team');
      await one(menuButton, 'Open menu button after choosing a link');
    }],
    ['wide again', async () => {
      await page.setViewportSize({width: 1280, height: 800});
      await allLinksShown('back at 1280px');
    }],
  ];
}
