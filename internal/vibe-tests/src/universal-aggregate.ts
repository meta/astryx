#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Universal aggregate scoring across 5+1 dimensions (design is optional)
 *
 * Scores an iteration's results using target-neutral evaluation.
 *
 * Usage:
 *   tsx src/universal-aggregate.ts --iteration <id>
 *   tsx src/universal-aggregate.ts --iteration <id> --json
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  ExecutionProvenanceFilter,
  PromptCostMetrics,
  UniversalDimension,
  UniversalRunSummary,
  UniversalScore,
  UniversalAggregate,
} from './types.js';
import {getResultsDir, writeJson, ensureTsxFiles} from './utils.js';
import {evaluate, getDimensionNames} from './universal-eval.js';
import {provenanceFilename} from './provenance.js';
// @ts-expect-error -- public-artifact.mjs intentionally has no declaration output.
import {
  assertPublicArtifactSafe,
  sanitizePublicArtifact,
} from './public-artifact.mjs';
import {
  buildExecutionBreakdown,
  loadOptionalExecutionProvenance,
  matchesExecutionFilter,
  resolveDuration,
  resolveUsage,
} from './provenance-aggregation.js';

const DIMENSION_LABELS: Partial<Record<UniversalDimension, string>> = {
  correctness: 'Correctness',
  accessibility: 'Accessibility',
  codeQuality: 'Code Quality',
  efficiency: 'Efficiency',
  maintainability: 'Maintainability',
  design: 'Design',
};

function runtimePrivateValues(): string[] {
  return [
    process.cwd(),
    process.env.HOME,
    process.env.USER,
    process.env.HOSTNAME,
  ].filter((value): value is string => typeof value === 'string');
}

function publicMessage(value: unknown, privateValues = runtimePrivateValues()) {
  return sanitizePublicArtifact(String(value), {privateValues}) as string;
}

function parseArgs(): {
  iteration: string;
  json: boolean;
  filter: ExecutionProvenanceFilter;
} {
  const args = process.argv.slice(2);
  let iteration = '';
  let json = false;
  const filter: ExecutionProvenanceFilter = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--iteration' && args[i + 1]) {
      iteration = args[i + 1];
      i++;
    } else if (args[i] === '--json') {
      json = true;
    } else if (args[i] === '--harness' && args[i + 1]) {
      filter.harness = args[++i];
    } else if (args[i] === '--model' && args[i + 1]) {
      filter.model = args[++i];
    } else if (args[i] === '--fixture' && args[i + 1]) {
      filter.fixture = args[++i];
    } else if (args[i] === '--condition' && args[i + 1]) {
      filter.condition = args[++i];
    }
  }

  if (!iteration) {
    console.error(
      'Usage: tsx src/universal-aggregate.ts --iteration <id> [--json] [--harness <label>] [--model <label>] [--fixture <id>] [--condition <label>]',
    );
    process.exit(1);
  }

  return {iteration, json, filter};
}

