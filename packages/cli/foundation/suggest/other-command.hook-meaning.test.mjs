// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The not-found hint's two hook tiers: a `use…` name a slip or two
 * from a hook's name, or one whose every word the hook's name carries (near
 * hook), and a name with
 * exactly the words of a keyword a hook's doc declares (hook keyword).
 *
 * @input  made-up hooks with made-up keywords, as lists and as a stand-in
 *   Core in a temporary project
 * @output assertions on hookByMeaning, on where withOtherCommand puts such a
 *   hint, and on the component and template not-found errors
 * @position foundation/suggest/ beside the module it tests
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {MATCH_TIER, hookByMeaning, withOtherCommand} from './other-command.mjs';
import {component} from '../../api/component/component.mjs';
import {docs} from '../../api/docs/docs.mjs';
import {template} from '../../api/template/template.mjs';
import {REPO_ROOT} from '../../test-utils/repo-root.mjs';

const SLOW = 30_000;

const HOOKS = [
  {name: 'useGlimmerRowSpindle', keywords: ['spindle', 'twirl strip']},
  {name: 'useGlimmerRowTally', keywords: ['wobble strip']},
  {name: 'usePlonkFeedback', keywords: ['plonkable', 'tap', 'tap ripple']},
  {name: 'useWibbleContainer', keywords: ['wibble', 'plonkable', 'wibble box']},
  {name: 'useQuaffSort', keywords: ['sort', 'quaff order']},
  {name: 'useQuaffSortState', keywords: ['sort', 'quaff order']},
];

describe('hookByMeaning', () => {
  it('names the hook a use… name nearly spells', () => {
    for (const typed of [
      'useGlimerRowSpindle',
      'useGlimmerRowSpindel',
      'useRowGlimmerSpindle',
      'useGlimmerSpindle',
    ]) {
      expect(hookByMeaning(typed, HOOKS)).toEqual({
        name: 'useGlimmerRowSpindle',
        tier: MATCH_TIER.near,
      });
    }
  });

  it('prefers the closest hook with every typed word, and gives nothing on a tie', () => {
    expect(hookByMeaning('useSort', HOOKS)?.name).toBe('useQuaffSort');
    expect(hookByMeaning('useGlimmerRow', HOOKS)).toBeNull();
  });

  it('gives nothing for a use… name far from every hook', () => {
    expect(hookByMeaning('useZed', HOOKS)).toBeNull();
    expect(hookByMeaning('useGlimmerExpandable', HOOKS)).toBeNull();
  });

  it('names the one hook whose doc declares two or more typed words as one keyword', () => {
    expect(hookByMeaning('TwirlStrip', HOOKS)).toEqual({
      name: 'useGlimmerRowSpindle',
      tier: MATCH_TIER.keyword,
    });
    expect(hookByMeaning('twirl-strip', HOOKS)?.name).toBe(
      'useGlimmerRowSpindle',
    );
    expect(hookByMeaning('TwirlStripBar', HOOKS)).toBeNull();
    expect(hookByMeaning('TwirlStrip', HOOKS, {keywords: false})).toBeNull();
  });

  it('gives nothing for a one-word keyword, even one hook declares', () => {
    expect(hookByMeaning('Spindle', HOOKS)).toBeNull();
    expect(hookByMeaning('Tap', HOOKS)).toBeNull();
  });

  it('gives nothing for a keyword more than one hook declares', () => {
    expect(hookByMeaning('QuaffOrder', HOOKS)).toBeNull();
    expect(hookByMeaning('TapRipple', HOOKS)?.name).toBe('usePlonkFeedback');
  });
});

