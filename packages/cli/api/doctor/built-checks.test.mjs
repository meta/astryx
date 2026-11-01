// Copyright (c) Meta Platforms, Inc. and affiliates.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {performance} from 'node:perf_hooks';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {checkBuilt, scanBuilt} from './built-checks.mjs';
import {builtIntegrationPackages} from './_adapter.mjs';
import {runChecks} from './doctor.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';

/** @type {string} */
let dir;

/**
 * @param {Record<string, string>} files relative path → contents
 */
function write(files) {
  for (const [rel, text] of Object.entries(files)) {
    const file = path.join(dir, rel);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, text);
  }
}

/** @param {string} target @param {string[]} [packages] */
function check(target, packages = []) {
  const [usage, purity] = checkBuilt(target, {cwd: dir, packages});
  return {usage, purity};
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-built-'));
});

afterEach(() => {
  fs.rmSync(dir, {recursive: true, force: true});
});

describe('built-astryx-usage', () => {
  it('fails a hand-written page with no Astryx at all, with the way to rebuild it', () => {
    write({
      'out/index.html':
        '<!doctype html><html><head><style>.cat{display:flex}</style></head><body><div class="cat"><h1>Cats</h1></div></body></html>',
    });

    for (const target of ['out', 'out/index.html']) {
      const {usage, purity} = check(target);
      expect(usage.status).toBe('fail');
      expect(usage.message).toContain('does not use Astryx');
      expect(usage.fix).toContain('build "<what the page is>"');
      expect(usage.fix).toContain('Do not deliver');
      // Built HTML is not source: the purity check says it did not run.
      expect(purity.status).toBe('info');
    }
  });

  it('passes source that imports Astryx components and uses them', () => {
    write({
      'src/Page.tsx':
        'import {Button} from \'@astryxdesign/core/Button\';\nexport const Page = () => <Button label="Go" />;\n',
    });

    const {usage} = check('.');
    expect(usage.status).toBe('pass');
    expect(usage.message).toContain('1 import from @astryxdesign/core');
    expect(usage.message).toContain('1 component use');
  });

  it("counts an integration's components as Astryx, by the package names the project loads", () => {
    write({
      'app/page.tsx':
        'import {AcmeBadge} from \'@acme/ui/Badge\';\nexport default () => <AcmeBadge label="New" />;\n',
    });

    expect(check('.').usage.status).toBe('fail');
    const {usage} = check('.', ['@acme/ui']);
    expect(usage.status).toBe('pass');
    expect(usage.message).toContain('@acme/ui');
  });

  it('passes built output that carries Astryx styles, minified', () => {
    write({
      'dist/assets/app.css':
        '@layer reset,astryx-base,astryx-theme;@layer astryx-base{.x1{color:red}}',
    });

    const {usage, purity} = check('dist');
    expect(usage.status).toBe('pass');
    expect(usage.message).toContain('Astryx styles in assets/app.css');
    expect(purity.status).toBe('info');
  });

  it('reads a build folder inside a project for styles but never as source', () => {
    write({
      'src/page.tsx': '<div />',
      '.next/static/chunk.js': 'var a="<div className=x>";',
      '.next/static/app.css': ':root{--astryx-layer-modal:10}',
      'node_modules/@astryxdesign/core/index.js':
        "import '@astryxdesign/core';",
    });

    const scan = scanBuilt(dir, []);
    expect(scan.sourceFiles).toBe(1);
    expect(scan.stylesheets).toEqual(['.next/static/app.css']);
    expect(scan.imports).toBe(0);
  });

  it('fails a path that does not exist, saying nothing was checked', () => {
    const [usage, ...rest] = checkBuilt('missing', {cwd: dir, packages: []});
    expect(usage.status).toBe('fail');
    expect(usage.message).toContain('does not exist');
    expect(rest).toEqual([]);
  });
});

