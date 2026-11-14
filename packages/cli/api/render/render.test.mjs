// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for render() (`astryx experimental render`): a page to one
 * self-contained HTML file and back, each refusal, and the warnings.
 */

import {spawn, spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import * as fs from 'node:fs';
import {createRequire} from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {render} from './render.mjs';
import {segmenterWarning} from '../../foundation/render/render-page.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';
import {makeLinkedFixture, removeLinkedFixture} from '../../test-utils/linked-fixture.mjs';

const CLI_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** @type {string} */
let dir;

/** @param {string} name @param {string | Buffer} content */
const put = (name, content) => {
  const file = path.join(dir, name);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, content);
  return file;
};

/** @param {() => Promise<unknown>} fn */
async function codeOf(fn) {
  try {
    await fn();
  } catch (e) {
    return /** @type {any} */ (e).code;
  }
  return 'no error';
}

// A 1×1 PNG.
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6364f8cf00000301010018dd8db40000000049454e44ae426082',
  'hex',
);

const PAGE = `import * as stylex from '@stylexjs/stylex';
import {List, ListItem} from '@astryxdesign/core/List';
import {Heading, Text} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import dot from './dot.png';

const styles = stylex.create({box: {padding: 12}});

export default function Page() {
  return (
    <div {...stylex.props(styles.box)}>
      <Heading level={1}>Café ✓ report</Heading>
      <Text>{'</script><script>alert(1)</script>'}</Text>
      <img src={dot} alt="" />
      <List>
        <ListItem>Dropped child text</ListItem>
        <ListItem label="Kept label" />
      </List>
      <Button>Go</Button>
    </div>
  );
}
`;

beforeAll(async () => {
  dir = makeLinkedFixture('astryx-render-test-', ['@astryxdesign', '@stylexjs', 'react', 'react-dom', 'recharts']);
  put('dot.png', PNG);
  put('page.tsx', PAGE);
  put('plain.html', '<!doctype html><html><body><h1>Hello</h1><p class="lead">Hi</p></body></html>');
  // Every test can read the rendered page, whatever runs first.
  await render('page.tsx', {cwd: dir});
}, 60_000);

afterAll(() => {
  removeLinkedFixture(dir);
});

describe('render(): page to one HTML file', () => {
  /** @type {import('./render.type.mjs').RenderPageResponse} */
  let result;
  /** @type {string} */
  let html;

  beforeAll(async () => {
    result = /** @type {any} */ (await render('page.tsx', {cwd: dir}));
    html = fs.readFileSync(path.join(dir, 'page.html'), 'utf8');
  }, 60_000);

  it('answers render.page and writes beside the page by default', () => {
    expect(result.type).toBe('render.page');
    expect(result.data.output).toBe('page.html');
    expect(result.data.files).toEqual(['page.tsx', 'dot.png']);
    expect(result.data.bytes).toBe(Buffer.byteLength(html));
    expect(result.data.stylesheets).toContain('@astryxdesign/core/astryx.css');
  });

  it('is one static file: no external references, no running script', () => {
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/\ssrc="(?!data:)/);
    const scripts = [...html.matchAll(/<script\b([^>]*)>/gi)].map(m => m[1]);
    expect(scripts).toEqual([' type="application/x-astryx-source"']);
  });

  it('keeps text safe and the page title from its heading', () => {
    expect(html).toContain('<title>Café ✓ report</title>');
    expect(html).toContain('&lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('inlines CSS for the classes it uses, its own StyleX, and the layer order once', () => {
    const style = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? '';
    expect(style).toMatch(/^:root\{color-scheme:light dark\}/);
    expect(style.match(/@layer reset, astryx-base, astryx-theme;/g)).toHaveLength(1);
    expect(style).toContain('padding:12px');
    const classes = new Set(
      [...html.matchAll(/\sclass="([^"]*)"/g)].flatMap(m => m[1].split(/\s+/)),
    );
    const astryx = [...classes].filter(c => c.startsWith('astryx-'));
    expect(astryx.length).toBeGreaterThan(0);
    // Core's stylesheet is cut: a component the page does not use is absent.
    expect(style).not.toContain('.astryx-calendar');
  });

  it('inlines a local image as a data: URI', () => {
    expect(result.data.images).toBe(1);
    expect(html).toContain('src="data:image/png;base64,');
  });

  it('warns when a component drops the text it was given', () => {
    const dropped = result.data.warnings.filter(w => w.code === 'dropped-children');
    expect(dropped).toHaveLength(1);
    expect(dropped[0].message).toContain('ListItem');
    expect(dropped[0].message).toContain('label=');
  });

  it('gives the page back byte for byte', async () => {
    const back = /** @type {any} */ (
      await render('page.html', {cwd: dir, reverse: true, out: 'back/page.tsx'})
    );
    expect(back.type).toBe('render.reverse');
    expect(back.data).toMatchObject({mode: 'embedded', exact: true, output: 'back/page.tsx'});
    expect(fs.readFileSync(path.join(dir, 'back/page.tsx'))).toEqual(
      fs.readFileSync(path.join(dir, 'page.tsx')),
    );
  });

  it('refuses to replace a page without --overwrite, and never adds neighbours to a folder that exists', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    put('alone-page.html', `<body><p class="astryx-text">x</p>${sourceBlock('page.tsx', [{path: 'page.tsx', bytes: Buffer.from('export default () => null;\n')}])}</body>`);
    await render('alone-page.html', {cwd: dir, reverse: true, out: 'twice/page.tsx'});
    expect(await codeOf(() => render('alone-page.html', {cwd: dir, reverse: true, out: 'twice/page.tsx'}))).toBe(
      'ERR_FILE_EXISTS',
    );
    const again = /** @type {any} */ (
      await render('alone-page.html', {cwd: dir, reverse: true, out: 'twice/page.tsx', overwrite: true})
    );
    expect(again.data.mode).toBe('embedded');
    // A page with a neighbour (its image) comes back only into a new folder.
    await render('page.html', {cwd: dir, reverse: true, out: 'twice-img/page.tsx'});
    expect(
      await codeOf(() => render('page.html', {cwd: dir, reverse: true, out: 'twice-img/page.tsx', overwrite: true})),
    ).toBe('ERR_PATH_TRAVERSAL');
  });


  it('rebuilds a page from Astryx markup when there is no embedded source', async () => {
    put('stripped.html', html.replace(/<script type="application\/x-astryx-source">[\s\S]*?<\/script>/, ''));
    const rebuilt = /** @type {any} */ (await render('stripped.html', {cwd: dir, reverse: true}));
    expect(rebuilt.data).toMatchObject({mode: 'rebuilt', exact: false, output: 'stripped-restored/page.tsx'});
    expect(rebuilt.data.components).toEqual(expect.arrayContaining(['Button', 'Heading', 'List']));
    const source = fs.readFileSync(path.join(dir, 'stripped-restored/page.tsx'), 'utf8');
    expect(source).toContain("from '@astryxdesign/core/Button'");
    expect(source).toContain('Café ✓ report');
    // The rebuilt page renders.
    const again = /** @type {any} */ (await render('stripped-restored/page.tsx', {cwd: dir}));
    expect(again.type).toBe('render.page');
  }, 60_000);

  it('refuses HTML that is not an Astryx page, naming the next step', async () => {
    put('plain.html', '<!doctype html><html><body><h1>Hello</h1><p class="lead">Hi</p></body></html>');
    /** @type {any} */
    let error;
    try {
      await render('plain.html', {cwd: dir, reverse: true});
    } catch (e) {
      error = e;
    }
    expect(error.code).toBe('ERR_RENDER_NOT_ASTRYX');
    expect(error.suggestions[0].name).toBe('astryx build "<what the page is>"');
  });

  it('refuses a damaged embedded source', async () => {
    put(
      'damaged.html',
      html.replace(/"base64":"[^"]{4}/, '"base64":"AAAA'),
    );
    expect(await codeOf(() => render('damaged.html', {cwd: dir, reverse: true}))).toBe(
      'ERR_RENDER_SOURCE_DAMAGED',
    );
  });

  it('refuses a rendered file cut short before its embedded source, instead of rebuilding part of the page', async () => {
    put('cut-short.html', html.slice(0, html.indexOf('<script type="application/x-astryx-source"') - 40));
    /** @type {any} */
    let refused;
    try {
      await render('cut-short.html', {cwd: dir, reverse: true, out: 'cut-short-back/page.tsx'});
    } catch (e) {
      refused = e;
    }
    expect(refused?.code).toBe('ERR_RENDER_SOURCE_DAMAGED');
    expect(refused.message).toContain('cut-short.html is cut short');
    expect(fs.existsSync(path.join(dir, 'cut-short-back'))).toBe(false);
    // A whole file a host added to after </html> is not cut short.
    put('added-to.html', `${html}<script>track()</script>\n`);
    const back = /** @type {any} */ (await render('added-to.html', {cwd: dir, reverse: true, out: 'added-to-back/page.tsx'}));
    expect(back.data).toMatchObject({mode: 'embedded', exact: true});
  });

  it('refuses a file a merge left with conflict markers, instead of choosing a side', async () => {
    const lines = html.split('\n');
    const at = lines.findIndex(line => line.includes('application/x-astryx-source'));
    put('conflicted.html', [...lines.slice(0, at), '<<<<<<< HEAD', lines[at], '=======', lines[at], '>>>>>>> theirs', ...lines.slice(at + 1)].join('\n'));
    /** @type {any} */
    let refused;
    try {
      await render('conflicted.html', {cwd: dir, reverse: true, out: 'conflicted-back/page.tsx'});
    } catch (e) {
      refused = e;
    }
    expect(refused?.code).toBe('ERR_RENDER_SOURCE_DAMAGED');
    expect(refused.message).toContain('merge conflict markers');
    expect(fs.existsSync(path.join(dir, 'conflicted-back'))).toBe(false);
    // A page that is not an Astryx page is still named as such.
    put('plain-conflicted.html', '<html><body>\n<<<<<<< HEAD\n<p>a</p>\n=======\n<p>b</p>\n>>>>>>> theirs\n</body></html>\n');
    expect(await codeOf(() => render('plain-conflicted.html', {cwd: dir, reverse: true}))).toBe('ERR_RENDER_NOT_ASTRYX');
  });

  it('gives back a file whose markup a hand edit left with an open comment, and says it was edited', async () => {
    put('open-comment.html', html.replace('</h1>', '</h1><!-- todo: reword'));
    const back = /** @type {any} */ (await render('open-comment.html', {cwd: dir, reverse: true, out: 'open-comment-back/page.tsx'}));
    expect(back.data).toMatchObject({mode: 'embedded', exact: true, edited: true});
    expect(fs.readFileSync(path.join(dir, 'open-comment-back/page.tsx'), 'utf8')).toBe(PAGE);
  });

  it('gives back a file a minifier rewrote: comments gone, the tag unquoted, its attributes reordered', async () => {
    const minified = html
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace('<script type="application/x-astryx-source">', '<script data-kind=source type=application/x-astryx-source>');
    put('minified.html', minified);
    const back = /** @type {any} */ (await render('minified.html', {cwd: dir, reverse: true, out: 'minified-back/page.tsx'}));
    expect(back.data).toMatchObject({mode: 'embedded', exact: true, edited: false});
    expect(fs.readFileSync(path.join(dir, 'minified-back/page.tsx'), 'utf8')).toBe(PAGE);
  });
});

describe('render(): every write takes its place in one step', () => {
  const BIN = path.join(CLI_DIR, 'clients/cli/bin/astryx.mjs');
  /**
   * Run the CLI in a process of its own.
   * @param {string[]} args
   * @returns {Promise<{code: number | null, out: string}>}
   */
  const cliRun = args =>
    new Promise(resolve => {
      const child = spawn(process.execPath, [BIN, '--json', ...args], {cwd: dir, stdio: ['ignore', 'pipe', 'ignore']});
      let out = '';
      child.stdout.on('data', chunk => (out += chunk));
      child.on('close', code => resolve({code, out}));
    });

  it('replaces a rendered file in one step: a reader that has the old file open keeps reading all of it', async () => {
    put('swap-a.tsx', 'export default function A() {\n  return <p>First page</p>;\n}\n');
    put('swap-b.tsx', 'export default function B() {\n  return <p>Second page</p>;\n}\n');
    await render('swap-a.tsx', {cwd: dir, out: 'swap.html'});
    const file = path.join(dir, 'swap.html');
    const before = fs.readFileSync(file);
    const fd = fs.openSync(file, 'r');
    try {
      await render('swap-b.tsx', {cwd: dir, out: 'swap.html'});
      const held = Buffer.alloc(before.length + 1);
      expect(held.subarray(0, fs.readSync(fd, held, 0, held.length, 0))).toEqual(before);
    } finally {
      fs.closeSync(fd);
    }
    expect(fs.readFileSync(file, 'utf8')).toContain('Second page');
  }, 60_000);

  it('restores one file from many processes at once: each run gets a folder of its own, whole', async () => {
    const runs = await Promise.all(Array.from({length: 8}, () => cliRun(['experimental', 'render', '--reverse', 'page.html'])));
    expect(runs.map(r => r.code)).toEqual(Array(8).fill(0));
    const pages = runs.map(r => JSON.parse(r.out).data.output);
    expect(new Set(pages.map(p => path.dirname(p))).size).toBe(8);
    for (const p of pages) expect(fs.readFileSync(path.join(dir, p), 'utf8')).toBe(PAGE);
  }, 120_000);

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'says a file it cannot read cannot be read, not that it does not exist',
    async () => {
      put('unreadable/page.tsx', 'export default function Page() {\n  return <p>Unreadable</p>;\n}\n');
      await render('unreadable/page.tsx', {cwd: dir});
      const files = ['unreadable/page.tsx', 'unreadable/page.html'];
      for (const file of files) fs.chmodSync(path.join(dir, file), 0o000);
      try {
        for (const [file, options] of [[files[0], {}], [files[1], {reverse: true}]]) {
          /** @type {any} */
          let refused;
          try {
            await render(file, {cwd: dir, ...options});
          } catch (e) {
            refused = e;
          }
          expect(refused?.code, file).toBe('ERR_READ_FAILED');
          expect(refused.message).toBe(`${file} cannot be read (EACCES: no permission); nothing was written.`);
        }
      } finally {
        for (const file of files) fs.chmodSync(path.join(dir, file), 0o644);
      }
      expect(await codeOf(() => render('unreadable/missing.tsx', {cwd: dir}))).toBe('ERR_FILE_NOT_FOUND');
      // A folder or a pipe given as the file is refused before it is opened,
      // so nothing waits on a pipe no one writes.
      fs.mkdirSync(path.join(dir, 'unreadable/folder.tsx'));
      const entries = [['unreadable/folder.tsx', 'it is a folder']];
      if (spawnSync('mkfifo', [path.join(dir, 'unreadable/pipe.tsx')]).status === 0) entries.push(['unreadable/pipe.tsx', 'it is not a regular file']);
      for (const [file, why] of entries) {
        /** @type {any} */
        let refused;
        try {
          await render(file, {cwd: dir});
        } catch (e) {
          refused = e;
        }
        expect(refused?.code, file).toBe('ERR_READ_FAILED');
        expect(refused.message).toBe(`${file} cannot be read (${why}); nothing was written.`);
      }
    },
    60_000,
  );

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'leaves a file this user cannot write as it is, and keeps the permission bits of a file it replaces',
    async () => {
      await render('page.tsx', {cwd: dir, out: 'modes.html'});
      const file = path.join(dir, 'modes.html');
      fs.chmodSync(file, 0o444);
      expect(await codeOf(() => render('page.tsx', {cwd: dir, out: 'modes.html'}))).toBe('ERR_WRITE_FAILED');
      fs.chmodSync(file, 0o640);
      await render('page.tsx', {cwd: dir, out: 'modes.html'});
      expect(fs.statSync(file).mode & 0o777).toBe(0o640);
    },
    60_000,
  );

  it('lands every copy but the page at its target in the one new folder: a copy an alias places is refused outside it', async () => {
    put('alias-loop/tsconfig.json', '{"compilerOptions": {"paths": {"@/*": ["./src/*"]}}}\n');
    put('alias-loop/package.json', '{"name":"alias-loop","private":true}');
    put('alias-loop/src/lib/helper.ts', "import {title} from '@/app/page';\nexport const label = 'Helper';\nexport const echo = () => title;\n");
    const page = "import {label} from '../lib/helper';\nexport const title = 'Loop';\nexport default function Page() { return <p>{label}</p>; }\n";
    put('alias-loop/src/app/page.tsx', page);
    const cwd = path.join(dir, 'alias-loop');
    await render('src/app/page.tsx', {cwd});
    /** @type {any} */
    let refused;
    try {
      await render('src/app/page.html', {cwd, reverse: true, out: 'restored/app/page.tsx'});
    } catch (e) {
      refused = e;
    }
    expect(refused?.code).toBe('ERR_PATH_TRAVERSAL');
    expect(refused.message).toContain('src/app/page.tsx');
    expect(fs.existsSync(path.join(cwd, 'restored'))).toBe(false);
    expect(fs.readFileSync(path.join(cwd, 'src/app/page.tsx'), 'utf8')).toBe(page);
  }, 60_000);

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('names the folder that takes no new file, not a temporary one', async () => {
    fs.mkdirSync(path.join(dir, 'locked'), {recursive: true});
    fs.chmodSync(path.join(dir, 'locked'), 0o555);
    /** @type {any} */
    let refused;
    try {
      await render('page.tsx', {cwd: dir, out: 'locked/page.html'});
    } catch (e) {
      refused = e;
    } finally {
      fs.chmodSync(path.join(dir, 'locked'), 0o755);
    }
    expect(refused?.code).toBe('ERR_WRITE_FAILED');
    expect(refused.message).toBe('Could not write locked/page.html: locked does not take a new file (EACCES); nothing was written.');
  }, 60_000);

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'a restore with --overwrite replaces a file this user cannot write, as it did',
    async () => {
      const solo = 'export default function Solo() {\n  return <p>Solo</p>;\n}\n';
      put('solo.tsx', solo);
      await render('solo.tsx', {cwd: dir});
      const file = put('read-only-back/solo.tsx', 'old\n');
      fs.chmodSync(file, 0o444);
      await render('solo.html', {cwd: dir, reverse: true, out: 'read-only-back/solo.tsx', overwrite: true});
      expect(fs.readFileSync(file, 'utf8')).toBe(solo);
    },
    60_000,
  );

  it('removes a temporary that a stopped run in this process space left beside its target, and keeps any other', async () => {
    const {pidSpace} = await import('../../foundation/release/cache.mjs');
    const space = `${os.hostname()}-${/\[(\d+)\]/.exec(pidSpace() ?? '')?.[1] ?? 'x'}`;
    // A process id no system gives out, so its run is gone.
    const left = path.join(dir, `.stale.html.tmp-${space}-999999999-${randomUUID()}`);
    const running = path.join(dir, `.stale.html.tmp-${space}-${process.pid}-${randomUUID()}`);
    // A run in another process-ID namespace cannot be seen from here, so its
    // temporary stays, whatever its process id.
    const elsewhere = path.join(dir, `.stale.html.tmp-${os.hostname()}-1-999999999-${randomUUID()}`);
    const leftFolder = path.join(dir, `.page-restored.tmp-${space}-999999999-${randomUUID()}`);
    for (const temporary of [left, running, elsewhere]) fs.writeFileSync(temporary, 'part of a file');
    put(path.relative(dir, path.join(leftFolder, 'page.tsx')), 'part of a folder');
    await render('page.tsx', {cwd: dir, out: 'stale.html'});
    const restored = /** @type {any} */ (await render('page.html', {cwd: dir, reverse: true}));
    expect(fs.existsSync(left)).toBe(false);
    expect(fs.existsSync(leftFolder)).toBe(false);
    expect(fs.existsSync(running)).toBe(true);
    expect(fs.existsSync(elsewhere)).toBe(true);
    fs.rmSync(running);
    fs.rmSync(elsewhere);
    fs.rmSync(path.join(dir, path.dirname(restored.data.output)), {recursive: true});
  }, 60_000);

  it('leaves no temporary file or folder behind', () => {
    expect(fs.readdirSync(dir).filter(name => name.includes('.tmp-'))).toEqual([]);
  });
});

describe('render(): embedded files stay inside the current folder', () => {
  it('refuses an embedded path that climbs out', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    put(
      'escape.html',
      `<!doctype html><html><body><p class="astryx-text">x</p>${sourceBlock('p.tsx', [
        {path: 'p.tsx', bytes: Buffer.from('export default () => null;')},
        {path: '../../../escaped.tsx', bytes: Buffer.from('x')},
      ])}</body></html>`,
    );
    expect(await codeOf(() => render('escape.html', {cwd: dir, reverse: true, out: 'esc/p.tsx'}))).toBe(
      'ERR_PATH_TRAVERSAL',
    );
    expect(fs.existsSync(path.join(dir, 'esc/p.tsx'))).toBe(false);
  });
});

