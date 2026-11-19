// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file home-component-registry.spec.ts
 * @input Production docsite home page and components page, and the generated
 *   component registry
 * @output Regression proof that the home page shows the number of public Core
 *   components, and loads no script that holds the component registry
 * @position Docsite browser tests; only a built page shows which scripts it
 *   loads
 */

import {expect, test, type Page} from '@playwright/test';
import {components} from '../src/generated/componentRegistry';

const SAMPLE_COUNT = 10;
// A minifier keeps these characters of a string as they are. It can escape a
// quote, a backslash or a dollar sign, and a character outside ASCII.
const PRINTABLE_ASCII = /^[\x20-\x7e]+$/u;
const ESCAPABLE_CHARACTER = /["'`\\$]/u;

/** Component descriptions from the whole registry, as a script holds them. */
function registrySamples(): string[] {
  const descriptions = [
    ...new Set(
      Object.values(components)
        .flat()
        .map(component => component.description)
        .filter(
          description =>
            description.length >= 40 &&
            PRINTABLE_ASCII.test(description) &&
            !ESCAPABLE_CHARACTER.test(description),
        ),
    ),
  ];
  const step = descriptions.length / SAMPLE_COUNT;
  return Array.from(
    {length: SAMPLE_COUNT},
    (_, index) => descriptions[Math.floor(index * step)],
  );
}

interface LoadedScript {
  path: string;
  text: string;
}

/** Each script the page loads before its network is idle. */
async function loadedScripts(
  page: Page,
  path: string,
): Promise<LoadedScript[]> {
  const scripts: Promise<LoadedScript>[] = [];
  page.on('response', response => {
    if (response.request().resourceType() === 'script' && response.ok()) {
      scripts.push(
        response
          .text()
          .then(text => ({path: new URL(response.url()).pathname, text})),
      );
    }
  });
  await page.goto(path, {waitUntil: 'networkidle'});
  return Promise.all(scripts);
}

/**
 * The paths of the scripts that hold the registry. A page can quote one
 * description in its own copy. More than half of the samples in one script is
 * the registry itself.
 */
function registryScripts(scripts: LoadedScript[], samples: string[]): string[] {
  return scripts
    .filter(
      ({text}) =>
        samples.filter(sample => text.includes(sample)).length >
        samples.length / 2,
    )
    .map(script => script.path);
}

test('the home page loads no script that holds the component registry', async ({
  browser,
}) => {
  const samples = registrySamples();
  expect(new Set(samples).size).toBe(SAMPLE_COUNT);

  // The components page renders from the registry in the browser, so one of
  // its scripts holds it. This proves that the samples find the registry.
  const componentsPage = await browser.newPage();
  const componentsScripts = await loadedScripts(componentsPage, '/components');
  await componentsPage.close();
  expect(registryScripts(componentsScripts, samples)).not.toEqual([]);

  const homePage = await browser.newPage();
  const homeScripts = await loadedScripts(homePage, '/');
  await homePage.close();
  expect(homeScripts.length).toBeGreaterThan(0);
  expect(registryScripts(homeScripts, samples)).toEqual([]);
});

// home-component-count.test.tsx pins the rule of the count. This test proves
// that the built page shows that number in both places.
test('the home page shows the count of the registry on the components card and in the closing section', async ({
  page,
}) => {
  const publicComponents = components['@astryxdesign/core'].filter(
    component => !component.hidden && !component.name.startsWith('use'),
  ).length;
  const count = Math.floor(publicComponents / 10) * 10;
  expect(count).toBeGreaterThan(0);

  await page.goto('/');
  await expect(
    page.getByRole('heading', {name: `Over ${count} components`}),
  ).toBeVisible();
  await expect(page.getByText(`Browse ${count}+ components`)).toBeVisible();
});
