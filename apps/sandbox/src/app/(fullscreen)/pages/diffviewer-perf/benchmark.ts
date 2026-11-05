// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file benchmark.ts
 * @input A workload: a multi-file preset (file count and changed lines) or
 *   one file of a given size
 * @output Deterministic old/new file contents, their line and changed-line
 *   totals, and small formatting helpers for the DiffViewer performance sandbox
 * @position Pure support utilities for the DiffViewer performance sandbox;
 *   no React and no DOM, so any harness can render the same fixtures
 *
 * Multi-file workloads mirror a real large change: many small files, some
 * medium ones, and a few very large generated or vendored files, with sparse
 * edits, a handful of new and deleted files, and a few full rewrites. Every
 * value comes from a seeded generator, so a workload is byte-identical on
 * every run and in every harness.
 *
 * A changed line is an added or a removed line, the way a diff summary counts
 * them; a replaced line counts once on each side.
 */

export interface DiffBenchmarkFile {
  readonly path: string;
  /** Contents before the change; `null` for an added file. */
  readonly oldContents: string | null;
  /** Contents after the change; `null` for a deleted file. */
  readonly newContents: string | null;
}

export interface DiffBenchmarkWorkload {
  readonly id: string;
  readonly label: string;
  readonly files: ReadonlyArray<DiffBenchmarkFile>;
  /** Lines across every file's newer side (the older side for a deleted file). */
  readonly totalLines: number;
  /** Added plus removed lines across every file. */
  readonly changedLines: number;
  /** Added plus removed lines in the file that changes the most. */
  readonly largestFileChangedLines: number;
}

/**
 * Multi-file presets by file count and changed lines, from a typical change
 * set to the upper bound: large diffs up to 1,000 files and 100,000 changed
 * lines.
 */
export const MULTI_FILE_WORKLOADS = [
  {id: 'typical', label: 'Typical', files: 5, changedLines: 200},
  {id: 'large', label: 'Large', files: 50, changedLines: 4000},
  {id: 'very-large', label: 'Very large', files: 200, changedLines: 20_000},
  {id: 'upper-bound', label: 'Upper bound', files: 1000, changedLines: 100_000},
] as const;

export type MultiFileWorkloadId = (typeof MULTI_FILE_WORKLOADS)[number]['id'];

/** Single-file workloads: line counts, each with sparse edits or a rewrite. */
export const SINGLE_FILE_LINES = [100, 1000, 5000, 20_000] as const;

export type SingleFileChange = 'sparse' | 'rewrite';

/** Mulberry32: a small, fast, seeded generator; same seed, same sequence. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function between(random: () => number, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

/**
 * One line of TypeScript-like source, varied by its file and position. A
 * variant changes every line, blank ones included, so two variants share no
 * line and a rewrite changes each line on both sides.
 */
function sourceLine(fileIndex: number, line: number, variant = ''): string {
  const base = baseSourceLine(fileIndex, line, variant);
  if (variant === '') {
    return base;
  }
  return base === '' ? `// ${variant}` : `${base} // ${variant}`;
}

function baseSourceLine(
  fileIndex: number,
  line: number,
  variant: string,
): string {
  const id = `${fileIndex}_${line}${variant}`;
  switch (line % 12) {
    case 0:
      return `export interface Record${id} {`;
    case 1:
      return `  id: string; // ${variant || 'stable'} field`;
    case 2:
      return `  value: number;`;
    case 3:
      return `}`;
    case 4:
      return '';
    case 5:
      return `export async function load${id}(url: string): Promise<number> {`;
    case 6:
      return `  const response = await fetch(url, {cache: 'no-store'});`;
    case 7:
      return `  if (!response.ok) throw new Error('HTTP ' + response.status);`;
    case 8:
      return `  return (await response.json()).count ?? ${line}; // ${id}`;
    case 9:
      return `}`;
    case 10:
      return '';
    default:
      return `// Section ${Math.floor(line / 12) + 1} of file ${fileIndex}`;
  }
}

/**
 * A file never ends on a blank line: a diff reads a last blank line as the
 * final newline and does not count it, so the changed-line totals would drift.
 */
