// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file setup-eval.test.ts
 * @input Synthetic measurements
 * @output Failing-first coverage for every strict acceptance dimension
 * @position internal/vibe-tests/setup-test — the scorer's own tests
 */

import {describe, expect, it} from 'vitest';
import {
  cascadeInverted,
  compareCandidate,
  contrastFailures,
  failureBreakdown,
  failureCauses,
  hardGateVector,
  isComparableRun,
  isTextInsertionOnly,
  nestedLayerFailures,
  passesAcceptance,
  regressions,
  scoreArm,
  strictAcceptanceSummary,
  variableCapture,
  verdict,
  type InteractionReading,
  type Measurement,
  type ProbeReading,
  type SchemeReading,
  type SetupIntegrity,
  type TaskContract,
} from './setup-eval.js';

const GEOMETRY = {
  x: 10,
  y: 20,
  top: 20,
  right: 110,
  bottom: 60,
  left: 10,
  width: 100,
  height: 40,
};
const STYLE = {
  color: 'rgb(230, 230, 233)',
  backgroundColor: 'rgb(20, 20, 23)',
  borderTopColor: 'rgb(63, 63, 70)',
  borderTopWidth: '1px',
  borderTopStyle: 'solid',
  borderTopLeftRadius: '8px',
  boxShadow: 'rgba(0, 0, 0, 0.1) 0px 1px 2px 0px',
  fontFamily: 'ui-sans-serif',
  fontSize: '12px',
  fontWeight: '400',
  lineHeight: '16px',
  letterSpacing: 'normal',
  paddingLeft: '12px',
  marginLeft: '0px',
  gap: '8px',
  width: '100px',
  height: '40px',
  position: 'static',
};

const probe = (
  style: Record<string, string> = STYLE,
  contrast: number | null = 12,
  text = 'Host',
  geometry = GEOMETRY,
): ProbeReading => ({style, text, contrast, geometry});

const layerSurface = (
  kind: string,
  zIndex: string,
  overrides: Record<string, unknown> = {},
) => ({
  kind,
  visible: true,
  display: 'block',
  visibility: 'visible',
  opacity: '1',
  position: 'fixed',
  zIndex,
  style: STYLE,
  bounds: GEOMETRY,
  intersectsViewport: true,
  clippingAncestor: null,
  centerHitSelf: true,
  centerHitProbe: `${kind}-surface`,
  topLayer: {
    tagName: 'div',
    role: kind === 'dialog' ? 'dialog' : kind === 'popover' ? 'menu' : null,
    open: false,
    popover: null,
    ariaModal: kind === 'dialog' ? 'true' : null,
    inTopLayer: false,
    portalChild: true,
  },
  ...overrides,
});

function interaction(
  direction:
    'host-baseline' | 'astryx-in-host' | 'host-in-astryx' = 'host-baseline',
  nestedOverrides: Record<string, unknown> = {},
): InteractionReading {
  return {
    id: `${direction}-overlay`,
    direction,
    opened: true,
    keyboardReached: {'nested-trigger': true},
    surfaces: {
      'dialog-backdrop': layerSurface('backdrop', '40'),
      'dialog-surface': layerSurface('dialog', '50'),
      'popover-surface': layerSurface('popover', '70', nestedOverrides),
    },
  };
}

function scheme(overrides: Partial<SchemeReading> = {}): SchemeReading {
  return {
    probes: {
      'page-title': probe(),
      status: probe({...STYLE, color: 'rgb(110, 231, 183)'}, 8.1, 'Ready'),
    },
    variables: {'--spacing': '.25rem', '--color-card': '#141417'},
    colorScheme: 'light dark',
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    interaction: interaction(),
    taskResults: {
      'astryx-proof': {
        count: 1,
        visible: true,
        focusable: true,
        text: 'Astryx ready',
        style: STYLE,
        geometry: GEOMETRY,
      },
    },
    taskInteractions: {},
    ...overrides,
  };
}

const TASK: TaskContract = {
  allowedHostChanges: [],
  replacedHostProbes: [],
  allowedOverlayChanges: [],
  results: [
    {
      name: 'astryx-proof',
      exact: 1,
      visible: true,
      focusable: true,
      text: 'Astryx ready',
    },
  ],
  interactions: [],
};

const INTEGRITY: SetupIntegrity = {
  diffSha256: 'a'.repeat(64),
  attestedDiffSha256: 'a'.repeat(64),
  diffMatchesAttestation: true,
  usesAstryx: true,
  changedFiles: ['src/App.tsx'],
  escapeHatches: [],
};

const CORRECT_LAYERS = [
  'reset',
  'theme',
  'base',
  'astryx-base',
  'astryx-theme',
  'utilities',
];

function measurement({
  light = scheme(),
  dark = scheme(),
  label = 'arm',
  build = true,
  layerOrder = CORRECT_LAYERS,
  task = true,
  contract = TASK,
  integrity = INTEGRITY,
  executionStatus = 'succeeded',
  fixture,
}: {
  light?: SchemeReading;
  dark?: SchemeReading;
  label?: string;
  build?: boolean;
  layerOrder?: string[];
  task?: boolean;
  contract?: TaskContract;
  integrity?: SetupIntegrity;
  executionStatus?: string;
  fixture?: string;
} = {}): Measurement {
  return {
    label,
    ...(fixture ? {fixture} : {}),
    build: {
      ok: build,
      status: build ? 0 : 1,
      ms: 1000,
      stdout: '',
      stderr: build ? '' : 'build failed',
    },
    layerOrder,
    ...(task ? {task: {id: 's0', kind: 'installation', contract}} : {}),
    ...(task ? {integrity, executionStatus} : {}),
    schemes: {light, dark},
  };
}

