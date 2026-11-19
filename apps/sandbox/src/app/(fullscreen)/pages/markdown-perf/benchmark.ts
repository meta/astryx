// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file benchmark.ts
 * @input Section count, source text, current offset, and burst size
 * @output Deterministic Markdown fixtures and monotone streaming offsets
 * @position Pure support utilities for the Markdown performance sandbox
 */

export function generateMarkdownFixture(sectionCount: number): string {
  const sections = Array.from({length: sectionCount}, (_, index) => {
    const number = index + 1;
    return [
      `## Section ${number}`,
      '',
      `Section ${number} contains **strong text**, *emphasis*, a [safe link](/docs/${number}), and inline \`code-${number}\`.`,
      '',
      `- Item ${number}.1 with enough prose to exercise wrapping and incremental parsing`,
      `- Item ${number}.2 with ~~removed text~~ and a final value of ${number * 17}`,
      '',
      `> Streaming note ${number}: incomplete blocks should settle without changing earlier output.`,
      '',
      '| Metric | Value |',
      '| --- | ---: |',
      `| section | ${number} |`,
      `| checksum | ${number * 101} |`,
      '',
      '```typescript',
      `const section${number} = {id: ${number}, ready: true};`,
      '```',
    ].join('\n');
  });

  return [
    '# Markdown performance fixture',
    '',
    'A deterministic document for comparing complete renders with bursty streaming updates.',
    '',
    ...sections,
  ].join('\n\n');
}

export function nextStreamOffset(
  sourceLength: number,
  currentOffset: number,
  burstSize: number,
): number {
  if (!Number.isInteger(sourceLength) || sourceLength < 0) {
    throw new RangeError('sourceLength must be a non-negative integer');
  }
  if (!Number.isInteger(currentOffset) || currentOffset < 0) {
    throw new RangeError('currentOffset must be a non-negative integer');
  }
  if (!Number.isInteger(burstSize) || burstSize <= 0) {
    throw new RangeError('burstSize must be a positive integer');
  }
  return Math.min(sourceLength, currentOffset + burstSize);
}
