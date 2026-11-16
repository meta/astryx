// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A published CLI keeps the catalog `search` and `build` gather between runs
 * (foundation/fs/gather-cache.mjs). An entry kept inside another (an
 * integration's themes, templates, components or docs listed inside search) is
 * not used after a contribution is added to a folder it listed, or after a
 * template is added or renamed. Each case's answer from a kept catalog must
 * equal a fresh gather's. packed-gather-cache.changes.test.mjs covers edits,
 * other projects and environments, and the variables a gather reads.
 */

import {describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  usePackedCli,
  makeProject,
  run,
  keptTmp,
  expectWarmHit,
  freshTmp,
  entries,
  templatesEntries,
  hasModuleHooks,
} from '../test-utils/packed-gather-cache-fixture.mjs';

usePackedCli();

describe.skipIf(process.platform !== 'linux')('a kept catalog', () => {
  describe('a contribution added to a folder a nested kept entry listed', () => {
    /** What to add to each root so the integration's checks report it. */
    const broken = {
      themes: (/** @type {string} */ root) => {
        fs.mkdirSync(path.join(root, 'broken'), {recursive: true});
        fs.writeFileSync(
          path.join(root, 'broken', 'brokenTheme.doc.mjs'),
          "export default {type: 'theme', name: 'broken', displayName: 'Broken', description: 'Broken.', maintained: true};\n",
        );
        fs.writeFileSync(
          path.join(root, 'broken', 'brokenTheme.ts'),
          "export const brokenTheme = {name: 'broken', tokens: {}};\n",
        );
      },
      templates: (/** @type {string} */ root) =>
        fs.writeFileSync(
          path.join(root, 'broken.doc.mjs'),
          "export default {type: 'page'};\n",
        ),
      components: (/** @type {string} */ root) =>
        fs.writeFileSync(
          path.join(root, 'Broken.doc.mjs'),
          "export default {type: 'component'};\n",
        ),
      docs: (/** @type {string} */ root) =>
        fs.writeFileSync(
          path.join(root, 'broken.doc.mjs'),
          "export const docs = {type: 'generic'};\n",
        ),
    };
    const commands = [
      ['component', 'Button'],
      ['template', '--list'],
      ['theme', 'list'],
      ['search', 'running', 'totals'],
    ];
    for (const [root, add] of Object.entries(broken)) {
      for (const ask of commands) {
        // theme list discovers integration themes afresh on every call, so
        // that pair shows nothing about kept entries.
        if (root === 'themes' && ask[1] === 'list') continue;
        it.skipIf(!hasModuleHooks)(
          `shows a broken entry added to ${root} on the next ${ask.join(' ')}`,
          () => {
            const tmp = keptTmp(`nested-${root}-${ask[0]}`);
            const other = makeProject();
            try {
              fs.writeFileSync(
                path.join(other.widgets, 'astryx.integration.mjs'),
                "export default {themes: './themes', templates: './templates', components: './components', docs: './docs'};\n",
              );
              for (const dir of ['themes', 'templates', 'components', 'docs']) {
                fs.mkdirSync(path.join(other.widgets, dir), {recursive: true});
              }
              const at = (/** @type {string} */ where) =>
                run(ask, {tmp: where, cwd: other.dir, json: false});
              at(tmp);
              at(tmp);
              // The warm path hits: nothing is written again.
              const [before] = expectWarmHit(tmp, [ask], {
                cwd: other.dir,
                json: false,
              });
              add(path.join(other.widgets, root));
              const after = at(tmp);
              // The broken entry changes the answer, so equal to fresh shows it.
              expect(after).not.toEqual(before);
              expect(after).toEqual(at(freshTmp()));
            } finally {
              fs.rmSync(other.dir, {recursive: true, force: true});
            }
          },
          120_000,
        );
      }
    }
  });

  it('sees a template added or renamed after template discovery was kept inside search', () => {
    const tmp = keptTmp('nested-listing');
    const other = makeProject();
    try {
      const templates = path.join(other.widgets, 'templates');
      fs.mkdirSync(templates, {recursive: true});
      /** @param {string} name @param {string} description */
      const template = (name, description) => {
        fs.writeFileSync(
          path.join(templates, `${name}.doc.mjs`),
          `export default {type: 'block', name: '${name}', description: '${description}', category: 'Widget - Gate'};\n`,
        );
        fs.writeFileSync(
          path.join(templates, `${name}.tsx`),
          `export default function Block() { return null; }\n`,
        );
      };
      template('gate-fixture', 'Gate fixture block with running totals.');
      const ask = ['search', 'gate', 'fixture', 'block'];
      const searchAt = (/** @type {string} */ where) =>
        run(ask, {tmp: where, cwd: other.dir});
      // Template discovery is kept by template --list; search then keeps its
      // catalog with discovery read back inside it.
      run(['template', '--list'], {tmp, cwd: other.dir, json: false});
      const kept = templatesEntries(tmp);
      expect(kept.size).toBe(hasModuleHooks ? 1 : 0);
      searchAt(tmp);
      const catalogs = entries(tmp);
      if (hasModuleHooks) {
        const inodes = () =>
          new Map([...entries(tmp)].map(([name, {ino}]) => [name, ino]));
        const warm = inodes();
        expect(catalogs.size).toBeGreaterThan(0);
        // The warm path hits: the same answer from the same files.
        searchAt(tmp);
        expect(inodes()).toEqual(warm);
        expect(templatesEntries(tmp)).toEqual(kept);
      } else {
        // The documented fallback on Node 22.13 gathers fresh each run.
        expect(catalogs.size).toBe(0);
        expect(templatesEntries(tmp).size).toBe(0);
      }
      // A template added: the next search sees it, as a fresh one does.
      template('gate-fixture-extra', 'Gate fixture extra block for ledgers.');
      const added = searchAt(tmp);
      expect(added.stdout).toContain('gate-fixture-extra');
      expect(added).toEqual(searchAt(freshTmp()));
      // Renamed: likewise.
      for (const ext of ['.doc.mjs', '.tsx']) {
        fs.renameSync(
          path.join(templates, `gate-fixture-extra${ext}`),
          path.join(templates, `gate-fixture-renamed${ext}`),
        );
      }
      fs.writeFileSync(
        path.join(templates, 'gate-fixture-renamed.doc.mjs'),
        `export default {type: 'block', name: 'gate-fixture-renamed', description: 'Gate fixture extra block for ledgers.', category: 'Widget - Gate'};\n`,
      );
      const renamed = searchAt(tmp);
      expect(renamed.stdout).toContain('gate-fixture-renamed');
      expect(renamed.stdout).not.toContain('gate-fixture-extra');
      expect(renamed).toEqual(searchAt(freshTmp()));
    } finally {
      fs.rmSync(other.dir, {recursive: true, force: true});
    }
  }, 180_000);
});