describe('built-astryx-purity', () => {
  it("names each finding of the rubric's source check with its file and line", () => {
    write({
      'src/Page.tsx': [
        "import {VStack} from '@astryxdesign/core/VStack';",
        "import {Search} from 'lucide-react';",
        "import './page.css';",
        '// <div> in a comment is not a finding',
        'export function Page() {',
        '  return (',
        '    <VStack>',
        '      <div className="row" style={{gap: 4}}>',
        '        <Search />',
        '        <svg viewBox="0 0 1 1"><path d="M0 0" /></svg>',
        '        <input type="hidden" name="x" />',
        '      </div>',
        '    </VStack>',
        '  );',
        '}',
        '',
      ].join('\n'),
    });

    const {usage, purity} = check('.');
    expect(usage.status).toBe('pass');
    expect(purity.status).toBe('warn');
    expect(purity.message).toMatch(/^6 findings/);
    expect(purity.message).toContain(
      'src/Page.tsx:3 imports the stylesheet `./page.css`',
    );
    expect(purity.message).toContain('src/Page.tsx:8 raw `<div>`');
    expect(purity.message).toContain(
      'src/Page.tsx:9 `<Search>` from an icon library',
    );
    // The message names the first five and counts the rest.
    expect(purity.message).toContain('and 1 more');
    const all = scanBuilt(dir, [])
      .findings.map(f => `${f.file}:${f.line} ${f.message}`)
      .join('\n');
    expect(all).toContain('src/Page.tsx:10 raw `<svg>`');
    // A helper's SVG counts once, and hidden form state keeps its element.
    expect(all).not.toContain('`<path>`');
    expect(all).not.toContain('`<input>`');
    expect(purity.fix).toContain('docs is-my-code-good');
  });

  it('passes source with no raw element, icon or custom style', () => {
    write({
      'src/Page.tsx':
        "import {Text} from '@astryxdesign/core/Text';\nimport type {ReactNode} from 'react';\nexport const Page = (): ReactNode => <Text>Hi</Text>;\n",
    });

    expect(check('src').purity.status).toBe('pass');
  });
});

describe('what a --built path counts', () => {
  it('reads a bundle as build output: the source check says it was not inspected', () => {
    write({
      'dist/assets/index.js':
        'import "./a.css";import{jsx as e}from"react/jsx-runtime";export default()=>e("div",{className:"x"});',
    });
    const {purity} = check('dist');
    expect(purity.status).toBe('info');
    expect(purity.message).toContain('Not inspected');
    expect(purity.fix).toContain('doctor --built <project folder>');
  });

  it('inspects JSX in a .js source file and a .tsx file inside a folder named build', () => {
    write({
      'src/page.js':
        'export default function Page() {\n  return <div>Hi</div>;\n}\n',
      'src/build/Form.tsx': 'export const Form = () => <button>Go</button>;\n',
    });
    const scan = scanBuilt(path.join(dir, 'src'), []);
    expect(scan.jsxFiles).toBe(2);
    expect(scan.findings.map(f => `${f.file}:${f.message}`)).toEqual([
      'build/Form.tsx:raw `<button>`: use `Button` or `IconButton`',
      'page.js:raw `<div>`: use `VStack`, `HStack`, `Grid`, `Card`, `Section` or `Center`',
    ]);
  });

  it('keeps a side-effect import apart from the import after it', () => {
    write({
      'src/Page.tsx':
        "import './page.css';\nimport {Button} from '@astryxdesign/core/Button';\nexport const Page = () => <Button label=\"Go\" />;\n",
    });
    const scan = scanBuilt(path.join(dir, 'src'), []);
    expect(scan.imports).toBe(1);
    expect(scan.componentUses).toBe(1);
    expect(scan.findings.map(f => f.message)).toContain(
      'imports the stylesheet `./page.css`: use component props and tokens',
    );
  });

  it('names the integrations by the declared dependencies that ship a manifest, running nothing', () => {
    write({
      'package.json': JSON.stringify({
        name: 'app',
        dependencies: {'@acme/ui': '1.0.0', 'left-pad': '1.0.0'},
      }),
      'astryx.config.mjs':
        "import fs from 'node:fs';\nfs.writeFileSync(new URL('./ran.txt', import.meta.url), 'ran');\nexport default {};\n",
      'node_modules/@acme/ui/package.json': '{"name":"@acme/ui"}',
      'node_modules/@acme/ui/astryx.integration.mjs': 'export default {};\n',
      'node_modules/left-pad/package.json': '{"name":"left-pad"}',
      'out/index.html': '<p>x</p>',
    });
    expect(builtIntegrationPackages('out', dir)).toEqual(['@acme/ui']);
    expect(fs.existsSync(path.join(dir, 'ran.txt'))).toBe(false);
  });
});

