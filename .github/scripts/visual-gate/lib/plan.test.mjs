// Copyright (c) Meta Platforms, Inc. and affiliates.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {describe, expect, it} from 'vitest';

import {
  acceptedVisualThemes,
  accountBaseline,
  baselineVisualStories,
  buildPlan,
  canonicalBaselineStories,
  createReleasePlan,
  emptyVisualPlanMessage,
  exceedsPrVisualShotLimit,
  existingComponentBaselinePlan,
  probeBaselineStories,
  readStoryIndex,
  readThemeCatalog,
  representativeStories,
  resolvePrVisualTotalShotLimit,
  shotKey,
  storiesInPackages,
  summarizeBaselineAccounting,
  uncoveredTargets,
  visualComponentScope,
} from './plan.mjs';

const story = (value, packageName = '@astryxdesign/core', stableVisual = true) => ({
  tags: [],
  packageName,
  packageNames: [packageName],
  stableVisual,
  ...value,
});
const stories = [
  story({id: 'core-button--primary', title: 'Core/Button', name: 'Primary', component: 'Button'}),
  story({id: 'core-button--default', title: 'Core/Button', name: 'Default', component: 'Button'}),
  story({id: 'core-badge--solid', title: 'Core/Badge', name: 'Solid', component: 'Badge'}),
];

const targets = [
  {key: 'button', className: 'astryx-button', component: 'Button', props: ['variant:primary'], states: []},
  {key: 'badge', className: 'astryx-badge', component: 'Badge', props: [], states: []},
  {key: 'tooltip', className: 'astryx-tooltip', component: 'Tooltip', props: [], states: []},
];

const themeOverrides = {
  neutral: {button: ['base']},
  y2k: {button: ['base', 'variant:primary'], badge: ['base']},
};

describe('storiesInPackages', () => {
  const mixed = [
    ...stories,
    story({id: 'lab-stat--default', title: 'Lab/Stat', name: 'Default', component: 'Stat'}, '@astryxdesign/lab', false),
    story({id: 'charts-bar--default', title: 'Charts/Bar', name: 'Default', component: 'Bar'}, '@astryxdesign/charts', false),
  ];

  it('keeps only the stable Storybook package groups', () => {
    expect(storiesInPackages(mixed, ['Core']).map(story => story.id)).toEqual(
      stories.map(story => story.id),
    );
  });

  it('allows an explicit all-packages audit without changing the release default', () => {
    expect(storiesInPackages(mixed, ['*'])).toEqual(mixed);
  });
});

describe('canonicalBaselineStories', () => {
  const owners = {groups: ['Core'], packages: ['Core']};

  it('keeps only canonical title groups when no story declares a component', () => {
    const mixed = [
      ...stories,
      story({
        id: 'foundations-button--default',
        title: 'Foundations/Button',
        name: 'Default',
        component: 'Button',
      }),
      story({
        id: 'lab-button--default',
        title: 'Lab/Button',
        name: 'Default',
        component: 'Button',
      }),
    ];
    expect(
      canonicalBaselineStories(mixed, owners).map(story => story.id),
    ).toEqual(stories.map(story => story.id));
  });

  it('keeps a published component whose only story is titled under another group', () => {
    const resizable = story({
      id: 'lab-resizable--horizontal-split',
      title: 'Lab/Resizable',
      name: 'Horizontal Split',
      component: 'Resizable',
      componentPackage: '@astryxdesign/core',
    });
    expect(
      canonicalBaselineStories([...stories, resizable], owners).map(
        story => story.id,
      ),
    ).toContain('lab-resizable--horizontal-split');
  });

  it('drops a canary component even when its story is titled under a canonical group', () => {
    const labInCore = story(
      {
        id: 'core-stat--default',
        title: 'Core/Stat',
        name: 'Default',
        component: 'Stat',
        componentPackage: '@astryxdesign/lab',
      },
      '@astryxdesign/lab',
      false,
    );
    expect(
      canonicalBaselineStories([...stories, labInCore], owners).map(
        story => story.id,
      ),
    ).toEqual(stories.map(story => story.id));
  });

  it('allows an explicit all-groups audit without changing the release default', () => {
    expect(canonicalBaselineStories(stories, {...owners, groups: ['*']})).toEqual(
      stories,
    );
  });
});

describe('representativeStories', () => {
  it('prefers a conventionally named story over source order', () => {
    expect(representativeStories(stories).get('Button').id).toBe('core-button--default');
  });

  it('falls back to the first story when no name is conventional', () => {
    expect(representativeStories(stories).get('Badge').id).toBe('core-badge--solid');
  });
});

