// Copyright (c) Meta Platforms, Inc. and affiliates.

/** Aggregate setup measurements with strict matrix and acceptance accounting. */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadOptionalExecutionProvenance} from '../src/provenance-aggregation.js';
import {
  compareCandidate,
  failureBreakdown,
  failureCauses,
  hardGateVector,
  isComparableRun,
  passesAcceptance,
  scoreArm,
  strictAcceptanceSummary,
  verdict,
  type FailureBreakdown,
  type FailureKind,
  type HardDimension,
  type HardGateVector,
  type Measurement,
  type SetupScore,
} from './setup-eval.js';
// This JavaScript module is covered by its focused runtime tests.
// @ts-expect-error -- setup-matrix.mjs intentionally has no declaration output.
import {expandSetupMatrix, setupCellKey} from './setup-matrix.mjs';
// This JavaScript module owns the public-boundary checks for emitted reports.
// @ts-expect-error -- public-artifact.mjs intentionally has no declarations.
import {
  assertPublicArtifactSafe,
  sanitizePublicArtifact,
} from '../src/public-artifact.mjs';

type MatrixEntry = {
  id: string;
  fixture: string;
  condition: string;
  prompt: string;
  bundle: string;
  rep: number;
};
type MatrixConfig = {
  stages: Array<{id: string}>;
};
const expandMatrix = expandSetupMatrix as (
  config: MatrixConfig,
  selection: {stage: string},
) => MatrixEntry[];
const cellKey = setupCellKey as (entry: {
  condition: string;
  fixture: string;
  prompt: string;
  bundle: string;
  rep: number;
}) => string;

const HERE = path.dirname(fileURLToPath(import.meta.url));

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

export type SetupAggregateRow = {
  id: string;
  file: string;
  stage: string;
  fixture: string;
  prompt: string;
  condition: string;
  bundle: string;
  executor: string;
  rep: number;
  score: SetupScore;
};

export function assertAggregateReportPublicSafe(value: unknown) {
  assertPublicArtifactSafe(value, {label: 'setup aggregate report'});
}

export function matrixCoverage(
  rows: SetupAggregateRow[],
  expectedEntries: Array<{id: string}>,
) {
  const expected = new Set(expectedEntries.map(entry => entry.id));
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.id, (counts.get(row.id) ?? 0) + 1);
  }
  return {
    missing: [...expected].filter(id => !counts.has(id)).sort(),
    duplicate: [...counts]
      .filter(([, count]) => count > 1)
      .map(([id]) => id)
      .sort(),
    unexpected: [...counts.keys()].filter(id => !expected.has(id)).sort(),
  };
}

export function compareGuidanceRows(rows: SetupAggregateRow[]) {
  const byCell = new Map<
    string,
    Partial<Record<'current' | 'candidate', SetupAggregateRow>>
  >();
  for (const row of rows) {
    if (row.condition !== 'current' && row.condition !== 'candidate') {
      continue;
    }
    const key = [row.fixture, row.prompt, row.bundle, `r${row.rep}`].join('__');
    const pair = byCell.get(key) ?? {};
    pair[row.condition] = row;
    byCell.set(key, pair);
  }
  type GuidanceComparison =
    | {cell: string; complete: false}
    | ({cell: string; complete: true} & ReturnType<typeof compareCandidate>);
  const comparisons: GuidanceComparison[] = [...byCell]
    .map(([cell, pair]): GuidanceComparison => {
      if (!pair.current || !pair.candidate) {
        return {cell, complete: false};
      }
      return {
        cell,
        complete: true,
        ...compareCandidate(pair.current.score, pair.candidate.score),
      };
    })
    .sort((left, right) => left.cell.localeCompare(right.cell));
  const complete = comparisons.every(comparison => comparison.complete);
  const regressions: string[] = [];
  const improvements = new Set<HardDimension>();
  for (const comparison of comparisons) {
    if (!comparison.complete) {
      continue;
    }
    for (const dimension of comparison.regressions) {
      regressions.push(`${comparison.cell}:${dimension}`);
    }
    for (const dimension of comparison.improvements) {
      improvements.add(dimension);
    }
  }
  return {
    comparisons,
    complete,
    regressions,
    improvements: [...improvements].sort(),
  };
}

export type StrategyBreakdown = {
  condition: string;
  present: number;
  /**
   * Runs whose verdict is `clean` **and** whose executor completed. A verdict
   * on an unfinished run describes an unfinished run, so it is not counted
   * here; `verdictCleanNotCompleted` carries those separately.
   */
  clean: number;
  verdictCleanNotCompleted: number;
  comparable: number;
  notCompleted: number;
  accepted: number;
  byVerdict: Record<string, number>;
  byCategory: HardGateVector;
  byFailureKind: FailureBreakdown;
  byPair: Array<{pair: string; present: number; accepted: number}>;
};

