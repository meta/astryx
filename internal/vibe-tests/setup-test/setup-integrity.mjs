#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Read-only integrity analysis for a setup-test sandbox.
 *
 * The wholesale-replacement guard rejects a modified host source or stylesheet
 * when at least 20 baseline lines and 80% of that file's baseline lines were
 * deleted. Both conditions are required so a small, legitimate rewrite does not
 * look the same as replacing an established host file.
 *
 * Deletion is counted on *substantive* lines, not raw diff lines. Wrapping a
 * component tree in a provider re-indents every line inside it, which a raw
 * `git diff` reports as deleting and re-adding the whole body even though not
 * one line of content is gone. Each line is therefore normalized — leading and
 * trailing whitespace trimmed, interior whitespace runs collapsed to a single
 * space — and a baseline line counts as deleted only when no line of the
 * current file still carries its content.
 *
 * Normalization is deliberately per line and never collapses line boundaries or
 * removes whitespace between tokens, so it cannot be used to hide a rewrite:
 * minifying a file onto one line, or stripping the spaces inside its lines,
 * leaves nothing that matches the baseline and still trips the guard.
 *
 * The `dark-mode-disabled` escape hatch reads `color-scheme` semantically
 * rather than lexically. A single-mode `color-scheme` declaration is exempt
 * only when it is a *paired mode arm* — see `pairedModeArmSpans` — because a
 * mode arm implements the light/dark switch instead of disabling it. Every
 * other form of the declaration, and every non-CSS form of the hatch
 * (`forcedTheme`, `darkMode: false`, a `color-scheme` meta tag), is unchanged.
 *
 * The `hardcoded-important` escape hatch is likewise syntactic rather than
 * lexical — see `setup-important.mjs`. The flag is found by parsing, so a
 * comment, a JSDoc block, or a prose string that merely names `!important`
 * is silent, while a declaration that carries it fails wherever it is written.
 *
 * The pattern-matched hatches — `blanket-reset` and `dark-mode-disabled` — hold
 * the same line: every one of them is matched against the added line with its
 * COMMENTS blanked out, located by the parser that owns the file (see
 * `setup-comments.mjs`). A sentence naming `all: unset`, or a comment
 * explaining that the host's own `color-scheme` arm was deliberately left
 * alone, is prose and not a change to the host. Blanking preserves offsets, so
 * a real hatch written beside a comment is still found, and a file no parser
 * can read keeps every character subject to the scan.
 */

import * as crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {importantDeclarationLines} from './setup-important.mjs';
import {commentSpans} from './setup-comments.mjs';

export const WHOLESALE_REPLACEMENT_THRESHOLD = Object.freeze({
  minimumDeletedLines: 20,
  deletedFraction: 0.8,
});

const HOST_SOURCE_EXTENSIONS = new Set([
  '.cjs',
  '.css',
  '.html',
  '.js',
  '.jsx',
  '.less',
  '.mjs',
  '.pcss',
  '.sass',
  '.scss',
  '.svelte',
  '.ts',
  '.tsx',
  '.vue',
]);

/**
 * The escape hatches found by matching the added line itself.
 *
 * Each is matched against the line with its comments blanked out — see
 * `setup-comments.mjs`. A pattern that reads a comment reports prose as a
 * change to the host, which is what `hardcoded-important` used to do before
 * #5856 made it syntactic.
 *
 * `hardcoded-important` is deliberately absent: it is found by parsing the
 * file rather than by matching a line, in `syntacticFindings`.
 */
const ESCAPE_HATCHES = [
  {
    kind: 'blanket-reset',
    pattern: /\ball\s*:\s*(?:unset|initial|revert)\b/i,
    message: 'added a blanket all-property reset',
  },
  {
    kind: 'dark-mode-disabled',
    pattern:
      /\bcolor-scheme\s*:\s*(?:only\s+light|light\s+only|light(?=\s*[;}]))\b|\bforcedTheme\s*=\s*["']light["']|\bdarkMode\s*[:=]\s*(?:false|["'](?:disabled|off|light)["'])|<meta\b[^>]*\bname\s*=\s*["']color-scheme["'][^>]*\bcontent\s*=\s*["']light(?:\s+only)?["']/i,
    message: 'explicitly disabled dark-mode behavior',
  },
];