const baseline = () => measurement({label: 'baseline', task: false});

describe('host style and geometry regressions', () => {
  it('compares the full style key union, text, and exact normalized geometry', () => {
    const after = scheme();
    after.probes['page-title'] = probe(
      {...STYLE, futureProperty: 'new'},
      12,
      'Changed host',
      {...GEOMETRY, x: 10.015625},
    );
    const changed = regressions(scheme(), after).changed;
    expect(changed.map(result => result.property)).toEqual([
      'geometry.x',
      'text',
      'futureProperty',
    ]);
  });

  it.each([
    ['radius', 'borderTopLeftRadius', '12px'],
    ['shadow', 'boxShadow', 'none'],
    ['border', 'borderTopWidth', '0px'],
    ['font', 'fontFamily', 'Inter'],
    ['color', 'color', 'rgb(255, 0, 0)'],
  ])('makes a %s regression fail strict acceptance', (_, property, value) => {
    const after = scheme();
    const current = after.probes['page-title'];
    if ('missing' in current) {
      throw new Error('test probe missing');
    }
    after.probes['page-title'] = probe({...current.style, [property]: value});
    const score = scoreArm(
      baseline(),
      measurement({light: after, dark: after}),
    );
    expect(score.regressionDetails).toEqual(
      expect.arrayContaining([expect.objectContaining({property})]),
    );
    expect(verdict(score)).toBe('cosmetic-drift');
    expect(passesAcceptance(score)).toBe(false);
  });

  it('allows only declared position fields while protecting every host style', () => {
    const contract: TaskContract = {
      ...TASK,
      allowedHostChanges: [
        {
          fixture: 'tailwind-v4-control',
          probe: 'page-title',
          fields: ['geometry.x', 'geometry.left', 'geometry.right'],
        },
      ],
    };
    const moved = scheme();
    moved.probes['page-title'] = probe(STYLE, 12, 'Host', {
      ...GEOMETRY,
      x: 20,
      left: 20,
      right: 120,
    });
    const movedScore = scoreArm(
      baseline(),
      measurement({
        light: moved,
        dark: moved,
        contract,
        fixture: 'tailwind-v4-control',
      }),
    );
    expect(movedScore.regressionDetails).toEqual([]);
    expect(passesAcceptance(movedScore)).toBe(true);

    for (const [property, value] of [
      ['color', 'rgb(255, 0, 0)'],
      ['borderTopLeftRadius', '999px'],
      ['boxShadow', 'none'],
      ['borderTopWidth', '0px'],
      ['fontFamily', 'Inter'],
    ]) {
      const damaged = scheme();
      damaged.probes['page-title'] = probe(
        {...STYLE, [property]: value},
        12,
        'Host',
        {...GEOMETRY, x: 20, left: 20, right: 120},
      );
      const score = scoreArm(
        baseline(),
        measurement({
          light: damaged,
          dark: damaged,
          contract,
          fixture: 'tailwind-v4-control',
        }),
      );
      expect(score.regressionDetails, `unallowlisted ${property}`).toEqual(
        expect.arrayContaining([expect.objectContaining({property})]),
      );
      expect(passesAcceptance(score)).toBe(false);
    }
  });

  it('detects damage that exists only in dark mode', () => {
    const dark = scheme();
    const title = dark.probes['page-title'];
    if ('missing' in title) {
      throw new Error('test probe missing');
    }
    dark.probes['page-title'] = probe({...title.style, fontSize: '10px'});
    const score = scoreArm(baseline(), measurement({dark}));
    expect(score.regressionDetails).toContainEqual(
      expect.objectContaining({probe: 'page-title', property: 'fontSize'}),
    );
    expect(passesAcceptance(score)).toBe(false);
  });

  it('rejects an incomplete baseline instead of disabling host comparison', () => {
    const incomplete = scheme({
      probes: {'page-title': {missing: true}, status: {missing: true}},
    });
    const score = scoreArm(
      measurement({
        label: 'baseline',
        task: false,
        light: incomplete,
        dark: incomplete,
      }),
      measurement(),
    );
    expect(score.baselineFailures).toContain(
      'light:page-title:baseline-missing',
    );
    expect(passesAcceptance(score)).toBe(false);
  });

  it('records a removed host probe rather than skipping it', () => {
    const after = scheme();
    after.probes.status = {missing: true};
    const score = scoreArm(
      baseline(),
      measurement({light: after, dark: after}),
    );
    expect(score.missingProbes).toEqual(['status']);
    expect(verdict(score)).toBe('silent-damage');
  });

  it('exempts only an explicitly replaced probe and keeps neighbors strict', () => {
    const contract: TaskContract = {
      allowedHostChanges: [],
      replacedHostProbes: [
        {
          fixture: 'tailwind-v4-control',
          probe: 'status',
          result: 'astryx-status',
        },
      ],
      allowedOverlayChanges: [],
      results: [
        {
          name: 'astryx-status',
          exact: 1,
          visible: true,
          preserveTextFromHostProbe: 'status',
        },
      ],
      interactions: [],
    };
    const replaced = scheme({
      probes: {...scheme().probes, status: {missing: true}},
      taskResults: {
        'astryx-status': {
          count: 1,
          visible: true,
          focusable: false,
          text: 'Ready',
          style: STYLE,
          geometry: GEOMETRY,
        },
      },
    });
    const accepted = scoreArm(
      baseline(),
      measurement({
        light: replaced,
        dark: replaced,
        contract,
        fixture: 'tailwind-v4-control',
      }),
    );
    expect(accepted.missingProbes).toEqual([]);
    expect(passesAcceptance(accepted)).toBe(true);

    const addedInstead = scheme({taskResults: replaced.taskResults});
    const additionScore = scoreArm(
      baseline(),
      measurement({
        light: addedInstead,
        dark: addedInstead,
        contract,
        fixture: 'tailwind-v4-control',
      }),
    );
    expect(additionScore.taskFailures).toEqual([
      'light:status:not-replaced',
      'dark:status:not-replaced',
    ]);
    expect(passesAcceptance(additionScore)).toBe(false);

    const damaged = structuredClone(replaced);
    const title = damaged.probes['page-title'];
    if ('missing' in title) {
      throw new Error('test probe missing');
    }
    title.style.color = 'rgb(255, 0, 0)';
    const rejected = scoreArm(
      baseline(),
      measurement({
        light: damaged,
        dark: damaged,
        contract,
        fixture: 'tailwind-v4-control',
      }),
    );
    expect(rejected.regressionDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({probe: 'page-title', property: 'color'}),
      ]),
    );
    expect(passesAcceptance(rejected)).toBe(false);
  });
});

