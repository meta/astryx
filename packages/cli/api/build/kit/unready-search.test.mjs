// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Build reads search as if a page template that is not ready yet were
 * absent: the whole kit (pages, blocks, components, start, counts) is what it
 * would be without such a template, however strongly the template matches.
 * Only the start's reason names a not-ready template, and only when the idea
 * names it. A template that becomes ready is read again at once.
 */

import {afterAll, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from '../build.mjs';
import {loadTemplates} from '../_adapter.mjs';

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../..',
);

/**
 * A project on this checkout's Core with one integration whose page templates
 * are written by `templates`.
 * @param {Record<string, {description: string, keywords: string[], isReady: boolean}>} templates
 */
function project(templates) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-unready-'));
  const far = path.join(dir, 'node_modules', '@acme', 'far');
  fs.mkdirSync(path.join(dir, 'node_modules', '@astryxdesign'), {
    recursive: true,
  });
  fs.symlinkSync(
    path.join(REPO, 'packages', 'core'),
    path.join(dir, 'node_modules', '@astryxdesign', 'core'),
  );
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({name: 'fx', dependencies: {'@astryxdesign/core': '*'}}),
  );
  fs.writeFileSync(
    path.join(dir, 'astryx.config.mjs'),
    "export default { integrations: ['@acme/far'] };\n",
  );
  fs.mkdirSync(path.join(far, 'templates'), {recursive: true});
  fs.writeFileSync(
    path.join(far, 'package.json'),
    JSON.stringify({name: '@acme/far', version: '1.0.0'}),
  );
  fs.writeFileSync(
    path.join(far, 'astryx.integration.mjs'),
    "export default { templates: './templates' };\n",
  );
  const write = (/** @type {typeof templates} */ all) => {
    for (const [name, t] of Object.entries(all)) {
      fs.writeFileSync(
        path.join(far, 'templates', `${name}.doc.mjs`),
        `export default ${JSON.stringify({type: 'page', name, category: 'Far - Pages', ...t})};\n`,
      );
      fs.writeFileSync(
        path.join(far, 'templates', `${name}.tsx`),
        'export default function Page() { return null; }\n',
      );
    }
  };
  write(templates);
  return {dir, write};
}

/** @type {string[]} */
const made = [];
afterAll(() => {
  for (const dir of made) fs.rmSync(dir, {recursive: true, force: true});
});

/** @param {string} idea @param {string} cwd */
async function kitOf(idea, cwd) {
  const r = await build(idea, {cwd});
  if (r.type !== 'build.kit') throw new Error(r.type);
  return r.data;
}

const TALLY = {
  description:
    'Running totals per team, tallied by week, with a report export.',
  keywords: ['tally', 'running totals', 'export report', 'grouped rows'],
};

// Ideas the template matches strongly or shares words with, none naming it.
const IDEAS = [
  'running totals per team by week',
  'export report',
  'grouped rows table with an accordion, a time input, selectors and metadata',
  'analytics dashboard with retention cohorts',
];

describe('a not-ready page template', () => {
  it('leaves the whole kit as it is without the template', async () => {
    const absent = project({});
    const present = project({tally: {...TALLY, isReady: false}});
    made.push(absent.dir, present.dir);
    for (const idea of IDEAS) {
      expect(await kitOf(idea, present.dir)).toEqual(
        await kitOf(idea, absent.dir),
      );
    }
  }, 120_000);

  it('is named in the reason only when the idea names it, even below another not-ready template', async () => {
    const absent = project({});
    const present = project({
      tally: {...TALLY, isReady: false},
      scoreboard: {
        description: 'A tally page of running totals per team.',
        keywords: ['tally page', 'running totals', 'tally'],
        isReady: false,
      },
    });
    made.push(absent.dir, present.dir);
    const idea = 'a tally page with running totals';
    const plain = await kitOf(idea, absent.dir);
    const named = await kitOf(idea, present.dir);
    expect(named.start?.reason).toBe(
      `\`tally\` isn't ready yet, so build started from \`${plain.start?.name}\`.`,
    );
    expect({...named, start: {...named.start, reason: ''}}).toEqual({
      ...plain,
      start: {...plain.start, reason: ''},
    });
  }, 120_000);

  it('is read again, cold and warm, once it becomes ready', async () => {
    const fx = project({tally: {...TALLY, isReady: false}});
    made.push(fx.dir);
    const idea = 'running totals tally per team';
    const names = async () =>
      (await kitOf(idea, fx.dir)).pages.map(p => p.name);
    expect(await names()).not.toContain('tally');
    expect(await names()).not.toContain('tally');
    fx.write({tally: {...TALLY, isReady: true}});
    expect(await names()).toContain('tally');
    expect(await names()).toContain('tally');
    fx.write({tally: {...TALLY, isReady: false}});
    expect(await names()).not.toContain('tally');
  }, 120_000);

  it('is not named for an idea that names a ready template sharing its word', async () => {
    const fx = project({
      tally: {...TALLY, isReady: false},
      'tally-sheet': {
        description: 'A sheet of tallies with a total per row.',
        keywords: ['tally sheet'],
        isReady: true,
      },
    });
    made.push(fx.dir);
    for (const idea of ['tally-sheet', 'TallySheet']) {
      const kit = await kitOf(idea, fx.dir);
      expect(kit.start?.reason).not.toContain('`tally`');
    }
  }, 120_000);

  it("keeps a ready template's own reason when its id holds a not-ready template's name", async () => {
    const {pages, notReadyPages} = await loadTemplates(REPO);
    for (const {name} of notReadyPages) {
      for (const page of pages.filter(p => p.name.split('-').includes(name))) {
        const kit = await kitOf(page.name, REPO);
        expect(kit.start?.reason).not.toContain(`\`${name}\` isn't ready yet`);
      }
    }
  }, 120_000);
});
