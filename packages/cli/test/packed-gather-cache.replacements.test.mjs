// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A published CLI keeps component replacement (which integration component
 * answers to a Core component's name) between runs, and decides it again
 * whenever anything that decides it changes: a doc's `replaces`, the package's
 * CLI floor, the integration's components folder, whether it is configured
 * or autolinked, and whether its manifest loads. Each kept answer must equal
 * a fresh run's.
 */

import {describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  usePackedCli,
  work,
  run,
  CACHE_NAME,
  keptTmp,
  freshTmp,
  hasModuleHooks,
  readKept,
} from '../test-utils/packed-gather-cache-fixture.mjs';
import {REPO_ROOT} from '../test-utils/repo-root.mjs';
import {COMPONENT_REPLACES_CLI} from '../foundation/integrations/cli-requirement.mjs';

usePackedCli();

const ASK = ['component', 'SideNav'];

/**
 * A project whose configured integration, @acme/nav, replaces Core's SideNav
 * with AcmeSideNav, and has the CLI floor that turns the replacement on.
 * @returns {{dir: string, nav: string}}
 */
function makeNavProject() {
  fs.mkdirSync(path.join(work, 'projects'), {recursive: true});
  const dir = fs.mkdtempSync(path.join(work, 'projects', 'replaces-'));
  fs.mkdirSync(path.join(dir, 'node_modules', '@astryxdesign'), {
    recursive: true,
  });
  fs.symlinkSync(
    path.join(REPO_ROOT, 'packages', 'core'),
    path.join(dir, 'node_modules', '@astryxdesign', 'core'),
    'dir',
  );
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({
      name: 'consumer',
      dependencies: {'@astryxdesign/cli': '*', '@acme/nav': '1.0.0'},
    }),
  );
  fs.writeFileSync(
    path.join(dir, 'astryx.config.mjs'),
    `export default { integrations: ['@acme/nav'] };\n`,
  );
  const nav = path.join(dir, 'node_modules', '@acme', 'nav');
  fs.mkdirSync(path.join(nav, 'components'), {recursive: true});
  writeNavPackage(nav, {floor: true});
  fs.writeFileSync(
    path.join(nav, 'astryx.integration.mjs'),
    "export default {components: './components'};\n",
  );
  writeSideNavDoc(path.join(nav, 'components'), {replaces: 'SideNav'});
  return {dir, nav};
}

/**
 * @param {string} nav
 * @param {{floor: boolean}} options - whether the package declares the CLI
 *   floor that turns its replacements on
 */
function writeNavPackage(nav, {floor}) {
  fs.writeFileSync(
    path.join(nav, 'package.json'),
    JSON.stringify({
      name: '@acme/nav',
      version: '1.0.0',
      exports: {'./components/*': './components/*.tsx'},
      ...(floor
        ? {
            peerDependencies: {
              '@astryxdesign/cli': `>=${COMPONENT_REPLACES_CLI}`,
            },
          }
        : {}),
    }),
  );
}

/**
 * @param {string} folder
 * @param {{replaces?: string}} options
 */
function writeSideNavDoc(folder, {replaces}) {
  fs.writeFileSync(
    path.join(folder, 'AcmeSideNav.doc.mjs'),
    `export default ${JSON.stringify({
      type: 'component',
      name: 'AcmeSideNav',
      displayName: 'AcmeSideNav',
      import: '@acme/nav/components/AcmeSideNav',
      ...(replaces === undefined ? {} : {replaces}),
      keywords: ['acme'],
      usage: {description: 'AcmeSideNav for Acme apps.'},
      props: [],
    })};\n`,
  );
  fs.writeFileSync(
    path.join(folder, 'AcmeSideNav.tsx'),
    'export function AcmeSideNav() { return null; }\n',
  );
}

/**
 * The kept component replacement entries in a temp folder's cache folder.
 * @param {string} tmp
 * @returns {Map<string, number>} name to inode
 */
function replacementEntries(tmp) {
  const dir = path.join(tmp, CACHE_NAME);
  /** @type {Map<string, number>} */
  const out = new Map();
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    try {
      const {key} = readKept(file);
      if (String(key).includes('"component-replacements"')) {
        out.set(name, fs.statSync(file).ino);
      }
    } catch {
      // Not an entry.
    }
  }
  return out;
}

/**
 * Every kept entry in a temp folder's cache folder, by file name: its inode,
 * key, version, the entries it builds on and the states it stores itself.
 * @param {string} tmp
 * @returns {Map<string, {ino: number, key: string, version: string, deps: [string, string][], stamps: [string, string][]}>}
 */
function keptEntries(tmp) {
  const dir = path.join(tmp, CACHE_NAME);
  /** @type {Map<string, {ino: number, key: string, version: string, deps: [string, string][], stamps: [string, string][]}>} */
  const out = new Map();
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    try {
      const {key, version, deps, stamps} = readKept(file);
      if (typeof key !== 'string' || !Array.isArray(deps)) continue;
      out.set(name, {ino: fs.statSync(file).ino, key, version, deps, stamps});
    } catch {
      // Not a kept gather.
    }
  }
  return out;
}

