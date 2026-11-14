// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The lookup commands' shared not-found hint.
 *
 * When `component`, `hook`, `template` or `docs` finds no entry for a name
 * that is exactly an entry another of those commands reads, its first
 * suggestion is that command. The list never grows: the hint takes the last
 * suggestion's place, or is the only suggestion when the list is empty.
 *
 * @input  made-up names, and a project whose stand-in Core ships a made-up
 *   hook and whose integration ships a made-up component, template and docs
 *   topic
 * @output assertions on otherCommand, withOtherCommand, and each lookup
 *   command's not-found error for each other command's entry
 * @position foundation/suggest/ beside the module it tests
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {otherCommand, withOtherCommand} from './other-command.mjs';
import {component} from '../../api/component/component.mjs';
import {docs} from '../../api/docs/docs.mjs';
import {hook} from '../../api/hook/hook.mjs';
import {template} from '../../api/template/template.mjs';
import {REPO_ROOT} from '../../test-utils/repo-root.mjs';

const SLOW = 30_000;

const NAMES = {
  components: ['Zorblet', 'ZorbletCard'],
  hooks: ['useWobble', 'useZorblet'],
  templates: ['glimmer-panel', 'wobble'],
  docs: ['quoxle-guide', 'glimmer-panel'],
};

describe('otherCommand', () => {
  it('names the command for an exact name in any case, with or without spaces and hyphens', () => {
    for (const typed of [
      'ZorbletCard',
      'zorbletcard',
      'zorblet-card',
      'Zorblet Card',
    ]) {
      expect(otherCommand(typed, NAMES, 'docs')).toEqual({
        name: 'astryx component ZorbletCard',
        reason: 'a component, not a docs topic',
      });
    }
    expect(otherCommand('QuoxleGuide', NAMES, 'hook')).toEqual({
      name: 'astryx docs quoxle-guide',
      reason: 'a docs topic, not a hook',
    });
  });

  it('matches a hook with or without its use prefix', () => {
    const hint = {
      name: 'astryx hook useWobble',
      reason: 'a hook, not a template',
    };
    expect(otherCommand('use-wobble', NAMES, 'template')).toEqual(hint);
    expect(otherCommand('Wobble', NAMES, 'component')).toEqual({
      ...hint,
      reason: 'a hook, not a component',
    });
  });

  it('prefers a component, then a hook, then a template, then a docs topic', () => {
    expect(otherCommand('zorblet', NAMES, 'docs')?.name).toBe(
      'astryx component Zorblet',
    );
    expect(otherCommand('wobble', NAMES, 'docs')?.name).toBe(
      'astryx hook useWobble',
    );
    expect(otherCommand('glimmer-panel', NAMES, 'component')?.name).toBe(
      'astryx template glimmer-panel',
    );
  });

  it('never names the command that looked', () => {
    expect(otherCommand('zorblet', NAMES, 'component')?.name).toBe(
      'astryx hook useZorblet',
    );
    expect(otherCommand('glimmer-panel', NAMES, 'template')?.name).toBe(
      'astryx docs glimmer-panel',
    );
    expect(otherCommand('quoxle-guide', NAMES, 'docs')).toBeNull();
  });

  it('gives nothing for a near name, a route, or an empty name', () => {
    expect(otherCommand('Zorblt', NAMES, 'docs')).toBeNull();
    expect(otherCommand('ZorbletCards', NAMES, 'hook')).toBeNull();
    expect(otherCommand('components/Zorblet', NAMES, 'docs')).toBeNull();
    expect(otherCommand(' - ', NAMES, 'template')).toBeNull();
    expect(otherCommand('Zorblet', {}, 'docs')).toBeNull();
  });
});

