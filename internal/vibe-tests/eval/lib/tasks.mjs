// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Task sets and the one prompt template every arm shares.
 * @input eval/tasks/<set>/<id>.task.json and <id>.probe.mjs
 * @output validated tasks and rendered agent prompts
 * @position Read by run.mjs; the grader imports the probes
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

export const TASKS_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'tasks',
);

const ID_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * @typedef {object} EvalTask
 * @property {string} id
 * @property {string} source Prompt id in test-sets/default.json it adapts, or `new` for an original task
 * @property {string} title
 * @property {string} prompt
 * @property {string} probePath
 */

/**
 * @param {string} setName
 * @param {string} [root]
 * @returns {EvalTask[]}
 */
export function loadTaskSet(setName, root = TASKS_ROOT) {
  if (!ID_PATTERN.test(setName)) throw new Error(`bad task set name: ${setName}`);
  const dir = path.join(root, setName);
  if (!fs.existsSync(dir)) throw new Error(`task set not found: ${setName}`);
  const files = fs
    .readdirSync(dir)
    .filter(file => file.endsWith('.task.json'))
    .sort();
  if (files.length === 0) throw new Error(`task set ${setName} has no tasks`);
  return files.map(file => {
    const task = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    const expectedId = file.slice(0, -'.task.json'.length);
    if (task.schemaVersion !== 1) throw new Error(`${file}: schemaVersion must be 1`);
    if (task.id !== expectedId) throw new Error(`${file}: id must be "${expectedId}"`);
    for (const key of ['source', 'title', 'prompt']) {
      if (typeof task[key] !== 'string' || task[key].trim() === '') {
        throw new Error(`${file}: "${key}" must be a non-empty string`);
      }
    }
    const probePath = path.join(dir, `${task.id}.probe.mjs`);
    if (!fs.existsSync(probePath)) throw new Error(`${file}: missing ${task.id}.probe.mjs`);
    return {id: task.id, source: task.source, title: task.title, prompt: task.prompt, probePath};
  });
}

/** @returns {Promise<(page: import('playwright-core').Page) => [string, () => Promise<void>][]>} */
export async function loadProbe(task) {
  const module = await import(pathToFileURL(task.probePath).href);
  if (typeof module.default !== 'function') {
    throw new Error(`${task.id}.probe.mjs must export a default steps function`);
  }
  return module.default;
}

/**
 * The prompt names the library and the entry file and nothing else about the
 * arm. Everything an agent learns about the library comes from the project.
 */
export function renderPrompt(task, arm) {
  return [
    `This project is a React app that uses ${arm.library}. It is already installed and set up.`,
    `Build the following in ${arm.entry}, using ${arm.library} components.`,
    'Work only inside this project folder. Do not start a dev server.',
    'When you are done, the app must type-check and build.',
    '',
    task.prompt,
    '',
  ].join('\n');
}
