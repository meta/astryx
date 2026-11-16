// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for `render --interactive`: the file carries the page's own
 * script, which draws the live page over its markup in a browser, and stays
 * one self-describing, reversible file. Also how the render refuses when
 * esbuild, the optional peer that builds the script, is missing or too old.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {JSDOM} from 'jsdom';
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
  ESBUILD_RANGE,
  findEsbuild,
} from '../../foundation/render/esbuild-peer.mjs';
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
  ]);
  put('src/counter.tsx', COUNTER);
  put('src/label.ts', LABEL);
  result = await render('src/counter.tsx', {
    cwd: dir,
    out: 'counter.html',
    interactive: true,
  });
  html = read('counter.html');
}, 120_000);

afterAll(() => {
  removeLinkedFixture(dir);
});

describe('an interactive render', () => {
  it('reports the script it carried', () => {
    expect(result.type).toBe('render.page');
    expect(result.data).toMatchObject({interactive: true});
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

  it("says in its note that it runs the page's own script, and how to render it again the same way", () => {
    const note = html.slice(html.indexOf('<!--'), html.indexOf('-->') + 3);
    expect(note).toContain(
      "The page's own script, at the end of the file, draws the page when it",
    );
    expect(note).not.toContain('It runs no script');
    expect(note).toContain(
      `experimental render counter-restored/counter.tsx --out counter.html --interactive`,
    );
    expect(note).toContain("before the page's script");
  });

  it('records the mode, so a reverse knows it', () => {
    const read = readSourceBlock(html);
    expect(read).toMatchObject({found: true, source: {interactive: true}});
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
    await render('src/counter.tsx', {
      cwd: dir,
      out: 'counter.html',
      interactive: true,
    });
    expect(read('counter.html')).toBe(html);
  });

  it('gives the page back exactly, and the command to render it again keeps --interactive', async () => {
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
      interactive: true,
    });
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
    expect(stdout).toMatch(/^interactive:\s+true$/m);
    expect(stdout).toMatch(
      /^Render it again: .* --out counter\.html --interactive$/m,
    );
  });

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

  it('shows the script in the CLI output, and refuses --interactive with --reverse', async () => {
    const page = await runCli(
      [
        'experimental',
        'render',
        'src/counter.tsx',
        '--out',
        'cli.html',
        '--interactive',
      ],
      dir,
    );
    expect(page.status).toBe(0);
    expect(page.stdout).toMatch(/^script:\s+[\d.]+ KB \(\d+ modules\)$/m);
    const both = await runCli(
      [
        '--json',
        'experimental',
        'render',
        '--reverse',
        'counter.html',
        '--interactive',
      ],
      dir,
    );
    expect(both.status).toBe(1);
    expect(JSON.parse(both.stdout).code).toBe('ERR_INVALID_ARGUMENT');
  });

  it('refuses a page whose script needs Node, naming the module, and writes nothing', async () => {
    put(
      'src/node-page.tsx',
      `import {readFileSync} from 'node:fs';\nexport default function Page() {\n  return <button onClick={() => readFileSync('x')}>Read</button>;\n}\n`,
    );
    const error = await errorOf(() =>
      render('src/node-page.tsx', {
        cwd: dir,
        out: 'node-page.html',
        interactive: true,
      }),
    );
    expect(error?.code).toBe('ERR_RENDER_INTERACTIVE');
    expect(error?.message).toContain(
      'node-page.tsx loads node:fs, which is part of Node and not of a browser',
    );
    expect(fs.existsSync(path.join(dir, 'node-page.html'))).toBe(false);
  });

  it('keeps a static render as it was: no script and no element around the markup', async () => {
    await render('src/counter.tsx', {cwd: dir, out: 'static.html'});
    const plain = read('static.html');
    expect(plain).not.toContain(ROOT_ID);
    expect(plain.match(/<script\b/g)).toHaveLength(1);
    expect(plain).toContain('This is one static file. It runs no script');
  });
});

describe('esbuild, the optional peer that builds the script', () => {
  it('is declared optional, with the range the render checks', () => {
    const pkg = JSON.parse(
      fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    );
    expect(pkg.peerDependencies.esbuild).toBe(ESBUILD_RANGE);
    expect(pkg.peerDependenciesMeta.esbuild).toEqual({optional: true});
  });

  it('refuses before it runs the page when esbuild is not installed, with the install command', async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-no-esbuild-'));
    try {
      expect(findEsbuild([empty])).toBeNull();
      const error = await errorOf(() =>
        renderPage(path.join(dir, 'src/counter.tsx'), {
          interactive: true,
          esbuildFrom: [empty],
          output: path.join(dir, 'never.html'),
          cwd: dir,
        }),
      );
      expect(error).toBeInstanceOf(RenderError);
      expect(error.code).toBe('ERR_RENDER_MISSING_DEPENDENCY');
      expect(error.message).toContain(
        "--interactive builds the page's script with esbuild, an optional peer of the CLI, and esbuild is not installed here; nothing was written.",
      );
      expect(error.detail).toMatchObject({package: 'esbuild'});
      expect(error.detail.install).toMatch(
        /^(npm install|pnpm add|yarn add|bun add) esbuild/,
      );
      expect(error.message).toContain(error.detail.install);
    } finally {
      fs.rmSync(empty, {recursive: true, force: true});
    }
  });

  it('refuses an esbuild older than its range, naming both', () => {
    const old = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-old-esbuild-'));
    try {
      const pkg = path.join(old, 'node_modules', 'esbuild');
      fs.mkdirSync(path.join(pkg, 'lib'), {recursive: true});
      fs.writeFileSync(
        path.join(pkg, 'package.json'),
        JSON.stringify({
          name: 'esbuild',
          version: '0.19.0',
          main: 'lib/main.js',
        }),
      );
      fs.writeFileSync(
        path.join(pkg, 'lib', 'main.js'),
        'module.exports = {};\n',
      );
      expect(findEsbuild([old])).toEqual({older: '0.19.0'});
    } finally {
      fs.rmSync(old, {recursive: true, force: true});
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

  it('is never loaded by a static render', async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-no-esbuild-'));
    try {
      const page = await renderPage(path.join(dir, 'src/counter.tsx'), {
        esbuildFrom: [empty],
        output: path.join(dir, 'x.html'),
        cwd: dir,
        version: cliVersion(),
      });
      expect(page.scriptBytes).toBeUndefined();
    } finally {
      fs.rmSync(empty, {recursive: true, force: true});
    }
  });
});