/**
 * Per-strategy, per-failure-category accounting for the strategy pilot.
 *
 * Deliberately returns separate counts rather than one combined figure: the
 * pilot compares two strategies that make different tradeoffs, and collapsing
 * them into a single score would hide which category actually failed. No
 * ranking, weighting, or advance/reject decision is produced here.
 *
 * Two separations matter and are both kept:
 *
 * 1. **What failed.** `byFailureKind` splits measured host damage from an
 *    integrity/escape-hatch failure, from a task failure, from a telemetry or
 *    run-note failure. The verdict alone calls several of those `silent-damage`
 *    and reads as if the host was repainted.
 * 2. **Whether the run finished.** A strategy is never called cleaner on the
 *    strength of a run its executor did not complete. Those runs are reported
 *    under `notCompleted` and excluded from `clean` and `comparable`.
 */
export function compareStrategyRows(
  rows: SetupAggregateRow[],
  conditions: string[],
): StrategyBreakdown[] {
  return conditions.map(condition => {
    const scoped = rows.filter(row => row.condition === condition);
    const byVerdict: Record<string, number> = {};
    const byCategory = {
      build: 0,
      runtime: 0,
      taskCompletion: 0,
      color: 0,
      font: 0,
      radius: 0,
      border: 0,
      shadow: 0,
      geometry: 0,
      contrast: 0,
      layering: 0,
    } as HardGateVector;
    const byFailureKind: FailureBreakdown = {
      hostDamage: 0,
      runtime: 0,
      integrity: 0,
      task: 0,
      telemetry: 0,
    };
    const pairs = new Map<string, {present: number; accepted: number}>();

    for (const row of scoped) {
      const rowVerdict = verdict(row.score);
      byVerdict[rowVerdict] = (byVerdict[rowVerdict] ?? 0) + 1;
      const vector = hardGateVector(row.score);
      for (const dimension of Object.keys(byCategory) as HardDimension[]) {
        byCategory[dimension] += vector[dimension];
      }
      const kinds = failureBreakdown(row.score);
      for (const kind of Object.keys(byFailureKind) as FailureKind[]) {
        byFailureKind[kind] += kinds[kind];
      }
      const pairKey = `${row.fixture}/${row.prompt}`;
      const pair = pairs.get(pairKey) ?? {present: 0, accepted: 0};
      pair.present += 1;
      if (passesAcceptance(row.score)) {
        pair.accepted += 1;
      }
      pairs.set(pairKey, pair);
    }

    return {
      condition,
      present: scoped.length,
      clean: scoped.filter(
        row => verdict(row.score) === 'clean' && isComparableRun(row.score),
      ).length,
      verdictCleanNotCompleted: scoped.filter(
        row => verdict(row.score) === 'clean' && !isComparableRun(row.score),
      ).length,
      comparable: scoped.filter(row => isComparableRun(row.score)).length,
      notCompleted: scoped.filter(row => !isComparableRun(row.score)).length,
      accepted: scoped.filter(row => passesAcceptance(row.score)).length,
      byVerdict,
      byCategory,
      byFailureKind,
      byPair: [...pairs]
        .map(([pair, counts]) => ({pair, ...counts}))
        .sort((left, right) => left.pair.localeCompare(right.pair)),
    };
  });
}

function renderTable(rows: SetupAggregateRow[]) {
  const header = [
    'stage',
    'fixture',
    'prompt',
    'condition',
    'executor',
    'rep',
    'run',
    'builds',
    'runtime',
    'regressions',
    'unreadable',
    'layers',
    'task',
    'integrity',
    'verdict',
    'cause',
    'accepts',
  ];
  const body = rows.map(row => [
    row.stage,
    row.fixture,
    row.prompt,
    row.condition,
    row.executor,
    String(row.rep || '-'),
    row.score.validRun
      ? row.score.executionSucceeded
        ? 'ok'
        : 'AGENT-FAILURE'
      : 'INVALID',
    row.score.builds ? 'yes' : 'NO',
    String(row.score.consoleErrors + row.score.failedRequests),
    `${row.score.regressions} (${Object.entries(row.score.byCategory)
      .filter(([, count]) => count > 0)
      .map(([category, count]) => `${category[0]}${count}`)
      .join(' ')})`,
    String(row.score.contrastFailures.length),
    String(
      row.score.layeringFailures.length + row.score.layerOrderFailures.length,
    ),
    row.score.taskSuccess ? 'yes' : 'NO',
    String(row.score.integrityFailures.length),
    verdict(row.score),
    failureCauses(row.score).join('+') || '-',
    passesAcceptance(row.score) ? 'yes' : 'NO',
  ]);
  const widths = header.map((heading, index) =>
    Math.max(heading.length, ...body.map(row => row[index].length)),
  );
  const line = (cells: string[]) =>
    cells.map((cell, index) => cell.padEnd(widths[index])).join(' | ');
  console.log(line(header));
  console.log(widths.map(width => '-'.repeat(width)).join('-+-'));
  for (const row of body) {
    console.log(line(row));
  }
}