describe('withOtherCommand', () => {
  const hint = {
    name: 'astryx hook useWobble',
    reason: 'a hook, not a template',
  };
  const list = [
    {name: 'a', reason: 'x'},
    {name: 'b', reason: 'x'},
    {name: 'c', reason: 'x'},
  ];

  it('puts the hint first and drops the last suggestion', () => {
    expect(withOtherCommand(list, hint)).toEqual([hint, list[0], list[1]]);
  });

  it('gives the hint alone for an empty list, or when asked', () => {
    expect(withOtherCommand([], hint)).toEqual([hint]);
    expect(withOtherCommand(undefined, hint)).toEqual([hint]);
    expect(withOtherCommand(list, hint, {alone: true})).toEqual([hint]);
  });

  it('leaves the list alone without a hint', () => {
    expect(withOtherCommand(list, null)).toBe(list);
    expect(withOtherCommand(undefined, null)).toBeUndefined();
  });
});

/** @type {string} */
let tmpDir;

/**
 * A project whose stand-in Core ships the hook useWobble, and whose one
 * integration ships the component ZorbletCard, the block template
 * glimmer-panel, the page template shimmer-deck and the docs topic
 * quoxle-guide.
 */
function scaffold() {
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({
      name: 'consumer',
      dependencies: {'@astryxdesign/core': '0.0.0'},
    }),
  );
  fs.writeFileSync(
    path.join(tmpDir, 'astryx.config.mjs'),
    "export default {integrations: ['@acme/widgets']};\n",
  );
  const coreDir = path.join(tmpDir, 'node_modules', '@astryxdesign', 'core');
  fs.mkdirSync(path.join(coreDir, 'src', 'hooks'), {recursive: true});
  fs.writeFileSync(
    path.join(coreDir, 'package.json'),
    JSON.stringify({name: '@astryxdesign/core', version: '0.0.0'}),
  );
  fs.writeFileSync(
    path.join(coreDir, 'src', 'hooks', 'useWobble.doc.mjs'),
    "export const docs = {name: 'useWobble', params: [], returns: []};\n",
  );
  const pkgDir = path.join(tmpDir, 'node_modules', '@acme', 'widgets');
  for (const dir of ['components', 'templates', 'docs']) {
    fs.mkdirSync(path.join(pkgDir, dir), {recursive: true});
  }
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({name: '@acme/widgets', version: '1.0.0'}),
  );
  fs.writeFileSync(
    path.join(pkgDir, 'astryx.integration.mjs'),
    "export default {components: './components', templates: './templates', docs: './docs'};\n",
  );
  fs.writeFileSync(
    path.join(pkgDir, 'components', 'ZorbletCard.doc.mjs'),
    "export default {type: 'component', name: 'ZorbletCard', description: 'A card.', props: []};\n",
  );
  fs.writeFileSync(
    path.join(pkgDir, 'components', 'ZorbletCard.tsx'),
    'export function ZorbletCard() { return null; }\n',
  );
  fs.writeFileSync(
    path.join(pkgDir, 'templates', 'glimmer-panel.doc.mjs'),
    "export default {type: 'block', name: 'Glimmer panel', description: 'A panel.'};\n",
  );
  fs.writeFileSync(
    path.join(pkgDir, 'templates', 'glimmer-panel.tsx'),
    'export default function Fixture() { return null; }\n',
  );
  fs.writeFileSync(
    path.join(pkgDir, 'templates', 'shimmer-deck.doc.mjs'),
    "export default {type: 'page', name: 'Shimmer deck', description: 'A page.'};\n",
  );
  fs.writeFileSync(
    path.join(pkgDir, 'templates', 'shimmer-deck.tsx'),
    'export default function Fixture() { return null; }\n',
  );
  fs.writeFileSync(
    path.join(pkgDir, 'docs', 'quoxle-guide.doc.mjs'),
    `export default ${JSON.stringify({
      type: 'generic',
      name: 'quoxle-guide',
      title: 'Quoxle guide',
      description: 'Set up Quoxle.',
      sections: [
        {title: 'Overview', content: [{type: 'prose', text: 'Install it.'}]},
      ],
    })};\n`,
  );
}

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(REPO_ROOT, '.astryx-other-command-'));
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

