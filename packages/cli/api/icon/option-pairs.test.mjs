// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Every pair of options an icon command declares has a decided result
 * (spec:AST-042 FR5): for each command, the pairs come from its CommandDoc
 * (its options and its optional arguments; a required argument is always
 * given), and each pair is either
 *   - refused together with `ERR_INVALID_OPTION` (the `refused` table), or
 *   - composed: the call succeeds with both (the `composes` table), or
 *   - prevented by another rule: the call fails with another code the
 *     function documents (every other pair).
 * A pair that succeeds without being listed as composing fails this test, so
 * a new option, or a change that starts ignoring one, is decided in review.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {writeIconSetProject} from '../../test-utils/icon-set-fixture.mjs';
import {icon} from './icon.mjs';
import {iconAdd} from './add/add.mjs';
import {iconMap} from './map/map.mjs';
import {iconNewSet} from './new-set/new-set.mjs';
import {iconNewDefinition} from './new-definition/new-definition.mjs';
import {iconUse} from './use/use.mjs';
import {doc as iconCommand} from '../../clients/cli/commands/experimental-icon.doc.mjs';
import {doc as addCommand} from '../../clients/cli/commands/experimental-icon-add.doc.mjs';
import {doc as mapCommand} from '../../clients/cli/commands/experimental-icon-map.doc.mjs';
import {doc as newSetCommand} from '../../clients/cli/commands/experimental-icon-new-set.doc.mjs';
import {doc as newDefinitionCommand} from '../../clients/cli/commands/experimental-icon-new-definition.doc.mjs';
import {doc as useCommand} from '../../clients/cli/commands/experimental-icon-use.doc.mjs';
import {doc as iconFn} from './icon.doc.mjs';
import {doc as addFn} from './iconAdd.doc.mjs';
import {doc as mapFn} from './iconMap.doc.mjs';
import {doc as newSetFn} from './iconNewSet.doc.mjs';
import {doc as newDefinitionFn} from './iconNewDefinition.doc.mjs';
import {doc as useFn} from './iconUse.doc.mjs';

/** @type {string} */
let tmp;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-icon-pairs-'));
});
afterAll(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
});

const FROM = '@acme/glyph-library';

/**
 * An icon-set package `@acme/icons` with an installed library, and, unless
 * `bare`, its set `glyphs` made from that library with two variants.
 * @param {{bare?: boolean}} [options]
 * @returns {Promise<string>}
 */
async function makePackage({bare = false} = {}) {
  const dir = fs.mkdtempSync(path.join(tmp, 'pkg-'));
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    `${JSON.stringify({name: '@acme/icons', version: '1.0.0', license: 'MIT', type: 'module'}, null, 2)}\n`,
  );
  const lib = path.join(dir, 'node_modules', '@acme', 'glyph-library');
  fs.mkdirSync(lib, {recursive: true});
  fs.writeFileSync(
    path.join(lib, 'package.json'),
    JSON.stringify({
      name: '@acme/glyph-library',
      version: '2.0.0',
      type: 'module',
      exports: {'.': './index.js', './solid': './solid.js'},
    }),
  );
  const icons =
    'export const Bin = props => null;\nexport const Close = props => null;\n';
  fs.writeFileSync(path.join(lib, 'index.js'), icons);
  fs.writeFileSync(path.join(lib, 'solid.js'), icons);
  if (!bare) {
    await iconNewSet('glyphs', {
      cwd: dir,
      from: FROM,
      variants: 'outline,solid',
    });
  }
  return dir;
}

/**
 * @typedef {object} Case
 * @property {any} command the CommandDoc
 * @property {any} fn the FunctionDoc
 * @property {(...args: any[]) => Promise<unknown>} call
 * @property {() => Promise<string>} cwd a fresh folder for one call
 * @property {Record<string, unknown>} values a value for each API parameter
 * @property {Array<[string, string]>} refused pairs refused together
 * @property {Array<[string, string]>} composes pairs that succeed together
 */