describe('contrast, variables, modes, and cascade', () => {
  it('fails when readable text drops below the AA floor', () => {
    const after = scheme();
    after.probes['page-title'] = probe(STYLE, 1.1);
    expect(contrastFailures(scheme(), after)).toEqual([
      {probe: 'page-title', before: 12, after: 1.1},
    ]);
    expect(
      passesAcceptance(
        scoreArm(baseline(), measurement({light: after, dark: after})),
      ),
    ).toBe(false);
  });

  it('keeps variable capture diagnostic when visible host output is unchanged', () => {
    const after = scheme({
      variables: {
        '--spacing': '.25rem',
        '--color-card': 'light-dark(#fff,#000)',
      },
    });
    expect(variableCapture(scheme(), after)).toHaveLength(1);
    const score = scoreArm(
      baseline(),
      measurement({light: after, dark: after}),
    );
    expect(verdict(score)).toBe('clean');
    expect(passesAcceptance(score)).toBe(true);
  });

  it('rejects a measurement error instead of guessing across multiple CSS assets', () => {
    const arm = measurement();
    arm.measurementErrors = ['multiple-css-assets:a.css,b.css'];
    const score = scoreArm(baseline(), arm);
    expect(score.measurementErrors).toEqual([
      'multiple-css-assets:a.css,b.css',
    ]);
    expect(passesAcceptance(score)).toBe(false);
  });

  it('rejects missing layer evidence instead of treating it as clean', () => {
    const score = scoreArm(baseline(), measurement({layerOrder: []}));
    expect(score.layerOrderFailures).toEqual([
      'missing-astryx-base',
      'missing-astryx-theme',
      'missing-utilities',
    ]);
    expect(passesAcceptance(score)).toBe(false);
  });

  it('rejects an inverted cascade even when every probe still reads', () => {
    const score = scoreArm(
      baseline(),
      measurement({
        layerOrder: ['theme', 'base', 'utilities', 'reset', 'astryx-base'],
      }),
    );
    expect(cascadeInverted(score.layerOrder)).toBe(true);
    expect(verdict(score)).toBe('silent-damage');
  });
});

describe('task-specific success and run integrity', () => {
  it('rejects a broken build before browser evidence is available', () => {
    const score = scoreArm(baseline(), measurement({build: false}));
    expect(verdict(score)).toBe('broken-build');
    expect(score.taskFailures).toContain('build-failed');
    expect(passesAcceptance(score)).toBe(false);
  });

  it('counts a real agent failure as valid evidence that cannot pass', () => {
    const failed = scoreArm(
      baseline(),
      measurement({executionStatus: 'agent-failure'}),
    );
    expect(failed.validRun).toBe(true);
    expect(failed.executionSucceeded).toBe(false);
    expect(passesAcceptance(failed)).toBe(false);
  });

  it('rejects a no-op or component task with no result marker', () => {
    const noTask = scoreArm(baseline(), measurement({task: false}));
    expect(noTask.taskFailures).toContain('missing-task-contract');
    expect(passesAcceptance(noTask)).toBe(false);

    const missing = scheme({taskResults: {}});
    const missingResult = scoreArm(
      baseline(),
      measurement({light: missing, dark: missing}),
    );
    expect(missingResult.taskFailures).toContain('light:astryx-proof:count');
    expect(passesAcceptance(missingResult)).toBe(false);
  });

  it('accepts an unchanged host only with task output and exact diff attestation', () => {
    const score = scoreArm(baseline(), measurement());
    expect(score.taskSuccess).toBe(true);
    expect(verdict(score)).toBe('clean');
    expect(passesAcceptance(score)).toBe(true);
  });

  it.each([
    [
      'manual patch',
      {...INTEGRITY, diffMatchesAttestation: false},
      'post-run-manual-edit',
    ],
    [
      'missing attestation',
      {...INTEGRITY, attestedDiffSha256: null, diffMatchesAttestation: false},
      'missing-agent-diff-attestation',
    ],
    [
      'escape hatch',
      {...INTEGRITY, escapeHatches: ['hardcoded-important']},
      'hardcoded-important',
    ],
    ['avoided Astryx', {...INTEGRITY, usesAstryx: false}, 'missing-astryx-use'],
  ])('rejects %s evidence', (_, integrity, failure) => {
    const score = scoreArm(baseline(), measurement({integrity}));
    expect(score.integrityFailures).toContain(failure);
    expect(passesAcceptance(score)).toBe(false);
  });
});

