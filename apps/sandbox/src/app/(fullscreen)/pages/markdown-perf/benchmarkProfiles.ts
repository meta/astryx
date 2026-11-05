// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file benchmarkProfiles.ts
 * @input A deterministic Markdown fixture, plugin profile, and claim density
 * @output Prepared benchmark source plus the public plugin list for that profile
 * @position Shared profile registry for the Markdown performance sandbox
 */

import {markdownSoftBreaksPlugin} from '@astryxdesign/core/Markdown/plugins';
import type {MarkdownPluginEntry} from '@astryxdesign/core/Markdown/plugins';

export type MarkdownBenchmarkClaimDensity = 'none' | 'sparse' | 'dense';
export type MarkdownBenchmarkPipeline = 'baseline' | 'plugin';
export type MarkdownBenchmarkProfileId = 'soft-breaks';

const EMPTY_PLUGINS: ReadonlyArray<MarkdownPluginEntry> = Object.freeze([]);

export interface MarkdownBenchmarkProfile {
  readonly id: MarkdownBenchmarkProfileId;
  readonly label: string;
  readonly plugins: ReadonlyArray<MarkdownPluginEntry>;
  prepareSource(source: string, density: MarkdownBenchmarkClaimDensity): string;
}

function addSoftBreakClaims(
  source: string,
  density: MarkdownBenchmarkClaimDensity,
): string {
  if (density === 'none') {
    return source;
  }
  return source
    .split('\n')
    .flatMap(line => {
      const match = /^Section (\d+) contains /.exec(line);
      if (match == null) {
        return [line];
      }
      const section = Number(match[1]);
      const claimed = density === 'dense' || section % 10 === 1;
      if (!claimed) {
        return [line];
      }
      const splitAt = line.indexOf(', and inline ');
      return splitAt < 0
        ? [line]
        : [line.slice(0, splitAt + 1), line.slice(splitAt + 2)];
    })
    .join('\n');
}

export const MARKDOWN_BENCHMARK_PROFILES: ReadonlyArray<MarkdownBenchmarkProfile> =
  [
    {
      id: 'soft-breaks',
      label: 'Soft breaks',
      plugins: [markdownSoftBreaksPlugin],
      prepareSource: addSoftBreakClaims,
    },
  ];

export function getMarkdownBenchmarkPlugins(
  profile: MarkdownBenchmarkProfile,
  pipeline: MarkdownBenchmarkPipeline,
): ReadonlyArray<MarkdownPluginEntry> {
  return pipeline === 'plugin' ? profile.plugins : EMPTY_PLUGINS;
}

export function getMarkdownBenchmarkProfile(
  id: MarkdownBenchmarkProfileId,
): MarkdownBenchmarkProfile {
  const profile = MARKDOWN_BENCHMARK_PROFILES.find(entry => entry.id === id);
  if (profile == null) {
    throw new RangeError(`Unknown Markdown benchmark profile: ${id}`);
  }
  return profile;
}