/** Each lookup, as its not-found path sees a name. */
const LOOKUPS = {
  component: (/** @type {string} */ name) =>
    failure(component(name, {cwd: tmpDir})),
  hook: (/** @type {string} */ name) => failure(hook(name, {cwd: tmpDir})),
  template: (/** @type {string} */ name) =>
    failure(template(name, {cwd: tmpDir})),
  docs: (/** @type {string} */ name) =>
    failure(docs(name, undefined, {cwd: tmpDir})),
};

const CODES = {
  component: 'ERR_UNKNOWN_COMPONENT',
  hook: 'ERR_UNKNOWN_HOOK',
  template: 'ERR_UNKNOWN_TEMPLATE',
  docs: 'ERR_UNKNOWN_TOPIC',
};

/** For each lookup, a name per other command and the hint it gets. */
const PAIRS = /** @type {const} */ ([
  ['component', 'use-wobble', 'astryx hook useWobble'],
  ['component', 'shimmer-deck', 'astryx template shimmer-deck'],
  ['component', 'quoxle guide', 'astryx docs quoxle-guide'],
  ['hook', 'ZorbletCard', 'astryx component ZorbletCard'],
  ['hook', 'glimmer panel', 'astryx template glimmer-panel'],
  ['hook', 'QuoxleGuide', 'astryx docs quoxle-guide'],
  ['template', 'zorblet-card', 'astryx component ZorbletCard'],
  ['template', 'useWobble', 'astryx hook useWobble'],
  ['template', 'quoxle-guide', 'astryx docs quoxle-guide'],
  ['docs', 'Zorblet Card', 'astryx component ZorbletCard'],
  ['docs', 'wobble', 'astryx hook useWobble'],
  ['docs', 'GlimmerPanel', 'astryx template glimmer-panel'],
]);

describe("each lookup's not-found error for another command's entry", () => {
  it(
    'stays not found and suggests that command first, in the usual shape',
    async () => {
      for (const [from, typed, command] of PAIRS) {
        const error = await LOOKUPS[from](typed);
        expect(error.code, `${from} ${typed}`).toBe(CODES[from]);
        expect(error.suggestions[0].name, `${from} ${typed}`).toBe(command);
        expect(error.suggestions[0].reason).toMatch(/^a .+, not a /);
        for (const suggestion of error.suggestions) {
          expect(Object.keys(suggestion).sort()).toEqual(['name', 'reason']);
        }
      }
    },
    SLOW,
  );

  it(
    "leaves a block to the component lookup's own pointer",
    async () => {
      const error = await LOOKUPS.component('glimmer-panel');
      expect(error.code).toBe('ERR_UNKNOWN_COMPONENT');
      expect(error.message).toContain('astryx template glimmer-panel');
      expect(
        (error.suggestions ?? []).some((/** @type {{name: string}} */ s) =>
          s.name.startsWith('astryx '),
        ),
      ).toBe(false);
    },
    SLOW,
  );

  it(
    'keeps the list length: the hint takes the last place',
    async () => {
      // `zorblet-cards` is no entry, so its list is the plain one.
      const plain = await LOOKUPS.template('zorblet-cards');
      const hinted = await LOOKUPS.template('zorblet-card');
      expect(hinted.suggestions.length).toBe(plain.suggestions.length);
      expect(hinted.suggestions.slice(1)).toEqual(
        plain.suggestions
          .filter(
            (/** @type {{name: string}} */ s) => s.name !== 'zorblet-card',
          )
          .slice(0, hinted.suggestions.length - 1),
      );
    },
    SLOW,
  );

  it(
    'gives no hint for a near name',
    async () => {
      for (const from of /** @type {const} */ ([
        'component',
        'hook',
        'template',
        'docs',
      ])) {
        const error = await LOOKUPS[from]('zorbletcardz');
        expect(error.code).toBe(CODES[from]);
        expect(
          (error.suggestions ?? []).some((/** @type {{name: string}} */ s) =>
            s.name.startsWith('astryx '),
          ),
        ).toBe(false);
      }
    },
    SLOW,
  );
});
