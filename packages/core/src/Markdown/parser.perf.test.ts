// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import {
  parseMarkdown,
  parseMarkdownIncremental,
  createIncrementalState,
  getIncrementalParseWork,
} from './parser';
import type {BlockNode, ParseOptions} from './parser';

type PerfParseOptions = ParseOptions;

function generateAIResponse(paragraphs: number): string {
  const sections: string[] = [];
  for (let i = 0; i < paragraphs; i++) {
    const mod = i % 6;
    switch (mod) {
      case 0:
        sections.push(
          `## Section ${i + 1}\n\nThis is paragraph ${i + 1} of the AI response. It contains analysis about the data and provides context for the following sections.`,
        );
        break;
      case 1:
        sections.push(
          '```typescript\nfunction process(data: Record<string, unknown>[]) {\n  return data.filter(item => item.valid)\n    .map(item => transform(item))\n    .reduce((acc, val) => merge(acc, val), {});\n}\n```',
        );
        break;
      case 2:
        sections.push(
          `- First point about topic ${i}\n- Second important finding\n- Third observation with **bold emphasis**\n- Fourth conclusion`,
        );
        break;
      case 3:
        sections.push(
          `| Metric | Value | Change |\n| :--- | :---: | ---: |\n| Accuracy | ${90 + (i % 10)}% | +${i % 5}% |\n| Latency | ${10 + i}ms | -${i % 3}ms |`,
        );
        break;
      case 4:
        sections.push(
          `> **Note:** This is an important observation about item ${i}.\n> It spans multiple lines and contains *italic* text.`,
        );
        break;
      case 5:
        sections.push(
          `1. Step one of process ${i}\n2. Step two with \`inline code\`\n3. Final step with [link](https://example.com/${i})`,
        );
        break;
    }
  }
  return sections.join('\n\n');
}

function simulateStreamingFullReparse(
  fullText: string,
  chunkSize = 50,
): BlockNode[] {
  for (let i = chunkSize; i <= fullText.length; i += chunkSize) {
    parseMarkdown(fullText.slice(0, i));
  }
  return parseMarkdown(fullText);
}

function simulateStreamingIncremental(
  fullText: string,
  chunkSize = 50,
): BlockNode[] {
  const state = createIncrementalState();
  for (let i = chunkSize; i <= fullText.length; i += chunkSize) {
    parseMarkdownIncremental(fullText.slice(0, i), state);
  }
  return parseMarkdownIncremental(fullText, state);
}

/**
 * How many blocks each chunk of a streamed document had to build.
 *
 * A block the parser kept in its settled cache is handed back as the very same
 * object, so a returned block that is not one of the previous chunk's is one
 * this chunk built. That makes the cache countable without reaching into the
 * parser's internals.
 */
function blocksBuiltPerChunk(
  fullText: string,
  chunkSize: number,
  options?: PerfParseOptions,
): number[] {
  const state = createIncrementalState();
  let previous: ReadonlySet<BlockNode> = new Set();
  const built: number[] = [];
  const step = (text: string) => {
    const blocks =
      options == null
        ? parseMarkdownIncremental(text, state)
        : parseMarkdownIncremental(text, state, options);
    built.push(blocks.reduce((n, b) => (previous.has(b) ? n : n + 1), 0));
    previous = new Set(blocks);
  };
  for (let i = chunkSize; i <= fullText.length; i += chunkSize) {
    step(fullText.slice(0, i));
  }
  step(fullText);
  return built;
}

const percentile = (values: number[], p: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
};

const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0);

// A single wall-clock measurement is flaky when the whole suite runs in
// parallel forks: scheduler contention can inflate a millisecond-scale
// sample well past a tight budget (observed 30.9ms against the 20ms Small
// budget). The fastest of a few runs approximates the un-contended cost —
// a real regression raises the minimum too — so budgets stay tight without
// flapping. The streaming budget tests below keep a single run: their
// budgets carry 10x+ headroom, which contention cannot realistically eat.
function measureBest<T>(
  runs: number,
  fn: () => T,
): {elapsed: number; result: T} {
  let elapsed = Infinity;
  let result!: T;
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    const r = fn();
    const t = performance.now() - start;
    if (t < elapsed) {
      elapsed = t;
      result = r;
    }
  }
  return {elapsed, result};
}