describe('render(): what a page imports', () => {
  it('inlines an imported theme stylesheet, embeds local CSS, JSON and images, and gives them all back', async () => {
    put('node_modules/@acme/theme/package.json', JSON.stringify({name: '@acme/theme', version: '1.0.0'}));
    put('node_modules/@acme/theme/theme.css', ':root{--acme-brand:#123456}.acme-unused{color:red}');
    put('site/local.css', '.site-title{letter-spacing:2px}');
    put('site/data.json', JSON.stringify({title: 'From JSON'}));
    put('site/dot.png', PNG);
    put(
      'site/page.tsx',
      `import '@acme/theme/theme.css';
import './local.css';
import data from './data.json';
import dot from './dot.png';
export default function Page() {
  return (<main><h1 className="site-title">{data.title}</h1><img src={dot} alt="" /><a href="https://example.com/docs">Docs</a></main>);
}
`,
    );
    const result = /** @type {any} */ (await render('site/page.tsx', {cwd: dir}));
    expect(result.data.stylesheets).toContain('@acme/theme/theme.css');
    expect(result.data.files).toEqual(expect.arrayContaining(['page.tsx', 'local.css', 'data.json', 'dot.png']));
    // A plain link loads nothing, so it is not a remote-asset warning.
    expect(result.data.warnings.filter((/** @type {any} */ w) => w.code === 'remote-asset')).toEqual([]);
    const html = fs.readFileSync(path.join(dir, 'site/page.html'), 'utf8');
    expect(html).toContain('--acme-brand:#123456');
    expect(html).not.toContain('.acme-unused');
    expect(html).toContain('letter-spacing:2px');
    expect(html).toContain('From JSON');
    fs.copyFileSync(path.join(dir, 'site/page.html'), path.join(dir, 'moved.html'));
    const back = /** @type {any} */ (await render('moved.html', {cwd: dir, reverse: true, out: 'moved/page.tsx'}));
    expect(back.data.files.sort()).toEqual(
      ['moved/data.json', 'moved/dot.png', 'moved/local.css', 'moved/page.tsx'].sort(),
    );
    for (const name of ['page.tsx', 'local.css', 'data.json', 'dot.png']) {
      expect(fs.readFileSync(path.join(dir, 'moved', name))).toEqual(fs.readFileSync(path.join(dir, 'site', name)));
    }
    // The moved copy renders the same page again.
    const again = /** @type {any} */ (await render('moved/page.tsx', {cwd: dir}));
    expect(fs.readFileSync(path.join(dir, 'moved/page.html'), 'utf8')).toContain('From JSON');
    expect(again.type).toBe('render.page');
  }, 60_000);

  it('uses an explicit --title', async () => {
    const r = /** @type {any} */ (await render('page.tsx', {cwd: dir, out: 'titled.html', title: 'Q3 <report>'}));
    expect(r.data.output).toBe('titled.html');
    expect(fs.readFileSync(path.join(dir, 'titled.html'), 'utf8')).toContain('<title>Q3 &lt;report&gt;</title>');
  }, 60_000);
});