describe('withOtherCommand with a hook-tier hint', () => {
  const near = {
    hint: {name: 'astryx hook useGlimmerRowSpindle', reason: 'a hook'},
    tier: MATCH_TIER.near,
  };
  const keyword = {
    hint: {name: 'astryx hook useGlimmerRowSpindle', reason: 'a hook'},
    tier: MATCH_TIER.keyword,
  };
  const from = 'component';

  it('goes first when no suggestion matches as well, and the list keeps its length', () => {
    const own = [
      {name: 'Glimmer', reason: 'x'},
      {name: 'Spindle', reason: 'x'},
    ];
    expect(
      withOtherCommand(own, near, 'useGlimmerSpindle', {from})?.map(
        s => s.name,
      ),
    ).toEqual(['astryx hook useGlimmerRowSpindle', 'Glimmer']);
  });

  it('stays behind a suggestion whose name carries every typed word or is a near name', () => {
    const own = [
      {name: 'useGlimmerSpindle Showcase', reason: 'x'},
      {name: 'Spindle', reason: 'x'},
    ];
    expect(
      withOtherCommand(own, near, 'useGlimmerSpindle', {from})?.map(
        s => s.name,
      ),
    ).toEqual([
      'useGlimmerSpindle Showcase',
      'astryx hook useGlimmerRowSpindle',
    ]);
    expect(
      withOtherCommand(
        [{name: 'TwirlStrip', reason: 'x'}],
        keyword,
        'TwirlStrp',
        {
          from,
        },
      ),
    ).toEqual([{name: 'TwirlStrip', reason: 'x'}]);
  });

  it('stays behind a suggestion that declares the typed words as a keyword', () => {
    const own = [
      {name: 'Strip', reason: 'x'},
      {name: 'Twirler', reason: 'x'},
    ];
    const keywordsOf = (/** @type {{name: string}} */ s) =>
      s.name === 'Twirler' ? ['twirl strip'] : ['strip'];
    expect(
      withOtherCommand(own, keyword, 'TwirlStrip', {from, keywordsOf})?.map(
        s => s.name,
      ),
    ).toEqual(['Strip', 'Twirler']);
    expect(
      withOtherCommand(own, keyword, 'TwirlStrip', {from})?.map(s => s.name),
    ).toEqual(['astryx hook useGlimmerRowSpindle', 'Strip']);
  });
});

/** @type {string} */
let tmpDir;

/**
 * A project whose stand-in Core ships the hooks of {@link HOOKS} and the
 * component Plinth, whose doc declares the keyword `wobble strip`, as
 * useGlimmerRowTally's does.
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
  fs.mkdirSync(path.join(coreDir, 'src', 'Plinth'), {recursive: true});
  fs.writeFileSync(
    path.join(coreDir, 'package.json'),
    JSON.stringify({name: '@astryxdesign/core', version: '0.0.0'}),
  );
  for (const {name, keywords} of HOOKS) {
    fs.writeFileSync(
      path.join(coreDir, 'src', 'hooks', `${name}.doc.mjs`),
      `export const docs = {\n  name: '${name}',\n  keywords: ${JSON.stringify(keywords)},\n  params: [],\n  returns: [],\n};\n`,
    );
  }
  fs.writeFileSync(
    path.join(coreDir, 'src', 'Plinth', 'Plinth.doc.mjs'),
    "export const docs = {name: 'Plinth', description: 'A plinth.', keywords: ['wobble strip'], props: []};\n",
  );
  fs.writeFileSync(
    path.join(coreDir, 'src', 'Plinth', 'Plinth.tsx'),
    'export function Plinth() { return null; }\n',
  );
}

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(REPO_ROOT, '.astryx-hook-meaning-'));
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

describe('the component and template not-found errors', () => {
  it(
    'suggest the hook a use… name nearly spells first',
    async () => {
      const own = await failure(component('useGlimmerSpindle', {cwd: tmpDir}));
      expect(own.code).toBe('ERR_UNKNOWN_COMPONENT');
      expect(own.suggestions?.[0]).toEqual({
        name: 'astryx hook useGlimmerRowSpindle',
        reason: 'a hook, not a component',
      });
      const fromTemplate = await failure(
        template('useGlimerRowSpindle', {cwd: tmpDir}),
      );
      expect(fromTemplate.code).toBe('ERR_UNKNOWN_TEMPLATE');
      expect(fromTemplate.suggestions?.[0]?.name).toBe(
        'astryx hook useGlimmerRowSpindle',
      );
    },
    SLOW,
  );

  it(
    'suggest, for a component, the hook whose doc declares the typed words as a keyword',
    async () => {
      const error = await failure(component('TwirlStrip', {cwd: tmpDir}));
      expect(error.code).toBe('ERR_UNKNOWN_COMPONENT');
      expect(error.suggestions?.[0]?.name).toBe(
        'astryx hook useGlimmerRowSpindle',
      );
      expect(
        (await failure(component('tap-ripple', {cwd: tmpDir}))).suggestions?.[0]
          ?.name,
      ).toBe('astryx hook usePlonkFeedback');
      const fromTemplate = await failure(template('TwirlStrip', {cwd: tmpDir}));
      expect(
        (fromTemplate.suggestions ?? []).some(
          (/** @type {{name: string}} */ s) => s.name.startsWith('astryx hook'),
        ),
      ).toBe(false);
    },
    SLOW,
  );

  it(
    'keep a suggested component that declares the same keyword first',
    async () => {
      const error = await failure(component('WobbleStrip', {cwd: tmpDir}));
      expect(error.code).toBe('ERR_UNKNOWN_COMPONENT');
      expect(error.suggestions?.[0]?.name).toBe('Plinth');
    },
    SLOW,
  );

  it(
    'give no hook hint for a tie, and none from the docs lookup',
    async () => {
      const tie = await failure(component('useGlimmerRow', {cwd: tmpDir}));
      expect(
        (tie.suggestions ?? []).some((/** @type {{name: string}} */ s) =>
          s.name.startsWith('astryx hook'),
        ),
      ).toBe(false);
      const topic = await failure(
        docs('useGlimmerSpindle', undefined, {cwd: tmpDir}),
      );
      expect(
        (topic.suggestions ?? []).some((/** @type {{name: string}} */ s) =>
          s.name.startsWith('astryx hook'),
        ),
      ).toBe(false);
    },
    SLOW,
  );
});

