// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * An integration package's check of itself keeps npm's list of the files it
 * packs (foundation/integrations/pack-state.mjs `npmPackedPaths`, through
 * kept-tree.mjs): the list is read back while no folder npm walks has
 * changed, nor package.json, an ignore file or an npmrc file, and asked of
 * npm again after any change that can change it. Each answer must equal a
 * fresh check's, and the kept list must equal what npm lists.
 */

import {describe, expect, it} from 'vitest';
import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  usePackedCli,
  work,
  run,
  CACHE_NAME,
  keptTmp,
  freshTmp,
} from '../test-utils/packed-gather-cache-fixture.mjs';

usePackedCli();

/** Each package this file makes, numbered. */
let made = 0;

/**
 * A package with templates, a `files` field and a template that loads an
 * image beside it, so the check asks npm what the package packs.
 * @param {Record<string, unknown>} [pkgFields]
 * @param {string} [dir]
 * @returns {string} the package folder
 */
function makePackage(
  pkgFields = {},
  dir = path.join(work, `npm-packed-${made++}`),
) {
  /** @type {Record<string, string>} */
  const files = {
    'package.json': JSON.stringify({
      name: '@acme/kit',
      version: '1.0.0',
      main: 'index.js',
      files: ['index.js', 'templates', 'astryx.integration.mjs', 'README.md'],
      ...pkgFields,
    }),
    'README.md': '# Kit\n',
    'index.js': "export {default} from './templates/card.tsx';\n",
    'astryx.integration.mjs': "export default {templates: './templates'};\n",
    'templates/img/hero.png': 'png',
    'templates/card.doc.mjs':
      "export default {type: 'block', name: 'card', displayName: 'Card', description: 'A block.'};\n",
    'templates/card.tsx': [
      "const hero = new URL('./img/hero.png', import.meta.url);",
      'export default () => null;',
      '',
    ].join('\n'),
  };
  for (const [rel, text] of Object.entries(files)) {
    const file = path.join(dir, rel);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, text);
  }
  return dir;
}

/** Settings npm reads for every run of this file, in a file the rows edit. */
const userNpmrc = () => path.join(work, 'npm-packed-userconfig');

/**
 * `integration check --json` in `dir`.
 * @param {string} tmp
 * @param {string} dir
 * @param {Record<string, string>} [env]
 */
function check(tmp, dir, env = {}) {
  const result = run(['integration', 'check'], {
    tmp,
    cwd: dir,
    env: {npm_config_userconfig: userNpmrc(), ...env},
  });
  return {status: result.status, stdout: result.stdout};
}

/**
 * The kept list in `tmp`'s cache folder, with its entry's inode, or null.
 * @param {string} tmp
 * @returns {{paths: string[], ino: number} | null}
 */
function keptList(tmp) {
  const dir = path.join(tmp, CACHE_NAME);
  if (!fs.existsSync(dir)) return null;
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    try {
      const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (
        stored?.summary === true &&
        String(stored.key).includes('npm-packed-paths')
      ) {
        return {paths: stored.value.paths, ino: fs.statSync(file).ino};
      }
    } catch {
      // Not a summary.
    }
  }
  return null;
}

/**
 * What npm itself lists for `dir`, sorted.
 * @param {string} dir
 * @returns {string[]}
 */
function npmList(dir) {
  const result = spawnSync(
    'npm',
    ['pack', '--dry-run', '--json', '--ignore-scripts', '--silent'],
    {
      cwd: dir,
      encoding: 'utf8',
      env: {...process.env, npm_config_userconfig: userNpmrc()},
    },
  );
  const [info] = JSON.parse(result.stdout);
  return info.files.map((/** @type {{path: string}} */ f) => f.path).sort();
}

/**
 * Wait until a change made at `since` is older than the store's settle time
 * (gather-cache.mjs SUMMARY_SETTLE_MS), so the next run stores what it asks.
 * @param {number} since
 */
const settleSince = since => {
  const until = since + 2100;
  while (Date.now() < until) {
    // Waits out SUMMARY_SETTLE_MS.
  }
};