/**
 * Each kept entry's inode, by file name: an entry gathered again is a new
 * file.
 * @param {ReturnType<typeof keptEntries>} entries
 */
const inodes = entries =>
  new Map([...entries].map(([name, entry]) => [name, entry.ino]));

/**
 * The deepest link on the way to `file`, or none: the lowest of its folders
 * that is a symbolic link.
 * @param {string} file
 * @returns {string | undefined}
 */
function linkOnTheWay(file) {
  for (
    let at = path.dirname(file);
    at !== path.dirname(at);
    at = path.dirname(at)
  ) {
    if (fs.lstatSync(at, {throwIfNoEntry: false})?.isSymbolicLink()) return at;
  }
  return undefined;
}

/**
 * Every path an entry holds by the folder it is found in (`in:`) through a
 * link is under a folder the same entry, or an entry it builds on, holds by
 * a listing or a stat, at or below that link: the entry checks a folder it
 * reached through the link by that folder's own state, as main's record
 * does, besides the folder identity in the `in:` state.
 * @param {ReturnType<typeof keptEntries>} entries
 */
function expectFoundThroughLinksCovered(entries) {
  for (const [name, entry] of entries) {
    /** @type {Map<string, string>} */
    const held = new Map(entry.stamps);
    for (const [base] of entry.deps) {
      for (const [at, state] of entries.get(base)?.stamps ?? []) {
        if (!held.has(at)) held.set(at, state);
      }
    }
    for (const [file, state] of held) {
      if (!state.startsWith('in:')) continue;
      const link = linkOnTheWay(file);
      if (!link) continue;
      const covered = [...held].some(
        ([at, folderState]) =>
          (at === link || at.startsWith(link + path.sep)) &&
          file.startsWith(at + path.sep) &&
          (folderState.startsWith('dir:') || /^\d/u.test(folderState)) &&
          fs.statSync(at, {throwIfNoEntry: false})?.isDirectory(),
      );
      expect(covered, `${name}: ${file} is found through ${link}`).toBe(true);
    }
  }
}