describe('cross-system overlay directions', () => {
  const contractFor = (
    direction: 'astryx-in-host' | 'host-in-astryx',
  ): TaskContract => ({
    allowedHostChanges: [],
    replacedHostProbes: [],
    allowedOverlayChanges: [],
    results: TASK.results,
    interactions: [
      {
        id: `${direction}-overlay`,
        direction,
        open: [
          {
            name: 'nested-trigger',
            source: 'result',
            method: 'keyboard-activate',
          },
        ],
        surfaces: [
          {name: 'dialog-backdrop', source: 'result', kind: 'backdrop'},
          {name: 'dialog-surface', source: 'result', kind: 'dialog'},
          {name: 'popover-surface', source: 'result', kind: 'popover'},
        ],
      },
    ],
  });

  it.each(['astryx-in-host', 'host-in-astryx'] as const)(
    'rejects center occlusion and below-stack ordering for %s',
    direction => {
      const failed = interaction(direction, {
        zIndex: '30',
        centerHitSelf: false,
        centerHitProbe: 'dialog-backdrop',
      });
      const after = scheme({
        taskInteractions: {[`${direction}-overlay`]: failed},
      });
      const score = scoreArm(
        baseline(),
        measurement({
          light: after,
          dark: after,
          contract: contractFor(direction),
        }),
      );
      expect(nestedLayerFailures(after)).toEqual([
        expect.objectContaining({
          direction,
          surface: 'popover-surface',
          problems: ['center-occluded', 'below-backdrop', 'below-dialog'],
        }),
      ]);
      expect(score.layeringFailures).toHaveLength(1);
      expect(passesAcceptance(score)).toBe(false);
    },
  );

  it('rejects host dialog visibility and geometry drift', () => {
    const changedInteraction = interaction();
    changedInteraction.surfaces['dialog-surface'] = layerSurface(
      'dialog',
      '50',
      {
        visible: false,
        display: 'none',
        bounds: {...GEOMETRY, x: 390, left: 390, right: 490},
      },
    );
    const after = scheme({interaction: changedInteraction});
    const score = scoreArm(
      baseline(),
      measurement({light: after, dark: after}),
    );
    expect(score.regressionDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          probe: 'overlay:dialog-surface',
          property: 'geometry.x',
        }),
        expect.objectContaining({
          probe: 'overlay:dialog-surface',
          property: 'visible',
        }),
      ]),
    );
    expect(passesAcceptance(score)).toBe(false);
  });

  it('allows declared dialog bounds but never dialog or backdrop styles', () => {
    const contract: TaskContract = {
      ...TASK,
      allowedOverlayChanges: [
        {
          fixture: 'shadcn-tailwind-v4-established',
          surface: 'dialog-surface',
          fields: [
            'geometry.y',
            'geometry.top',
            'geometry.bottom',
            'geometry.height',
          ],
        },
      ],
    };
    const changedInteraction = interaction();
    changedInteraction.surfaces['dialog-surface'] = layerSurface(
      'dialog',
      '50',
      {
        bounds: {...GEOMETRY, y: 10, top: 10, bottom: 70, height: 60},
      },
    );
    const changed = scheme({interaction: changedInteraction});
    const accepted = scoreArm(
      baseline(),
      measurement({
        light: changed,
        dark: changed,
        contract,
        fixture: 'shadcn-tailwind-v4-established',
      }),
    );
    expect(accepted.regressionDetails).toEqual([]);
    expect(passesAcceptance(accepted)).toBe(true);

    for (const [surfaceName, property] of [
      ['dialog-surface', 'boxShadow'],
      ['dialog-backdrop', 'backgroundColor'],
    ] as const) {
      const damaged = structuredClone(changed);
      const surface = damaged.interaction?.surfaces[surfaceName];
      if (!surface || 'missing' in surface) {
        throw new Error(`missing ${surfaceName}`);
      }
      surface.style[property] = 'rgb(255, 0, 0)';
      const rejected = scoreArm(
        baseline(),
        measurement({
          light: damaged,
          dark: damaged,
          contract,
          fixture: 'shadcn-tailwind-v4-established',
        }),
      );
      expect(rejected.regressionDetails).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            probe: `overlay:${surfaceName}`,
            property,
          }),
        ]),
      );
      expect(passesAcceptance(rejected)).toBe(false);
    }
  });

  it('rejects a missing interaction result marker and unreachable keyboard trigger', () => {
    const failed = interaction('host-in-astryx');
    failed.keyboardReached = {'nested-trigger': false};
    failed.surfaces['popover-surface'] = {kind: 'popover', missing: true};
    const after = scheme({
      taskInteractions: {'host-in-astryx-overlay': failed},
    });
    const score = scoreArm(
      baseline(),
      measurement({
        light: after,
        dark: after,
        contract: contractFor('host-in-astryx'),
      }),
    );
    expect(score.taskFailures).toContain(
      'light:host-in-astryx-overlay:nested-trigger:keyboard',
    );
    expect(score.layeringFailures).toContainEqual(
      expect.objectContaining({
        surface: 'popover-surface',
        problems: ['missing'],
      }),
    );
  });
});