async function main() {
  const directory = path.resolve(argument('dir', 'results'));
  const legacyBaseline = argument('baseline', 'baseline');
  const matrixFile = path.resolve(
    argument('matrix', path.join(HERE, 'matrix.json')),
  );
  const stageId = argument('stage', 'confirmation');
  const matrix = JSON.parse(
    fs.readFileSync(matrixFile, 'utf8'),
  ) as MatrixConfig;
  const stage = matrix.stages.find(entry => entry.id === stageId);
  if (!stage) {
    throw new Error(`unknown stage: ${stageId}`);
  }
  const expectedEntries = expandMatrix(matrix, {stage: stageId});

  const load = (file: string): Measurement =>
    JSON.parse(
      fs.readFileSync(path.join(directory, file), 'utf8'),
    ) as Measurement;
  const measurementFiles = fs
    .readdirSync(directory)
    .filter(
      file => file.endsWith('.json') && !file.endsWith('.provenance.json'),
    );
  const baselineFiles = new Map(
    measurementFiles
      .filter(file => file.startsWith('baseline__'))
      .map(file => [file.slice('baseline__'.length, -'.json'.length), file]),
  );
  const armFiles = measurementFiles.filter(
    file => !file.startsWith('baseline__') && file !== `${legacyBaseline}.json`,
  );

  const rows = armFiles.flatMap(file => {
    const stem = path.basename(file, '.json');
    const provenance = loadOptionalExecutionProvenance(
      path.join(directory, `${stem}.provenance.json`),
    );
    if (!provenance) {
      return [];
    }
    const matrixMetadata = provenance.matrix as
      {stage?: string; bundle?: string} | undefined;
    const rowStage = matrixMetadata?.stage ?? 'unknown';
    if (rowStage !== stageId) {
      return [];
    }
    const arm = load(file);
    const fixture = provenance.fixture?.id ?? arm.fixture;
    const baselineFile =
      (fixture && baselineFiles.get(fixture)) ?? `${legacyBaseline}.json`;
    if (!fixture || !fs.existsSync(path.join(directory, baselineFile))) {
      throw new Error(
        `No baseline measurement found for fixture ${fixture ?? 'unknown'}`,
      );
    }
    const dimensions = {
      condition: provenance.condition ?? 'unknown',
      fixture,
      prompt: provenance.task?.id ?? 'unknown',
      bundle: matrixMetadata?.bundle ?? 'unknown',
      rep: provenance.rep ?? 0,
    };
    return [
      {
        id: `${rowStage}__${cellKey(dimensions)}`,
        file,
        stage: rowStage,
        fixture,
        prompt: dimensions.prompt,
        condition: dimensions.condition,
        bundle: dimensions.bundle,
        executor: provenance.executor
          ? `${provenance.executor.harness}/${provenance.executor.model}`
          : 'unknown/unknown',
        rep: dimensions.rep,
        score: scoreArm(load(baselineFile), arm),
      },
    ];
  });

  const coverage = matrixCoverage(rows, expectedEntries);
  const completeCoverage =
    coverage.missing.length === 0 &&
    coverage.duplicate.length === 0 &&
    coverage.unexpected.length === 0;
  const summary = strictAcceptanceSummary(
    rows.map(row => row.score),
    expectedEntries.length,
    completeCoverage,
  );
  assertAggregateReportPublicSafe({stageId, rows, coverage});

  console.log(`\nSetup run — stage: ${stageId}\n`);
  renderTable(rows);
  console.log(
    `\nCoverage: ${summary.coverage.valid}/${summary.coverage.expected} valid` +
      ` (${summary.coverage.present} present)`,
  );
  console.log(
    `Strict clean rate: ${summary.strictClean.numerator}/${summary.strictClean.denominator}`,
  );
  console.log(
    `Damage-free: ${summary.damageFree.numerator}/${summary.damageFree.denominator}`,
  );
  if (coverage.missing.length > 0) {
    console.log(`Missing cells: ${coverage.missing.join(', ')}`);
  }
  if (coverage.duplicate.length > 0) {
    console.log(`Duplicate cells: ${coverage.duplicate.join(', ')}`);
  }
  if (coverage.unexpected.length > 0) {
    console.log(`Unexpected cells: ${coverage.unexpected.join(', ')}`);
  }

  if (stageId === 'guidance') {
    const comparison = compareGuidanceRows(rows);
    console.log('\nCandidate minus current by cell (negative is better):');
    for (const result of comparison.comparisons) {
      if (!result.complete) {
        console.log(`  ${result.cell}: INCOMPLETE`);
        continue;
      }
      const deltas = Object.entries(result.deltas)
        .map(
          ([dimension, delta]) =>
            `${dimension}=${delta >= 0 ? '+' : ''}${delta}`,
        )
        .join(' ');
      console.log(`  ${result.cell}: ${deltas}`);
    }
    console.log(
      'Exploratory comparison only: review the explicit tradeoffs; no automatic ranking is applied.',
    );
  }

  const isIteration = stageId.startsWith('strategy-iteration');
  if (stageId === 'strategy-pilot' || isIteration) {
    const pilotConditions = [
      ...new Set(expectedEntries.map(entry => entry.condition)),
    ].sort();
    console.log('\nBy strategy — acceptance and failure categories:');
    for (const breakdown of compareStrategyRows(rows, pilotConditions)) {
      const verdicts = Object.entries(breakdown.byVerdict)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, count]) => `${name}=${count}`)
        .join(' ');
      const categories = Object.entries(breakdown.byCategory)
        .filter(([, count]) => count > 0)
        .map(([category, count]) => `${category}=${count}`)
        .join(' ');
      const kinds = Object.entries(breakdown.byFailureKind)
        .filter(([, count]) => count > 0)
        .map(([kind, count]) => `${kind}=${count}`)
        .join(' ');
      console.log(`\n  ${breakdown.condition}`);
      console.log(
        `    accepted ${breakdown.accepted}/${breakdown.present} present` +
          ` (clean ${breakdown.clean} of ${breakdown.comparable} completed runs)`,
      );
      if (breakdown.notCompleted > 0) {
        console.log(
          `    ${breakdown.notCompleted} run(s) the executor did not complete` +
            ` — excluded from the clean count` +
            (breakdown.verdictCleanNotCompleted > 0
              ? `, ${breakdown.verdictCleanNotCompleted} of which measured` +
                ` 'clean' on unfinished work`
              : '') +
            '. Those cells need rerunning; they are not evidence for this' +
            ' strategy.',
        );
      }
      console.log(`    verdicts: ${verdicts || 'none'}`);
      console.log(`    failure kinds: ${kinds || 'none'}`);
      console.log(`    failure categories: ${categories || 'none'}`);
      for (const pair of breakdown.byPair) {
        console.log(
          `    ${pair.pair}: accepted ${pair.accepted}/${pair.present}`,
        );
      }
    }
    console.log(
      '\nThe two strategies are reported separately and are not ranked against' +
        ' each other. They make different tradeoffs, so no combined score is' +
        ' emitted. Final acceptance is unchanged: every valid run must be clean.',
    );
    console.log(
      'Failure kinds are reported apart from the verdict on purpose. Measured' +
        ' host damage, an integrity or escape-hatch failure, a task failure,' +
        ' and a telemetry or run-note failure are different problems that the' +
        ' verdict alone spells the same way, and only the first is the host' +
        ' being changed. A run the executor did not complete is never counted' +
        ' as a clean run for its strategy, whatever its measurement says.',
    );
    if (isIteration) {
      const pairs = (
        stage as {
          comparisonMapping?: {
            pairs?: Array<{
              iteration: string;
              pilot?: string;
              predecessor?: string;
              pilotFinding?: string;
              priorFinding?: string;
              changed: string;
            }>;
          };
        }
      ).comparisonMapping?.pairs;
      if (pairs?.length) {
        console.log(
          '\nEach cell below reruns an earlier cell under a new condition id.' +
            ' Those earlier cells are unchanged and remain the record of what' +
            " they measured; this stage's result is read beside them, not in" +
            ' place of them.',
        );
        for (const pair of pairs) {
          console.log(`\n  ${pair.iteration}`);
          console.log(`    reruns  ${pair.predecessor ?? pair.pilot}`);
          console.log(`    finding ${pair.priorFinding ?? pair.pilotFinding}`);
          console.log(`    changed ${pair.changed}`);
        }
      }
    }
    console.log(
      `${isIteration ? 'Strategy iteration' : 'Strategy pilot'}: ${completeCoverage && summary.passes ? 'PASS' : 'FAIL'}`,
    );
    if (!completeCoverage || !summary.passes) {
      process.exitCode = 1;
    }
  }

  if (stageId === 'confirmation') {
    console.log(
      `Final confirmation: ${completeCoverage && summary.passes ? 'PASS' : 'FAIL'}`,
    );
    if (!completeCoverage || !summary.passes) {
      process.exitCode = 1;
    }
  }
}

const isMain =
  process.argv[1] != null &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  await main().catch(error => {
    const message = sanitizePublicArtifact(String(error), {
      privateValues: [
        process.cwd(),
        process.env.HOME,
        process.env.USER,
        process.env.HOSTNAME,
      ].filter((value): value is string => typeof value === 'string'),
    });
    console.error(message);
    process.exitCode = 1;
  });
}
