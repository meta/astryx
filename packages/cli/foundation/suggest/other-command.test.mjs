// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The lookup commands' shared not-found hint.
 *
 * When `component`, `hook`, `template` or `docs` finds no entry for a name
 * that matches an entry another of those commands reads (exact, folded or
 * last segment; a better tier wins, then command order, and for docs routes
 * the fewest segments, then tree order), that command joins the suggestions
 * right after the own suggestions matching at its tier or a better one. The
 * list never grows: the last suggestion drops, a hint that would come last is
 * left out, and the hint is the only suggestion when the list is empty.
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
import {MATCH_TIER, otherCommand, withOtherCommand} from './other-command.mjs';
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
  /** @param {Parameters<typeof otherCommand>} args */
  const named = (...args) => otherCommand(...args)?.hint ?? null;

  it('names the command for an exact name in any case, with or without spaces and hyphens', () => {
    for (const typed of [
      'ZorbletCard',
      'zorbletcard',
      'zorblet-card',
      'Zorblet Card',
    ]) {
      expect(named(typed, NAMES, 'docs')).toEqual({
        name: 'astryx component ZorbletCard',
        reason: 'a component, not a docs topic',
      });
    }
    expect(named('QuoxleGuide', NAMES, 'hook')).toEqual({
      name: 'astryx docs quoxle-guide',
      reason: 'a docs topic, not a hook',
    });
  });

  it('matches a hook with or without its use prefix', () => {
    const hint = {
      name: 'astryx hook useWobble',
      reason: 'a hook, not a template',
    };
    const hooks = {hooks: ['useWobble']};
    expect(named('use-wobble', hooks, 'template')).toEqual(hint);
    expect(named('Wobble', hooks, 'component')).toEqual({
      ...hint,
      reason: 'a hook, not a component',
    });
  });

  it('prefers a component, then a hook, then a template, then a docs topic', () => {
    expect(named('zorblet', NAMES, 'docs')?.name).toBe(
      'astryx component Zorblet',
    );
    expect(
      named(
        'usewobble',
        {hooks: ['useWobble'], templates: ['use-wobble']},
        'docs',
      )?.name,
    ).toBe('astryx hook useWobble');
    expect(named('glimmer-panel', NAMES, 'component')?.name).toBe(
      'astryx template glimmer-panel',
    );
  });

  it('never names the command that looked', () => {
    expect(named('zorblet', {hooks: ['useZorblet']}, 'component')?.name).toBe(
      'astryx hook useZorblet',
    );
    expect(
      named('glimmer-panel', {docs: ['glimmer-panel']}, 'template')?.name,
    ).toBe('astryx docs glimmer-panel');
    expect(named('quoxle-guide', NAMES, 'docs')).toBeNull();
  });

  it('matches a template by its full path id or its last segment, and names the full id', () => {
    const entries = {templates: ['parts/Frobnic/FrobnicShowcase']};
    const hint = {
      name: 'astryx template parts/Frobnic/FrobnicShowcase',
      reason: 'a template, not a hook',
    };
    for (const typed of [
      'parts/Frobnic/FrobnicShowcase',
      'FrobnicShowcase',
      'frobnic-showcase',
    ]) {
      expect(named(typed, entries, 'hook')).toEqual(hint);
    }
    expect(named('Frobnic', entries, 'hook')).toBeNull();
    expect(named('parts/Frobnic', entries, 'hook')).toBeNull();
  });

  it('prefers a name in any case over a name that matches only without spaces and hyphens', () => {
    const twins = {templates: ['dazzle-deck', 'DazzleDeck']};
    expect(named('DazzleDeck', twins, 'hook')?.name).toBe(
      'astryx template DazzleDeck',
    );
    expect(named('dazzle-deck', twins, 'hook')?.name).toBe(
      'astryx template dazzle-deck',
    );
    const across = {components: ['GlintRow'], docs: ['glint-row']};
    expect(named('glint-row', across, 'hook')?.name).toBe(
      'astryx docs glint-row',
    );
    expect(named('GlintRow', across, 'hook')?.name).toBe(
      'astryx component GlintRow',
    );
    expect(named('glint row', across, 'hook')?.name).toBe(
      'astryx component GlintRow',
    );
  });

  it('gives the tier the entry matches at', () => {
    const entries = {
      components: ['Plinth'],
      hooks: ['usePlinthKit'],
      templates: ['parts/Plinth/plinth-deck'],
    };
    expect(otherCommand('Plinth', entries, 'docs')?.tier).toBe(
      MATCH_TIER.exact,
    );
    expect(otherCommand('plinth-kit', entries, 'docs')?.tier).toBe(
      MATCH_TIER.folded,
    );
    expect(otherCommand('PlinthDeck', entries, 'docs')?.tier).toBe(
      MATCH_TIER.segment,
    );
  });

  it('prefers the docs route closest to the root inside a tier, then tree order', () => {
    const docs = [
      'quiv/api/functions/brindle',
      'quiv/commands/brindle',
      'zell/commands/brindle',
      'quiv/api/functions/sproket-kit',
      'quiv/sproket-kit',
    ];
    expect(named('brindle', {docs}, 'hook')?.name).toBe(
      'astryx docs quiv/commands/brindle',
    );
    expect(named('sproket kit', {docs}, 'component')?.name).toBe(
      'astryx docs quiv/sproket-kit',
    );
    expect(
      named('brindle', {docs: ['brindle-zone', ...docs, 'brindle']}, 'hook')
        ?.name,
    ).toBe('astryx docs brindle');
    expect(
      named(
        'brindle',
        {docs: ['quiv/a/brindle'], templates: ['parts/x/y/brindle']},
        'hook',
      )?.name,
    ).toBe('astryx template parts/x/y/brindle');
  });

  it('prefers a better tier over the command order', () => {
    const entries = {components: ['MosselKit'], docs: ['mossel-kit']};
    expect(named('mossel-kit', entries, 'hook')?.name).toBe(
      'astryx docs mossel-kit',
    );
  });

  it('gives nothing for a near name, a route, or an empty name', () => {
    expect(named('Zorblt', NAMES, 'docs')).toBeNull();
    expect(named('ZorbletCards', NAMES, 'hook')).toBeNull();
    expect(named('components/Zorblet', NAMES, 'docs')).toBeNull();
    expect(named(' - ', NAMES, 'template')).toBeNull();
    expect(named('Zorblet', {}, 'docs')).toBeNull();
  });
});