describe('parseMarkdown performance', () => {
  const sizes = [
    {name: 'Small', paragraphs: 10, maxMs: 20},
    {name: 'Medium', paragraphs: 50, maxMs: 50},
    {name: 'Large', paragraphs: 200, maxMs: 100},
    {name: 'XL', paragraphs: 500, maxMs: 400},
    {name: 'XXL', paragraphs: 2000, maxMs: 1000},
  ];

  // Report sizes
  it('reports input sizes', () => {
    for (const size of sizes) {
      const text = generateAIResponse(size.paragraphs);
      const lines = text.split('\n').length;
      console.log(
        `${size.name} (${size.paragraphs} paragraphs): ${text.length} chars, ${lines} lines`,
      );
    }
  });

  // Full re-parse benchmarks
  for (const size of sizes) {
    it(
      `full re-parse ${size.name} (${size.paragraphs} paragraphs) under ${size.maxMs}ms`,
      () => {
        const text = generateAIResponse(size.paragraphs);
        const {elapsed, result} = measureBest(3, () => parseMarkdown(text));
        console.log(
          `  ${size.name} full parse: ${elapsed.toFixed(2)}ms → ${result.length} blocks`,
        );
        expect(elapsed).toBeLessThan(size.maxMs);
        expect(result.length).toBeGreaterThan(0);
      },
      size.maxMs + 5000,
    );
  }

  // Streaming with full re-parse
  for (const size of [
    {name: 'Medium', paragraphs: 50, maxMs: 5000},
    {name: 'XL', paragraphs: 500, maxMs: 30000},
  ]) {
    it(
      `streaming full re-parse ${size.name} under ${size.maxMs}ms`,
      () => {
        const text = generateAIResponse(size.paragraphs);
        const chunkSize = 50;
        const iterations = Math.ceil(text.length / chunkSize);
        const start = performance.now();
        const result = simulateStreamingFullReparse(text, chunkSize);
        const elapsed = performance.now() - start;
        console.log(
          `  ${size.name} streaming full re-parse: ${elapsed.toFixed(2)}ms (${iterations} iterations)`,
        );
        expect(elapsed).toBeLessThan(size.maxMs);
        expect(result.length).toBeGreaterThan(0);
      },
      size.maxMs + 5000,
    );
  }

  // Streaming with incremental parse
  for (const size of [
    {name: 'Medium', paragraphs: 50, maxMs: 5000},
    {name: 'XL', paragraphs: 500, maxMs: 30000},
  ]) {
    it(
      `streaming incremental ${size.name} under ${size.maxMs}ms`,
      () => {
        const text = generateAIResponse(size.paragraphs);
        const chunkSize = 50;
        const iterations = Math.ceil(text.length / chunkSize);
        const start = performance.now();
        const result = simulateStreamingIncremental(text, chunkSize);
        const elapsed = performance.now() - start;
        console.log(
          `  ${size.name} streaming incremental: ${elapsed.toFixed(2)}ms (${iterations} iterations)`,
        );
        expect(elapsed).toBeLessThan(size.maxMs);
        expect(result.length).toBeGreaterThan(0);
      },
      size.maxMs + 5000,
    );
  }

  // --- Incremental vs Full speedup benchmark ---
  it('incremental parse is faster than full re-parse for streaming', () => {
    const text = generateAIResponse(200);
    const chunkSize = 50;

    // The assertion below compares a ratio of two measurements, so noise on
    // either side can flip it — measure both as best-of-3.
    const {elapsed: fullElapsed} = measureBest(3, () =>
      simulateStreamingFullReparse(text, chunkSize),
    );
    const {elapsed: incrElapsed} = measureBest(3, () =>
      simulateStreamingIncremental(text, chunkSize),
    );

    const speedup = fullElapsed / incrElapsed;
    console.log(`\n  === Incremental vs Full Re-parse Speedup ===`);
    console.log(`  Input: ${text.length} chars, chunk size: ${chunkSize}`);
    console.log(`  Full re-parse:  ${fullElapsed.toFixed(2)}ms`);
    console.log(`  Incremental:    ${incrElapsed.toFixed(2)}ms`);
    console.log(`  Speedup ratio:  ${speedup.toFixed(2)}x\n`);

    // Incremental should be at least as fast (allowing small margin for noise)
    expect(incrElapsed).toBeLessThanOrEqual(fullElapsed * 1.1);
  });
});

