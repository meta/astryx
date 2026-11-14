// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * The published package answers search's catalog from the catalog `prepack`
 * stores (scripts/generate-search-catalog.mjs) for a project that adds
 * nothing to it, byte for byte as a checkout that gathers live; a project
 * that adds to a catalog, and an in-place edit to an installed CLI or Core
 * file, gather live.
 */

import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {pathToFileURL} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {CLI_ROOT} from '../foundation/fs/paths.mjs';
import {copyPublishedCore} from '../scripts/generate-component-list.mjs';
import {
  placeCli,
  recyclePlacedCopies,
} from '../test-utils/global-local-fixtures.mjs';
import {packPublishedCli} from '../test-utils/pack-published-cli.mjs';

const VERSION = JSON.parse(
  fs.readFileSync(path.join(CLI_ROOT, 'package.json'), 'utf8'),
).version;

/** @type {string} */
let work;
/** @type {string} */
let packed;
/** A consumer project with a copy of the Core files Core publishes. */
/** @type {string} */
let project;
/** @type {string} */
let core;

beforeAll(() => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'packed-search-catalog-'));
  // Every file the package publishes, as an install holds them.
  packed = placeCli(path.join(work, 'cli'), VERSION, {coreStep: true}).dir;
  // A placed copy shares its templates folder with every other copy: this
  // file edits one of them, so its copy holds its own.
  const templates = path.join(packed, 'assets', 'templates');
  const shared = fs.realpathSync(templates);
  fs.unlinkSync(templates);
  fs.cpSync(shared, templates, {recursive: true});
  project = path.join(work, 'project');
  core = path.join(project, 'node_modules', '@astryxdesign', 'core');
  fs.mkdirSync(core, {recursive: true});
  fs.writeFileSync(
    path.join(project, 'package.json'),
    JSON.stringify({name: 'consumer', private: true}),
  );
  copyPublishedCore(core);
  // Core's own dependencies, as an install places them.
  fs.symlinkSync(
    path.resolve(CLI_ROOT, '..', 'core', 'node_modules'),
    path.join(core, 'node_modules'),
    'dir',
  );
}, 180_000);

afterAll(() => {
  recyclePlacedCopies();
  if (work) fs.rmSync(work, {recursive: true, force: true});
});

/**
 * Run a CLI in the project.
 * @param {string} cliRoot
 * @param {string[]} args
 * @param {Record<string, string>} [extraEnv]
 */
function run(cliRoot, args, extraEnv = {}) {
  const env = {...process.env, NO_COLOR: '1', COLUMNS: '100', ...extraEnv};
  for (const key of Object.keys(env)) {
    if (key.startsWith('VITEST')) delete env[key];
  }
  const result = spawnSync(
    process.execPath,
    [path.join(cliRoot, 'clients', 'cli', 'bin', 'astryx.mjs'), ...args],
    {cwd: project, encoding: 'utf8', env, maxBuffer: 256 * 1024 * 1024},
  );
  return {status: result.status, stdout: result.stdout, stderr: result.stderr};
}

/** Whether the packed CLI's store answers for the project now. */
function storeAnswers() {
  const at = pathToFileURL(
    path.join(packed, 'foundation/discovery/stored-search-catalog.mjs'),
  ).href;
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `const {storedSearchCatalog} = await import(${JSON.stringify(at)});
process.stdout.write(String(storedSearchCatalog(${JSON.stringify(core)}, process.cwd()) != null));`,
    ],
    {cwd: project, encoding: 'utf8'},
  );
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout === 'true';
}

/** The packed CLI's stored catalog file. */
const storeFile = () =>
  path.join(packed, 'assets', 'search-catalog.generated.json');

/**
 * Run the packed CLI with its stored catalog moved aside: what it gathers
 * live.
 * @param {string[]} args
 */
function runLive(args) {
  const aside = `${storeFile()}.aside`;
  fs.renameSync(storeFile(), aside);
  try {
    return run(packed, args);
  } finally {
    fs.renameSync(aside, storeFile());
  }
}

/**
 * Edit `file` in place, the same size and with its times put back, so only
 * its content changes; run `check`; put the file back. A placed copy's file
 * is a hard link shared with every other copy, so it is unlinked before each
 * write.
 * @param {string} file
 * @param {string} from
 * @param {string} to
 * @param {() => void} check
 */
function withEdit(file, from, to, check) {
  const text = fs.readFileSync(file, 'utf8');
  const edited = text.replace(from, to);
  expect(edited).not.toBe(text);
  expect(edited.length).toBe(text.length);
  const {atime, mtime} = fs.statSync(file);
  /** @param {string} content */
  const write = content => {
    fs.unlinkSync(file);
    fs.writeFileSync(file, content);
    fs.utimesSync(file, atime, mtime);
  };
  write(edited);
  try {
    check();
  } finally {
    write(text);
  }
}

const BUILD_IDEA =
  'an analytics dashboard with revenue charts and a table of recent orders';