describe('--built limits and speed', () => {
  it('finds an integration hoisted to the workspace root', () => {
    write({
      'package.json': JSON.stringify({name: 'root', workspaces: ['apps/*']}),
      'node_modules/@acme/ui/package.json': '{"name":"@acme/ui"}',
      'node_modules/@acme/ui/astryx.integration.mjs': 'export default {};\n',
      'apps/web/package.json': JSON.stringify({
        name: 'web',
        dependencies: {'@acme/ui': '1.0.0'},
      }),
      'apps/web/out/index.html': '<p>x</p>',
    });
    expect(builtIntegrationPackages('apps/web/out', dir)).toEqual(['@acme/ui']);
  });

  it('says not fully inspected when a source file is over the size limit', () => {
    write({
      'src/Page.tsx':
        "import {Text} from '@astryxdesign/core/Text';\nexport const Page = () => <Text>Hi</Text>;\n",
      'src/Huge.tsx': `export const Huge = () => null;\n${'// x\n'.repeat(1_100_000)}`,
    });
    const {purity} = check('src');
    expect(purity.status).toBe('info');
    expect(purity.message).toContain('Not fully inspected');
    expect(purity.message).toContain('over 5 MB');
  });

  it('places findings in a large JSX file quickly', () => {
    const body = '<div>row</div>\n'.repeat(60_000);
    write({'src/Big.tsx': `export const Big = () => (\n<>\n${body}</>);\n`});
    const started = performance.now();
    const scan = scanBuilt(path.join(dir, 'src'), []);
    expect(scan.findings.length).toBe(60_000);
    expect(scan.findings.at(-1)?.line).toBe(60_002);
    expect(performance.now() - started).toBeLessThan(5_000);
  });
});

