// Copyright (c) Meta Platforms, Inc. and affiliates.

// Scores what can be scored mechanically, from results/out/<task id>.md:
// - use: the `edge` value each agent put on <List>, against prompts.json's
//   ground truth, plus undocumented props and custom styles;
// - recall: the prop name and the four value names each agent wrote;
// - reading: each multiple-choice answer, against the real geometry.
// p7 (a deliberate conflict) and every fuzzy dimension go to the judge.
// Prints markdown tables; run after the agents' replies are saved.

import {existsSync, readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'results', 'out');
const spec = JSON.parse(readFileSync(join(HERE, 'prompts.json'), 'utf8'));
const read = id => {
  const path = join(OUT, `${id}.md`);
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
};

// List props every arm's doc documents. Each arm adds its own edge prop and,
// for the both-names arm, the deprecated one, so a prop only another arm
// documents is reported as undocumented.
const SHARED_LIST_PROPS = [
  'children',
  'header',
  'density',
  'hasDividers',
  'key',
];

/** The List props an arm's doc documents. */
function listPropsFor({prop, deprecated}) {
  return new Set(
    [...SHARED_LIST_PROPS, prop, deprecated?.prop].filter(p => p != null),
  );
}
const ITEM_PROPS = new Set([
  'label',
  'description',
  'startContent',
  'endContent',
  'onClick',
  'href',
  'isSelected',
  'isDisabled',
  'key',
]);
const STYLE_PROPS = /\b(style|xstyle|className)=/;

/**
 * Each opening tag of `name` in the reply's code, as its attributes:
 * `{name, value}`, where `value` is the raw source of a quoted or braced
 * value, or null for a bare boolean attribute. Values are skipped with a
 * quote- and brace-aware walk, so JSX inside an earlier attribute
 * (`header={<Heading level={2}>…</Heading>}`) cannot end the tag early.
 */
function tagAttributes(code, name) {
  const found = [];
  const opener = new RegExp(`<${name}\\b`, 'g');
  let match;
  while ((match = opener.exec(code)) != null) {
    const attributes = [];
    let i = match.index + name.length + 1;
    while (i < code.length) {
      const char = code[i];
      if (char === '>' || (char === '/' && code[i + 1] === '>')) break;
      const attr = /^[A-Za-z][\w-]*/.exec(code.slice(i));
      if (attr == null) {
        i++;
        continue;
      }
      i += attr[0].length;
      if (code[i] !== '=') {
        attributes.push({name: attr[0], value: null});
        continue;
      }
      i++;
      const start = i;
      if (code[i] === '"' || code[i] === "'") {
        const close = code.indexOf(code[i], i + 1);
        i = close === -1 ? code.length : close + 1;
      } else if (code[i] === '{') {
        for (let depth = 0; i < code.length; i++) {
          if (code[i] === '{') depth++;
          else if (code[i] === '}' && --depth === 0) {
            i++;
            break;
          }
        }
      }
      attributes.push({name: attr[0], value: code.slice(start, i)});
    }
    found.push(attributes);
  }
  return found;
}

/** Props written on each opening tag of `name`, from the reply's code. */
function tagProps(code, name) {
  return tagAttributes(code, name).map(attributes =>
    attributes.map(attribute => attribute.name),
  );
}

/**
 * The value of `prop` on the first <List> that sets it: a string literal's
 * text, `?<source>` for any other value (so a computed value is reported, not
 * read as unset), or null when no <List> sets it.
 */
function edgeValue(code, prop) {
  if (prop == null) return null;
  for (const attributes of tagAttributes(code, 'List')) {
    const attribute = attributes.find(a => a.name === prop);
    if (attribute == null) continue;
    const literal =
      /^(?:"([^"]*)"|'([^']*)'|\{\s*(?:"([^"]*)"|'([^']*)')\s*\})$/.exec(
        attribute.value ?? '',
      );
    if (literal) return literal[1] ?? literal[2] ?? literal[3] ?? literal[4];
    return `?${attribute.value ?? 'true'}`;
  }
  return null;
}

