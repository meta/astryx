// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Concrete findings in one change, each at a file and line.
 * @input A unified diff, a reader for the head tree, the Changeset coverage
 *   result, and the pull request description when one is given.
 * @output Findings for checklist items h to l: the item, the file and line,
 *   the rule, and the fix.
 * @position Called by `scripts/pre-review.mjs`. SYNC: keep each rule in step
 *   with its item in `docs/contributing/pull-requests.md#pre-review-checklist`.
 */
import path from 'node:path';
import {createRequire} from 'node:module';
import {parseFrontmatter} from '../check-changesets.mjs';

const require = createRequire(import.meta.url);
const {parseEntry} = require('../changeset-entry-format.cjs');

export const SIZE_LIMIT = 2000;

const LOCKFILE =
  /(?:^|\/)(?:pnpm-lock\.yaml|package-lock\.json|npm-shrinkwrap\.json|yarn\.lock)$/;
const SNAPSHOT = /(?:^|\/)__snapshots__\/|\.snap$/;
const COMMENT = /^\s*(?:\/\/|\/\*|\*)/;
const DIRECTIVE = /eslint-|@ts-|prettier-ignore|@pr-a11y/;
const RUNTIME = '`architecture:react-component-runtime`';

/**
 * Changed lines a person wrote: not lockfiles, snapshots, or generated files.
 * `changedCountByFile` comes from `readDiff`.
 */
export function authoredLineCount(
  changedCountByFile,
  isGenerated = () => false,
) {
  let total = 0;
  for (const [file, count] of Object.entries(changedCountByFile)) {
    if (!LOCKFILE.test(file) && !SNAPSHOT.test(file) && !isGenerated(file)) {
      total += count;
    }
  }
  return total;
}

export const BATCH_SIZE_LIMIT = 8000;
const BEHAVIOR_MODULE_DECLARATION =
  /^[ \t]*(?:[-*][ \t]*)?(?:Behavior module:[ \t]*\S|This behavior-module (?:pull request|PR) (?:adds|changes|builds|extends) \S)/m;
const BATCH_ROW = /^[ \t]*(?:[-*|][ \t]*)?Batch:[ \t]*\S/m;
const STACK_LINE = /^[ \t]*(?:[-*|][ \t]*)?Stack:[ \t]*\S/m;

/**
 * Item h. `body` is the pull request description, or null when the report
 * cannot read it.
 */
export function sizeFindings(authored, body) {
  if (authored <= SIZE_LIMIT) return [];
  if (body != null && BEHAVIOR_MODULE_DECLARATION.test(body)) return [];
  const isBatch = body != null && BATCH_ROW.test(body);
  if (isBatch && authored <= BATCH_SIZE_LIMIT) return [];
  const limit = isBatch ? BATCH_SIZE_LIMIT : SIZE_LIMIT;
  const split = `Split the change into pull requests of at most ${limit} authored lines.`;
  let fix = split;
  if (body == null) {
    fix = `${split} A declared behavior-module pull request, or a \`Batch:\` row up to ${BATCH_SIZE_LIMIT} lines, is exempt; pass --body-file or --pr to read the description.`;
  } else if (STACK_LINE.test(body)) {
    fix = `${split} For a stacked pull request, pass --base the branch below it, so the count covers only its own lines.`;
  }
  return [
    {
      item: 'h',
      file: null,
      line: null,
      rule: `${authored} authored lines, over ${limit}${isBatch ? ' for a batch' : ''}`,
      fix,
    },
  ];
}

const DOCUMENT_RECEIVER =
  /^(?:document|window|doc|win|view|defaultView|globalThis|self)$|(?:Document|Window)$/;

