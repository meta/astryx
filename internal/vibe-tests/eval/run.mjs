#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Vibe eval entry point. Self-test proves the grader on every task.
 * @input a task set and arms
 * @output a self-test verdict per arm, task, and case
 * @position Entry point; see eval/README.md
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {resolveArms} from './lib/arms.mjs';
import {gradeWorkspace, launchBrowser} from './lib/grade.mjs';
import {loadTaskSet, TASKS_ROOT} from './lib/tasks.mjs';
import {
  assertOutsideRepo,
  createWorkspace,
  defaultRunDir,
  prepareArmBase,
} from './lib/workspace.mjs';

const USAGE = `usage:
  node internal/vibe-tests/eval/run.mjs --self-test [options]

options:
  --task-set <name>        tasks under eval/tasks (default: pilot)
  --tasks <a,b>            only these task ids from the set
  --arms <a,b>             default: astryx-vite,shadcn-vite
  --out <dir>              run directory, outside the repository`;

export function parseOptions(argv) {
  const {values} = parseArgs({
    args: argv,
    options: {
      'task-set': {type: 'string', default: 'pilot'},
      tasks: {type: 'string'},
      arms: {type: 'string', default: 'astryx-vite,shadcn-vite'},
      out: {type: 'string'},
      'self-test': {type: 'boolean', default: false},
      help: {type: 'boolean', default: false},
    },
  });
  const list = value => value.split(',').map(id => id.trim()).filter(Boolean);
  const options = {
    help: values.help,
    selfTest: values['self-test'],
    taskSet: values['task-set'],
    taskIds: values.tasks ? list(values.tasks) : null,
    arms: list(values.arms),
    out: values.out ?? null,
  };
  if (!options.help && !options.selfTest) throw new Error('nothing to do');
  return options;
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

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  await selfTest(options);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  main().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n${USAGE}\n`);
    process.exitCode = 1;
  });
}
