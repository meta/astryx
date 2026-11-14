// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * The published package answers Core's component list and its imports from
 * the list `prepack` stores (scripts/generate-component-list.mjs) while the
 * installed Core is the one it was worked out for, byte for byte as a
 * checkout that works it out live; an edit to an installed Core file misses
 * the store.
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
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'packed-component-list-'));
  packed = placeCli(path.join(work, 'cli'), VERSION).dir;
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

/** Whether the packed CLI's store answers for the project's Core now. */
function storeAnswers() {
  const at = pathToFileURL(
    path.join(packed, 'foundation/discovery/stored-component-list.mjs'),
  ).href;
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `const {storedComponentList} = await import(${JSON.stringify(at)});
process.stdout.write(String(storedComponentList(${JSON.stringify(core)}) != null));`,
    ],
    {encoding: 'utf8'},
  );
  return result.stdout === 'true';
}

const ASKS = [
  ['component', '--list'],
  ['component', '--list', '--json'],
  ['component', '--list', '--detail', 'compact'],
  ['component', '--list', '--detail', 'compact', '--json'],
  ['component', '--list', '--detail', 'full', '--json'],
  ['component', 'Button', '--json'],
  ['component', 'HStack', '--json'],
];

describe('the stored component list', () => {
  it('ships in the package', () => {
    expect(
      fs.existsSync(
        path.join(packed, 'assets', 'component-list.generated.json'),
      ),
    ).toBe(true);
  });

  it('answers for the Core it was worked out for, byte for byte as a live read', () => {
    expect(storeAnswers()).toBe(true);
    for (const ask of ASKS) {
      const stored = run(packed, ask);
      expect(stored.status, `${ask.join(' ')}: ${stored.stderr}`).toBe(0);
      expect(stored, ask.join(' ')).toEqual(run(CLI_ROOT, ask));
    }
  }, 240_000);

  // Only where Node carries Czech collation data.
  it.skipIf(Intl.Collator.supportedLocalesOf(['cs']).length === 0)(
    "prints groups in the running locale's order, as a live read does",
    () => {
      // Czech collates "ch" after "h": the stored list, written in another
      // locale's order, prints in this one's.
      const czech = {LANG: 'cs_CZ.UTF-8', LC_ALL: 'cs_CZ.UTF-8'};
      for (const ask of [
        ['component', '--list', '--json'],
        ['component', '--list', '--detail', 'compact', '--json'],
      ]) {
        expect(run(packed, ask, czech), ask.join(' ')).toEqual(
          run(CLI_ROOT, ask, czech),
        );
      }
    },
    240_000,
  );

  it('misses after an in-place edit to an installed Core file, and shows the edit', () => {
    const doc = path.join(core, 'src', 'Button', 'Button.doc.mjs');
    const text = fs.readFileSync(doc, 'utf8');
    // A same-size edit with its time put back: only the content changes.
    const edited = text.replace("name: 'Button'", "name: 'Buttom'");
    expect(edited).not.toBe(text);
    const {atime, mtime} = fs.statSync(doc);
    fs.writeFileSync(doc, edited);
    fs.utimesSync(doc, atime, mtime);
    try {
      expect(storeAnswers()).toBe(false);
      const ask = ['component', '--list', '--json'];
      expect(run(packed, ask)).toEqual(run(CLI_ROOT, ask));
    } finally {
      fs.writeFileSync(doc, text);
    }
    expect(storeAnswers()).toBe(true);
    // A file whose name a packer would drop elsewhere (a notice, a readme)
    // still counts in Core's folders.
    const notice = path.join(core, 'src', 'Button', 'Notice.tsx');
    fs.writeFileSync(notice, 'export function Notice() { return null; }\n');
    try {
      expect(storeAnswers()).toBe(false);
    } finally {
      fs.rmSync(notice, {force: true});
    }
    expect(storeAnswers()).toBe(true);
    // A new component folder misses it too.
    const added = path.join(core, 'src', 'Gizmo');
    fs.mkdirSync(added);
    fs.writeFileSync(
      path.join(added, 'Gizmo.tsx'),
      'export function Gizmo() { return null; }\n',
    );
    try {
      expect(storeAnswers()).toBe(false);
    } finally {
      fs.rmSync(added, {recursive: true, force: true});
    }
    expect(storeAnswers()).toBe(true);
  }, 240_000);
});
