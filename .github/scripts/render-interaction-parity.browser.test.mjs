// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A rendered page works as the app works. One page with tabs, a
 * popover, a menu, a dialog and a form is built into a Vite app (the way a
 * builder's app is built, with the Vite plugin from @astryxdesign/build) and
 * rendered to one file with `astryx experimental export`. Chromium runs the
 * same clicks, keys and typing in both, the file inside a sandboxed frame
 * under a strict content security policy, as an artifact viewer shows it.
 * After each step the two pages must show the same thing, and the app must
 * show what the step does, so a page that works in neither cannot pass.
 *
 * CI runs it in node-browser-contracts' "Render interaction parity browser
 * case" step, after the Chromium install and the build package's build.
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {render} from '../../packages/cli/api/render/render.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../packages/cli/test-utils/linked-fixture.mjs';

const BROWSER_STEP = process.env.ASTRYX_RENDER_PARITY_BROWSER === '1';
const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const {chromium} = createRequire(import.meta.url)('playwright');

const PAGE = `import {useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog';
import {DropdownMenu} from '@astryxdesign/core/DropdownMenu';
import {Popover} from '@astryxdesign/core/Popover';
import {Switch} from '@astryxdesign/core/Switch';
import {Tab, TabList} from '@astryxdesign/core/TabList';
import {TextInput} from '@astryxdesign/core/TextInput';

export default function Page() {
  const [tab, setTab] = useState('overview');
  const [picked, setPicked] = useState('none');
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [notify, setNotify] = useState(false);
  const [sent, setSent] = useState('nothing');
  return (
    <main>
      <TabList value={tab} onChange={setTab} role="tablist">
        <Tab value="overview" label="Overview" />
        <Tab value="details" label="Details" />
      </TabList>
      <p data-probe="panel">{tab === 'overview' ? 'Overview panel' : 'Details panel'}</p>
      <Popover label="Help" content={<p data-probe="popover">Popover body</p>}>
        <Button label="Help" />
      </Popover>
      <DropdownMenu
        button={{label: 'Actions'}}
        items={[
          {label: 'Archive', onClick: () => setPicked('Archive')},
          {label: 'Delete', onClick: () => setPicked('Delete')},
        ]}
      />
      <p data-probe="picked">Picked: {picked}</p>
      <Button label="Open dialog" onClick={() => setIsOpen(true)} />
      <Dialog isOpen={isOpen} onOpenChange={setIsOpen}>
        <DialogHeader title="Settings" onOpenChange={setIsOpen} />
        <p data-probe="dialog">Dialog body</p>
      </Dialog>
      <form
        onSubmit={event => {
          event.preventDefault();
          setSent(name + (notify ? ', notify' : ''));
        }}>
        <TextInput label="Name" value={name} onChange={setName} />
        <Switch label="Notify" value={notify} onChange={setNotify} />
        <Button label="Send" type="submit" />
      </form>
      <p data-probe="sent">Sent: {sent}</p>
      <a href="https://example.com/help">Help center</a>
    </main>
  );
}
`;

/** The app's entry: the page, as a builder's app mounts it. */
const MAIN = `import '@astryxdesign/core/reset.css';
import {createElement} from 'react';
import {createRoot} from 'react-dom/client';
import Page from './page';
createRoot(document.getElementById('root')).render(createElement(Page));
`;

const INDEX = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body><div id="root"></div><script type="module" src="/main.tsx"></script></body></html>
`;

/** The policy an artifact viewer gives the frame that shows one HTML file. */
const VIEWER_POLICY =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data: blob:";

/** Content types for the files a Vite build writes. */
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
};

/**
 * The steps a reader takes, and what each shows in the app. Each step names
 * the control by its role and accessible name.
 * @type {{do: string, role?: string, name?: string, key?: string, text?: string, shows: Record<string, unknown>}[]}
 */
const STEPS = [
  {
    do: 'click',
    role: 'tab',
    name: 'Details',
    shows: {tab: 'Details', panel: 'Details panel'},
  },
  {do: 'click', role: 'button', name: 'Help', shows: {popover: 'Popover body'}},
  {do: 'press', key: 'Escape', shows: {popover: null}},
  {
    do: 'click',
    role: 'button',
    name: 'Actions',
    shows: {menu: ['Archive', 'Delete']},
  },
  {
    do: 'click',
    role: 'menuitem',
    name: 'Delete',
    shows: {picked: 'Picked: Delete', menu: []},
  },
  {
    do: 'click',
    role: 'button',
    name: 'Open dialog',
    shows: {dialog: 'Dialog body'},
  },
  {do: 'press', key: 'Escape', shows: {dialog: null}},
  {
    do: 'fill',
    role: 'textbox',
    name: 'Name',
    text: 'Ada',
    shows: {name: 'Ada'},
  },
  {do: 'press', key: 'Enter', shows: {sent: 'Sent: Ada'}},
  {do: 'click', role: 'switch', name: 'Notify', shows: {notify: true}},
  {
    do: 'click',
    role: 'button',
    name: 'Send',
    shows: {sent: 'Sent: Ada, notify'},
  },
];

/**
 * What a reader sees (text as rendered, as `innerText` gives it): each probe's text when it shows, the selected tab, the
 * menu items that show, the name typed and the switch. It runs in the page.
 */
function seen() {
  const {document, getComputedStyle} = /** @type {any} */ (globalThis);
  /** @param {any} el */
  const shows = el =>
    el != null &&
    el.getClientRects().length > 0 &&
    getComputedStyle(el).visibility !== 'hidden';
  /** @param {string} name */
  const probe = name => {
    const el = document.querySelector(`[data-probe="${name}"]`);
    return shows(el) ? el.innerText.trim() : null;
  };
  return {
    tab:
      document
        .querySelector('[role="tab"][aria-selected="true"]')
        ?.innerText.trim() ?? null,
    panel: probe('panel'),
    popover: probe('popover'),
    menu: [...document.querySelectorAll('[role="menuitem"]')]
      .filter(shows)
      .map(el => el.innerText.trim()),
    picked: probe('picked'),
    dialog: probe('dialog'),
    name: document.querySelector('input[type="text"]')?.value ?? null,
    notify: document.querySelector('[role="switch"]')?.checked ?? null,
    sent: probe('sent'),
  };
}

/** @param {string} dir */
function serve(dir) {
  return new Promise(resolve => {
    const server = http.createServer((request, response) => {
      const url = decodeURIComponent((request.url ?? '/').split(/[?#]/)[0]);
      const file = path.join(dir, url === '/' ? 'index.html' : url);
      if (
        !file.startsWith(dir) ||
        !fs.existsSync(file) ||
        fs.statSync(file).isDirectory()
      ) {
        response.statusCode = 404;
        response.end();
        return;
      }
      response.setHeader(
        'content-type',
        TYPES[/** @type {keyof typeof TYPES} */ (path.extname(file))] ??
          'application/octet-stream',
      );
      fs.createReadStream(file).pipe(response);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

/**
 * Take every step in one page or frame, and say what shows after each.
 * @param {any} scope where the controls are: a page, or a frame locator
 * @param {any} frame where `seen` runs: a page, or a frame
 * @param {any} keyboard the page's keyboard
 */
async function walk(scope, frame, keyboard) {
  /** @type {unknown[]} */
  const after = [await frame.evaluate(seen)];
  for (const step of STEPS) {
    if (step.do === 'press') {
      await keyboard.press(/** @type {string} */ (step.key));
    } else {
      const control = scope.getByRole(step.role, {
        name: step.name,
        exact: true,
      });
      if (step.do === 'fill') await control.fill(step.text);
      else await control.click();
    }
    // The step's effects, and any open or close transition, run first.
    await new Promise(resolve => setTimeout(resolve, 200));
    after.push(await frame.evaluate(seen));
  }
  return after;
}

describe.runIf(BROWSER_STEP)(
  'a rendered page, against the same page as an app',
  () => {
    /** @type {string} */
    let home;
    /** @type {any} */
    let server;
    /** @type {any} */
    let browser;
    /** @type {string} */
    let file;

    beforeAll(async () => {
      home = makeLinkedFixture('astryx-render-parity-', [
        '@astryxdesign',
        '@stylexjs',
        'react',
        'react-dom',
      ]);
      fs.writeFileSync(path.join(home, 'page.tsx'), PAGE);
      fs.writeFileSync(path.join(home, 'index.html'), INDEX);
      fs.writeFileSync(path.join(home, 'main.tsx'), MAIN);

      // .github/scripts is outside the workspace, so a bare specifier does not
      // resolve the Vite plugin here. It ships as a build artifact.
      const pluginPath = path.join(REPO_ROOT, 'packages/build/dist/vite.mjs');
      if (!fs.existsSync(pluginPath))
        throw new Error(
          `${pluginPath} is missing: run \`pnpm -F @astryxdesign/build build\` first.`,
        );
      const {astryxStylex} = await import(pathToFileURL(pluginPath).href);
      const {build} = await import('vite');
      const react = (await import('@vitejs/plugin-react')).default;
      const outDir = path.join(
        path.dirname(home),
        `${path.basename(home)}-dist`,
      );
      await build({
        root: home,
        logLevel: 'error',
        build: {outDir, emptyOutDir: true, chunkSizeWarningLimit: 100_000},
        plugins: [
          react(),
          ...astryxStylex({dev: false, rootDir: path.dirname(home)}),
        ],
      });
      server = await serve(outDir);

      await render('page.tsx', {cwd: home, out: 'page.html'});
      file = fs.readFileSync(path.join(home, 'page.html'), 'utf8');

      const executablePath = chromium.executablePath();
      if (!fs.existsSync(executablePath))
        throw new Error(
          `Playwright's Chromium is not installed at ${executablePath}: run npx playwright install chromium`,
        );
      browser = await chromium.launch();
    }, 600_000);

    afterAll(async () => {
      await browser?.close();
      server?.close();
      if (home) removeLinkedFixture(home);
    });

    it('shows the same as the app after every click, key and keystroke, with no error', async () => {
      const origin = `http://127.0.0.1:${server.address().port}`;
      const context = await browser.newContext({
        viewport: {width: 1024, height: 900},
      });
      // Nothing may leave the local server: no web font, no remote image.
      await context.route('**/*', (/** @type {any} */ route) =>
        route.request().url().startsWith(origin) ||
        route.request().url().startsWith('about:')
          ? route.continue()
          : route.abort(),
      );
      /** @type {Record<string, string[]>} */
      const errors = {app: [], file: []};
      try {
        const app = await context.newPage();
        app.on('pageerror', (/** @type {Error} */ e) =>
          errors.app.push(e.message),
        );
        app.on('console', (/** @type {any} */ m) => {
          if (m.type() === 'error') errors.app.push(m.text());
        });
        await app.goto(origin);
        await app.getByRole('tab', {name: 'Details'}).waitFor();
        const inApp = await walk(app, app, app.keyboard);

        // The file as an artifact viewer shows it: in a frame that allows
        // scripts but has an opaque origin, under the viewer's policy.
        const viewer = await context.newPage();
        viewer.on('pageerror', (/** @type {Error} */ e) =>
          errors.file.push(e.message),
        );
        viewer.on('console', (/** @type {any} */ m) => {
          if (m.type() === 'error') errors.file.push(m.text());
        });
        const framed = file.replace(
          '<head>',
          `<head><meta http-equiv="Content-Security-Policy" content="${VIEWER_POLICY}">`,
        );
        await viewer.setContent(
          `<!doctype html><body style="margin:0"><iframe sandbox="allow-scripts" style="border:0;width:1024px;height:900px" srcdoc="${framed
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')}"></iframe></body>`,
        );
        const frame = await (await viewer.$('iframe')).contentFrame();
        const scope = viewer.frameLocator('iframe');
        await scope.getByRole('tab', {name: 'Details'}).waitFor();
        const inFile = await walk(scope, frame, viewer.keyboard);

        // Each step does in the app what it says, so a check that passes on
        // two broken pages cannot pass.
        STEPS.forEach((step, i) => {
          expect(
            inApp[i + 1],
            `${step.do} ${step.name ?? step.key}`,
          ).toMatchObject(step.shows);
        });
        expect(inFile).toEqual(inApp);
        expect(errors).toEqual({app: [], file: []});
      } finally {
        await context.close();
      }
    }, 300_000);

    it('opens a link out of the file in a new tab, leaving the page in its frame', async () => {
      expect(file).toContain(
        '<a href="https://example.com/help" target="_blank" rel="noopener noreferrer">Help center</a>',
      );
      const context = await browser.newContext({
        viewport: {width: 1024, height: 900},
      });
      /** @type {string[]} */
      const asked = [];
      // Nothing may leave the machine; the request a new tab makes is noted.
      await context.route('**/*', (/** @type {any} */ route) => {
        asked.push(route.request().url());
        return route.request().url().startsWith('about:')
          ? route.continue()
          : route.abort();
      });
      try {
        const viewer = await context.newPage();
        const framed = file.replace(
          '<head>',
          `<head><meta http-equiv="Content-Security-Policy" content="${VIEWER_POLICY}">`,
        );
        // A viewer that lets a page open a tab, as the link needs.
        await viewer.setContent(
          `<!doctype html><body style="margin:0"><iframe sandbox="allow-scripts allow-popups" style="border:0;width:1024px;height:900px" srcdoc="${framed
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')}"></iframe></body>`,
        );
        const scope = viewer.frameLocator('iframe');
        await scope.getByRole('tab', {name: 'Details'}).waitFor();
        const tab = context.waitForEvent('page');
        await scope.getByRole('link', {name: 'Help center'}).click();
        await tab;
        await new Promise(resolve => setTimeout(resolve, 300));
        expect(asked).toContain('https://example.com/help');
        // The frame still shows the page.
        await scope.getByRole('tab', {name: 'Details'}).waitFor();
      } finally {
        await context.close();
      }
    }, 120_000);
  },
);