describe.skipIf(process.platform !== 'linux')(
  'kept component replacement',
  () => {
    it.skipIf(!hasModuleHooks)(
      'is kept, and answers as a fresh run while nothing changed',
      () => {
        const {dir} = makeNavProject();
        try {
          const tmp = keptTmp('replaces-warm');
          for (const json of [true, false]) {
            // The text run's stderr carries notices that print once a day, so
            // text runs compare their answer and exit code.
            /** @param {{status: number | null, stdout: string, stderr: string}} r */
            const answer = r =>
              json ? r : {status: r.status, stdout: r.stdout};
            const fresh = answer(run(ASK, {tmp: freshTmp(), cwd: dir, json}));
            expect(fresh.stdout).toContain('AcmeSideNav');
            expect(answer(run(ASK, {tmp, cwd: dir, json}))).toEqual(fresh);
            const kept = replacementEntries(tmp);
            expect(kept.size).toBe(1);
            expect(answer(run(ASK, {tmp, cwd: dir, json}))).toEqual(fresh);
            // The second run read the entry back: it did not write it again.
            expect(replacementEntries(tmp)).toEqual(kept);
          }
        } finally {
          fs.rmSync(dir, {recursive: true, force: true});
        }
      },
      120_000,
    );

    it.skipIf(!hasModuleHooks)(
      'is decided again after each change that decides it',
      () => {
        const {dir, nav} = makeNavProject();
        try {
          const tmp = keptTmp('replaces-changes');
          /** The kept answer, which must equal a new machine's answer. */
          const answer = () => {
            const kept = run(ASK, {tmp, cwd: dir});
            expect(kept).toEqual(run(ASK, {tmp: freshTmp(), cwd: dir}));
            return kept.stdout;
          };
          const replaced = answer();
          expect(replaced).toContain('AcmeSideNav');
          expect(answer()).toBe(replaced);

          // The doc no longer sets `replaces`: SideNav is Core's again.
          writeSideNavDoc(path.join(nav, 'components'), {});
          const core = answer();
          expect(core).not.toBe(replaced);
          writeSideNavDoc(path.join(nav, 'components'), {replaces: 'SideNav'});
          expect(answer()).toBe(replaced);

          // The package loses the CLI floor: the replacement stays off.
          writeNavPackage(nav, {floor: false});
          expect(answer()).not.toBe(replaced);
          writeNavPackage(nav, {floor: true});
          expect(answer()).toBe(replaced);

          // The manifest names another components folder, which holds no
          // replacement.
          fs.mkdirSync(path.join(nav, 'parts'), {recursive: true});
          fs.writeFileSync(
            path.join(nav, 'astryx.integration.mjs'),
            "export default {components: './parts'};\n",
          );
          expect(answer()).not.toBe(replaced);
          fs.writeFileSync(
            path.join(nav, 'astryx.integration.mjs'),
            "export default {components: './components'};\n",
          );
          expect(answer()).toBe(replaced);

          // The integration is autolinked from package.json, not configured.
          fs.writeFileSync(
            path.join(dir, 'astryx.config.mjs'),
            'export default { integrations: [] };\n',
          );
          answer();
          fs.writeFileSync(
            path.join(dir, 'astryx.config.mjs'),
            `export default { integrations: ['@acme/nav'] };\n`,
          );
          expect(answer()).toBe(replaced);

          // The manifest no longer loads.
          fs.writeFileSync(
            path.join(nav, 'astryx.integration.mjs'),
            'export default {components: \n',
          );
          expect(answer()).not.toBe(replaced);
        } finally {
          fs.rmSync(dir, {recursive: true, force: true});
        }
      },
      240_000,
    );

    it.skipIf(!hasModuleHooks)(
      'stores in an entry only the states the entries it builds on do not hold, and gathers it again when one of those changes or is gone',
      () => {
        const {dir, nav} = makeNavProject();
        try {
          const tmp = keptTmp('replaces-base');
          // component, then search, whose catalog builds on what component
          // kept.
          const same = () => {
            for (const ask of [ASK, ['search', 'sidenav']]) {
              expect(run(ask, {tmp, cwd: dir})).toEqual(
                run(ask, {tmp: freshTmp(), cwd: dir}),
              );
            }
          };
          same();
          const first = keptEntries(tmp);
          expectFoundThroughLinksCovered(first);
          const based = [...first].filter(([, entry]) => entry.deps.length > 0);
          expect(based.length).toBeGreaterThan(0);
          // Each names an entry it builds on at the version that entry holds,
          // and stores none of the states that entry stores: it stores a path
          // that entry holds only when that entry holds just that the path is
          // there, and it read more of it.
          for (const [, entry] of based) {
            const own = new Map(entry.stamps);
            for (const [name, version] of entry.deps) {
              const base = first.get(name);
              expect(base?.version).toBe(version);
              for (const [file, state] of base?.stamps ?? []) {
                if (own.has(file)) {
                  expect(
                    state === 'present' || /^(?:real|in):/u.test(state),
                  ).toBe(true);
                  expect(own.get(file)).not.toBe(state);
                }
              }
            }
          }
          const bases = new Set(
            based.flatMap(([, entry]) => entry.deps.map(([name]) => name)),
          );
          /** @param {ReturnType<typeof keptEntries>} entries */
          const gatheredAgain = entries =>
            [...first.keys()].filter(
              name => entries.get(name)?.ino !== first.get(name)?.ino,
            );
          // Read back, every one of them, while nothing changed.
          same();
          expect(inodes(keptEntries(tmp))).toEqual(inodes(first));

          // An edit to a file an entry it builds on read: that entry and every
          // entry built on it are gathered again.
          writeSideNavDoc(path.join(nav, 'components'), {});
          same();
          const edited = keptEntries(tmp);
          const again = gatheredAgain(edited);
          for (const name of bases) expect(again).toContain(name);
          for (const [name] of based) expect(again).toContain(name);

          // An entry they build on is gone: the next run gathers it and the
          // entries built on it again, and the run after reads all back.
          const [gone] = bases;
          fs.rmSync(path.join(tmp, CACHE_NAME, gone));
          same();
          const regathered = keptEntries(tmp);
          expect(regathered.has(gone)).toBe(true);
          for (const [name, entry] of regathered) {
            if (entry.deps.some(([dep]) => dep === gone)) {
              expect(entry.ino).not.toBe(edited.get(name)?.ino);
            }
          }
          same();
          expect(inodes(keptEntries(tmp))).toEqual(inodes(regathered));
        } finally {
          fs.rmSync(dir, {recursive: true, force: true});
        }
      },
      240_000,
    );

    it.skipIf(!hasModuleHooks)(
      'gathers again only the entry whose own states changed, not the entries it builds on',
      () => {
        const {dir} = makeNavProject();
        try {
          const tmp = keptTmp('replaces-own');
          const search = ['search', 'sidenav'];
          const same = (/** @type {string[]} */ ask) =>
            expect(run(ask, {tmp, cwd: dir})).toEqual(
              run(ask, {tmp: freshTmp(), cwd: dir}),
            );
          same(ASK);
          same(search);
          const before = keptEntries(tmp);
          // search's catalog looks for the project's own themes in src/themes;
          // the integration's checks never do.
          const themes = path.join(dir, 'src', 'themes');
          const [catalog] = [...before].filter(([, entry]) =>
            entry.stamps.some(([file]) => file === themes),
          );
          expect(catalog).toBeDefined();
          const [catalogName, catalogEntry] = catalog;
          expect(catalogEntry.deps.length).toBeGreaterThan(0);
          fs.mkdirSync(themes, {recursive: true});
          same(search);
          const after = keptEntries(tmp);
          expect(after.get(catalogName)?.ino).not.toBe(catalogEntry.ino);
          for (const [name] of catalogEntry.deps) {
            expect(after.get(name)?.ino).toBe(before.get(name)?.ino);
          }
        } finally {
          fs.rmSync(dir, {recursive: true, force: true});
        }
      },
      240_000,
    );
  },
);
