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
 * key, version, the entries it builds on, the states it stores itself and
 * its value as text.
 * @param {string} tmp
 * @returns {Map<string, KeptEntry>}
 */
function keptEntries(tmp) {
  const dir = path.join(tmp, CACHE_NAME);
  /** @type {Map<string, KeptEntry>} */
  const out = new Map();
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    try {
      const {key, version, deps, stamps, value} = readKept(file);
      if (typeof key !== 'string' || !Array.isArray(deps)) continue;
      out.set(name, {
        ino: fs.statSync(file).ino,
        key,
        version,
        deps,
        stamps,
        text: JSON.stringify(value ?? null),
      });
    } catch {
      // Not a kept gather.
    }
  }
  return out;
}

/**
 * @typedef {{ino: number, key: string, version: string, deps: [string, string][], stamps: [string, string][], text: string}} KeptEntry
 */

/**
 * Every state an entry holds: its own, and those of the entries it builds
 * on.
 * @param {Map<string, Pick<KeptEntry, 'deps' | 'stamps'>>} entries
 * @param {Pick<KeptEntry, 'deps' | 'stamps'>} entry
 * @returns {Map<string, string>}
 */
function heldStates(entries, entry) {
  const held = new Map(entry.stamps);
  for (const [base] of entry.deps) {
    for (const [at, state] of entries.get(base)?.stamps ?? []) {
      if (!held.has(at)) held.set(at, state);
    }
  }
  return held;
}

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
 * The entries whose value holds the real path of a file they read through a
 * link (held by its full stamp), with no state of a folder at or below that
 * link: a link moved to another version folder that holds the same file
 * through a hard link keeps the file's stamp, and the value would name the
 * old folder. Each as [entry, file, link].
 * @param {Map<string, Pick<KeptEntry, 'deps' | 'stamps' | 'text'>>} entries
 * @returns {[string, string, string][]}
 */
function realPathsUncovered(entries) {
  /** @type {[string, string, string][]} */
  const out = [];
  for (const [name, entry] of entries) {
    const held = heldStates(entries, entry);
    for (const [file, state] of held) {
      if (!/^\d/u.test(state)) continue;
      const link = linkOnTheWay(file);
      if (!link) continue;
      /** @type {string} */
      let real;
      try {
        real = fs.realpathSync(file);
      } catch {
        continue;
      }
      if (
        real === file ||
        !entry.text.includes(JSON.stringify(real).slice(1, -1))
      ) {
        continue;
      }
      const covered = [...held].some(
        ([at, folderState]) =>
          (at === link || at.startsWith(link + path.sep)) &&
          file.startsWith(at + path.sep) &&
          (folderState.startsWith('real:') ||
            folderState.startsWith('dir:') ||
            /^\d/u.test(folderState)) &&
          fs.statSync(at, {throwIfNoEntry: false})?.isDirectory(),
      );
      if (!covered) out.push([name, file, link]);
    }
  }
  return out;
}

/**
 * The states that hold a real-path lookup's answer (`real:`) other than the
 * one the lookup gives now, while nothing changed: each as [entry, path].
 * @param {Map<string, Pick<KeptEntry, 'stamps'>>} entries
 * @returns {[string, string][]}
 */
function answersNotExact(entries) {
  /** @type {[string, string][]} */
  const out = [];
  for (const [name, entry] of entries) {
    for (const [at, state] of entry.stamps) {
      if (!state.startsWith('real:')) continue;
      /** @type {string} */
      let real = '';
      try {
        real = fs.realpathSync(at);
      } catch {
        // absent: never recorded as `real:`
      }
      if (state !== `real:${real}`) out.push([name, at]);
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

describe.skipIf(process.platform !== 'linux')(
  'kept component replacement',
  () => {
    it('finds a value that names the real path of a file read through a link, unless a folder state below the link covers it', () => {
      const dir = fs.mkdtempSync(path.join(work, 'real-paths-'));
      try {
        const version = path.join(dir, 'store', 'pkg@1.0.0');
        fs.mkdirSync(version, {recursive: true});
        fs.writeFileSync(path.join(version, 'index.js'), 'export {};\n');
        const link = path.join(dir, 'node_modules', 'pkg');
        fs.mkdirSync(path.dirname(link), {recursive: true});
        fs.symlinkSync(version, link, 'dir');
        const file = path.join(link, 'index.js');
        const real = fs.realpathSync(file);
        const read = /** @type {[string, string]} */ ([file, '9:1:1:1']);
        const named = {
          deps: [],
          stamps: [read],
          text: JSON.stringify({source: real}),
        };
        expect(realPathsUncovered(new Map([['planted', named]]))).toEqual([
          ['planted', file, link],
        ]);
        const covered = {
          ...named,
          stamps: [read, /** @type {[string, string]} */ ([link, '4:1:1:2'])],
        };
        expect(realPathsUncovered(new Map([['planted', covered]]))).toEqual([]);
        const unnamed = {...named, text: JSON.stringify({source: 'pkg'})};
        expect(realPathsUncovered(new Map([['planted', unnamed]]))).toEqual([]);
      } finally {
        fs.rmSync(dir, {recursive: true, force: true});
      }
    });

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
          expect(answersNotExact(first)).toEqual([]);
          expect(realPathsUncovered(first)).toEqual([]);
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
                  expect(state === 'present' || state.startsWith('real:')).toBe(
                    true,
                  );
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
