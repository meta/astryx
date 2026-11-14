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
      const {key} = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (String(key).includes('"component-replacements"')) {
        out.set(name, fs.statSync(file).ino);
      }
    } catch {
      // Not an entry.
    }
  }
  return out;
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
  },
);
