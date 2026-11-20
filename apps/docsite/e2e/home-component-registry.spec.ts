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

import {expect, test, type Page, type Response} from '@playwright/test';
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
  const reads: Promise<LoadedScript>[] = [];
  const readScript = (response: Response) => {
    if (response.request().resourceType() !== 'script' || !response.ok()) {
      return;
    }
    const read = response
      .text()
      .then(text => ({path: new URL(response.url()).pathname, text}));
    // A read can still be in flight when the page closes, as after a failed
    // navigation. Its rejection then reaches no one and fails the whole run.
    void read.catch(() => undefined);
    reads.push(read);
  };
  page.on('response', readScript);
  try {
    await page.goto(path, {waitUntil: 'networkidle'});
  } finally {
    // The reader stops here, so a script that answers later, as a prefetch
    // can, starts no read that could outlive the page.
    page.off('response', readScript);
  }
  return Promise.all(reads);
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

// A read that no one waits on fails the test when its page closes. Playwright
// then stops the worker, so the test's next browser call fails too.
test('the script reader leaves alone a script that answers after the network is idle', async ({
  browser,
}) => {
  const page = await browser.newPage();
  await page.route('**/late-script.js', route =>
    route.fulfill({contentType: 'text/javascript', body: ''}),
  );
  const closed = page.waitForEvent('close');
  let reading: Promise<unknown> = Promise.resolve();
  // This listener comes before the reader's own. A read of the late script
  // then waits until the page has closed, so it is in flight at the close.
  page.on('response', response => {
    if (new URL(response.url()).pathname !== '/late-script.js') {
      return;
    }
    const text = response.text.bind(response);
    response.text = async () => {
      const read = closed.then(text);
      reading = read.catch(() => undefined);
      return read;
    };
    void page.close();
  });
  await loadedScripts(page, '/');
  await page.evaluate(() => {
    const script = document.createElement('script');
    script.src = '/late-script.js';
    document.head.append(script);
  });
  await closed;
  await reading;
  // Node reports an unhandled rejection once the current task ends.
  await new Promise(resolve => {
    setImmediate(resolve);
  });
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
