// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {
  assertAggregateReportPublicSafe,
  compareGuidanceRows,
  compareStrategyRows,
  matrixCoverage,
  type SetupAggregateRow,
} from './setup-aggregate.js';
import type {Regression, SetupScore} from './setup-eval.js';

function score(regressions: Regression[] = []): SetupScore {
  return {
    label: 'run',
    builds: true,
    clean: true,
    validRun: true,
    executionSucceeded: true,
    consoleErrors: 0,
    failedRequests: 0,
    regressions: regressions.length,
    regressionDetails: regressions,
    byCategory: {
      typography: regressions.filter(item => item.category === 'typography')
        .length,
      color: regressions.filter(item => item.category === 'color').length,
      geometry: regressions.filter(item => item.category === 'geometry').length,
      spacing: regressions.filter(item => item.category === 'spacing').length,
    },
    baselineFailures: [],
    missingProbes: [],
    contrastFailures: [],
    modeDependent: [],
    variablesCaptured: [],
    measurementErrors: [],
    layeringFailures: [],
    layerOrderFailures: [],
    cascadeInverted: false,
    layerOrder: [],
    taskSuccess: true,
    taskFailures: [],
    integrityFailures: [],
  };
}

function regression(
  property: string,
  category: Regression['category'],
): Regression {
  return {
    probe: 'host',
    property,
    category,
    before: 'before',
    after: 'after',
  };
}

function row(
  condition: 'current' | 'candidate',
  value: SetupScore,
  suffix = '',
): SetupAggregateRow {
  return {
    id: `guidance__${condition}__fixture__prompt__bundle__r1${suffix}`,
    file: `${condition}${suffix}.json`,
    stage: 'guidance',
    fixture: 'fixture',
    prompt: 'prompt',
    condition,
    bundle: 'bundle',
    executor: 'harness/model',
    rep: 1,
    score: value,
  };
}

describe('setup aggregation policy', () => {
  it('fails closed on missing, duplicate, and unexpected matrix cells', () => {
    const current = row('current', score());
    const duplicate = {...current, file: 'duplicate.json'};
    const unexpected = {...current, id: 'guidance__unexpected'};
    expect(
      matrixCoverage(
        [current, duplicate, unexpected],
        [{id: current.id}, {id: 'guidance__required'}],
      ),
    ).toEqual({
      missing: ['guidance__required'],
      duplicate: [current.id],
      unexpected: ['guidance__unexpected'],
    });
  });

  it('reports every per-dimension tradeoff without assigning an automatic rank', () => {
    const current = row('current', score([regression('color', 'color')]));
    const candidate = row(
      'candidate',
      score([regression('borderTopLeftRadius', 'geometry')]),
    );
    const result = compareGuidanceRows([current, candidate]);
    expect(result.comparisons[0]).toMatchObject({
      complete: true,
      deltas: {color: -1, radius: 1},
      regressions: ['radius'],
      improvements: ['color'],
    });
    expect(result).not.toHaveProperty('advances');
    expect(result).not.toHaveProperty('score');
  });

  it('marks an incomplete pair without turning it into a ranking verdict', () => {
    const candidate = row('candidate', score());
    expect(compareGuidanceRows([candidate])).toMatchObject({
      complete: false,
      regressions: [],
      improvements: [],
    });
  });

  it('rejects aggregate report data containing absolute paths or private hosts', () => {
    const absoluteFile = {
      ...row('candidate', score()),
      file: '/home/example/results/candidate.json',
    };
    expect(() => assertAggregateReportPublicSafe([absoluteFile])).toThrow(
      /contains private path or host data/,
    );

    const privateHost = {
      ...row('candidate', score()),
      executor: 'runner.internal.example/model',
    };
    expect(() => assertAggregateReportPublicSafe([privateHost])).toThrow(
      /contains private path or host data/,
    );
    expect(() =>
      assertAggregateReportPublicSafe([row('candidate', score())]),
    ).not.toThrow();
  });
});