/** @type {Record<string, Case>} */
const CASES = {
  'experimental icon': {
    command: iconCommand,
    fn: iconFn,
    call: icon,
    cwd: async () =>
      writeIconSetProject(fs.mkdtempSync(path.join(tmp, 'app-'))),
    values: {
      query: 'trash',
      'options.list': true,
      'options.set': 'glyphs',
      'options.limit': 3,
      'options.definitions': true,
      'options.allIcons': true,
    },
    refused: [
      ['query', '--list'],
      ['query', '--definitions'],
      ['query', '--all-icons'],
      ['--list', '--set'],
      ['--list', '--limit'],
      ['--list', '--definitions'],
      ['--list', '--all-icons'],
      ['--set', '--definitions'],
      ['--limit', '--definitions'],
      ['--limit', '--all-icons'],
      ['--definitions', '--all-icons'],
    ],
    composes: [
      ['query', '--set'],
      ['query', '--limit'],
      ['--set', '--all-icons'],
    ],
  },
  'experimental icon add': {
    command: addCommand,
    fn: addFn,
    call: iconAdd,
    cwd: () => makePackage(),
    values: {
      exportName: 'Bin',
      'options.from': FROM,
      'options.definition': 'delete',
      'options.newDefinition': 'binIt',
      'options.description': 'Put something in the bin.',
      'options.words': ['bin'],
      'options.useDefault': true,
      'options.variant': 'solid',
      'options.all': true,
      'options.id': 'bin',
      'options.set': 'glyphs',
    },
    refused: [
      ['export', '--all'],
      ['--definition', '--new-definition'],
      ['--definition', '--description'],
      ['--definition', '--words'],
      ['--definition', '--all'],
      ['--new-definition', '--all'],
      ['--description', '--all'],
      ['--words', '--all'],
      ['--default', '--all'],
      ['--all', '--id'],
      // A description and words describe only a new definition.
      ['export', '--description'],
      ['export', '--words'],
      ['--from', '--description'],
      ['--from', '--words'],
      ['--description', '--words'],
      ['--description', '--default'],
      ['--description', '--variant'],
      ['--description', '--id'],
      ['--description', '--set'],
      ['--words', '--default'],
      ['--words', '--variant'],
      ['--words', '--id'],
      ['--words', '--set'],
    ],
    composes: [['export', '--from']],
  },
  'experimental icon map': {
    command: mapCommand,
    fn: mapFn,
    call: iconMap,
    cwd: () => makePackage(),
    values: {
      definition: 'delete',
      icon: 'bin',
      'options.set': 'glyphs',
      'options.remove': true,
      'options.pairs': 'close=close',
    },
    refused: [
      ['definition', '--pairs'],
      ['icon', '--remove'],
      ['icon', '--pairs'],
      ['--remove', '--pairs'],
    ],
    composes: [
      ['definition', 'icon'],
      ['definition', '--remove'],
      ['--set', '--pairs'],
    ],
  },
  'experimental icon new-set': {
    command: newSetCommand,
    fn: newSetFn,
    call: iconNewSet,
    cwd: () => makePackage({bare: true}),
    values: {
      name: 'glyphs',
      'options.dryRun': true,
      'options.from': FROM,
      'options.exclude': 'Close',
      'options.variants': 'outline,solid',
      'options.defaultVariant': 'solid',
      'options.displayName': 'Glyphs',
      'options.description': 'Glyph icons.',
    },
    refused: [
      // `--exclude` needs `--from`, `--default-variant` needs `--variants`.
      ['--dry-run', '--exclude'],
      ['--dry-run', '--default-variant'],
      ['--exclude', '--variants'],
      ['--exclude', '--default-variant'],
      ['--exclude', '--display-name'],
      ['--exclude', '--description'],
      ['--from', '--default-variant'],
      ['--default-variant', '--display-name'],
      ['--default-variant', '--description'],
    ],
    composes: [
      ['--dry-run', '--from'],
      ['--dry-run', '--variants'],
      ['--dry-run', '--display-name'],
      ['--dry-run', '--description'],
      ['--from', '--exclude'],
      ['--from', '--variants'],
      ['--from', '--display-name'],
      ['--from', '--description'],
      ['--variants', '--default-variant'],
      ['--variants', '--display-name'],
      ['--variants', '--description'],
      ['--display-name', '--description'],
    ],
  },
  'experimental icon new-definition': {
    command: newDefinitionCommand,
    fn: newDefinitionFn,
    call: iconNewDefinition,
    cwd: () => makePackage(),
    values: {
      name: 'binIt',
      'options.dryRun': true,
      'options.set': 'glyphs',
      'options.description': 'Put something in the bin.',
      'options.words': ['bin'],
      'options.icon': 'bin',
    },
    refused: [],
    composes: [['--description', '--words']],
  },
  'experimental icon use': {
    command: useCommand,
    fn: useFn,
    call: iconUse,
    cwd: async () =>
      writeIconSetProject(fs.mkdtempSync(path.join(tmp, 'app-'))),
    values: {set: 'glyphs'},
    refused: [],
    composes: [],
  },
};

