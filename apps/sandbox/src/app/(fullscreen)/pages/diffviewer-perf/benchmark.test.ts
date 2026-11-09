// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {createDiffFile} from '../../../../../../../packages/lab/src/DiffViewer/createDiffFile';
import {
  countLines,
  createMultiFileWorkload,
  createSingleFileWorkload,
  formatMegabytes,
  MULTI_FILE_WORKLOADS,
  SINGLE_FILE_LINES,
  type DiffBenchmarkWorkload,
} from './benchmark';

/** Added plus removed lines in the diff DiffViewer renders, per file. */
function diffChangedLines(workload: DiffBenchmarkWorkload): number[] {
  return workload.files.map(file => {
    const diff = createDiffFile({
      oldValue: file.oldContents ?? '',
      newValue: file.newContents ?? '',
    });
    let changed = 0;
    for (const hunk of diff.hunks) {
      for (const line of hunk.lines) {
        if (line.kind !== 'context') {
          changed++;
        }
      }
    }
    return changed;
  });
}

describe('DiffViewer performance workloads', () => {
  it('builds the same multi-file workload on every call', () => {
    const first = createMultiFileWorkload(50, 4000);
    const second = createMultiFileWorkload(50, 4000);
    expect(second).toEqual(first);
    expect(first.files).toHaveLength(50);
    expect(new Set(first.files.map(file => file.path)).size).toBe(50);
  });

  it.each(MULTI_FILE_WORKLOADS)(
    '$label changes about $changedLines lines across $files files',
    ({files, changedLines}) => {
      const workload = createMultiFileWorkload(files, changedLines);
      expect(workload.files).toHaveLength(files);
      expect(workload.totalLines).toBe(countLines(workload.files));
      expect(
        Math.abs(workload.changedLines - changedLines) / changedLines,
      ).toBeLessThan(0.02);
      expect(workload.largestFileChangedLines).toBeLessThan(changedLines);
    },
  );

  it.each(MULTI_FILE_WORKLOADS.filter(({files}) => files >= 50))(
    '$label has a realistic mix of file sizes and changes',
    ({files, changedLines}) => {
      const workload = createMultiFileWorkload(files, changedLines);
      const sizes = workload.files
        .map(
          file =>
            (file.newContents ?? file.oldContents ?? '').split('\n').length,
        )
        .sort((a, b) => a - b);
      // Mostly small files, with a few far larger than the median.
      expect(sizes[Math.floor(files / 2)]).toBeLessThan(500);
      expect(sizes[files - 1]).toBeGreaterThan(
        sizes[Math.floor(files / 2)] * 10,
      );
      expect(
        workload.files.filter(
          file =>
            file.oldContents != null &&
            file.newContents != null &&
            file.oldContents !== file.newContents,
        ).length,
      ).toBeGreaterThan(files * 0.8);
    },
  );

  it.each(MULTI_FILE_WORKLOADS.filter(({files}) => files >= 200))(
    '$label adds and deletes some files',
    ({files, changedLines}) => {
      const workload = createMultiFileWorkload(files, changedLines);
      expect(workload.files.some(file => file.oldContents == null)).toBe(true);
      expect(workload.files.some(file => file.newContents == null)).toBe(true);
    },
  );

  it.each([
    ...MULTI_FILE_WORKLOADS.map(({label, files, changedLines}) => ({
      label,
      workload: () => createMultiFileWorkload(files, changedLines),
    })),
    ...SINGLE_FILE_LINES.flatMap(lines =>
      (['sparse', 'rewrite'] as const).map(change => ({
        label: `${lines} lines, ${change}`,
        workload: () => createSingleFileWorkload(lines, change),
      })),
    ),
  ])(
    '$label reports the changed lines its diff renders',
    ({workload: build}) => {
      const workload = build();
      const perFile = diffChangedLines(workload);
      expect(perFile.reduce((total, lines) => total + lines, 0)).toBe(
        workload.changedLines,
      );
      expect(Math.max(...perFile)).toBe(workload.largestFileChangedLines);
    },
  );

  it('builds one file of the requested size, sparse or rewritten', () => {
    const sparse = createSingleFileWorkload(1000, 'sparse');
    const rewrite = createSingleFileWorkload(1000, 'rewrite');
    expect(sparse.files).toHaveLength(1);
    expect(sparse.files[0].oldContents?.split('\n')).toHaveLength(1000);
    const oldLines = new Set(rewrite.files[0].oldContents?.split('\n'));
    const shared = (rewrite.files[0].newContents ?? '')
      .split('\n')
      .filter(line => oldLines.has(line));
    expect(shared).toEqual([]);
    expect(rewrite.changedLines).toBe(2000);
    const sparseOld = new Set(sparse.files[0].oldContents?.split('\n'));
    const kept = (sparse.files[0].newContents ?? '')
      .split('\n')
      .filter(line => sparseOld.has(line)).length;
    expect(kept / 1000).toBeGreaterThan(0.9);
  });

  it('formats heap readings', () => {
    expect(formatMegabytes(null)).toBe('—');
    expect(formatMegabytes(3 * 1_048_576)).toBe('3.0 MB');
  });
});