describe('strategy pilot reporting', () => {
  function strategyRow(
    condition: 'host-aligned' | 'guest-contained',
    value: SetupScore,
    fixture = 'shadcn-tailwind-v4-established',
    prompt = 's1',
  ): SetupAggregateRow {
    return {
      id: `strategy-pilot__${condition}__${fixture}__${prompt}__bundle__r1`,
      file: `${condition}-${fixture}-${prompt}.json`,
      stage: 'strategy-pilot',
      fixture,
      prompt,
      condition,
      bundle: 'bundle',
      executor: 'harness/model',
      rep: 1,
      score: value,
    };
  }

  it('reports each strategy separately and never combines them', () => {
    const damaged = score([regression('fontFamily', 'typography')]);
    const breakdowns = compareStrategyRows(
      [
        strategyRow('host-aligned', score()),
        strategyRow('guest-contained', damaged),
      ],
      ['host-aligned', 'guest-contained'],
    );

    expect(breakdowns.map(entry => entry.condition)).toEqual([
      'host-aligned',
      'guest-contained',
    ]);
    expect(breakdowns[0]).toMatchObject({present: 1, accepted: 1, clean: 1});
    expect(breakdowns[1]).toMatchObject({present: 1, accepted: 0});
    // No combined figure, ranking, or winner is produced.
    expect(Object.keys(breakdowns[0])).not.toContain('score');
    expect(Object.keys(breakdowns[0])).not.toContain('rank');
    expect(Object.keys(breakdowns[0])).not.toContain('winner');
  });

  it('attributes failures to a named category rather than one opaque total', () => {
    const [breakdown] = compareStrategyRows(
      [
        strategyRow(
          'guest-contained',
          score([
            regression('fontFamily', 'typography'),
            regression('color', 'color'),
          ]),
        ),
      ],
      ['guest-contained'],
    );
    expect(breakdown.byCategory.font).toBe(1);
    expect(breakdown.byCategory.color).toBe(1);
    expect(breakdown.byCategory.radius).toBe(0);
    // The categories are reported individually, so a reader can see which
    // dimension failed instead of only how many failures there were.
    const named = Object.entries(breakdown.byCategory).filter(
      ([, count]) => count > 0,
    );
    expect(named.map(([name]) => name).sort()).toEqual(['color', 'font']);
  });

  it('breaks results down by fixture-prompt pair', () => {
    const breakdowns = compareStrategyRows(
      [
        strategyRow('host-aligned', score()),
        strategyRow(
          'host-aligned',
          score([regression('color', 'color')]),
          'enterprise-scoped-synthetic',
          's5',
        ),
      ],
      ['host-aligned'],
    );
    expect(breakdowns[0].byPair).toEqual([
      {pair: 'enterprise-scoped-synthetic/s5', present: 1, accepted: 0},
      {pair: 'shadcn-tailwind-v4-established/s1', present: 1, accepted: 1},
    ]);
  });

  it('keeps acceptance strict: any damage fails the strategy cell', () => {
    const [breakdown] = compareStrategyRows(
      [
        strategyRow('host-aligned', score()),
        strategyRow('host-aligned', score([regression('color', 'color')])),
      ],
      ['host-aligned'],
    );
    expect(breakdown.present).toBe(2);
    expect(breakdown.accepted).toBe(1);
    // Final acceptance is unchanged by the pilot: 100% clean or it fails.
    expect(breakdown.accepted).toBeLessThan(breakdown.present);
  });

  it('reports a strategy with no rows as empty rather than passing', () => {
    const [breakdown] = compareStrategyRows([], ['host-aligned']);
    expect(breakdown).toMatchObject({present: 0, accepted: 0, clean: 0});
    expect(breakdown.byPair).toEqual([]);
  });

  /**
   * The four failure kinds the pilot conflated.
   *
   * `verdict` answers one question — is this run acceptable — and answers it
   * `silent-damage` for a repainted host, for an escape hatch, and for a task
   * the executor did not finish. Those are different problems with different
   * next steps, and the report has to say which one happened.
   */
  it('reports each failure kind apart from the verdict', () => {
    // `verdict` answers one question — is this run acceptable — and answers it
    // `silent-damage` for a repainted host, for an escape hatch, and for a task
    // the executor did not finish. Those are different problems with different
    // next steps, and the report has to say which one happened. The old
    // category vector says only `taskCompletion=3`, which reads as three task
    // failures.
    const damaged = score([regression('color', 'color')]);
    const mixed = score();
    mixed.taskSuccess = false;
    mixed.taskFailures = ['light:host-menu:host-style'];
    mixed.integrityFailures = ['gitignore-modified'];
    mixed.executionSucceeded = false;

    const [damage, other] = compareStrategyRows(
      [
        strategyRow('host-aligned', damaged),
        strategyRow('guest-contained', mixed),
      ],
      ['host-aligned', 'guest-contained'],
    );

    expect(damage.byFailureKind).toMatchObject({hostDamage: 1, integrity: 0});
    expect(other.byCategory.taskCompletion).toBe(3);
    expect(other.byFailureKind).toMatchObject({
      task: 1,
      integrity: 1,
      telemetry: 1,
      hostDamage: 0,
    });
    // Both are unacceptable, and only one of them is the host changing.
    expect(damage.accepted).toBe(0);
    expect(other.accepted).toBe(0);
  });

  /**
   * The exact shape the pilot produced: `host-aligned` measured `clean` on a
   * cell whose executor did not finish. Nothing damaged the host because the
   * work stopped, and reading that as a clean run makes the strategy look
   * better than the evidence supports.
   */
  describe('a run the executor did not complete is not evidence', () => {
    function agentFailure() {
      const value = score();
      value.executionSucceeded = false;
      return value;
    }

    it('excludes it from the clean count and names it separately', () => {
      const [breakdown] = compareStrategyRows(
        [strategyRow('host-aligned', agentFailure())],
        ['host-aligned'],
      );

      expect(breakdown.present).toBe(1);
      // Its verdict is `clean`; the completed-run count is what stops that
      // reading as evidence for the strategy.
      expect(breakdown.byVerdict.clean).toBe(1);
      expect(breakdown.clean).toBe(0);
      expect(breakdown.verdictCleanNotCompleted).toBe(1);
      expect(breakdown.comparable).toBe(0);
      expect(breakdown.notCompleted).toBe(1);
      expect(breakdown.accepted).toBe(0);
    });

    it('still counts a completed clean run as clean', () => {
      const [breakdown] = compareStrategyRows(
        [strategyRow('host-aligned', score())],
        ['host-aligned'],
      );
      expect(breakdown.clean).toBe(1);
      expect(breakdown.comparable).toBe(1);
      expect(breakdown.notCompleted).toBe(0);
      expect(breakdown.verdictCleanNotCompleted).toBe(0);
    });
  });

  it('emits a public-safe strategy report', () => {
    const breakdowns = compareStrategyRows(
      [strategyRow('host-aligned', score())],
      ['host-aligned'],
    );
    expect(() => assertAggregateReportPublicSafe(breakdowns)).not.toThrow();
  });
});