describe('existingComponentBaselinePlan', () => {
  it('drops only component-selected keys that have no accepted baseline', () => {
    const plan = [
      {key: 'component-existing', reasons: ['component']},
      {key: 'component-new', reasons: ['component', 'theme:y2k']},
      {key: 'theme-new', reasons: ['component', 'changed-theme:y2k']},
      {key: 'probe-new', reasons: ['probe']},
    ];
    expect(
      existingComponentBaselinePlan(plan, {
        shots: {'component-existing': {}},
      }).map(shot => shot.key),
    ).toEqual(['component-existing', 'theme-new', 'probe-new']);
  });
});

describe('acceptedVisualThemes', () => {
  it('uses stable baseline themes and always includes the stable default', () => {
    expect(
      acceptedVisualThemes(
        {shots: {a: {theme: 'y2k'}, b: {theme: 'probe'}}},
        {
          neutral: {stableVisual: true},
          probe: {stableVisual: false},
          y2k: {stableVisual: true},
        },
        'neutral',
      ),
    ).toEqual(['neutral', 'y2k']);
  });
});

describe('baselineVisualStories', () => {
  it('reuses every current story with an accepted contract for changed themes', () => {
    const selected = baselineVisualStories(stories, {
      shots: {
        button: {storyId: 'core-button--default', theme: 'neutral'},
        badge: {storyId: 'core-badge--solid', theme: 'y2k'},
        deleted: {storyId: 'core-gone--default', theme: 'neutral'},
      },
    });
    expect(selected.map(story => story.id)).toEqual([
      'core-badge--solid',
      'core-button--default',
    ]);
  });
});

describe('resolvePrVisualTotalShotLimit', () => {
  it('caps broad plans at the review limit and scoped plans at the safety limit', () => {
    const base = {
      configuredLimit: 240,
      explicitMaxShots: null,
      safetyLimit: 5000,
      tiers: [],
    };
    expect(
      resolvePrVisualTotalShotLimit({
        ...base,
        components: [],
        matrixThemes: [],
      }),
    ).toBe(240);
    expect(
      resolvePrVisualTotalShotLimit({
        ...base,
        tiers: ['surface'],
        components: ['Button'],
        matrixThemes: [],
      }),
    ).toBe(240);
    expect(
      resolvePrVisualTotalShotLimit({
        ...base,
        tiers: ['component'],
        components: ['Button'],
        matrixThemes: [],
      }),
    ).toBe(5000);
    expect(
      resolvePrVisualTotalShotLimit({
        ...base,
        tiers: ['theme-matrix'],
        components: [],
        matrixThemes: ['neutral'],
      }),
    ).toBe(5000);
    expect(
      resolvePrVisualTotalShotLimit({
        ...base,
        explicitMaxShots: '17',
        tiers: ['theme-matrix'],
        components: [],
        matrixThemes: ['neutral'],
      }),
    ).toBe(17);
    expect(
      resolvePrVisualTotalShotLimit({
        ...base,
        explicitMaxShots: '6000',
        tiers: ['theme-matrix'],
        components: [],
        matrixThemes: ['neutral'],
      }),
    ).toBe(5000);
    expect(() =>
      resolvePrVisualTotalShotLimit({
        ...base,
        explicitMaxShots: 'not-a-number',
        tiers: [],
        components: [],
        matrixThemes: [],
      }),
    ).toThrow(/non-negative integer/);
  });
});

describe('exceedsPrVisualShotLimit', () => {
  it('allows the exact configured ceiling and rejects one more', () => {
    expect(exceedsPrVisualShotLimit(240, 240)).toBe(false);
    expect(exceedsPrVisualShotLimit(241, 240)).toBe(true);
  });
});

describe('emptyVisualPlanMessage', () => {
  it('names the scope that planned nothing and the one path that seeds frames', () => {
    expect(emptyVisualPlanMessage('Component scope Resizable')).toMatch(
      /^Component scope Resizable planned no shots;.*manual baseline workflow\.$/,
    );
  });
});