async function main() {
  const {iteration, json, filter} = parseArgs();
  const resultsDir = getResultsDir();
  const iterDir = path.join(resultsDir, iteration);
  const codeDir = path.join(iterDir, 'results');
  const manifestPath = path.join(iterDir, 'manifest.json');
  const privateValues = [iterDir, resultsDir, ...runtimePrivateValues()];

  if (!fs.existsSync(manifestPath)) {
    console.error('No manifest.json found for the requested iteration');
    process.exit(1);
  }

  if (!fs.existsSync(codeDir)) {
    console.error('No results directory found for the requested iteration');
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const target = (manifest.config?.target || 'astryx') as string;
  const promptMap = new Map<string, string>(
    (manifest.prompts || []).map((p: {id: string; category: string}) => [
      p.id,
      p.category,
    ]),
  );

  // Load .tsx files (extract from JSON results if needed)
  ensureTsxFiles(codeDir);
  const files = fs.readdirSync(codeDir).filter(f => f.endsWith('.tsx'));

  if (files.length === 0) {
    console.error('No .tsx result files found');
    process.exit(1);
  }

  const dimensions = getDimensionNames();
  const byPrompt: Record<string, UniversalScore> = {};
  const categoryScores: Record<
    string,
    Record<UniversalDimension, number[]>
  > = {};
  let darkModeCount = 0;

  // Cost and provenance tracking
  const costByPrompt: Record<string, PromptCostMetrics> = {};
  const runs: UniversalRunSummary[] = [];

  /** Rough doc size estimates in chars (for input token calculation) */
  const DOC_CHAR_SIZES: Record<string, number> = {
    'AGENTS.md': 1200,
    'AGENTS.baseline.md': 740,
    'principles.md': 1130,
    'tokens.md': 3600,
  };
  const DEFAULT_DOC_SIZE = 2500; // avg component doc size

  for (const file of files) {
    const promptId = path.basename(file, '.tsx');
    const codePath = path.join(codeDir, file);
    const provenance = loadOptionalExecutionProvenance(
      path.join(codeDir, provenanceFilename(promptId)),
    );
    if (!matchesExecutionFilter(provenance, filter)) {
      continue;
    }
    const code = fs.readFileSync(codePath, 'utf-8');
    const score = evaluate(code, target, {iterDir, promptId});
    byPrompt[promptId] = score;

    if (score.maintainability.metrics?.darkModeSupport) {
      darkModeCount++;
    }

    const category = promptMap.get(promptId) ?? 'unknown';
    if (!categoryScores[category]) {
      const catInit = {};
      categoryScores[category] = catInit as Record<
        UniversalDimension,
        number[]
      >;
      for (const dim of dimensions) {
        categoryScores[category][dim] = [];
      }
    }
    for (const dim of dimensions) {
      const dimScore = score[dim];
      if (dimScore) {
        categoryScores[category][dim].push(dimScore.score);
      }
    }

    // --- Cost and execution data ---
    let docsRead: string[] = [];
    let completedAt: string | undefined;
    const jsonPath = path.join(codeDir, `${promptId}.json`);
    if (fs.existsSync(jsonPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        docsRead = Array.isArray(meta.docsRead) ? meta.docsRead : [];
        completedAt = meta.completedAt;
      } catch {
        // Legacy metadata remains best-effort. Provenance sidecars are validated.
      }
    }

    const taskPath = path.join(iterDir, 'tasks', `${promptId}.json`);
    let createdAt: string | undefined;
    let taskMtimeMs: number | undefined;
    if (fs.existsSync(taskPath)) {
      taskMtimeMs = fs.statSync(taskPath).mtimeMs;
      try {
        const taskMeta = JSON.parse(fs.readFileSync(taskPath, 'utf-8'));
        createdAt = taskMeta.createdAt;
      } catch {
        // Legacy task metadata remains best-effort.
      }
    }

    let estimatedInputChars = 1500;
    for (const doc of docsRead) {
      const key = doc.endsWith('.md') ? doc : `${doc}.md`;
      estimatedInputChars += DOC_CHAR_SIZES[key] || DEFAULT_DOC_SIZE;
    }
    const estimatedInputTokens = Math.round(estimatedInputChars / 4);
    const estimatedOutputTokens = Math.round(code.length / 4);
    const duration = resolveDuration({
      provenance,
      legacyStartedAt: createdAt,
      legacyFinishedAt: completedAt,
      taskMtimeMs,
      resultMtimeMs: fs.statSync(codePath).mtimeMs,
    });
    const usage = resolveUsage({
      provenance,
      estimatedInputTokens,
      estimatedOutputTokens,
    });

    costByPrompt[promptId] = {
      durationMs: duration.valueMs ?? 0,
      durationSource: duration.source,
      durationQuality: duration.quality,
      outputChars: code.length,
      outputLines: code.split('\n').length,
      docsRead,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      tokenSource: usage.source,
      tokenQuality: usage.quality,
      usageComplete: usage.complete,
      estimatedInputTokens,
      estimatedOutputTokens,
    };
    runs.push({
      promptId,
      taskId: provenance?.task?.id ?? promptId,
      harness: provenance?.executor?.harness ?? 'unknown',
      model: provenance?.executor?.model ?? 'unknown',
      ...(provenance?.executor?.effort
        ? {effort: provenance.executor.effort}
        : {}),
      ...(provenance?.fixture?.id ? {fixture: provenance.fixture.id} : {}),
      ...(provenance?.condition ? {condition: provenance.condition} : {}),
      ...(provenance?.rep ? {rep: provenance.rep} : {}),
      ...(provenance?.execution?.status
        ? {executionStatus: provenance.execution.status}
        : {}),
      score,
      duration,
      usage,
    });
  }

  if (runs.length === 0) {
    throw new Error('No results matched the requested provenance filters');
  }

  // --- Merge design scores if available ---
  const designScoresPath = path.join(iterDir, 'design-scores.json');
  let hasDesignScores = false;
  if (fs.existsSync(designScoresPath)) {
    try {
      const designData = JSON.parse(fs.readFileSync(designScoresPath, 'utf-8'));
      const summary = designData.summary as Record<
        string,
        Record<string, {overall: number; sub: Record<string, number>}>
      >;
      for (const [promptId, targets] of Object.entries(summary)) {
        const targetScores = targets[target];
        if (targetScores && byPrompt[promptId]) {
          // Find the full result for variance calculation
          const fullResults = (designData.results || []).filter(
            (r: {promptId: string; target: string}) =>
              r.promptId === promptId && r.target === target,
          );
          const passes = fullResults[0]?.passes || [];
          const overallValues = passes.map((p: {overall: number}) => p.overall);
          const maxVariance =
            overallValues.length > 1
              ? Math.max(...overallValues) - Math.min(...overallValues)
              : 0;

          byPrompt[promptId].design = {
            score: targetScores.overall,
            metrics: {
              layout: targetScores.sub.layout,
              hierarchy: targetScores.sub.hierarchy,
              spacing: targetScores.sub.spacing,
              components: targetScores.sub.components,
              color: targetScores.sub.color,
              passCount: passes.length || designData.passCount || 3,
              maxVariance,
            },
          };
          hasDesignScores = true;
        }
      }
    } catch (err) {
      console.error(
        `Warning: Failed to load design scores: ${publicMessage(err, privateValues)}`,
      );
    }
  }

  // Compute averages
  const promptCount = Object.keys(byPrompt).length;
  const averagesInit = {};
  const averages = averagesInit as Record<UniversalDimension, number>;
  for (const dim of dimensions) {
    const scores = Object.values(byPrompt)
      .map(s => s[dim]?.score)
      .filter((s): s is number => s != null);
    averages[dim] =
      scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : 0;
  }
  // Design average: only across prompts that have design scores
  if (hasDesignScores) {
    const designScores = Object.values(byPrompt)
      .filter(s => s.design != null)
      .map(s => s.design?.score ?? 0);
    if (designScores.length > 0) {
      averages.design = Math.round(
        designScores.reduce((a, b) => a + b, 0) / designScores.length,
      );
    }
  }

  const overallDims = [...dimensions];
  if (hasDesignScores && averages.design != null) {
    overallDims.push('design' as UniversalDimension);
  }
  const overall = Math.round(
    overallDims.reduce((s, d) => s + (averages[d] ?? 0), 0) /
      overallDims.length,
  );

  // Category averages
  const byCategory: Record<string, Record<UniversalDimension, number>> = {};
  for (const [cat, dimScores] of Object.entries(categoryScores)) {
    const byCatInit = {};
    byCategory[cat] = byCatInit as Record<UniversalDimension, number>;
    for (const dim of dimensions) {
      const scores = dimScores[dim];
      byCategory[cat][dim] = Math.round(
        scores.reduce((a, b) => a + b, 0) / scores.length,
      );
    }
  }

  const darkModeRate = Math.round((darkModeCount / promptCount) * 100);

  // Compute cost aggregates. Selected token totals are only comparable when
  // every run reports complete usage; estimates remain available separately.
  const costEntries = Object.values(costByPrompt);
  const totalDurationMs = costEntries.reduce((s, c) => s + c.durationMs, 0);
  const totalOutputChars = costEntries.reduce((s, c) => s + c.outputChars, 0);
  const totalOutputLines = costEntries.reduce((s, c) => s + c.outputLines, 0);
  const totalDocsRead = costEntries.reduce((s, c) => s + c.docsRead.length, 0);
  const completeUsageRuns = costEntries.filter(c => c.usageComplete).length;
  const usageComplete = completeUsageRuns === costEntries.length;
  const selectedInputTokens = usageComplete
    ? costEntries.reduce((s, c) => s + (c.inputTokens ?? 0), 0)
    : null;
  const selectedOutputTokens = usageComplete
    ? costEntries.reduce((s, c) => s + (c.outputTokens ?? 0), 0)
    : null;
  const totalEstimatedInputTokens = costEntries.reduce(
    (s, c) => s + c.estimatedInputTokens,
    0,
  );
  const totalEstimatedOutputTokens = costEntries.reduce(
    (s, c) => s + c.estimatedOutputTokens,
    0,
  );
  const durationSources: Record<string, number> = {};
  for (const entry of costEntries) {
    durationSources[entry.durationSource] =
      (durationSources[entry.durationSource] ?? 0) + 1;
  }

  let aggregate: UniversalAggregate = {
    averages,
    overall,
    byPrompt,
    byCategory,
    darkModeRate,
    cost: {
      totalDurationMs,
      avgDurationMs: Math.round(totalDurationMs / promptCount),
      avgOutputChars: Math.round(totalOutputChars / promptCount),
      avgOutputLines: Math.round(totalOutputLines / promptCount),
      avgDocsRead: Math.round((totalDocsRead / promptCount) * 10) / 10,
      inputTokens: selectedInputTokens,
      outputTokens: selectedOutputTokens,
      usageComplete,
      completeUsageRuns,
      incompleteUsageRuns: costEntries.length - completeUsageRuns,
      durationSources,
      estimatedInputTokens: totalEstimatedInputTokens,
      estimatedOutputTokens: totalEstimatedOutputTokens,
      byPrompt: costByPrompt,
    },
    execution: buildExecutionBreakdown(runs),
  };

  aggregate = sanitizePublicArtifact(aggregate, {
    privateValues,
  }) as UniversalAggregate;
  assertPublicArtifactSafe(aggregate, {
    label: 'universal aggregate report',
    privateValues,
  });

  // Save
  const outputPath = path.join(iterDir, 'universal.json');
  const reportContext = sanitizePublicArtifact(
    {iteration, target, output: path.basename(outputPath)},
    {privateValues},
  ) as {iteration: string; target: string; output: string};
  assertPublicArtifactSafe(reportContext, {
    label: 'universal aggregate stdout',
    privateValues,
  });
  writeJson(outputPath, aggregate);

  if (json) {
    console.log(JSON.stringify(aggregate, null, 2));
    return;
  }

  // Print formatted table
  console.log(
    `\n📊 Universal Evaluation — Iteration ${reportContext.iteration}`,
  );
  console.log(`   ${promptCount} prompts, target: ${reportContext.target}\n`);

  console.log('┌─────────────────────┬───────┐');
  console.log('│ Dimension           │ Score │');
  console.log('├─────────────────────┼───────┤');
  for (const dim of dimensions) {
    const label = (DIMENSION_LABELS[dim] || dim).padEnd(19);
    const score = String(averages[dim]).padStart(3);
    console.log(`│ ${label} │  ${score}  │`);
  }
  if (hasDesignScores && averages.design != null) {
    const designPromptCount = Object.values(byPrompt).filter(
      s => s.design != null,
    ).length;
    const label = `Design (${designPromptCount}p)`.padEnd(19);
    const score = String(averages.design).padStart(3);
    console.log(`│ ${label} │  ${score}  │`);
  }
  console.log('├─────────────────────┼───────┤');
  console.log(`│ ${'Overall'.padEnd(19)} │  ${String(overall).padStart(3)}  │`);
  console.log('└─────────────────────┴───────┘');

  console.log(`\n🌙 Dark Mode: ${darkModeRate}%`);

  // Efficiency metrics summary
  const allEfficiency = Object.values(byPrompt)
    .map(s => s.efficiency.metrics)
    .filter(<T>(m: T | undefined): m is T => m != null);
  if (allEfficiency.length > 0) {
    const avgDecisions =
      allEfficiency.reduce((s, m) => s + m.decisionsPerElement, 0) /
      allEfficiency.length;
    const avgLines =
      allEfficiency.reduce((s, m) => s + m.codeLines, 0) / allEfficiency.length;
    console.log(`\n⚡ Efficiency:`);
    console.log(`   Avg decisions/element: ${avgDecisions.toFixed(1)}`);
    console.log(`   Avg code lines: ${Math.round(avgLines)}`);
  }

  // Maintainability metrics summary
  const allMaint = Object.values(byPrompt)
    .map(s => s.maintainability.metrics)
    .filter(<T>(m: T | undefined): m is T => m != null);
  if (allMaint.length > 0) {
    const avgSemantic =
      allMaint.reduce((s, m) => s + m.semanticRatio, 0) / allMaint.length;
    const totalMagic = allMaint.reduce((s, m) => s + m.magicValueCount, 0);
    console.log(`\n🔧 Maintainability:`);
    console.log(`   Semantic ratio: ${(avgSemantic * 100).toFixed(0)}%`);
    console.log(`   Magic values: ${totalMagic}`);
  }

  // Cost metrics
  if (aggregate.cost) {
    const c = aggregate.cost;
    console.log(`\n💰 Cost:`);
    console.log(
      `   Duration: ${(c.totalDurationMs / 1000).toFixed(1)}s total, ${(c.avgDurationMs / 1000).toFixed(1)}s avg`,
    );
    console.log(
      `   Output: ${c.avgOutputLines} lines avg (${c.avgOutputChars} chars)`,
    );
    console.log(`   Docs read: ${c.avgDocsRead} avg per prompt`);
    if (c.usageComplete) {
      console.log(
        `   Tokens: ${c.inputTokens ?? 0} input, ${c.outputTokens ?? 0} output (complete)`,
      );
    } else {
      console.log(
        `   Tokens: not comparable (${c.completeUsageRuns}/${promptCount} runs complete); estimates: ~${c.estimatedInputTokens} input, ~${c.estimatedOutputTokens} output`,
      );
    }
  }

  const harnessModelGroups = aggregate.execution?.byHarnessModel ?? [];
  if (harnessModelGroups.length > 0) {
    console.log('\n⚙️ By Harness + Model:');
    for (const group of harnessModelGroups) {
      const {harness = 'unknown', model = 'unknown'} = group.dimensions;
      const usage = group.usage.complete
        ? `${(group.usage.inputTokens ?? 0) + (group.usage.outputTokens ?? 0)} tokens`
        : `usage ${group.usage.completeRuns}/${group.runCount} complete`;
      console.log(
        `   ${harness} / ${model}: ${group.runCount} runs, score ${group.averageScore}, ${usage}`,
      );
    }
  }

  for (const [label, groups] of [
    ['Fixture', aggregate.execution?.byFixture ?? []],
    ['Condition', aggregate.execution?.byCondition ?? []],
  ] as const) {
    if (groups.length === 0) {
      continue;
    }
    console.log(`\n📎 By ${label}:`);
    for (const group of groups) {
      const value =
        label === 'Fixture'
          ? group.dimensions.fixture
          : group.dimensions.condition;
      console.log(
        `   ${value}: ${group.runCount} runs, score ${group.averageScore}`,
      );
    }
  }

  // Category breakdown
  const categories = Object.keys(aggregate.byCategory).sort();
  if (categories.length > 1) {
    console.log('\n📂 By Category:');
    for (const cat of categories) {
      const catOverall = Math.round(
        dimensions.reduce(
          (sum, dimension) => sum + aggregate.byCategory[cat][dimension],
          0,
        ) / dimensions.length,
      );
      console.log(`   ${cat.padEnd(25)} ${catOverall}`);
    }
  }

  console.log(`\nSaved: ${reportContext.output}\n`);
}

main().catch(err => {
  console.error(publicMessage(err));
  process.exit(1);
});