// What the incremental parser exists for is a cache, so these assert the cache:
// integers that come out the same on a loaded CI box as on an idle laptop,
// unlike the wall-clock budgets above.
describe('parseMarkdownIncremental cache', () => {
  it('bounds the four measured parser operations by the unsettled tail', () => {
    const section =
      'Fixed-length paragraph with enough text to cross a stream boundary.\n\n';
    const worstWork = (sections: number) => {
      const state = createIncrementalState();
      const worst = {
        splitCharacters: 0,
        boundaryLines: 0,
        definitionCharacters: 0,
        renderedBlocks: 0,
      };
      let input = '';
      for (let i = 0; i < sections; i++) {
        input += section;
        parseMarkdownIncremental(input, state);
        const work = getIncrementalParseWork(state);
        worst.splitCharacters = Math.max(
          worst.splitCharacters,
          work.splitCharacters,
        );
        worst.boundaryLines = Math.max(worst.boundaryLines, work.boundaryLines);
        worst.definitionCharacters = Math.max(
          worst.definitionCharacters,
          work.definitionCharacters,
        );
        worst.renderedBlocks = Math.max(
          worst.renderedBlocks,
          work.renderedBlocks,
        );
      }
      return worst;
    };

    const short = worstWork(20);
    const long = worstWork(200);
    console.log(
      `  worst tail work (20/200 sections): ${JSON.stringify(short)} / ${JSON.stringify(long)}`,
    );
    // Ten times the document length does not change the four operations this
    // cache bounds: splitting (splitCharacters), boundary/fence scanning
    // (boundaryLines), definition collection (definitionCharacters), and
    // per-chunk block construction (renderedBlocks). This is deliberately NOT
    // a claim about every whole-input operation. Two costs stay linear in the
    // whole input on every call, by design, and are outside these counters:
    // the settled-prefix `startsWith` comparison that detects a replaced
    // document (replacement correctness cannot be decided without reading the
    // prefix), and the one-pointer-per-block copy that assembles each
    // returned array (snapshot semantics require a fresh array per call).
    // Both are tracked — not bounded — by the next test.
    expect(long).toEqual(short);
  });

  it('tracks the two whole-prefix costs kept linear by the public contract', () => {
    // Tracked, not bounded. These two operations intentionally remain
    // proportional to the settled prefix on each call and are OUT of the
    // scope of the tail-bounding above (see #5406 for the broader issue):
    //
    // 1. `prefixCharacters` — the memcmp-speed `startsWith` scan over the
    //    settled prefix that detects a replaced document. When the check
    //    passes it inspects exactly the settled prefix, so sampling
    //    `state.settledText.length` before each call counts it.
    // 2. `copiedEntries` — one pointer per returned block, copied so every
    //    call hands back a fresh array that later calls never mutate. The
    //    returned array's length counts it.
    //
    // The totals below grow quadratically across a stream because each call
    // pays a cost linear in the document parsed so far. They are asserted
    // exactly so that any change to either cost — bounding it, or accidentally
    // making it heavier — shows up here and updates this record.
    const section =
      'Fixed-length paragraph with enough text to cross a stream boundary.\n\n';
    const trackedWork = (sections: number) => {
      const state = createIncrementalState();
      const tracked = {prefixCharacters: 0, copiedEntries: 0};
      let input = '';
      for (let i = 0; i < sections; i++) {
        input += section;
        tracked.prefixCharacters += state.settledText.length;
        tracked.copiedEntries += parseMarkdownIncremental(input, state).length;
      }
      return tracked;
    };

    const short = trackedWork(20);
    const long = trackedWork(200);
    console.log(
      `  tracked whole-prefix work (20/200 sections): ${JSON.stringify(short)} / ${JSON.stringify(long)}`,
    );
    // A blank line settles what precedes it once the next line shows it
    // starts at the margin, so the last section settles one call later.
    expect(short).toEqual({prefixCharacters: 11763, copiedEntries: 210});
    expect(long).toEqual({prefixCharacters: 1358973, copiedEntries: 20100});
  });

  it('builds a bounded number of blocks per chunk however long the document is', () => {
    const chunkSize = 50;
    const medians = [50, 200, 500].map(paragraphs =>
      percentile(
        blocksBuiltPerChunk(generateAIResponse(paragraphs), chunkSize),
        0.5,
      ),
    );
    console.log(
      `  median blocks built per chunk (50/200/500 paragraphs): ${medians.join('/')}`,
    );
    // A chunk re-parses its unsettled tail, not the document — so the typical
    // chunk's cost is a constant, and a 10x longer document does not move it.
    expect(medians).toEqual([1, 1, 1]);
  });

  it('bounds the worst chunk, not just the typical one, at every document length', () => {
    const chunkSize = 50;
    const worst = [50, 200, 500].map(paragraphs =>
      Math.max(
        ...blocksBuiltPerChunk(generateAIResponse(paragraphs), chunkSize),
      ),
    );
    console.log(
      `  worst chunk's blocks built (50/200/500 paragraphs): ${worst.join('/')}`,
    );
    // A cache that dumps on a minority of chunks is flat at the median and at
    // p95 while the total work is still quadratic: the blank-line path of
    // #5378 hit ~1.4% of chunks on this fixture, and no percentile bound saw
    // it. The worst chunk does, and each collapse costs more as the document
    // grows — so this asserts the worst one, and that a 10x document does not
    // move it. Deterministic: same fixture, same chunking, integers with no
    // timing input.
    expect(worst).toEqual([3, 3, 3]);
  });

  it('keeps the cache when source ranges are asked for', () => {
    const text = generateAIResponse(200);
    const chunkSize = 50;
    const without = sum(blocksBuiltPerChunk(text, chunkSize));
    const withRanges = sum(
      blocksBuiltPerChunk(text, chunkSize, {sourceRanges: true}),
    );
    console.log(
      `  blocks built streaming ${text.length} chars: ${without} without ranges, ${withRanges} with`,
    );
    // Stamping offsets must not cost a cache entry. An implementation that
    // tracked positions by invalidating the settled cache each chunk would
    // still pass any time budget generous enough not to flake; it fails here.
    expect(withRanges).toBe(without);
  });
});
