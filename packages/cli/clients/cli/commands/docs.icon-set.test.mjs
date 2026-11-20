// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs icons` names the project's icon set: where the icon
 * feature gate is on and the project has one set, that set's package adds one
 * section that says how to find its icons. With no icon-set package, or two
 * and no order, the topic is what it always was.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {
  writeIconPackage,
  writeIconSetProject,
} from '../../../test-utils/icon-set-fixture.mjs';

const SLOW = 60_000;

/** @type {string} */
let tmp;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-docs-icon-set-'));
});
afterAll(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
});

/**
 * `docs icons --index`, text and JSON, in a project with these packages.
 * @param {string} name
 * @param {Array<Record<string, unknown>>} packages
 */
async function iconsIndex(name, packages) {
  const cwd = writeIconSetProject(path.join(tmp, name), {packages});
  const json = await runCli(['docs', 'icons', '--index', '--json'], cwd);
  const text = await runCli(['docs', 'icons', '--index'], cwd);
  expect(json.code).toBe(0);
  return {cwd, data: JSON.parse(json.stdout).data, text: text.stdout};
}

describe('docs icons with icon sets', () => {
  it(
    'no icon-set package: no section about an installed set',
    async () => {
      const {data, text} = await iconsIndex('none', []);
      expect(
        data.sections.map((/** @type {any} */ each) => each.id),
      ).not.toContain('installed-icon-set');
      expect(text).not.toContain('sections from');
    },
    SLOW,
  );

  it(
    'one icon-set package: its package adds the section, which names how to find icons',
    async () => {
      const {cwd, data, text} = await iconsIndex('one', [{}]);
      expect(data.sections.at(-1)).toMatchObject({
        id: 'installed-icon-set',
        package: '@acme/glyphs',
      });
      expect(text).toContain('sections from @acme/glyphs: installed-icon-set');
      const section = await runCli(
        ['docs', 'icons', 'installed-icon-set'],
        cwd,
      );
      expect(section.stdout).toContain('experimental icon <words>');
    },
    SLOW,
  );

  it(
    'two icon-set packages and no order: no section, since no set is the project set',
    async () => {
      const {data} = await iconsIndex('two', [{}, {name: '@acme/lines'}]);
      expect(
        data.sections.map((/** @type {any} */ each) => each.id),
      ).not.toContain('installed-icon-set');
    },
    SLOW,
  );

  it(
    'in the icon-set package being authored: no section and no doctor icon checks, unless its astryx.config sets experimental.iconSet',
    async () => {
      const cwd = path.join(tmp, 'authoring', 'glyphs');
      writeIconPackage(cwd);
      /** @param {any} data */
      const sectionIds = data =>
        data.sections.map((/** @type {any} */ each) => each.id);
      const docsIndex = async () =>
        JSON.parse(
          (await runCli(['docs', 'icons', '--index', '--json'], cwd)).stdout,
        ).data;
      const doctorChecks = async () =>
        JSON.parse(
          (await runCli(['doctor', '--json'], cwd)).stdout,
        ).data.checks.map((/** @type {any} */ check) => check.id);

      expect(sectionIds(await docsIndex())).not.toContain('installed-icon-set');
      expect(await doctorChecks()).not.toContain('icon-sets');
      expect(await doctorChecks()).not.toContain('icon-placeholders');

      fs.writeFileSync(
        path.join(cwd, 'astryx.config.mjs'),
        "export default {experimental: {iconSet: 'glyphs'}};\n",
      );
      expect(sectionIds(await docsIndex())).toContain('installed-icon-set');
    },
    SLOW,
  );

  it(
    'search never returns the section',
    async () => {
      const cwd = writeIconSetProject(path.join(tmp, 'search'));
      const res = await runCli(['search', 'icon set', '--json'], cwd);
      expect(
        JSON.parse(res.stdout).data.results.filter(
          (/** @type {any} */ each) => each.section === 'installed-icon-set',
        ),
      ).toEqual([]);
    },
    SLOW,
  );
});