describe('exploratory candidate comparison', () => {
  function changed(property: string, value: string) {
    const after = scheme();
    const title = after.probes['page-title'];
    if ('missing' in title) {
      throw new Error('test probe missing');
    }
    after.probes['page-title'] = probe({...title.style, [property]: value});
    return scoreArm(baseline(), measurement({light: after, dark: after}));
  }

  it('exposes an improvement and a regression without automatically ranking them', () => {
    const current = changed('color', 'rgb(255, 0, 0)');
    const candidate = changed('borderTopLeftRadius', '999px');
    const comparison = compareCandidate(current, candidate);
    expect(comparison.deltas.color).toBeLessThan(0);
    expect(comparison.deltas.radius).toBeGreaterThan(0);
    expect(comparison.regressions).toEqual(['radius']);
    expect(comparison.improvements).toEqual(['color']);
    expect(comparison).not.toHaveProperty('advances');
    expect(comparison).not.toHaveProperty('score');
  });

  it('shows a clean targeted improvement without assigning an automatic verdict', () => {
    const current = changed('color', 'rgb(255, 0, 0)');
    const candidate = scoreArm(baseline(), measurement());
    const comparison = compareCandidate(current, candidate);
    expect(comparison.regressions).toEqual([]);
    expect(comparison.improvements).toContain('color');
    expect(comparison).not.toHaveProperty('advances');
  });

  it('exposes every hard dimension rather than a compensating aggregate score', () => {
    const vector = hardGateVector(scoreArm(baseline(), measurement()));
    expect(Object.keys(vector)).toEqual([
      'build',
      'runtime',
      'taskCompletion',
      'color',
      'font',
      'radius',
      'border',
      'shadow',
      'geometry',
      'contrast',
      'layering',
    ]);
  });
});

describe('strict confirmation summary', () => {
  it('requires complete coverage and 100% clean valid runs', () => {
    const clean = scoreArm(baseline(), measurement());
    expect(strictAcceptanceSummary([clean, clean], 2, true)).toMatchObject({
      strictClean: {numerator: 2, denominator: 2, rate: 1},
      damageFree: {numerator: 2, denominator: 2, rate: 1},
      passes: true,
    });
    expect(strictAcceptanceSummary([clean], 2, false).passes).toBe(false);
  });

  it('counts cosmetic drift as damage and a strict failure', () => {
    const after = scheme();
    const title = after.probes['page-title'];
    if ('missing' in title) {
      throw new Error('test probe missing');
    }
    after.probes['page-title'] = probe({...title.style, boxShadow: 'none'});
    const drift = scoreArm(
      baseline(),
      measurement({light: after, dark: after}),
    );
    const summary = strictAcceptanceSummary([drift], 1, true);
    expect(verdict(drift)).toBe('cosmetic-drift');
    expect(summary.strictClean).toEqual({
      numerator: 0,
      denominator: 1,
      rate: 0,
    });
    expect(summary.damageFree).toEqual({numerator: 0, denominator: 1, rate: 0});
    expect(summary.passes).toBe(false);
  });
});

/**
 * The s5 intended-change allowance.
 *
 * A task that mandates inserting a control into a host container makes that
 * container taller and adds the control's copy to its text. Both measured `s5`
 * cells reported the identical eight "regressions" for doing what the task
 * said. The allowance is field-granular on purpose: it names the shell's height
 * and the two geometry fields height moves, and permits text the container
 * *gains* — and nothing else, on nothing else.
 */
describe('intended-change allowances for a mandated insertion', () => {
  const SHELL_ALLOWANCE: TaskContract = {
    ...TASK,
    allowedHostChanges: [
      {
        fixture: 'enterprise-scoped-synthetic',
        probe: 'host-shell',
        fields: ['height', 'geometry.height', 'geometry.bottom'],
        textInsertionOnly: true,
      },
    ],
  };

  const shellScheme = (
    overrides: {
      style?: Record<string, string>;
      geometry?: Record<string, number>;
      text?: string;
    } = {},
  ) =>
    scheme({
      probes: {
        'host-shell': {
          style: {...STYLE, ...(overrides.style ?? {})},
          geometry: {...GEOMETRY, ...(overrides.geometry ?? {})},
          contrast: 12,
          text: overrides.text ?? 'Portfolio console Service controls',
        },
        status: probe({...STYLE, color: 'rgb(110, 231, 183)'}, 8.1, 'Ready'),
      },
    });

  const scored = (
    overrides: Parameters<typeof shellScheme>[0],
    contract: TaskContract = SHELL_ALLOWANCE,
  ) =>
    scoreArm(
      measurement({
        label: 'baseline',
        task: false,
        light: shellScheme(),
        dark: shellScheme(),
      }),
      measurement({
        fixture: 'enterprise-scoped-synthetic',
        contract,
        light: shellScheme(overrides),
        dark: shellScheme(overrides),
      }),
    );

  const REFLOW = {
    style: {height: '140px'},
    geometry: {height: 140, bottom: 160},
    text: 'Portfolio console Service controls Escalation routing Open service actions',
  };

  it('accepts the growth and added text the insertion causes', () => {
    const score = scored(REFLOW);
    expect(score.regressionDetails).toEqual([]);
    expect(verdict(score)).toBe('clean');
  });

  it('reports the same change with no allowance in the contract', () => {
    const score = scored(REFLOW, TASK);
    expect(
      score.regressionDetails
        .map(regression => regression.property)
        .sort()
        .filter((value, index, all) => all.indexOf(value) === index),
    ).toEqual(['geometry.bottom', 'geometry.height', 'height', 'text']);
  });

  it.each([
    {name: 'a computed style', overrides: {style: {color: 'rgb(1, 2, 3)'}}},
    {
      name: 'a geometry field the allowance does not name',
      overrides: {geometry: {width: 999}},
    },
  ])('still reports $name on the same probe', ({overrides}) => {
    const score = scored({
      ...REFLOW,
      style: {...REFLOW.style, ...(overrides.style ?? {})},
      geometry: {...REFLOW.geometry, ...(overrides.geometry ?? {})},
    });
    expect(score.regressions).toBeGreaterThan(0);
    expect(verdict(score)).not.toBe('clean');
  });

  it('permits added text but never lost or rewritten text', () => {
    expect(
      isTextInsertionOnly('Portfolio console', 'Portfolio console Escalation'),
    ).toBe(true);
    expect(
      isTextInsertionOnly('Portfolio console', 'Escalation Portfolio console'),
    ).toBe(true);
    expect(isTextInsertionOnly('Portfolio console', 'Portfolio')).toBe(false);
    expect(isTextInsertionOnly('Portfolio console', 'Portfolio desk')).toBe(
      false,
    );
    expect(isTextInsertionOnly('Portfolio console', 'console Portfolio')).toBe(
      false,
    );
  });

  it('reports host copy the container lost even under the allowance', () => {
    const score = scored({
      ...REFLOW,
      text: 'Service controls Escalation routing Open service actions',
    });
    expect(
      score.regressionDetails.some(
        regression =>
          regression.probe === 'host-shell' && regression.property === 'text',
      ),
    ).toBe(true);
  });

  it('does not leak the allowance to another probe', () => {
    const score = scoreArm(
      measurement({
        label: 'baseline',
        task: false,
        light: shellScheme(),
        dark: shellScheme(),
      }),
      measurement({
        fixture: 'enterprise-scoped-synthetic',
        contract: SHELL_ALLOWANCE,
        light: scheme({
          probes: {
            'host-shell': {
              style: STYLE,
              geometry: GEOMETRY,
              contrast: 12,
              text: 'Portfolio console Service controls',
            },
            status: probe(
              {...STYLE, color: 'rgb(110, 231, 183)', height: '99px'},
              8.1,
              'Ready',
            ),
          },
        }),
        dark: shellScheme(),
      }),
    );
    expect(
      score.regressionDetails.some(
        regression =>
          regression.probe === 'status' && regression.property === 'height',
      ),
    ).toBe(true);
  });

  it('does not apply an allowance written for another fixture', () => {
    const score = scoreArm(
      measurement({
        label: 'baseline',
        task: false,
        light: shellScheme(),
        dark: shellScheme(),
      }),
      measurement({
        fixture: 'tailwind-v4-control',
        contract: SHELL_ALLOWANCE,
        light: shellScheme(REFLOW),
        dark: shellScheme(REFLOW),
      }),
    );
    expect(score.regressions).toBeGreaterThan(0);
  });
});

