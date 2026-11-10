#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @description Asserts native-dialog host exit/render/dismissal ordering in a real browser (MobileNav, Drawer)
 * @input --storybook-dir <path> [--port <n>] [--browser chromium|webkit]
 * @output One line per target; exit 1 if a native-host invariant fails
 *
 * Five ordering contracts live at this boundary:
 *
 * 1. A modal <dialog> that is `display: none` while still `:modal` blocks every
 *    pointer event on the document, and Safari 26.1 did not release that block
 *    when close() finally ran (#4290). It must still be rendered when close()
 *    starts.
 * 2. A fixed panel that stays rendered after its native host leaves the top
 *    layer can paint back inside a transformed ancestor for one frame (#5549).
 *    It must be hidden before the next paint.
 * 3. The non-modal Popover host must preserve `<dialog>`'s observable `close`
 *    event so ref/onClose consumers keep their focus-restoration contract. The
 *    companion ordering — the event dispatches after the drawer's own focus
 *    restore, so a close listener that retargets focus (master-detail row
 *    switching) has the last word — is covered at unit level: Drawer.test.tsx
 *    "dispatches the synthetic close after focus restore so a close listener
 *    owns final focus".
 * 4. A closing top drawer stays on the shared dismissal stack until its visual
 *    exit completes, so a second Escape cannot dismiss the drawer below it.
 * 5. After a completed exit, focus rests on the element focused at open.
 *
 * None of these orderings exists in jsdom: it runs no CSS transition and has no
 * top layer. Runs in Chromium by default; `--browser webkit` runs the same
 * probes in Playwright WebKit because `docs/architecture/layer-runtime.md`
 * requires Chromium and WebKit evidence for native Popover/dialog/focus
 * changes. (Playwright WebKit is the WebKit engine, not Safari itself — see
 * spec:AST-027 for that distinction.)
 */

const playwright = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const args = process.argv.slice(2);
const getArg = name => {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 ? args[idx + 1] : null;
};

const storybookDir = getArg('storybook-dir') || 'apps/storybook/dist';
const port = Number(getArg('port') || 6009);
const browserName = getArg('browser') || 'chromium';

if (browserName !== 'chromium' && browserName !== 'webkit') {
  console.error(`Unsupported --browser "${browserName}" (chromium|webkit)`);
  process.exit(1);
}

const TARGETS = [
  {
    component: 'MobileNav',
    story: 'core-mobilenav--default',
    openButton: 'Open Navigation',
  },
  {
    component: 'Drawer (modal)',
    story: 'core-drawer--showcase',
    openButton: 'Open inspector',
    // Reproduces the real failure condition: after the native host releases the
    // top layer, this becomes the containing block for the fixed panel.
    transformAncestor: true,
    mustBeHiddenAfterClose: true,
    finalFocus: 'Open inspector',
  },
  {
    component: 'Drawer (non-modal)',
    story: 'core-drawer--row-inspector',
    openButton: 'Open drawer',
    host: 'popover',
    transformAncestor: true,
    mustBeHiddenAfterClose: true,
    mustDispatchClose: true,
    finalFocus: 'Open drawer',
  },
  {
    component: 'Drawer (stacked exit)',
    story: 'core-drawer--stacked-drawers',
    openButton: 'Open order',
    nestedButton: 'Open line item',
    outerLabel: 'Order details',
    innerLabel: 'Line item details',
    host: 'popover',
    stackedExit: true,
    mustBeHiddenAfterClose: true,
    mustDispatchClose: true,
    finalFocus: 'Open order',
  },
];

const CONTENT_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function createServer(dir, listenPort) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const filePath = path
        .join(dir, req.url === '/' ? 'index.html' : req.url)
        .split('?')[0];

      const resolved = path.resolve(filePath);
      if (!resolved.startsWith(path.resolve(dir))) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      fs.readFile(resolved, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        res.writeHead(200, {
          'Content-Type': CONTENT_TYPES[path.extname(resolved)] || 'text/plain',
        });
        res.end(data);
      });
    });

    server.listen(listenPort, () => resolve(server));
  });
}