const rows = [];
const correctCount = Object.fromEntries(
  Object.keys(spec.arms).map(arm => [arm, 0]),
);
const reachable = Object.fromEntries(
  Object.keys(spec.arms).map(arm => [arm, 0]),
);
const deprecatedUse = {};
for (const prompt of spec.generation.prompts) {
  for (const [arm, armSpec] of Object.entries(spec.arms)) {
    const {values, prop, deprecated} = armSpec;
    const listProps = listPropsFor(armSpec);
    const reply = read(`gen-${prompt.id}-${arm}`);
    if (reply == null) continue;
    const code = (reply.match(/```tsx\n([\s\S]*?)```/) ?? [, ''])[1];
    const edge = edgeValue(code, prop);
    const deprecatedValue =
      deprecated == null ? null : edgeValue(code, deprecated.prop);
    if (deprecatedValue != null)
      deprecatedUse[arm] = (deprecatedUse[arm] ?? 0) + 1;
    const value =
      edge ??
      (deprecatedValue != null
        ? `${deprecated.prop}=${deprecatedValue}`
        : null);
    // A defined `edge` wins over the deprecated prop, as List resolves them.
    let canonical = 'unset';
    if (edge != null) {
      canonical =
        Object.keys(values).find(k => values[k] === edge) ??
        `?${edge.replace(/^\?/, '')}`;
    } else if (deprecatedValue != null) {
      canonical =
        deprecatedValue === deprecated.value
          ? deprecated.look
          : `?${deprecatedValue.replace(/^\?/, '')}`;
    }
    // Whether the arm's API can produce the prompt's look at all (the main
    // baseline has no flush or bleed; the natural-reach arm has no values).
    const canReach =
      prompt.correct === 'unset' ||
      prompt.correct === 'conflict' ||
      prompt.correct in values;
    const invented = [
      ...tagProps(code, 'List')
        .flat()
        .filter(p => !listProps.has(p)),
      ...tagProps(code, 'ListItem')
        .flat()
        .filter(p => !ITEM_PROPS.has(p)),
    ];
    const styled = STYLE_PROPS.test(code);
    const wrapped = /<(Section|Card|Dialog)\b/.exec(code)?.[1] ?? '—';
    const confidence = (reply.match(/Confidence:\s*(\d)/) ?? [, '?'])[1];
    let verdict;
    if (prompt.correct === 'conflict') verdict = 'judge';
    else if (prompt.correct === 'unset')
      verdict =
        canonical === 'unset'
          ? 'yes'
          : canonical === 'inset'
            ? 'yes (explicit default)'
            : 'no';
    else if (!canReach) verdict = 'no API';
    else verdict = canonical === prompt.correct ? 'yes' : 'no';
    if (verdict.startsWith('yes')) correctCount[arm]++;
    if (canReach && prompt.correct !== 'conflict') reachable[arm]++;
    const usesList = /<List\b/.test(code);
    rows.push(
      `| ${prompt.id} | ${arm.toUpperCase()} | ${prompt.correct} | ${value ?? '(unset)'} | ${verdict} | ${invented.length ? invented.join(', ') : 'none'} | ${styled ? 'yes' : 'no'} | ${usesList ? wrapped : `${wrapped}, no List`} | ${confidence}/5 |`,
    );
  }
}

console.log('## Use (scripted)\n');
console.log(
  '| prompt | arm | correct look | value written | correct | undocumented props | custom styles | wrapper | confidence |',
);
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
console.log(rows.join('\n'));
console.log(
  `\nScripted correct, excluding p7 (out of the prompts each arm's API can reach): ${Object.entries(
    correctCount,
  )
    .map(
      ([arm, n]) =>
        `${arm.toUpperCase()} (${spec.arms[arm].prop ?? 'no prop'}) ${n}/${reachable[arm]}`,
    )
    .join(', ')}.`,
);
console.log(
  `Deprecated prop written: ${
    Object.entries(deprecatedUse)
      .map(([arm, n]) => `${arm.toUpperCase()} ${n}/7`)
      .join(', ') || 'none'
  }.\n`,
);