/**
 * The same allowance, for the container the insertion actually lands in.
 *
 * `s5` mandates exactly one visible `astryx-dialog-trigger`, and this fixture's
 * guest subtree is where guest design-system content goes, so that is where the
 * trigger belongs. Two independent reps put it there and both grew the boundary
 * from 296px to 409px, moving its height and the two geometry fields height
 * moves, in both schemes. That is the insertion's own geometry, not host
 * damage.
 *
 * The trigger is task-owned, so the boundary's protected text already excludes
 * it and this allowance names no text exemption at all. Everything else about
 * the boundary — its width, its position, its every computed style — and every
 * other probe stays exact.
 */
describe('intended-change allowance for the guest boundary', () => {
  const GUEST_ALLOWANCE: TaskContract = {
    ...TASK,
    allowedHostChanges: [
      {
        fixture: 'enterprise-scoped-synthetic',
        probe: 'guest-boundary',
        fields: ['height', 'geometry.height', 'geometry.bottom'],
      },
    ],
  };

  // The boundary as measured: a right-hand column that grows downward only.
  const GUEST_GEOMETRY = {
    x: 812,
    y: 120,
    top: 120,
    right: 1112,
    bottom: 416,
    left: 812,
    width: 300,
    height: 296,
  };
  const GUEST_TEXT =
    'Guest subtree Integration preview This subtree intentionally redefines accent, border, panel, foreground, subtle, and error.';

  const guestScheme = (
    overrides: {
      style?: Record<string, string>;
      geometry?: Record<string, number>;
      text?: string;
    } = {},
  ) =>
    scheme({
      probes: {
        'guest-boundary': {
          style: {
            ...STYLE,
            height: '296px',
            width: '300px',
            ...(overrides.style ?? {}),
          },
          geometry: {...GUEST_GEOMETRY, ...(overrides.geometry ?? {})},
          contrast: 12,
          text: overrides.text ?? GUEST_TEXT,
        },
        'host-shell': probe(STYLE, 12, 'Portfolio console'),
      },
    });

  const scored = (
    overrides: Parameters<typeof guestScheme>[0],
    contract: TaskContract = GUEST_ALLOWANCE,
  ) =>
    scoreArm(
      measurement({
        label: 'baseline',
        task: false,
        light: guestScheme(),
        dark: guestScheme(),
      }),
      measurement({
        fixture: 'enterprise-scoped-synthetic',
        contract,
        light: guestScheme(overrides),
        dark: guestScheme(overrides),
      }),
    );

  // 296 -> 409, both schemes: the reps' own measured growth.
  const INSERTION = {
    style: {height: '409px'},
    geometry: {height: 409, bottom: 529},
  };

  it('accepts the growth the mandated insertion causes', () => {
    const score = scored(INSERTION);
    expect(score.regressionDetails).toEqual([]);
    expect(verdict(score)).toBe('clean');
    expect(passesAcceptance(score)).toBe(true);
  });

  it('reports that same growth with no allowance in the contract', () => {
    const score = scored(INSERTION, TASK);
    expect(
      score.regressionDetails
        .map(regression => regression.property)
        .sort()
        .filter((value, index, all) => all.indexOf(value) === index),
    ).toEqual(['geometry.bottom', 'geometry.height', 'height']);
    expect(passesAcceptance(score)).toBe(false);
  });

  it.each([
    {
      name: 'the boundary getting wider',
      overrides: {style: {width: '420px'}, geometry: {width: 420, right: 1232}},
      property: 'width',
    },
    {
      name: 'a colour change on the boundary',
      overrides: {style: {color: 'rgb(1, 2, 3)'}},
      property: 'color',
    },
    {
      name: 'a typography change on the boundary',
      overrides: {style: {fontFamily: 'Inter'}},
      property: 'fontFamily',
    },
    {
      name: 'the boundary moving down the page',
      overrides: {geometry: {top: 180, y: 180}},
      property: 'geometry.top',
    },
    {
      name: 'host copy the boundary lost',
      overrides: {text: 'Integration preview'},
      property: 'text',
    },
    {
      name: 'host copy the boundary gained',
      overrides: {text: `${GUEST_TEXT} Open service actions`},
      property: 'text',
    },
  ])('still reports $name', ({overrides, property}) => {
    const score = scored({
      style: {...INSERTION.style, ...(overrides.style ?? {})},
      geometry: {...INSERTION.geometry, ...(overrides.geometry ?? {})},
      ...(overrides.text === undefined ? {} : {text: overrides.text}),
    });
    expect(
      score.regressionDetails.filter(
        regression =>
          regression.probe === 'guest-boundary' &&
          regression.property === property,
      ),
    ).not.toEqual([]);
    expect(verdict(score)).not.toBe('clean');
    expect(passesAcceptance(score)).toBe(false);
  });

  it('does not leak the allowance to another probe', () => {
    const score = scoreArm(
      measurement({
        label: 'baseline',
        task: false,
        light: guestScheme(),
        dark: guestScheme(),
      }),
      measurement({
        fixture: 'enterprise-scoped-synthetic',
        contract: GUEST_ALLOWANCE,
        light: scheme({
          probes: {
            'guest-boundary': {
              style: {...STYLE, height: '409px', width: '300px'},
              geometry: {...GUEST_GEOMETRY, height: 409, bottom: 529},
              contrast: 12,
              text: GUEST_TEXT,
            },
            'host-shell': probe(
              {...STYLE, height: '99px'},
              12,
              'Portfolio console',
            ),
          },
        }),
        dark: guestScheme(INSERTION),
      }),
    );
    expect(
      score.regressionDetails.some(
        regression =>
          regression.probe === 'host-shell' && regression.property === 'height',
      ),
    ).toBe(true);
    expect(passesAcceptance(score)).toBe(false);
  });

  it('does not apply the allowance in another fixture', () => {
    const score = scoreArm(
      measurement({
        label: 'baseline',
        task: false,
        light: guestScheme(),
        dark: guestScheme(),
      }),
      measurement({
        fixture: 'tailwind-v4-control',
        contract: GUEST_ALLOWANCE,
        light: guestScheme(INSERTION),
        dark: guestScheme(INSERTION),
      }),
    );
    expect(score.regressions).toBeGreaterThan(0);
  });
});

