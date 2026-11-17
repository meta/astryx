// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for the page's script in a rendered file: every render carries
 * the page's own script, which draws the live page over its markup in a
 * browser, and the file stays one self-describing, reversible file. Also how
 * the render refuses when esbuild, the CLI's dependency that builds the
 * script, is missing.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {JSDOM, VirtualConsole} from 'jsdom';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {render} from './render.mjs';
import {doctor} from '../doctor/doctor.mjs';
import {
  readSourceBlock,
  renderedMarkupOf,
  SOURCE_TYPE,
} from '../../foundation/render/source-block.mjs';
import {ROOT_ID, scriptSafe} from '../../foundation/render/client-bundle.mjs';
import {
  ESBUILD_MISSING,
  findEsbuild,
} from '../../foundation/render/esbuild-dependency.mjs';
import {RenderError, renderPage} from '../../foundation/render/render-page.mjs';
import {cliVersion} from '../../foundation/integrations/cli-peer-version.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';

/** @type {string} */
let dir;

/** @param {string} name @param {string | Buffer} content */
const put = (name, content) => {
  const file = path.join(dir, name);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, content);
  return file;
};

/** @param {string} name */
const read = name => fs.readFileSync(path.join(dir, name), 'utf8');

/** @param {() => Promise<unknown>} fn */
async function errorOf(fn) {
  try {
    await fn();
  } catch (e) {
    return /** @type {any} */ (e);
  }
  return null;
}

const COUNTER = `import {useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Heading} from '@astryxdesign/core/Heading';
import {Text} from '@astryxdesign/core/Text';
import {label} from './label';

export default function Counter() {
  const [count, setCount] = useState(0);
  return (
    <main>
      <Heading level={1}>Counter</Heading>
      <Text>{label(count)}</Text>
      <Button label="Add one" onClick={() => setCount(c => c + 1)} />
    </main>
  );
}
`;

const LABEL = `export const label = (n: number): string => \`Clicked \${n} times\`;\n`;

/** The page's script: the last script element, after the embedded source. @param {string} file */
const scriptOf = file =>
  file.slice(
    file.lastIndexOf('-->\n<script>') + '-->\n<script>'.length,
    file.lastIndexOf('</script>'),
  );

/** @type {any} */
let result;
/** @type {string} */
let html;

beforeAll(async () => {
  dir = makeLinkedFixture('astryx-render-interactive-', [
    '@astryxdesign',
    '@stylexjs',
    'react',
    'react-dom',
    'recharts',
  ]);
  put('src/counter.tsx', COUNTER);
  put('src/label.ts', LABEL);
  result = await render('src/counter.tsx', {cwd: dir, out: 'counter.html'});
  html = read('counter.html');
}, 120_000);

afterAll(() => {
  removeLinkedFixture(dir);
});