describe('withOtherCommand', () => {
  const hint = {
    name: 'astryx component Zinnet',
    reason: 'a component, not a docs topic',
  };
  /** @param {number} tier */
  const at = tier => ({hint, tier});
  const list = [
    {name: 'a', reason: 'x'},
    {name: 'b', reason: 'x'},
    {name: 'c', reason: 'x'},
  ];
  const from = /** @type {const} */ ('docs');

  it('puts the hint first and drops the last suggestion when no suggestion matches as well', () => {
    expect(
      withOtherCommand(list, at(MATCH_TIER.exact), 'Zinnet', {from}),
    ).toEqual([hint, list[0], list[1]]);
    const routes = [
      {name: 'guides/icons/zinnet', reason: 'x'},
      {name: 'zinnet-row', reason: 'x'},
    ];
    expect(
      withOtherCommand(routes, at(MATCH_TIER.exact), 'Zinnet', {from}),
    ).toEqual([hint, routes[0]]);
  });

  it('puts the hint right after the last suggestion at its tier or a better one', () => {
    const own = [
      {name: 'zinnet', reason: 'x'},
      {name: 'zinnet-row', reason: 'x'},
      {name: 'Zinnet', reason: 'x'},
      {name: 'other', reason: 'x'},
    ];
    expect(
      withOtherCommand(own, at(MATCH_TIER.exact), 'Zinnet', {from}),
    ).toEqual([own[0], own[1], own[2], hint]);
    expect(
      withOtherCommand(own, at(MATCH_TIER.folded), 'zin-net', {from}),
    ).toEqual([own[0], own[1], own[2], hint]);
  });

  it('matches a suggestion by every name the command ranked it by', () => {
    const own = [
      {name: 'parts/zn/showcase', reason: 'x'},
      {name: 'other', reason: 'x'},
    ];
    const human = new Map([[own[0], ['parts/zn/showcase', 'Zinnet View']]]);
    expect(
      withOtherCommand(own, at(MATCH_TIER.folded), 'Zinnet View', {
        from: 'template',
        namesOf: s => human.get(s) ?? [s.name],
      }),
    ).toEqual([own[0], hint]);
  });

  it('leaves the hint out when every suggestion matches as well', () => {
    const own = [
      {name: 'zinnet', reason: 'x'},
      {name: 'ZINNET', reason: 'x'},
    ];
    expect(
      withOtherCommand(own, at(MATCH_TIER.exact), 'Zinnet', {from}),
    ).toEqual(own);
  });

  it('gives the hint alone for an empty list, or when asked', () => {
    const found = at(MATCH_TIER.exact);
    expect(withOtherCommand([], found, 'Zinnet', {from})).toEqual([hint]);
    expect(withOtherCommand(undefined, found, 'Zinnet', {from})).toEqual([
      hint,
    ]);
    expect(
      withOtherCommand(list, found, 'Zinnet', {from, alone: true}),
    ).toEqual([hint]);
  });

  it('leaves the list alone without a hint', () => {
    expect(withOtherCommand(list, null, 'Zinnet', {from})).toBe(list);
    expect(withOtherCommand(undefined, null, 'Zinnet', {from})).toBeUndefined();
  });
});

