// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file parseUnifiedDiff.ts
 * @input A unified diff / patch string (`git diff`, `diff -u`, or a bare hunk)
 * @output Exports parseUnifiedDiff(patch) → DiffViewerFile[]
 * @position Lab utility; turns patch text into the structured model DiffViewer
 *   renders
 *
 * Tolerant by design: unknown header lines are skipped, a hunk whose counts
 * run short ends where its lines end, and input with no recognizable file or
 * hunk returns an empty array. It never throws.
 *
 * SYNC: When modified, update:
 * - /packages/lab/src/DiffViewer/parseUnifiedDiff.test.ts
 * - /packages/lab/src/DiffViewer/DiffViewer.doc.mjs (utilities section)
 */

import type {
  DiffViewerFile,
  DiffViewerFileStatus,
  DiffViewerHunk,
} from './diffTypes';

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
const GIT_HEADER_PREFIX = 'diff --git ';
const BINARY_PREFIX = 'Binary files ';
const BINARY_SUFFIX = ' differ';
const BINARY_SEPARATOR = ' and ';

/**
 * The two paths of a `Binary files X and Y differ` line, or null when the
 * line is not one. Plain string matching, not a regex, so any line (however
 * long, whatever characters it holds) is read in one pass. Like the greedy
 * pattern it replaces, the separator is the last ` and `.
 */
function parseBinaryLine(
  line: string,
): {oldPath: string; newPath: string} | null {
  if (!line.startsWith(BINARY_PREFIX) || !line.endsWith(BINARY_SUFFIX)) {
    return null;
  }
  const middle = line.slice(
    BINARY_PREFIX.length,
    line.length - BINARY_SUFFIX.length,
  );
  const split = middle.lastIndexOf(BINARY_SEPARATOR);
  if (split <= 0 || split + BINARY_SEPARATOR.length >= middle.length) {
    return null;
  }
  return {
    oldPath: middle.slice(0, split),
    newPath: middle.slice(split + BINARY_SEPARATOR.length),
  };
}

const C_ESCAPES: Record<string, number> = {
  a: 0x07,
  b: 0x08,
  t: 0x09,
  n: 0x0a,
  v: 0x0b,
  f: 0x0c,
  r: 0x0d,
  '"': 0x22,
  '\\': 0x5c,
};

const utf8 = new TextDecoder();
const utf8Encoder = new TextEncoder();

/**
 * Read a git C-style quoted path starting at `start` (the opening quote).
 * Git quotes a path that holds non-ASCII bytes or special characters and
 * writes those bytes as octal escapes (`"caf\303\251.md"`), so the escapes
 * are collected as bytes and decoded as UTF-8. Returns the path and the index
 * just past the closing quote, or null when the quote never closes.
 */
function readQuoted(
  text: string,
  start: number,
): {value: string; end: number} | null {
  const bytes: number[] = [];
  let i = start + 1;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      return {value: utf8.decode(new Uint8Array(bytes)), end: i + 1};
    }
    if (ch === '\\' && i + 1 < text.length) {
      const next = text[i + 1];
      const octal = /^[0-7]{3}/.exec(text.slice(i + 1, i + 4));
      if (octal != null) {
        bytes.push(parseInt(octal[0], 8));
        i += 4;
        continue;
      }
      if (next in C_ESCAPES) {
        bytes.push(C_ESCAPES[next]);
        i += 2;
        continue;
      }
    }
    // Any other character stands for itself (as UTF-8 bytes).
    const codePoint = text.codePointAt(i) ?? 0;
    const char = String.fromCodePoint(codePoint);
    bytes.push(...utf8Encoder.encode(char));
    i += char.length;
  }
  return null;
}

/** The path written in `raw`, unquoted and decoded when git quoted it. */
function unquotePath(raw: string): string {
  if (raw.startsWith('"')) {
    const quoted = readQuoted(raw, 0);
    if (quoted != null) {
      return quoted.value;
    }
  }
  return raw;
}