function fileLines(fileIndex: number, count: number, variant = ''): string[] {
  const lines = Array.from({length: count}, (_, line) =>
    sourceLine(fileIndex, line, variant),
  );
  if (lines.at(-1) === '') {
    lines[lines.length - 1] = `// End of file ${fileIndex}`;
  }
  return lines;
}

interface EditedLines {
  readonly lines: string[];
  /** Added plus removed lines: two per replaced line, one per inserted line. */
  readonly changedLines: number;
}

/**
 * Most changed lines in a sparse-edited file. It stays under the limit past
 * which `createDiffFile` shows one replaced block, so sparse edits always get
 * a line diff.
 */
const DIFF_EDIT_LIMIT = 2000;
/** A site replaces up to three lines and inserts up to two more. */
const MAX_SITE_CHANGED_LINES = 8;
const MAX_SPARSE_SITES = Math.floor(DIFF_EDIT_LIMIT / MAX_SITE_CHANGED_LINES);

/**
 * Edit roughly one site per `spacing` lines: each site replaces one to three
 * lines and sometimes inserts one or two more. A long file gets a wider
 * spacing, so it never reaches the diff's edit limit.
 */
function applySparseEdits(
  lines: ReadonlyArray<string>,
  random: () => number,
  minSpacing: number,
): EditedLines {
  // Sites are at least half the spacing apart, so the file holds at most
  // MAX_SPARSE_SITES sites.
  const spacing = Math.max(
    minSpacing,
    2 * Math.ceil(lines.length / MAX_SPARSE_SITES),
  );
  const next: string[] = [];
  let changedLines = 0;
  let line = 0;
  let isFirst = true;
  while (line < lines.length) {
    const gap = between(random, Math.floor(spacing / 2), spacing * 2);
    // A short file still gets one edit: its first site lands inside it.
    const reach = isFirst ? Math.min(gap, Math.floor(lines.length / 2)) : gap;
    isFirst = false;
    next.push(...lines.slice(line, line + reach));
    line += reach;
    if (line >= lines.length) {
      break;
    }
    const replaced = between(random, 1, 3);
    for (let i = 0; i < replaced && line < lines.length; i++, line++) {
      next.push(`${lines[line]} // updated`);
      changedLines += 2;
    }
    const inserted = between(random, 0, 2);
    for (let i = 0; i < inserted; i++) {
      next.push(`  void track('edit-${line}-${i}');`);
      changedLines += 1;
    }
  }
  return {lines: next, changedLines};
}

const DIRECTORIES = [
  'src/components',
  'src/hooks',
  'src/utils',
  'src/server/routes',
  'src/server/models',
  'test/unit',
  'test/integration',
  'docs/guides',
  'generated/schema',
  'vendor/parser',
];

/** File sizes in three tiers, scaled so their sum meets the target. */
function fileSizes(
  random: () => number,
  files: number,
  totalLines: number,
): number[] {
  const raw = Array.from({length: files}, () => {
    const tier = random();
    if (tier < 0.85) {
      return between(random, 30, 160);
    }
    if (tier < 0.97) {
      return between(random, 300, 1500);
    }
    return between(random, 3000, 12_000);
  });
  const sum = raw.reduce((total, size) => total + size, 0);
  const scale = totalLines / sum;
  return raw.map(size => Math.max(12, Math.round(size * scale)));
}

interface ChangeSet {
  readonly files: DiffBenchmarkFile[];
  readonly changedLines: number;
  readonly largestFileChangedLines: number;
}

/**
 * About 5% of the files are new, 2% deleted and 2% rewritten in full; the
 * rest carry sparse edits.
 */