// Records the rendered state at the instant either native host is released.
function recordHostExitDisplay() {
  window.__closeDisplays = [];
  window.__postCloseFrames = [];
  window.__dialogCloseEvents = 0;

  const sampleAfterExit = dialog => {
    requestAnimationFrame(() => {
      const rect = dialog.getBoundingClientRect();
      window.__postCloseFrames.push({
        display: getComputedStyle(dialog).display,
        open: dialog.open,
        popoverOpen: dialog.matches(':popover-open'),
        x: Math.round(rect.x),
        width: Math.round(rect.width),
      });
    });
  };
  const recordExit = (dialog, exit, args) => {
    window.__closeDisplays.push(getComputedStyle(dialog).display);
    const result = exit.apply(dialog, args);
    // Sample immediately before the next paint. A `mustBeHiddenAfterClose`
    // target must have committed its hide by this point; otherwise the
    // non-top-layer panel can paint against a transformed ancestor for one frame.
    sampleAfterExit(dialog);
    return result;
  };

  const close = HTMLDialogElement.prototype.close;
  HTMLDialogElement.prototype.close = function (...args) {
    return recordExit(this, close, args);
  };

  const hidePopover = HTMLElement.prototype.hidePopover;
  if (typeof hidePopover === 'function') {
    HTMLElement.prototype.hidePopover = function (...args) {
      if (this instanceof HTMLDialogElement) {
        return recordExit(this, hidePopover, args);
      }
      return hidePopover.apply(this, args);
    };
  }

  document.addEventListener(
    'close',
    event => {
      if (event.target instanceof HTMLDialogElement) {
        window.__dialogCloseEvents += 1;
      }
    },
    true,
  );
}

async function probe(page, target) {
  await page.addInitScript(recordHostExitDisplay);
  await page.goto(
    `http://localhost:${port}/iframe.html?id=${target.story}&viewMode=story`,
    {waitUntil: 'networkidle', timeout: 15000},
  );

  if (target.transformAncestor) {
    await page.evaluate(() => {
      const root = document.querySelector('#storybook-root');
      if (!(root instanceof HTMLElement)) {
        throw new Error('Storybook root not found');
      }
      root.style.transform = 'translateZ(0)';
    });
  }

  const hostSelector =
    target.host === 'popover' ? 'dialog:popover-open' : 'dialog:modal';
  const openHostCount = target.stackedExit ? 2 : 1;
  await page.getByRole('button', {name: target.openButton}).click();
  if (target.nestedButton) {
    await page.getByRole('button', {name: target.nestedButton}).click();
  }
  await page.waitForFunction(
    ({selector, count}) => document.querySelectorAll(selector).length === count,
    {selector: hostSelector, count: openHostCount},
    {timeout: 5000},
  );

  // Let every open host finish its @starting-style entry before we drive the
  // close. If Escape lands while a drawer is still sliding in, the exit cancels
  // the entry transition and the presence hook treats that `transitioncancel`
  // as exit completion — so the host leaves the top layer at once, with no
  // slide-out. On a slow CI runner the whole exit is gone before the probe can
  // observe the close event, the focus handoff, or the stacked-ownership
  // window, and the wait below times out (a flake that never reproduces on a
  // fast dev machine). Waiting for the resting transform makes the following
  // exit a clean, observable transition. No-op for hosts that do not transform
  // the dialog element itself (MobileNav animates a child; its transform stays
  // `none`).
  await page.waitForFunction(
    selector => {
      const dialogs = [...document.querySelectorAll(selector)];
      return (
        dialogs.length > 0 &&
        dialogs.every(dialog => {
          const transform = getComputedStyle(dialog).transform;
          return (
            transform === 'none' || transform === 'matrix(1, 0, 0, 1, 0, 0)'
          );
        })
      );
    },
    hostSelector,
    {timeout: 5000},
  );

  let stackedExitOwned = true;
  if (target.stackedExit) {
    const outer = page.getByRole('dialog', {name: target.outerLabel});
    const inner = page.getByRole('dialog', {name: target.innerLabel});
    const innerOpenClass = await inner.getAttribute('class');

    await page.keyboard.press('Escape');
    // Wait until React has committed the inner drawer's exit state while its
    // native host is still open. The second Escape then exercises the actual
    // slide-out window rather than racing the first state update.
    await page.waitForFunction(
      ({label, openClass}) => {
        const dialog = [...document.querySelectorAll('dialog')].find(
          candidate => candidate.getAttribute('aria-label') === label,
        );
        return (
          dialog?.matches(':popover-open') === true &&
          dialog.className !== openClass
        );
      },
      {label: target.innerLabel, openClass: innerOpenClass},
      {timeout: 5000},
    );

    const outerOpenClass = await outer.getAttribute('class');
    await page.keyboard.press('Escape');
    await page.evaluate(
      () => new Promise(resolve => requestAnimationFrame(() => resolve(true))),
    );
    // A lower drawer that incorrectly handled the second Escape loses its open
    // transform class immediately, independent of how long a busy runner delays
    // the transition timer. This avoids a wall-clock-based flaky assertion.
    stackedExitOwned = (await outer.getAttribute('class')) === outerOpenClass;

    await page.waitForFunction(
      ({label, selector}) => {
        const dialog = [...document.querySelectorAll('dialog')].find(
          candidate => candidate.getAttribute('aria-label') === label,
        );
        return dialog != null && !dialog.matches(selector);
      },
      {label: target.innerLabel, selector: hostSelector},
      {timeout: 5000},
    );
    if (stackedExitOwned) {
      await page.keyboard.press('Escape');
    }
  } else {
    await page.keyboard.press('Escape');
  }

  const expectedExits = target.stackedExit ? 2 : 1;
  await page.waitForFunction(
    count => window.__closeDisplays.length >= count,
    expectedExits,
    {timeout: 5000},
  );
  await page.waitForFunction(
    selector => document.querySelectorAll(selector).length === 0,
    hostSelector,
    {timeout: 5000},
  );
  if (target.mustBeHiddenAfterClose) {
    await page.waitForFunction(
      count => window.__postCloseFrames.length >= count,
      expectedExits,
      {timeout: 5000},
    );
  }

  return page.evaluate(
    ({expectedExits, stackedExitOwned}) => {
      const active = document.activeElement;
      return {
        closeDisplays: window.__closeDisplays,
        postCloseFrames: window.__postCloseFrames,
        closeEvents: window.__dialogCloseEvents,
        expectedExits,
        stackedExitOwned,
        finalFocus:
          active instanceof HTMLElement
            ? (
                active.getAttribute('aria-label') ||
                active.textContent ||
                active.tagName
              ).trim()
            : 'none',
      };
    },
    {expectedExits, stackedExitOwned},
  );
}