/** True when the line adds a listener to a document or a window. */
export function addsDocumentListener(text) {
  for (const match of text.matchAll(
    /([\w$]+)(\([^()]*\))?\s*\??\.addEventListener\s*\(/g,
  )) {
    const [, name, call] = match;
    if (
      call
        ? /^get\w*(?:Window|Document)$/.test(name)
        : DOCUMENT_RECEIVER.test(name)
    ) {
      return true;
    }
  }
  return /\([^()]*\b(?:document|window|ownerDocument|defaultView)\b[^()]*\)\s*\??\.addEventListener\s*\(/.test(
    text,
  );
}

/**
 * Concerns Core owns in one shared module (`architecture:react-component-runtime`
 * INV16). `exempt` holds the files that implement the concern.
 */
export const SHARED_OWNERS = [
  {
    concern: 'A new ResizeObserver',
    owner: 'observeResize',
    path: 'packages/core/src/utils/sharedResizeObserver.ts',
    exempt: ['packages/core/src/utils/sharedResizeObserver.ts'],
    matches: text =>
      /\bnew\s+(?:[\w$]+\.)*ResizeObserver\s*\(|\.ResizeObserver\b/.test(text),
  },
  {
    concern: 'A new document or window listener',
    owner: 'subscribeInput',
    path: 'packages/core/src/utils/inputStream.ts',
    exempt: ['packages/core/src/utils/inputStream.ts'],
    matches: addsDocumentListener,
  },
  {
    concern: 'A module-level warn-once set',
    owner: 'useDevWarning',
    path: 'packages/core/src/hooks/useDevWarning.ts',
    alternative:
      '`warnOnce` from `packages/core/src/utils/devWarning.ts` outside render',
    exempt: ['packages/core/src/utils/devWarning.ts'],
    matches: text =>
      /^(?:export\s+)?(?:const|let)\s+[\w$]*(?:[wW]arn|[rR]eported|[lL]ogged)[\w$]*\s*(?::[^=]+)?=\s*new\s+(?:Weak)?Set\b/.test(
        text,
      ),
  },
  {
    concern: 'A local parent walk across shadow roots',
    owner: 'parentAcrossShadow',
    path: 'packages/core/src/utils/flatTree.ts',
    exempt: ['packages/core/src/utils/flatTree.ts'],
    matches: text =>
      /\.assignedSlot\b|\bas\s+ShadowRoot\s*\)\s*\.host\b|\binstanceof\s+ShadowRoot\b[^;]*\.host\b/.test(
        text,
      ),
  },
];

/** Item i. `addedLines` are the shipped source lines the change adds. */
export function sharedOwnerFindings(addedLines) {
  const findings = [];
  for (const {file, line, text} of addedLines) {
    if (!file.startsWith('packages/core/src/') || COMMENT.test(text)) continue;
    for (const owner of SHARED_OWNERS) {
      if (owner.exempt.includes(file) || !owner.matches(text)) continue;
      const alternative = owner.alternative ? `, or ${owner.alternative}` : '';
      findings.push({
        item: 'i',
        file,
        line,
        rule: `${owner.concern}; Core owns this concern`,
        fix: `Call \`${owner.owner}\` from \`${owner.path}\`${alternative}. Extend the owner when it lacks what you need (${RUNTIME} INV16).`,
      });
    }
  }
  return findings;
}

const EFFECT = /\b(?:React\.)?use(?:Isomorphic)?(?:Layout)?Effect\s*\(/;
const DOM_STATE =
  /\buseState\s*<[^>]*(?<![\w$.])(?:(?:HTML|SVG)\w*Element|Element|Node|NodeList|HTMLCollection)\b/;

/**
 * The body of the arrow function an Effect starts on line `index`, or null
 * when the Effect takes a named function or an expression body.
 */
export function effectBody(lines, index) {
  const source = lines.slice(index, index + 400).join('\n');
  const start = source.search(EFFECT);
  const arrow = source.indexOf('=>', start);
  if (start === -1 || arrow === -1) return null;
  const open = source.slice(arrow + 2).search(/\S/) + arrow + 2;
  if (source[open] !== '{' || source.slice(start, arrow).includes(',')) {
    return null;
  }
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') depth -= 1;
    if (depth === 0) return source.slice(open + 1, i);
  }
  return null;
}

function isNote(text) {
  const trimmed = text.trim();
  return (
    (COMMENT.test(trimmed) || trimmed.endsWith('*/')) &&
    !DIRECTIVE.test(trimmed)
  );
}

/** True when a comment sits just above the Effect or opens its body. */
export function hasEffectNote(lines, index, body) {
  for (let i = index - 1; i >= 0; i -= 1) {
    const text = lines[i].trim();
    if (text === '' || DIRECTIVE.test(text)) continue;
    if (isNote(text)) return true;
    break;
  }
  const first = (body ?? '').split('\n').find(text => text.trim() !== '');
  return first != null && isNote(first);
}

/** True when every statement of the body assigns a ref's `current`. */
export function copiesIntoRef(body) {
  const statements = body
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .split(/[;\n]/)
    .map(text => text.trim())
    .filter(Boolean);
  return (
    statements.length > 0 &&
    statements.every(text => /^[\w$.]+\.current\s*=(?!=)/.test(text))
  );
}

/** Item j. `readHead(file)` returns the file at the head, or null. */
export function effectFindings(addedLines, readHead) {
  const findings = [];
  const sources = new Map();
  const add = (file, line, rule, fix) =>
    findings.push({item: 'j', file, line, rule, fix});
  for (const {file, line, text} of addedLines) {
    if (!file.startsWith('packages/') || COMMENT.test(text)) continue;
    if (DOM_STATE.test(text)) {
      add(
        file,
        line,
        'A DOM node is kept in React state',
        `Own the node through a ref, or keep only the minimal key that render needs (${RUNTIME} INV1).`,
      );
    }
    if (!EFFECT.test(text)) continue;
    if (!sources.has(file)) sources.set(file, readHead(file)?.split('\n'));
    const lines = sources.get(file);
    if (lines == null) continue;
    const body = effectBody(lines, line - 1);
    if (body != null && copiesIntoRef(body)) {
      add(
        file,
        line,
        'The Effect only copies a value into a ref',
        `Read the value where it is used, or set the ref in the handler that changes it. An Effect syncs an external system (${RUNTIME} INV3).`,
      );
    } else if (!hasEffectNote(lines, line - 1, body)) {
      add(
        file,
        line,
        'The new Effect has no note that names the system it syncs',
        `Add a short comment above it that names the external system, or remove the Effect when no external system is involved (${RUNTIME} INV3).`,
      );
    }
  }
  return findings;
}

const NAMED_CATEGORIES = new Set(['fix', 'feat', 'perf']);

/**
 * Item k, Changesets. `coverage` is `checkCoverage` from
 * `scripts/release/changeset-coverage.mjs`; `changesets` are the Changesets
 * the change adds or edits, as `{file, text}`.
 */
export function changesetFindings({coverage, changesets}) {
  const findings = [];
  const shippedFiles = pkg =>
    [...(coverage.required.get(pkg)?.values() ?? [])]
      .flat()
      .map(entry => entry.replace(/ \(.*\)$/, ''));
  for (const pkg of [...coverage.required.keys()].sort()) {
    if (coverage.covered.has(pkg)) continue;
    findings.push({
      item: 'k',
      file: shippedFiles(pkg)[0],
      line: null,
      rule: `${pkg} ships a change, and no Changeset names it`,
      fix: `Run \`pnpm changeset:new --packages ${pkg}\`. Use \`[chore] Internal:\` when a consumer sees no change.`,
    });
  }
  for (const {file, text} of changesets) {
    const frontmatter = parseFrontmatter(text);
    if (!frontmatter) continue;
    const {category} = parseEntry(frontmatter.summary);
    if (!NAMED_CATEGORIES.has(category)) continue;
    const line =
      text.split('\n').findIndex(row => row.includes(`[${category}]`)) + 1 ||
      null;
    for (const [pkg, bump] of Object.entries(frontmatter.releases)) {
      if (bump === 'none') continue;
      if (shippedFiles(pkg).length > 0) continue;
      findings.push({
        item: 'k',
        file,
        line,
        rule: `\`[${category}]\` names ${pkg}, but nothing ${pkg} ships changes`,
        fix: 'Remove the Changeset. Tests, stories, fixtures, and tooling need none.',
      });
    }
  }
  return findings;
}

const GAP = /\b(implementation gap|gap until built)\b/i;
const CLAIM_ID = /\b(?:FR|NFR|AR|VR|INV|DEC|DD)\d+\b/g;

/**
 * Item k, records. `records` are the paths of the records the change edits or
 * that govern its files; `linkedRecords` are those that govern a changed
 * package file. A gap is a finding when its own text names a file the change
 * edits. An evidence gap ("gap until built") is also a finding when the change
 * edits the record, edits a package file the record governs, and mentions a
 * claim of the gap's row.
 */
export function recordGapFindings({
  records,
  changedFiles,
  addedByFile,
  linkedRecords,
  readHead,
}) {
  const findings = [];
  const changedNames = new Set(
    [...changedFiles]
      .filter(file => !records.includes(file))
      .map(file => path.posix.basename(file)),
  );
  for (const record of records) {
    const lines = readHead(record)?.split('\n') ?? [];
    const editedClaims = new Set(
      (addedByFile[record] ?? []).flatMap(text => text.match(CLAIM_ID) ?? []),
    );
    const builds = changedFiles.has(record) && linkedRecords.has(record);
    lines.forEach((text, index) => {
      const gap = GAP.exec(text);
      if (gap == null) return;
      const gapText = text.slice(gap.index).split('|')[0];
      const named = [...gapText.matchAll(/`([^`\s]+\.\w+)`/g)]
        .map(match => path.posix.basename(match[1]))
        .find(name => changedNames.has(name));
      const rowClaims =
        (/^\s*\|([^|]*)\|/.exec(text)?.[1] ?? '').match(CLAIM_ID) ?? [];
      const isEvidenceGap = /until built/i.test(gap[1]);
      const claim =
        builds && isEvidenceGap && rowClaims.find(id => editedClaims.has(id));
      if (!named && !claim) return;
      findings.push({
        item: 'k',
        file: record,
        line: index + 1,
        rule: named
          ? `A gap row names \`${named}\`, which this change edits`
          : `A gap row for ${claim} remains, and this change edits ${claim} and the code it governs`,
        fix: 'When this change builds the claim, replace the gap with the evidence. Otherwise keep it.',
      });
    });
  }
  return findings;
}

const MAX_CONFLICTS = 10;

/** Item l. `conflicts` lists the paths that do not merge cleanly. */
export function mergeFindings(conflicts, base) {
  const findings = conflicts.slice(0, MAX_CONFLICTS).map(file => ({
    item: 'l',
    file,
    line: null,
    rule: `Conflicts with ${base}`,
    fix: `Merge or rebase onto ${base}, and resolve the conflict.`,
  }));
  if (conflicts.length > MAX_CONFLICTS) {
    findings.push({
      item: 'l',
      file: null,
      line: null,
      rule: `${conflicts.length - MAX_CONFLICTS} more files conflict with ${base}`,
      fix: `Merge or rebase onto ${base}, and resolve each conflict.`,
    });
  }
  return findings;
}