describe("a suggested component's search card", () => {
  /** @type {string} */
  let cardDir;

  /**
   * A project whose stand-in Core ships the component Text, whose doc
   * declares only the keyword `clamp` while the CLI's search card for Text
   * lists `line clamp`, and a hook whose doc declares `line clamp`.
   */
  beforeAll(() => {
    cardDir = fs.mkdtempSync(path.join(REPO_ROOT, '.astryx-hook-card-'));
    fs.writeFileSync(
      path.join(cardDir, 'package.json'),
      JSON.stringify({
        name: 'consumer',
        dependencies: {'@astryxdesign/core': '0.0.0'},
      }),
    );
    const coreDir = path.join(cardDir, 'node_modules', '@astryxdesign', 'core');
    fs.mkdirSync(path.join(coreDir, 'src', 'hooks'), {recursive: true});
    fs.mkdirSync(path.join(coreDir, 'src', 'Text'), {recursive: true});
    fs.writeFileSync(
      path.join(coreDir, 'package.json'),
      JSON.stringify({name: '@astryxdesign/core', version: '0.0.0'}),
    );
    fs.writeFileSync(
      path.join(coreDir, 'src', 'hooks', 'useClampedLines.doc.mjs'),
      "export const docs = {\n  name: 'useClampedLines',\n  keywords: ['line clamp'],\n  params: [],\n  returns: [],\n};\n",
    );
    fs.writeFileSync(
      path.join(coreDir, 'src', 'Text', 'Text.doc.mjs'),
      "export const docs = {name: 'Text', description: 'Text.', keywords: ['clamp'], props: []};\n",
    );
    fs.writeFileSync(
      path.join(coreDir, 'src', 'Text', 'Text.tsx'),
      'export function Text() { return null; }\n',
    );
  });

  afterAll(() => {
    fs.rmSync(cardDir, {recursive: true, force: true});
  });

  it(
    'keeps a suggested component whose search card lists the keyword ahead of the hint',
    async () => {
      const error = await failure(component('LineClamp', {cwd: cardDir}));
      expect(error.code).toBe('ERR_UNKNOWN_COMPONENT');
      expect(error.suggestions?.[0]?.name).toBe('Text');
    },
    SLOW,
  );
});
