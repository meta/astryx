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
import {renderPage} from '../../packages/cli/foundation/render/render-page.mjs';
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

// A page that routes on its address, as an app with in-page navigation does:
// its links name a place, and the page shows the one the address names. One
// link it cancels in its own handler, one it handles itself from a capture
// listener on the document (it opens its own panel), and one sits in a
// clickable card that stops the click.
const ROUTES = `import {useEffect, useState} from 'react';
import {Heading} from '@astryxdesign/core/Heading';

const titles = {home: 'Home page', members: 'Members page', settings: 'Settings page'};
// The page's own module handles one link while it loads, before it mounts: it
// cancels it and opens its own panel.
if (typeof document !== 'undefined') {
  document.addEventListener('click', e => {
    if (!(e.target instanceof Element) || !e.target.closest('a[href="#faq"]')) return;
    e.preventDefault();
    window.dispatchEvent(new Event('faq'));
  }, true);
  // A module the page loads with import() handles another the same way.
  import('./routes-lazy');
}
export default function Page() {
  const [place, setPlace] = useState('home');
  const [panel, setPanel] = useState('No panel');
  useEffect(() => {
    const follow = () => setPlace(window.location.hash.slice(1) || 'home');
    const own = e => {
      if (!(e.target instanceof Element) || !e.target.closest('a[href="#help"]')) return;
      e.preventDefault();
      setPanel('Help panel open');
    };
    const faq = () => setPanel('FAQ panel open');
    const lazy = () => setPanel('Lazy panel open');
    follow();
    window.addEventListener('hashchange', follow);
    window.addEventListener('faq', faq);
    window.addEventListener('lazy', lazy);
    document.addEventListener('click', own, true);
    return () => {
      window.removeEventListener('hashchange', follow);
      window.removeEventListener('faq', faq);
      window.removeEventListener('lazy', lazy);
      document.removeEventListener('click', own, true);
    };
  }, []);
  return (
    <main>
      <nav>
        <a href="#home">Home</a> <a href="#members">Members</a> <a href="#settings">Settings</a>{' '}
        <a href="#members" onClick={e => e.preventDefault()}>Members, cancelled</a> <a href="#help">Help</a>{' '}
        <a href="#faq">FAQ</a> <a href="#lazy">Lazy</a>
      </nav>
      <div onClick={e => e.stopPropagation()}>
        <a href="#settings">Settings, in a card</a>
      </div>
      <Heading level={1}>{titles[place] ?? 'Home page'}</Heading>
      <p data-probe="panel">{panel}</p>
    </main>
  );
}
`;

// The module the routes page loads with import(): it cancels its own link and
// opens the page's panel.
const ROUTES_LAZY = `document.addEventListener('click', e => {
  if (!(e.target instanceof Element) || !e.target.closest('a[href="#lazy"]')) return;
  e.preventDefault();
  window.dispatchEvent(new Event('lazy'));
}, true);
`;

// A page that registers its own click and key handlers the ways pages do: one
// handler added while the module loads and again once mounted, which a browser
// registers once, and one added for click and keydown that removes itself from
// both on its first call.
const HANDLERS = `import {useEffect, useState} from 'react';

let clicks = 0;
let unlocks = 0;
const show = () => window.dispatchEvent(new Event('probe'));
const count = () => {
  clicks += 1;
  show();
};
const unlock = () => {
  unlocks += 1;
  document.removeEventListener('click', unlock);
  document.removeEventListener('keydown', unlock);
  show();
};
if (typeof document !== 'undefined') {
  document.addEventListener('click', count);
  document.addEventListener('click', unlock);
  document.addEventListener('keydown', unlock);
}
export default function Page() {
  const [, setShown] = useState(0);
  useEffect(() => {
    document.addEventListener('click', count);
    const on = () => setShown(n => n + 1);
    window.addEventListener('probe', on);
    return () => window.removeEventListener('probe', on);
  }, []);
  return (
    <main>
      <button type="button">Tap</button>
      <p data-probe="counts">{\`clicks \${clicks} unlocks \${unlocks}\`}</p>
    </main>
  );
}
import '@astryxdesign/core/astryx.css';
`;