describe('--built edge cases', () => {
  it('reads the stylesheet a built page links when given the page alone', () => {
    write({
      'dist/index.html':
        '<!doctype html><html><head><link rel="stylesheet" href="/assets/index.css"><script type="module" src="./assets/index.js"></script></head><body><div id="root"></div></body></html>',
      'dist/assets/index.css': '@layer astryx-base{.x{color:red}}',
      'dist/assets/index.js': 'console.log(1)',
    });
    const {usage} = check('dist/index.html');
    expect(usage.status).toBe('pass');
    expect(usage.message).toContain('Astryx styles in assets/index.css');
  });

  it('inspects a .js page whose JSX starts with a fragment', () => {
    write({
      'src/page.js':
        'export default function Page() {\n  return (\n    <>\n      <div>Hi</div>\n    </>\n  );\n}\n',
    });
    const scan = scanBuilt(path.join(dir, 'src'), []);
    expect(scan.jsxFiles).toBe(1);
    expect(scan.findings).toHaveLength(1);
  });

  it('warns, not fails, when the file limit ends the read before any Astryx', () => {
    // One more file than the read takes, spread over 50 folders. Each folder
    // is made once, and each file is a link to one empty file: a file is
    // one directory entry, not a recursive mkdir and a write each.
    const empty = path.join(dir, 'empty.txt');
    fs.writeFileSync(empty, '');
    for (let folder = 0; folder < 50; folder++) {
      fs.mkdirSync(path.join(dir, 'a', String(folder)), {recursive: true});
    }
    for (let i = 0; i < 20_000; i++) {
      fs.linkSync(empty, path.join(dir, 'a', String(i % 50), `${i}.txt`));
    }
    const {usage} = check('.');
    expect(usage.status).toBe('warn');
    expect(usage.message).toContain('went unread');
  });

  it('finds a root-relative asset from the build root for a page in a subfolder', () => {
    write({
      'dist/about/index.html':
        '<!doctype html><link rel="stylesheet" href="/assets/app.css"><div id="root"></div>',
      'dist/assets/app.css': '@layer astryx-theme{.x{color:red}}',
    });
    expect(check('dist/about/index.html').usage.status).toBe('pass');
  });

  it('warns, not fails, when a page links a file that is not there', () => {
    write({
      'out/index.html': '<link rel="stylesheet" href="./missing.css"><p>x</p>',
    });
    const {usage} = check('out/index.html');
    expect(usage.status).toBe('warn');
    expect(usage.message).toContain('not there');
  });

  it('inspects JSX in a .js file wherever it opens', () => {
    write({
      'src/page.js':
        'export const a = x || <div>A</div>;\nexport const b = [<span key="b">B</span>];\n',
    });
    const scan = scanBuilt(path.join(dir, 'src'), []);
    expect(scan.jsxFiles).toBe(1);
    expect(scan.findings).toHaveLength(2);
  });

  it('fails an empty folder as nothing checked, and warns when the only source is too big to read', () => {
    fs.mkdirSync(path.join(dir, 'empty'));
    expect(check('empty').usage.message).toContain('nothing was checked');
    write({
      'big/Page.tsx': `import {Text} from '@astryxdesign/core/Text';\n${'// x\n'.repeat(1_100_000)}`,
    });
    const {usage} = check('big');
    expect(usage.status).toBe('warn');
    expect(usage.message).toContain('over 5 MB');
  });

  it('fails a page with no Astryx that links only a missing favicon', () => {
    write({
      'out/index.html':
        '<link rel="icon" href="/favicon.ico"><link rel="manifest" href="/site.webmanifest"><p>x</p>',
    });
    expect(check('out/index.html').usage.status).toBe('fail');
  });

  it('survives a .js file with a huge array literal', () => {
    write({
      'src/data.js': `export const rows = [${'0,'.repeat(200_000)}];\nexport const A = () => <p>x</p>;\n`,
    });
    const scan = scanBuilt(path.join(dir, 'src'), []);
    expect(scan.jsxFiles).toBe(1);
  });

  it('counts a .js file the parser cannot read as not inspected', () => {
    write({
      'src/page.js':
        'export default function Page() {\n  return <div>{</div>;\n}\n@@@\n',
    });
    const {purity} = check('src');
    expect(purity.status).toBe('info');
    expect(purity.status).not.toBe('pass');
  });

  it('keeps JSX after a "/*" string, such as a splat route', () => {
    write({
      'src/App.tsx':
        'export const App = () => (\n  <Route path="/*" element={<div>Home</div>} />\n);\n',
    });
    const scan = scanBuilt(path.join(dir, 'src'), []);
    expect(scan.findings.map(f => f.line)).toContain(2);
  });

  it('keeps JSX after a URL or a glob in JSX text', () => {
    write({
      'src/page.js':
        'export const A = () => (\n  <section>\n    <p>See https://example.com and src/*</p>\n    <div>Box</div>\n  </section>\n);\n',
    });
    const scan = scanBuilt(path.join(dir, 'src'), []);
    expect(scan.unread).toBe(0);
    expect(scan.findings.map(f => f.line)).toEqual(
      expect.arrayContaining([3, 4]),
    );
  });

  it('reads a page whose link attributes are unquoted', () => {
    write({
      'dist/index.html':
        '<!doctype html><link rel=stylesheet href=/assets/index.css><div id=root></div>',
      'dist/assets/index.css': '@layer astryx-base{.x{color:red}}',
    });
    expect(check('dist/index.html').usage.status).toBe('pass');
  });

  it('counts a barrel re-export and a CSS @import of an Astryx package', () => {
    write({
      'src/ui.ts': "export {Button, Card} from '@astryxdesign/core';\n",
      'src/index.css': "@import '@astryxdesign/core/styles.css';\n",
    });
    const {usage} = check('src');
    expect(usage.status).toBe('pass');
    expect(usage.message).toContain('@astryxdesign/core');
  });

  it('reads a .tsx with TypeScript and legacy decorators, and counts one nothing parses as unread', () => {
    write({
      'src/Ok.tsx':
        'function track(t: any) { return t; }\n@track\nclass Store { value!: string; }\nexport const A = () => <div>Hi</div>;\n',
      'src/Broken.tsx': 'export const B = () => <div>{</div>;\n@@ enum ;\n',
    });
    const scan = scanBuilt(path.join(dir, 'src'), []);
    expect(scan.findings.filter(f => f.file === 'Ok.tsx')).toHaveLength(1);
    expect(scan.unread).toBe(1);
    expect(check('src').purity.status).not.toBe('pass');
  });

  it('does not count commented-out CSS as Astryx', () => {
    write({
      'dist/index.css':
        "/* @import '@astryxdesign/core/styles.css'; */\n/* --astryx-color: red; */\n.x { color: red; }\n",
    });
    expect(check('dist').usage.status).toBe('fail');
  });

  it('does not count a type-only Astryx import as use', () => {
    write({
      'src/Page.tsx': [
        "import type {ButtonProps} from '@astryxdesign/core/Button';",
        "import {type TextProps} from '@astryxdesign/core/Text';",
        "export type {CardProps} from '@astryxdesign/core/Card';",
        "export {type BadgeProps} from '@astryxdesign/core/Badge';",
        'export const Page = (props: ButtonProps & TextProps) => null;',
        '',
      ].join('\n'),
    });
    expect(check('src').usage.status).toBe('fail');
  });

  it('does not count a type-only import in a file the parser cannot read', () => {
    write({
      'src/Broken.tsx': [
        "import type {ButtonProps} from '@astryxdesign/core/Button';",
        "import {type TextProps} from '@astryxdesign/core/Text';",
        "export type {CardProps} from '@astryxdesign/core/Card';",
        "export {type BadgeProps} from '@astryxdesign/core/Badge';",
        'export const B = () => <div>{</div>;',
        '@@ enum ;',
        '',
      ].join('\n'),
    });
    expect(check('src').usage.status).not.toBe('pass');
  });

  it('does not count an import written only in a string or JSX text', () => {
    write({
      'src/Page.tsx': [
        "const sample = `import {Button} from '@astryxdesign/core/Button';`;",
        'export const Page = () => (',
        "  <pre>import {Text} from '@astryxdesign/core/Text';</pre>",
        ');',
        '',
      ].join('\n'),
    });
    expect(check('src').usage.status).toBe('fail');
  });

  it('ignores a stylesheet link inside an HTML comment', () => {
    write({
      'out/index.html':
        '<!-- <link rel="stylesheet" href="./astryx.css"> --><!-- <link rel="stylesheet" href="./gone.css"> --><p>x</p>',
      'out/astryx.css': '@layer astryx-base{.x{color:red}}',
    });
    expect(check('out/index.html').usage.status).toBe('fail');
  });

  it('names unread source files in purity, with findings and without JSX', () => {
    write({
      'src/Page.tsx': 'export const Page = () => <div>Hi</div>;\n',
      'src/Broken.tsx': 'export const B = () => <div>{</div>;\n@@ enum ;\n',
    });
    const withFindings = check('src').purity;
    expect(withFindings.status).toBe('warn');
    expect(withFindings.message).toContain('not inspected: Broken.tsx');
    fs.rmSync(path.join(dir, 'src', 'Page.tsx'));
    const none = check('src').purity;
    expect(none.status).toBe('info');
    expect(none.message).toContain('Broken.tsx');
  });

  it('survives a file with more findings than a call can spread', () => {
    write({
      'src/Rows.tsx': `export const Rows = () => (\n<>\n${'<p/>\n'.repeat(200_000)}</>);\n`,
    });
    const scan = scanBuilt(path.join(dir, 'src'), []);
    expect(scan.findings.length).toBe(200_000);
  });
});

describe('doctor --built', () => {
  it('composes with --json: one envelope with the two checks last, exit 1 on a failed build', async () => {
    write({'out/index.html': '<div>no astryx</div>'});
    const result = await runCli(['--json', 'doctor', '--built', 'out'], dir);
    const envelope = JSON.parse(result.stdout);
    const ids = envelope.data.checks.map(
      (/** @type {{id: string}} */ c) => c.id,
    );
    expect(ids.slice(-2)).toEqual([
      'built-astryx-usage',
      'built-astryx-purity',
    ]);
    expect(result.status).toBe(1);
  }, 60_000);

  it('adds the two checks after the others, and plain doctor runs without them', async () => {
    write({'out/index.html': '<div>no astryx</div>'});

    const plain = await runChecks({cwd: dir});
    const built = await runChecks({cwd: dir, built: 'out'});

    expect(plain.checks.some(c => c.id.startsWith('built-'))).toBe(false);
    expect(built.checks.map(c => c.id)).toEqual([
      ...plain.checks.map(c => c.id),
      'built-astryx-usage',
      'built-astryx-purity',
    ]);
    expect(built.summary.fail).toBe(plain.summary.fail + 1);
  });
});