describe("npm's list, kept for a package's check of itself", () => {
  it('is read back after an edit inside a file, in place or by rename, and asked again after each change that can change it', () => {
    fs.writeFileSync(userNpmrc(), '');
    const dir = makePackage();
    const tmp = keptTmp('npm-packed');
    /** The last answer the kept check gave. */
    let answer = {status: /** @type {number | null} */ (null), stdout: ''};
    /** When the files last changed: the kept check waits until then settles. */
    let changedAt = Date.now();
    /** Answers as a fresh check does, and keeps what npm lists. */
    const same = () => {
      // The fresh check and npm's own list do not use the kept folder, so they
      // run while the change settles. The kept check runs once it has.
      const fresh = check(freshTmp(), dir);
      const listed = npmList(dir);
      settleSince(changedAt);
      answer = check(tmp, dir);
      expect(answer).toEqual(fresh);
      expect(answer.status).not.toBeNull();
      const list = keptList(tmp);
      expect(list?.paths.slice().sort()).toEqual(listed);
      return /** @type {{paths: string[], ino: number}} */ (list).ino;
    };
    /** Answers as last time, from the kept list: the entry is not written. */
    const readBack = (/** @type {number} */ ino) => {
      expect(check(tmp, dir)).toEqual(answer);
      expect(keptList(tmp)?.ino).toBe(ino);
    };
    const first = same();
    readBack(first);
    // An edit inside a file, in place, keeps the list.
    fs.appendFileSync(path.join(dir, 'templates', 'card.tsx'), '// edited\n');
    changedAt = Date.now();
    expect(same()).toBe(first);
    // So does a save that renames a new copy over the file, as many editors
    // save.
    const card = path.join(dir, 'templates', 'card.tsx');
    fs.writeFileSync(
      `${card}.tmp`,
      `${fs.readFileSync(card, 'utf8')}// saved\n`,
    );
    fs.renameSync(`${card}.tmp`, card);
    changedAt = Date.now();
    expect(same()).toBe(first);

    /** @type {Array<[string, () => void]>} */
    const changes = [
      [
        'a new file',
        () =>
          fs.writeFileSync(
            path.join(dir, 'templates', 'img', 'extra.png'),
            'x',
          ),
      ],
      [
        'a file removed',
        () => fs.rmSync(path.join(dir, 'templates', 'img', 'extra.png')),
      ],
      [
        'a file renamed',
        () =>
          fs.renameSync(
            path.join(dir, 'templates', 'card.doc.mjs'),
            path.join(dir, 'templates', 'card.doc.js'),
          ),
      ],
      [
        'a case-only rename of a file npm always packs',
        () =>
          fs.renameSync(
            path.join(dir, 'README.md'),
            path.join(dir, 'Readme.md'),
          ),
      ],
      [
        "package.json's files",
        () => {
          const file = path.join(dir, 'package.json');
          const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
          pkg.files = ['index.js', 'astryx.integration.mjs'];
          fs.writeFileSync(file, JSON.stringify(pkg));
        },
      ],
      [
        "package.json's main, bin and browser",
        () => {
          const file = path.join(dir, 'package.json');
          const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
          Object.assign(pkg, {
            files: ['index.js', 'templates', 'astryx.integration.mjs'],
            main: 'templates/card.tsx',
            bin: {kit: 'index.js'},
            browser: 'index.js',
          });
          fs.writeFileSync(file, JSON.stringify(pkg));
        },
      ],
      [
        'a new ignore file in a subfolder',
        () =>
          fs.writeFileSync(
            path.join(dir, 'templates', 'img', '.npmignore'),
            'hero.png\n',
          ),
      ],
      [
        'an edit to that ignore file',
        () =>
          fs.writeFileSync(
            path.join(dir, 'templates', 'img', '.npmignore'),
            'nothing.png\n',
          ),
      ],
      [
        'a new .gitignore in another subfolder',
        () =>
          fs.writeFileSync(
            path.join(dir, 'templates', '.gitignore'),
            'card.doc.js\n',
          ),
      ],
      [
        'a file that becomes a folder',
        () => {
          fs.rmSync(path.join(dir, 'templates', 'img', 'hero.png'));
          fs.mkdirSync(path.join(dir, 'templates', 'img', 'hero.png'));
          fs.writeFileSync(
            path.join(dir, 'templates', 'img', 'hero.png', 'inside.txt'),
            'x',
          );
        },
      ],
      [
        'a file in a node_modules below the root',
        () => {
          const inner = path.join(dir, 'templates', 'node_modules', 'inner');
          fs.mkdirSync(inner, {recursive: true});
          fs.writeFileSync(path.join(inner, 'a.js'), 'x');
        },
      ],
      [
        'another file in that node_modules',
        () =>
          fs.writeFileSync(
            path.join(dir, 'templates', 'node_modules', 'inner', 'b.js'),
            'x',
          ),
      ],
      [
        "the package's .npmrc",
        () => fs.writeFileSync(path.join(dir, '.npmrc'), 'fund=false\n'),
      ],
      ['the user npmrc', () => fs.writeFileSync(userNpmrc(), 'audit=false\n')],
    ];
    let previous = first;
    for (const [what, change] of changes) {
      change();
      changedAt = Date.now();
      const ino = same();
      expect({what, rewritten: ino !== previous}).toEqual({
        what,
        rewritten: true,
      });
      previous = ino;
      readBack(ino);
    }
  }, 300_000);

  it('is asked again when an ignore file above a workspace member changes', () => {
    fs.writeFileSync(userNpmrc(), '');
    const root = path.join(work, `npm-packed-workspace-${made++}`);
    fs.mkdirSync(path.join(root, 'packages'), {recursive: true});
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({name: 'acme', private: true, workspaces: ['packages/*']}),
    );
    // No files field, so npm applies the ignore files above the package; an
    // ignore file of its own makes the check ask npm.
    const dir = makePackage(
      {files: undefined},
      path.join(root, 'packages', 'kit'),
    );
    fs.writeFileSync(path.join(dir, '.npmignore'), '*.log\n');
    const tmp = keptTmp('npm-packed-workspace');
    let changedAt = Date.now();
    // The fresh check and npm's own list run while the change settles.
    const same = () => {
      const fresh = check(freshTmp(), dir);
      const listed = npmList(dir);
      settleSince(changedAt);
      expect(check(tmp, dir)).toEqual(fresh);
      const list = keptList(tmp);
      expect(list?.paths.slice().sort()).toEqual(listed);
      return list?.ino;
    };
    const first = same();
    expect(npmList(dir)).toContain('templates/img/hero.png');
    // The workspace root's ignore file.
    fs.writeFileSync(path.join(root, '.gitignore'), '*.png\n');
    changedAt = Date.now();
    const second = same();
    expect(second).not.toBe(first);
    // An ignore file in a folder between the root and the package.
    fs.writeFileSync(path.join(root, 'packages', '.npmignore'), '*.tsx\n');
    changedAt = Date.now();
    expect(same()).not.toBe(second);
  }, 180_000);

  it("is kept by doctor's validate only where the folder exists, which integration check makes", () => {
    fs.writeFileSync(userNpmrc(), '');
    const dir = makePackage();
    /** @param {string} tmp */
    const validate = tmp => {
      const result = run(['doctor', 'integration', 'validate'], {
        tmp,
        cwd: dir,
        env: {npm_config_userconfig: userNpmrc()},
      });
      return {status: result.status, stdout: result.stdout};
    };
    // Settled first, so doctor's runs would store what they ask if they made
    // the folder.
    settleSince(Date.now());
    // A home no run has used: doctor makes no folder, and answers as a fresh
    // run does.
    const home = freshTmp();
    const answer = validate(home);
    expect(answer.status).not.toBeNull();
    expect(fs.existsSync(path.join(home, CACHE_NAME))).toBe(false);
    expect(answer).toEqual(validate(freshTmp()));
    // integration check makes the folder and keeps the list there.
    check(home, dir);
    const kept = keptList(home);
    expect(kept?.paths.slice().sort()).toEqual(npmList(dir));
    // With the folder there, doctor reads the list back.
    expect(validate(home)).toEqual(answer);
    expect(keptList(home)?.ino).toBe(kept?.ino);
  }, 180_000);

  it('is not kept for a tree with a link in it, nor for a package that bundles dependencies', () => {
    fs.writeFileSync(userNpmrc(), '');
    const linked = makePackage();
    fs.symlinkSync(
      path.join(linked, 'README.md'),
      path.join(linked, 'templates', 'readme-link.md'),
    );
    const bundling = makePackage({bundleDependencies: ['left-pad']});
    fs.mkdirSync(path.join(bundling, 'node_modules', 'left-pad'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(bundling, 'node_modules', 'left-pad', 'package.json'),
      JSON.stringify({name: 'left-pad', version: '1.0.0'}),
    );
    const madeAt = Date.now();
    for (const dir of [linked, bundling]) {
      const tmp = keptTmp(`npm-packed-not-kept-${path.basename(dir)}`);
      // The fresh answer is asked while the new files settle.
      const fresh = check(freshTmp(), dir);
      settleSince(madeAt);
      expect(check(tmp, dir)).toEqual(fresh);
      expect(check(tmp, dir)).toEqual(check(freshTmp(), dir));
      expect(keptList(tmp)).toBeNull();
    }
  }, 180_000);

  it("keeps npm's answer with scripts off: a prepack script's output is never listed", () => {
    fs.writeFileSync(userNpmrc(), '');
    const dir = makePackage({
      scripts: {
        prepack:
          "node -e \"require('fs').writeFileSync('templates/built.txt', require('fs').readFileSync('templates/card.tsx', 'utf8'))\"",
      },
    });
    const tmp = keptTmp('npm-packed-prepack');
    const madeAt = Date.now();
    // The fresh check and npm's own list run while the new files settle.
    const fresh = check(freshTmp(), dir);
    const listed = npmList(dir);
    settleSince(madeAt);
    const kept = check(tmp, dir);
    expect(kept).toEqual(fresh);
    const list = keptList(tmp);
    expect(list?.paths.slice().sort()).toEqual(listed);
    expect(list?.paths).not.toContain('templates/built.txt');
    expect(fs.existsSync(path.join(dir, 'templates', 'built.txt'))).toBe(false);
  }, 120_000);

  it('keeps nothing when npm cannot answer', () => {
    fs.writeFileSync(userNpmrc(), '');
    const dir = makePackage();
    const tmp = keptTmp('npm-packed-error');
    const madeAt = Date.now();
    // npm refuses a workspace the package does not have.
    const refused = {npm_config_workspace: 'nonexistent'};
    // The fresh answer is asked while the new files settle.
    const fresh = check(freshTmp(), dir, refused);
    settleSince(madeAt);
    expect(check(tmp, dir, refused)).toEqual(fresh);
    expect(keptList(tmp)).toBeNull();
    // The same package keeps its list once npm answers.
    check(tmp, dir);
    expect(keptList(tmp)).not.toBeNull();
  }, 120_000);
});