// What a viewer may do in the frame it shows a file in: cancel every link to a
// place in the page on its way down and scroll to the place itself, leaving
// the frame's address as it is. One does it from the document, one from the
// window, and one adds its document listener only once the frame's document
// has loaded, as an artifact viewer's frame script does.
const hostScrolls = (target, whenLoaded = false) => {
  const listen = `${target}.addEventListener('click', function (event) {
  var link = event.target instanceof Element ? event.target.closest('a[href^="#"]') : null;
  if (!link) return;
  event.preventDefault();
  var place = document.getElementById(link.getAttribute('href').slice(1));
  if (place) place.scrollIntoView({block: 'start'});
}, true);`;
  return whenLoaded
    ? `<script>document.addEventListener('DOMContentLoaded', function () { ${listen} });</script>`
    : `<script>${listen}</script>`;
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
    /** @type {string} */
    let routes;
    /** @type {string} */
    let handlers;

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
      fs.writeFileSync(path.join(home, 'routes.tsx'), ROUTES);
      fs.writeFileSync(path.join(home, 'routes-lazy.ts'), ROUTES_LAZY);
      fs.writeFileSync(path.join(home, 'handlers.tsx'), HANDLERS);
      await render('handlers.tsx', {cwd: home, out: 'handlers.html'});
      handlers = fs.readFileSync(path.join(home, 'handlers.html'), 'utf8');
      await render('routes.tsx', {cwd: home, out: 'routes.html'});
      routes = fs.readFileSync(path.join(home, 'routes.html'), 'utf8');

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

    it("moves to the place a link names in a viewer frame, also when the viewer cancels the link itself, and keeps the page's own way", async () => {
      const context = await browser.newContext({
        viewport: {width: 1024, height: 900},
      });
      await context.route('**/*', (/** @type {any} */ route) =>
        route.request().url().startsWith('about:')
          ? route.continue()
          : route.abort(),
      );
      try {
        for (const host of [
          '',
          hostScrolls('document'),
          hostScrolls('window'),
          hostScrolls('document', true),
        ]) {
          const viewer = await context.newPage();
          /** @type {string[]} */
          const errors = [];
          viewer.on('pageerror', (/** @type {Error} */ e) =>
            errors.push(e.message),
          );
          const framed = routes.replace(
            '<head>',
            `<head><meta http-equiv="Content-Security-Policy" content="${VIEWER_POLICY}">${host}`,
          );
          await viewer.setContent(
            `<!doctype html><body style="margin:0"><iframe sandbox="allow-scripts" style="border:0;width:1024px;height:900px" srcdoc="${framed
              .replace(/&/g, '&amp;')
              .replace(/"/g, '&quot;')}"></iframe></body>`,
          );
          const scope = viewer.frameLocator('iframe');
          const heading = scope.getByRole('heading', {level: 1});
          await heading.getByText('Home page').waitFor();
          const shown = [];
          const frame = await (await viewer.$('iframe')).contentFrame();
          for (const name of [
            'Members',
            'Settings',
            'Members, cancelled',
            'Help',
            'Home',
            'Settings, in a card',
            'FAQ',
            'Lazy',
          ]) {
            await scope.getByRole('link', {name, exact: true}).click();
            await new Promise(resolve => setTimeout(resolve, 200));
            shown.push(
              await frame.evaluate(
                () =>
                  `${document.querySelector('h1').textContent} | ${document.querySelector('[data-probe="panel"]').textContent} | ${location.hash}`,
              ),
            );
          }
          // A link the page cancels or handles itself, also from a listener its
          // module adds while it loads, keeps the page where it is; a link in a
          // card that stops the click still moves.
          const where = !host
            ? 'plain frame'
            : host.includes('DOMContentLoaded')
              ? 'viewer cancels on the document once it has loaded'
              : `viewer cancels on the ${host.includes('<script>document.') ? 'document' : 'window'}`;
          expect(shown, where).toEqual([
            'Members page | No panel | #members',
            'Settings page | No panel | #settings',
            'Settings page | No panel | #settings',
            'Settings page | Help panel open | #settings',
            'Home page | Help panel open | #home',
            'Settings page | Help panel open | #settings',
            'Settings page | FAQ panel open | #settings',
            'Settings page | Lazy panel open | #settings',
          ]);
          expect(errors).toEqual([]);
          await viewer.close();
        }
      } finally {
        await context.close();
      }
    }, 120_000);

    it("registers the page's own click and key handlers as a browser tab does", async () => {
      const context = await browser.newContext({
        viewport: {width: 1024, height: 900},
      });
      await context.route('**/*', (/** @type {any} */ route) =>
        route.request().url().startsWith('about:')
          ? route.continue()
          : route.abort(),
      );
      try {
        const viewer = await context.newPage();
        const framed = handlers.replace(
          '<head>',
          `<head><meta http-equiv="Content-Security-Policy" content="${VIEWER_POLICY}">`,
        );
        await viewer.setContent(
          `<!doctype html><body style="margin:0"><iframe sandbox="allow-scripts" style="border:0;width:1024px;height:900px" srcdoc="${framed
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')}"></iframe></body>`,
        );
        const scope = viewer.frameLocator('iframe');
        const counts = scope.locator('[data-probe="counts"]');
        await counts.getByText('clicks 0 unlocks 0').waitFor();
        // Two keys: the unlock handler runs once and removes itself from both.
        await viewer.focus('iframe');
        await viewer.keyboard.press('KeyA');
        await viewer.keyboard.press('KeyB');
        await new Promise(resolve => setTimeout(resolve, 200));
        expect(await counts.textContent()).toBe('clicks 0 unlocks 1');
        // One click: the handler added twice counts once.
        await scope.getByRole('button', {name: 'Tap'}).click();
        await new Promise(resolve => setTimeout(resolve, 200));
        expect(await counts.textContent()).toBe('clicks 1 unlocks 1');
      } finally {
        await context.close();
      }
    }, 120_000);

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

/** A page that shows images from the web, some only after a click. */
const REMOTE_PAGE = `import {useState} from 'react';
import {Button} from '@astryxdesign/core/Button';

const stripe = 'https://images.example.com/stripe.png';
const hero = 'https://images.example.com/hero.png';
const team = {logo: 'https://images.example.com/40'};

export default function Page() {
  const [open, setOpen] = useState(false);
  return (
    <main>
      <div data-probe="stripe" style={{backgroundImage: \`url(\${stripe})\`, width: 20, height: 20}} />
      <Button label="Show" onClick={() => setOpen(true)} />
      {open && (
        <section>
          <a href={hero}><img src={hero} alt="Hero" width={10} height={10} /></a>
          <p data-probe="text">{hero}</p>
          <img src={\`\${team.logo}?u=alex\`} alt="Alex" width={10} height={10} />
          <div data-probe="later" style={{backgroundImage: \`url(\${hero})\`, width: 20, height: 20}} />
        </section>
      )}
    </main>
  );
}
`;

/** One pixel, the image every remote address answers with. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

describe.runIf(BROWSER_STEP)(
  'a rendered page with images from the web, in a viewer that blocks the network',
  () => {
    /** @type {string} */
    let home;
    /** @type {any} */
    let browser;

    beforeAll(async () => {
      home = makeLinkedFixture('astryx-render-remote-browser-', [
        '@astryxdesign',
        '@stylexjs',
        'react',
        'react-dom',
      ]);
      browser = await chromium.launch();
    }, 120_000);

    afterAll(async () => {
      await browser?.close();
      if (home) removeLinkedFixture(home);
    });

    it('draws each carried image from its data once the script runs, and keeps links, text and other queries as written', async () => {
      const file = path.join(home, 'page.tsx');
      fs.writeFileSync(file, REMOTE_PAGE);
      const page = await renderPage(file, {
        cwd: home,
        remoteImages: {
          fetch: async () =>
            new Response(PIXEL, {headers: {'content-type': 'image/png'}}),
        },
      });
      expect(page.remoteImages?.fetched).toEqual(
        expect.arrayContaining([
          'https://images.example.com/stripe.png',
          'https://images.example.com/hero.png',
          'https://images.example.com/40',
        ]),
      );
      const context = await browser.newContext({
        viewport: {width: 1024, height: 900},
      });
      /** @type {string[]} */
      const asked = [];
      await context.route('**/*', (/** @type {any} */ route) => {
        asked.push(route.request().url());
        return route.request().url().startsWith('about:')
          ? route.continue()
          : route.abort();
      });
      try {
        const viewer = await context.newPage();
        const framed = page.html.replace(
          '<head>',
          `<head><meta http-equiv="Content-Security-Policy" content="${VIEWER_POLICY}">`,
        );
        await viewer.setContent(
          `<!doctype html><body style="margin:0"><iframe sandbox="allow-scripts" style="border:0;width:1024px;height:900px" srcdoc="${framed
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')}"></iframe></body>`,
        );
        const frame = viewer
          .frames()
          .find((/** @type {any} */ f) => f !== viewer.mainFrame());
        const scope = viewer.frameLocator('iframe');
        // The click works once the script has drawn the page.
        await expect
          .poll(
            async () => {
              await scope.getByRole('button', {name: 'Show'}).click();
              return scope.getByRole('img', {name: 'Hero'}).count();
            },
            {timeout: 20_000},
          )
          .toBe(1);
        await new Promise(resolve => setTimeout(resolve, 200));
        const seen = await frame.evaluate(() => {
          const hero = /** @type {HTMLImageElement} */ (
            document.querySelector('img[alt="Hero"]')
          );
          const alex = /** @type {HTMLImageElement} */ (
            document.querySelector('img[alt="Alex"]')
          );
          const background = (/** @type {string} */ probe) =>
            getComputedStyle(
              /** @type {Element} */ (
                document.querySelector(`[data-probe="${probe}"]`)
              ),
            ).backgroundImage;
          return {
            heroSrc: hero.getAttribute('src'),
            heroDrawn: hero.complete && hero.naturalWidth > 0,
            alexSrc: alex.getAttribute('src'),
            link: document.querySelector('a')?.getAttribute('href'),
            text: document.querySelector('[data-probe="text"]')?.textContent,
            stripe: background('stripe'),
            later: background('later'),
          };
        });
        expect(seen.heroSrc?.startsWith('data:image/png;base64,')).toBe(true);
        expect(seen.heroDrawn).toBe(true);
        expect(seen.stripe).toContain('data:image/png;base64,');
        expect(seen.later).toContain('data:image/png;base64,');
        expect(seen.link).toBe('https://images.example.com/hero.png');
        expect(seen.text).toBe('https://images.example.com/hero.png');
        // Another query can name another image: it keeps the page's address.
        expect(seen.alexSrc).toBe('https://images.example.com/40?u=alex');
        // Opened with no viewer policy, every image the page asks for
        // reaches the network layer: an address with another query does,
        // and no carried address does.
        const bare = await context.newPage();
        asked.length = 0;
        await bare.setContent(page.html);
        await expect
          .poll(
            async () => {
              await bare.getByRole('button', {name: 'Show'}).click();
              return bare.getByRole('img', {name: 'Hero'}).count();
            },
            {timeout: 20_000},
          )
          .toBe(1);
        await new Promise(resolve => setTimeout(resolve, 500));
        expect(asked).toContain('https://images.example.com/40?u=alex');
        for (const url of [
          'https://images.example.com/stripe.png',
          'https://images.example.com/hero.png',
          'https://images.example.com/40',
        ])
          expect(asked).not.toContain(url);
      } finally {
        await context.close();
      }
    }, 300_000);
  },
);