describe('render(): every write stays inside the current folder', () => {
  it('refuses an embedded entry path that climbs out', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    fs.mkdirSync(path.join(dir, 'inner'), {recursive: true});
    put(
      'inner/entry.html',
      `<body><p class="astryx-text">x</p>${sourceBlock('../../../outside.tsx', [
        {path: '../../../outside.tsx', bytes: Buffer.from('export default () => null;')},
      ])}</body>`,
    );
    expect(await codeOf(() => render('inner/entry.html', {cwd: dir, reverse: true}))).toBe('ERR_PATH_TRAVERSAL');
    expect(fs.existsSync(path.join(dir, 'inner/outside.tsx'))).toBe(false);
  });

  it('gives back a page that imports from a parent folder, keeping the layout inside the current folder', async () => {
    put('tree/src/components/Footer.tsx', 'export function Footer() { return <p>Parent footer</p>; }\n');
    put(
      'tree/src/app/page.tsx',
      "import {Footer} from '../components/Footer';\nexport default function Page() { return <main><h1>Tree</h1><Footer /></main>; }\n",
    );
    const cwd = path.join(dir, 'tree/src/app');
    const r = /** @type {any} */ (await render('page.tsx', {cwd}));
    expect(r.data.files).toEqual(['app/page.tsx', 'components/Footer.tsx']);
    // From the page's own folder, the neighbour would land outside it, beside
    // existing files: refused, naming a new folder to restore into.
    /** @type {any} */
    let refused;
    try {
      await render('page.html', {cwd, reverse: true, out: 'back.tsx'});
    } catch (e) {
      refused = e;
    }
    expect(refused?.code).toBe('ERR_PATH_TRAVERSAL');
    expect(refused.message).toContain('--out restored/app/back.tsx');
    expect(fs.existsSync(path.join(cwd, 'back.tsx'))).toBe(false);
    const back = /** @type {any} */ (await render('page.html', {cwd, reverse: true, out: 'restored/app/back.tsx'}));
    expect(back.data.files).toEqual(['restored/app/back.tsx', 'restored/components/Footer.tsx']);
    const again = /** @type {any} */ (await render('restored/app/back.tsx', {cwd}));
    expect(again.type).toBe('render.page');
    // From a folder that holds the whole tree, the page lands where asked.
    const up = path.join(dir, 'tree');
    const back2 = /** @type {any} */ (await render('src/app/page.html', {cwd: up, reverse: true, out: 'copy/app/page.tsx'}));
    expect(back2.data.output).toBe('copy/app/page.tsx');
    expect(back2.data.files).toEqual(['copy/app/page.tsx', 'copy/components/Footer.tsx']);
    // Into a folder with another name: each neighbour goes where the page's
    // own imports find it from there, and the page renders again.
    const renamed = /** @type {any} */ (
      await render('src/app/page.html', {cwd: up, reverse: true, out: 'src/reports/today/page.tsx'})
    );
    expect(renamed.data.output).toBe('src/reports/today/page.tsx');
    expect(renamed.data.files).toEqual(['src/reports/today/page.tsx', 'src/reports/components/Footer.tsx']);
    const rerendered = /** @type {any} */ (await render('src/reports/today/page.tsx', {cwd: up}));
    expect(rerendered.type).toBe('render.page');
  }, 60_000);

  it('resolves a tsconfig path alias', async () => {
    put('aliased/tsconfig.json', '{\n  // paths\n  "compilerOptions": {"baseUrl": ".", "paths": {"@/*": ["./src/*"]}},\n}\n');
    put('aliased/package.json', '{"name":"aliased","private":true}');
    put('aliased/src/Header.tsx', 'export function Header() { return <p>Aliased header</p>; }\n');
    put('aliased/src/page.tsx', "import {Header} from '@/Header';\nexport default function Page() { return <Header />; }\n");
    put('aliased/src/bad.tsx', "import X from '@/nope';\nexport default function Page() { return <X />; }\n");
    const r = /** @type {any} */ (await render('aliased/src/page.tsx', {cwd: dir}));
    expect(fs.readFileSync(path.join(dir, 'aliased/src/page.html'), 'utf8')).toContain('Aliased header');
    expect(r.data.files).toEqual(['page.tsx', 'Header.tsx']);
    expect(await codeOf(() => render('aliased/src/bad.tsx', {cwd: dir}))).toBe('ERR_FILE_NOT_FOUND');
  }, 60_000);

  it('reads the aliases of the referenced project that holds the page, behind a solution-style tsconfig.json', async () => {
    const vite = (/** @type {string} */ name) => {
      put(`${name}/package.json`, `{"name":"${name}","private":true}`);
      put(`${name}/tsconfig.json`, '{\n  "files": [],\n  "references": [{"path": "./tsconfig.app.json"}, {"path": "./tsconfig.node.json"}]\n}\n');
      put(`${name}/tsconfig.app.json`, '{\n  "compilerOptions": {"paths": {"@/*": ["./src/*"]}},\n  "include": ["src"],\n}\n');
      put(`${name}/tsconfig.node.json`, '{"compilerOptions": {"paths": {"@/*": ["./config/*"]}}, "include": ["vite.config.ts"]}\n');
    };
    vite('solution');
    put('solution/src/components/Header.tsx', 'export function Header() { return <p>Solution header</p>; }\n');
    put('solution/src/pages/page.tsx', "import {Header} from '@/components/Header';\nexport default function Page() { return <Header />; }\n");
    const r = /** @type {any} */ (await render('solution/src/pages/page.tsx', {cwd: dir}));
    expect(r.data.files).toEqual(['pages/page.tsx', 'components/Header.tsx']);
    expect(fs.readFileSync(path.join(dir, 'solution/src/pages/page.html'), 'utf8')).toContain('Solution header');
    // A project laid out the same way takes it back where its own alias points.
    vite('solution-to');
    fs.copyFileSync(path.join(dir, 'solution/src/pages/page.html'), path.join(dir, 'solution-to/page.html'));
    const back = /** @type {any} */ (await render('page.html', {cwd: path.join(dir, 'solution-to'), reverse: true, out: 'src/pages/page.tsx'}));
    expect(back.data).toMatchObject({exact: true, files: ['src/pages/page.tsx', 'src/components/Header.tsx']});
  }, 60_000);

  it('reads aliases through extends: a path without .json, a package, and a list whose later config wins', async () => {
    // A base config above the project: its baseUrl is read from its own folder.
    put('ext/tsconfig.base.json', '{"compilerOptions": {"baseUrl": "apps/web", "paths": {"@data/*": ["src/data/*"]}}}\n');
    put('ext/apps/web/package.json', '{"name":"web","private":true}');
    put('ext/apps/web/tsconfig.json', '{"extends": "../../tsconfig.base"}\n');
    put('ext/apps/web/src/data/rows.ts', "export const rows = ['North', 'South'];\n");
    put('ext/apps/web/src/pages/page.tsx', "import {rows} from '@data/rows';\nexport default function Page() { return <ul>{rows.map(r => <li key={r}>{r}</li>)}</ul>; }\n");
    const web = /** @type {any} */ (await render('ext/apps/web/src/pages/page.tsx', {cwd: dir}));
    expect(web.data.files).toEqual(['pages/page.tsx', 'data/rows.ts']);
    // A package's config, after one of the project's own: the later one wins,
    // and ${configDir} is the folder of the config the project reads.
    put('ext-pkg/package.json', '{"name":"ext-pkg","private":true}');
    put('ext-pkg/node_modules/@acme/tsconfig/package.json', '{"name":"@acme/tsconfig","version":"1.0.0"}');
    put('ext-pkg/node_modules/@acme/tsconfig/base.json', '{"compilerOptions": {"paths": {"@ui/*": ["${configDir}/src/ui/*"]}}}\n');
    put('ext-pkg/tsconfig.first.json', '{"compilerOptions": {"paths": {"@ui/*": ["./elsewhere/*"]}}}\n');
    put('ext-pkg/tsconfig.json', '{"extends": ["./tsconfig.first.json", "@acme/tsconfig/base.json"]}\n');
    put('ext-pkg/src/ui/Panel.tsx', 'export function Panel() { return <section>Panel from the package alias</section>; }\n');
    put('ext-pkg/src/page.tsx', "import {Panel} from '@ui/Panel';\nexport default function Page() { return <Panel />; }\n");
    const pkg = /** @type {any} */ (await render('ext-pkg/src/page.tsx', {cwd: dir}));
    expect(pkg.data.files).toEqual(['page.tsx', 'ui/Panel.tsx']);
    expect(fs.readFileSync(path.join(dir, 'ext-pkg/src/page.html'), 'utf8')).toContain('Panel from the package alias');
    // A package named alone: its tsconfig field, else its tsconfig.json,
    // never its code `main`.
    const config = '{"compilerOptions": {"paths": {"@ui/*": ["${configDir}/src/ui/*"]}}}\n';
    for (const [name, files, extendsName = name] of [
      ['js-main', {'package.json': '{"name":"js-main","version":"1.0.0","main":"index.js"}', 'index.js': 'module.exports = {};\n', 'tsconfig.json': config}],
      ['field', {'package.json': '{"name":"field","version":"1.0.0","main":"index.js","tsconfig":"./configs/base.json"}', 'index.js': 'module.exports = {};\n', 'configs/base.json': config}],
      // A package whose exports send "." to its config, or a pattern a subpath matches.
      ['dot', {'package.json': '{"name":"dot","version":"1.0.0","exports":{".":{"import":"./esm.json","require":"./configs/base.json"}}}', 'configs/base.json': config}],
      ['star', {'package.json': '{"name":"star","version":"1.0.0","exports":{"./*":"./configs/*.json"}}', 'configs/strict.json': config}, 'star/strict'],
      // Of two patterns, the one with the longer part before the `*` wins, as in Node.
      ['order', {'package.json': '{"name":"order","version":"1.0.0","exports":{"./*.json":"./wrong/*.json","./a*":"./right/a*"}}', 'right/ab.json': config, 'wrong/ab.json': '{"compilerOptions": {"paths": {"@ui/*": ["${configDir}/src/nowhere/*"]}}}\n'}, 'order/ab.json'],
    ]) {
      const root = `ext-${name}`;
      put(`${root}/package.json`, `{"name":"${root}","private":true}`);
      for (const [file, text] of Object.entries(files)) put(`${root}/node_modules/${name}/${file}`, text);
      put(`${root}/tsconfig.json`, `{"extends": "${extendsName}"}\n`);
      put(`${root}/src/ui/Panel.tsx`, 'export function Panel() { return <section>Panel</section>; }\n');
      put(`${root}/src/page.tsx`, "import {Panel} from '@ui/Panel';\nexport default function Page() { return <Panel />; }\n");
      const r = /** @type {any} */ (await render(`${root}/src/page.tsx`, {cwd: dir}));
      expect(r.data.files, name).toEqual(['page.tsx', 'ui/Panel.tsx']);
    }
    // A config package read through a link: from where it really is, so a
    // package it extends in turn, and paths that climb out of it, resolve
    // from there; and a nearer copy without the config is passed by.
    const panel = 'export function Panel() { return <section>Panel</section>; }\n';
    const page = "import {Panel} from '@ui/Panel';\nexport default function Page() { return <Panel />; }\n";
    put('ext-store/package.json', '{"name":"ext-store","private":true}');
    put('ext-store/node_modules/.pnpm/cfg@1.0.0/node_modules/cfg/package.json', '{"name":"cfg","version":"1.0.0"}');
    put('ext-store/node_modules/.pnpm/cfg@1.0.0/node_modules/cfg/tsconfig.json', '{"extends": "cfg-base"}\n');
    put('ext-store/node_modules/.pnpm/cfg@1.0.0/node_modules/cfg-base/package.json', '{"name":"cfg-base","version":"1.0.0"}');
    put('ext-store/node_modules/.pnpm/cfg@1.0.0/node_modules/cfg-base/tsconfig.json', '{"compilerOptions": {"paths": {"@ui/*": ["${configDir}/src/ui/*"]}}}\n');
    fs.symlinkSync(path.join(dir, 'ext-store/node_modules/.pnpm/cfg@1.0.0/node_modules/cfg'), path.join(dir, 'ext-store/node_modules/cfg'), 'junction');
    put('ext-store/tsconfig.json', '{"extends": "cfg"}\n');
    put('ext-store/src/ui/Panel.tsx', panel);
    put('ext-store/src/page.tsx', page);
    const store = /** @type {any} */ (await render('ext-store/src/page.tsx', {cwd: dir}));
    expect(store.data.files).toEqual(['page.tsx', 'ui/Panel.tsx']);
    put('ext-ws/package.json', '{"name":"ext-ws","private":true}');
    put('ext-ws/packages/tsconfig/package.json', '{"name":"@acme/tsconfig","version":"1.0.0"}');
    put('ext-ws/packages/tsconfig/base.json', '{"compilerOptions": {"paths": {"@ui/*": ["../ui/src/*"]}}}\n');
    put('ext-ws/packages/ui/src/Panel.tsx', panel);
    put('ext-ws/apps/web/package.json', '{"name":"web","private":true}');
    fs.mkdirSync(path.join(dir, 'ext-ws/apps/web/node_modules/@acme'), {recursive: true});
    fs.symlinkSync(path.join(dir, 'ext-ws/packages/tsconfig'), path.join(dir, 'ext-ws/apps/web/node_modules/@acme/tsconfig'), 'junction');
    put('ext-ws/apps/web/tsconfig.json', '{"extends": "@acme/tsconfig/base"}\n');
    put('ext-ws/apps/web/src/page.tsx', page);
    // The alias leads out of the app, to the workspace package it names.
    await render('ext-ws/apps/web/src/page.tsx', {cwd: dir});
    expect(fs.readFileSync(path.join(dir, 'ext-ws/apps/web/src/page.html'), 'utf8')).toContain('<section>Panel</section>');
    put('ext-near/package.json', '{"name":"ext-near","private":true}');
    put('ext-near/node_modules/shared-cfg/package.json', '{"name":"shared-cfg","version":"1.0.0"}');
    put('ext-near/node_modules/shared-cfg/tsconfig.json', '{"compilerOptions": {"paths": {"@ui/*": ["${configDir}/src/ui/*"]}}}\n');
    put('ext-near/app/package.json', '{"name":"app","private":true}');
    put('ext-near/app/node_modules/shared-cfg/package.json', '{"name":"shared-cfg","version":"0.1.0"}');
    put('ext-near/app/tsconfig.json', '{"extends": "shared-cfg"}\n');
    put('ext-near/app/src/ui/Panel.tsx', panel);
    put('ext-near/app/src/page.tsx', page);
    const near = /** @type {any} */ (await render('ext-near/app/src/page.tsx', {cwd: dir}));
    expect(near.data.files).toEqual(['page.tsx', 'ui/Panel.tsx']);
  }, 60_000);

  it('gives back a page that imports through an alias where this project\'s alias points', async () => {
    put('aliased-src/tsconfig.json', '{"compilerOptions": {"baseUrl": ".", "paths": {"@/*": ["./src/*"]}}}\n');
    put('aliased-src/package.json', '{"name":"aliased-src","private":true}');
    put('aliased-src/src/components/Header.tsx', 'export function Header() { return <p>Alias header</p>; }\n');
    put(
      'aliased-src/src/app/page.tsx',
      "import {Header} from '@/components/Header';\nexport default function Page() { return <Header />; }\n",
    );
    await render('aliased-src/src/app/page.tsx', {cwd: dir});
    // Another project with the same alias, and the guide's own command.
    put('aliased-to/tsconfig.json', '{"compilerOptions": {"baseUrl": ".", "paths": {"@/*": ["./src/*"]}}}\n');
    put('aliased-to/package.json', '{"name":"aliased-to","private":true}');
    fs.copyFileSync(path.join(dir, 'aliased-src/src/app/page.html'), path.join(dir, 'aliased-to/page.html'));
    const cwd = path.join(dir, 'aliased-to');
    // Into the project's existing folders: refused, without a suggestion that cannot work.
    put('aliased-to/src/keep.txt', 'existing\n');
    /** @type {any} */
    let refused;
    try {
      await render('page.html', {cwd, reverse: true, out: 'page.tsx'});
    } catch (e) {
      refused = e;
    }
    expect(refused?.code).toBe('ERR_PATH_TRAVERSAL');
    expect(refused.message).toContain('path alias');
    expect(refused.suggestions ?? []).toEqual([]);
    fs.rmSync(path.join(cwd, 'src'), {recursive: true});
    // Into a new folder the alias points into: the page and its import come back.
    const back = /** @type {any} */ (await render('page.html', {cwd, reverse: true, out: 'src/app/page.tsx'}));
    expect(back.data.files).toEqual(['src/app/page.tsx', 'src/components/Header.tsx']);
    const again = /** @type {any} */ (await render('src/app/page.tsx', {cwd}));
    expect(again.type).toBe('render.page');
    expect(fs.readFileSync(path.join(cwd, 'src/app/page.html'), 'utf8')).toContain('Alias header');
    // Without the alias, the file comes back in the page's own layout inside
    // the new folder, and the result names the import and its file.
    put('no-alias/package.json', '{"name":"no-alias","private":true}');
    fs.copyFileSync(path.join(dir, 'aliased-src/src/app/page.html'), path.join(dir, 'no-alias/page.html'));
    const away = /** @type {any} */ (await render('page.html', {cwd: path.join(dir, 'no-alias'), reverse: true}));
    expect(away.data).toMatchObject({
      exact: true,
      files: ['page-restored/app/page.tsx', 'page-restored/components/Header.tsx'],
      aliased: {
        config: 'tsconfig.json',
        paths: {'@/*': ['./page-restored/*']},
        imports: [{import: '@/components/Header', file: 'page-restored/components/Header.tsx'}],
      },
    });
    expect(fs.readFileSync(path.join(dir, 'no-alias/page-restored/components/Header.tsx'))).toEqual(
      fs.readFileSync(path.join(dir, 'aliased-src/src/components/Header.tsx')),
    );
  }, 60_000);

  it('names the whole paths a page needs: every target of an alias, and the entries a config inherits', async () => {
    put('multi/package.json', '{"name":"multi","private":true}');
    put('multi/tsconfig.json', '{"compilerOptions": {"paths": {"@/*": ["./src/*", "./generated/*"]}}}\n');
    put('multi/src/components/Header.tsx', 'export function Header() { return <h1>Multi</h1>; }\n');
    put('multi/generated/api/client.ts', "export const client = 'generated client';\n");
    put(
      'multi/src/app/page.tsx',
      "import {Header} from '@/components/Header';\nimport {client} from '@/api/client';\nexport default function Page() { return <main><Header />{client}</main>; }\n",
    );
    await render('multi/src/app/page.tsx', {cwd: dir});
    // A project whose config takes its paths from the config it extends.
    put('multi-to/package.json', '{"name":"multi-to","private":true}');
    put('multi-to/tsconfig.base.json', '{"compilerOptions": {"paths": {"$lib/*": ["./lib/*"]}}}\n');
    put('multi-to/tsconfig.json', '{"extends": "./tsconfig.base.json"}\n');
    fs.copyFileSync(path.join(dir, 'multi/src/app/page.html'), path.join(dir, 'multi-to/multi.html'));
    const back = /** @type {any} */ (await render('multi.html', {cwd: path.join(dir, 'multi-to'), reverse: true}));
    expect(back.data).toMatchObject({exact: true});
    expect(back.data.aliased).toEqual({
      config: 'tsconfig.json',
      paths: {
        '$lib/*': ['./lib/*'],
        '@/*': ['./multi-restored/generated/*', './multi-restored/src/*'],
        '@/api/client': ['./multi-restored/generated/api/client.ts'],
        '@/components/Header': ['./multi-restored/src/components/Header.tsx'],
      },
      imports: [
        {import: '@/api/client', file: 'multi-restored/generated/api/client.ts'},
        {import: '@/components/Header', file: 'multi-restored/src/components/Header.tsx'},
      ],
    });
    // An alias whose first target overrides files of the second: the page
    // renders again with the override, once the printed paths are set.
    put('ov/package.json', '{"name":"ov","private":true}');
    put('ov/tsconfig.json', '{"compilerOptions": {"paths": {"@/*": ["./src/overrides/*", "./src/*"]}}}\n');
    put('ov/src/Zed.tsx', "export function Zed() { return <p>base Zed</p>; }\n");
    put('ov/src/overrides/Zed.tsx', "import {Zed as Base} from '../Zed';\nexport function Zed() { return <section>override <Base /></section>; }\n");
    put('ov/src/Apple.tsx', "export function Apple() { return <p>Apple</p>; }\n");
    put('ov/src/page.tsx', "import {Zed} from '@/Zed';\nimport {Apple} from '@/Apple';\nexport default function Page() { return <main><Apple /><Zed /></main>; }\n");
    await render('ov/src/page.tsx', {cwd: dir});
    put('ov-to/package.json', '{"name":"ov-to","private":true}');
    fs.copyFileSync(path.join(dir, 'ov/src/page.html'), path.join(dir, 'ov-to/ov.html'));
    const ov = /** @type {any} */ (await render('ov.html', {cwd: path.join(dir, 'ov-to'), reverse: true}));
    expect(ov.data.aliased.paths['@/Zed']).toEqual(['./ov-restored/overrides/Zed.tsx']);
    put('ov-to/tsconfig.json', JSON.stringify({compilerOptions: {paths: ov.data.aliased.paths}}));
    await render('ov-restored/page.tsx', {cwd: path.join(dir, 'ov-to'), out: 'again.html'});
    expect(fs.readFileSync(path.join(dir, 'ov-to/again.html'), 'utf8')).toContain('override');
  }, 60_000);

  it('gives back an aliased page where no alias of the project names its imports: in its own layout, naming the paths to add', async () => {
    const {sourceBlock: sourceBlockOf} = await import('../../foundation/render/source-block.mjs');
    put('alias-home/tsconfig.json', '{"compilerOptions": {"paths": {"@/*": ["./src/*"], "@members": ["./src/lib/members.ts"]}}}\n');
    put('alias-home/package.json', '{"name":"alias-home","private":true}');
    put('alias-home/src/components/Header.tsx', 'export function Header() { return <h1>Team</h1>; }\n');
    put('alias-home/src/lib/members.ts', "export const members = ['Ana', 'Bo'];\n");
    put(
      'alias-home/src/app/team/page.tsx',
      "import {Header} from '@/components/Header';\nimport {members} from '@members';\nexport default function Page() { return <main><Header />{members.join(', ')}</main>; }\n",
    );
    await render('alias-home/src/app/team/page.tsx', {cwd: dir});
    // Someone with only the HTML file, in a project with no tsconfig.json.
    const cwd = path.join(dir, 'alias-away');
    put('alias-away/package.json', '{"name":"alias-away","private":true}');
    fs.copyFileSync(path.join(dir, 'alias-home/src/app/team/page.html'), path.join(cwd, 'team.html'));
    const back = /** @type {any} */ (await render('team.html', {cwd, reverse: true}));
    expect(back.data).toMatchObject({
      mode: 'embedded',
      exact: true,
      output: 'team-restored/app/team/page.tsx',
      aliased: {
        config: 'tsconfig.json',
        paths: {'@/*': ['./team-restored/*'], '@members': ['./team-restored/lib/members.ts']},
        imports: [
          {import: '@/components/Header', file: 'team-restored/components/Header.tsx'},
          {import: '@members', file: 'team-restored/lib/members.ts'},
        ],
      },
    });
    for (const name of ['app/team/page.tsx', 'components/Header.tsx', 'lib/members.ts']) {
      expect(fs.readFileSync(path.join(cwd, 'team-restored', name))).toEqual(fs.readFileSync(path.join(dir, 'alias-home/src', name)));
    }
    const {stdout} = await runCli(['experimental', 'render', '--reverse', 'team.html'], {cwd});
    expect(stdout).toContain('set the "paths" of tsconfig.json (create it if it is not there) to: "@/*": ["./team-restored-2/*"], "@members": ["./team-restored-2/lib/members.ts"].');
    // The entries are written for the config TypeScript reads there, from
    // its baseUrl.
    put('alias-base/package.json', '{"name":"alias-base","private":true}');
    put('alias-base/tsconfig.json', '{"compilerOptions": {"baseUrl": "src"}}\n');
    fs.copyFileSync(path.join(dir, 'alias-home/src/app/team/page.html'), path.join(dir, 'alias-base/team.html'));
    const based = /** @type {any} */ (await render('team.html', {cwd: path.join(dir, 'alias-base'), reverse: true, out: 'src/team/app/team/page.tsx'}));
    expect(based.data.aliased).toMatchObject({config: 'tsconfig.json', paths: {'@/*': ['./team/*'], '@members': ['./team/lib/members.ts']}});
    // A record never remaps a package: a forged entry for `react` is not
    // followed, and the file it names is refused.
    put(
      'alias-away/forged-react.html',
      `<!doctype html><html><body><p class="astryx-text">x</p>${sourceBlockOf(
        'page.tsx',
        [
          {path: 'page.tsx', bytes: Buffer.from("import React from 'react';\nexport default function Page() { return React.createElement('p', null, 'x'); }\n")},
          {path: 'lib/react.ts', bytes: Buffer.from('export default {};\n')},
        ],
        {aliases: {react: 'lib/react.ts'}},
      )}</body></html>`,
    );
    expect(await codeOf(() => render('forged-react.html', {cwd, reverse: true}))).toBe('ERR_RENDER_SOURCE_DAMAGED');
    expect(fs.existsSync(path.join(cwd, 'forged-react-restored'))).toBe(false);
    // Nor a package's own subpath import, which its package.json may map.
    put(
      'alias-away/forged-hash.html',
      `<!doctype html><html><body><p class="astryx-text">x</p>${sourceBlockOf(
        'page.tsx',
        [
          {path: 'page.tsx', bytes: Buffer.from("import {u} from '#utils';\nexport default function Page() { return <p>{u}</p>; }\n")},
          {path: 'lib/utils.ts', bytes: Buffer.from("export const u = 'x';\n")},
        ],
        {aliases: {'#utils': 'lib/utils.ts'}},
      )}</body></html>`,
    );
    expect(await codeOf(() => render('forged-hash.html', {cwd, reverse: true}))).toBe('ERR_RENDER_SOURCE_DAMAGED');
    expect(fs.existsSync(path.join(cwd, 'forged-hash-restored'))).toBe(false);
    // A record entry that names no carried file counts for nothing.
    put(
      'alias-away/forged.html',
      `<!doctype html><html><body><p class="astryx-text">x</p>${sourceBlockOf(
        'page.tsx',
        [
          {path: 'page.tsx', bytes: Buffer.from("import {X} from '@/x';\nexport default function Page() { return <X />; }\n")},
          {path: 'other.ts', bytes: Buffer.from('export const other = 1;\n')},
        ],
        {aliases: {'@/x': 'missing.ts'}},
      )}</body></html>`,
    );
    expect(await codeOf(() => render('forged.html', {cwd, reverse: true}))).toBe('ERR_RENDER_SOURCE_DAMAGED');
  }, 60_000);

  it('never writes through a symbolic link or over a protected file, even with --overwrite', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    const page = {path: 'page.tsx', bytes: Buffer.from("import './styles.css';\nexport default () => null;\n")};
    const css = {path: 'styles.css', bytes: Buffer.from('.a{}\n')};
    put('prot/page.html', `<body><p class="astryx-text">x</p>${sourceBlock('page.tsx', [page, css])}</body>`);
    const cwd = path.join(dir, 'prot');
    // A symbolic link inside the folder, onto a file the refusal never named.
    put('prot/real.css', 'original\n');
    fs.mkdirSync(path.join(cwd, 'out'), {recursive: true});
    fs.symlinkSync(path.join(cwd, 'real.css'), path.join(cwd, 'out/styles.css'));
    expect(await codeOf(() => render('page.html', {cwd, reverse: true, out: 'out/page.tsx', overwrite: true}))).toBe(
      'ERR_PATH_TRAVERSAL',
    );
    expect(fs.readFileSync(path.join(cwd, 'real.css'), 'utf8')).toBe('original\n');
    // A generated file and an ignored file are never replaced.
    put('prot/alone.html', `<body><p class="astryx-text">x</p>${sourceBlock('page.tsx', [{path: 'page.tsx', bytes: Buffer.from('export default () => null;\n')}])}</body>`);
    put('prot/gen/page.tsx', '// @generated\nexport default () => null;\n');
    expect(await codeOf(() => render('alone.html', {cwd, reverse: true, out: 'gen/page.tsx', overwrite: true}))).toBe(
      'ERR_FILE_EXISTS',
    );
    expect(fs.readFileSync(path.join(cwd, 'gen/page.tsx'), 'utf8')).toContain('@generated');
    put('prot/.gitignore', 'ignored/\n');
    put('prot/ignored/page.tsx', 'mine\n');
    expect(await codeOf(() => render('alone.html', {cwd, reverse: true, out: 'ignored/page.tsx', overwrite: true}))).toBe(
      'ERR_FILE_EXISTS',
    );
    expect(fs.readFileSync(path.join(cwd, 'ignored/page.tsx'), 'utf8')).toBe('mine\n');
  });

  it('refuses a configuration file a received page imports from above it', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    for (const name of ['babel.config.json', 'jest.config.json', 'project.json']) {
      const page = {path: 'src/app/page.tsx', bytes: Buffer.from(`import c from '../../${name}';\nexport default () => null;\n`)};
      put('cfg-above.html', `<body><p class="astryx-text">x</p>${sourceBlock('src/app/page.tsx', [page, {path: name, bytes: Buffer.from('{}')}])}</body>`);
      expect(await codeOf(() => render('cfg-above.html', {cwd: dir, reverse: true, out: 'cfg-above/src/app/page.tsx'}))).toBe(
        'ERR_RENDER_SOURCE_DAMAGED',
      );
      expect(fs.existsSync(path.join(dir, 'cfg-above', name))).toBe(false);
    }
  });

  it('restores a short alias import to the file it names', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    put('short-alias/tsconfig.json', '{"compilerOptions": {"baseUrl": ".", "paths": {"@/*": ["./src/*"]}}}\n');
    const page = {path: 'page.tsx', bytes: Buffer.from("import {t} from '@/t';\nexport default () => t;\n")};
    put('short-alias/page.html', `<body><p class="astryx-text">x</p>${sourceBlock('page.tsx', [page, {path: 't.ts', bytes: Buffer.from("export const t = 'x';\n")}])}</body>`);
    const back = /** @type {any} */ (await render('page.html', {cwd: path.join(dir, 'short-alias'), reverse: true, out: 'src/page.tsx'}));
    expect(back.data.files).toEqual(['src/page.tsx', 'src/t.ts']);
  });

  it('writes a page rebuilt from markup into a new folder by default', async () => {
    put('rebuilt-default/middleware.html', '<body><div class="astryx-stack"><p class="astryx-text">Hi</p></div></body>');
    const cwd = path.join(dir, 'rebuilt-default');
    const back = /** @type {any} */ (await render('middleware.html', {cwd, reverse: true}));
    expect(back.data.mode).toBe('rebuilt');
    expect(back.data.output).toBe('middleware-restored/page.tsx');
    expect(fs.existsSync(path.join(cwd, 'middleware.tsx'))).toBe(false);
  });

  it('inlines a stylesheet\'s own url()s from the stylesheet\'s folder', async () => {
    put('sheet-url/styles/bg.png', PNG);
    put('sheet-url/styles/page.css', '.hero { background: url("./bg.png"); }\n');
    put('sheet-url/page.tsx', "import './styles/page.css';\nexport default function Page() { return <div className=\"hero\">Hi</div>; }\n");
    const r = /** @type {any} */ (await render('sheet-url/page.tsx', {cwd: dir}));
    expect(r.data.warnings.map((/** @type {any} */ w) => w.code)).not.toContain('missing-asset');
    expect(fs.readFileSync(path.join(dir, 'sheet-url/page.html'), 'utf8')).toContain('url("data:image/png;base64,');
  }, 60_000);

  it('carries images the page names by path, in markup and in a stylesheet, and gives them back', async () => {
    put('by-path/logo.png', PNG);
    put('by-path/styles/bg.png', PNG);
    put('by-path/styles/page.css', '.hero { background: url("./bg.png"); }\n');
    put('by-path/page.tsx', "import './styles/page.css';\nexport default function Page() { return <div className=\"hero\"><img src=\"./logo.png\" alt=\"\" /></div>; }\n");
    const r = /** @type {any} */ (await render('by-path/page.tsx', {cwd: dir}));
    expect(r.data.files).toEqual(expect.arrayContaining(['page.tsx', 'styles/page.css', 'logo.png', 'styles/bg.png']));
    const back = /** @type {any} */ (await render('by-path/page.html', {cwd: dir, reverse: true, out: 'by-path-back/page.tsx'}));
    expect(back.data.exact).toBe(true);
    expect(back.data.files).toEqual(
      expect.arrayContaining(['by-path-back/page.tsx', 'by-path-back/logo.png', 'by-path-back/styles/bg.png']),
    );
    const again = /** @type {any} */ (await render('by-path-back/page.tsx', {cwd: dir}));
    expect(again.data.warnings.map((/** @type {any} */ w) => w.code)).not.toContain('missing-asset');
  }, 60_000);

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'leaves out a named image it cannot read, and says so, instead of ending the render',
    async () => {
      put('locked-name/locked.png', PNG);
      put('locked-name/names.ts', "export const locked = './locked.png';\n");
      put('locked-name/page.tsx', "import {locked} from './names';\nexport default function Page() {\n  return <p>{locked.length}</p>;\n}\n");
      fs.chmodSync(path.join(dir, 'locked-name/locked.png'), 0o000);
      try {
        const result = /** @type {any} */ (await render('locked-name/page.tsx', {cwd: dir}));
        expect(result.data.files).toEqual(['page.tsx', 'names.ts']);
        expect(result.data.warnings).toContainEqual({
          code: 'not-embedded',
          message: 'locked.png is named in names.ts but not carried in the file: it cannot be read (EACCES), so --reverse cannot give it back.',
        });
      } finally {
        fs.chmodSync(path.join(dir, 'locked-name/locked.png'), 0o644);
      }
    },
    60_000,
  );

  it('renders a page whose module names a path the system cannot look up', async () => {
    put('long-name/names.ts', `export const far = './${'a'.repeat(300)}.png';\n`);
    put('long-name/page.tsx', "import {far} from './names';\nexport default function Page() {\n  return <p>{far.length}</p>;\n}\n");
    const result = /** @type {any} */ (await render('long-name/page.tsx', {cwd: dir}));
    expect(result.data.files).toEqual(['page.tsx', 'names.ts']);
  }, 60_000);

  it('leaves out a named image outside the folder that holds the carried files, so the layout stays', async () => {
    // A page under a tests/ folder: were the layout to move above it, its
    // module would land under tests/, which a render never carries.
    put('shared/far.png', PNG);
    put('up/tests/icons.ts', "export const icons = {far: '../../shared/far.png'};\n");
    put('up/tests/page.tsx', "import {icons} from './icons';\nexport default function Page() {\n  return <p>{Object.keys(icons).join(', ')}</p>;\n}\n");
    const result = /** @type {any} */ (await render('up/tests/page.tsx', {cwd: dir}));
    expect(result.data.files).toEqual(['page.tsx', 'icons.ts']);
    const back = /** @type {any} */ (await render('up/tests/page.html', {cwd: dir, reverse: true, out: 'up-back/page.tsx'}));
    expect(back.data).toMatchObject({exact: true, files: ['up-back/page.tsx', 'up-back/icons.ts']});
  }, 60_000);

  it('leaves out a named image larger than a render carries, and says so', async () => {
    put('named-big/huge.png', Buffer.concat([PNG, Buffer.alloc(9 * 1024 * 1024)]));
    put('named-big/icons.ts', "export const icons = {big: './huge.png'};\n");
    put('named-big/page.tsx', "import {icons} from './icons';\nexport default function Page() {\n  return <p>{Object.keys(icons).join(', ')}</p>;\n}\n");
    const result = /** @type {any} */ (await render('named-big/page.tsx', {cwd: dir}));
    expect(result.data.files).not.toContain('huge.png');
    expect(result.data.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({code: 'not-embedded', message: expect.stringContaining('huge.png is named in icons.ts but not carried in the file: it is larger than 8 MB')}),
      ]),
    );
  }, 60_000);

  it('carries an image a module or a stylesheet names that the page did not show, and gives every file back', async () => {
    put('named/img/shown.png', PNG);
    put('named/img/other.png', PNG);
    put('named/img/unused-bg.png', PNG);
    put('named/icons.ts', "export const icons = {shown: './img/shown.png', other: './img/other.png'};\n");
    put('named/styles.css', '.used { color: red; }\n.unused { background: url("./img/unused-bg.png"); }\n');
    put('named/page.tsx', "import './styles.css';\nimport {icons} from './icons';\nexport default function Page() { return <img className=\"used\" src={icons.shown} alt=\"\" />; }\n");
    const r = /** @type {any} */ (await render('named/page.tsx', {cwd: dir}));
    expect(r.data.files).toEqual(expect.arrayContaining(['img/shown.png', 'img/other.png', 'img/unused-bg.png']));
    const back = /** @type {any} */ (await render('named/page.html', {cwd: dir, reverse: true, out: 'named-back/page.tsx'}));
    expect(back.data).toMatchObject({exact: true});
    expect(back.data.missing).toBeUndefined();
    expect(fs.readFileSync(path.join(dir, 'named-back/img/other.png'))).toEqual(PNG);
  }, 60_000);

  it('gives back images named any way the render carried them', async () => {
    put('spell/logo.png', PNG);
    put('spell/images/bg.png', PNG);
    put('spell/pic.png', PNG);
    put('spell/tpl.png', PNG);
    put('spell/card.png', PNG);
    put('spell/styles.css', '.hero { background: url(images/bg.png); }\n');
    put('spell/data.json', '{"img": "pic.png"}\n');
    put('spell/components/Card.tsx', 'export function Card() { return <img src="card.png" alt="" />; }\n');
    put(
      'spell/page.tsx',
      [
        "import './styles.css';",
        "import data from './data.json';",
        "import {Card} from './components/Card';",
        "const name = 'tpl';",
        'export default function Page() {',
        '  return <div className="hero"><img src="logo.png" alt="" /><img src={data.img} alt="" /><img src={`./${name}.png`} alt="" /><Card /></div>;',
        '}',
        '',
      ].join('\n'),
    );
    const r = /** @type {any} */ (await render('spell/page.tsx', {cwd: dir}));
    expect(r.data.files).toEqual(expect.arrayContaining(['logo.png', 'images/bg.png', 'pic.png', 'tpl.png', 'card.png']));
    const back = /** @type {any} */ (await render('spell/page.html', {cwd: dir, reverse: true, out: 'spell-back/page.tsx'}));
    expect(back.data.exact).toBe(true);
    for (const f of ['logo.png', 'images/bg.png', 'pic.png', 'tpl.png', 'card.png']) {
      expect(fs.existsSync(path.join(dir, 'spell-back', f))).toBe(true);
    }
    const again = /** @type {any} */ (await render('spell-back/page.tsx', {cwd: dir}));
    expect(again.data.warnings.map((/** @type {any} */ w) => w.code)).not.toContain('missing-asset');
  }, 60_000);

  it('round-trips an image or font whose bytes and extension disagree', async () => {
    put('mismatch/photo.png', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]));
    put('mismatch/fonts/face.otf', Buffer.from([0, 1, 0, 0, 0, 10, 0, 128, 0, 3]));
    put('mismatch/styles.css', "@font-face { font-family: Face; src: url(fonts/face.otf); }\n.t { font-family: Face; }\n");
    put('mismatch/page.tsx', "import './styles.css';\nexport default function Page() { return <p className=\"t\"><img src=\"photo.png\" alt=\"\" />Hi</p>; }\n");
    const r = /** @type {any} */ (await render('mismatch/page.tsx', {cwd: dir}));
    expect(r.data.files).toEqual(expect.arrayContaining(['photo.png', 'fonts/face.otf']));
    const back = /** @type {any} */ (await render('mismatch/page.html', {cwd: dir, reverse: true, out: 'mismatch-back/page.tsx'}));
    expect(back.data.exact).toBe(true);
    expect(back.data.files).toEqual(expect.arrayContaining(['mismatch-back/photo.png', 'mismatch-back/fonts/face.otf']));
  }, 60_000);

  it('leaves out a path-named "image" whose bytes are not one, and says so', async () => {
    put('notimg/fake.png', 'console.log(1)\n');
    put('notimg/page.tsx', 'export default function Page() { return <img src="fake.png" alt="" />; }\n');
    const r = /** @type {any} */ (await render('notimg/page.tsx', {cwd: dir}));
    expect(r.data.files).toEqual(['page.tsx']);
    expect(r.data.warnings.map((/** @type {any} */ w) => w.code)).toContain('not-embedded');
  }, 60_000);

  it('inlines style-attribute images in every url() form and keeps the element whole', async () => {
    put('styleattr/a.png', PNG);
    put('styleattr/b.png', PNG);
    put(
      'styleattr/page.tsx',
      [
        'export default function Page() {',
        '  return (',
        '    <div>',
        `      <div id="q" style={{backgroundImage: 'url("./a.png")'}}>Q</div>`,
        `      <div id="u" style={{backgroundImage: 'url(b.png)'}}>U</div>`,
        `      <div id="r" style={{backgroundImage: "url('https://example.com/x.png')"}}>R</div>`,
        '    </div>',
        '  );',
        '}',
        '',
      ].join('\n'),
    );
    const r = /** @type {any} */ (await render('styleattr/page.tsx', {cwd: dir}));
    const html = fs.readFileSync(path.join(dir, 'styleattr/page.html'), 'utf8');
    const {parseHtml} = await import('../../foundation/render/html-reader.mjs');
    /** @param {any} n @param {string} id @returns {any} */
    const byId = (n, id) => {
      if (n.attrs?.id === id) return n;
      for (const c of n.children ?? []) {
        const f = byId(c, id);
        if (f) return f;
      }
      return null;
    };
    const doc = parseHtml(html);
    expect(byId(doc, 'q').attrs.style).toContain('url("data:image/png;base64,');
    expect(byId(doc, 'u').attrs.style).toContain('url("data:image/png;base64,');
    expect(byId(doc, 'q').children[0].text).toBe('Q');
    expect(r.data.warnings.map((/** @type {any} */ w) => w.code)).toContain('remote-asset');
    expect(r.data.files).toEqual(expect.arrayContaining(['a.png', 'b.png']));
  }, 60_000);

  it('carries a stylesheet pulled in by @import and gives it back, and says when one is missing', async () => {
    put('imp/styles/main.css', "@import './parts/base.css';\n@import url('https://example.com/f.css');\n.m { color: red; }\n");
    put('imp/styles/parts/base.css', '.b { color: blue; background: url(./dot.png); }\n');
    put('imp/styles/parts/dot.png', PNG);
    put('imp/page.tsx', "import './styles/main.css';\nexport default function Page() { return <p className=\"m b\">Hi</p>; }\n");
    const r = /** @type {any} */ (await render('imp/page.tsx', {cwd: dir}));
    expect(r.data.files).toEqual(expect.arrayContaining(['styles/main.css', 'styles/parts/base.css', 'styles/parts/dot.png']));
    const html = fs.readFileSync(path.join(dir, 'imp/page.html'), 'utf8');
    expect(html).toContain('color: blue');
    expect(html).not.toContain('@import');
    expect(r.data.warnings.map((/** @type {any} */ w) => w.code)).toContain('remote-asset');
    const back = /** @type {any} */ (await render('imp/page.html', {cwd: dir, reverse: true, out: 'imp-back/page.tsx'}));
    expect(back.data.exact).toBe(true);
    expect(back.data.files).toEqual(expect.arrayContaining(['imp-back/styles/parts/base.css']));
    // A file whose @import target it does not carry says so.
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    put('imp-missing.html', `<body><p class="astryx-text">x</p>${sourceBlock('page.tsx', [{path: 'page.tsx', bytes: Buffer.from("import './a.css';\nexport default () => null;\n")}, {path: 'a.css', bytes: Buffer.from("@import './gone.css';\n")}])}</body>`);
    const partial = /** @type {any} */ (await render('imp-missing.html', {cwd: dir, reverse: true, out: 'imp-missing/page.tsx'}));
    expect(partial.data.exact).toBe(false);
    expect(partial.data.missing).toEqual(['gone.css']);
  }, 60_000);

  it('handles every kind of stylesheet import', async () => {
    const themeFonts = fs.readFileSync(path.join(CLI_DIR, '../themes/butter/fonts.css'), 'utf8');
    put('kinds/fonts.css', themeFonts);
    put('kinds/legacy.css', '.legacy-btn { padding: 3px; }\n');
    put('kinds/main.css', "@import './fonts.css';\n@import './legacy.css' layer(reset);\n@import './print.css' print;\n@import '@astryxdesign/core/astryx.css';\n.k { color: red; }\n");
    put('kinds/print.css', '.p { color: black; }\n');
    put('kinds/page.tsx', "import './main.css';\nexport default function Page() { return <p className=\"k legacy-btn p\">Hi</p>; }\n");
    const r = /** @type {any} */ (await render('kinds/page.tsx', {cwd: dir}));
    const html = fs.readFileSync(path.join(dir, 'kinds/page.html'), 'utf8');
    expect(html).toMatch(/@layer reset\s*\{[^}]*\.legacy-btn/);
    expect(html).toMatch(/@media print\s*\{[^}]*\.p/);
    expect(html).not.toContain('@import');
    const codes = r.data.warnings.map((/** @type {any} */ w) => w.code);
    expect(codes).toContain('remote-asset');
    expect(r.data.warnings.some((/** @type {any} */ w) => w.message.includes('astryx.css'))).toBe(false);
    expect(r.data.files).not.toContain(expect.stringContaining('node_modules'));
    // The package import is neither carried nor missing when given back.
    const back = /** @type {any} */ (await render('kinds/page.html', {cwd: dir, reverse: true, out: 'kinds-back/page.tsx'}));
    expect(back.data.exact).toBe(true);
    // Sass is named, CSS Modules refused with a clear message.
    put('kinds/sass.tsx', "import './x.scss';\nexport default function Page() { return <p>Hi</p>; }\n");
    const sass = /** @type {any} */ (await render('kinds/sass.tsx', {cwd: dir}));
    expect(sass.data.warnings.some((/** @type {any} */ w) => w.message.includes('x.scss'))).toBe(true);
    put('kinds/x.module.css', '.a { color: red; }\n');
    put('kinds/mod.tsx', "import styles from './x.module.css';\nexport default function Page() { return <p className={styles.a}>Hi</p>; }\n");
    /** @type {any} */
    let error;
    try {
      await render('kinds/mod.tsx', {cwd: dir});
    } catch (e) {
      error = e;
    }
    expect(error?.code).toBe('ERR_RENDER_FAILED');
    expect(error.message).toContain('CSS Modules');
  }, 90_000);

  it('refuses any stylesheet imported as a value, inlines Core once, ignores commented imports, and names a broken stylesheet', async () => {
    put('more/x.module.scss', '.a { color: red; }\n');
    put('more/scssmod.tsx', "import styles from './x.module.scss';\nexport default function Page() { return <p className={styles.a}>Hi</p>; }\n");
    /** @type {any} */
    let error;
    try {
      await render('more/scssmod.tsx', {cwd: dir});
    } catch (e) {
      error = e;
    }
    expect(error?.code).toBe('ERR_RENDER_FAILED');
    expect(error.message).toContain('x.module.scss');
    // A globals.css that imports Core: Core's rules once, listed once.
    put('more/plain.tsx', "export default function Page() { return <p className=\"astryx-text\">Hi</p>; }\n");
    put('more/globals.css', "@import '@astryxdesign/core/astryx.css';\n");
    put('more/withcore.tsx', "import './globals.css';\nexport default function Page() { return <p className=\"astryx-text\">Hi</p>; }\n");
    const plain = /** @type {any} */ (await render('more/plain.tsx', {cwd: dir}));
    const withCore = /** @type {any} */ (await render('more/withcore.tsx', {cwd: dir}));
    // Within a few bytes (the emptied import line), not a second copy of Core.
    expect(Math.abs(withCore.data.cssBytes - plain.data.cssBytes)).toBeLessThan(16);
    expect(withCore.data.stylesheets.filter((/** @type {string} */ x) => x.endsWith('astryx.css'))).toHaveLength(1);
    // A commented-out import does not make a full restore partial.
    put('more/commented.css', "/* @import './gone.css'; */\n.c { color: red; }\n");
    put('more/commented.tsx', "import './commented.css';\nexport default function Page() { return <p className=\"c\">Hi</p>; }\n");
    await render('more/commented.tsx', {cwd: dir});
    const back = /** @type {any} */ (await render('more/commented.html', {cwd: dir, reverse: true, out: 'more-back/page.tsx'}));
    expect(back.data.exact).toBe(true);
    // A stylesheet that is not CSS: a documented code, naming the file.
    put('more/broken.css', '.b { color: red;\n');
    put('more/broken.tsx', "import './broken.css';\nexport default function Page() { return <p className=\"b\">Hi</p>; }\n");
    /** @type {any} */
    let broken;
    try {
      await render('more/broken.tsx', {cwd: dir});
    } catch (e) {
      broken = e;
    }
    expect(broken?.code).toBe('ERR_RENDER_COMPILE');
    expect(broken.message).toContain('broken.css');
  }, 90_000);

  it('resolves aliased stylesheets and images, inlines a shared sheet once in first-import order, and names a broken @import', async () => {
    put('al/tsconfig.json', '{"compilerOptions": {"baseUrl": ".", "paths": {"@/*": ["./src/*"]}}}\n');
    put('al/package.json', '{"name":"al","private":true}');
    put('al/src/styles/site.css', '.site { color: red; }\n');
    put('al/src/assets/logo.png', PNG);
    put('al/src/page.tsx', "import '@/styles/site.css';\nimport logo from '@/assets/logo.png';\nexport default function Page() { return <p className=\"site\"><img src={logo} alt=\"\" />Hi</p>; }\n");
    const r = /** @type {any} */ (await render('al/src/page.tsx', {cwd: dir}));
    const html = fs.readFileSync(path.join(dir, 'al/src/page.html'), 'utf8');
    expect(html).toContain('color: red');
    expect(html).toContain('data:image/png;base64,');
    expect(r.data.warnings.map((/** @type {any} */ w) => w.code)).not.toContain('missing-asset');
    // One sheet shared by two modules, a third sheet between them.
    put('order/shared.css', '.o { color: red; }\n');
    put('order/middle.css', '.o { color: blue; }\n');
    put('order/A.tsx', "import './shared.css';\nexport const A = () => null;\n");
    put('order/B.tsx', "import './middle.css';\nimport './shared.css';\nexport const B = () => null;\n");
    put('order/page.tsx', "import {A} from './A';\nimport {B} from './B';\nexport default function Page() { return <p className=\"o\"><A /><B />Hi</p>; }\n");
    await render('order/page.tsx', {cwd: dir});
    const orderHtml = fs.readFileSync(path.join(dir, 'order/page.html'), 'utf8');
    expect(orderHtml.match(/color: red/g)).toHaveLength(1);
    expect(orderHtml.indexOf('color: red')).toBeLessThan(orderHtml.indexOf('color: blue'));
    // A broken @import target: the same documented code, naming both files.
    put('bad-imp/inner.css', '.x { color: red;\n');
    put('bad-imp/outer.css', "@import './inner.css';\n.y { color: blue; }\n");
    put('bad-imp/page.tsx', "import './outer.css';\nexport default function Page() { return <p className=\"x y\">Hi</p>; }\n");
    /** @type {any} */
    let error;
    try {
      await render('bad-imp/page.tsx', {cwd: dir});
    } catch (e) {
      error = e;
    }
    expect(error?.code).toBe('ERR_RENDER_COMPILE');
    expect(error.message).toContain('inner.css');
    expect(error.message).toContain('outer.css');
    // A stylesheet import naming a missing file, directly or through an alias.
    for (const spec of ['./gone.css', '@/styles/gone.css']) {
      put('al/src/missing.tsx', `import '${spec}';\nexport default function Page() { return <p>Hi</p>; }\n`);
      /** @type {any} */
      let missing;
      try {
        await render('al/src/missing.tsx', {cwd: dir});
      } catch (e) {
        missing = e;
      }
      expect(missing?.code).toBe('ERR_FILE_NOT_FOUND');
      expect(missing.message).toContain('gone.css');
    }
  }, 90_000);

  it('resolves tsconfig paths by TypeScript rules: exact keys, a star anywhere, targets in order', async () => {
    put(
      'tsp/tsconfig.json',
      JSON.stringify({
        compilerOptions: {
          baseUrl: '.',
          paths: {
            '@lib': ['./libsrc/index.ts'],
            '@lib/*': ['./libsrc/*'],
            '~*': ['./missing/*', './other/*'],
            'theme-*-x': ['./themes/*.ts'],
          },
        },
      }),
    );
    put('tsp/package.json', '{"name":"tsp","private":true}');
    put('tsp/libsrc/index.ts', "export const Lib = 'lib-index';\n");
    put('tsp/libsrc/button.tsx', "export const Button = () => <b>lib-button</b>;\n");
    put('tsp/other/util.ts', "export const util = 'second-target';\n");
    put('tsp/themes/blue.ts', "export const theme = 'mid-star';\n");
    put(
      'tsp/page.tsx',
      [
        "import {Lib} from '@lib';",
        "import {Button} from '@lib/button';",
        "import {util} from '~util';",
        "import {theme} from 'theme-blue-x';",
        'export default function Page() { return <p>{Lib} {util} {theme} <Button /></p>; }',
        '',
      ].join('\n'),
    );
    await render('tsp/page.tsx', {cwd: dir});
    const html = fs.readFileSync(path.join(dir, 'tsp/page.html'), 'utf8');
    for (const text of ['lib-index', 'lib-button', 'second-target', 'mid-star']) expect(html).toContain(text);
  }, 60_000);

  it('loads a JSON file through any key shape, from the first target that has it, and gives it back', async () => {
    put('jsonp/tsconfig.json', JSON.stringify({compilerOptions: {baseUrl: '.', paths: {'~*': ['./lib/data/*'], 'cfg-*': ['./lib/missing/*', './lib/more/*']}}}));
    put('jsonp/package.json', '{"name":"jsonp","private":true}');
    put('jsonp/lib/data/cfg.json', '{"label":"first-target-json"}\n');
    put('jsonp/lib/more/extra.json', '{"label":"later-target-json"}\n');
    put(
      'jsonp/page.tsx',
      "import cfg from '~cfg.json';\nimport extra from 'cfg-extra.json';\nexport default function Page() { return <p>{cfg.label} {extra.label}</p>; }\n",
    );
    const r = /** @type {any} */ (await render('jsonp/page.tsx', {cwd: dir}));
    expect(r.data.files).toEqual(expect.arrayContaining(['page.tsx', 'lib/data/cfg.json', 'lib/more/extra.json']));
    const html = fs.readFileSync(path.join(dir, 'jsonp/page.html'), 'utf8');
    expect(html).toContain('first-target-json');
    expect(html).toContain('later-target-json');
    // Back into a project with the same paths: each file goes where its alias points.
    fs.mkdirSync(path.join(dir, 'jsonp-to'), {recursive: true});
    put('jsonp-to/tsconfig.json', fs.readFileSync(path.join(dir, 'jsonp/tsconfig.json'), 'utf8'));
    put('jsonp-to/package.json', '{"name":"jsonp-to","private":true}');
    fs.copyFileSync(path.join(dir, 'jsonp/page.html'), path.join(dir, 'jsonp-to/page.html'));
    const back = /** @type {any} */ (await render('page.html', {cwd: path.join(dir, 'jsonp-to'), reverse: true, out: 'lib/app/page.tsx'}));
    // The file sent from the later target goes back under that target.
    expect(back.data.files).toEqual(expect.arrayContaining(['lib/data/cfg.json', 'lib/more/extra.json']));
  }, 60_000);

  it.each([
    ['folder names that end alike', ['./lib/app/*', './lib/webapp/*'], 'lib/webapp/Top.tsx', 'lib/webapp/Top.tsx'],
    ['targets that share their last folder', ['./lib/ui/src/*', './lib/icons/src/*'], 'lib/icons/src/Top.tsx', 'lib/icons/src/Top.tsx'],
    // Every embedded path is relative to the folder that holds them all, so
    // a page inside the later target names no target folder: the first wins.
    ['a page inside the later target', ['./lib/missing/*', './lib/src/*'], 'lib/src/Top.tsx', 'lib/missing/Top.tsx', 'lib/src/pages/page.tsx'],
  ])('gives back an aliased module by whole folder names: %s', async (name, targets, sentFrom, comesBack, pageAt = 'page.tsx') => {
    const base = `segments-${String(name).replace(/\W+/g, '-')}`;
    const paths = {compilerOptions: {baseUrl: '.', paths: {'@/*': targets}}};
    put(`${base}/tsconfig.json`, JSON.stringify(paths));
    put(`${base}/package.json`, '{"name":"segments","private":true}');
    put(`${base}/${sentFrom}`, "export const Top = () => <i>segment-top</i>;\n");
    put(`${base}/${pageAt}`, "import {Top} from '@/Top';\nexport default function Page() { return <p><Top /></p>; }\n");
    await render(`${base}/${pageAt}`, {cwd: dir});
    const html = `${base}/${pageAt.replace(/\.tsx$/, '.html')}`;
    fs.mkdirSync(path.join(dir, `${base}-to`), {recursive: true});
    put(`${base}-to/tsconfig.json`, JSON.stringify(paths));
    put(`${base}-to/package.json`, '{"name":"segments-to","private":true}');
    fs.copyFileSync(path.join(dir, html), path.join(dir, `${base}-to/page.html`));
    const back = /** @type {any} */ (await render('page.html', {cwd: path.join(dir, `${base}-to`), reverse: true, out: 'lib/zz/page.tsx'}));
    expect(back.data.files).toContain(comesBack);
  }, 60_000);

  it('gives back a folder an exact key names under the target it was sent from', async () => {
    const paths = {compilerOptions: {baseUrl: '.', paths: {'@cfg': ['./lib/a/settings', './lib/b/settings']}}};
    put('exactdir/tsconfig.json', JSON.stringify(paths));
    put('exactdir/package.json', '{"name":"exactdir","private":true}');
    put('exactdir/lib/b/settings/index.ts', "export const setting = 'from-b';\n");
    put('exactdir/page.tsx', "import {setting} from '@cfg';\nexport default function Page() { return <p>{setting}</p>; }\n");
    await render('exactdir/page.tsx', {cwd: dir});
    expect(fs.readFileSync(path.join(dir, 'exactdir/page.html'), 'utf8')).toContain('from-b');
    fs.mkdirSync(path.join(dir, 'exactdir-to'), {recursive: true});
    put('exactdir-to/tsconfig.json', JSON.stringify(paths));
    put('exactdir-to/package.json', '{"name":"exactdir-to","private":true}');
    fs.copyFileSync(path.join(dir, 'exactdir/page.html'), path.join(dir, 'exactdir-to/page.html'));
    const back = /** @type {any} */ (await render('page.html', {cwd: path.join(dir, 'exactdir-to'), reverse: true, out: 'lib/zz/page.tsx'}));
    expect(back.data.files).toContain('lib/b/settings/index.ts');
    expect(back.data.files).not.toContain('lib/a/settings/index.ts');
  }, 60_000);

  it('resolves path aliases in modules outside the project folder, through every key and target', async () => {
    put(
      'sib/app/tsconfig.json',
      JSON.stringify({
        compilerOptions: {
          baseUrl: '.',
          paths: {
            '@scope/ui': ['../ui/src/index.tsx'],
            '@scope/tokens': ['../tokens/src/index.ts'],
            '@lib/*': ['../missing/*', '../lib/*'],
          },
        },
      }),
    );
    put('sib/app/package.json', '{"name":"sib-app","private":true}');
    put('sib/tokens/src/index.ts', "export const accent = 'token-accent';\n");
    put('sib/lib/util.ts', "export const util = 'later-target-util';\n");
    put(
      'sib/ui/src/index.tsx',
      "import {accent} from '@scope/tokens';\nimport {util} from '@lib/util';\nexport const Badge = () => <b>{accent} {util}</b>;\n",
    );
    put('sib/app/page.tsx', "import {Badge} from '@scope/ui';\nexport default function Page() { return <p><Badge /></p>; }\n");
    await render('sib/app/page.tsx', {cwd: dir});
    const html = fs.readFileSync(path.join(dir, 'sib/app/page.html'), 'utf8');
    expect(html).toContain('token-accent');
    expect(html).toContain('later-target-util');
  }, 60_000);

  it('gives the page and a sibling package one copy of a package the aliases place, even when a built copy is linked', async () => {
    const paths = {compilerOptions: {baseUrl: '.', paths: {'@scope/ui': ['../ui/src/index.tsx'], '@scope/tokens': ['../tokens/src/index.ts']}}};
    put('mono/app/tsconfig.json', JSON.stringify(paths));
    put('mono/app/package.json', '{"name":"mono-app","private":true}');
    put('mono/tokens/package.json', '{"name":"@scope/tokens","main":"dist/index.js"}');
    put('mono/tokens/src/index.ts', "import {createContext} from 'react';\nexport const Theme = createContext('default-theme');\n");
    put('mono/tokens/dist/index.js', "const {createContext} = require('react');\nexports.Theme = createContext('built-copy');\n");
    // The built package, linked into the sibling's node_modules as a workspace would.
    fs.mkdirSync(path.join(dir, 'mono/ui/node_modules/@scope'), {recursive: true});
    fs.symlinkSync(path.join(dir, 'mono/tokens'), path.join(dir, 'mono/ui/node_modules/@scope/tokens'), 'dir');
    put('mono/ui/src/index.tsx', "import {useContext} from 'react';\nimport {Theme} from '@scope/tokens';\nexport const Badge = () => <b>{useContext(Theme)}</b>;\n");
    put(
      'mono/app/page.tsx',
      "import {Theme} from '@scope/tokens';\nimport {Badge} from '@scope/ui';\nexport default function Page() { return <Theme.Provider value=\"page-theme\"><Badge /></Theme.Provider>; }\n",
    );
    await render('mono/app/page.tsx', {cwd: dir});
    const html = fs.readFileSync(path.join(dir, 'mono/app/page.html'), 'utf8');
    expect(html).toContain('page-theme');
  }, 60_000);

  it('places an aliased subpath that a linked package does not export', async () => {
    put('expo/app/tsconfig.json', JSON.stringify({compilerOptions: {baseUrl: '.', paths: {'@scope/ui': ['../ui/src/index.tsx'], '@scope/tokens/*': ['../tokens/src/*']}}}));
    put('expo/app/package.json', '{"name":"expo-app","private":true}');
    put('expo/tokens/package.json', '{"name":"@scope/tokens","exports":{".":"./dist/index.js"}}');
    put('expo/tokens/dist/index.js', "exports.red = 'built-red';\n");
    put('expo/tokens/src/colors.ts', "export const red = 'source-red';\n");
    fs.mkdirSync(path.join(dir, 'expo/ui/node_modules/@scope'), {recursive: true});
    fs.symlinkSync(path.join(dir, 'expo/tokens'), path.join(dir, 'expo/ui/node_modules/@scope/tokens'), 'dir');
    put('expo/ui/src/index.tsx', "import {red} from '@scope/tokens/colors';\nexport const Swatch = () => <i>{red}</i>;\n");
    put('expo/app/page.tsx', "import {Swatch} from '@scope/ui';\nexport default function Page() { return <p><Swatch /></p>; }\n");
    await render('expo/app/page.tsx', {cwd: dir});
    expect(fs.readFileSync(path.join(dir, 'expo/app/page.html'), 'utf8')).toContain('source-red');
  }, 60_000);

  it('compiles a sibling module with the TypeScript it can hold: type assertions and decorators', async () => {
    put('tsx-sib/app/tsconfig.json', JSON.stringify({compilerOptions: {baseUrl: '.', experimentalDecorators: true, paths: {'@scope/store': ['../store/src/index.ts']}}}));
    put('tsx-sib/app/package.json', '{"name":"tsx-sib-app","private":true}');
    put(
      'tsx-sib/store/src/index.ts',
      "const raw: unknown = 'asserted-label';\nexport const label = <string>raw;\nfunction tag(target: any) { target.tagged = 'decorated-store'; }\n@tag\nexport class Store { static tagged: string; }\n",
    );
    put('tsx-sib/store/src/other.ts', "const raw: unknown = 'relative-label';\nexport const other = <string>raw;\n");
    put(
      'tsx-sib/app/page.tsx',
      "import {label, Store} from '@scope/store';\nimport {other} from '../store/src/other';\nexport default function Page() { return <p>{label} {(Store as any).tagged} {other}</p>; }\n",
    );
    await render('tsx-sib/app/page.tsx', {cwd: dir});
    const html = fs.readFileSync(path.join(dir, 'tsx-sib/app/page.html'), 'utf8');
    expect(html).toContain('asserted-label');
    expect(html).toContain('decorated-store');
    expect(html).toContain('relative-label');
  }, 60_000);

  it('loads an installed package a prefix key names when the key places no file', async () => {
    put('pkgpre/tsconfig.json', JSON.stringify({compilerOptions: {baseUrl: '.', paths: {'@scope/*': ['./src/*']}}}));
    put('pkgpre/package.json', '{"name":"pkgpre","private":true}');
    put('pkgpre/node_modules/@scope/realpkg/package.json', '{"name":"@scope/realpkg","main":"index.js"}');
    put('pkgpre/node_modules/@scope/realpkg/index.js', "exports.real = 'installed-package';\n");
    put('pkgpre/src/local.ts', "export {real} from '@scope/realpkg';\n");
    put('pkgpre/page.tsx', "import {real} from '@scope/realpkg';\nimport {real as again} from './src/local';\nexport default function Page() { return <p>{real} {again}</p>; }\n");
    await render('pkgpre/page.tsx', {cwd: dir});
    expect(fs.readFileSync(path.join(dir, 'pkgpre/page.html'), 'utf8')).toContain('installed-package installed-package');
  }, 60_000);

  it('gives back a nested aliased module under the target it was sent from', async () => {
    const paths = {compilerOptions: {baseUrl: '.', paths: {'@/*': ['./lib/missing/*', './lib/src/*']}}};
    put('nested/tsconfig.json', JSON.stringify(paths));
    put('nested/package.json', '{"name":"nested","private":true}');
    put('nested/lib/src/c/Header.tsx', "export const Header = () => <b>nested-header</b>;\n");
    put('nested/lib/src/Top.tsx', "export const Top = () => <i>top-level</i>;\n");
    put('nested/page.tsx', "import {Header} from '@/c/Header';\nimport {Top} from '@/Top';\nexport default function Page() { return <p><Header /><Top /></p>; }\n");
    await render('nested/page.tsx', {cwd: dir});
    expect(fs.readFileSync(path.join(dir, 'nested/page.html'), 'utf8')).toContain('nested-header');
    fs.mkdirSync(path.join(dir, 'nested-to'), {recursive: true});
    put('nested-to/tsconfig.json', JSON.stringify(paths));
    put('nested-to/package.json', '{"name":"nested-to","private":true}');
    fs.copyFileSync(path.join(dir, 'nested/page.html'), path.join(dir, 'nested-to/page.html'));
    const back = /** @type {any} */ (await render('page.html', {cwd: path.join(dir, 'nested-to'), reverse: true, out: 'lib/app/page.tsx'}));
    expect(back.data.files).toEqual(expect.arrayContaining(['lib/src/c/Header.tsx', 'lib/src/Top.tsx']));
    expect(back.data.files).not.toEqual(expect.arrayContaining(['lib/missing/c/Header.tsx']));
  }, 60_000);

  it('names a package a catch-all key cannot place as not installed, and renders a page whose package stylesheet is missing with a warning', async () => {
    put('catchall2/tsconfig.json', JSON.stringify({compilerOptions: {baseUrl: '.', paths: {'*': ['./types/*']}}}));
    put('catchall2/package.json', '{"name":"catchall2","private":true}');
    put('catchall2/dep.tsx', "import x from 'not-a-real-package-xyz';\nexport default () => <p>{String(x)}</p>;\n");
    expect(await codeOf(() => render('catchall2/dep.tsx', {cwd: dir}))).toBe('ERR_RENDER_MISSING_DEPENDENCY');
    put('catchall2/sheet.tsx', "import 'not-a-real-package-xyz/style.css';\nexport default () => <p>styled</p>;\n");
    const r = /** @type {any} */ (await render('catchall2/sheet.tsx', {cwd: dir}));
    expect(r.data.warnings.map((/** @type {any} */ w) => w.code)).toContain('missing-asset');
  }, 60_000);

  it('leaves relative and package imports alone under a catch-all paths key', async () => {
    put('catchall/tsconfig.json', JSON.stringify({compilerOptions: {baseUrl: '.', paths: {'*': ['./types/*']}}}));
    put('catchall/package.json', '{"name":"catchall","private":true}');
    // A decoy at baseUrl that `./Header` must not load.
    put('catchall/Header.tsx', "export const Header = () => <b>decoy</b>;\n");
    put('catchall/src/Header.tsx', "export const Header = () => <b>local-header</b>;\n");
    put('catchall/src/styles.css', '.c { color: red; }\n');
    put('catchall/src/logo.png', PNG);
    put(
      'catchall/src/page.tsx',
      [
        "import './styles.css';",
        "import '@astryxdesign/core/astryx.css';",
        "import logo from './logo.png';",
        "import {Header} from './Header';",
        'export default function Page() { return <p className="c"><img src={logo} alt="" /><Header /></p>; }',
        '',
      ].join('\n'),
    );
    const r = /** @type {any} */ (await render('catchall/src/page.tsx', {cwd: dir}));
    const html = fs.readFileSync(path.join(dir, 'catchall/src/page.html'), 'utf8');
    expect(html).toContain('local-header');
    expect(html).not.toContain('decoy');
    expect(html).toContain('color: red');
    expect(html).toContain('data:image/png;base64,');
    expect(r.data.stylesheets).toEqual(expect.arrayContaining(['@astryxdesign/core/astryx.css']));
  }, 60_000);

  it('gives back a file reached through a target with text before its star', async () => {
    put('starseg/tsconfig.json', JSON.stringify({compilerOptions: {baseUrl: '.', paths: {'@icon/*': ['./icons/icon-*']}}}));
    put('starseg/package.json', '{"name":"starseg","private":true}');
    put('starseg/icons/icon-home.tsx', "export const Home = () => <i>home-icon</i>;\n");
    put('starseg/page.tsx', "import {Home} from '@icon/home';\nexport default function Page() { return <p><Home /></p>; }\n");
    await render('starseg/page.tsx', {cwd: dir});
    fs.mkdirSync(path.join(dir, 'starseg-to'), {recursive: true});
    put('starseg-to/tsconfig.json', JSON.stringify({compilerOptions: {baseUrl: '.', paths: {'@icon/*': ['./icons/icon-*']}}}));
    put('starseg-to/package.json', '{"name":"starseg-to","private":true}');
    fs.copyFileSync(path.join(dir, 'starseg/page.html'), path.join(dir, 'starseg-to/page.html'));
    const cwd = path.join(dir, 'starseg-to');
    const back = /** @type {any} */ (await render('page.html', {cwd, reverse: true, out: 'icons/app/page.tsx'}));
    expect(back.data.files).toEqual(expect.arrayContaining(['icons/icon-home.tsx']));
  }, 60_000);

  it('refuses a rendered file whose source block was stripped, in its own words', async () => {
    put('stripped-own.html', '<!doctype html><html><head><meta name="generator" content="Astryx 0.7.5"></head><body><p>Hello</p></body></html>');
    /** @type {any} */
    let error;
    try {
      await render('stripped-own.html', {cwd: dir, reverse: true});
    } catch (e) {
      error = e;
    }
    expect(error?.code).toBe('ERR_RENDER_SOURCE_DAMAGED');
    expect(error.message).toContain('rendered by Astryx');
    expect(error.message).not.toContain('not an Astryx page');
  });

  it('refuses a carried "image" whose bytes are not one', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    put('fake-img.html', `<body><p class="astryx-text">x</p>${sourceBlock('page.tsx', [{path: 'page.tsx', bytes: Buffer.from('export default () => null;\n')}, {path: 'hook.png', bytes: Buffer.from('process.exit(1)\n')}])}</body>`);
    expect(await codeOf(() => render('fake-img.html', {cwd: dir, reverse: true, out: 'fake-img/page.tsx'}))).toBe(
      'ERR_RENDER_SOURCE_DAMAGED',
    );
  });

  it('rebuilds a quoted attribute as JSX that compiles', async () => {
    put(
      'quoted.html',
      '<body><div class="astryx-stack"><img src="data:image/png;base64,iVBORw0KGgo=" alt="say &quot;hi&quot; {now}"><a class="astryx-link" href="/x?a=&quot;b&quot;">Go</a></div></body>',
    );
    const back = /** @type {any} */ (await render('quoted.html', {cwd: dir, reverse: true, out: 'quoted/page.tsx'}));
    expect(back.data.mode).toBe('rebuilt');
    const source = fs.readFileSync(path.join(dir, 'quoted/page.tsx'), 'utf8');
    expect(source).toContain('alt={"say \\"hi\\" {now}"}');
    const again = /** @type {any} */ (await render('quoted/page.tsx', {cwd: dir}));
    expect(again.type).toBe('render.page');
  }, 60_000);

  it('never adds a file outside the page\'s own folder beside existing project files', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    put('plant/app/keep.txt', 'existing\n');
    for (const [spec, name] of [
      ['../../nodemon.json', 'nodemon.json'],
      ['../../jsr.json', 'jsr.json'],
      ['../../instrumentation', 'instrumentation.ts'],
      ['../middleware', 'src/middleware.ts'],
    ]) {
      const page = {path: 'src/app/page.tsx', bytes: Buffer.from(`import x from '${spec}';\nexport default () => null;\n`)};
      put('plant/page.html', `<body><p class="astryx-text">x</p>${sourceBlock('src/app/page.tsx', [page, {path: name, bytes: Buffer.from('{}')}])}</body>`);
      expect(
        await codeOf(() => render('page.html', {cwd: path.join(dir, 'plant'), reverse: true, out: 'app/page.tsx', overwrite: true})),
      ).toMatch(/ERR_PATH_TRAVERSAL|ERR_RENDER_SOURCE_DAMAGED/);
      expect(fs.existsSync(path.join(dir, 'plant', path.basename(name)))).toBe(false);
      expect(fs.existsSync(path.join(dir, 'plant/app/page.tsx'))).toBe(false);
    }
  });

  it('writes all or nothing: a failure part-way leaves nothing behind', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    // The second file's name is longer than a file system allows, so its
    // write fails after the page's has been staged.
    const long = 'C'.repeat(300);
    const page = {path: 'app/page.tsx', bytes: Buffer.from(`import {C} from './components/${long}';\nexport default () => <C />;\n`)};
    const comp = {path: `app/components/${long}.tsx`, bytes: Buffer.from('export const C = () => null;\n')};
    put('atomic/page.html', `<body><p class="astryx-text">x</p>${sourceBlock('app/page.tsx', [page, comp])}</body>`);
    expect(await codeOf(() => render('page.html', {cwd: path.join(dir, 'atomic'), reverse: true, out: 'out/page.tsx'}))).toBe(
      'ERR_WRITE_FAILED',
    );
    expect(fs.readdirSync(path.join(dir, 'atomic'))).toEqual(['page.html']);
  });



  it('restores an exact alias import to the file it names', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    put('exact-alias/tsconfig.json', '{"compilerOptions": {"baseUrl": ".", "paths": {"@theme": ["./src/theme.ts"]}}}\n');
    const page = {path: 'page.tsx', bytes: Buffer.from("import {t} from '@theme';\nexport default () => t;\n")};
    put('exact-alias/page.html', `<body><p class="astryx-text">x</p>${sourceBlock('page.tsx', [page, {path: 'theme.ts', bytes: Buffer.from("export const t = 'x';\n")}])}</body>`);
    const back = /** @type {any} */ (await render('page.html', {cwd: path.join(dir, 'exact-alias'), reverse: true, out: 'src/page.tsx'}));
    expect(back.data.files).toEqual(['src/page.tsx', 'src/theme.ts']);
  });

  it('keeps every neighbour inside the one folder the restore creates', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    put('depth/app/layout.tsx', 'existing\n');
    const page = {path: 'restored/report.tsx', bytes: Buffer.from("import r from '../app/report-export/route';\nexport default () => null;\n")};
    put('depth/page.html', `<body><p class="astryx-text">x</p>${sourceBlock('restored/report.tsx', [page, {path: 'app/report-export/route.ts', bytes: Buffer.from('export {};\n')}])}</body>`);
    /** @type {any} */
    let refused;
    try {
      await render('page.html', {cwd: path.join(dir, 'depth'), reverse: true, out: 'restored/report.tsx'});
    } catch (e) {
      refused = e;
    }
    expect(refused?.code).toBe('ERR_PATH_TRAVERSAL');
    expect(fs.existsSync(path.join(dir, 'depth/app/report-export'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'depth/restored'))).toBe(false);
    // The suggested folder works.
    const suggestion = refused.suggestions[0].name.replace('--out ', '');
    const back = /** @type {any} */ (await render('page.html', {cwd: path.join(dir, 'depth'), reverse: true, out: suggestion}));
    expect(back.data.mode).toBe('embedded');
  });

  it('refuses test, spec and story files a received page imports', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    for (const name of [
      'report.test.ts',
      'report.spec.tsx',
      'Report.stories.tsx',
      '__tests__/r.ts',
      'report-test.mjs',
      'report_test.mjs',
      'test-report.mjs',
      'test.mjs',
      'test/helper.mjs',
      'test-report.ts',
      'report_test.mts',
      'test.cts',
      'test/helper.ts',
      'spec.ts',
      'test.tsx',
      'report.benchmark.ts',
      'report_test.tsx',
      'tests/helper.js',
      'spectest.js',
      'testtest.ts',
    ]) {
      const page = {path: 'page.tsx', bytes: Buffer.from(`import './${name.replace(/\.(tsx?|[mc]?[jt]s)$/, '')}';\nexport default () => null;\n`)};
      put('tests-in.html', `<body><p class="astryx-text">x</p>${sourceBlock('page.tsx', [page, {path: name, bytes: Buffer.from('export {};\n')}])}</body>`);
      expect(await codeOf(() => render('tests-in.html', {cwd: dir, reverse: true, out: 'tests-in/page.tsx'}))).toBe(
        'ERR_RENDER_SOURCE_DAMAGED',
      );
    }
  });

  it('never names the page as a file a test runner picks up', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    put('runner/report.test.html', `<body><p class="astryx-text">x</p>${sourceBlock('page.mjs', [{path: 'page.mjs', bytes: Buffer.from('export default () => null;\n')}])}</body>`);
    const cwd = path.join(dir, 'runner');
    // The page's name never comes from the received file's name.
    const back = /** @type {any} */ (await render('report.test.html', {cwd, reverse: true}));
    expect(back.data.output).toBe('report.test-restored/page.mjs');
    expect(await codeOf(() => render('report.test.html', {cwd, reverse: true, out: 'test/page.mjs'}))).toBe('ERR_INVALID_ARGUMENT');
    expect(await codeOf(() => render('report.test.html', {cwd, reverse: true, out: 'page.cy.mjs'}))).toBe('ERR_INVALID_ARGUMENT');
    put('runner/spec.html', `<body><p class="astryx-text">x</p>${sourceBlock('report.cy.ts', [{path: 'report.cy.ts', bytes: Buffer.from('export default () => null;\n')}])}</body>`);
    expect(await codeOf(() => render('spec.html', {cwd, reverse: true}))).toBe('ERR_INVALID_ARGUMENT');
    // Ordinary names that only contain such words still come back.
    put('runner/results.html', `<body><p class="astryx-text">x</p>${sourceBlock('stories/test-results.tsx', [{path: 'stories/test-results.tsx', bytes: Buffer.from("import d from '../mock-data';\nexport default () => d;\n")}, {path: 'mock-data.ts', bytes: Buffer.from('export default 1;\n')}])}</body>`);
    // Where a file lands counts, not only its name in the file.
    expect(await codeOf(() => render('results.html', {cwd, reverse: true, out: 'tests/stories/test-results.tsx'}))).toMatch(
      /ERR_INVALID_ARGUMENT|ERR_RENDER_SOURCE_DAMAGED/,
    );
    expect(fs.existsSync(path.join(cwd, 'tests'))).toBe(false);
    const ok = /** @type {any} */ (await render('results.html', {cwd, reverse: true}));
    expect(ok.data.files).toEqual(['results-restored/stories/test-results.tsx', 'results-restored/mock-data.ts']);
  });


  it('judges where a file lands from the project root, not the current folder', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    put('rooted-runner/package.json', '{"name":"rr","private":true}');
    put('rooted-runner/test/fixtures/page.html', `<body><p class="astryx-text">x</p>${sourceBlock('page.mjs', [{path: 'page.mjs', bytes: Buffer.from("import './helper.mjs';\nexport default () => null;\n")}, {path: 'helper.mjs', bytes: Buffer.from('export {};\n')}])}</body>`);
    const cwd = path.join(dir, 'rooted-runner/test/fixtures');
    expect(await codeOf(() => render('page.html', {cwd, reverse: true}))).toBe('ERR_INVALID_ARGUMENT');
    expect(fs.readdirSync(cwd)).toEqual(['page.html']);
  });

  it('judges a nested package under a test folder from the repository root', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    fs.mkdirSync(path.join(dir, 'repo-root/.git'), {recursive: true});
    put('repo-root/package.json', '{"name":"repo","private":true}');
    put('repo-root/test/fixtures/app/package.json', '{"name":"app","private":true}');
    put('repo-root/test/fixtures/app/page.html', `<body><p class="astryx-text">x</p>${sourceBlock('page.mjs', [{path: 'page.mjs', bytes: Buffer.from('export default () => null;\n')}])}</body>`);
    const cwd = path.join(dir, 'repo-root/test/fixtures/app');
    expect(await codeOf(() => render('page.html', {cwd, reverse: true}))).toBe('ERR_INVALID_ARGUMENT');
    expect(fs.readdirSync(cwd).sort()).toEqual(['package.json', 'page.html']);
  });

  it('warns about a <script> or a loading <link> the page renders', async () => {
    put('scripted/page.tsx', 'export default function Page() { return <main><link rel="stylesheet" href="https://example.com/x.css" /><script dangerouslySetInnerHTML={{__html: "1"}} /><p>Hi</p></main>; }\n');
    const r = /** @type {any} */ (await render('scripted/page.tsx', {cwd: dir}));
    const codes = r.data.warnings.map((/** @type {any} */ w) => w.code);
    expect(codes).toContain('page-script');
    expect(codes).toContain('remote-asset');
  }, 60_000);

  it('judges the page by where it lands, on both paths', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    fs.mkdirSync(path.join(dir, 'land/.git'), {recursive: true});
    // A page saved as test.tsx comes back under another name with --out.
    put('land/named.html', `<body><p class="astryx-text">x</p>${sourceBlock('test.tsx', [{path: 'test.tsx', bytes: Buffer.from('export default () => null;\n')}])}</body>`);
    const cwd = path.join(dir, 'land');
    expect(await codeOf(() => render('named.html', {cwd, reverse: true}))).toBe('ERR_INVALID_ARGUMENT');
    const back = /** @type {any} */ (await render('named.html', {cwd, reverse: true, out: 'demo/page.tsx'}));
    expect(back.data.output).toBe('demo/page.tsx');
    // A page rebuilt from markup inside __tests__/ is refused too.
    put('land/src/__tests__/stripped.html', '<body><div class="astryx-stack"><p class="astryx-text">Hi</p></div></body>');
    expect(
      await codeOf(() => render('stripped.html', {cwd: path.join(cwd, 'src/__tests__'), reverse: true})),
    ).toBe('ERR_INVALID_ARGUMENT');
    expect(fs.readdirSync(path.join(cwd, 'src/__tests__'))).toEqual(['stripped.html']);
  });

  it('refuses --title with --reverse', async () => {
    expect(await codeOf(() => render('page.html', {cwd: dir, reverse: true, title: 'x'}))).toBe('ERR_INVALID_ARGUMENT');
  });

  it('keeps a received title out of the rebuilt code', async () => {
    put('evil-title.html', '<html><head><title>x\rprocess.exit(7)\u2028//</title></head><body><div class="astryx-stack"><p class="astryx-text">Hi</p></div></body></html>');
    await render('evil-title.html', {cwd: dir, reverse: true, out: 'evil-title/page.tsx'});
    const first = fs.readFileSync(path.join(dir, 'evil-title/page.tsx'), 'utf8').split(/\r\n|\r|\n|\u2028|\u2029/)[0];
    expect(first).toContain('process.exit(7)');
    expect(first.startsWith('//')).toBe(true);
  });

  it('never adds a neighbour to an existing folder, a project root included', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    put('rooted/package.json', '{"name":"rooted","private":true}');
    for (const name of ['instrumentation.ts', 'middleware.ts', 'nodemon.json']) {
      const spec = `./${name.replace(/\.ts$/, '')}`;
      const page = {path: 'page.tsx', bytes: Buffer.from(`import x from '${spec}';\nexport default () => null;\n`)};
      put('rooted/page.html', `<body><p class="astryx-text">x</p>${sourceBlock('page.tsx', [page, {path: name, bytes: Buffer.from('{}')}])}</body>`);
      expect(
        await codeOf(() => render('page.html', {cwd: path.join(dir, 'rooted'), reverse: true, out: 'page.tsx', overwrite: true})),
      ).toMatch(/ERR_PATH_TRAVERSAL|ERR_RENDER_SOURCE_DAMAGED/);
      expect(fs.existsSync(path.join(dir, 'rooted', name))).toBe(false);
      expect(fs.existsSync(path.join(dir, 'rooted/page.tsx'))).toBe(false);
    }
    // Without --out, everything comes back into a new folder named after the file given.
    put('rooted/shared.html', `<body><p class="astryx-text">x</p>${sourceBlock('instrumentation.ts', [{path: 'instrumentation.ts', bytes: Buffer.from('export function register() {}\n')}])}</body>`);
    const back = /** @type {any} */ (await render('shared.html', {cwd: path.join(dir, 'rooted'), reverse: true}));
    expect(back.data.output).toBe('shared-restored/instrumentation.ts');
  });

  it('replaces an existing output only when a render wrote it, and never an ignored one', async () => {
    put('fwd/page.tsx', PAGE);
    fs.copyFileSync(path.join(dir, 'dot.png'), path.join(dir, 'fwd/dot.png'));
    put('fwd/mine.html', '<p>hand-written</p>\n');
    const cwd = path.join(dir, 'fwd');
    expect(await codeOf(() => render('page.tsx', {cwd, out: 'mine.html'}))).toBe('ERR_FILE_EXISTS');
    expect(fs.readFileSync(path.join(cwd, 'mine.html'), 'utf8')).toBe('<p>hand-written</p>\n');
    await render('page.tsx', {cwd});
    const again = /** @type {any} */ (await render('page.tsx', {cwd}));
    expect(again.type).toBe('render.page');
    put('fwd/.gitignore', 'page.html\n');
    expect(await codeOf(() => render('page.tsx', {cwd}))).toBe('ERR_FILE_EXISTS');
  }, 60_000);

  it('refuses a received file that lists one path twice', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    const page = {path: 'page.tsx', bytes: Buffer.from('export default () => null;\n')};
    put('twice.html', `<body><p class="astryx-text">x</p>${sourceBlock('page.tsx', [page, {path: 'page.tsx', bytes: Buffer.from("import './instrumentation';\n")}, {path: 'instrumentation.ts', bytes: Buffer.from('export {};\n')}])}</body>`);
    expect(await codeOf(() => render('twice.html', {cwd: dir, reverse: true, out: 'twice-out/page.tsx'}))).toBe(
      'ERR_RENDER_SOURCE_DAMAGED',
    );
    expect(fs.existsSync(path.join(dir, 'twice-out'))).toBe(false);
  });

  it('reports ERR_WRITE_FAILED when the output cannot be written', async () => {
    fs.mkdirSync(path.join(dir, 'a-folder.html'), {recursive: true});
    expect(await codeOf(() => render('page.tsx', {cwd: dir, out: 'a-folder.html'}))).toBe('ERR_WRITE_FAILED');
  }, 60_000);

  it('refuses --out outside the current folder, and a write through a symlink that leaves it', async () => {
    expect(await codeOf(() => render('page.tsx', {cwd: dir, out: '../escaped.html'}))).toBe('ERR_PATH_TRAVERSAL');
    expect(await codeOf(() => render('page.html', {cwd: dir, reverse: true, out: '../escaped.tsx'}))).toBe(
      'ERR_PATH_TRAVERSAL',
    );
    const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-render-outside-')));
    try {
      fs.symlinkSync(outside, path.join(dir, 'link-out'));
      expect(
        await codeOf(() => render('page.html', {cwd: dir, reverse: true, out: 'link-out/page.tsx'})),
      ).toBe('ERR_PATH_TRAVERSAL');
      expect(fs.readdirSync(outside)).toEqual([]);
    } finally {
      fs.rmSync(outside, {recursive: true, force: true});
    }
  });
});

