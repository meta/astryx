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
      /experimental export counter-restored\/counter\.tsx --out counter\.html\n/,
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
        'export',
        '--reverse',
        'counter.html',
        '--out',
        'back-2/counter.tsx',
      ],
      dir,
    );
    expect(status).toBe(0);
    expect(stdout).not.toMatch(/^interactive:/m);
    expect(stdout).toMatch(/^Export it again: .* --out counter\.html$/m);
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

  it('reads each imported image the embedded source carries from it, so the script holds no copy, and keeps a copy of one the source leaves out', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );
    put('src/shot.png', png);
    // Under a dot-folder, which the embedded source never carries.
    const other = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
      'base64',
    );
    put('src/.art/hidden.png', other);
    put(
      'src/shots.tsx',
      `import {useEffect, useState} from 'react';
import shot from './shot.png';
import hidden from './.art/hidden.png';
export default function Page() {
  const [drawn, setDrawn] = useState('no');
  useEffect(() => setDrawn('yes'), []);
  return (
    <main data-drawn={drawn}>
      <img src={shot} alt="One" />
      <img src={shot} alt="Two" />
      <img src={hidden} alt="Hidden" />
      {/* A page that shows a rendered file's source block in its markup. */}
      <script type="application/x-astryx-source" dangerouslySetInnerHTML={{__html: '{"files":[]}'}} />
    </main>
  );
}
`,
    );
    await render('src/shots.tsx', {cwd: dir, out: 'shots.html'});
    const file = read('shots.html');
    const script = file.slice(file.lastIndexOf('<script>'));
    const data = png.toString('base64');
    // The carried image is in the markup per image shown and once in the
    // embedded source; the one the source leaves out keeps its own copy.
    expect(script).not.toContain(data);
    expect(script.split(other.toString('base64')).length - 1).toBe(1);
    const dom = new JSDOM(file, {
      runScripts: 'dangerously',
      pretendToBeVisual: true,
    });
    await new Promise(resolve => dom.window.setTimeout(resolve, 100));
    // The script drew the page: only it sets the marker.
    expect(
      dom.window.document
        .querySelector(`#${ROOT_ID} main`)
        ?.getAttribute('data-drawn'),
    ).toBe('yes');
    const shown = [
      ...dom.window.document.querySelectorAll(`#${ROOT_ID} img`),
    ].map(img => img.getAttribute('src'));
    expect(shown).toEqual([
      `data:image/png;base64,${data}`,
      `data:image/png;base64,${data}`,
      `data:image/png;base64,${other.toString('base64')}`,
    ]);
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

  it("keeps the first paint when the page's script throws", async () => {
    put(
      'src/throws.tsx',
      `import {useEffect} from 'react';
export default function Page() {
  useEffect(() => {
    throw new Error('the page broke after its first paint');
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
    await render('src/throws.tsx', {cwd: dir, out: 'throws.html'});
    const dom = new JSDOM(read('throws.html'), {
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      virtualConsole: new VirtualConsole(),
    });
    await new Promise(resolve => dom.window.setTimeout(resolve, 100));
    const root = dom.window.document.getElementById(ROOT_ID);
    expect(root?.textContent).toContain('Saved notes');
    expect(root?.textContent).toContain('Kept on screen');
  }, 120_000);

  it('copies through the copy command in a frame without the Clipboard API, so the page\u2019s own success and error paths run', async () => {
    put(
      'src/copy.tsx',
      `import {useState} from 'react';
export default function Page() {
  const [status, setStatus] = useState('idle');
  const [read, setRead] = useState('');
  return (
    <main>
      <button type="button" onClick={() => navigator.clipboard.writeText('a,b\\n1,2').then(() => setStatus('copied'), e => setStatus(e.name))}>Copy CSV</button>
      <button type="button" onClick={() => navigator.clipboard.readText().then(setRead, e => setRead(e.name))}>Paste</button>
      <p id="status">{status}</p>
      <p id="read">{read}</p>
    </main>
  );
}
`,
    );
    await render('src/copy.tsx', {cwd: dir, out: 'copy.html'});
    const settle = (/** @type {any} */ dom) =>
      new Promise(resolve => dom.window.setTimeout(resolve, 100));
    /**
     * @param {boolean} works
     * @param {(window: any) => void} [frame] what the frame gives the page
     */
    const open = (works, frame) => {
      /** @type {string[]} */
      const copied = [];
      const dom = new JSDOM(read('copy.html'), {
        runScripts: 'dangerously',
        pretendToBeVisual: true,
        beforeParse(window) {
          frame?.(window);
          // JSDOM has no copy command: this one fires the copy event, as a browser does.
          window.document.execCommand = () => {
            const event = new window.Event('copy', {cancelable: true});
            Object.defineProperty(event, 'clipboardData', {
              value: {
                setData: (
                  /** @type {string} */ _type,
                  /** @type {string} */ text,
                ) => copied.push(text),
              },
            });
            window.dispatchEvent(event);
            return works;
          };
        },
      });
      return {dom, copied};
    };
    const working = open(true);
    await settle(working.dom);
    const [copyButton, pasteButton] =
      working.dom.window.document.querySelectorAll('button');
    copyButton.click();
    pasteButton.click();
    await settle(working.dom);
    expect(working.copied).toEqual(['a,b\n1,2']);
    expect(
      working.dom.window.document.getElementById('status')?.textContent,
    ).toBe('copied');
    expect(
      working.dom.window.document.getElementById('read')?.textContent,
    ).toBe('NotAllowedError');
    working.dom.window.close();
    const refused = open(false);
    await settle(refused.dom);
    refused.dom.window.document.querySelector('button')?.click();
    await settle(refused.dom);
    expect(
      refused.dom.window.document.getElementById('status')?.textContent,
    ).toBe('NotAllowedError');
    refused.dom.window.close();
    // Where the Clipboard API is there but refuses the write, or the frame's
    // policy refuses clipboard-write, the copy command copies, as Core's hook does.
    /** @type {string[]} */
    const asked = [];
    for (const frame of [
      (/** @type {any} */ window) => {
        Object.defineProperty(window.navigator, 'clipboard', {
          configurable: true,
          value: {
            writeText: (/** @type {string} */ text) => {
              asked.push(text);
              return Promise.reject(
                new window.DOMException('Write refused.', 'NotAllowedError'),
              );
            },
          },
        });
      },
      (/** @type {any} */ window) => {
        Object.defineProperty(window.navigator, 'clipboard', {
          configurable: true,
          value: {
            writeText: (/** @type {string} */ text) =>
              asked.push(`policy ${text}`),
          },
        });
        window.document.permissionsPolicy = {
          allowsFeature: (/** @type {string} */ f) => f !== 'clipboard-write',
        };
      },
    ]) {
      const page = open(true, frame);
      await settle(page.dom);
      page.dom.window.document.querySelector('button')?.click();
      await settle(page.dom);
      expect(page.copied).toEqual(['a,b\n1,2']);
      expect(
        page.dom.window.document.getElementById('status')?.textContent,
      ).toBe('copied');
      page.dom.window.close();
    }
    expect(asked).toEqual(['a,b\n1,2']);
  }, 120_000);

  it('gives a page storage that lasts until it closes in a frame that blocks storage, and keeps real storage elsewhere', async () => {
    put(
      'src/filter.tsx',
      `import {useEffect, useState} from 'react';
const inBrowser = typeof window !== 'undefined';
export default function Page() {
  const [filter, setFilter] = useState(() => (inBrowser ? window.localStorage.getItem('filter') : null) ?? 'all');
  useEffect(() => {
    window.localStorage.setItem('filter', filter);
    window.sessionStorage.setItem('seen', '1');
  }, [filter]);
  return (
    <main>
      <p id="filter">{filter}</p>
      <button type="button" onClick={() => setFilter('open')}>Open only</button>
    </main>
  );
}
`,
    );
    await render('src/filter.tsx', {cwd: dir, out: 'filter.html'});
    const settle = (/** @type {any} */ dom) =>
      new Promise(resolve => dom.window.setTimeout(resolve, 100));
    // An opaque origin, as in a frame without allow-same-origin: storage throws.
    const blocked = new JSDOM(read('filter.html'), {
      runScripts: 'dangerously',
      pretendToBeVisual: true,
    });
    await settle(blocked);
    const doc = blocked.window.document;
    expect(doc.getElementById('filter')?.textContent).toBe('all');
    /** @type {HTMLButtonElement} */ (doc.querySelector('button')).click();
    await settle(blocked);
    expect(doc.getElementById('filter')?.textContent).toBe('open');
    expect(blocked.window.localStorage.getItem('filter')).toBe('open');
    expect(blocked.window.sessionStorage.getItem('seen')).toBe('1');
    // Items read, write, list and delete as properties, as in the browser's storage.
    const stored = /** @type {any} */ (blocked.window.localStorage);
    stored.theme = 'dark';
    expect(stored.getItem('theme')).toBe('dark');
    expect(stored.filter).toBe('open');
    expect(Object.keys(stored).sort()).toEqual(['filter', 'theme']);
    expect('theme' in stored).toBe(true);
    delete stored.theme;
    expect(stored.getItem('theme')).toBeNull();
    expect(stored.length).toBe(1);
    blocked.window.close();
    // A real origin keeps the browser's own storage.
    const open = new JSDOM(read('filter.html'), {
      url: 'https://example.test/',
      runScripts: 'dangerously',
      pretendToBeVisual: true,
    });
    const real = open.window.localStorage;
    await settle(open);
    expect(open.window.localStorage).toBe(real);
    expect(real.getItem('filter')).toBe('all');
    open.window.close();
  }, 120_000);

  it('refuses a named import its module does not export, as a build does, naming the file and line', async () => {
    put('src/lib-x.ts', 'export const a = 1;\n');
    put(
      'src/no-export.tsx',
      "import {a, b} from './lib-x';\nexport default function Page() { return <p>{a}{String(b)}</p>; }\n",
    );
    const local = await errorOf(() =>
      render('src/no-export.tsx', {cwd: dir, out: 'no-export.html'}),
    );
    expect(local?.code).toBe('ERR_RENDER_COMPILE');
    expect(local?.message).toContain('(src/no-export.tsx, line 1): ./lib-x has no export b');
    put(
      'src/no-token.tsx',
      "import * as stylex from '@stylexjs/stylex';\nimport {colors} from '@astryxdesign/core/theme/tokens.stylex';\nconst styles = stylex.create({p: {color: colors.text}});\nexport default function Page() { return <p {...stylex.props(styles.p)}>x</p>; }\n",
    );
    const token = await errorOf(() =>
      render('src/no-token.tsx', {cwd: dir, out: 'no-token.html'}),
    );
    expect(token?.code).toBe('ERR_RENDER_COMPILE');
    expect(token?.message).toContain(
      '(src/no-token.tsx, line 2): @astryxdesign/core/theme/tokens.stylex has no export colors',
    );
    expect(token?.message).not.toMatch(/\/home\/|\/tmp\//);
    expect(fs.existsSync(path.join(dir, 'no-token.html'))).toBe(false);
    put(
      'src/no-component.tsx',
      "import {Button, Chart, type ButtonProps} from '@astryxdesign/core';\nimport {helper, type Shape} from './lib-y';\nconst props: ButtonProps = {label: 'Go'};\nconst shape: Shape = {n: helper()};\nexport default function Page() { return <main><Button {...props} /><Chart data={[shape]} /></main>; }\n",
    );
    put(
      'src/lib-y.ts',
      'export type Shape = {n: number};\nexport const helper = () => 1;\nexport default function Y() { return null; }\n',
    );
    const component = await errorOf(() =>
      render('src/no-component.tsx', {cwd: dir, out: 'no-component.html'}),
    );
    expect(component?.code).toBe('ERR_RENDER_COMPILE');
    expect(component?.message).toContain(
      '(src/no-component.tsx, line 1): @astryxdesign/core has no export Chart',
    );
    put(
      'src/no-member.tsx',
      "import {Button} from '@astryxdesign/core/Button';\nexport default function Page() {\n  return <main><Button.Icon /></main>;\n}\n",
    );
    const member = await errorOf(() =>
      render('src/no-member.tsx', {cwd: dir, out: 'no-member.html'}),
    );
    expect(member?.code).toBe('ERR_RENDER_COMPILE');
    expect(member?.message).toContain(
      '(src/no-member.tsx, line 3): @astryxdesign/core/Button has no export Button.Icon',
    );
    put(
      'src/types-only.tsx',
      "import {Button, ButtonProps} from '@astryxdesign/core/Button';\nimport Y, {helper} from './lib-y';\nconst props: ButtonProps = {label: String(helper())};\nexport default function Page() { return <main><Button {...props} /><Y /></main>; }\n",
    );
    await render('src/types-only.tsx', {cwd: dir, out: 'types-only.html'});
    expect(fs.existsSync(path.join(dir, 'types-only.html'))).toBe(true);
    // A parameter or a local binding named like an import is not the import.
    put(
      'src/shadowed.tsx',
      [
        "import {Button} from '@astryxdesign/core/Button';",
        "import {Card} from '@astryxdesign/core/Card';",
        'const Icon = () => <i>icon</i>;',
        'function Row({Button}: {Button: any}) { return <Button.Icon />; }',
        'const rows = [{Button: {Icon}}];',
        'function Lede() { const Card = {Lede: () => <b>lede</b>}; return <Card.Lede />; }',
        'export default function Page() {',
        '  return <Card><Button label="Go" /><Row Button={{Icon}} />{rows.map(({Button}, i) => <Button.Icon key={i} />)}<Lede /></Card>;',
        '}',
        '',
      ].join('\n'),
    );
    await render('src/shadowed.tsx', {cwd: dir, out: 'shadowed.html'});
    expect(fs.existsSync(path.join(dir, 'shadowed.html'))).toBe(true);
    // A type re-exported as a type or plainly, and a file the page reads as
    // text, are no value uses.
    put(
      'src/types-re.ts',
      "import {ButtonProps} from '@astryxdesign/core/Button';\nexport type {ButtonProps};\nexport {type ButtonProps as Props};\nexport {ButtonProps as Plain};\nexport const label = 'Go';\n",
    );
    put(
      'src/snippet.tsx',
      "import {Nope} from '@astryxdesign/core';\nexport const shown = <Nope />;\n",
    );
    put(
      'src/re-and-raw.tsx',
      "import {label, type ButtonProps} from './types-re';\nimport snippet from './snippet.tsx?raw';\nconst props: ButtonProps = {label};\nexport default function Page() { return <main><pre>{snippet}</pre><p>{props.label}</p></main>; }\n",
    );
    await render('src/re-and-raw.tsx', {cwd: dir, out: 're-and-raw.html'});
    expect(fs.existsSync(path.join(dir, 're-and-raw.html'))).toBe(true);
    // A CommonJS module's exports are read by interop, as a bundler reads them.
    put('src/lib-cjs.js', 'module.exports = {a: 1};\n');
    put(
      'src/from-cjs.tsx',
      "import {a, b} from './lib-cjs.js';\nexport default function Page() { return <main>{a}{String(b)}</main>; }\n",
    );
    await render('src/from-cjs.tsx', {cwd: dir, out: 'from-cjs.html'});
    expect(fs.existsSync(path.join(dir, 'from-cjs.html'))).toBe(true);
    // In JavaScript a plain re-export names a value, so a missing one is refused.
    put(
      'src/lib-js.js',
      "import {Nope} from '@astryxdesign/core';\nexport {Nope};\nexport const ok = 'ok';\n",
    );
    put(
      'src/js-re.tsx',
      "import {ok} from './lib-js.js';\nexport default function Page() { return <main>{ok}</main>; }\n",
    );
    const jsRe = await errorOf(() =>
      render('src/js-re.tsx', {cwd: dir, out: 'js-re.html'}),
    );
    expect(jsRe?.code).toBe('ERR_RENDER_COMPILE');
    expect(jsRe?.message).toContain(
      '(src/lib-js.js, line 1): @astryxdesign/core has no export Nope',
    );
    // A package subpath the package does not export is refused as a build
    // refuses it, with no installed path in the message.
    put(
      'src/no-subpath.tsx',
      "import {Chart} from '@astryxdesign/core/Chart';\nexport default function Page() { return <main><Chart /></main>; }\n",
    );
    const subpath = await errorOf(() =>
      render('src/no-subpath.tsx', {cwd: dir, out: 'no-subpath.html'}),
    );
    expect(subpath?.code).toBe('ERR_RENDER_COMPILE');
    expect(subpath?.message).toBe(
      'The page does not compile (src/no-subpath.tsx, line 1): @astryxdesign/core has no export ./Chart',
    );
    put(
      'src/no-stylex-subpath.tsx',
      "import * as stylex from '@stylexjs/stylex';\nimport {spacing} from '@astryxdesign/core/tokens/spacing.stylex';\nconst styles = stylex.create({p: {padding: spacing.md}});\nexport default function Page() { return <p {...stylex.props(styles.p)}>x</p>; }\n",
    );
    const stylexSubpath = await errorOf(() =>
      render('src/no-stylex-subpath.tsx', {cwd: dir, out: 'no-stylex-subpath.html'}),
    );
    expect(stylexSubpath?.code).toBe('ERR_RENDER_COMPILE');
    expect(stylexSubpath?.message).toBe(
      'The page does not compile (src/no-stylex-subpath.tsx, line 2): @astryxdesign/core has no export ./tokens/spacing.stylex',
    );
    // A missing name the page calls as it loads is named as a build names it.
    put('src/lib-load.ts', 'export const other = 1;\n');
    put(
      'src/load-call.tsx',
      "import {other, makeLabel} from './lib-load';\nconst label = makeLabel(other);\nexport default function Page() { return <main>{label}</main>; }\n",
    );
    const atLoad = await errorOf(() =>
      render('src/load-call.tsx', {cwd: dir, out: 'load-call.html'}),
    );
    expect(atLoad?.code).toBe('ERR_RENDER_COMPILE');
    expect(atLoad?.message).toContain(
      '(src/load-call.tsx, line 1): ./lib-load has no export makeLabel',
    );
    // The script's build names a multi-line import's module, as the server does.
    put(
      'node_modules/esm-only/package.json',
      JSON.stringify({name: 'esm-only', type: 'module', exports: './index.js'}),
    );
    put(
      'node_modules/esm-only/index.js',
      'export const shout = s => s.toUpperCase();\n',
    );
    put(
      'src/script-only.tsx',
      "import {\n  shout,\n  whisper,\n} from 'esm-only';\nexport default function Page() { return <button onClick={() => whisper(shout('a'))}>Go</button>; }\n",
    );
    const scripted = await errorOf(() =>
      render('src/script-only.tsx', {cwd: dir, out: 'script-only.html'}),
    );
    expect(scripted?.code).toBe('ERR_RENDER_COMPILE');
    expect(scripted?.message).toContain(
      '(src/script-only.tsx, line 3): esm-only has no export whisper',
    );
  });

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
      ['experimental', 'export', 'src/counter.tsx', '--out', 'cli.html'],
      dir,
    );
    expect(page.status).toBe(0);
    expect(page.stdout).toMatch(/^scriptBytes:\s+[\d.]+ KB$/m);
    expect(page.stdout).toMatch(/^scriptModules:\s+\d+$/m);
    for (const flag of ['--static', '--interactive']) {
      const refused = await runCli(
        ['--json', 'experimental', 'export', 'src/counter.tsx', flag],
        dir,
      );
      expect(refused.status, flag).toBe(1);
      const error = JSON.parse(refused.stdout);
      expect(error.code, flag).toBe('ERR_INVALID_OPTION');
      expect(error.error, flag).toBe(
        `${flag} is no longer an option: every render carries the page's script now. Drop the flag and run the command again.`,
      );
      const help = await runCli(['experimental', 'export', '--help'], dir);
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
        'export',
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
