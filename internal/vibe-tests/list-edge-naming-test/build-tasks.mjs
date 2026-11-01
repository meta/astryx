// Copyright (c) Meta Platforms, Inc. and affiliates.

// Assembles one self-contained task per agent from prompts.json and the
// generated docs, so every agent in an arm reads byte-identical material.
// `node build-tasks.mjs` builds round 1, `--round=2` and `--round=3` build
// those rounds. Writes results/tasks[-rN]/<id>.md plus manifest.json, which
// maps each task id to a random file name for delivery: agents receive only
// their own file's exact path.

import {randomBytes} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const round = Number(
  process.argv.find(arg => arg.startsWith('--round='))?.slice(8) ?? 1,
);
const OUT = join(HERE, 'results', round === 1 ? 'tasks' : `tasks-r${round}`);
const spec = JSON.parse(readFileSync(join(HERE, 'prompts.json'), 'utf8'));
const doc = path => readFileSync(join(HERE, path), 'utf8').trim();

/** @type {Record<string, string>} */
const tasks = {};

function useTasks(armIds) {
  for (const arm of armIds) {
    for (const prompt of spec.generation.prompts) {
      tasks[`gen-${prompt.id}-${arm}`] = [
        spec.preamble,
        `## Reference\n\n${doc(spec.arms[arm].doc)}`,
        `## Task\n\n${prompt.text}`,
        spec.generation.output,
      ].join('\n\n');
    }
  }
}

function readingTask({prop, value, union}) {
  const hint =
    union == null
      ? []
      : [
          spec.round2.unionHint
            .replace('__PROP__', prop)
            .replace('__UNION__', union.map(v => `'${v}'`).join(' | ')),
        ];
  return [
    spec.preamble,
    `## Code\n\n${spec.reading.snippet.replace('__PROP__', prop).replace('__VALUE__', value)}`,
    ...hint,
    `## Questions\n\n${spec.reading.questions.replace('__PROP__', prop)}`,
  ].join('\n\n');
}

if (round === 1) {
  useTasks(Object.keys(spec.arms).filter(arm => spec.arms[arm].round == null));

  const byId = Object.fromEntries(spec.generation.prompts.map(p => [p.id, p]));
  const recallTasks = spec.recall.scenarios
    .map((id, i) => `### Task ${i + 1}\n\n${byId[id].text}`)
    .join('\n\n');
  for (let i = 1; i <= spec.recall.samples; i++) {
    tasks[`recall-${i}`] = [
      spec.preamble,
      `## Reference\n\n${doc(spec.recall.doc)}`,
      `## Tasks\n\nThe reference describes four row looks but does not list the API that chooses one. Write the API you would expect, then use it.\n\n${recallTasks}`,
      spec.recall.output,
    ].join('\n\n');
  }

  for (const [value, count] of Object.entries(spec.reading.samples)) {
    for (let i = 1; i <= count; i++) {
      tasks[`read-${value}-${i}`] = readingTask({prop: 'edge', value});
    }
  }
} else if (round === 3) {
  useTasks(spec.round3.use.arms);
} else {
  useTasks(spec.round2.use.arms);
  for (const condition of spec.round2.reading) {
    const id = `read2-${condition.prop}-${condition.value}${condition.union ? '-union' : ''}`;
    for (let i = 1; i <= condition.samples; i++) {
      tasks[`${id}-${i}`] = readingTask(condition);
    }
  }
}

mkdirSync(OUT, {recursive: true});
const manifest = {};
for (const [id, text] of Object.entries(tasks)) {
  writeFileSync(join(OUT, `${id}.md`), `${text}\n`);
  manifest[id] = `${randomBytes(12).toString('hex')}.md`;
}
writeFileSync(
  join(OUT, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(
  `${Object.keys(tasks).length} round ${round} tasks written to ${OUT}`,
);