describe('render(): imports with a query, as Vite gives them', () => {
  it('gives ?raw the file text, ?inline a stylesheet text, ?url an image address, and gives the files back', async () => {
    put('queries/notes.css', '.note { color: teal; --note-marker: 1; }\n');
    put('queries/dot.png', PNG);
    put('queries/data.json', '{"a": 1}\n');
    put(
      'queries/page.tsx',
      "import sheet from './notes.css?inline';\nimport text from './data.json?raw';\nimport * as whole from './data.json?raw';\nimport {default as named} from './data.json?raw';\nimport dot from './dot.png?url';\nexport default function Page() {\n  return <main><pre className=\"note\">{sheet}</pre><pre>{text}</pre><pre>{whole.default === text && named === text ? 'every import gets the text' : 'no'}</pre><img src={dot} alt=\"\" /></main>;\n}\n",
    );
    const result = /** @type {any} */ (await render('queries/page.tsx', {cwd: dir}));
    const html = fs.readFileSync(path.join(dir, 'queries/page.html'), 'utf8');
    expect(html).toContain('.note { color: teal; --note-marker: 1; }');
    expect(html).toContain('every import gets the text');
    expect(html).toContain('{&quot;a&quot;: 1}');
    expect(html).toContain('src="data:image/png;base64,');
    // A stylesheet imported with ?inline is text, not a sheet of the page:
    // the class it styles is used, and no rule of it is in the page's styles.
    expect(html.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1]).not.toContain('--note-marker');
    expect(result.data.files.sort()).toEqual(['data.json', 'dot.png', 'notes.css', 'page.tsx']);
    const back = /** @type {any} */ (await render('queries/page.html', {cwd: dir, reverse: true, out: 'queries-back/page.tsx'}));
    expect(back.data.exact).toBe(true);
  }, 60_000);

  it('loads a file with any other query as it loads without one: an image as its address, a module as itself', async () => {
    put('queries/w.ts', "export const label = 'from the worker module';\n");
    put(
      'queries/others.tsx',
      "import a from './dot.png?w=400';\nimport b from './dot.png?no-inline';\nimport c from './dot.png?url&inline';\nimport * as w from './w.ts?worker';\nexport default function Page() {\n  return <main><img src={a} alt=\"\" /><img src={b} alt=\"\" /><img src={c} alt=\"\" /><p>{w.label}</p></main>;\n}\n",
    );
    const result = /** @type {any} */ (await render('queries/others.tsx', {cwd: dir}));
    const html = fs.readFileSync(path.join(dir, 'queries/others.html'), 'utf8');
    expect(html.match(/src="data:image\/png;base64,/g)).toHaveLength(3);
    expect(html).toContain('from the worker module');
    expect(result.data.files.sort()).toEqual(['dot.png', 'others.tsx', 'w.ts']);
  }, 60_000);
});

describe('render(): ordinary files named like configuration', () => {
  it('carries modules and JSON data named config or ending in rc, and gives them back exactly', async () => {
    put('names/config.ts', "export const site = {title: 'Named config'};\n");
    put('names/lib/arc.ts', "export const arc = 'an arc';\n");
    put('names/data/chart-config.json', '{"series": ["North", "South"]}\n');
    put('names/data/config.json', '{"footer": "From config.json"}\n');
    put(
      'names/page.tsx',
      "import {site} from './config';\nimport {arc} from './lib/arc';\nimport chart from './data/chart-config.json';\nimport config from './data/config.json';\nexport default function Page() {\n  return <main><h1>{site.title}</h1><p>{arc} {chart.series.join(' ')} {config.footer}</p></main>;\n}\n",
    );
    const result = /** @type {any} */ (await render('names/page.tsx', {cwd: dir}));
    expect(result.data.files.sort()).toEqual(['config.ts', 'data/chart-config.json', 'data/config.json', 'lib/arc.ts', 'page.tsx']);
    expect(result.data.warnings.filter((/** @type {any} */ w) => w.code === 'not-embedded')).toEqual([]);
    // Format 1 readers refuse these names, so the file says format 2.
    const back = /** @type {any} */ (await render('names/page.html', {cwd: dir, reverse: true, out: 'names-back/page.tsx'}));
    expect(back.data).toMatchObject({exact: true, format: 2});
    for (const name of ['config.ts', 'lib/arc.ts', 'data/chart-config.json', 'data/config.json']) {
      expect(fs.readFileSync(path.join(dir, 'names-back', name))).toEqual(fs.readFileSync(path.join(dir, 'names', name)));
    }
  }, 60_000);
});

describe('render --reverse: a received file may carry only what a render embeds', () => {
  /** @param {string} name @param {{path: string, text: string}[]} files */
  const crafted = async (name, files) => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    put(
      name,
      `<body><p class="astryx-text">x</p>${sourceBlock(files[0].path, files.map(f => ({path: f.path, bytes: Buffer.from(f.text)})))}</body>`,
    );
  };
  it.each([
    ['a git hook', '.git/hooks/pre-commit', 'ERR_RENDER_SOURCE_DAMAGED'],
    ['a dotfile', '.env', 'ERR_RENDER_SOURCE_DAMAGED'],
    ['a tool configuration module', 'vite.config.ts', 'ERR_RENDER_SOURCE_DAMAGED'],
    ['an rc module', '.eslintrc.js', 'ERR_RENDER_SOURCE_DAMAGED'],
    ['the Astryx configuration', 'astryx.config.mjs', 'ERR_RENDER_SOURCE_DAMAGED'],
    ['the package manifest', 'package.json', 'ERR_RENDER_SOURCE_DAMAGED'],
    ['a TypeScript configuration', 'tsconfig.json', 'ERR_RENDER_SOURCE_DAMAGED'],
    ['a TypeScript project configuration', 'tsconfig.app.json', 'ERR_RENDER_SOURCE_DAMAGED'],
    ['a JSON tool configuration by its config name', 'renovate.config.json', 'ERR_RENDER_SOURCE_DAMAGED'],
    ['a package inside node_modules', 'node_modules/react/index.js', 'ERR_RENDER_SOURCE_DAMAGED'],
    ['a shell script', 'scripts/install.sh', 'ERR_RENDER_SOURCE_DAMAGED'],
    ['a climbing path', '../escape.css', 'ERR_PATH_TRAVERSAL'],
    ['an absolute path', '/tmp/escape.css', 'ERR_PATH_TRAVERSAL'],
  ])('refuses %s, writing nothing', async (_, bad, code) => {
    const name = `crafted-${bad.replace(/[^a-z0-9]/gi, '_')}.html`;
    await crafted(name, [
      {path: 'page.tsx', text: 'export default () => null;\n'},
      {path: bad, text: 'echo pwned\n'},
    ]);
    const out = `crafted-out-${bad.replace(/[^a-z0-9]/gi, '_')}`;
    expect(await codeOf(() => render(name, {cwd: dir, reverse: true, out: `${out}/page.tsx`}))).toBe(code);
    expect(fs.existsSync(path.join(dir, out))).toBe(false);
  });

  it.each([
    ['a framework hook file', 'instrumentation.ts'],
    ['a middleware module', 'src/middleware.ts'],
    ['a JSON tool configuration', 'babel.config.json'],
    ['a module in a tools folder', 'tools/plugin.js'],
    ['a stylesheet the page never imports', 'theme.css'],
  ])('refuses %s the page does not import, writing nothing', async (_, extra) => {
    const name = `stray-${extra.replace(/[^a-z0-9]/gi, '_')}.html`;
    await crafted(name, [
      {path: 'page.tsx', text: "import {Header} from './Header';\nexport default () => <Header />;\n"},
      {path: 'Header.tsx', text: 'export const Header = () => <h1>Hi</h1>;\n'},
      {path: extra, text: 'export default {};\n'},
    ]);
    const out = `stray-out-${extra.replace(/[^a-z0-9]/gi, '_')}`;
    /** @type {any} */
    let error;
    try {
      await render(name, {cwd: dir, reverse: true, out: `${out}/page.tsx`});
    } catch (e) {
      error = e;
    }
    expect(error?.code).toBe('ERR_RENDER_SOURCE_DAMAGED');
    expect(error.message).toContain(extra);
    expect(fs.existsSync(path.join(dir, out))).toBe(false);
  });

  it('writes every file the page reaches: re-exports, import(), require() and a folder index', async () => {
    await crafted('reach.html', [
      {
        path: 'page.tsx',
        text: "export {a} from './a';\nconst b = import('./b');\nconst c = require('./c.json');\nimport './parts';\nexport default () => null;\n",
      },
      {path: 'a.ts', text: "import './a.css';\nexport const a = 1;\n"},
      {path: 'a.css', text: '.a{}\n'},
      {path: 'b.tsx', text: 'export default 2;\n'},
      {path: 'c.json', text: '{}\n'},
      {path: 'parts/index.ts', text: 'export {};\n'},
    ]);
    const r = /** @type {any} */ (await render('reach.html', {cwd: dir, reverse: true, out: 'reach/page.tsx'}));
    expect(r.data.files.length).toBe(6);
  });

  it('refuses a page entry that is not a page module, and an --out that names a configuration file', async () => {
    await crafted('crafted-entry.html', [{path: 'vite.config.ts', text: 'export default {};\n'}]);
    expect(await codeOf(() => render('crafted-entry.html', {cwd: dir, reverse: true}))).toBe('ERR_INVALID_ARGUMENT');
    await crafted('crafted-good.html', [{path: 'page.tsx', text: 'export default () => null;\n'}]);
    expect(await codeOf(() => render('crafted-good.html', {cwd: dir, reverse: true, out: 'vite.config.ts'}))).toBe(
      'ERR_INVALID_ARGUMENT',
    );
    // Refused before the input is read: a missing input gives the same answer.
    expect(await codeOf(() => render('missing.html', {cwd: dir, reverse: true, out: 'vite.config.ts'}))).toBe(
      'ERR_INVALID_ARGUMENT',
    );
    expect(fs.existsSync(path.join(dir, 'vite.config.ts'))).toBe(false);
  });

  it('refuses neighbours into a folder that already exists, naming them, and writes nothing', async () => {
    await crafted('crafted-exists.html', [
      {path: 'page.tsx', text: "import './styles.css';\nexport default () => null;\n"},
      {path: 'styles.css', text: '.a{}\n'},
    ]);
    put('exists/keep.txt', 'existing\n');
    /** @type {any} */
    let error;
    try {
      await render('crafted-exists.html', {cwd: dir, reverse: true, out: 'exists/page.tsx', overwrite: true});
    } catch (e) {
      error = e;
    }
    expect(error.code).toBe('ERR_PATH_TRAVERSAL');
    expect(error.message).toContain('exists/styles.css');
    expect(fs.readdirSync(path.join(dir, 'exists'))).toEqual(['keep.txt']);
  });

  it('never embeds a configuration file the page imports, and says so', async () => {
    put('cfg/package.json', JSON.stringify({name: 'cfg', version: '1.2.3'}));
    put('cfg/page.tsx', "import pkg from './package.json';\nexport default function Page() { return <p>v{pkg.version}</p>; }\n");
    const r = /** @type {any} */ (await render('cfg/page.tsx', {cwd: dir}));
    expect(r.data.files).toEqual(['page.tsx']);
    expect(r.data.warnings.map((/** @type {any} */ w) => w.code)).toContain('not-embedded');
    expect(fs.readFileSync(path.join(dir, 'cfg/page.html'), 'utf8')).toContain('v1.2.3');
    // Given back, the page says what it imports that the file did not carry.
    const back = /** @type {any} */ (await render('cfg/page.html', {cwd: dir, reverse: true}));
    expect(back.data.exact).toBe(false);
    expect(back.data.missing).toEqual(['package.json']);
  }, 60_000);
});

