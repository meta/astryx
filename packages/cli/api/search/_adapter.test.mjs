// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for search's adapter: a long-running caller reuses the gathered
 * candidates while their inputs are unchanged (gatherCandidatesReused), and
 * gathers again when an input changes or for another folder or `type`.
 *
 * Whether inputs changed is read-record's answer (tested in
 * read-record.test.mjs). Other tests running at the same time change shared
 * folders a gather reads (the temp folder, the repository root), so here the
 * reuse case holds that answer at "unchanged", and every other case only
 * checks that a change forces a new gather, which concurrent changes cannot
 * undo.
 */

import {describe, it, expect, vi} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as readRecord from '../../foundation/fs/read-record.mjs';
import {gatherCandidates, gatherCandidatesReused} from './_adapter.mjs';

vi.mock('../../foundation/fs/read-record.mjs', async original => {
  const real = /** @type {typeof readRecord} */ (await original());
  return {...real, unchangedSince: vi.fn(real.unchangedSince)};
});
const unchangedSince = vi.mocked(readRecord.unchangedSince);

const SLOW = 60_000;

/** A folder with only a package.json: a docs search there reads the CLI's docs. */
function scratchProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-gather-reuse-'));
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"app"}');
  return dir;
}

describe('gatherCandidatesReused', () => {
  it(
    'reuses the gathered candidates while the inputs are unchanged',
    async () => {
      const cwd = scratchProject();
      const first = await gatherCandidatesReused({cwd, type: 'doc'});
      unchangedSince.mockReturnValueOnce(true);
      expect(await gatherCandidatesReused({cwd, type: 'doc'})).toBe(first);
      expect(first.all.length).toBeGreaterThan(0);
      // The same candidates a fresh gather finds.
      expect(JSON.parse(JSON.stringify(first))).toEqual(
        JSON.parse(JSON.stringify(await gatherCandidates({cwd, type: 'doc'}))),
      );
    },
    SLOW,
  );

  it(
    'gathers again when an input file changes',
    async () => {
      const cwd = scratchProject();
      const first = await gatherCandidatesReused({cwd, type: 'doc'});
      const later = new Date(Date.now() + 5_000);
      fs.utimesSync(path.join(cwd, 'package.json'), later, later);
      expect(await gatherCandidatesReused({cwd, type: 'doc'})).not.toBe(first);
      fs.writeFileSync(
        path.join(cwd, 'astryx.config.mjs'),
        'export default {};\n',
      );
      expect(await gatherCandidatesReused({cwd, type: 'doc'})).not.toBe(first);
    },
    SLOW,
  );

  it(
    'keeps one entry per folder and type',
    async () => {
      const cwd = scratchProject();
      const docs = await gatherCandidatesReused({cwd, type: 'doc'});
      const themes = await gatherCandidatesReused({cwd, type: 'theme'});
      expect(themes).not.toBe(docs);
      expect(themes.all.every(c => c.domain === 'theme')).toBe(true);
      expect(
        await gatherCandidatesReused({cwd: scratchProject(), type: 'doc'}),
      ).not.toBe(docs);
    },
    SLOW,
  );

  it(
    'gathers again when a file the gather read or imported changes, in a linked package too',
    async () => {
      // A consumer whose integration is a symlink to a package folder
      // elsewhere, as a workspace package is.
      const dir = fs.mkdtempSync(
        path.join(process.cwd(), '.astryx-gather-reuse-'),
      );
      const pkg = fs.mkdtempSync(
        path.join(os.tmpdir(), 'astryx-linked-widgets-'),
      );
      try {
        fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"consumer"}');
        fs.writeFileSync(
          path.join(dir, 'astryx.config.mjs'),
          "export default { integrations: ['@acme/widgets'] };\n",
        );
        fs.mkdirSync(
          path.join(dir, 'node_modules', '@astryxdesign', 'core', 'src'),
          {
            recursive: true,
          },
        );
        fs.mkdirSync(path.join(pkg, 'components'));
        fs.writeFileSync(
          path.join(pkg, 'package.json'),
          '{"name":"@acme/widgets","version":"1.0.0"}',
        );
        fs.writeFileSync(
          path.join(pkg, 'astryx.integration.mjs'),
          "export default { components: './components' };\n",
        );
        fs.writeFileSync(
          path.join(pkg, 'components', 'FancyGizmo.doc.mjs'),
          `export default {
            type: 'component',
            name: 'FancyGizmo',
            keywords: ['gizmo'],
            usage: {description: 'A fancy part.'},
            props: [],
          };\n`,
        );
        fs.writeFileSync(
          path.join(pkg, 'components', 'FancyGizmo.tsx'),
          'export function FancyGizmo() { return null; }\n',
        );
        fs.mkdirSync(path.join(dir, 'node_modules', '@acme'));
        fs.symlinkSync(
          pkg,
          path.join(dir, 'node_modules', '@acme', 'widgets'),
          'dir',
        );
        const options = {cwd: dir, type: 'component'};
        const first = await gatherCandidatesReused(options);
        expect(first.all.map(c => c.name)).toContain('FancyGizmo');

        // A new component in the linked package: its folder changed.
        fs.writeFileSync(
          path.join(pkg, 'components', 'TinySprocket.doc.mjs'),
          `export default {
            type: 'component',
            name: 'TinySprocket',
            keywords: ['sprocket'],
            usage: {description: 'A small part.'},
            props: [],
          };\n`,
        );
        fs.writeFileSync(
          path.join(pkg, 'components', 'TinySprocket.tsx'),
          'export function TinySprocket() { return null; }\n',
        );
        const second = await gatherCandidatesReused(options);
        expect(second).not.toBe(first);
        expect(second.all.map(c => c.name)).toContain('TinySprocket');

        // An edited file the gather read: the linked package's manifest.
        const later = new Date(Date.now() + 5_000);
        fs.utimesSync(path.join(pkg, 'package.json'), later, later);
        const third = await gatherCandidatesReused(options);
        expect(third).not.toBe(second);

        // An edited doc the gather imported: the next gather reads its new
        // content, not the module this process imported first.
        fs.writeFileSync(
          path.join(pkg, 'components', 'FancyGizmo.doc.mjs'),
          `export default {
            type: 'component',
            name: 'FancyGizmo',
            keywords: ['gizmo'],
            usage: {description: 'A shinier part, now with sprockets.'},
            props: [],
          };\n`,
        );
        const fourth = await gatherCandidatesReused(options);
        expect(fourth).not.toBe(third);
        expect(
          JSON.stringify(fourth.all.find(c => c.name === 'FancyGizmo')),
        ).toContain('A shinier part, now with sprockets.');
      } finally {
        fs.rmSync(dir, {recursive: true, force: true});
        fs.rmSync(pkg, {recursive: true, force: true});
      }
    },
    SLOW,
  );
});