/** @type {string} */
let tmpDir;

/**
 * A project whose stand-in Core ships the hook useWobble, and whose one
 * integration ships the component ZorbletCard, the block template
 * glimmer-panel, the page template shimmer-deck and the docs topic
 * quoxle-guide. It also ships the components GlintRow and Plonk, the block
 * parts/Frobnic/FrobnicShowcase under a path id, the twin templates
 * DazzleDeck and dazzle-deck, the page template plonk, the block
 * glint-row-list, the component VexaPanel with the block
 * parts/Vexa/VexaShowcase named "Vexa Panel", and the docs topic glint-row.
 * Its docs tree adds the namespace snerd with the guide snerd/blivet-setup.
 * The template docs phantom-strip (no source) and broken-slab (does not
 * load) are files `astryx template` does not list.
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
  for (const name of ['GlintRow', 'Plonk', 'VexaPanel']) {
    fs.writeFileSync(
      path.join(pkgDir, 'components', `${name}.doc.mjs`),
      `export default {type: 'component', name: '${name}', description: 'A part.', props: []};\n`,
    );
    fs.writeFileSync(
      path.join(pkgDir, 'components', `${name}.tsx`),
      `export function ${name}() { return null; }\n`,
    );
  }
  for (const [stem, type, title = path.basename(stem)] of [
    ['parts/Frobnic/FrobnicShowcase', 'block'],
    ['DazzleDeck', 'block'],
    ['dazzle-deck', 'page'],
    ['plonk', 'page'],
    ['glint-row-list', 'block'],
    ['parts/Vexa/VexaShowcase', 'block', 'Vexa Panel'],
  ]) {
    fs.mkdirSync(path.dirname(path.join(pkgDir, 'templates', stem)), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(pkgDir, 'templates', `${stem}.doc.mjs`),
      `export default {type: '${type}', name: '${title}', description: 'A ${type}.'};\n`,
    );
    fs.writeFileSync(
      path.join(pkgDir, 'templates', `${stem}.tsx`),
      'export default function Fixture() { return null; }\n',
    );
  }
  for (const topic of ['glint-row']) {
    fs.writeFileSync(
      path.join(pkgDir, 'docs', `${topic}.doc.mjs`),
      `export default ${JSON.stringify({
        type: 'generic',
        name: topic,
        title: 'Glint row',
        description: 'Set up a glint row.',
        sections: [
          {title: 'Overview', content: [{type: 'prose', text: 'Use it.'}]},
        ],
      })};\n`,
    );
  }
  fs.writeFileSync(
    path.join(pkgDir, 'docs', 'snerd.doc.mjs'),
    `export default ${JSON.stringify({
      type: 'namespace',
      name: 'snerd',
      title: 'Snerd',
      summary: 'Everything about Snerd.',
      slots: {guides: {title: 'Guides', accepts: {kinds: ['generic']}}},
    })};\n`,
  );
  fs.writeFileSync(
    path.join(pkgDir, 'docs', 'blivet-setup.doc.mjs'),
    `export default ${JSON.stringify({
      type: 'generic',
      name: 'blivet-setup',
      title: 'Blivet setup',
      description: 'Set up a blivet.',
      placement: {parent: 'namespace:snerd', slot: 'guides'},
      sections: [
        {title: 'Overview', content: [{type: 'prose', text: 'Set it up.'}]},
      ],
    })};\n`,
  );
  fs.writeFileSync(
    path.join(pkgDir, 'templates', 'phantom-strip.doc.mjs'),
    "export default {type: 'block', name: 'Phantom strip', description: 'A strip.'};\n",
  );
  fs.writeFileSync(
    path.join(pkgDir, 'templates', 'broken-slab.doc.mjs'),
    "throw new Error('broken');\n",
  );
  fs.writeFileSync(
    path.join(pkgDir, 'templates', 'broken-slab.tsx'),
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
  ['hook', 'FrobnicShowcase', 'astryx template parts/Frobnic/FrobnicShowcase'],
  [
    'hook',
    'parts/Frobnic/FrobnicShowcase',
    'astryx template parts/Frobnic/FrobnicShowcase',
  ],
  ['docs', 'FrobnicShowcase', 'astryx template parts/Frobnic/FrobnicShowcase'],
  [
    'docs',
    'parts/Frobnic/FrobnicShowcase',
    'astryx template parts/Frobnic/FrobnicShowcase',
  ],
  ['hook', 'DazzleDeck', 'astryx template DazzleDeck'],
  ['hook', 'dazzle-deck', 'astryx template dazzle-deck'],
  ['docs', 'DazzleDeck', 'astryx template DazzleDeck'],
  ['docs', 'dazzle-deck', 'astryx template dazzle-deck'],
  ['hook', 'glint-row', 'astryx docs glint-row'],
  ['hook', 'GlintRow', 'astryx component GlintRow'],
  ['hook', 'snerd', 'astryx docs snerd'],
  ['hook', 'blivet-setup', 'astryx docs snerd/blivet-setup'],
  ['component', 'BlivetSetup', 'astryx docs snerd/blivet-setup'],
  ['template', 'blivet setup', 'astryx docs snerd/blivet-setup'],
  ['template', 'snerd/blivet-setup', 'astryx docs snerd/blivet-setup'],
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
    "puts the hint after the command's own suggestions at its tier or a better one",
    async () => {
      // `plonk` is exact, as the component Plonk is: the hint would come
      // last, so it is left out.
      const own = await LOOKUPS.template('Plonk');
      expect(own.code).toBe(CODES.template);
      expect(own.suggestions.map(s => s.name)).toEqual(['plonk']);
      // The block is named "Vexa Panel" exactly; the component only folds.
      const human = await LOOKUPS.template('Vexa Panel');
      expect(human.suggestions[0].name).toBe('parts/Vexa/VexaShowcase');
      expect(
        human.suggestions.some(s => s.name === 'astryx component VexaPanel'),
      ).toBe(false);
      // `glint-row-list` only carries the typed words; the component folds.
      const words = await LOOKUPS.template('Glint Row');
      expect(words.suggestions[0].name).toBe('astryx component GlintRow');
    },
    SLOW,
  );

  it(
    'names only templates `astryx template` lists',
    async () => {
      for (const id of ['phantom-strip', 'broken-slab']) {
        expect((await LOOKUPS.template(id)).code).toBe(CODES.template);
        for (const from of /** @type {const} */ ([
          'component',
          'hook',
          'docs',
        ])) {
          const error = await LOOKUPS[from](id);
          expect(error.code, `${from} ${id}`).toBe(CODES[from]);
          expect(
            (error.suggestions ?? []).some(
              (/** @type {{name: string}} */ s) =>
                s.name === `astryx template ${id}`,
            ),
            `${from} ${id}`,
          ).toBe(false);
        }
      }
    },
    SLOW,
  );

  it(
    'names every docs route, and the hint it names reads',
    async () => {
      for (const [from, typed] of /** @type {const} */ ([
        ['hook', 'blivet-setup'],
        ['component', 'snerd'],
      ])) {
        const error = await LOOKUPS[from](typed);
        const route = error.suggestions[0].name.replace(/^astryx docs /, '');
        await expect(
          docs(route, undefined, {cwd: tmpDir}),
        ).resolves.toBeDefined();
      }
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
