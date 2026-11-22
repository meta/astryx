// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The not-found hint's hook stem tier: a component name with a run of
 * words that is a hook's name without its verb (`TopLayer` and `useLayer`).
 *
 * @input  made-up hooks, as lists and as a stand-in Core in a temporary
 *   project
 * @output assertions on hookByStem, on hookByMeaning with `stems`, on where
 *   withOtherCommand puts such a hint, and on the component and template
 *   not-found errors
 * @position foundation/suggest/ beside the module it tests
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {
  MATCH_TIER,
  hookByMeaning,
  hookByStem,
  withOtherCommand,
} from './other-command.mjs';
import {component} from '../../api/component/component.mjs';
import {template} from '../../api/template/template.mjs';
import {REPO_ROOT} from '../../test-utils/repo-root.mjs';

const SLOW = 30_000;

const HOOKS = [
  {name: 'useWobble', keywords: []},
  {name: 'createGlimmerable', keywords: []},
  {name: 'usePlonkRowTally', keywords: []},
  {name: 'usePlonkRow', keywords: []},
  {name: 'useQuaffSort', keywords: []},
  {name: 'useZibSort', keywords: []},
];

describe('hookByStem', () => {
  it('names the hook whose name without its verb is a run of the typed words', () => {
    expect(hookByStem('TopWobble', HOOKS)).toEqual({
      name: 'useWobble',
      tier: MATCH_TIER.stem,
      stem: 'wobble',
    });
    expect(hookByStem('Glimmerable', HOOKS)?.name).toBe('createGlimmerable');
    expect(hookByStem('useGlimmerable', HOOKS)?.name).toBe('createGlimmerable');
    expect(hookByStem('wobble-side-panel', HOOKS)?.name).toBe('useWobble');
  });

  it('prefers the hook with the longest stem', () => {
    expect(hookByStem('PlonkRowTallyPicker', HOOKS)?.name).toBe(
      'usePlonkRowTally',
    );
    expect(hookByStem('PlonkRowPicker', HOOKS)?.name).toBe('usePlonkRow');
  });

  it('gives nothing when the stem words are not next to each other, or on a tie', () => {
    expect(hookByStem('PlonkBigRow', HOOKS)).toBeNull();
    expect(hookByStem('QuaffSortZibSort', HOOKS)).toBeNull();
  });

  it('is asked by hookByMeaning only with `stems`, after the other tiers', () => {
    expect(hookByMeaning('TopWobble', HOOKS)).toBeNull();
    expect(hookByMeaning('TopWobble', HOOKS, {stems: true})?.tier).toBe(
      MATCH_TIER.stem,
    );
    expect(hookByMeaning('useWoble', HOOKS, {stems: true})?.tier).toBe(
      MATCH_TIER.near,
    );
  });
});

describe('withOtherCommand with a hook stem hint', () => {
  const found = {
    hint: {name: 'astryx hook usePlonkRowTally', reason: 'a hook'},
    tier: MATCH_TIER.stem,
    stem: 'plonkrowtally',
  };
  const from = 'component';

  it('goes ahead of a suggestion that carries fewer of the typed words', () => {
    const own = [
      {name: 'Plonk', reason: 'x'},
      {name: 'Tally', reason: 'x'},
    ];
    expect(
      withOtherCommand(own, found, 'PlonkRowTallyPicker', {from})?.map(
        s => s.name,
      ),
    ).toEqual(['astryx hook usePlonkRowTally', 'Plonk']);
  });

  it('stays behind a suggestion whose name carries the stem', () => {
    const own = [
      {name: 'PlonkRowTally', reason: 'x'},
      {name: 'Plonk', reason: 'x'},
    ];
    expect(
      withOtherCommand(own, found, 'PlonkRowTallyPicker', {from})?.map(
        s => s.name,
      ),
    ).toEqual(['PlonkRowTally', 'astryx hook usePlonkRowTally']);
  });
});

/** @type {string} */
let tmpDir;

/**
 * A project whose stand-in Core ships the hooks of {@link HOOKS} and the
 * component Wobble.
 */
function scaffold() {
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({
      name: 'consumer',
      dependencies: {'@astryxdesign/core': '0.0.0'},
    }),
  );
  const coreDir = path.join(tmpDir, 'node_modules', '@astryxdesign', 'core');
  fs.mkdirSync(path.join(coreDir, 'src', 'hooks'), {recursive: true});
  fs.mkdirSync(path.join(coreDir, 'src', 'Wobble'), {recursive: true});
  fs.writeFileSync(
    path.join(coreDir, 'package.json'),
    JSON.stringify({name: '@astryxdesign/core', version: '0.0.0'}),
  );
  for (const {name} of HOOKS) {
    fs.writeFileSync(
      path.join(coreDir, 'src', 'hooks', `${name}.doc.mjs`),
      `export const docs = {\n  name: '${name}',\n  params: [],\n  returns: [],\n};\n`,
    );
  }
  fs.writeFileSync(
    path.join(coreDir, 'src', 'Wobble', 'Wobble.doc.mjs'),
    "export const docs = {name: 'Wobble', description: 'A wobble.', props: []};\n",
  );
  fs.writeFileSync(
    path.join(coreDir, 'src', 'Wobble', 'Wobble.tsx'),
    'export function Wobble() { return null; }\n',
  );
}

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(REPO_ROOT, '.astryx-hook-stem-'));
  scaffold();
});

afterAll(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/**
 * The error a lookup throws.
 * @param {Promise<unknown>} read
 * @returns {Promise<any>}
 */
const failure = read =>
  read.then(
    () => {
      throw new Error('the lookup resolved');
    },
    error => error,
  );

/**
 * The names of an error's suggestions.
 * @param {any} error
 * @returns {string[]}
 */
const names = error =>
  (error.suggestions ?? []).map((/** @type {{name: string}} */ s) => s.name);

describe('the not-found errors', () => {
  it(
    'suggest, for a component, the hook the typed words name without its verb',
    async () => {
      const error = await failure(component('Glimmerable', {cwd: tmpDir}));
      expect(error.code).toBe('ERR_UNKNOWN_COMPONENT');
      expect(error.suggestions?.[0]).toEqual({
        name: 'astryx hook createGlimmerable',
        reason: 'a hook, not a component',
      });
      expect(
        names(
          await failure(component('PlonkRowTallyPicker', {cwd: tmpDir})),
        )[0],
      ).toBe('astryx hook usePlonkRowTally');
    },
    SLOW,
  );

  it(
    'keep a suggested component that carries the stem ahead of the hint',
    async () => {
      const error = await failure(component('WobbleMenu', {cwd: tmpDir}));
      expect(names(error)[0]).toBe('Wobble');
    },
    SLOW,
  );

  it(
    'give no stem hint from the template lookup',
    async () => {
      const error = await failure(template('Glimmerable', {cwd: tmpDir}));
      expect(error.code).toBe('ERR_UNKNOWN_TEMPLATE');
      expect(names(error).some(name => name.startsWith('astryx hook'))).toBe(
        false,
      );
    },
    SLOW,
  );
});