/**
 * The report distinction. `verdict` answers "is this acceptable"; it is not a
 * description of what went wrong, and the operator report read it as one.
 */
describe('failure kinds', () => {
  const withScore = (mutate: (value: ReturnType<typeof scoreArm>) => void) => {
    const value = scoreArm(baseline(), measurement());
    mutate(value);
    return value;
  };

  it('is empty for a clean completed run', () => {
    expect(failureBreakdown(scoreArm(baseline(), measurement()))).toEqual({
      hostDamage: 0,
      runtime: 0,
      integrity: 0,
      task: 0,
      telemetry: 0,
    });
    expect(failureCauses(scoreArm(baseline(), measurement()))).toEqual([]);
  });

  it.each([
    {
      kind: 'hostDamage',
      mutate: (value: ReturnType<typeof scoreArm>) => {
        value.regressions = 2;
      },
    },
    {
      kind: 'integrity',
      mutate: (value: ReturnType<typeof scoreArm>) => {
        value.integrityFailures = ['hardcoded-important'];
      },
    },
    {
      kind: 'task',
      mutate: (value: ReturnType<typeof scoreArm>) => {
        value.taskFailures = ['light:menu:host-style'];
      },
    },
    {
      kind: 'telemetry',
      mutate: (value: ReturnType<typeof scoreArm>) => {
        value.executionSucceeded = false;
      },
    },
  ])('attributes a $kind failure to that kind alone', ({kind, mutate}) => {
    expect(failureCauses(withScore(mutate))).toEqual([kind]);
  });

  it('counts a measurement error as telemetry, not as host damage', () => {
    const value = withScore(score => {
      score.measurementErrors = ['probe read failed'];
    });
    expect(failureBreakdown(value).telemetry).toBe(1);
    expect(failureBreakdown(value).hostDamage).toBe(0);
  });

  it('marks a run the executor did not finish as not comparable', () => {
    expect(isComparableRun(scoreArm(baseline(), measurement()))).toBe(true);
    expect(
      isComparableRun(
        withScore(score => {
          score.executionSucceeded = false;
        }),
      ),
    ).toBe(false);
  });
});

/**
 * Relocated host UI must stay inside the host token scope that was painting it.
 *
 * A task that composes existing host markup inside a design-system overlay
 * moves that markup in the DOM. An established app frequently scopes part of
 * its palette to a region — a settings panel, a guest area — so an element that
 * was inside the region resolves the region's values and the same element
 * outside it resolves the global ones. The classes do not change and the colour
 * does, which reads like the design system repainting a host component and is
 * not.
 *
 * `host-boundary` is reported apart from `host-style` because the two have
 * opposite fixes. Losing the boundary means the host's own rules stopped
 * reaching the element: restore the boundary. Restating the colours instead
 * produces a surface that matches today and silently desynchronizes the next
 * time the host retunes its palette — which is why the boundary is checked
 * structurally and not inferred from the colours agreeing.
 */
