#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Vibe eval runner: fresh agents build fixed tasks in each arm, then a
 * deterministic grader checks them in a real browser.
 * @input a task set, arms, a pinned model, runs per task, and a dollar cap
 * @output run records, screenshots, summary.json, report.md, report.html
 * @position Entry point; see eval/README.md
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {runClaudeCode} from './lib/agent-claude-code.mjs';
import {resolveArms} from './lib/arms.mjs';
import {gradeWorkspace, launchBrowser} from './lib/grade.mjs';
import {writeReport} from './lib/report.mjs';
import {loadTaskSet, renderPrompt, TASKS_ROOT} from './lib/tasks.mjs';
import {auditTranscript} from './lib/transcript-audit.mjs';
import {
  assertOutsideRepo,
  createWorkspace,
  defaultRunDir,
  prepareArmBase,
} from './lib/workspace.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const USAGE = `usage:
  node internal/vibe-tests/eval/run.mjs --model <id> --budget-usd <n> [options]
  node internal/vibe-tests/eval/run.mjs --self-test [--task-set <name>]
  node internal/vibe-tests/eval/run.mjs --report-only <run directory>

options:
  --task-set <name>        tasks under eval/tasks (default: pilot)
  --tasks <a,b>            only these task ids from the set
  --arms <a,b>             default: astryx-vite,shadcn-vite
  --reps <n>               runs per task per arm (default: 3)
  --run-budget-usd <n>     dollar cap for one agent run (default: 3)
  --timeout-min <n>        wall-clock cap for one agent run (default: 20)
  --concurrency <n>        agent runs at once (default: 4)
  --out <dir>              run directory, outside the repository`;

export function parseOptions(argv) {
  const {values} = parseArgs({
    args: argv,
    options: {
      model: {type: 'string'},
      'budget-usd': {type: 'string'},
      'task-set': {type: 'string', default: 'pilot'},
      tasks: {type: 'string'},
      arms: {type: 'string', default: 'astryx-vite,shadcn-vite'},
      reps: {type: 'string', default: '3'},
      'run-budget-usd': {type: 'string', default: '3'},
      'timeout-min': {type: 'string', default: '20'},
      concurrency: {type: 'string', default: '4'},
      out: {type: 'string'},
      'self-test': {type: 'boolean', default: false},
      'report-only': {type: 'string'},
      help: {type: 'boolean', default: false},
    },
  });
  const number = (name, {min, integer}) => {
    const value = Number(values[name]);
    if (!Number.isFinite(value) || value < min || (integer && !Number.isInteger(value))) {
      throw new Error(`--${name} must be ${integer ? 'an integer' : 'a number'} >= ${min}`);
    }
    return value;
  };
  const options = {
    help: values.help,
    selfTest: values['self-test'],
    reportOnly: values['report-only'] ?? null,
    taskSet: values['task-set'],
    taskIds: values.tasks ? values.tasks.split(',').map(id => id.trim()).filter(Boolean) : null,
    arms: values.arms.split(',').map(id => id.trim()).filter(Boolean),
    reps: number('reps', {min: 1, integer: true}),
    runBudgetUsd: number('run-budget-usd', {min: 0.01}),
    timeoutMs: number('timeout-min', {min: 1}) * 60_000,
    concurrency: number('concurrency', {min: 1, integer: true}),
    out: values.out ?? null,
    model: values.model ?? null,
    budgetUsd: values['budget-usd'] === undefined ? null : number('budget-usd', {min: 0.01}),
  };
  if (!options.help && !options.selfTest && !options.reportOnly) {
    if (!options.model) throw new Error('--model is required: pin one model for every arm');
    if (options.budgetUsd === null) throw new Error('--budget-usd is required: the run stops before it would pass this cap');
    if (options.budgetUsd < options.runBudgetUsd) throw new Error('--budget-usd must cover at least one run');
  }
  return options;
}

/** Reps outermost, then tasks, then arms, so drift over time hits both arms alike. */
export function planJobs(tasks, arms, reps) {
  const jobs = [];
  for (let rep = 1; rep <= reps; rep++) {
    for (const task of tasks) {
      for (const arm of arms) jobs.push({task, arm, rep});
    }
  }
  return jobs;
}

/**
 * Admits a run only while the money already spent, plus the cap of every run
 * in flight, plus this run's cap, stays within the total cap. A run that does
 * not fit waits for a run in flight to settle; it is skipped only when it
 * cannot fit with nothing in flight.
 */
export class Budget {
  constructor(totalUsd, perRunUsd) {
    this.totalUsd = totalUsd;
    this.perRunUsd = perRunUsd;
    this.spentUsd = 0;
    this.inFlight = 0;
    this.waiters = [];
  }
  fits() {
    return this.spentUsd + (this.inFlight + 1) * this.perRunUsd <= this.totalUsd + 1e-9;
  }
  async reserve() {
    while (!this.fits()) {
      if (this.inFlight === 0) return false;
      await new Promise(resolve => this.waiters.push(resolve));
    }
    this.inFlight++;
    return true;
  }
  settle(costUsd) {
    this.inFlight--;
    // An unknown cost counts as the whole per-run cap.
    this.spentUsd += Number.isFinite(costUsd) ? costUsd : this.perRunUsd;
    for (const wake of this.waiters.splice(0)) wake();
  }
}

function selectTasks(options) {
  const tasks = loadTaskSet(options.taskSet);
  if (!options.taskIds) return tasks;
  const unknown = options.taskIds.filter(id => !tasks.some(task => task.id === id));
  if (unknown.length > 0) throw new Error(`unknown task ids: ${unknown.join(', ')}`);
  return tasks.filter(task => options.taskIds.includes(task.id));
}

function log(message) {
  process.stderr.write(`[vibe-eval ${new Date().toISOString().slice(11, 19)}] ${message}\n`);
}

function readRecords(runDir) {
  const dir = path.join(runDir, 'records');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(file => file.endsWith('.json'))
    .sort()
    .map(file => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')));
}

async function prepareBases(arms, runDir) {
  const bases = {};
  for (const arm of arms) {
    bases[arm.id] = await prepareArmBase(arm, runDir, log);
    log(`${arm.id}: controls passed (${JSON.stringify(bases[arm.id].versions)})`);
  }
  return bases;
}

/** Grades the empty starter (must fail) and the reference solution (must pass). */
async function selfTest(options) {
  const tasks = selectTasks(options);
  const arms = resolveArms(options.arms);
  const runDir = assertOutsideRepo(options.out ?? defaultRunDir());
  const bases = await prepareBases(arms, runDir);
  const browser = await launchBrowser();
  const problems = [];
  try {
    for (const arm of arms) {
      for (const task of tasks) {
        const reference = path.join(TASKS_ROOT, options.taskSet, 'reference', arm.id, `${task.id}.tsx`);
        if (!fs.existsSync(reference)) throw new Error(`missing reference solution: ${reference}`);
        const cases = [
          ['placeholder', arm.placeholder, false],
          ['reference', fs.readFileSync(reference, 'utf8'), true],
        ];
        for (const [label, source, shouldPass] of cases) {
          const workspace = createWorkspace(bases[arm.id].base, path.join(runDir, 'self-test', arm.id, task.id, label));
          fs.writeFileSync(path.join(workspace, arm.entry), source);
          const grade = await gradeWorkspace({workspace, arm, task, browser, outDir: path.join(workspace, '.grade')});
          const ok = grade.passed === shouldPass;
          log(`${ok ? 'ok  ' : 'FAIL'} ${arm.id} ${task.id} ${label}: ${grade.passed ? 'passed' : `failed (${grade.failure})`}`);
          if (!ok) problems.push({arm: arm.id, task: task.id, label, grade});
        }
      }
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(runDir, 'self-test.json'), `${JSON.stringify(problems, null, 2)}\n`);
  if (problems.length > 0) {
    log(`self-test found ${problems.length} wrong verdicts; see ${runDir}/self-test.json`);
    process.exitCode = 1;
  } else log('self-test passed');
}

async function evaluate(options) {
  const tasks = selectTasks(options);
  const arms = resolveArms(options.arms);
  const runDir = assertOutsideRepo(options.out ?? defaultRunDir());
  fs.mkdirSync(path.join(runDir, 'records'), {recursive: true});
  const bases = await prepareBases(arms, runDir);
  const meta = {
    schemaVersion: 1,
    startedAt: new Date().toISOString(),
    taskSet: options.taskSet,
    tasks: tasks.map(task => task.id),
    arms: arms.map(arm => arm.id),
    model: options.model,
    reps: options.reps,
    budgetUsd: options.budgetUsd,
    runBudgetUsd: options.runBudgetUsd,
    timeoutMs: options.timeoutMs,
    harness: 'claude-code (bare)',
    node: process.version,
    platform: `${os.platform()}-${os.arch()}`,
    bases: Object.fromEntries(
      Object.entries(bases).map(([id, base]) => [id, {templateHash: base.templateHash, versions: base.versions, controls: base.controls}]),
    ),
  };
  fs.writeFileSync(path.join(runDir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);

  const sensitiveRoots = [runDir, REPO_ROOT, os.homedir()];
  const budget = new Budget(options.budgetUsd, options.runBudgetUsd);
  const browser = await launchBrowser();
  const queue = planJobs(tasks, arms, options.reps);
  log(`${queue.length} runs planned, cap $${options.budgetUsd}`);

  const work = async ({task, arm, rep}) => {
    const name = `${task.id}__${arm.id}__r${rep}`;
    const recordPath = path.join(runDir, 'records', `${name}.json`);
    const record = {task: task.id, arm: arm.id, rep, status: 'graded', passed: false, failure: null};
    if (!(await budget.reserve())) {
      record.status = 'skipped-budget';
      fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
      log(`${name}: skipped, budget cap reached`);
      return;
    }
    const runRoot = path.join(runDir, 'runs', name);
    const workspace = createWorkspace(bases[arm.id].base, path.join(runRoot, 'workspace'));
    const prompt = renderPrompt(task, arm);
    record.prompt = prompt;
    log(`${name}: agent started`);
    let agent;
    try {
      agent = await runClaudeCode({
        workspace,
        prompt,
        model: options.model,
        maxBudgetUsd: options.runBudgetUsd,
        timeoutMs: options.timeoutMs,
        transcriptPath: path.join(runRoot, 'transcript.jsonl'),
      });
    } finally {
      budget.settle(agent?.result?.costUsd);
    }
    record.agent = {
      exitCode: agent.exitCode,
      timedOut: agent.timedOut,
      instructionsFile: agent.instructionsFile,
      ...(agent.result ?? {}),
    };
    if (agent.result && agent.result.models.some(model => !model.startsWith(options.model))) {
      record.agent.modelMismatch = true;
    }
    const lines = fs.readFileSync(agent.transcriptPath, 'utf8').split('\n').filter(Boolean);
    record.audit = auditTranscript(lines, workspace, sensitiveRoots);
    record.grade = await gradeWorkspace({workspace, arm, task, browser, outDir: path.join(runRoot, 'grade')});
    if (record.agent.modelMismatch) record.failure = 'model-mismatch';
    else if (record.audit.violations.length > 0) record.failure = 'integrity';
    else record.failure = record.grade.failure;
    record.passed = record.failure === null;
    const entry = path.join(workspace, arm.entry);
    if (fs.existsSync(entry)) fs.copyFileSync(entry, path.join(runRoot, path.basename(arm.entry)));
    fs.rmSync(path.join(workspace, 'node_modules'), {recursive: true, force: true});
    fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
    log(`${name}: ${record.passed ? 'pass' : `fail (${record.failure})`} $${record.agent.costUsd?.toFixed(2) ?? '?'} · spent $${budget.spentUsd.toFixed(2)}`);
  };

  try {
    const workers = Array.from({length: Math.min(options.concurrency, queue.length)}, async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        try {
          await work(job);
        } catch (error) {
          log(`${job.task.id}/${job.arm.id}/r${job.rep}: harness error ${error}`);
          const record = {task: job.task.id, arm: job.arm.id, rep: job.rep, status: 'harness-error', error: String(error)};
          fs.writeFileSync(path.join(runDir, 'records', `${job.task.id}__${job.arm.id}__r${job.rep}.json`), `${JSON.stringify(record, null, 2)}\n`);
        }
      }
    });
    await Promise.all(workers);
  } finally {
    await browser.close();
  }
  meta.finishedAt = new Date().toISOString();
  meta.spentUsd = budget.spentUsd;
  fs.writeFileSync(path.join(runDir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
  writeReport(runDir, meta, readRecords(runDir));
  log(`report: ${path.join(runDir, 'report.html')}`);
  process.stdout.write(fs.readFileSync(path.join(runDir, 'report.md'), 'utf8'));
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  if (options.reportOnly) {
    const runDir = path.resolve(options.reportOnly);
    const meta = JSON.parse(fs.readFileSync(path.join(runDir, 'meta.json'), 'utf8'));
    writeReport(runDir, meta, readRecords(runDir));
    process.stdout.write(fs.readFileSync(path.join(runDir, 'report.md'), 'utf8'));
    return;
  }
  if (options.selfTest) await selfTest(options);
  else await evaluate(options);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  main().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n${USAGE}\n`);
    process.exitCode = 1;
  });
}