describe('astryx experimental render (CLI)', () => {
  it('refuses an unknown experimental subcommand with exit 1', async () => {
    const r = await runCli(['--json', 'experimental', 'nope'], dir);
    expect(r.status).toBe(1);
    const out = JSON.parse(r.stdout);
    expect(out.code).toBe('ERR_UNKNOWN_SUBCOMMAND');
    expect(
      out.suggestions.some((/** @type {any} */ s) => /experimental render$/.test(s.name)),
    ).toBe(true);
  });

  it('fails with exit 1 and a readable message without --json', async () => {
    const r = await runCli(['experimental', 'render', '--reverse', 'plain.html'], dir);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('is not an Astryx page');
    expect(r.stderr).toContain('astryx build');
  });


  it('answers --json with the render.page envelope and --title', async () => {
    const r = await runCli(['--json', 'experimental', 'render', 'page.tsx', '--out', 'cli.html', '--title', 'From the CLI'], dir);
    expect(r.status).toBe(0);
    const json = JSON.parse(r.stdout);
    expect(json.type).toBe('render.page');
    expect(json.data.output).toBe('cli.html');
    expect(fs.readFileSync(path.join(dir, 'cli.html'), 'utf8')).toContain('<title>From the CLI</title>');
  }, 60_000);

  it('fails with exit 1 and a JSON error envelope', async () => {
    const r = await runCli(['--json', 'experimental', 'render', '--reverse', 'plain.html'], dir);
    expect(r.status).toBe(1);
    const json = JSON.parse(r.stdout);
    expect(json.code).toBe('ERR_RENDER_NOT_ASTRYX');
    expect(json.suggestions?.[0]?.name ?? '').toContain('astryx build');
  });

  it('marks itself experimental in help', async () => {
    const r = await runCli(['experimental', '--help'], dir);
    expect(r.stdout).toMatch(/render[^\n]*\[experimental\]/);
  });
});

