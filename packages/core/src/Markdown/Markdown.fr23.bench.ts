// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Markdown.fr23.bench.ts
 * @input The AST-036 fixture document and the representative helper set
 * @output One JSON line of FR23 ratios on stdout, for the harness that spawns it
 * @position Benchmark body for Markdown.fr23.perf.test.ts; not a test itself
 *
 * Run as its own process, one measurement at a time, by
 * `Markdown.fr23.perf.test.ts`. The fresh process isolates engine state left
 * behind by other plugin configurations. The harness must also run separately
 * from other tests: a child process still shares machine resources, and CPU
 * time does not remove cache or memory-bandwidth contention.
 *
 * The timed region is exactly the spec's protocol — ten untimed warmups,
 * then nine alternating paired rounds averaging 20 iterations a side,
 * reported as the median of the nine paired ratios — against the omitted
 * baseline, for a stable list and a recreated equivalent one. Each ratio
 * comes from one sample, never a selection by the fastest baseline. Windows
 * are timed on the main thread's CPU clock, so V8's background threads do not
 * bill their work to whichever side happens to be running.
 *
 * The harness retries a fresh process only when the A/A control is invalid.
 * A helper-overhead failure is never retried to obtain a passing sample.
 */

import {measureMarkdownPairedRatio} from './Markdown.fr23.sampling';
import {parseMarkdown} from './parser';
import {createMarkdownPlugin} from './plugins';
import type {MarkdownExtensionNode} from './plugins';
import {createMarkdownFenceTransform} from './plugins/semanticFence';
import {createMarkdownSourceDecoration} from './plugins/sourceDecoration';
import {createMarkdownTextTransform} from './plugins/textTransform';

let benchmarkSink = 0;

/** The fixture `spec:AST-036`'s performance evidence protocol describes. */
function benchmarkDocument(sections: number): string {
  return Array.from({length: sections}, (_, index) =>
    [
      `## Section ${index}`,
      '',
      `AST-${index} belongs to @{owner-${index}} with TODO follow-up.`,
      '',
      `- First item ${index}`,
      '- Second item',
      '',
      `> Quoted detail ${index}`,
      '',
      '| Item | Detail |',
      '| --- | --- |',
      `| ${index} | ordinary prose |`,
      '',
      '```text',
      `opaque ${index}`,
      '```',
    ].join('\n'),
  ).join('\n\n');
}

/** Matches a prose identifier in every fixture section. */
const identifierPlugin = createMarkdownPlugin({
  name: 'representative-identifiers',
  apiVersion: 1,
  transform: createMarkdownTextTransform({
    pattern: /\bAST-\d+\b/g,
    requiredSubstrings: ['AST-'],
    replace: match => ({type: 'text', value: match[0].toLowerCase()}),
  }),
});

/** Turns the ordinary text fence each fixture section carries into data. */
type PerfFenceNode = MarkdownExtensionNode<
  'representative-fences',
  'fence',
  {readonly code: string},
  'block'
>;

const fencePlugin = createMarkdownPlugin<
  'representative-fences',
  PerfFenceNode
>({
  name: 'representative-fences',
  apiVersion: 1,
  transform: createMarkdownFenceTransform<readonly ['text'], PerfFenceNode>({
    languages: ['text'],
    createNode: ({code}) => ({
      type: 'extension',
      plugin: 'representative-fences',
      name: 'fence',
      display: 'block',
      data: {code},
    }),
  }),
  renderers: {
    fence: {
      render: ({node}) => node.data.code,
      toText: node => node.data.code,
    },
  },
});

/** Decorates one known source range: the first section heading. */
function knownRangeDecorationPlugin(source: string) {
  const heading = source.indexOf('## Section 0');
  return createMarkdownPlugin({
    name: 'representative-decoration',
    apiVersion: 1,
    transform: createMarkdownSourceDecoration({
      name: 'representative-decoration',
      ranges: [{start: heading, end: heading + '## Section 0'.length}],
    }),
  });
}

/**
 * Brings the whole pipeline to steady state before anything is measured.
 *
 * The spec's ten warmups precede each measurement, but they are not enough
 * for the FIRST one in a fresh process: the parser, the helpers and the
 * protocol are all still being optimized, so whichever side is measured
 * first carries the cold-start cost. Left alone this reliably inflated
 * `stable` — the first of the two — while `recreated`, run moments later on
 * a hot engine, sat where the real cost is. Priming both configurations
 * here removes that ordering bias; it changes nothing inside the timed
 * region, which is still ten warmups and one nine-pair median.
 */
function primePipeline(
  configurations: ReadonlyArray<() => number>,
  rounds = 40,
): void {
  for (let round = 0; round < rounds; round++) {
    for (const run of configurations) {
      benchmarkSink ^= run();
    }
  }
  void benchmarkSink;
}

function measure(sections: number): {
  stable: number;
  recreated: number;
  control: number;
} {
  const source = benchmarkDocument(sections);
  const representative = [
    identifierPlugin,
    fencePlugin,
    knownRangeDecorationPlugin(source),
  ];
  const empty = () => parseMarkdown(source).length;
  const withStableList = () =>
    parseMarkdown(source, {plugins: representative}).length;
  const withRecreatedList = () =>
    parseMarkdown(source, {plugins: [...representative]}).length;
  primePipeline([empty, withStableList, withRecreatedList]);
  // The A/A control measures identical work. Only a failed control can
  // invalidate this sample; neither helper ratio participates in selection.
  const control = measureMarkdownPairedRatio(empty, empty);
  return {
    stable: measureMarkdownPairedRatio(empty, withStableList),
    recreated: measureMarkdownPairedRatio(empty, withRecreatedList),
    control,
  };
}

const sections = Number(process.argv[2]);
if (!Number.isInteger(sections) || sections <= 0) {
  console.error(`Expected a section count, received ${process.argv[2]}`);
  process.exit(2);
}
// One line on stdout, so the harness can tell a real result from a crash.
// `process.stdout.write` rather than `console.log`: this file is a
// benchmark binary, not a module that should be logging.
process.stdout.write(`${JSON.stringify({sections, ...measure(sections)})}\n`);