describe('buildPlan', () => {
  it('photographs one story per component in the default theme for the surface tier', () => {
    const plan = buildPlan({stories, targets, themeOverrides, defaultTheme: 'neutral', tiers: ['surface']});
    expect(plan.map(shot => shot.key).sort()).toEqual([
      'core-badge--solid__neutral-dark',
      'core-badge--solid__neutral-light',
      'core-button--default__neutral-dark',
      'core-button--default__neutral-light',
    ]);
  });

  it('keeps tagged visual contracts in the neutral surface plan', () => {
    const tagged = [
      ...stories,
      story({
        id: 'core-button--separator',
        title: 'Core/Button',
        name: 'Separator',
        component: 'Button',
        tags: ['visual-baseline'],
      }),
      story({
        id: 'core-button--variants',
        title: 'Core/Button',
        name: 'Variants',
        component: 'Button',
        tags: ['visual-theme-matrix'],
      }),
    ];
    const plan = buildPlan({
      stories: tagged,
      targets,
      themeOverrides,
      defaultTheme: 'neutral',
      tiers: ['surface'],
    });
    expect(new Set(plan.map(shot => shot.storyId))).toEqual(
      new Set([
        'core-button--default',
        'core-badge--solid',
        'core-button--separator',
        'core-button--variants',
      ]),
    );
    expect(new Set(plan.map(shot => shot.theme))).toEqual(new Set(['neutral']));
  });

  it('keeps matrix-tagged stories in the probe baseline', () => {
    const tagged = [
      ...stories,
      story({
        id: 'core-button--variants',
        title: 'Core/Button',
        name: 'Variants',
        component: 'Button',
        tags: ['visual-theme-matrix'],
      }),
    ];
    const plan = buildPlan({
      stories: tagged,
      targets,
      themeOverrides,
      observations: {},
      defaultTheme: 'neutral',
      tiers: ['probe'],
      probeTheme: 'probe',
    });
    expect(plan.map(shot => shot.key)).toEqual([
      'core-button--variants__probe-dark',
      'core-button--variants__probe-light',
    ]);
  });

  describe('the probe cover is a fixed point', () => {
    const target = key => ({key, className: `astryx-${key}`, component: 'Badge', props: [], states: []});
    const badge = (id, name) => story({id, title: 'Core/Badge', name, component: 'Badge'});
    const plannedStories = ({stories: list, targets: wanted, observations, baselineStories}) => [
      ...new Set(
        buildPlan({
          stories: list,
          targets: wanted,
          themeOverrides: {},
          observations,
          defaultTheme: 'neutral',
          tiers: ['probe'],
          probeTheme: 'probe',
          baselineStories,
        }).map(shot => shot.storyId),
      ),
    ].sort();
    const cases = {
      'a baselined story and a wider one a new target needs': {
        stories: [badge('core-badge--solid', 'Solid'), badge('core-badge--wide', 'Wide')],
        targets: ['badge', 'tooltip'].map(target),
        observations: {
          'core-badge--solid': {badge: ['base']},
          'core-badge--wide': {badge: ['base'], tooltip: ['base']},
        },
        baselineStories: new Set(['core-badge--solid']),
      },
      'two baselined stories and a wider newcomer': {
        stories: ['first', 'second', 'wider'].map(name => badge(`core-badge--${name}`, name)),
        targets: ['a', 'b', 'c', 'd'].map(target),
        observations: {
          'core-badge--first': {a: ['base'], b: ['base']},
          'core-badge--second': {c: ['base'], d: ['base']},
          'core-badge--wider': {a: ['base'], b: ['base'], c: ['base']},
        },
        baselineStories: new Set(['core-badge--first', 'core-badge--second']),
      },
      'a baselined cover and a story newly tagged into the theme matrix': {
        stories: [
          badge('core-badge--first', 'First'),
          badge('core-badge--second', 'Second'),
          {...badge('core-badge--matrix', 'Matrix'), tags: ['visual-theme-matrix']},
        ],
        targets: ['a', 'b', 'c'].map(target),
        observations: {
          'core-badge--first': {a: ['base'], b: ['base']},
          'core-badge--second': {c: ['base']},
          'core-badge--matrix': {a: ['base'], b: ['base'], c: ['base']},
        },
        baselineStories: new Set(['core-badge--first', 'core-badge--second']),
      },
      'no baseline': {
        stories: ['first', 'second', 'wider'].map(name => badge(`core-badge--${name}`, name)),
        targets: ['a', 'b', 'c', 'd'].map(target),
        observations: {
          'core-badge--first': {a: ['base'], b: ['base']},
          'core-badge--second': {c: ['base'], d: ['base']},
          'core-badge--wider': {a: ['base'], b: ['base'], c: ['base']},
        },
        baselineStories: new Set(),
      },
    };

    it.each(Object.entries(cases))(
      'plans the same stories when its own plan is the baseline: %s',
      (_label, fixture) => {
        const once = plannedStories(fixture);
        const again = plannedStories({...fixture, baselineStories: new Set(once)});
        expect(again).toEqual(once);
      },
    );
  });

  describe('the probe cover keeps the baseline it already has', () => {
    const target = key => ({key, className: `astryx-${key}`, component: 'Badge', props: [], states: []});
    const four = ['a', 'b', 'c', 'd'].map(target);
    const badge = (id, name) => story({id, title: 'Core/Badge', name, component: 'Badge'});
    const first = badge('core-badge--first', 'First');
    const second = badge('core-badge--second', 'Second');
    const wider = badge('core-badge--wider', 'Wider');
    const coverOf = ({stories: list, observations, baselineStories}) => [
      ...new Set(
        buildPlan({
          stories: list,
          targets: four,
          themeOverrides: {},
          observations,
          defaultTheme: 'neutral',
          tiers: ['probe'],
          probeTheme: 'probe',
          baselineStories,
        }).map(shot => shot.storyId),
      ),
    ].sort();

    it('keeps the baselined stories when a wider story arrives that they still cover', () => {
      // The baseline covers a+b and c+d. A new story renders a, b and c: the
      // greedy cover alone would take it first and move the plan.
      const observations = {
        'core-badge--first': {a: ['base'], b: ['base']},
        'core-badge--second': {c: ['base'], d: ['base']},
        'core-badge--wider': {a: ['base'], b: ['base'], c: ['base']},
      };
      expect(
        coverOf({
          stories: [first, second, wider],
          observations,
          baselineStories: new Set(['core-badge--first', 'core-badge--second']),
        }),
      ).toEqual(['core-badge--first', 'core-badge--second']);
    });

    it('drops a baselined story that renders no target and fills what it lost', () => {
      const observations = {
        'core-badge--first': {},
        'core-badge--second': {c: ['base'], d: ['base']},
        'core-badge--wider': {a: ['base'], b: ['base'], c: ['base']},
      };
      expect(
        coverOf({
          stories: [first, second, wider],
          observations,
          baselineStories: new Set(['core-badge--first', 'core-badge--second']),
        }),
      ).toEqual(['core-badge--second', 'core-badge--wider']);
    });

    it('takes the widest story first when there is no baseline', () => {
      const observations = {
        'core-badge--first': {a: ['base'], b: ['base']},
        'core-badge--second': {c: ['base'], d: ['base']},
        'core-badge--wider': {a: ['base'], b: ['base'], c: ['base']},
      };
      expect(coverOf({stories: [first, second, wider], observations})).toEqual([
        'core-badge--second',
        'core-badge--wider',
      ]);
    });
  });

  describe('the probe cover between stories that tie', () => {
    const badgeTarget = [{key: 'badge', className: 'astryx-badge', component: 'Badge', props: [], states: []}];
    const solid = story({id: 'core-badge--solid', title: 'Core/Badge', name: 'Solid', component: 'Badge'});
    // A story added later that renders the same targets as the one already
    // in the baseline, and comes first in the story index.
    const added = story({id: 'core-badge--added-later', title: 'Core/Badge', name: 'Added Later', component: 'Badge'});
    const observations = {
      'core-badge--solid': {badge: ['base']},
      'core-badge--added-later': {badge: ['base']},
    };
    const probeKeys = (list, extra = {}) =>
      buildPlan({
        stories: list,
        targets: badgeTarget,
        themeOverrides: {},
        observations,
        defaultTheme: 'neutral',
        tiers: ['probe'],
        probeTheme: 'probe',
        ...extra,
      }).map(shot => shot.key);

    it('keeps the story already in the baseline when a new story ties with it', () => {
      const baselineStories = new Set(['core-badge--solid']);
      const kept = ['core-badge--solid__probe-dark', 'core-badge--solid__probe-light'];
      expect(probeKeys([added, solid], {baselineStories})).toEqual(kept);
      expect(probeKeys([solid, added], {baselineStories})).toEqual(kept);
    });

    it('picks the same story whatever the story index order, with no baseline', () => {
      const first = ['core-badge--added-later__probe-dark', 'core-badge--added-later__probe-light'];
      expect(probeKeys([solid, added])).toEqual(first);
      expect(probeKeys([added, solid])).toEqual(first);
    });

    it('reads the baselined probe stories from the accepted manifest', () => {
      const manifest = {
        shots: {
          'core-badge--solid__probe-dark': {storyId: 'core-badge--solid', theme: 'probe'},
          'core-badge--solid__neutral-dark': {storyId: 'core-badge--solid', theme: 'neutral'},
          'core-button--primary__neutral-light': {storyId: 'core-button--primary', theme: 'neutral'},
        },
      };
      expect(probeBaselineStories(manifest, 'probe')).toEqual(new Set(['core-badge--solid']));
      expect(probeBaselineStories({}, 'probe')).toEqual(new Set());
    });

    it('lets a wider story a new target needs replace the baselined story it makes redundant', () => {
      const wide = story({id: 'core-badge--wide', title: 'Core/Badge', name: 'Wide', component: 'Badge'});
      const keys = buildPlan({
        stories: [solid, wide],
        targets: [...badgeTarget, {key: 'tooltip', className: 'astryx-tooltip', component: 'Tooltip', props: [], states: []}],
        themeOverrides: {},
        observations: {'core-badge--solid': {badge: ['base']}, 'core-badge--wide': {badge: ['base'], tooltip: ['base']}},
        defaultTheme: 'neutral',
        tiers: ['probe'],
        probeTheme: 'probe',
        baselineStories: new Set(['core-badge--solid']),
      }).map(shot => shot.key);
      expect(keys).toEqual(['core-badge--wide__probe-dark', 'core-badge--wide__probe-light']);
    });
  });

  it('adds a shot for every theme that overrides a component the story renders', () => {
    const plan = buildPlan({stories, targets, themeOverrides, defaultTheme: 'neutral', tiers: ['theme-matrix']});
    const y2k = plan.filter(shot => shot.theme === 'y2k').map(shot => shot.key);
    expect(y2k).toContain('core-button--default__y2k-light');
    expect(y2k).toContain('core-badge--solid__y2k-dark');
  });

  it('restricts the theme matrix to changed shipped themes', () => {
    const plan = buildPlan({
      stories,
      targets,
      themeOverrides,
      defaultTheme: 'neutral',
      tiers: ['theme-matrix'],
      matrixThemes: ['y2k'],
      themeStories: stories,
    });
    expect(new Set(plan.map(shot => shot.theme))).toEqual(new Set(['y2k']));
    expect(new Set(plan.map(shot => shot.storyId))).toEqual(
      new Set(stories.map(story => story.id)),
    );
    expect(plan.map(shot => shot.key)).toContain('core-badge--solid__y2k-light');
  });

  it('keeps every shipped theme for touched Core components even when the matrix is scoped', () => {
    const plan = buildPlan({
      stories,
      targets,
      themeOverrides,
      defaultTheme: 'neutral',
      tiers: ['component', 'theme-matrix'],
      components: ['Button'],
      componentThemes: ['neutral', 'y2k'],
      matrixThemes: ['y2k'],
      themeStories: stories,
    });
    expect(plan.some(shot => shot.theme === 'neutral' && shot.component === 'Button')).toBe(true);
    expect(plan.some(shot => shot.theme === 'y2k' && shot.component === 'Button')).toBe(true);
  });

  it('limits touched components to representative and opted-in stories', () => {
    const componentStories = [
      ...stories,
      story({id: 'core-button--separator', title: 'Core/Button', name: 'Separator', component: 'Button', tags: ['visual-baseline']}),
      story({id: 'core-button--variants', title: 'Core/Button', name: 'Variants', component: 'Button', tags: ['visual-theme-matrix']}),
      story({id: 'core-button--fixture', title: 'Core/Button', name: 'Fixture', component: 'Button'}),
    ];
    const plan = buildPlan({
      stories: componentStories,
      targets,
      themeOverrides,
      defaultTheme: 'neutral',
      tiers: ['component'],
      components: ['Button'],
      componentThemes: ['neutral', 'y2k', 'gothic'],
    });
    expect(new Set(plan.map(shot => shot.storyId))).toEqual(
      new Set([
        'core-button--default',
        'core-button--separator',
        'core-button--variants',
      ]),
    );
    expect(plan).toHaveLength(14);
    expect(
      plan
        .filter(shot => shot.storyId === 'core-button--separator')
        .map(shot => shot.theme),
    ).toEqual(['neutral', 'neutral']);
    expect(
      new Set(
        plan
          .filter(shot => shot.storyId === 'core-button--variants')
          .map(shot => shot.theme),
      ),
    ).toEqual(new Set(['gothic', 'neutral', 'y2k']));
  });

  it('fails closed when a touched component has no stable representative', () => {
    expect(() =>
      buildPlan({
        stories,
        targets,
        themeOverrides,
        defaultTheme: 'neutral',
        tiers: ['component'],
        components: ['Button', 'Missing'],
        componentThemes: ['neutral'],
      }),
    ).toThrow(/Missing/);
  });

  it('records why a shot is in the plan, merging the reasons of a shot both tiers want', () => {
    const plan = buildPlan({stories, targets, themeOverrides, defaultTheme: 'neutral', tiers: ['surface', 'theme-matrix']});
    const shot = plan.find(candidate => candidate.key === 'core-button--default__neutral-light');
    expect(shot.reasons).toEqual(['surface', 'theme:neutral:button']);
  });

  it('captures every story, not just the representative, in the full tier', () => {
    const plan = buildPlan({stories, targets, themeOverrides, defaultTheme: 'neutral', tiers: ['full']});
    expect(plan.filter(shot => shot.component === 'Button' && shot.mode === 'light')).toHaveLength(2);
  });

  it('skips a target whose component has no story rather than planning an unshootable shot', () => {
    const plan = buildPlan({
      stories,
      targets,
      themeOverrides: {gothic: {tooltip: ['base']}},
      defaultTheme: 'neutral',
      tiers: ['theme-matrix'],
    });
    expect(plan).toEqual([]);
  });

  it('is deterministic — same input, same order', () => {
    const args = {stories, targets, themeOverrides, defaultTheme: 'neutral', tiers: ['surface', 'theme-matrix']};
    expect(buildPlan(args)).toEqual(buildPlan(args));
  });
});