describe('render(): refusals', () => {
  it.each([
    ['syntax error', 'bad.tsx', 'export default function Page() { return <div>; }', 'ERR_RENDER_COMPILE'],
    ['no default export', 'named.tsx', 'export function Page() { return null; }', 'ERR_RENDER_NO_DEFAULT_EXPORT'],
    ['package not installed', 'dep.tsx', "import x from 'not-a-real-package-xyz';\nexport default () => <p>{String(x)}</p>;", 'ERR_RENDER_MISSING_DEPENDENCY'],
    ['browser API while rendering', 'win.tsx', 'export default function Page() { return <p>{window.innerWidth}</p>; }', 'ERR_RENDER_BROWSER_API'],
    ['missing local module', 'local.tsx', "import X from './nope';\nexport default () => <X />;", 'ERR_FILE_NOT_FOUND'],
    ['a throw', 'throw.tsx', "export default function Page() { throw new Error('boom'); }", 'ERR_RENDER_FAILED'],
  ])('%s', async (_, name, source, code) => {
    put(name, source);
    expect(await codeOf(() => render(name, {cwd: dir}))).toBe(code);
  }, 30_000);

  it('refuses wrong inputs and flags', async () => {
    expect(await codeOf(() => render('', {cwd: dir}))).toBe('ERR_MISSING_ARGUMENT');
    expect(await codeOf(() => render('missing.tsx', {cwd: dir}))).toBe('ERR_FILE_NOT_FOUND');
    expect(await codeOf(() => render('page.html', {cwd: dir}))).toBe('ERR_INVALID_ARGUMENT');
    expect(await codeOf(() => render('page.tsx', {cwd: dir, reverse: true}))).toBe('ERR_INVALID_ARGUMENT');
    expect(await codeOf(() => render('page.tsx', {cwd: dir, out: 'page.txt'}))).toBe('ERR_INVALID_ARGUMENT');
    expect(await codeOf(() => render('page.tsx', {cwd: dir, overwrite: true}))).toBe('ERR_INVALID_ARGUMENT');
    expect(await codeOf(() => render('page.tsx', {cwd: dir, out: 'page.tsx'}))).toBe('ERR_INVALID_ARGUMENT');
  });

  it('refuses an image too large to inline', async () => {
    put('big.png', Buffer.alloc(9 * 1024 * 1024));
    put('big.tsx', "import big from './big.png';\nexport default () => <img src={big} alt='' />;");
    expect(await codeOf(() => render('big.tsx', {cwd: dir}))).toBe('ERR_RENDER_ASSET_TOO_LARGE');
  }, 30_000);
});