function createChangeSet(
  seed: number,
  files: number,
  totalLines: number,
): ChangeSet {
  const random = createRandom(seed);
  const sizes = fileSizes(random, files, totalLines);
  const kinds = sizes.map(() => random());
  let changedLines = 0;
  let largestFileChangedLines = 0;
  const result = sizes.map((size, index): DiffBenchmarkFile => {
    const directory = DIRECTORIES[index % DIRECTORIES.length];
    const path = `${directory}/module_${String(index).padStart(4, '0')}.ts`;
    const original = fileLines(index, size);
    const kind = kinds[index];
    let file: DiffBenchmarkFile;
    let changed: number;
    if (kind < 0.05) {
      file = {path, oldContents: null, newContents: original.join('\n')};
      changed = size;
    } else if (kind < 0.07) {
      file = {path, oldContents: original.join('\n'), newContents: null};
      changed = size;
    } else if (kind < 0.09) {
      file = {
        path,
        oldContents: original.join('\n'),
        newContents: fileLines(index, size, 'v2').join('\n'),
      };
      changed = 2 * size;
    } else {
      // Each file draws its own edits, so a file's size never shifts the
      // edits of the files after it.
      const edited = applySparseEdits(
        original,
        createRandom(seed + index + 1),
        40,
      );
      file = {
        path,
        oldContents: original.join('\n'),
        newContents: edited.lines.join('\n'),
      };
      changed = edited.changedLines;
    }
    changedLines += changed;
    largestFileChangedLines = Math.max(largestFileChangedLines, changed);
    return file;
  });
  return {files: result, changedLines, largestFileChangedLines};
}

/**
 * First guess at file lines per changed line, from the mix of sparse edits,
 * new, deleted and rewritten files; later passes correct it.
 */
const FILE_LINES_PER_CHANGED_LINE = 5;
/** Size passes stop once the change set is this close to its target. */
const CHANGED_LINES_TOLERANCE = 0.01;
const MAX_SIZE_PASSES = 5;

/**
 * A change set of `files` files that changes about `changedLines` lines. Each
 * pass measures how many lines the mix changes and scales the file sizes
 * toward the target; every pass draws the same file kinds. Long files get
 * sparser edits, so the scale is not linear and can take a few passes.
 */
export function createMultiFileWorkload(
  files: number,
  changedLines: number,
): DiffBenchmarkWorkload {
  const seed = files * 7919 + changedLines;
  let totalLines = changedLines * FILE_LINES_PER_CHANGED_LINE;
  let changeSet = createChangeSet(seed, files, totalLines);
  for (
    let pass = 1;
    pass < MAX_SIZE_PASSES &&
    Math.abs(changeSet.changedLines - changedLines) >
      changedLines * CHANGED_LINES_TOLERANCE;
    pass++
  ) {
    totalLines = Math.round(
      (totalLines * changedLines) / changeSet.changedLines,
    );
    changeSet = createChangeSet(seed, files, totalLines);
  }
  return {
    id: `files-${files}-changed-${changedLines}`,
    label: `${files.toLocaleString()} files`,
    files: changeSet.files,
    totalLines: countLines(changeSet.files),
    changedLines: changeSet.changedLines,
    largestFileChangedLines: changeSet.largestFileChangedLines,
  };
}

/** One file of `lines` lines with sparse edits or rewritten in full. */
export function createSingleFileWorkload(
  lines: number,
  change: SingleFileChange,
): DiffBenchmarkWorkload {
  const random = createRandom(lines * 31 + (change === 'rewrite' ? 1 : 0));
  const original = fileLines(0, lines);
  const next =
    change === 'rewrite'
      ? {lines: fileLines(0, lines, 'v2'), changedLines: 2 * lines}
      : applySparseEdits(original, random, 40);
  const files = [
    {
      path: 'src/large_module.ts',
      oldContents: original.join('\n'),
      newContents: next.lines.join('\n'),
    },
  ];
  return {
    id: `single-${lines}-${change}`,
    label: `${lines.toLocaleString()} lines, ${change === 'rewrite' ? 'full rewrite' : 'sparse edits'}`,
    files,
    totalLines: countLines(files),
    changedLines: next.changedLines,
    largestFileChangedLines: next.changedLines,
  };
}

function lineCount(contents: string | null): number {
  return contents == null || contents === '' ? 0 : contents.split('\n').length;
}

export function countLines(files: ReadonlyArray<DiffBenchmarkFile>): number {
  return files.reduce(
    (total, file) =>
      total + lineCount(file.newContents ?? file.oldContents ?? null),
    0,
  );
}

export function formatDuration(value: number | null): string {
  return value == null ? '—' : `${value.toFixed(1)} ms`;
}

export function formatCount(value: number | null): string {
  return value == null ? '—' : value.toLocaleString();
}

export function formatMegabytes(bytes: number | null): string {
  return bytes == null ? '—' : `${(bytes / 1_048_576).toFixed(1)} MB`;
}