describe('relocated host surfaces keep their host token boundary', () => {
  const SCOPE = '[data-guest-design-system]';

  const relocated = ({
    tokenScopes,
    style = STYLE,
  }: {
    tokenScopes: string[];
    style?: Record<string, string>;
  }) => {
    const reference = interaction('host-baseline', {tokenScopes: [SCOPE]});
    const moved: InteractionReading = {
      id: 'host-menu-in-astryx-dialog',
      direction: 'host-in-astryx',
      opened: true,
      keyboardReached: {
        'astryx-dialog-trigger': true,
        'host-menu-trigger': true,
      },
      surfaces: {
        'astryx-dialog-backdrop': layerSurface('backdrop', '40'),
        'astryx-dialog-surface': layerSurface('dialog', '50'),
        'host-menu-surface': layerSurface('popover', '70', {
          tokenScopes,
          style,
        }),
      },
    };
    const contract: TaskContract = {
      ...TASK,
      interactions: [
        {
          id: 'host-menu-in-astryx-dialog',
          direction: 'host-in-astryx',
          open: [
            {
              name: 'astryx-dialog-trigger',
              source: 'result',
              method: 'keyboard-activate',
              key: 'Enter',
            },
            {
              name: 'host-menu-trigger',
              source: 'result',
              method: 'keyboard-activate',
              key: 'Enter',
            },
          ],
          surfaces: [
            {
              name: 'astryx-dialog-backdrop',
              source: 'result',
              kind: 'backdrop',
              marker: 'astryx-dialog-surface',
            },
            {name: 'astryx-dialog-surface', source: 'result', kind: 'dialog'},
            {
              name: 'host-menu-surface',
              source: 'result',
              kind: 'popover',
              styleReference: 'popover-surface',
            },
          ],
        },
      ],
    };
    const armScheme = () =>
      scheme({taskInteractions: {'host-menu-in-astryx-dialog': moved}});
    return {
      baseline: measurement({
        light: scheme({interaction: reference}),
        dark: scheme({interaction: reference}),
      }),
      arm: measurement({
        light: armScheme(),
        dark: armScheme(),
        contract,
      }),
    };
  };

  it('accepts a relocated surface that kept the boundary and matches', () => {
    const {baseline, arm} = relocated({tokenScopes: [SCOPE]});
    const score = scoreArm(baseline, arm);
    expect(score.taskFailures).toEqual([]);
    expect(passesAcceptance(score)).toBe(true);
  });

  it('reports a lost boundary distinctly from the colours it changed', () => {
    // The measured failure: the executor carried the host's mode hooks onto the
    // moved menu but not the attribute scoping its palette.
    const {baseline, arm} = relocated({
      tokenScopes: [],
      style: {...STYLE, backgroundColor: 'rgb(255, 255, 255)'},
    });
    const score = scoreArm(baseline, arm);
    expect(score.taskFailures).toContain(
      'light:host-menu-in-astryx-dialog:host-menu-surface:host-boundary',
    );
    expect(score.taskFailures).toContain(
      'dark:host-menu-in-astryx-dialog:host-menu-surface:host-boundary',
    );
    expect(score.taskFailures).toContain(
      'light:host-menu-in-astryx-dialog:host-menu-surface:host-style',
    );
    expect(passesAcceptance(score)).toBe(false);
  });

  it('still reports the lost boundary when the colours were restated to match', () => {
    // The mutation that matters. Copying the region's colours onto the moved
    // element makes every style comparison agree while the element is no longer
    // inside the region, so the next host palette change desynchronizes it
    // silently. Matching colours must not buy a pass.
    const {baseline, arm} = relocated({tokenScopes: []});
    const score = scoreArm(baseline, arm);
    expect(score.taskFailures).not.toContain(
      'light:host-menu-in-astryx-dialog:host-menu-surface:host-style',
    );
    expect(score.taskFailures).toContain(
      'light:host-menu-in-astryx-dialog:host-menu-surface:host-boundary',
    );
    expect(passesAcceptance(score)).toBe(false);
  });

  it('still reports a restyle that happened inside the right boundary', () => {
    // The converse mutation: keeping the boundary must not excuse a real
    // repaint of the host surface.
    const {baseline, arm} = relocated({
      tokenScopes: [SCOPE],
      style: {...STYLE, color: 'rgb(1, 2, 3)'},
    });
    const score = scoreArm(baseline, arm);
    expect(score.taskFailures).toContain(
      'light:host-menu-in-astryx-dialog:host-menu-surface:host-style',
    );
    expect(score.taskFailures).not.toContain(
      'light:host-menu-in-astryx-dialog:host-menu-surface:host-boundary',
    );
    expect(passesAcceptance(score)).toBe(false);
  });

  it('treats a fixture with no scoped regions as trivially satisfied', () => {
    // Two of the three fixtures define tokens only at the root, so every
    // surface records an empty scope list and this check never fires for them.
    const {baseline, arm} = relocated({tokenScopes: []});
    const unscopedBaseline = JSON.parse(
      JSON.stringify(baseline),
    ) as typeof baseline;
    for (const key of ['light', 'dark'] as const) {
      const surfaces = unscopedBaseline.schemes[key].interaction?.surfaces;
      const reference = surfaces?.['popover-surface'];
      if (reference && !('missing' in reference)) {
        reference.tokenScopes = [];
      }
    }
    const score = scoreArm(unscopedBaseline, arm);
    expect(
      score.taskFailures.filter(failure => failure.endsWith('host-boundary')),
    ).toEqual([]);
  });
});