describe("a render, which carries the page's script", () => {
  it('reports the script it carried', () => {
    expect(result.type).toBe('render.page');
    expect(result.data.scriptBytes).toBeGreaterThan(10_000);
    expect(result.data.scriptModules).toBeGreaterThan(3);
    expect(result.data.bytes).toBe(Buffer.byteLength(html));
  });

  it('puts the markup in the element the script draws into, and the script after the embedded source', () => {
    expect(html).toContain(`<body><div id="${ROOT_ID}">`);
    expect(html).toContain(`#${ROOT_ID}{display:contents}`);
    const block = html.indexOf(`<script type="${SOURCE_TYPE}">`);
    const script = html.lastIndexOf('-->\n<script>');
    expect(block).toBeGreaterThan(0);
    expect(script).toBeGreaterThan(block);
    expect(html.endsWith('</script>\n</body></html>\n')).toBe(true);
    // The markup a reverse compares is the element and the page in it.
    expect(renderedMarkupOf(html)?.startsWith(`<div id="${ROOT_ID}">`)).toBe(
      true,
    );
  });

  it("says in its note that it runs the page's own script, and how to render it again", () => {
    const note = html.slice(html.indexOf('<!--'), html.indexOf('-->') + 3);
    expect(note).toContain(
      "The page's own script, at the end of the file, draws the page when it",
    );
    expect(note).not.toContain('It runs no script');
    expect(note).toMatch(
      /experimental render counter-restored\/counter\.tsx --out counter\.html\n/,
    );
    expect(note).toContain("before the page's script");
  });

  it('holds no path from this machine and nothing that ends its script early', () => {
    expect(html).not.toContain(dir);
    expect(html).not.toContain(os.homedir());
    const script = scriptOf(html);
    expect(script).not.toMatch(/<\/script/i);
    expect(script).not.toContain('<!--');
    expect(script).not.toContain('x-astryx-source');
    expect(scriptSafe('"</script><!--x-astryx-source"')).toBe(
      '"\\x3C/script>\\x3C!--x-astryx\\x2dsource"',
    );
  });

  it('writes the same bytes when rendered again', async () => {
    await render('src/counter.tsx', {cwd: dir, out: 'counter.html'});
    expect(read('counter.html')).toBe(html);
  }, 120_000);

  it('gives the page back exactly, with the command to render it again', async () => {
    const back = /** @type {any} */ (
      await render('counter.html', {
        cwd: dir,
        reverse: true,
        out: 'back/counter.tsx',
      })
    );
    expect(back.data).toMatchObject({
      mode: 'embedded',
      exact: true,
      edited: false,
    });
    expect(back.data.interactive).toBeUndefined();
    expect(read('back/counter.tsx')).toBe(COUNTER);
    expect(read('back/label.ts')).toBe(LABEL);
    const {stdout, status} = await runCli(
      [
        'experimental',
        'render',
        '--reverse',
        'counter.html',
        '--out',
        'back-2/counter.tsx',
      ],
      dir,
    );
    expect(status).toBe(0);
    expect(stdout).not.toMatch(/^interactive:/m);
    expect(stdout).toMatch(/^Render it again: .* --out counter\.html$/m);
  }, 120_000);

  it('runs in a browser: the page draws itself over its markup and its button works', async () => {
    const errors = /** @type {string[]} */ ([]);
    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      pretendToBeVisual: true,
    });
    dom.window.addEventListener('error', e =>
      errors.push(String(/** @type {any} */ (e).message)),
    );
    const settle = () =>
      new Promise(resolve => dom.window.setTimeout(resolve, 50));
    await settle();
    const doc = dom.window.document;
    const root = /** @type {HTMLElement} */ (doc.getElementById(ROOT_ID));
    expect(root.textContent).toContain('Clicked 0 times');
    const button = /** @type {HTMLButtonElement} */ (
      doc.querySelector('button')
    );
    button.click();
    await settle();
    expect(root.textContent).toContain('Clicked 1 times');
    button.click();
    await settle();
    expect(root.textContent).toContain('Clicked 2 times');
    expect(errors).toEqual([]);
    dom.window.close();
  });

  it('opens a link out of the file in a new tab, and submits a form itself, also on Enter', async () => {
    put(
      'src/form.tsx',
      `import {useState} from 'react';
export default function Page() {
  const [sent, setSent] = useState('nothing');
  const [name, setName] = useState('');
  return (
    <main>
      <a href="https://example.com/docs">Docs</a>
      <a href="#top">Top</a>
      <a href="https://example.com/self" target="_self">Self</a>
      <form onSubmit={e => { e.preventDefault(); setSent(name || 'empty'); }}>
        <input aria-label="Name" value={name} onChange={e => setName(e.target.value)} />
        <button type="submit">Send</button>
      </form>
      <form onSubmit={e => { e.preventDefault(); setSent('searched'); }}>
        <input aria-label="Search" />
      </form>
      <p id="sent">{sent}</p>
    </main>
  );
}
`,
    );
    await render('src/form.tsx', {cwd: dir, out: 'form.html'});
    const file = read('form.html');
    // The first paint opens it in a new tab too, before the script runs.
    const markup = renderedMarkupOf(file) ?? '';
    expect(markup).toContain(
      '<a href="https://example.com/docs" target="_blank" rel="noopener noreferrer">Docs</a>',
    );
    expect(markup).toContain('<a href="#top">Top</a>');
    expect(markup).toContain(
      '<a href="https://example.com/self" target="_self">Self</a>',
    );
    const dom = new JSDOM(file, {
      runScripts: 'dangerously',
      pretendToBeVisual: true,
    });
    const settle = () =>
      new Promise(resolve => dom.window.setTimeout(resolve, 50));
    await settle();
    const doc = dom.window.document;
    const sent = () => doc.getElementById('sent')?.textContent;
    const docs = /** @type {HTMLAnchorElement} */ (
      doc.querySelector('a[href="https://example.com/docs"]')
    );
    // The link the script drew has no target until it is clicked.
    expect(docs.hasAttribute('target')).toBe(false);
    docs.dispatchEvent(
      new dom.window.MouseEvent('click', {bubbles: true, cancelable: true}),
    );
    expect(docs.getAttribute('target')).toBe('_blank');
    expect(docs.getAttribute('rel')).toBe('noopener noreferrer');
    /** @type {HTMLButtonElement} */ (doc.querySelector('button')).click();
    await settle();
    expect(sent()).toBe('empty');
    doc.querySelector('input[aria-label="Search"]')?.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      }),
    );
    await settle();
    expect(sent()).toBe('searched');
    dom.window.close();
  }, 120_000);

  it('keeps showing an image the page names by a string path once the script draws the page', async () => {
    // A 1x1 PNG beside the page, named by a string, not imported.
    put(
      'src/photo.png',
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
        'base64',
      ),
    );
    put(
      'src/pictured.tsx',
      `export default function Page() {
  return (
    <main>
      <img src="./photo.png" alt="Photo" />
      <img srcSet="./photo.png 1x, ./photo.png 2x" alt="Sharp" />
    </main>
  );
}
`,
    );
    await render('src/pictured.tsx', {cwd: dir, out: 'pictured.html'});
    const dom = new JSDOM(read('pictured.html'), {
      runScripts: 'dangerously',
      pretendToBeVisual: true,
    });
    await new Promise(resolve => dom.window.setTimeout(resolve, 100));
    const doc = dom.window.document;
    const photo = doc.querySelector(`#${ROOT_ID} img[alt="Photo"]`);
    const sharp = doc.querySelector(`#${ROOT_ID} img[alt="Sharp"]`);
    expect(photo?.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
    expect(sharp?.getAttribute('srcset')).toMatch(
      /^data:image\/png;base64,\S+ 1x, data:image\/png;base64,\S+ 2x$/,
    );
    // The script drew them: they are not the first paint's elements.
    expect(doc.getElementById(ROOT_ID)?.innerHTML).not.toContain('./photo.png');
    dom.window.close();
  }, 120_000);

  it("keeps the first paint when the page's script throws, as in a frame that blocks storage", async () => {
    put(
      'src/saves.tsx',
      `import {useEffect} from 'react';
export default function Page() {
  useEffect(() => {
    window.localStorage.setItem('seen', '1');
  }, []);
  return (
    <main>
      <h1>Saved notes</h1>
      <p>Kept on screen</p>
    </main>
  );
}
`,
    );
    await render('src/saves.tsx', {cwd: dir, out: 'saves.html'});
    // An opaque origin, as in a frame without allow-same-origin: storage throws.
    const dom = new JSDOM(read('saves.html'), {
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      virtualConsole: new VirtualConsole(),
    });
    await new Promise(resolve => dom.window.setTimeout(resolve, 100));
    expect(() => dom.window.localStorage).toThrow();
    const root = dom.window.document.getElementById(ROOT_ID);
    expect(root?.textContent).toContain('Saved notes');
    expect(root?.textContent).toContain('Kept on screen');
  }, 120_000);

  it('refuses a page file the page loads lazily that does not compile, as a static import is refused', async () => {
    put(
      'src/later.tsx',
      `import {useState} from 'react';
export default function Page() {
  const [panel, setPanel] = useState('closed');
  return <button onClick={() => import('./panel').then(m => setPanel(m.default()))}>{panel}</button>;
}
`,
    );
    put(
      'src/panel.tsx',
      'export default function Panel() {\n  return "open";\n}\nconst broken = (;\n',
    );
    let error;
    try {
      await render('src/later.tsx', {cwd: dir, out: 'later.html'});
    } catch (e) {
      error = /** @type {any} */ (e);
    }
    expect(error?.code).toBe('ERR_RENDER_COMPILE');
    expect(error?.message).toContain('panel.tsx, line 4');
    expect(error?.message).not.toContain(dir);
    // eslint-disable-next-line no-control-regex
    expect(error?.message).not.toMatch(/\u001b\[/);
    expect(fs.existsSync(path.join(dir, 'later.html'))).toBe(false);
  }, 120_000);

  it('shows the script in the CLI output, and has no option to leave it out', async () => {
    const page = await runCli(
      ['experimental', 'render', 'src/counter.tsx', '--out', 'cli.html'],
      dir,
    );
    expect(page.status).toBe(0);
    expect(page.stdout).toMatch(/^scriptBytes:\s+[\d.]+ KB$/m);
    expect(page.stdout).toMatch(/^scriptModules:\s+\d+$/m);
    for (const flag of ['--static', '--interactive']) {
      const refused = await runCli(
        ['--json', 'experimental', 'render', 'src/counter.tsx', flag],
        dir,
      );
      expect(refused.status, flag).toBe(1);
      const error = JSON.parse(refused.stdout);
      expect(error.code, flag).toBe('ERR_INVALID_OPTION');
      expect(error.error, flag).toBe(
        `${flag} is no longer an option: every render carries the page's script now. Drop the flag and run the command again.`,
      );
      const help = await runCli(['experimental', 'render', '--help'], dir);
      expect(help.stdout).not.toContain(flag);
    }
  }, 120_000);

  it('refuses a page whose script needs Node, naming the module, and writes nothing', async () => {
    put(
      'src/node-page.tsx',
      `import {readFileSync} from 'node:fs';\nexport default function Page() {\n  return <button onClick={() => readFileSync('x')}>Read</button>;\n}\n`,
    );
    const error = await errorOf(() =>
      render('src/node-page.tsx', {cwd: dir, out: 'node-page.html'}),
    );
    expect(error?.code).toBe('ERR_RENDER_SCRIPT');
    expect(error?.message).toContain(
      "The page's script cannot be built for the browser: node-page.tsx:1: node-page.tsx loads node:fs, which is part of Node and not of a browser",
    );
    // Named as the page names it: no machine path, no build namespace.
    expect(error?.message).not.toContain(dir);
    expect(error?.message).not.toMatch(/astryx-(page|mount)/);
    expect(fs.existsSync(path.join(dir, 'node-page.html'))).toBe(false);
  }, 120_000);

  it('refuses a page whose lazily loaded module is missing, naming the page file as the page names it', async () => {
    put(
      'src/lazy-missing.tsx',
      "import {lazy, Suspense} from 'react';\nconst Panel = lazy(() => import('./gone'));\nexport default function Page() {\n  return (\n    <Suspense fallback={<p>Loading</p>}>\n      <Panel />\n    </Suspense>\n  );\n}\n",
    );
    const error = await errorOf(() =>
      render('src/lazy-missing.tsx', {cwd: dir, out: 'lazy-missing.html'}),
    );
    expect(error?.code).toBe('ERR_RENDER_SCRIPT');
    expect(error?.message).toContain(
      "The page's script cannot be built for the browser: lazy-missing.tsx:2: ",
    );
    expect(error?.message).toContain('./gone');
    expect(error?.message).not.toContain(dir);
    expect(error?.message).not.toMatch(/astryx-(page|mount)/);
    expect(fs.existsSync(path.join(dir, 'lazy-missing.html'))).toBe(false);
  }, 120_000);

  it('composes with --title: the note, the record and the reverse keep it', async () => {
    const title = "Ops' counter";
    await render('src/counter.tsx', {
      cwd: dir,
      out: 'titled.html',
      title,
    });
    const titled = read('titled.html');
    const note = titled.slice(
      titled.indexOf('<!--'),
      titled.indexOf('-->') + 3,
    );
    expect(note).toContain(
      "--out titled.html --title 'Ops'\\''' counter'".replace(
        "'\\''' ",
        "'\\'' ",
      ),
    );
    expect(readSourceBlock(titled)).toMatchObject({
      found: true,
      source: {title},
    });
    const {stdout} = await runCli(
      [
        'experimental',
        'render',
        '--reverse',
        'titled.html',
        '--out',
        'titled-back/counter.tsx',
      ],
      dir,
    );
    expect(stdout).toMatch(/^title:\s+Ops' counter$/m);
    expect(stdout).toMatch(/--out titled\.html --title 'Ops'\\'' counter'$/m);
  }, 120_000);

  it('lets a package map a Node module away for the browser, and an installed package stand in for one', async () => {
    put(
      'node_modules/browser-ready/package.json',
      JSON.stringify({
        name: 'browser-ready',
        version: '1.0.0',
        main: 'index.js',
        browser: {fs: false},
      }),
    );
    put(
      'node_modules/browser-ready/index.js',
      "const fs = require('fs');\nmodule.exports = {hasFs: Boolean(fs && fs.readFileSync)};\n",
    );
    put(
      'node_modules/events/package.json',
      JSON.stringify({name: 'events', version: '3.3.0', main: 'events.js'}),
    );
    put(
      'node_modules/events/events.js',
      "function EventEmitter() {}\nEventEmitter.prototype.marker = 'events-polyfill-in-the-browser';\nmodule.exports = {EventEmitter};\n",
    );
    put(
      'src/ready.tsx',
      "import {hasFs} from 'browser-ready';\nimport {EventEmitter} from 'events';\nexport default function Page() {\n  return <p>{String(hasFs)} {typeof EventEmitter}</p>;\n}\n",
    );
    const ready = /** @type {any} */ (
      await render('src/ready.tsx', {
        cwd: dir,
        out: 'ready.html',
      })
    );
    expect(ready.data.scriptBytes).toBeGreaterThan(0);
    expect(scriptOf(read('ready.html'))).toContain(
      'events-polyfill-in-the-browser',
    );
  }, 120_000);

  it('styles a module the page loads lazily, which the server render never imports', async () => {
    put(
      'src/panel.tsx',
      "import * as stylex from '@stylexjs/stylex';\nconst styles = stylex.create({panel: {color: 'rgb(1, 2, 3)'}});\nexport default function Panel() {\n  return <p {...stylex.props(styles.panel)}>Panel</p>;\n}\n",
    );
    put(
      'src/lazy.tsx',
      "import {lazy, Suspense} from 'react';\nconst Panel = lazy(() => import('./panel'));\nexport default function Page() {\n  return (\n    <main>\n      <Suspense fallback={<p>Loading</p>}>\n        <Panel />\n      </Suspense>\n    </main>\n  );\n}\n",
    );
    await render('src/lazy.tsx', {
      cwd: dir,
      out: 'lazy.html',
    });
    expect(read('lazy.html')).toMatch(/color:\s*rgb\(1,\s*2,\s*3\)/);
    const back = /** @type {any} */ (
      await render('lazy.html', {
        cwd: dir,
        reverse: true,
        out: 'lazy-back/lazy.tsx',
      })
    );
    expect(back.data.exact).toBe(true);
    expect(read('lazy-back/panel.tsx')).toContain("color: 'rgb(1, 2, 3)'");
  }, 120_000);

  it('says a media query asked in JavaScript is asked again when the script runs', async () => {
    put(
      'src/narrow.tsx',
      "import {useMediaQuery} from '@astryxdesign/core/hooks';\nexport default function Page() {\n  const narrow = useMediaQuery('(max-width: 768px)');\n  return <main>{narrow ? 'One column' : 'Two columns'}</main>;\n}\n",
    );
    const narrow = /** @type {any} */ (
      await render('src/narrow.tsx', {
        cwd: dir,
        out: 'narrow.html',
      })
    );
    const warning = narrow.data.warnings.find(
      (/** @type {any} */ w) => w.code === 'screen-query',
    );
    expect(warning?.message).toBe(
      "The page asks useMediaQuery('(max-width: 768px)') in JavaScript: this file paints the server answer first and asks again when its script runs, and a viewer that blocks scripts keeps the server answer. To fit every screen from the first paint, fold the layout with CSS: Grid columns={{minWidth}}, or a StyleX @media or @container style.",
    );
  }, 120_000);

  it('says a chart the render could not draw is drawn by the script', async () => {
    put(
      'src/blank-chart.tsx',
      'import * as R from \'recharts\';\nconst data = [{v: 1}, {v: 2}];\nexport default function Page() {\n  return (\n    <R.ResponsiveContainer width="100%" height={150}>\n      <R.LineChart data={data}>\n        <R.Line dataKey="v" />\n      </R.LineChart>\n    </R.ResponsiveContainer>\n  );\n}\n',
    );
    const live = /** @type {any} */ (
      await render('src/blank-chart.tsx', {
        cwd: dir,
        out: 'blank-live.html',
      })
    );
    expect(
      live.data.warnings.find((/** @type {any} */ w) => w.code === 'chart-size')
        ?.message,
    ).toMatch(
      /^A chart could not be drawn without a browser, so the file paints it empty and its script draws it when it runs; a viewer that blocks scripts keeps it empty\./,
    );
  }, 120_000);
});

describe('esbuild, the dependency that builds the script', () => {
  it('is a dependency of the CLI, not a peer, and resolves beside it', () => {
    const pkg = JSON.parse(
      fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    );
    expect(pkg.dependencies.esbuild).toBeDefined();
    expect(pkg.peerDependencies.esbuild).toBeUndefined();
    const entry = findEsbuild();
    expect(entry).not.toBeNull();
    expect(fs.existsSync(/** @type {string} */ (entry))).toBe(true);
  });

  it('refuses before it runs the page when the install left esbuild out', async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-no-esbuild-'));
    try {
      expect(findEsbuild(empty)).toBeNull();
      const error = await errorOf(() =>
        renderPage(path.join(dir, 'src/counter.tsx'), {
          esbuildFrom: empty,
          output: path.join(dir, 'never.html'),
          cwd: dir,
        }),
      );
      expect(error).toBeInstanceOf(RenderError);
      expect(error.code).toBe('ERR_RENDER_MISSING_DEPENDENCY');
      expect(error.message).toBe(
        `The render builds the page's script, but ${ESBUILD_MISSING}; nothing was written.`,
      );
      expect(fs.existsSync(path.join(dir, 'never.html'))).toBe(false);
    } finally {
      fs.rmSync(empty, {recursive: true, force: true});
    }
  });

  it('never comes up in doctor, installed or not', async () => {
    put(
      'package.json',
      JSON.stringify({
        name: 'interactive-fixture',
        private: true,
        dependencies: {'@astryxdesign/core': '*'},
      }),
    );
    const report = await doctor({cwd: dir});
    expect(JSON.stringify(report)).not.toContain('esbuild');
  });

  it('is never looked for by a markup-only render, which writes no file', async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-no-esbuild-'));
    try {
      const page = await renderPage(path.join(dir, 'src/counter.tsx'), {
        markupOnly: true,
        esbuildFrom: empty,
        cwd: dir,
        version: cliVersion(),
      });
      expect(page.scriptBytes).toBeUndefined();
      expect(page.html).not.toContain(ROOT_ID);
    } finally {
      fs.rmSync(empty, {recursive: true, force: true});
    }
  });
});
