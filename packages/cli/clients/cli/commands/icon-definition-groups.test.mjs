// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Icon definition groups (AST-084 FR4, FR6): `experimental icon
 * --definitions` names each definition's group, the finder names a match's
 * related definitions (only the first match in text), the answer with no set
 * names them for each definition, and a definition's docs page names its
 * group's other members with their routes. Groups never change ranking.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {formatCliCommand} from '../../../foundation/env/package-manager.mjs';
import {
  definitionSource,
  glyphsData,
  writeIconSetProject,
} from '../../../test-utils/icon-set-fixture.mjs';
import {definitionRelatives} from '../../../foundation/discovery/icon-definition-discovery.mjs';

const SLOW = 60_000;

/** @type {string} */
let tmp;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-icon-groups-'));
});
afterAll(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
});

/** @param {string[]} args @param {string} cwd */
async function json(args, cwd) {
  const res = await runCli([...args, '--json'], cwd);
  expect(res.code, res.stderr).toBe(0);
  return JSON.parse(res.stdout);
}

/**
 * A project whose set maps `search` and `documentSearch`, and declares its
 * own `logSearch` in the `search` group.
 * @param {string} name
 */
function groupedProject(name) {
  const data = glyphsData();
  return writeIconSetProject(path.join(tmp, name), {
    packages: [
      {
        data: {
          ...data,
          module: '@acme/glyphs',
          icons: [
            ...data.icons,
            {
              id: 'doc-search',
              export: 'DocSearchIcon',
              words: ['find in page'],
            },
          ],
          map: {...data.map, documentSearch: 'doc-search'},
        },
        definitions: {
          logSearch: definitionSource('logSearch', {
            description: 'Search a log.',
            words: ['log search'],
          }).replace('"type"', '"group": "search",\n  "type"'),
        },
      },
    ],
    config: {experimental: {iconSet: 'glyphs'}},
  });
}

describe('definitionRelatives', () => {
  const docs = [
    {name: 'a', description: 'A.', group: 'g'},
    {name: 'b', description: 'B.', group: 'g'},
    {name: 'c', description: 'C.'},
    {name: 'b', description: 'Later b.', group: 'h'},
  ];
  it('names the other members of each group, the first doc of a name winning', () => {
    expect(definitionRelatives(['a'], docs)).toEqual([
      {definition: 'b', description: 'B.'},
    ]);
    expect(definitionRelatives(['a', 'b'], docs)).toEqual([]);
    expect(definitionRelatives(['c'], docs)).toEqual([]);
  });
});

describe('experimental icon --definitions names the group', () => {
  it(
    'JSON has `group` only when a definition names one; text shows it',
    async () => {
      const cwd = writeIconSetProject(path.join(tmp, 'definitions'), {
        packages: [],
      });
      const body = await json(['experimental', 'icon', '--definitions'], cwd);
      /** @type {Map<string, any>} */
      const byName = new Map(
        body.data.definitions.map((/** @type {any} */ each) => [
          each.name,
          each,
        ]),
      );
      expect(byName.get('notificationOff').group).toBe('notifications');
      expect(byName.get('userAdd').group).toBe('people');
      expect(byName.get('home')).not.toHaveProperty('group');

      const text = await runCli(['experimental', 'icon', '--definitions'], cwd);
      expect(text.stdout).toMatch(
        /- notificationOff \[optional, group notifications[,\]]/u,
      );
      expect(text.stdout).toMatch(/- home \[optional[,\]]/u);
    },
    SLOW,
  );
});

describe('the finder names related definitions', () => {
  it(
    'each match gains `relatives` from Astryx and the set; text names them under the first match only',
    async () => {
      const cwd = groupedProject('finder');
      const body = await json(['experimental', 'icon', 'magnifier'], cwd);
      const [first] = body.data.matches;
      expect(first).toMatchObject({id: 'search', definitions: ['search']});
      expect(first.relatives).toEqual([
        {
          definition: 'documentSearch',
          description: expect.any(String),
        },
        {definition: 'logSearch', description: 'Search a log.'},
      ]);
      const docSearch = (
        await json(['experimental', 'icon', 'find in page'], cwd)
      ).data.matches.find(
        (/** @type {any} */ each) => each.id === 'doc-search',
      );
      expect(
        docSearch?.relatives?.map((/** @type {any} */ r) => r.definition),
      ).toEqual(['search', 'logSearch']);
      const trash = await json(['experimental', 'icon', 'garbage'], cwd);
      expect(trash.data.matches[0]).not.toHaveProperty('relatives');

      const text = await runCli(['experimental', 'icon', 'magnifier'], cwd);
      const related = text.stdout
        .split('\n')
        .filter(line => line.trimStart().startsWith('relatives'));
      expect(related).toHaveLength(1);
      expect(related[0]).toContain('documentSearch (');
      expect(related[0]).toContain('logSearch (Search a log)');
    },
    SLOW,
  );

  it(
    'with no set, each definition gains `group` and `relatives`; text adds one related line',
    async () => {
      const cwd = writeIconSetProject(path.join(tmp, 'none'), {packages: []});
      const body = await json(
        ['experimental', 'icon', 'mute notifications'],
        cwd,
      );
      const off = body.data.definitions.find(
        (/** @type {any} */ each) => each.name === 'notificationOff',
      );
      expect(off).toMatchObject({
        group: 'notifications',
        relatives: expect.arrayContaining([
          expect.objectContaining({definition: 'notification'}),
          expect.objectContaining({definition: 'notificationActive'}),
        ]),
      });
      const text = await runCli(
        ['experimental', 'icon', 'mute notifications'],
        cwd,
      );
      expect(
        text.stdout.split('\n').filter(line => line.startsWith('Related to')),
      ).toHaveLength(1);
    },
    SLOW,
  );
});

describe("a definition's docs page names its group", () => {
  it(
    'a Group row names the group and the other members with their routes',
    async () => {
      const cwd = writeIconSetProject(path.join(tmp, 'docs'), {packages: []});
      const res = await runCli(
        ['docs', 'cli/experimental/icon-definitions/user-add'],
        cwd,
      );
      expect(res.code).toBe(0);
      const row = res.stdout.split('\n').find(line => line.startsWith('Group'));
      expect(row).toMatch(
        /^Group \| `people`: `user`, `userCircle`, `userRemove`, `users`\s*$/u,
      );
      expect(res.stdout).toContain(
        `${formatCliCommand('docs cli/experimental/icon-definitions/user-remove')}\``,
      );
      const json = JSON.parse(
        (
          await runCli(
            ['docs', 'cli/experimental/icon-definitions/user-add', '--json'],
            cwd,
          )
        ).stdout,
      );
      expect(JSON.stringify(json)).toContain('"Group"');
      const home = await runCli(
        ['docs', 'cli/experimental/icon-definitions/home'],
        cwd,
      );
      expect(home.stdout).not.toContain('Group');
    },
    SLOW,
  );
});