console.log('## Recall (scripted)\n');
console.log('| sample | prop | look 1 | look 2 | look 3 | look 4 | shape |');
console.log('| --- | --- | --- | --- | --- | --- | --- |');
for (let i = 1; i <= spec.recall.samples; i++) {
  const reply = read(`recall-${i}`);
  if (reply == null) continue;
  const api = (reply.match(/```ts\n([\s\S]*?)```/) ?? [, ''])[1];
  const union = api.match(/(\w+)\??:\s*((?:'[^']+'\s*\|\s*)+'[^']+')/);
  const alias = api.match(/type\s+\w+\s*=\s*((?:'[^']+'\s*\|\s*)+'[^']+')/);
  const propLine = api.match(/^\s*(\w+)\??:\s*(\w+);/m);
  const prop = union?.[1] ?? propLine?.[1] ?? '?';
  const values =
    (union?.[2] ?? alias?.[1] ?? '')
      .match(/'([^']+)'/g)
      ?.map(v => v.slice(1, -1)) ?? [];
  const booleans = (api.match(/\w+\??:\s*boolean/g) ?? []).length;
  const shape =
    values.length === 4
      ? 'one prop, four values'
      : booleans > 0
        ? `${booleans} booleans`
        : '?';
  console.log(
    `| ${i} | \`${prop}\` | ${values.map(v => `\`${v}\``).join(' | ') || '? | ? | ? | ?'} | ${shape} |`,
  );
}

console.log('\n## Reading (scripted)\n');
console.log(
  '| prop | value | editor type shown | sample | text | highlight | dividers | all three right | confidence |',
);
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
const CANON = {
  inset: 'inset',
  padded: 'inset',
  flush: 'flush',
  outset: 'outset',
  hanging: 'outset',
  bleed: 'bleed',
};
const conditions = [
  ...Object.entries(spec.reading.samples).map(([value, samples]) => ({
    id: `read-${value}`,
    prop: 'edge',
    value,
    samples,
    union: null,
  })),
  ...(spec.round2?.reading ?? []).map(c => ({
    ...c,
    id: `read2-${c.prop}-${c.value}${c.union ? '-union' : ''}`,
    union: c.union ?? null,
  })),
];
/** @type {Map<string, {right: number, total: number, textRight: number}>} */
const tally = new Map();
for (const c of conditions) {
  for (let i = 1; i <= c.samples; i++) {
    const reply = read(`${c.id}-${i}`);
    if (reply == null) continue;
    const answer = JSON.parse(
      reply.slice(reply.indexOf('{'), reply.lastIndexOf('}') + 1),
    );
    const truth = spec.reading.correct[CANON[c.value]];
    const mark = key =>
      answer[key] === truth[key]
        ? `${answer[key]} ✓`
        : `${answer[key]} ✗ (${truth[key]})`;
    const all = ['text', 'highlight', 'dividers'].every(
      k => answer[k] === truth[k],
    );
    console.log(
      `| \`${c.prop}\` | \`${c.value}\` | ${c.union ? 'yes' : 'no'} | ${c.id.startsWith('read2') ? 'r2' : 'r1'}·${i} | ${mark('text')} | ${mark('highlight')} | ${mark('dividers')} | ${all ? 'yes' : 'no'} | ${answer.confidence}/5 |`,
    );
    const key = `${c.prop}|${c.value}|${c.union ? 'type shown' : 'bare'}`;
    const t = tally.get(key) ?? {right: 0, total: 0, textRight: 0};
    t.total++;
    if (all) t.right++;
    if (answer.text === truth.text) t.textRight++;
    tally.set(key, t);
  }
}
console.log('\n### Reading totals\n');
console.log(
  '| prop | value | editor type shown | all three right | text placement right |',
);
console.log('| --- | --- | --- | --- | --- |');
for (const [key, t] of tally) {
  const [prop, value, shown] = key.split('|');
  console.log(
    `| \`${prop}\` | \`${value}\` | ${shown === 'type shown' ? 'yes' : 'no'} | ${t.right}/${t.total} | ${t.textRight}/${t.total} |`,
  );
}