describe('render(): a crash of Node itself', () => {
  // A signal that Node raises when it fails ends only the page's process.
  it.skipIf(process.platform === 'win32')('fails with a message that names this Node', async () => {
    put('crash.tsx', "process.kill(process.pid, 'SIGSEGV');\nexport default () => <p>Hi</p>;\n");
    /** @type {any} */
    let error;
    try {
      await render('crash.tsx', {cwd: dir});
    } catch (e) {
      error = e;
    }
    expect(error?.code).toBe('ERR_RENDER_FAILED');
    expect(error.message).toContain(`Node ${process.version}`);
    expect(error.message).toContain('crashed (SIGSEGV)');
    expect(fs.existsSync(path.join(dir, 'crash.html'))).toBe(false);
  }, 60_000);

  // A page that loops forever must not outlive a CLI that is stopped by its
  // process id, as a caller's own time limit stops it.
  it.skipIf(process.platform === 'win32').each(['SIGTERM', 'SIGKILL'])('ends the page process when the CLI is stopped with %s', async signal => {
    const name = `loop-${signal}`;
    put(
      `${name}.tsx`,
      `import {writeFileSync} from 'node:fs';\nwriteFileSync(${JSON.stringify(path.join(dir, `${name}.pid`))}, String(process.pid));\nwhile (true) {}\nexport default () => <p>Hi</p>;\n`,
    );
    const cli = spawn(process.execPath, [path.join(CLI_DIR, 'clients/cli/bin/astryx.mjs'), 'experimental', 'render', `${name}.tsx`], {cwd: dir, stdio: 'ignore'});
    const pidFile = path.join(dir, `${name}.pid`);
    const until = async (/** @type {() => boolean} */ done, /** @type {number} */ ms) => {
      for (const start = Date.now(); !done() && Date.now() - start < ms; ) await new Promise(r => setTimeout(r, 50));
      return done();
    };
    expect(await until(() => fs.existsSync(pidFile) && fs.readFileSync(pidFile, 'utf8') !== '', 30_000)).toBe(true);
    const pagePid = Number(fs.readFileSync(pidFile, 'utf8'));
    expect(pagePid).not.toBe(cli.pid);
    const alive = () => {
      try {
        process.kill(pagePid, 0);
        return true;
      } catch {
        return false;
      }
    };
    cli.kill(/** @type {NodeJS.Signals} */ (signal));
    const ended = await until(() => !alive(), 10_000);
    if (!ended) process.kill(pagePid, 'SIGKILL');
    expect(ended).toBe(true);
  }, 60_000);
});

describe('render(): a page that ends without an answer', () => {
  // The message says why, so a failure in a list of renders says why too.
  it('says where it ended, how long it ran and the memory left', async () => {
    put('ends.tsx', 'process.exit(0);\nexport default () => <p>Hi</p>;\n');
    /** @type {any} */
    let error;
    try {
      await render('ends.tsx', {cwd: dir});
    } catch (e) {
      error = e;
    }
    expect(error?.code).toBe('ERR_RENDER_FAILED');
    expect(error.message).toMatch(/without an answer \(exit 0\) while importing the page, after \d+ seconds, with \d+ MB of memory free\./);
    expect(fs.existsSync(path.join(dir, 'ends.html'))).toBe(false);
  }, 60_000);
});

describe('render(): Avatar initials without Intl.Segmenter', () => {
  // A render on a Node build that crashes in Intl.Segmenter removes it before
  // the page loads. A local module imported first does the same here.
  const NAMES = [
    ['Ada Lovelace', 'AL', 'AL'],
    ['José Ñúñez', 'JÑ', 'JÑ'],
    ['Zoë Kravitz', 'ZK', 'ZK'],
    ['Åsa Öberg', 'ÅÖ', 'ÅÖ'],
    ['李小龙', '李', '李'],
    ['김민준', '김', '김'],
    // The accent is a separate mark after E.
    ['E\u0301mile Zola', 'E\u0301Z', 'EZ'],
    ['👩‍💻 Dev Team', '👩‍💻T', '👩T'],
    ['🇯🇵 Tanaka', '🇯🇵T', '🇯T'],
  ];
  const body = `import {Avatar} from '@astryxdesign/core/Avatar';
const NAMES = ${JSON.stringify(NAMES.map(([name]) => name))};
export default function Page() {
  return <main>{NAMES.map((name, i) => <div key={i} data-name={i}><Avatar name={name} /></div>)}</main>;
}
`;

  /** @param {string} name */
  async function initialsOf(name) {
    await render(`initials/${name}.tsx`, {cwd: dir});
    const html = fs.readFileSync(path.join(dir, 'initials', `${name}.html`), 'utf8');
    // Generated content draws the initials from a private inline custom
    // property, not a text node. The plain string is the one not followed by
    // its empty alternative text.
    return [...html.matchAll(/<div data-name="\d+">([\s\S]*?)(?=<div data-name=|<\/main>)/g)].map(
      m => /--[\w-]+:\s*(?:&quot;|")([^&"]*)(?:&quot;|")\s*(?:;|"|$)/.exec(m[1])?.[1] ?? '',
    );
  }

  // On a Node build that crashes in Intl.Segmenter, both renders run without it.
  const segmenterCrashes =
    spawnSync(process.execPath, ['-e', "[...new Intl.Segmenter('en').segment('a b')]"], {stdio: 'ignore'}).signal !== null;

  it.skipIf(segmenterCrashes)('match for ordinary names and differ only for joined emoji, flags and separate accent marks', async () => {
    put('initials/with.tsx', body);
    put('initials/no-segmenter.ts', 'delete (Intl as any).Segmenter;\nexport {};\n');
    put('initials/without.tsx', `import './no-segmenter';\n${body}`);
    expect(await initialsOf('with')).toEqual(NAMES.map(([, withSegmenter]) => withSegmenter));
    expect(await initialsOf('without')).toEqual(NAMES.map(([, , withoutSegmenter]) => withoutSegmenter));
  }, 60_000);

  it('names the Node build in the warning and says the output may differ slightly', () => {
    const warning = segmenterWarning();
    expect(warning.code).toBe('node-crash');
    expect(warning.message).toContain(`${process.version} at ${process.execPath}`);
    expect(warning.message).toContain('may differ slightly');
  });
});

describe('render(): a page outside a project', () => {
  /** @type {string} */
  let away;
  const BIN = path.join(CLI_DIR, 'clients', 'cli', 'bin', 'astryx.mjs');

  /** @param {string} cwd @param {string[]} args */
  const runBin = (cwd, args) => {
    // A test runner's NODE_PATH would reach this repository's packages.
    const {NODE_PATH: _, ...env} = process.env;
    const run = spawnSync(process.execPath, [BIN, '--json', ...args], {cwd, env, encoding: 'utf8', timeout: 60_000});
    return {status: run.status, json: JSON.parse(run.stdout)};
  };

  beforeAll(() => {
    away = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-render-away-')));
  });

  afterAll(() => {
    fs.rmSync(away, {recursive: true, force: true});
  });

  it('takes Astryx, React and StyleX from the copy the CLI runs with', () => {
    fs.writeFileSync(path.join(away, 'page.tsx'), PAGE);
    fs.writeFileSync(path.join(away, 'dot.png'), PNG);
    const run = runBin(away, ['experimental', 'render', 'page.tsx']);
    expect(run.status).toBe(0);
    expect(run.json.data.stylesheets).toContain('@astryxdesign/core/astryx.css');
    expect(run.json.data.warnings.map((/** @type {any} */ w) => w.code)).not.toContain('no-astryx-styles');
    const html = fs.readFileSync(path.join(away, 'page.html'), 'utf8');
    expect(html).toContain('Café ✓ report');
    expect(html).toContain('astryx-button');
    const back = runBin(away, ['experimental', 'render', '--reverse', 'page.html']);
    expect(back.json.data.exact).toBe(true);
    expect(fs.readFileSync(path.join(away, 'page-restored', 'page.tsx'), 'utf8')).toBe(PAGE);
  }, 60_000);

  it('carries the modules a page imports from above its own folder, as a restore lays them out', () => {
    const tree = path.join(away, 'tree');
    fs.mkdirSync(path.join(tree, 'app/x'), {recursive: true});
    fs.mkdirSync(path.join(tree, 'components'), {recursive: true});
    fs.writeFileSync(path.join(tree, 'components/Banner.tsx'), 'export function Banner() {\n  return <p>Banner above the page</p>;\n}\n');
    fs.writeFileSync(path.join(tree, 'app/x/page.tsx'), "import {Banner} from '../../components/Banner';\nexport default function Page() {\n  return <main><Banner /></main>;\n}\n");
    const run = runBin(tree, ['experimental', 'render', 'app/x/page.tsx']);
    expect(run.status).toBe(0);
    expect(run.json.data.files).toEqual(['app/x/page.tsx', 'components/Banner.tsx']);
    const back = runBin(tree, ['experimental', 'render', '--reverse', 'app/x/page.html']);
    expect(back.json.data).toMatchObject({exact: true, files: ['app/x/page-restored/app/x/page.tsx', 'app/x/page-restored/components/Banner.tsx']});
    // The note names the page by its path among the files it lists.
    const note = fs.readFileSync(path.join(tree, 'app/x/page.html'), 'utf8');
    expect(note).toContain('Page: app/x/page.tsx\n');
    expect(note).toContain('Carried files (2): app/x/page.tsx, components/Banner.tsx');
    expect(note).toContain('edit app/x/page.tsx there instead');
    // The page's own folder still holds the tsconfig.json and the public/
    // images it is rendered with.
    fs.mkdirSync(path.join(tree, 'site/public'), {recursive: true});
    fs.writeFileSync(path.join(tree, 'site/tsconfig.json'), '{"compilerOptions": {"paths": {"@/*": ["./*"]}}}\n');
    fs.writeFileSync(path.join(tree, 'site/public/logo.png'), PNG);
    fs.writeFileSync(path.join(tree, 'site/Note.tsx'), 'export function Note() {\n  return <p>Note by alias</p>;\n}\n');
    fs.writeFileSync(path.join(tree, 'site/page.tsx'), "import {Note} from '@/Note';\nexport default function Page() {\n  return <main><Note /><img src=\"/logo.png\" alt=\"\" /></main>;\n}\n");
    const site = runBin(tree, ['experimental', 'render', 'site/page.tsx']);
    expect(site.status).toBe(0);
    const siteHtml = fs.readFileSync(path.join(tree, 'site/page.html'), 'utf8');
    expect(siteHtml).toContain('Note by alias');
    expect(siteHtml).toContain('src="data:image/png;base64,');
    // A page that imports nothing above its own folder is named as it is
    // listed among the files.
    expect(siteHtml).toContain('Page: page.tsx\n');
  }, 60_000);

  it('keeps a page in a folder named like ..x whole: a file above it stays out, and is named', () => {
    const tree = path.join(away, 'dots');
    fs.mkdirSync(path.join(tree, '..x'), {recursive: true});
    fs.mkdirSync(path.join(tree, 'shared'), {recursive: true});
    fs.writeFileSync(path.join(tree, 'shared/Banner.tsx'), 'export function Banner() {\n  return <p>Banner above</p>;\n}\n');
    fs.writeFileSync(path.join(tree, '..x/page.tsx'), "import {Banner} from '../shared/Banner';\nexport default function Page() {\n  return <main><Banner /></main>;\n}\n");
    const run = runBin(tree, ['experimental', 'render', '..x/page.tsx']);
    expect(run.status).toBe(0);
    expect(run.json.data.files).toEqual(['page.tsx']);
    expect(run.json.data.warnings.map((/** @type {any} */ w) => w.code)).toContain('not-embedded');
    const back = runBin(path.join(tree, '..x'), ['experimental', 'render', '--reverse', 'page.html']);
    expect(back.status).toBe(0);
    expect(back.json.data).toMatchObject({mode: 'embedded', output: 'page-restored/page.tsx'});
  }, 60_000);

  it('loads one React outside a project, even when the folder holds its own copy', () => {
    const sub = path.join(away, 'own-react');
    for (const name of ['react', 'react-dom']) {
      const target = path.dirname(createRequire(path.join(CLI_DIR, '../core/package.json')).resolve(`${name}/package.json`));
      fs.mkdirSync(path.join(sub, 'node_modules'), {recursive: true});
      fs.cpSync(target, path.join(sub, 'node_modules', name), {recursive: true, dereference: true});
    }
    fs.writeFileSync(
      path.join(sub, 'page.jsx'),
      "import {useState} from 'react';\nimport {TextInput} from '@astryxdesign/core';\nexport default function Page() {\n  const [v] = useState('typed');\n  return <TextInput label=\"Name\" value={v} onChange={() => {}} />;\n}\n",
    );
    const run = runBin(sub, ['experimental', 'render', 'page.jsx']);
    expect(run.status).toBe(0);
    expect(fs.readFileSync(path.join(sub, 'page.html'), 'utf8')).toContain('typed');
  }, 60_000);

  it('gives a library in the folder the same React, as CommonJS and as an ES module', () => {
    const sub = path.join(away, 'react-app');
    const nm = path.join(sub, 'node_modules');
    for (const name of ['react', 'react-dom']) {
      const target = path.dirname(createRequire(path.join(CLI_DIR, '../core/package.json')).resolve(`${name}/package.json`));
      fs.mkdirSync(nm, {recursive: true});
      fs.cpSync(target, path.join(nm, name), {recursive: true, dereference: true});
    }
    fs.mkdirSync(path.join(nm, 'hook-cjs'), {recursive: true});
    fs.writeFileSync(path.join(nm, 'hook-cjs', 'package.json'), '{"name":"hook-cjs","main":"index.js"}');
    fs.writeFileSync(path.join(nm, 'hook-cjs', 'index.js'), "const {useState} = require('react');\nexports.useCjs = () => useState('cjs-hook')[0];\n");
    fs.mkdirSync(path.join(nm, 'hook-esm'), {recursive: true});
    fs.writeFileSync(path.join(nm, 'hook-esm', 'package.json'), '{"name":"hook-esm","type":"module","exports":"./index.js"}');
    fs.writeFileSync(path.join(nm, 'hook-esm', 'index.js'), "import {useState} from 'react';\nexport const useEsm = () => useState('esm-hook')[0];\n");
    const body = "  const a = useCjs();\n  const b = useEsm();\n";
    fs.writeFileSync(
      path.join(sub, 'plain.jsx'),
      `import {useCjs} from 'hook-cjs';\nimport {useEsm} from 'hook-esm';\nexport default function Page() {\n${body}  return <p>{a} {b}</p>;\n}\n`,
    );
    fs.writeFileSync(
      path.join(sub, 'core.jsx'),
      `import {useCjs} from 'hook-cjs';\nimport {useEsm} from 'hook-esm';\nimport {Button} from '@astryxdesign/core';\nexport default function Page() {\n${body}  return <Button label={a + ' ' + b} />;\n}\n`,
    );
    for (const page of ['plain', 'core']) {
      const run = runBin(sub, ['experimental', 'render', `${page}.jsx`]);
      expect(run.status).toBe(0);
      const html = fs.readFileSync(path.join(sub, `${page}.html`), 'utf8');
      expect(html).toContain('cjs-hook');
      expect(html).toContain('esm-hook');
    }
  }, 90_000);

  it('says the CLI runs without Core only for a render outside a project', async () => {
    const sub = path.join(away, 'no-core');
    for (const name of ['react', 'react-dom']) {
      const target = path.dirname(createRequire(path.join(CLI_DIR, '../core/package.json')).resolve(`${name}/package.json`));
      fs.mkdirSync(path.join(sub, 'node_modules'), {recursive: true});
      fs.cpSync(target, path.join(sub, 'node_modules', name), {recursive: true, dereference: true});
    }
    fs.writeFileSync(path.join(sub, 'page.jsx'), 'export default () => <p>no core</p>;\n');
    // In a fresh process without the test runner's NODE_PATH, which would reach this repository's Core.
    const script = `
const {renderPage} = await import(${JSON.stringify(path.join(CLI_DIR, 'foundation/render/render-page.mjs'))});
const entry = ${JSON.stringify(path.join(sub, 'page.jsx'))};
const textOf = page => page.warnings.find(w => w.code === 'no-astryx-styles')?.message;
const inside = textOf(await renderPage(entry, {served: null}));
const outside = textOf(await renderPage(entry, {served: {dir: ${JSON.stringify(path.join(sub, 'no-such-core'))}, integrations: []}}));
console.log(JSON.stringify({inside, outside}));
`;
    const {NODE_PATH: _, ...env} = process.env;
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], {cwd: sub, env, encoding: 'utf8', timeout: 60_000});
    const {inside, outside} = JSON.parse(run.stdout.trim().split('\n').pop() ?? '{}');
    expect(inside).toBe('@astryxdesign/core is not installed where the page is, so the page has no Astryx styles; install it, or render from inside the project.');
    expect(outside).toContain('and the CLI runs without one');
  }, 60_000);

  it("compiles a page's StyleX that reads Core's theme variables, with the names Core's stylesheet defines", () => {
    const sub = path.join(away, 'tokens');
    fs.mkdirSync(sub, {recursive: true});
    fs.writeFileSync(
      path.join(sub, 'page.tsx'),
      [
        "import * as stylex from '@stylexjs/stylex';",
        "import {colorVars, spacingVars} from '@astryxdesign/core/theme/tokens.stylex';",
        "import {Text} from '@astryxdesign/core/Text';",
        '',
        "const styles = stylex.create({box: {backgroundColor: colorVars['--color-background-surface'], padding: spacingVars['--spacing-2']}});",
        '',
        'export default function Page() {',
        '  return <div {...stylex.props(styles.box)}><Text>Themed box</Text></div>;',
        '}',
        '',
      ].join('\n'),
    );
    const run = runBin(sub, ['experimental', 'render', 'page.tsx']);
    expect(run.status, JSON.stringify(run.json)).toBe(0);
    const html = fs.readFileSync(path.join(sub, 'page.html'), 'utf8');
    const style = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
    for (const name of ['--color-background-surface', '--spacing-2']) {
      expect(style).toContain(`var(${name})`);
      expect(style).toContain(`${name}:`);
    }
  }, 60_000);

  it('still names a package the CLI does not carry as not installed', () => {
    fs.writeFileSync(path.join(away, 'dep.jsx'), "import x from 'not-a-real-package-xyz';\nexport default () => <p>{String(x)}</p>;\n");
    const run = runBin(away, ['experimental', 'render', 'dep.jsx']);
    expect(run.json.code).toBe('ERR_RENDER_MISSING_DEPENDENCY');
  }, 60_000);

  it("uses only the project's own packages inside a project", async () => {
    const {renderPage} = await import('../../foundation/render/render-page.mjs');
    const page = await renderPage(path.join(dir, 'page.tsx'), {
      served: {dir: path.join(away, 'no-such-core'), integrations: []},
    });
    expect(page.fromSet).toEqual([]);
    expect(page.stylesheets).toContain('@astryxdesign/core/astryx.css');
  }, 60_000);
});