const HARDCODED_IMPORTANT = Object.freeze({
  kind: 'hardcoded-important',
  message: 'added a hardcoded !important declaration',
});

const compareText = (left, right) => (left < right ? -1 : left > right ? 1 : 0);

function git(appDir, args, options = {}) {
  return execFileSync('git', ['-C', appDir, ...args], {
    encoding: options.encoding ?? 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function assertRepositoryRoot(appDir) {
  // One launch reads the top level and checks HEAD. When it fails, the two
  // checks run apart, so the first failure is reported as before.
  let topAndHead = null;
  try {
    topAndHead = git(appDir, [
      'rev-parse',
      '--show-toplevel',
      '--verify',
      'HEAD',
    ]);
  } catch {
    topAndHead = null;
  }
  const top = topAndHead ?? git(appDir, ['rev-parse', '--show-toplevel']);
  const root = path.resolve(top.split('\n')[0].trim());
  const requested = fs.realpathSync(appDir);
  const actual = fs.realpathSync(root);
  if (requested !== actual) {
    throw new Error(`--app must name the sandbox repository root: ${appDir}`);
  }
  if (topAndHead === null) git(appDir, ['rev-parse', '--verify', 'HEAD']);
}

function trackedPatch(appDir) {
  return git(
    appDir,
    [
      '-c',
      'core.quotePath=false',
      'diff',
      '--binary',
      '--full-index',
      '--no-color',
      '--no-ext-diff',
      '--no-textconv',
      '--no-renames',
      'HEAD',
      '--',
    ],
    {encoding: 'buffer'},
  );
}

function untrackedPaths(appDir) {
  const output = git(appDir, [
    '-c',
    'core.quotePath=false',
    'ls-files',
    '--others',
    '--exclude-standard',
    '-z',
  ]);
  return output.split('\0').filter(Boolean).sort(compareText);
}

function untrackedEntry(appDir, relativePath) {
  const absolutePath = path.join(appDir, relativePath);
  const stat = fs.lstatSync(absolutePath);
  if (stat.isSymbolicLink()) {
    return {
      bytes: Buffer.from(fs.readlinkSync(absolutePath)),
      mode: '120000',
      binary: false,
    };
  }
  const bytes = fs.readFileSync(absolutePath);
  return {
    bytes,
    mode: stat.mode & 0o111 ? '100755' : '100644',
    binary: bytes.includes(0),
  };
}

function updateFramed(hash, label, bytes) {
  const content = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  hash.update(`${label}\0${content.length}\0`);
  hash.update(content);
  hash.update('\0');
}

function untrackedEntries(appDir) {
  return untrackedPaths(appDir).map(relativePath => ({
    path: relativePath,
    ...untrackedEntry(appDir, relativePath),
  }));
}

function digestDiff(patch, untracked) {
  const hash = crypto.createHash('sha256');
  updateFramed(hash, 'format', 'setup-integrity-v1');
  updateFramed(hash, 'tracked-diff', patch);
  for (const file of untracked) {
    updateFramed(hash, 'untracked-path', file.path);
    updateFramed(hash, 'untracked-mode', file.mode);
    updateFramed(hash, 'untracked-content', file.bytes);
  }
  return hash.digest('hex');
}

function lineCount(bytes) {
  if (bytes.length === 0) return 0;
  let count = 0;
  for (const byte of bytes) {
    if (byte === 10) count += 1;
  }
  return count + (bytes.at(-1) === 10 ? 0 : 1);
}

function trackedNumstat(appDir) {
  const output = git(appDir, [
    'diff',
    '--numstat',
    '-z',
    '--no-renames',
    'HEAD',
    '--',
  ]);
  return output
    .split('\0')
    .filter(Boolean)
    .map(record => {
      const firstTab = record.indexOf('\t');
      const secondTab = record.indexOf('\t', firstTab + 1);
      const addedText = record.slice(0, firstTab);
      const deletedText = record.slice(firstTab + 1, secondTab);
      return {
        path: record.slice(secondTab + 1),
        added: addedText === '-' ? 0 : Number(addedText),
        deleted: deletedText === '-' ? 0 : Number(deletedText),
        binary: addedText === '-' || deletedText === '-',
      };
    });
}

function baselineBytes(appDir, relativePath) {
  return git(appDir, ['show', `HEAD:${relativePath}`], {encoding: 'buffer'});
}

/**
 * Collapse a line to the content a reader would compare by eye: no leading or
 * trailing whitespace, and every interior run of whitespace as a single space.
 *
 * Runs collapse to one space rather than to nothing, so `label="Deploy"` and
 * `label = "Deploy"` are the same line while `a b` and `ab` are not.
 */
function normalizeLine(text) {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Count how many of a file's baseline lines no longer appear anywhere in its
 * current content, comparing lines after whitespace normalization and ignoring
 * blank lines. Re-indenting a file therefore deletes nothing, while replacing
 * its content deletes all of it.
 */
export function substantiveLineDelta(baselineText, currentText) {
  const remaining = new Map();
  for (const line of currentText.split('\n')) {
    const normalized = normalizeLine(line);
    if (normalized === '') continue;
    remaining.set(normalized, (remaining.get(normalized) ?? 0) + 1);
  }

  let baselineLines = 0;
  let deletedLines = 0;
  for (const line of baselineText.split('\n')) {
    const normalized = normalizeLine(line);
    if (normalized === '') continue;
    baselineLines += 1;
    const available = remaining.get(normalized) ?? 0;
    if (available > 0) remaining.set(normalized, available - 1);
    else deletedLines += 1;
  }

  return {
    baselineLines,
    deletedLines,
    deletedFraction: baselineLines === 0 ? 0 : deletedLines / baselineLines,
  };
}

function isHostSource(relativePath) {
  return HOST_SOURCE_EXTENSIONS.has(path.extname(relativePath).toLowerCase());
}

/* ---------------------------------------------------------------------------
 * Semantic `color-scheme` analysis
 *
 * `astryx theme build` emits, for any theme with `light-dark()` values:
 *
 *   :root { color-scheme: light dark; }
 *   html[data-theme="light"] { color-scheme: light; }
 *   html[data-theme="dark"] { color-scheme: dark; }
 *
 * Those three rules *implement* mode support — they are what lets a mode
 * attribute resolve `light-dark()` — but a lexical `color-scheme: light` scan
 * reads the second one as disabling dark mode. Established hosts write the same
 * shape by hand (the `enterprise-scoped-synthetic` fixture pairs
 * `.fixture-shell[data-mode='light']` with its dark twin), so this is not a
 * generated-file problem and is not fixed by ignoring generated files.
 *
 * A declaration is exempt only as a *paired mode arm*: its own selector scopes
 * it to exactly one mode, its value is that same mode, and the complementary
 * arm exists at the same scope in the same file. Both halves of the switch have
 * to be present for the pair to mean "this file implements light and dark".
 * ------------------------------------------------------------------------- */

/**
 * Selector and at-rule syntax that scopes a rule to one color mode:
 * a mode-valued attribute (`[data-theme="dark"]`, `[data-mode='light']`,
 * `[data-astryx-media="dark"]`), a `prefers-color-scheme` media condition, or a
 * `.light`/`.dark` mode class. A theme-name attribute such as
 * `[data-astryx-theme="apptheme"]` names no mode and is not one of these.
 */
const MODE_DISCRIMINATOR_PATTERN =
  /\[\s*[A-Za-z_][\w-]*(?:theme|mode|scheme|appearance|media)\s*=\s*["']?(light|dark)["']?\s*\]|\(\s*prefers-color-scheme\s*:\s*(light|dark)\s*\)|\.(light|dark)(?![\w-])/gi;

/** `color-scheme: light`, `color-scheme: only dark`, `color-scheme: dark only`. */
const SINGLE_MODE_VALUE = /^(?:only\s+)?(light|dark)(?:\s+only)?$/i;

/**
 * The mode discriminators in a selector or at-rule prelude, plus the same text
 * with every discriminator's mode replaced by a placeholder. Two arms belong to
 * the same switch when their placeholder text is identical, so
 * `html[data-theme="light"]` pairs with `html[data-theme="dark"]` and not with
 * `.widget[data-theme="dark"]`.
 */
function modeDiscriminators(text) {
  const modes = new Set();
  const skeleton = text.replace(
    MODE_DISCRIMINATOR_PATTERN,
    (match, attribute, media, className) => {
      modes.add((attribute ?? media ?? className).toLowerCase());
      return match
        .replace(/["']/g, '')
        .replace(/\s+/g, '')
        .replace(/(?<![\w-])(?:light|dark)(?![\w-])/i, '<mode>');
    },
  );
  return {modes, skeleton: skeleton.replace(/\s+/g, ' ').trim()};
}

/**
 * Every declaration in a stylesheet, with the selector/at-rule preludes it is
 * nested inside and its absolute character span.
 *
 * Quoted strings and comments are read as opaque text: their braces and
 * semicolons are not structure, so `content: "}"` cannot desynchronize the
 * scan, and a `color-scheme` declaration written inside a JavaScript string
 * literal never becomes a block-scoped declaration that could be exempted.
 */
export function scanStyleDeclarations(text) {
  const declarations = [];
  const stack = [];
  let buffer = '';
  let bufferStart = -1;
  let index = 0;

  const append = (chunk, at) => {
    if (bufferStart === -1 && chunk.trim() !== '') {
      bufferStart = at + (chunk.length - chunk.trimStart().length);
    }
    buffer += chunk;
  };
  const reset = () => {
    buffer = '';
    bufferStart = -1;
  };
  const flushDeclaration = end => {
    const match = /^([A-Za-z-]+)\s*:\s*([\s\S]+)$/.exec(buffer.trim());
    if (match && bufferStart !== -1) {
      declarations.push({
        property: match[1].toLowerCase(),
        value: match[2].trim(),
        context: [...stack],
        start: bufferStart,
        end,
      });
    }
    reset();
  };

  while (index < text.length) {
    const character = text[index];
    if (character === '/' && text[index + 1] === '*') {
      const close = text.indexOf('*/', index + 2);
      index = close === -1 ? text.length : close + 2;
      continue;
    }
    if (character === '"' || character === "'") {
      const start = index;
      index += 1;
      while (index < text.length && text[index] !== '\n') {
        if (text[index] === '\\') {
          index += 2;
          continue;
        }
        if (text[index] === character) {
          index += 1;
          break;
        }
        index += 1;
      }
      append(text.slice(start, index), start);
      continue;
    }
    if (character === '{') {
      stack.push(buffer.trim());
      reset();
      index += 1;
      continue;
    }
    if (character === '}') {
      flushDeclaration(index);
      stack.pop();
      index += 1;
      continue;
    }
    if (character === ';') {
      flushDeclaration(index);
      index += 1;
      continue;
    }
    append(character, index);
    index += 1;
  }
  return declarations;
}

function lineSpans(text, spans) {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n') starts.push(index + 1);
  }
  const byLine = new Map();
  const lineOf = offset => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (starts[middle] <= offset) low = middle;
      else high = middle - 1;
    }
    return low;
  };
  for (const span of spans) {
    let line = lineOf(span.start);
    while (line < starts.length && starts[line] < span.end) {
      const lineStart = starts[line];
      const lineEnd =
        line + 1 < starts.length ? starts[line + 1] - 1 : text.length;
      const start = Math.max(span.start, lineStart) - lineStart;
      const end = Math.min(span.end, lineEnd) - lineStart;
      if (end > start) {
        const existing = byLine.get(line + 1) ?? [];
        existing.push({start, end});
        byLine.set(line + 1, existing);
      }
      line += 1;
    }
  }
  return byLine;
}

/**
 * The character spans of every `color-scheme` declaration in `text` that is a
 * paired mode arm, keyed by 1-based line number.
 *
 * An arm qualifies when its enclosing selectors and at-rules name exactly one
 * mode, its value is that same mode, and a complementary arm for the other mode
 * exists at the same scope. An arm whose value contradicts its own selector
 * (`html[data-theme="dark"] { color-scheme: light; }`), an unpaired arm, and any
 * declaration outside a mode-scoped rule (`:root { color-scheme: light; }`) are
 * all absent from the result and stay subject to the escape-hatch scan.
 */
export function pairedModeArmSpans(text) {
  const arms = [];
  for (const declaration of scanStyleDeclarations(text)) {
    if (declaration.property !== 'color-scheme') continue;
    const value = SINGLE_MODE_VALUE.exec(declaration.value);
    if (!value) continue;
    const {modes, skeleton} = modeDiscriminators(declaration.context.join(' '));
    if (modes.size !== 1) continue;
    const [mode] = modes;
    if (mode !== value[1].toLowerCase()) continue;
    arms.push({mode, skeleton, start: declaration.start, end: declaration.end});
  }

  const modesByScope = new Map();
  for (const arm of arms) {
    const seen = modesByScope.get(arm.skeleton) ?? new Set();
    seen.add(arm.mode);
    modesByScope.set(arm.skeleton, seen);
  }
  return lineSpans(
    text,
    arms.filter(arm => modesByScope.get(arm.skeleton).size === 2),
  );
}

/** Text that participates in a light/dark switch, for removal detection. */
function mentionsMode(text) {
  return (
    /\bcolor-scheme\s*:/i.test(text) ||
    new RegExp(MODE_DISCRIMINATOR_PATTERN.source, 'i').test(text)
  );
}

/**
 * True when this change deleted a line that carried part of a mode switch and
 * did not put it back. Deleting one arm of a host's switch and adding a fresh
 * pair elsewhere in the same file would otherwise buy an exemption for the
 * added pair, so an exemption is withheld from a file that lost a mode line.
 */
function droppedModeLine(removedLines, currentSource) {
  if (removedLines.length === 0) return false;
  const remaining = new Set(
    currentSource.split('\n').map(normalizeLine).filter(Boolean),
  );
  return removedLines.some(
    removed =>
      mentionsMode(removed.text) && !remaining.has(normalizeLine(removed.text)),
  );
}

const GENERATED_BANNER = /@generated by `astryx theme build`/;

/**
 * Whether a file's claim to be a generated theme artifact holds up.
 *
 * `astryx theme build <source>` writes its output next to the source file (or
 * where an explicit `--out` in the recorded command says), and stamps a header
 * naming that source. A file carrying the header is checked against it: the
 * declared source must be a relative path inside the sandbox that still exists,
 * and this file must be where that build would have written it. A file with no
 * header makes no claim and is judged on its content alone; a file whose header
 * does not hold up is treated as hostile and gets no exemption, so pasting a
 * generated banner on top of an edited host stylesheet buys nothing.
 *
 * @returns {'unclaimed'|'valid'|'forged'}
 */
function generatedThemeProvenance(appDir, relativePath, text) {
  const header = text.slice(0, 2048);
  if (!GENERATED_BANNER.test(header)) return 'unclaimed';
  const source = /^[\s*/]*Source:\s*(\S.*?)\s*$/m.exec(header)?.[1];
  if (!source) return 'forged';
  if (path.isAbsolute(source)) return 'forged';
  const sourcePath = path.normalize(source);
  if (sourcePath.split(/[\\/]/).includes('..')) return 'forged';
  if (!fs.existsSync(path.join(appDir, sourcePath))) return 'forged';

  const emitted = /^[\s*/]*Command:\s*(\S.*?)\s*$/m.exec(header)?.[1] ?? '';
  const out = /--out(?:=|\s+)(\S+)/.exec(emitted)?.[1];
  const destination = out ? path.normalize(out) : null;
  if (destination !== null) {
    return destination === path.normalize(relativePath) ? 'valid' : 'forged';
  }
  return path.dirname(sourcePath) === path.dirname(path.normalize(relativePath))
    ? 'valid'
    : 'forged';
}

/**
 * The exempt `color-scheme` spans for one file: empty unless the file's own
 * content proves it implements both modes, it did not lose a mode line in this
 * change, and any generated-artifact claim it makes is true.
 */
function modeArmExemptions(appDir, relativePath, currentSource, removedLines) {
  if (!currentSource.includes('color-scheme')) return new Map();
  if (droppedModeLine(removedLines, currentSource)) return new Map();
  if (
    generatedThemeProvenance(appDir, relativePath, currentSource) === 'forged'
  )
    return new Map();
  return pairedModeArmSpans(currentSource);
}

/**
 * The spans on each line that no escape hatch may read: the file's comments,
 * which are prose rather than a change to the host, plus its exempt paired mode
 * arms.
 *
 * A file this module cannot parse contributes no comment spans, so nothing is
 * exempted on a guess.
 */
function hatchMaskFor(appDir, relativePath, currentSource, removedLines) {
  const masked = lineSpans(
    currentSource,
    commentSpans(relativePath, currentSource),
  );
  for (const [line, spans] of modeArmExemptions(
    appDir,
    relativePath,
    currentSource,
    removedLines,
  )) {
    masked.set(line, [...(masked.get(line) ?? []), ...spans]);
  }
  return masked;
}

/** The line with its exempt spans blanked out, for escape-hatch matching. */
function maskSpans(text, spans) {
  if (!spans || spans.length === 0) return text;
  let masked = text;
  for (const span of spans) {
    const end = Math.min(span.end, masked.length);
    if (end <= span.start) continue;
    masked =
      masked.slice(0, span.start) +
      ' '.repeat(end - span.start) +
      masked.slice(end);
  }
  return masked;
}

function addedLinesFromPatch(patch) {
  const lines = [];
  let newLine = 0;
  for (const line of patch.split('\n')) {
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }
    if (line.startsWith('+++')) continue;
    if (line.startsWith('+')) {
      lines.push({line: newLine, text: line.slice(1)});
      newLine += 1;
    } else if (!line.startsWith('-') && !line.startsWith('\\ No newline')) {
      newLine += 1;
    }
  }
  return lines;
}

function zeroContextPatch(appDir, relativePath) {
  return git(appDir, [
    '-c',
    'core.quotePath=false',
    'diff',
    '--unified=0',
    '--no-color',
    '--no-ext-diff',
    '--no-textconv',
    '--no-renames',
    'HEAD',
    '--',
    relativePath,
  ]);
}

function removedLinesFromPatch(patch) {
  const lines = [];
  let oldLine = 0;
  for (const line of patch.split('\n')) {
    const hunk = line.match(/^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/);
    if (hunk) {
      oldLine = Number(hunk[1]);
      continue;
    }
    if (line.startsWith('---')) continue;
    if (line.startsWith('-')) {
      lines.push({line: oldLine, text: line.slice(1)});
      oldLine += 1;
    } else if (!line.startsWith('+') && !line.startsWith('\\ No newline')) {
      oldLine += 1;
    }
  }
  return lines;
}

function untrackedAddedLines(file) {
  if (file.binary) return [];
  return file.bytes
    .toString('utf8')
    .split('\n')
    .map((text, index) => ({line: index + 1, text}));
}

function evidenceFor(relativePath, lines) {
  const evidence = [];
  for (const added of lines) {
    if (/@astryxdesign\//.test(added.text)) {
      evidence.push({
        path: relativePath,
        line: added.line,
        kind: /(?:^|\s)(?:import|require\s*\()/.test(added.text)
          ? 'code-import'
          : /(?:\.css|theme\.css)/.test(added.text)
            ? 'stylesheet-import'
            : 'package-reference',
        text: added.text.trim(),
      });
    }
  }
  return evidence;
}

/**
 * Escape hatches on the lines this change added.
 *
 * `importantLines` carries the parser's verdict for the whole file: the line
 * numbers where a `!important` is an applied CSS declaration. Intersecting it
 * with the added lines keeps the rule unchanged — only what this change added
 * is judged — while the judgment itself is now syntactic.
 *
 * `maskedSpans` does the same job for the pattern-matched hatches: every one of
 * them reads the line with its comments blanked, so prose that names a hatch is
 * silent while the hatch itself is found wherever it is written — including on
 * the same line as the comment that discusses it.
 */
function findingsFor(relativePath, lines, maskedSpans, importantLines) {
  const findings = [];
  for (const added of lines) {
    if (importantLines?.has(added.line)) {
      findings.push({
        kind: HARDCODED_IMPORTANT.kind,
        path: relativePath,
        line: added.line,
        message: HARDCODED_IMPORTANT.message,
      });
    }
    const masked = maskSpans(added.text, maskedSpans?.get(added.line));
    for (const escapeHatch of ESCAPE_HATCHES) {
      if (escapeHatch.pattern.test(masked)) {
        findings.push({
          kind: escapeHatch.kind,
          path: relativePath,
          line: added.line,
          message: escapeHatch.message,
        });
      }
    }
  }
  return findings;
}

/**
 * The `diffSha256` that `analyzeSetupIntegrity` reports for the working tree,
 * from only the git reads the digest needs. A caller that only attests a
 * working tree uses it instead of a full analysis.
 */
export function setupDiffSha256(appDir) {
  const resolvedAppDir = path.resolve(appDir);
  assertRepositoryRoot(resolvedAppDir);
  return digestDiff(
    trackedPatch(resolvedAppDir),
    untrackedEntries(resolvedAppDir),
  );
}

/**
 * Analyze the working tree relative to its committed pre-agent HEAD.
 * This function only invokes read-only Git commands and reads file bytes.
 */
export function analyzeSetupIntegrity(appDir, attestedDiffSha256) {
  const resolvedAppDir = path.resolve(appDir);
  assertRepositoryRoot(resolvedAppDir);

  const patch = trackedPatch(resolvedAppDir);
  const untracked = untrackedEntries(resolvedAppDir);
  const untrackedByPath = new Map(untracked.map(file => [file.path, file]));
  const tracked = trackedNumstat(resolvedAppDir);
  // Each git command is a process launch, so a file's baseline and its
  // zero-context diff are read once per run.
  const baselines = new Map();
  const baselineOf = relativePath => {
    if (!baselines.has(relativePath)) {
      let bytes = null;
      try {
        bytes = baselineBytes(resolvedAppDir, relativePath);
      } catch {
        bytes = null;
      }
      baselines.set(relativePath, bytes);
    }
    return baselines.get(relativePath);
  };
  const patches = new Map();
  const zeroContextPatchOf = relativePath => {
    if (!patches.has(relativePath)) {
      patches.set(relativePath, zeroContextPatch(resolvedAppDir, relativePath));
    }
    return patches.get(relativePath);
  };
  const trackedAddedLines = relativePath =>
    addedLinesFromPatch(zeroContextPatchOf(relativePath));
  const trackedRemovedLines = relativePath =>
    removedLinesFromPatch(zeroContextPatchOf(relativePath));
  const changedFiles = [];
  const escapeHatches = [];
  const astryxEvidence = [];

  for (const file of tracked) {
    const absolutePath = path.join(resolvedAppDir, file.path);
    const existedAtBaseline = baselineOf(file.path) !== null;
    const existsNow = fs.existsSync(absolutePath);
    const status = !existedAtBaseline
      ? 'added'
      : !existsNow
        ? 'deleted'
        : 'modified';
    changedFiles.push({
      path: file.path,
      status,
      tracked: true,
      added: file.added,
      deleted: file.deleted,
      binary: file.binary,
    });

    if (status === 'deleted' && isHostSource(file.path)) {
      escapeHatches.push({
        kind: 'deleted-host-source',
        path: file.path,
        line: null,
        message: 'deleted a host source or stylesheet file',
      });
      continue;
    }

    if (status === 'modified' && isHostSource(file.path) && !file.binary) {
      const currentSource = fs.readFileSync(absolutePath, 'utf8');
      const {baselineLines, deletedLines, deletedFraction} =
        substantiveLineDelta(
          baselineOf(file.path).toString('utf8'),
          currentSource,
        );
      if (
        deletedLines >= WHOLESALE_REPLACEMENT_THRESHOLD.minimumDeletedLines &&
        deletedFraction >= WHOLESALE_REPLACEMENT_THRESHOLD.deletedFraction
      ) {
        escapeHatches.push({
          kind: 'wholesale-replacement',
          path: file.path,
          line: null,
          message: 'replaced most of an established host source or stylesheet',
          baselineLines,
          deletedLines,
          deletedFraction,
          rawDeletedLines: file.deleted,
        });
      } else if (
        path.extname(file.path).toLowerCase() === '.css' &&
        deletedFraction >= WHOLESALE_REPLACEMENT_THRESHOLD.deletedFraction
      ) {
        escapeHatches.push({
          kind: 'neutralized-host-css',
          path: file.path,
          line: null,
          message: 'removed most of an established host stylesheet',
          baselineLines,
          deletedLines,
          deletedFraction,
          rawDeletedLines: file.deleted,
        });
      }

      const removedModeLines = trackedRemovedLines(file.path).filter(removed =>
        /\b(?:dark|color-scheme|data-theme)\b/i.test(removed.text),
      );
      if (
        removedModeLines.length > 0 &&
        !/\b(?:dark|color-scheme|data-theme)\b/i.test(currentSource)
      ) {
        escapeHatches.push({
          kind: 'dark-mode-removed',
          path: file.path,
          line: removedModeLines[0].line,
          message: 'removed the host dark-mode behavior',
        });
      }
    }

    if (file.path === '.gitignore' && status !== 'added') {
      escapeHatches.push({
        kind: 'gitignore-modified',
        path: file.path,
        line: null,
        message: 'modified ignore rules after the execution baseline',
      });
    }
    if (status !== 'deleted' && !file.binary) {
      const addedLines = trackedAddedLines(file.path);
      if (isHostSource(file.path)) {
        const currentSource = fs.readFileSync(absolutePath, 'utf8');
        escapeHatches.push(
          ...findingsFor(
            file.path,
            addedLines,
            hatchMaskFor(
              resolvedAppDir,
              file.path,
              currentSource,
              existedAtBaseline ? trackedRemovedLines(file.path) : [],
            ),
            importantDeclarationLines(file.path, currentSource),
          ),
        );
      }
      astryxEvidence.push(...evidenceFor(file.path, addedLines));
    }
  }

  for (const file of untracked) {
    const added = file.binary ? 0 : lineCount(file.bytes);
    changedFiles.push({
      path: file.path,
      status: 'untracked',
      tracked: false,
      added,
      deleted: 0,
      binary: file.binary,
    });
    const addedLines = untrackedAddedLines(untrackedByPath.get(file.path));
    if (isHostSource(file.path)) {
      const currentSource = file.binary ? null : file.bytes.toString('utf8');
      escapeHatches.push(
        ...findingsFor(
          file.path,
          addedLines,
          currentSource === null
            ? undefined
            : hatchMaskFor(resolvedAppDir, file.path, currentSource, []),
          currentSource === null
            ? undefined
            : importantDeclarationLines(file.path, currentSource),
        ),
      );
    }
    astryxEvidence.push(...evidenceFor(file.path, addedLines));
  }

  changedFiles.sort((left, right) => compareText(left.path, right.path));
  escapeHatches.sort(
    (left, right) =>
      compareText(left.path, right.path) ||
      (left.line ?? -1) - (right.line ?? -1) ||
      compareText(left.kind, right.kind),
  );
  astryxEvidence.sort(
    (left, right) =>
      compareText(left.path, right.path) ||
      left.line - right.line ||
      compareText(left.kind, right.kind),
  );

  const diffSha256 = digestDiff(patch, untracked);
  const attestationProvided = typeof attestedDiffSha256 === 'string';
  const attestationMatches =
    attestationProvided && attestedDiffSha256 === diffSha256;
  const rejectionReasons = escapeHatches.map(finding => finding.kind);
  if (astryxEvidence.length === 0)
    rejectionReasons.push('missing-astryx-usage');
  if (!attestationProvided) rejectionReasons.push('missing-attestation');
  else if (!attestationMatches) rejectionReasons.push('attestation-mismatch');

  return {
    schemaVersion: 1,
    diffSha256,
    changedFiles,
    counts: {
      files: changedFiles.length,
      added: changedFiles.reduce((sum, file) => sum + file.added, 0),
      deleted: changedFiles.reduce((sum, file) => sum + file.deleted, 0),
    },
    astryxUsage: {
      found: astryxEvidence.length > 0,
      evidence: astryxEvidence,
    },
    escapeHatches,
    wholesaleReplacementThreshold: WHOLESALE_REPLACEMENT_THRESHOLD,
    attestation: {
      provided: attestationProvided,
      expectedSha256: attestedDiffSha256 ?? null,
      matches: attestationMatches,
    },
    accepted: rejectionReasons.length === 0,
    rejectionReasons: [...new Set(rejectionReasons)].sort(compareText),
  };
}

function parseCli(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument !== '--app' && argument !== '--attested-diff-sha256') {
      throw new Error(
        'usage: setup-integrity.mjs --app <sandbox> [--attested-diff-sha256 <sha256>]',
      );
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`missing value for ${argument}`);
    }
    parsed[argument.slice(2)] = value;
    index += 1;
  }
  if (!parsed.app) {
    throw new Error(
      'usage: setup-integrity.mjs --app <sandbox> [--attested-diff-sha256 <sha256>]',
    );
  }
  return parsed;
}

const isMain =
  process.argv[1] != null &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const args = parseCli(process.argv.slice(2));
  const result = analyzeSetupIntegrity(
    path.resolve(args.app),
    args['attested-diff-sha256'],
  );
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
