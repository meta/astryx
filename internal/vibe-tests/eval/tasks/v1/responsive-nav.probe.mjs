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
  // A closed drawer can sit off screen or be inert instead of hidden, so a link counts only when a person can reach it.
  const onScreen = (name, read) =>
    link(name).evaluateAll(
      (links, readAttribute) =>
        links.flatMap((element, index) => {
          const box = element.getBoundingClientRect();
          const inView = box.width > 0 && box.height > 0 && box.right > 0 && box.bottom > 0 && box.left < innerWidth && box.top < innerHeight;
          const reachable = inView && element.checkVisibility({visibilityProperty: true}) && !element.closest('[inert]');
          return reachable ? [{index, value: readAttribute ? element.getAttribute(readAttribute) : null}] : [];
        }),
      read,
    );
  const onScreenCount = async name => (await onScreen(name)).length;
  /** The aria-current values of the links a person can reach with this name. */
  const currentOf = async name => (await onScreen(name, 'aria-current')).map(({value}) => value);
  const homeIsCurrent = async () => {
    const values = await currentOf('Home');
    return values.length === 1 && values[0] === 'page';
  };
  const allLinksShown = async where => {
    for (const name of LINKS) {
      let count;
      await eventually(async () => (count = await onScreenCount(name)) === 1, () => `expected 1 ${name} link on screen ${where}, found ${count}`);
    }
  };
  const allLinksHidden = async where => {
    for (const name of LINKS) await eventually(async () => (await onScreenCount(name)) === 0, `${name} link is still on screen ${where}`);
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
        const [current = null] = await currentOf(name);
        assert(current === null || current === 'false', `the ${name} link has aria-current="${current}"`);
      }
    }],
    ['the layout switches at 768 pixels', async () => {
      await page.setViewportSize({width: 800, height: 800});
      await allLinksShown('at 800px');
      await hidden(menuButton, 'Open menu button at 800px');
      await page.setViewportSize({width: 740, height: 800});
      await one(menuButton, 'Open menu button at 740px');
      await allLinksHidden('at 740px before opening the menu');
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
      const [team] = await onScreen('Team');
      assert(team, 'no Team link on screen in the open panel');
      await link('Team').nth(team.index).click();
      await allLinksHidden('after choosing Team');
      await one(menuButton, 'Open menu button after choosing a link');
    }],
    ['wide again', async () => {
      await page.setViewportSize({width: 1280, height: 800});
      await allLinksShown('back at 1280px');
    }],
  ];
}