describe('render(): charts', () => {
  const DATA = "const data = [{d: 'a', v: 1}, {d: 'b', v: 3}, {d: 'c', v: 2}];";

  it('draws a chart sized by its container and a chart of fixed size, and lets the first fit the width', async () => {
    put(
      'charts.tsx',
      `import {ResponsiveContainer, LineChart, Line, XAxis, BarChart, Bar} from 'recharts';
${DATA}
export default function Page() {
  return (
    <div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data}><XAxis dataKey="d" /><Line dataKey="v" /></LineChart>
      </ResponsiveContainer>
      <BarChart width={300} height={120} data={data}><Bar dataKey="v" /></BarChart>
    </div>
  );
}
`,
    );
    const result = /** @type {any} */ (await render('charts.tsx', {cwd: dir}));
    expect(result.data.warnings.map((/** @type {any} */ w) => w.code)).not.toContain('chart-size');
    const html = fs.readFileSync(path.join(dir, 'charts.html'), 'utf8');
    expect(html.match(/<svg[^>]*class="recharts-surface"/g)).toHaveLength(2);
    expect(html).toContain('recharts-line-curve');
    expect(html).toContain('recharts-bar-rectangle');
    // A container 200 pixels high starts two and a half times as wide.
    expect(html).toContain('viewBox="0 0 500 200"');
    expect(html).toContain('.recharts-responsive-container>.recharts-wrapper>svg.recharts-surface{width:100%!important');
    expect(html).not.toContain('<astryx-chart');
  }, 60_000);

  it('keeps room for a fixed chart\'s legend where its props place it, and gives a container chart\'s legend its own row', async () => {
    put(
      'charts-legend.tsx',
      `import {ResponsiveContainer, LineChart, Line, XAxis, Legend} from 'recharts';
${DATA}
export default function Page() {
  return (
    <div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data}><XAxis dataKey="d" /><Line dataKey="v" /><Legend /></LineChart>
      </ResponsiveContainer>
      <LineChart width={400} height={200} data={data}><XAxis dataKey="d" /><Line dataKey="v" /><Legend /></LineChart>
      <LineChart width={550} height={220} data={data}><XAxis dataKey="d" /><Line dataKey="v" name="Visits" /><Legend layout="vertical" align="right" verticalAlign="middle" /></LineChart>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data}><XAxis dataKey="d" /><Line dataKey="v" name="Visits" /><Legend layout="vertical" align="right" verticalAlign="middle" /></LineChart>
      </ResponsiveContainer>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data}><XAxis dataKey="d" /><Line dataKey="v" name="Wins" /><Legend layout="vertical" align="left" verticalAlign="bottom" /></LineChart>
      </ResponsiveContainer>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data}><XAxis dataKey="d" /><Line dataKey="v" name="Ties" /><Legend layout="vertical" align="center" verticalAlign="bottom" /></LineChart>
      </ResponsiveContainer>
    </div>
  );
}
`,
    );
    const result = /** @type {any} */ (await render('charts-legend.tsx', {cwd: dir}));
    expect(result.data.warnings.map((/** @type {any} */ w) => w.code)).not.toContain('chart-size');
    const html = fs.readFileSync(path.join(dir, 'charts-legend.html'), 'utf8');
    const axes = [...html.matchAll(/<line\b[^>]*class="recharts-cartesian-axis-line"[^>]*>/g)].map(m => ({
      y: Number(/\by1="([\d.]+)"/.exec(m[0])?.[1]),
      x2: Number(/\bx2="([\d.]+)"/.exec(m[0])?.[1]),
    }));
    // A container chart keeps no room in its picture: its legend takes its
    // own row under it, so the x-axis sits at 200 - 5 - 30 = 165.
    expect(axes[0].y).toBe(165);
    // A fixed chart keeps a row for a bottom legend: 200 - 5 - 24 - 30 = 141.
    expect(axes[1].y).toBe(141);
    // A legend at the side keeps room on the right: the plot ends before it.
    expect(axes[2].x2).toBeLessThan(550 - 40);
    expect(html).toContain('.recharts-responsive-container>.recharts-wrapper>.recharts-legend-wrapper{position:static!important;width:auto!important');
    expect(html).toContain('.recharts-legend-wrapper[style*="bottom"]{order:1}');
    // A vertical legend in a container chart sits beside the picture, centered.
    const sided = [...html.matchAll(/<div\b[^>]*class="recharts-wrapper"[^>]*>/g)].map(m => m[0]).filter(tag => tag.includes('data-legend-side'));
    // Right and middle, then left and bottom; a vertical legend centered
    // across takes its own row, unmarked.
    expect(sided).toHaveLength(2);
    expect(sided[0]).toContain('data-legend-side="right"');
    expect(sided[0]).toContain('data-legend-middle=""');
    expect(sided[1]).toContain('data-legend-side="left"');
    expect(sided[1]).not.toContain('data-legend-middle');
    expect(sided[1]).toContain('data-legend-bottom=""');
    // A bottom legend goes under the picture only when it is not beside it.
    expect(html).toContain('.recharts-wrapper:not([data-legend-side])>.recharts-legend-wrapper[style*="bottom"]{order:1}');
    expect(html).toContain('[data-legend-side]{flex-direction:row');
    // A side is physical: a right-to-left page reverses the row.
    expect(html).toContain('[data-legend-side]:dir(rtl){flex-direction:row-reverse}');
    expect(html).toContain('[data-legend-side="right"]>.recharts-legend-wrapper{order:1}');
    // Only the chart's own picture scales; a legend's icons keep their size.
    expect(html).toContain('.recharts-responsive-container>.recharts-wrapper>svg.recharts-surface{');
    expect(html).not.toContain('.recharts-responsive-container .recharts-surface');
  }, 60_000);

  it("draws a chart's parts in the React context the page gives them", async () => {
    put(
      'charts-context.tsx',
      `import {createContext, useContext} from 'react';
import {BarChart, Bar, XAxis} from 'recharts';
${DATA}
const Units = createContext('items');
function Tick(props: any) {
  const units = useContext(Units);
  return <text x={props.x} y={props.y + 12}>{props.payload.value} {units}</text>;
}
export default function Page() {
  return (
    <Units.Provider value="km">
      <BarChart width={300} height={150} data={data}><XAxis dataKey="d" tick={<Tick />} /><Bar dataKey="v" /></BarChart>
    </Units.Provider>
  );
}
`,
    );
    await render('charts-context.tsx', {cwd: dir});
    const html = fs.readFileSync(path.join(dir, 'charts-context.html'), 'utf8');
    expect(html).toContain('a km');
    expect(html).not.toContain('a items');
  }, 60_000);

  it('draws inside a page that uses Core scrolling components, so context still reaches the chart', async () => {
    put(
      'charts-core.tsx',
      `import {createContext, useContext} from 'react';
import {ScrollableArea} from '@astryxdesign/core/ScrollableArea';
import {BarChart, Bar, XAxis} from 'recharts';
${DATA}
const Units = createContext('items');
function Tick(props: any) {
  return <text x={props.x} y={props.y + 12}>{props.payload.value} {useContext(Units)}</text>;
}
export default function Page() {
  console.log('rendered once');
  return (
    <Units.Provider value="km">
      <ScrollableArea>
        <BarChart width={300} height={150} data={data}><XAxis dataKey="d" tick={<Tick />} /><Bar dataKey="v" /></BarChart>
      </ScrollableArea>
    </Units.Provider>
  );
}
`,
    );
    const result = /** @type {any} */ (await render('charts-core.tsx', {cwd: dir}));
    const html = fs.readFileSync(path.join(dir, 'charts-core.html'), 'utf8');
    expect(html).toContain('a km');
    expect(result.data.warnings.map((/** @type {any} */ w) => w.code)).not.toContain('chart-size');
    // What the page prints is reported once, from the server render.
    const printed = result.data.warnings.filter((/** @type {any} */ w) => w.code === 'page-output');
    expect(printed.filter((/** @type {any} */ w) => w.message.includes('rendered once'))).toHaveLength(1);
  }, 60_000);

  it('says so when it draws each chart by itself', async () => {
    put(
      'charts-alone.tsx',
      `import {BarChart, Bar} from 'recharts';
${DATA}
function OnlyOnServer() {
  // Throws only once a document exists, so the page draws on the server but not again.
  if (typeof document !== 'undefined') throw new Error('no second draw');
  return null;
}
export default function Page() {
  return <div><OnlyOnServer /><BarChart width={300} height={150} data={data}><Bar dataKey="v" /></BarChart></div>;
}
`,
    );
    const result = /** @type {any} */ (await render('charts-alone.tsx', {cwd: dir}));
    const html = fs.readFileSync(path.join(dir, 'charts-alone.html'), 'utf8');
    expect(html).toContain('recharts-bar-rectangle');
    const warning = result.data.warnings.find((/** @type {any} */ w) => w.code === 'chart-size');
    expect(warning?.message).toContain('each chart was drawn by itself');
  }, 60_000);

  it('draws charts as the first render gives them, not as the page\'s effects change it', async () => {
    put(
      'charts-effects.tsx',
      `import {useEffect, useState} from 'react';
import {BarChart, Bar, XAxis} from 'recharts';
${DATA}
export default function Page() {
  const [rows, setRows] = useState<string[]>([]);
  useEffect(() => setRows(['order one']), []);
  return (
    <div>
      <p>{rows.length === 0 ? 'No orders yet' : rows.join(', ')}</p>
      {rows.length === 0 ? null : <BarChart width={300} height={150} data={data}><XAxis dataKey="d" /><Bar dataKey="v" /></BarChart>}
      <BarChart width={300} height={150} data={data}><XAxis dataKey="d" /><Bar dataKey="v" /></BarChart>
    </div>
  );
}
`,
    );
    const result = /** @type {any} */ (await render('charts-effects.tsx', {cwd: dir}));
    const html = fs.readFileSync(path.join(dir, 'charts-effects.html'), 'utf8');
    expect(html).toContain('No orders yet');
    expect(html.match(/<svg[^>]*class="recharts-surface"/g)).toHaveLength(1);
    const warning = result.data.warnings.find((/** @type {any} */ w) => w.code === 'chart-size');
    expect(warning?.message).toContain('once its effects ran');
  }, 60_000);

  it('draws a chart as the first render gave it when an effect changes state a closure in it reads', async () => {
    put(
      'charts-effect-closure.tsx',
      `import {useEffect, useState} from 'react';
import {BarChart, Bar, XAxis} from 'recharts';
const data = [{d: 'Mon', v: 1}, {d: 'Tue', v: 2}];
export default function Page() {
  const [unit, setUnit] = useState('items');
  useEffect(() => setUnit('km'), []);
  return (
    <div>
      <p>Unit: {unit}</p>
      <BarChart width={300} height={150} data={data}><XAxis dataKey="d" tickFormatter={(v: string) => v + ' ' + unit} /><Bar dataKey="v" /></BarChart>
    </div>
  );
}
`,
    );
    const result = /** @type {any} */ (await render('charts-effect-closure.tsx', {cwd: dir}));
    const html = fs.readFileSync(path.join(dir, 'charts-effect-closure.html'), 'utf8');
    expect(html).toContain('Unit: items');
    expect(html).toContain('Mon items');
    expect(html).not.toContain('Mon km');
    expect(result.data.warnings.find((/** @type {any} */ w) => w.code === 'chart-size')?.message).toContain('A component that makes a chart rendered again');
  }, 60_000);

  it('names a re-render as the cause when a chart\'s maker only re-renders in an effect', async () => {
    put(
      'charts-effect-mounted.tsx',
      `import {useEffect, useState} from 'react';
import {BarChart, Bar} from 'recharts';
const data = [{v: 1}, {v: 2}];
export default function Page() {
  const [, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return <BarChart width={300} height={150} data={data}><Bar dataKey="v" /></BarChart>;
}
`,
    );
    const result = /** @type {any} */ (await render('charts-effect-mounted.tsx', {cwd: dir}));
    const message = result.data.warnings.find((/** @type {any} */ w) => w.code === 'chart-size')?.message ?? '';
    expect(message).toContain('A component that makes a chart rendered again');
    expect(message).not.toContain('changed its charts');
  }, 60_000);

  it('keeps first-render data and props, and lets a context an effect changes reach the chart', async () => {
    // The guide promises a chart's data and props from the first render; a
    // value its parts read from a context that an effect changes may show its
    // later value.
    put(
      'charts-effect-provider.tsx',
      `import {createContext, useContext, useEffect, useState} from 'react';
import {BarChart, Bar, XAxis} from 'recharts';
const data = [{d: 'a', v: 1}, {d: 'b', v: 2}];
const Units = createContext('items');
function UnitsProvider({children}: {children: any}) {
  const [unit, setUnit] = useState('items');
  useEffect(() => setUnit('km'), []);
  return <Units.Provider value={unit}><p>Unit: {unit}</p>{children}</Units.Provider>;
}
function Tick(props: any) {
  return <text x={props.x} y={props.y + 12}>{props.payload.value} {useContext(Units)}</text>;
}
export default function Page() {
  return (
    <UnitsProvider>
      <BarChart width={300} height={150} data={data}><XAxis dataKey="d" tick={<Tick />} /><Bar dataKey="v" /></BarChart>
    </UnitsProvider>
  );
}
`,
    );
    await render('charts-effect-provider.tsx', {cwd: dir});
    const html = fs.readFileSync(path.join(dir, 'charts-effect-provider.html'), 'utf8');
    expect(html).toContain('Unit: items');
    expect(html.match(/\brecharts-bar-rectangle\b(?!s)/g)).toHaveLength(2);
    expect(html).toMatch(/a (items|km)/);
  }, 60_000);

  it('draws a chart with the data of the first render when an effect replaces it', async () => {
    put(
      'charts-effect-data.tsx',
      `import {useEffect, useState} from 'react';
import {BarChart, Bar, XAxis} from 'recharts';
export default function Page() {
  const [data, setData] = useState([{d: 'first', v: 1}]);
  useEffect(() => setData([{d: 'later', v: 2}]), []);
  return <BarChart width={300} height={150} data={data}><XAxis dataKey="d" /><Bar dataKey="v" /></BarChart>;
}
`,
    );
    const result = /** @type {any} */ (await render('charts-effect-data.tsx', {cwd: dir}));
    const html = fs.readFileSync(path.join(dir, 'charts-effect-data.html'), 'utf8');
    expect(html).toContain('>first<');
    expect(html).not.toContain('>later<');
    expect(result.data.warnings.find((/** @type {any} */ w) => w.code === 'chart-size')?.message).toContain('once its effects ran');
  }, 60_000);

  it('keeps room for a legend that wraps onto more rows', async () => {
    put(
      'charts-wrap.tsx',
      `import {LineChart, Line, XAxis, Legend} from 'recharts';
const data = [{d: 'Mon', a: 1, b: 2, c: 3, e: 4, f: 5}, {d: 'Tue', a: 2, b: 3, c: 1, e: 2, f: 3}];
export default function Page() {
  return (
    <LineChart width={480} height={240} data={data}>
      <XAxis dataKey="d" />
      <Line dataKey="a" name="Northern region" /><Line dataKey="b" name="Southern region" />
      <Line dataKey="c" name="Eastern region" /><Line dataKey="e" name="Western region" />
      <Line dataKey="f" name="Central region" />
      <Legend />
    </LineChart>
  );
}
`,
    );
    await render('charts-wrap.tsx', {cwd: dir});
    const html = fs.readFileSync(path.join(dir, 'charts-wrap.html'), 'utf8');
    const axis = /<line\b[^>]*class="recharts-cartesian-axis-line"[^>]*>/.exec(html)?.[0] ?? '';
    // Five names of about 120 px each wrap into two rows in 470 px, so the
    // axis sits two legend rows up: 240 - 5 - 48 - 30 = 157.
    expect(Number(/\by1="([\d.]+)"/.exec(axis)?.[1])).toBe(157);
    // In a container chart the same legend takes its own row under the
    // picture, which keeps no room for it, so it cannot cover the axis.
    put('charts-wrap-rc.tsx', fs.readFileSync(path.join(dir, 'charts-wrap.tsx'), 'utf8')
      .replace("import {LineChart,", "import {ResponsiveContainer, LineChart,")
      .replace('<LineChart width={480} height={240} data={data}>', '<ResponsiveContainer width="100%" height={240}><LineChart data={data}>')
      .replace('</LineChart>', '</LineChart></ResponsiveContainer>'));
    await render('charts-wrap-rc.tsx', {cwd: dir});
    const rc = fs.readFileSync(path.join(dir, 'charts-wrap-rc.html'), 'utf8');
    const rcAxis = /<line\b[^>]*class="recharts-cartesian-axis-line"[^>]*>/.exec(rc)?.[0] ?? '';
    expect(Number(/\by1="([\d.]+)"/.exec(rcAxis)?.[1])).toBe(240 - 5 - 30);
    expect(rc).toContain('recharts-legend-wrapper');
  }, 60_000);

  it('lays out axis labels as a browser does: the last label stays inside, and crowded labels thin out', async () => {
    const times = Array.from({length: 25}, (_, i) => `Apr ${1 + Math.floor((14 + i) / 24)} ${String((14 + i) % 24).padStart(2, '0')}:00`);
    const cats = Array.from({length: 24}, (_, i) => `Category ${String(i + 1).padStart(2, '0')}`);
    put(
      'charts-axis.tsx',
      `import {ResponsiveContainer, LineChart, Line, XAxis, BarChart, Bar} from 'recharts';
const times = ${JSON.stringify(times)}.map((t, i) => ({t, v: i}));
const cats = ${JSON.stringify(cats)}.map((c, i) => ({c, v: i}));
export default function Page() {
  return (
    <div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={times}><XAxis dataKey="t" /><Line dataKey="v" /></LineChart>
      </ResponsiveContainer>
      <BarChart width={400} height={200} data={cats}><XAxis dataKey="c" /><Bar dataKey="v" /></BarChart>
    </div>
  );
}
`,
    );
    await render('charts-axis.tsx', {cwd: dir});
    const html = fs.readFileSync(path.join(dir, 'charts-axis.html'), 'utf8');
    const ticks = [...html.matchAll(/<text\b([^>]*class="recharts-text recharts-cartesian-axis-tick-value"[^>]*)>\s*<tspan[^>]*>([^<]*)/g)].map(m => ({
      x: Number(/\bx="([\d.]+)"/.exec(m[1])?.[1]),
      anchor: /text-anchor="(\w+)"/.exec(m[1])?.[1],
      text: m[2],
    }));
    const timeTicks = ticks.filter(t => t.text.startsWith('Apr'));
    const last = timeTicks[timeTicks.length - 1];
    // The drawing is 750 wide; an 11-character label at 14 px is about 92 wide.
    expect(last.anchor).toBe('middle');
    expect(last.x + Math.round(last.text.length * 14 * 0.6) / 2).toBeLessThanOrEqual(750);
    expect(timeTicks.length).toBeLessThan(25);
    const catTicks = ticks.filter(t => t.text.startsWith('Category'));
    expect(catTicks.length).toBeGreaterThan(1);
    expect(catTicks.length).toBeLessThan(24);
  }, 60_000);

  it("keeps a StrictMode page's context in its charts", async () => {
    put(
      'charts-strict.tsx',
      `import {StrictMode, createContext, useContext} from 'react';
import {BarChart, Bar, XAxis} from 'recharts';
${DATA}
const Units = createContext('items');
function Tick(props: any) {
  return <text x={props.x} y={props.y + 12}>{props.payload.value} {useContext(Units)}</text>;
}
export default function Page() {
  return (
    <StrictMode>
      <Units.Provider value="km">
        <BarChart width={300} height={150} data={data}><XAxis dataKey="d" tick={<Tick />} /><Bar dataKey="v" /></BarChart>
      </Units.Provider>
    </StrictMode>
  );
}
`,
    );
    const result = /** @type {any} */ (await render('charts-strict.tsx', {cwd: dir}));
    const html = fs.readFileSync(path.join(dir, 'charts-strict.html'), 'utf8');
    expect(html).toContain('a km');
    expect(result.data.warnings.map((/** @type {any} */ w) => w.code)).not.toContain('chart-size');
  }, 60_000);

  it('names a chart of fixed size it cannot draw', async () => {
    put(
      'charts-ns-fixed.tsx',
      `import * as R from 'recharts';
${DATA}
export default function Page() {
  return <R.BarChart width={300} height={120} data={data}><R.Bar dataKey="v" /></R.BarChart>;
}
`,
    );
    const result = /** @type {any} */ (await render('charts-ns-fixed.tsx', {cwd: dir}));
    const warning = result.data.warnings.find((/** @type {any} */ w) => w.code === 'chart-size');
    expect(warning?.message).toContain("from recharts by name");
    expect(warning?.message).not.toContain('fixed width');
  }, 60_000);

  it('warns about a chart it cannot draw', async () => {
    put(
      'charts-ns.tsx',
      `import * as R from 'recharts';
${DATA}
export default function Page() {
  return (
    <R.ResponsiveContainer width="100%" height={200}>
      <R.LineChart data={data}><R.Line dataKey="v" /></R.LineChart>
    </R.ResponsiveContainer>
  );
}
`,
    );
    const result = /** @type {any} */ (await render('charts-ns.tsx', {cwd: dir}));
    expect(result.data.warnings.map((/** @type {any} */ w) => w.code)).toContain('chart-size');
  }, 60_000);

  it('gives back a page with charts byte for byte', async () => {
    const source = fs.readFileSync(path.join(dir, 'charts.tsx'), 'utf8');
    const back = /** @type {any} */ (await render('charts.html', {cwd: dir, reverse: true, out: 'charts-back/charts.tsx'}));
    expect(back.data.exact).toBe(true);
    expect(fs.readFileSync(path.join(dir, 'charts-back', 'charts.tsx'), 'utf8')).toBe(source);
  }, 60_000);
});