async function run() {
  const dir = path.resolve(process.cwd(), storybookDir);
  if (!fs.existsSync(dir)) {
    console.error(`Storybook build not found at ${dir}`);
    return 1;
  }

  const server = await createServer(dir, port);
  const browser = await playwright[browserName].launch();
  let failures = 0;

  try {
    const context = await browser.newContext({
      viewport: {width: 430, height: 860},
    });

    for (const target of TARGETS) {
      const page = await context.newPage();
      const name = `${target.component} [${browserName}]`;
      try {
        const {
          closeDisplays,
          postCloseFrames,
          closeEvents,
          expectedExits,
          stackedExitOwned,
          finalFocus,
        } = await probe(page, target);
        const hiddenAtExit = closeDisplays.filter(d => d === 'none');
        const paintedAfterExit = target.mustBeHiddenAfterClose
          ? postCloseFrames.filter(frame => frame.display !== 'none')
          : [];
        const missingCloseEvent =
          target.mustDispatchClose && closeEvents < expectedExits;
        const wrongFinalFocus =
          target.finalFocus != null && finalFocus !== target.finalFocus;

        if (!stackedExitOwned) {
          failures++;
          console.error(
            `✗ ${name}: a second Escape reached the lower drawer during the top drawer's exit`,
          );
        } else if (hiddenAtExit.length > 0) {
          failures++;
          console.error(
            `✗ ${name}: native host exited at display: none (${closeDisplays.join(', ')})`,
          );
        } else if (paintedAfterExit.length > 0) {
          failures++;
          console.error(
            `✗ ${name}: painted after native host exit — ${JSON.stringify(paintedAfterExit)}`,
          );
        } else if (missingCloseEvent) {
          failures++;
          console.error(
            `✗ ${name}: emitted ${closeEvents}/${expectedExits} dialog close event(s)`,
          );
        } else if (wrongFinalFocus) {
          failures++;
          console.error(
            `✗ ${name}: focus rests on "${finalFocus}" after exit, expected "${target.finalFocus}"`,
          );
        } else {
          const postClose = target.mustBeHiddenAfterClose
            ? '; hidden before the next paint'
            : '';
          const closeEvent = target.mustDispatchClose
            ? `; ${closeEvents} close event(s)`
            : '';
          const focus =
            target.finalFocus != null ? `; focus on "${finalFocus}"` : '';
          console.log(
            `✓ ${name}: native host exited at display: ${closeDisplays.join(', ')}${postClose}${closeEvent}${focus}`,
          );
        }
      } catch (e) {
        failures++;
        console.error(`✗ ${name}: probe failed — ${e.message}`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  if (failures > 0) {
    console.error(
      `\nFailing: ${failures} native-dialog host ordering check(s) in ${browserName} — see #4290 and #5549.`,
    );
    return 1;
  }
  console.log(
    `\nAll native-dialog host ordering checks passed in ${browserName}.`,
  );
  return 0;
}

run()
  .then(code => {
    process.exitCode = code;
  })
  .catch(e => {
    console.error('Native-dialog host guard failed:', e);
    process.exit(1);
  });
