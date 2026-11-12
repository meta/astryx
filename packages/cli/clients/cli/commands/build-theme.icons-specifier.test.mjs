// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Regression tests for `astryx theme build --icons-specifier`.
 *
 * The generated module imports the icon registry rather than inlining it,
 * because the registry holds React elements. `extractIconInfo` lifts that
 * specifier out of the TypeScript source, where an extensionless `./icons` is
 * resolved by the TypeScript resolver — but the artifact is ESM JavaScript,
 * which requires a fully specified path, so Node cannot load it. See #4620.
 *
 * Only the caller knows what its own build emits and under what name (the same
 * source compiled by tsup lands at `icons.mjs` in a package with no `"type"`
 * field and at `icons.js` in one with `"type": "module"`), so the specifier is
 * declared rather than inferred. Absent the flag, output is byte-for-byte what
 * it was before, which keeps the default no-`--out` flow — where the neighbour
 * is an uncompiled `icons.tsx` that only a bundler can resolve — working.
 *
 * The spawned-process block at the bottom pins what only real processes can
 * prove: the emitted module actually loads under Node ESM, and the watch
 * loop's child re-invocations carry the flag to every rebuild.
 */

import {describe, it, expect, beforeAll, beforeEach, afterEach} from 'vitest';
import {spawn, spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {ensureCoreBuilt} from './ensure-core-built.mjs';
import {runCli} from '../../../test-utils/run-cli.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_BIN = path.resolve(__dirname, '../bin/astryx.mjs');

/** Poll until `predicate()` is true or the timeout elapses. */
async function waitFor(predicate, {timeout = 20000, interval = 100} = {}) {
  const start = Date.now();
  for (;;) {
    if (predicate()) return true;
    if (Date.now() - start > timeout) return false;
    await new Promise(r => setTimeout(r, interval));
  }
}

/**
 * The emitted icon import, or null. Reads the statement rather than the whole
 * file: the `@generated` header quotes the source filename and a usage example,
 * so a substring search over the file matches comment text too.
 */
function iconImportLine(generated) {
  const match = generated.match(/^import .*$/m);
  return match ? match[0] : null;
}

/** A theme whose registry arrives via a relative import, plus that module. */
function writeThemeWithIcons(dir, name) {
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(
    path.join(dir, 'icons.mjs'),
    'export const testIcons = {};\n',
  );
  const file = path.join(dir, `${name}.mjs`);
  fs.writeFileSync(
    file,
    `import {testIcons} from './icons';\n` +
      `export default {\n` +
      `  name: ${JSON.stringify(name)},\n` +
      `  icons: testIcons,\n` +
      `  tokens: {'--color-bg': '#fff'},\n` +
      `};\n`,
  );
  return file;
}

beforeAll(() => {
  ensureCoreBuilt();
}, 200_000);

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-icons-specifier-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('theme build --icons-specifier', () => {
  it('emits the declared specifier', async () => {
    const project = path.join(tmpDir, 'project');
    const themeFile = writeThemeWithIcons(project, 'declared');

    const result = await runCli(
      [
        'theme',
        'build',
        path.relative(project, themeFile),
        '--icons-specifier',
        './icons.mjs',
      ],
      project,
    );
    expect(result.code).toBe(0);

    const generated = fs.readFileSync(
      path.join(project, 'declared.js'),
      'utf8',
    );
    expect(iconImportLine(generated)).toBe(
      'import { testIcons } from "./icons.mjs";',
    );
  });

  it('accepts a specifier the generator could never have inferred', async () => {
    const project = path.join(tmpDir, 'project');
    const themeFile = writeThemeWithIcons(project, 'custom');

    const result = await runCli(
      [
        'theme',
        'build',
        path.relative(project, themeFile),
        '--icons-specifier',
        '../build/registry/icons.js',
      ],
      project,
    );
    expect(result.code).toBe(0);

    const generated = fs.readFileSync(path.join(project, 'custom.js'), 'utf8');
    expect(iconImportLine(generated)).toBe(
      'import { testIcons } from "../build/registry/icons.js";',
    );
  });

  it('encodes the declared specifier as a valid JavaScript string', async () => {
    const project = path.join(tmpDir, 'project');
    const themeFile = writeThemeWithIcons(project, 'encoded');

    const result = await runCli(
      [
        'theme',
        'build',
        path.relative(project, themeFile),
        '--icons-specifier',
        "./icon's.mjs",
      ],
      project,
    );
    expect(result.code).toBe(0);

    const generated = fs.readFileSync(path.join(project, 'encoded.js'), 'utf8');
    expect(iconImportLine(generated)).toBe(
      'import { testIcons } from "./icon\'s.mjs";',
    );
  });

  it('combines with the current --check flow', async () => {
    const project = path.join(tmpDir, 'project');
    const themeFile = writeThemeWithIcons(project, 'checked');
    const relativeTheme = path.relative(project, themeFile);

    const built = await runCli(
      ['theme', 'build', relativeTheme, '--icons-specifier', './icons.mjs'],
      project,
    );
    expect(built.code).toBe(0);

    const withoutSpecifier = await runCli(
      ['theme', 'build', relativeTheme, '--check'],
      project,
    );
    expect(withoutSpecifier.code).toBe(1);

    const withSpecifier = await runCli(
      [
        'theme',
        'build',
        relativeTheme,
        '--check',
        '--icons-specifier',
        './icons.mjs',
      ],
      project,
    );
    expect(withSpecifier.code).toBe(0);
  });

  it('leaves the scraped specifier untouched when the flag is absent', async () => {
    const project = path.join(tmpDir, 'project');
    const themeFile = writeThemeWithIcons(project, 'untouched');

    const result = await runCli(
      ['theme', 'build', path.relative(project, themeFile)],
      project,
    );
    expect(result.code).toBe(0);

    // The pre-flag behaviour, preserved: no extension is invented. In this
    // layout the neighbour is a source file only a bundler can resolve, so
    // adding one would break a build that works today.
    const generated = fs.readFileSync(
      path.join(project, 'untouched.js'),
      'utf8',
    );
    expect(iconImportLine(generated)).toBe(
      "import { testIcons } from './icons';",
    );
  });

  it('is inert for a theme with no icons field', async () => {
    const project = path.join(tmpDir, 'project');
    fs.mkdirSync(project, {recursive: true});
    const themeFile = path.join(project, 'plain.mjs');
    fs.writeFileSync(
      themeFile,
      `export default {name: 'plain', tokens: {'--color-bg': '#fff'}};\n`,
    );

    const result = await runCli(
      [
        'theme',
        'build',
        path.relative(project, themeFile),
        '--icons-specifier',
        './icons.mjs',
      ],
      project,
    );
    expect(result.code).toBe(0);

    // No icons field means no import to rewrite, so the flag has nothing to act
    // on and must not introduce one.
    const generated = fs.readFileSync(path.join(project, 'plain.js'), 'utf8');
    expect(iconImportLine(generated)).toBeNull();
    expect(generated).not.toContain('icons:');
  });
});

describe('theme build --icons-specifier (spawned processes)', () => {
  it('emits a module Node can actually load', async () => {
    const project = path.join(tmpDir, 'project');
    const themeFile = writeThemeWithIcons(project, 'loadable');

    const result = await runCli(
      [
        'theme',
        'build',
        path.relative(project, themeFile),
        '--icons-specifier',
        './icons.mjs',
      ],
      project,
    );
    expect(result.code).toBe(0);

    // The text assertions above prove the emitted line; only a real Node
    // process proves the module resolves and evaluates. That distinction is
    // the regression #4620 shipped: every byte existed, none of them loaded.
    const builtUrl = pathToFileURL(path.join(project, 'loadable.js'));
    const probe = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `const m = await import(${JSON.stringify(builtUrl.href)});` +
          `if (m.loadableTheme?.name !== 'loadable') throw new Error('bad theme export');` +
          `if (typeof m.testIcons !== 'object') throw new Error('bad registry export');`,
      ],
      {encoding: 'utf8'},
    );
    expect(probe.stderr).toBe('');
    expect(probe.status).toBe(0);
  });

  it('watch mode forwards the flag to every rebuild', async () => {
    const project = path.join(tmpDir, 'project');
    const themeFile = writeThemeWithIcons(project, 'watched');
    const cssFile = path.join(project, 'out', 'theme.css');
    const builtFile = path.join(project, 'out', 'watched.js');
    const declaredImport = 'import { testIcons } from "./icons.mjs";';

    const child = spawn(
      process.execPath,
      [
        CLI_BIN,
        'theme',
        'build',
        path.relative(project, themeFile),
        '--out',
        'out/theme.css',
        '--icons-specifier',
        './icons.mjs',
        '--watch',
      ],
      {cwd: project, env: {...process.env, FORCE_COLOR: '0'}},
    );
    let output = '';
    child.stdout.on('data', d => (output += d.toString()));
    child.stderr.on('data', d => (output += d.toString()));

    try {
      // Initial build: the declared specifier reaches the module.
      expect(await waitFor(() => fs.existsSync(cssFile))).toBe(true);
      expect(await waitFor(() => /Watching/i.test(output))).toBe(true);
      expect(iconImportLine(fs.readFileSync(builtFile, 'utf8'))).toBe(
        declaredImport,
      );

      // Rebuilds run through a child re-invocation of `theme build`, so the
      // flag reaches them only if the watch loop forwards it. Change a token
      // and wait for the rebuilt JavaScript module. fs.watch delivery is
      // best-effort under load, so write again only when the watcher has not
      // reported the change for a second: every write restarts the watcher's
      // 100 ms debounce, so writing on every poll can hold the rebuild off for
      // as long as the writes go on, and each write that lands during a
      // rebuild queues another one. Writes replace the file whole, as an
      // editor's save does, so no build reads a half-written theme.
      const touched =
        `import {testIcons} from './icons';\n` +
        `export default {\n` +
        `  name: "watched",\n` +
        `  icons: testIcons,\n` +
        `  tokens: {'--color-bg': '#0a0b0c'},\n` +
        `};\n`;
      const touch = () => {
        const staged = `${themeFile}.tmp`;
        fs.writeFileSync(staged, touched);
        fs.renameSync(staged, themeFile);
        return {at: Date.now(), outputLength: output.length};
      };
      let lastTouch = touch();
      /** @type {string | null} */
      let rebuiltModule = null;
      const rebuilt = await waitFor(() => {
        try {
          const source = fs.readFileSync(builtFile, 'utf-8');
          if (source.includes('#0a0b0c')) {
            rebuiltModule = source;
            return true;
          }
        } catch {
          // Not readable yet; poll again.
        }
        const reported = /Change detected/.test(
          output.slice(lastTouch.outputLength),
        );
        if (!reported && Date.now() - lastTouch.at > 1000) {
          lastTouch = touch();
        }
        return false;
      });
      expect(rebuilt).toBe(true);

      // The regenerated module still carries the declared specifier — the
      // forwarding is what this test pins. A watch loop that dropped the flag
      // would regenerate with the scraped './icons' here and ship the #4620
      // bytes on every save. The module is the one read that showed the
      // change, not a later read a queued rebuild could be rewriting.
      expect(iconImportLine(rebuiltModule ?? '')).toBe(declaredImport);
    } finally {
      child.kill('SIGINT');
    }
  }, 60_000);
});