const ASKS = [
  ['search', 'button'],
  ['search', 'button', '--json'],
  ['search', 'button', '--detail', 'compact'],
  ['search', 'button', '--dense'],
  ['search', 'date picker', '--json'],
  ['search', 'install', '--json'],
  ['search', 'dashboard', '--type', 'template', '--json'],
  ['search', 'dashboard', '--type', 'doc'],
  ['search', 'neutral', '--type', 'theme', '--json'],
  ['search', 'table', '--type', 'component'],
  ['build', BUILD_IDEA],
  ['build', BUILD_IDEA, '--json'],
  ['build', 'a login page', '--detail', 'compact'],
];

describe('the stored search catalog', () => {
  it('ships in the package', () => {
    expect(fs.existsSync(storeFile())).toBe(true);
  });

  it('answers for a project that adds nothing, byte for byte as a live gather', () => {
    expect(storeAnswers()).toBe(true);
    for (const ask of ASKS) {
      const stored = run(packed, ask);
      expect(stored.status, `${ask.join(' ')}: ${stored.stderr}`).toBe(0);
      expect(stored, ask.join(' ')).toEqual(run(CLI_ROOT, ask));
    }
  }, 300_000);

  it("spells docs' commands for the project's package manager, as a live gather does", () => {
    for (const lockfile of ['pnpm-lock.yaml', 'yarn.lock', 'bun.lock']) {
      const lock = path.join(project, lockfile);
      fs.writeFileSync(lock, '');
      try {
        expect(storeAnswers(), lockfile).toBe(true);
        const ask = ['search', 'install', '--json'];
        expect(run(packed, ask), lockfile).toEqual(run(CLI_ROOT, ask));
      } finally {
        fs.rmSync(lock);
      }
    }
  }, 300_000);

  it('keeps a reference to the store, not a copy, and reads it back byte for byte', () => {
    // Only a copy installed in a node_modules folder keeps gathers.
    const installed = packPublishedCli(fs.mkdtempSync(path.join(work, 'i-')));
    const cache = fs.mkdtempSync(path.join(work, 'cache-'));
    const env = {XDG_CACHE_HOME: cache};
    const ask = ['search', 'button', '--json'];
    const first = run(installed, ask, env);
    expect(first.status, first.stderr).toBe(0);
    const kept = path.join(cache, 'astryx', 'catalogs');
    const entries = fs.readdirSync(kept).filter(n => n.startsWith('gather-'));
    expect(entries).toHaveLength(1);
    const entry = fs.readFileSync(path.join(kept, entries[0]), 'utf8');
    // No candidate is copied into the kept entry.
    expect(entry).not.toContain('"domain":"component"');
    expect(run(installed, ask, env)).toEqual(first);
    expect(first).toEqual(run(CLI_ROOT, ask));
  }, 120_000);

  it('is not used where the project adds to a catalog', () => {
    const config = path.join(project, 'astryx.config.mjs');
    fs.writeFileSync(config, 'export default {};\n');
    try {
      expect(storeAnswers()).toBe(false);
    } finally {
      fs.rmSync(config);
    }
    expect(storeAnswers()).toBe(true);
    // An installed package that declares Astryx docs adds them to a catalog.
    const external = path.join(project, 'node_modules', 'extra-docs');
    fs.mkdirSync(path.join(external, 'docs'), {recursive: true});
    fs.writeFileSync(
      path.join(external, 'package.json'),
      JSON.stringify({name: 'extra-docs', astryx: {docs: './docs'}}),
    );
    try {
      expect(storeAnswers()).toBe(false);
    } finally {
      fs.rmSync(external, {recursive: true, force: true});
    }
    expect(storeAnswers()).toBe(true);
  }, 120_000);

  it('misses after an in-place edit to a shipped doc, template or Core file, and shows the edit', () => {
    const edits = [
      {
        file: path.join(packed, 'assets', 'docs', 'motion.doc.mjs'),
        from: "title: 'Motion'",
        to: "title: 'Notion'",
        ask: ['search', 'notion', '--type', 'doc', '--json'],
        shows: 'Notion',
      },
      {
        file: path.join(
          packed,
          'assets',
          'templates',
          'blocks',
          'components',
          'AppShell',
          'AppShellShowcase.doc.mjs',
        ),
        from: "name: 'AppShell'",
        to: "name: 'AppShelk'",
        ask: ['search', 'appshelk', '--type', 'template', '--json'],
        shows: 'AppShelk',
      },
      {
        file: path.join(core, 'src', 'Button', 'Button.doc.mjs'),
        from: "'Button triggers an action",
        to: "'Button triggerz an action",
        ask: ['search', 'button', '--type', 'component', '--json'],
        shows: 'Button triggerz an action',
      },
    ];
    for (const {file, from, to, ask, shows} of edits) {
      withEdit(file, from, to, () => {
        expect(storeAnswers(), file).toBe(false);
        const answer = run(packed, ask);
        expect(answer.status, answer.stderr).toBe(0);
        expect(answer.stdout, file).toContain(shows);
        expect(answer, file).toEqual(runLive(ask));
      });
      expect(storeAnswers(), file).toBe(true);
    }
  }, 300_000);
});