describe('shotKey', () => {
  it('stays filesystem-safe', () => {
    expect(shotKey({storyId: 'core-a/b--c d', theme: 'y2k', mode: 'light'})).toBe('core-a_b--c_d__y2k-light');
  });
});

describe('readStoryIndex package metadata', () => {
  function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-index-'));
    for (const [dir, manifest] of [
      ['packages/core', {name: '@astryxdesign/core'}],
      ['packages/charts', {name: '@astryxdesign/charts', private: true, astryx: {canaryOnly: true}}],
      ['packages/lab', {name: '@astryxdesign/lab', private: true, astryx: {canaryOnly: true}}],
      ['packages/themes/neutral', {name: '@astryxdesign/theme-neutral', private: false}],
      ['packages/themes/probe', {name: '@astryxdesign/theme-probe', private: true}],
    ]) {
      fs.mkdirSync(path.join(root, dir), {recursive: true});
      fs.writeFileSync(path.join(root, dir, 'package.json'), JSON.stringify(manifest));
    }
    const storybook = path.join(root, 'apps/storybook');
    const dist = path.join(storybook, 'dist');
    fs.mkdirSync(path.join(storybook, 'stories'), {recursive: true});
    fs.mkdirSync(dist);
    fs.writeFileSync(path.join(storybook, 'stories/Composite.stories.tsx'), "import {Table} from '@astryxdesign/core/Table';");
    fs.writeFileSync(path.join(storybook, 'stories/Dune.stories.tsx'), "import {Table} from '@astryxdesign/core/Table';");
    fs.writeFileSync(path.join(storybook, 'stories/Lab.stories.tsx'), "import {Thing} from '@astryxdesign/lab'; import {Button} from '@astryxdesign/core/Button';");
    fs.writeFileSync(path.join(storybook, 'stories/CoreMixed.stories.tsx'), "import {Thing} from '@astryxdesign/lab'; import {Layer} from '@astryxdesign/core/Layer';");
    fs.writeFileSync(path.join(storybook, 'stories/Probe.stories.tsx'), "import {Button} from '@astryxdesign/core/Button';");
    fs.writeFileSync(path.join(dist, 'index.json'), JSON.stringify({entries: {
      core: {type: 'story', id: 'core-button--default', title: 'Core/Button', name: 'Default', componentPath: '../../packages/core/src/Button/index.ts', importPath: './stories/Button.stories.tsx'},
      composite: {type: 'story', id: 'core-composite--default', title: 'Core/Composite', name: 'Default', importPath: './stories/Composite.stories.tsx'},
      charts: {type: 'story', id: 'charts-bar--default', title: 'Charts/Bar', name: 'Default', componentPath: '@astryxdesign/charts/Bar', importPath: './stories/Bar.stories.tsx'},
      lab: {type: 'story', id: 'lab-thing--default', title: 'Lab/Thing', name: 'Default', importPath: './stories/Lab.stories.tsx'},
      mixed: {type: 'story', id: 'core-layer--default', title: 'Core/Layer', name: 'Default', importPath: './stories/CoreMixed.stories.tsx'},
      probe: {type: 'story', id: 'core-probe--default', title: 'Core/Themes/Probe Theme', name: 'Default', importPath: './stories/Probe.stories.tsx'},
      prOnly: {type: 'story', id: 'core-new--default', title: 'Core/New', name: 'Default', importPath: './stories/NewPrOnly.stories.tsx'},
      // A Core component whose only story sits under another title group, and a
      // template page that merely composes Core components.
      elsewhere: {type: 'story', id: 'lab-resizable--split', title: 'Lab/Resizable', name: 'Split', componentPath: '../../packages/core/src/Resizable/index.ts', importPath: './stories/Resizable.stories.tsx'},
      template: {type: 'story', id: 'dune--overview', title: 'Dune', name: 'Overview', importPath: './stories/Dune.stories.tsx'},
      skipped: {type: 'story', id: 'core-skip--default', title: 'Core/Skip', name: 'Default', tags: ['no-visual']},
    }}));
    return {root, dist};
  }

  it('uses component paths or generated import paths, then package.json eligibility', () => {
    const {root, dist} = fixture();
    try {
      const indexed = readStoryIndex(dist, [], root);
      expect(indexed.find(value => value.id === 'core-button--default')).toMatchObject({packageName: '@astryxdesign/core', stableVisual: true});
      expect(indexed.find(value => value.id === 'core-composite--default')).toMatchObject({packageNames: ['@astryxdesign/core'], stableVisual: true});
      expect(indexed.find(value => value.id === 'charts-bar--default')).toMatchObject({packageName: '@astryxdesign/charts', stableVisual: false});
      expect(indexed.find(value => value.id === 'lab-thing--default')).toMatchObject({packageName: '@astryxdesign/lab', stableVisual: false});
      expect(indexed.find(value => value.id === 'core-layer--default')).toMatchObject({packageName: '@astryxdesign/core', stableVisual: true});
      expect(indexed.find(value => value.id === 'core-probe--default')).toMatchObject({packageName: '@astryxdesign/theme-probe', stableVisual: false});
      expect(indexed.find(value => value.id === 'core-new--default')).toMatchObject({packageName: '@astryxdesign/core', packageNames: ['@astryxdesign/core'], stableVisual: true});
      expect(indexed.some(value => value.id === 'core-skip--default')).toBe(false);
    } finally {
      fs.rmSync(root, {recursive: true, force: true});
    }
  });

  it('resolves canonical ownership from the declared component, not the title group', () => {
    const {root, dist} = fixture();
    try {
      const indexed = readStoryIndex(dist, [], root);
      expect(indexed.find(value => value.id === 'lab-resizable--split')).toMatchObject({
        component: 'Resizable',
        packageName: '@astryxdesign/core',
        componentPackage: '@astryxdesign/core',
      });
      expect(indexed.find(value => value.id === 'dune--overview')).toMatchObject({
        packageName: '@astryxdesign/core',
        componentPackage: null,
      });
      const canonical = canonicalBaselineStories(
        storiesInPackages(indexed, ['Core']),
        {groups: ['Core'], packages: ['Core']},
      ).map(value => value.id);
      // A published Core component keeps its frames wherever its story is
      // titled; a template page that only imports Core still owns none.
      expect(canonical).toContain('lab-resizable--split');
      expect(canonical).not.toContain('dune--overview');
      expect(canonical).not.toContain('charts-bar--default');
    } finally {
      fs.rmSync(root, {recursive: true, force: true});
    }
  });

  it('allows the private probe theme only as an explicit baseline fixture', () => {
    const {root} = fixture();
    try {
      expect(readThemeCatalog(root).probe).toMatchObject({
        stableVisual: false,
        coverageFixture: false,
      });
      expect(readThemeCatalog(root, ['probe']).probe).toMatchObject({
        stableVisual: true,
        coverageFixture: true,
      });
    } finally {
      fs.rmSync(root, {recursive: true, force: true});
    }
  });

  it('accounts for a live-shaped 974-key baseline without dropping legacy keys', () => {
    const {root} = fixture();
    for (const [dir, manifest] of [
      ['packages/vega', {name: '@astryxdesign/vega', private: true, astryx: {canaryOnly: true}}],
      ['packages/richtext', {name: '@astryxdesign/richtext', private: true, astryx: {canaryOnly: true}}],
    ]) {
      fs.mkdirSync(path.join(root, dir), {recursive: true});
      fs.writeFileSync(path.join(root, dir, 'package.json'), JSON.stringify(manifest));
    }
    const baselineShots = {};
    const current = [];
    for (let index = 0; index < 882; index += 1) {
      const storyId = `core-story-${index}`;
      const key = `${storyId}__neutral-light`;
      baselineShots[key] = {
        storyId,
        title: `Core/Story ${index}`,
        component: `Story${index}`,
        theme: 'neutral',
        mode: 'light',
      };
      current.push({
        id: storyId,
        packageName: '@astryxdesign/core',
        packageNames: ['@astryxdesign/core'],
        stableVisual: true,
      });
    }
    const excluded = [
      ['Charts', 28],
      ['Lab', 60],
      ['Richtext', 2],
      ['Vega', 2],
    ];
    for (const [title, count] of excluded) {
      for (let index = 0; index < count; index += 1) {
        const storyId = `${title.toLowerCase()}-story-${index}`;
        baselineShots[`${storyId}__neutral-light`] = {
          storyId,
          title: `${title}/Story ${index}`,
          component: `Story${index}`,
          theme: 'neutral',
          mode: 'light',
        };
      }
    }
    try {
      const account = accountBaseline(
        {shots: baselineShots},
        current,
        readThemeCatalog(root),
        root,
      );
      const summary = summarizeBaselineAccounting(
        account,
        current.map(story => ({key: `${story.id}__neutral-light`})),
      );
      expect(summary).toEqual({
        total: 974,
        plannedCurrentStable: 882,
        policyExcluded: 0,
        intentionallyExcluded: 92,
        preservedLegacy: 0,
        unclassified: 0,
      });
      expect(Object.keys(account.manifest.shots)).toHaveLength(882);
    } finally {
      fs.rmSync(root, {recursive: true, force: true});
    }
  });

  it('classifies accepted but noncanonical keys as policy exclusions', () => {
    const {root} = fixture();
    try {
      const account = accountBaseline(
        {
          shots: {
            'core-button--default__neutral-light': {
              storyId: 'core-button--default',
              title: 'Core/Button',
              component: 'Button',
              theme: 'neutral',
              mode: 'light',
            },
          },
        },
        [
          {
            id: 'core-button--default',
            packageName: '@astryxdesign/core',
            packageNames: ['@astryxdesign/core'],
            stableVisual: true,
          },
        ],
        readThemeCatalog(root),
        root,
      );
      expect(summarizeBaselineAccounting(account, [])).toMatchObject({
        total: 1,
        plannedCurrentStable: 0,
        policyExcluded: 1,
        unclassified: 0,
      });
    } finally {
      fs.rmSync(root, {recursive: true, force: true});
    }
  });

  it('preserves a deleted accepted story as a release decision', () => {
    const {root} = fixture();
    try {
      const account = accountBaseline(
        {
          shots: {
            'core-gone--default__neutral-light': {
              storyId: 'core-gone--default',
              title: 'Core/Gone',
              component: 'Gone',
              theme: 'neutral',
              mode: 'light',
            },
          },
        },
        [],
        readThemeCatalog(root),
        root,
      );
      expect(summarizeBaselineAccounting(account, [])).toEqual({
        total: 1,
        plannedCurrentStable: 0,
        policyExcluded: 0,
        intentionallyExcluded: 0,
        preservedLegacy: 1,
        unclassified: 0,
      });
      expect(account.manifest.shots).toHaveProperty(
        'core-gone--default__neutral-light',
      );
    } finally {
      fs.rmSync(root, {recursive: true, force: true});
    }
  });

  it('reports exact unclassified legacy keys without dropping them silently', () => {
    const {root} = fixture();
    try {
      const account = accountBaseline(
        {
          shots: {
            'unknown--default__neutral-light': {
              storyId: 'unknown--default',
              title: 'Unknown/Thing',
              component: 'Missing',
              theme: 'neutral',
              mode: 'light',
            },
          },
        },
        [],
        readThemeCatalog(root),
        root,
      );
      expect(summarizeBaselineAccounting(account, [])).toEqual({
        total: 1,
        plannedCurrentStable: 0,
        policyExcluded: 0,
        intentionallyExcluded: 0,
        preservedLegacy: 0,
        unclassified: 1,
        unclassifiedKeys: ['unknown--default__neutral-light'],
      });
    } finally {
      fs.rmSync(root, {recursive: true, force: true});
    }
  });

  it('canonicalizes release keys and rejects duplicates', () => {
    const shot = {...stories[0], storyId: stories[0].id, key: 'b', theme: 'neutral', mode: 'light', reasons: []};
    expect(createReleasePlan([{...shot, key: 'b'}, {...shot, key: 'a'}]).keys).toEqual(['a', 'b']);
    expect(() => createReleasePlan([shot, shot])).toThrow(/repeats/);
  });
});

describe('uncoveredTargets', () => {
  it('names targets no shot can reach', () => {
    const plan = buildPlan({stories, targets, themeOverrides, defaultTheme: 'neutral', tiers: ['surface']});
    expect(uncoveredTargets(targets, plan)).toEqual([{key: 'tooltip', component: 'Tooltip'}]);
  });
});

describe('visualComponentScope (spec:AST-030 FR13)', () => {
  it('audits every touched component and each reverse-dependent folder with a stable story', () => {
    expect(
      visualComponentScope(stories, ['Button'], ['Badge', 'Button', 'Tooltip', 'Badge']),
    ).toEqual({components: ['Button', 'Badge'], dropped: ['Tooltip']});
  });

  it('audits reverse dependents alone when nothing was touched directly', () => {
    expect(visualComponentScope(stories, [], ['Badge'])).toEqual({
      components: ['Badge'],
      dropped: [],
    });
  });
});