function stripPrefix(path: string, prefix: 'a/' | 'b/'): string {
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

/**
 * The two paths of a `diff --git` line. Git quotes a path that holds special
 * or non-ASCII characters; quoted paths are read whole and decoded. An
 * unquoted path may hold spaces, so a space can look like the separator: when
 * both sides name the same path (every change except a rename) the separator
 * is the middle space. A rename writes `rename from` / `rename to` lines,
 * which replace these paths, so the first-space split is only a fallback.
 */
function parseGitHeader(
  line: string,
): {oldPath: string; newPath: string} | null {
  if (!line.startsWith(GIT_HEADER_PREFIX)) {
    return null;
  }
  const rest = line.slice(GIT_HEADER_PREFIX.length);
  const paths = (left: string, right: string) => ({
    oldPath: stripPrefix(left, 'a/'),
    newPath: stripPrefix(right, 'b/'),
  });

  if (rest.startsWith('"')) {
    const left = readQuoted(rest, 0);
    if (left != null && rest[left.end] === ' ') {
      return paths(left.value, unquotePath(rest.slice(left.end + 1)));
    }
  }
  if (rest.endsWith('"')) {
    // Only the new side is quoted: it starts at the last ` "` that reads to
    // the end of the line as one quoted path.
    for (
      let split = rest.lastIndexOf(' "');
      split > 0;
      split = rest.lastIndexOf(' "', split - 1)
    ) {
      const right = readQuoted(rest, split + 1);
      if (right != null && right.end === rest.length) {
        return paths(rest.slice(0, split), right.value);
      }
    }
  }
  if (rest.length % 2 === 1) {
    const middle = (rest.length - 1) / 2;
    const left = rest.slice(0, middle);
    const right = rest.slice(middle + 1);
    if (
      rest[middle] === ' ' &&
      stripPrefix(left, 'a/') === stripPrefix(right, 'b/')
    ) {
      return paths(left, right);
    }
  }
  const space = rest.indexOf(' ');
  return space <= 0 ? null : paths(rest.slice(0, space), rest.slice(space + 1));
}

interface MutableFile {
  oldPath: string | null;
  newPath: string | null;
  status: DiffViewerFileStatus | null;
  isBinary: boolean;
  hunks: DiffViewerHunk[];
}

function emptyFile(): MutableFile {
  return {
    oldPath: null,
    newPath: null,
    status: null,
    isBinary: false,
    hunks: [],
  };
}

/**
 * `a/src/x.ts` → `src/x.ts`; `/dev/null` → null; drops a trailing
 * tab+timestamp and decodes a quoted path.
 */
function cleanPath(raw: string, prefix: 'a/' | 'b/'): string | null {
  let path = unquotePath(raw.split('\t')[0].trim());
  if (path === '/dev/null') {
    return null;
  }
  if (path.startsWith(prefix)) {
    path = path.slice(prefix.length);
  }
  return path;
}

function finalize(file: MutableFile): DiffViewerFile {
  let status = file.status;
  if (status == null) {
    if (file.oldPath == null && file.newPath != null) {
      status = 'added';
    } else if (file.newPath == null && file.oldPath != null) {
      status = 'deleted';
    } else {
      // Only git's rename lines say a file moved. Two different paths
      // without them (`diff -u a.orig a`, `diff -ruN old new`, a copy) are an
      // edit between two files, so both paths are kept.
      status = 'modified';
    }
  }
  return {
    oldPath: status === 'added' ? null : file.oldPath,
    newPath: status === 'deleted' ? null : file.newPath,
    status,
    isBinary: file.isBinary,
    hunks: file.hunks,
  };
}

function hasContent(file: MutableFile): boolean {
  return (
    file.hunks.length > 0 ||
    file.isBinary ||
    file.oldPath != null ||
    file.newPath != null ||
    file.status != null
  );
}

/**
 * Parse a unified diff into one {@link DiffViewerFile} per file.
 *
 * Accepts `git diff` output (with `diff --git`, mode, rename, copy, and
 * binary lines), classic `diff -u` output (`---`/`+++` pairs), several files in one
 * patch, and a bare `@@` hunk with no file header (returned as one file with
 * null paths). Input it cannot read yields `[]`; it never throws.
 *
 * @example
 * ```
 * const files = parseUnifiedDiff(patch);
 * files.map((file) => <DiffViewer key={file.newPath ?? file.oldPath} file={file} />);
 * ```
 */
export function parseUnifiedDiff(patch: string): DiffViewerFile[] {
  const lines = patch.split('\n').map(line => line.replace(/\r$/, ''));
  const files: DiffViewerFile[] = [];
  let file: MutableFile | null = null;
  let hunk: DiffViewerHunk | null = null;
  let oldRemaining = 0;
  let newRemaining = 0;
  let oldLine = 0;
  let newLine = 0;

  const flush = () => {
    if (file != null && hasContent(file)) {
      files.push(finalize(file));
    }
    file = null;
    hunk = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Inside a hunk: consume body lines until both counts are spent.
    if (hunk != null && (oldRemaining > 0 || newRemaining > 0)) {
      const glyph = line[0];
      if (glyph === '\\') {
        // "\ No newline at end of file" — annotates the previous line.
        continue;
      }
      if (glyph === '+') {
        hunk.lines.push({
          kind: 'added',
          content: line.slice(1),
          oldLineNumber: null,
          newLineNumber: newLine++,
        });
        newRemaining--;
        continue;
      }
      if (glyph === '-') {
        hunk.lines.push({
          kind: 'removed',
          content: line.slice(1),
          oldLineNumber: oldLine++,
          newLineNumber: null,
        });
        oldRemaining--;
        continue;
      }
      if (glyph === ' ' || line === '') {
        // Some tools strip the trailing space of an empty context line.
        if (line === '' && i === lines.length - 1) {
          continue;
        }
        hunk.lines.push({
          kind: 'context',
          content: line.slice(1),
          oldLineNumber: oldLine++,
          newLineNumber: newLine++,
        });
        oldRemaining--;
        newRemaining--;
        continue;
      }
      // Anything else ends a short hunk; fall through and read it as a header.
      hunk = null;
    }
    if (hunk != null && line.startsWith('\\')) {
      continue;
    }

    const gitPaths = parseGitHeader(line);
    if (gitPaths != null) {
      flush();
      file = emptyFile();
      file.oldPath = gitPaths.oldPath;
      file.newPath = gitPaths.newPath;
      continue;
    }

    if (
      line.startsWith('--- ') &&
      (lines[i + 1]?.startsWith('+++ ') ?? false)
    ) {
      // A `---`/`+++` pair opens a new file unless it belongs to a
      // `diff --git` header whose hunks have not started yet. A binary entry
      // never takes a pair: in `diff -r` output it was a file of its own.
      if (file == null || file.hunks.length > 0 || file.isBinary) {
        flush();
        file = emptyFile();
      }
      const current: MutableFile = file;
      current.oldPath = cleanPath(line.slice(4), 'a/');
      current.newPath = cleanPath(lines[i + 1].slice(4), 'b/');
      if (current.oldPath == null && current.status == null) {
        current.status = 'added';
      } else if (current.newPath == null && current.status == null) {
        current.status = 'deleted';
      }
      i++;
      continue;
    }

    const header = HUNK_HEADER.exec(line);
    if (header) {
      file ??= emptyFile();
      const oldStart = Number(header[1]);
      const oldLines = header[2] == null ? 1 : Number(header[2]);
      const newStart = Number(header[3]);
      const newLines = header[4] == null ? 1 : Number(header[4]);
      const next: DiffViewerHunk = {
        header: line,
        oldStart,
        oldLines,
        newStart,
        newLines,
        lines: [],
      };
      file.hunks.push(next);
      hunk = next;
      oldRemaining = oldLines;
      newRemaining = newLines;
      // A zero-length side's start names the line *before* the hunk.
      oldLine = oldLines === 0 ? oldStart + 1 : oldStart;
      newLine = newLines === 0 ? newStart + 1 : newStart;
      continue;
    }

    // GNU `diff -r` reports a binary file with this one line and no header,
    // so unless it belongs to a `diff --git` header still being read (no
    // hunks yet, not already binary), it is a file of its own.
    const binary = parseBinaryLine(line);
    if (
      binary != null &&
      (file == null || file.hunks.length > 0 || file.isBinary)
    ) {
      flush();
      const own = emptyFile();
      own.oldPath = cleanPath(binary.oldPath, 'a/');
      own.newPath = cleanPath(binary.newPath, 'b/');
      own.isBinary = true;
      file = own;
      continue;
    }

    if (file == null) {
      continue;
    }
    const current: MutableFile = file;
    if (line.startsWith('new file mode')) {
      current.status = 'added';
    } else if (line.startsWith('deleted file mode')) {
      current.status = 'deleted';
    } else if (line.startsWith('rename from ')) {
      current.oldPath = unquotePath(line.slice('rename from '.length));
      current.status = 'renamed';
    } else if (line.startsWith('rename to ')) {
      current.newPath = unquotePath(line.slice('rename to '.length));
      current.status = 'renamed';
    } else if (line.startsWith('copy from ')) {
      // A copy keeps its source, so it reads as an edit from the source path
      // to the new one; these lines also fix paths the header split wrongly.
      current.oldPath = unquotePath(line.slice('copy from '.length));
    } else if (line.startsWith('copy to ')) {
      current.newPath = unquotePath(line.slice('copy to '.length));
    } else if (
      line.startsWith('Binary files ') ||
      line === 'GIT binary patch'
    ) {
      current.isBinary = true;
    }
  }

  flush();
  return files;
}