/**
 * The pair members a command declares: its optional arguments, by name, and
 * its options, by long flag; each with the API parameter it sets.
 * @param {any} command
 * @returns {Array<{label: string, param: string}>}
 */
function members(command) {
  return [
    ...(command.args ?? [])
      .filter((/** @type {any} */ arg) => arg.required !== true)
      .map((/** @type {any} */ arg) => ({label: arg.name, param: arg.param})),
    ...(command.options ?? []).map((/** @type {any} */ option) => ({
      label: option.flag.split(/[\s,]/u)[0],
      param: option.param,
    })),
  ];
}

/** @param {[string, string]} pair */
const key = ([a, b]) => [a, b].sort().join(' + ');

describe.each(Object.entries(CASES))('%s', (_name, spec) => {
  const declared = members(spec.command);
  const labels = declared.map(each => each.label);
  /** @type {Array<[string, string]>} */
  const pairs = [];
  for (let i = 0; i < declared.length; i++) {
    for (let j = i + 1; j < declared.length; j++) {
      pairs.push([declared[i].label, declared[j].label]);
    }
  }
  const refused = new Set(spec.refused.map(key));
  const composes = new Set(spec.composes.map(key));
  const documented = new Set(
    (spec.fn.throws ?? []).map((/** @type {any} */ each) => each.code),
  );

  it('names only pairs the command declares, each in one table', () => {
    for (const pair of [...spec.refused, ...spec.composes]) {
      expect(labels, key(pair)).toEqual(expect.arrayContaining(pair));
    }
    expect([...refused].filter(each => composes.has(each))).toEqual([]);
    for (const {param} of declared) {
      expect(Object.keys(spec.values), param).toContain(param);
    }
  });

  if (pairs.length === 0) return;
  it.each(pairs)('%s with %s', async (a, b) => {
    const given = new Set([a, b]);
    const cwd = await spec.cwd();
    // Required arguments are always given, in order; the rest only when
    // they are one of the pair.
    const args = (spec.command.args ?? []).map((/** @type {any} */ arg) =>
      arg.required === true || given.has(arg.name)
        ? spec.values[arg.param]
        : undefined,
    );
    /** @type {Record<string, unknown>} */
    const options = {cwd};
    for (const {label, param} of declared) {
      if (given.has(label) && param.startsWith('options.')) {
        options[param.slice('options.'.length)] = spec.values[param];
      }
    }
    /** @type {any} */
    let error = null;
    try {
      await spec.call(...args, options);
    } catch (thrown) {
      error = thrown;
    }
    const pair = key([a, b]);
    if (refused.has(pair)) {
      expect(error?.code, `${pair}: ${error?.message}`).toBe(
        'ERR_INVALID_OPTION',
      );
    } else if (composes.has(pair)) {
      expect(error, `${pair}: ${error?.message}`).toBeNull();
    } else {
      // Prevented by another rule: a documented code, never a silent
      // success and never an unknown error.
      expect(
        error,
        `${pair} succeeded but is not listed as composing`,
      ).not.toBeNull();
      expect(error.code, `${pair}: ${error.message}`).not.toBe(
        'ERR_INVALID_OPTION',
      );
      expect([...documented], `${pair}: ${error.message}`).toContain(
        error.code,
      );
    }
  });
});
