// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Concrete findings in one change, each at a file and line.
 * @input A unified diff, a reader for the head tree, and the Changeset
 *   coverage result.
 * @output Findings for checklist items i to l: the item, the file and line,
 *   the rule, and the fix. Size advice for item h, which is never a finding.
 * @position Called by `scripts/pre-review.mjs`. SYNC: keep each rule in step
 *   with its item in `docs/contributing/pull-requests.md#pre-review-checklist`.
 */
import path from 'node:path';
import {createRequire} from 'node:module';
import {parseFrontmatter} from '../check-changesets.mjs';

const require = createRequire(import.meta.url);
const {parseEntry} = require('../changeset-entry-format.cjs');

export const SIZE_GUIDELINE = 2000;

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

/** Item h. Advice for a change over the size guideline, or null. */
export function sizeAdvice(authored) {
  if (authored <= SIZE_GUIDELINE) return null;
  return `Over ${SIZE_GUIDELINE.toLocaleString('en-US')} authored lines: consider splitting if a smaller change would review more easily.`;
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

const EFFECT =
  /\b(?:React\.)?use(?:Isomorphic)?(?:Layout|Insertion)?Effect\s*\(/;
const COMMITTED_REF_MODULE = 'packages/core/src/hooks/useCommittedRef.ts';
// Render-time ref writes that a current record allows, or names as an open gap
// until its owner decides, by file and ref name. `record` names the clause; a
// test checks that the clause names the site.
export const RENDER_WRITE_EXCEPTIONS = [
  {
    file: 'packages/core/src/Markdown/Markdown.tsx',
    refs: ['boundariesRef', 'prevBlocksRef', 'prevInlineNodesRef'],
    record: 'component:Markdown/DEC-7',
  },
  {
    file: 'packages/core/src/Table/plugins/sortable/useTableSortable.tsx',
    refs: ['configRef'],
    record: 'architecture:react-component-runtime/INV17',
  },
];

function isRenderWriteException(file, ref) {
  return RENDER_WRITE_EXCEPTIONS.some(
    exception => exception.file === file && exception.refs.includes(ref),
  );
}
const COMMITTED_REF_HOOKS = `\`useCommittedRef\` or \`useCommittedRefInto\` (\`${COMMITTED_REF_MODULE}\`)`;
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

function statementsOf(body) {
  return body
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .split(/[;\n]/)
    .map(text => text.trim())
    .filter(Boolean);
}

/** True when every statement of the body assigns a ref's `current`. */
export function copiesIntoRef(body) {
  const statements = statementsOf(body);
  return (
    statements.length > 0 &&
    statements.every(text => /^[\w$.]+\.current\s*=(?!=)/.test(text))
  );
}

/** True when every statement of the body sets state to a named value. */
export function copiesIntoState(body) {
  const statements = statementsOf(body);
  return (
    statements.length > 0 &&
    statements.every(text =>
      /^set[A-Z][\w$]*\s*\(\s*[\w$]+(?:\.[\w$]+)*\s*\)$/.test(text),
    )
  );
}

const REF = String.raw`(?<![\w$.])((?:[\w$]+\.)*[\w$]+)\.current\b`;
// `??=` and `||=` set an empty ref only, so they are lazy initialization.
const REF_WRITES = [
  new RegExp(
    String.raw`${REF}\s*(?:(?:[-+*/%&|^]|\*\*|<<|>>>?|&&)?=(?![=>])|\+\+|--)`,
    'g',
  ),
  new RegExp(String.raw`(?:\+\+|--)\s*${REF}`, 'g'),
];
const CONTROL = /^(?:if|else|for|while|do|switch|try|catch|finally|with)\b/;
const RUNS_IN_RENDER =
  /\buse(?:Memo|State|Reducer)\s*(?:<[^>]*>)?\s*\((?:[^()]*,)?\s*(?:\([^()]*\)|[\w$]+)?\s*(?::[^=]+)?=>\s*$/;
// An expression-bodied `useMemo`, `useState` or `useReducer` callback that is
// still open at the end of the text.
const RENDER_EXPRESSION =
  /\buse(?:Memo|State|Reducer)\s*(?:<[^>]*>)?\s*\((?:[^()]*,)?\s*(?:\([^()]*\)|[\w$]+)?\s*(?::[^=]+)?=>(?:(?!=>|\bfunction\b)[\s\S])*$/;

function functionName(header) {
  return (
    /\bfunction\s*\*?\s*([\w$]+)/.exec(header)?.[1] ??
    /\b(?:const|let|var)\s+([\w$]+)\s*(?::[^=]+)?=/.exec(header)?.[1] ??
    null
  );
}

/** What a `{` opens, from the text between the last statement end and it. */
function blockKind(statement) {
  const header = statement.replace(/^[,\s]+/, '');
  if (RUNS_IN_RENDER.test(header)) return {kind: 'render'};
  const isFunction =
    /=>\s*$/.test(header) ||
    /\bfunction\b[\s\S]*\)\s*(?::[^{}]*)?$/.test(header) ||
    (/^(?:(?:async|get|set|static)\s+)*\*?[\w$]+\s*\([\s\S]*\)\s*(?::[^{]*)?$/.test(
      header,
    ) &&
      !CONTROL.test(header));
  if (!isFunction) return {kind: 'block', header};
  const name = functionName(header);
  return {
    kind:
      name != null && /^(?:[A-Z]|use[A-Z0-9])/.test(name)
        ? 'render'
        : 'callback',
  };
}

function hasOpenParenthesis(text) {
  return text.split('(').length > text.split(')').length;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True when `text` tests that `ref.current` is not set yet. */
function guardsLazyInit(text, ref) {
  const current = `${escapeRegExp(ref)}\\.current`;
  const empty = '(?:null|undefined)';
  return new RegExp(
    `\\bif\\s*\\(\\s*(?:!\\s*${current}|${current}\\s*===?\\s*${empty}|${empty}\\s*===?\\s*${current})\\s*\\)`,
  ).test(text);
}

/**
 * The `uses` (index to ref name) of `source` that run during render: directly
 * in the body of a component or a hook (a function named `Name` or `useName`),
 * or in an inline `useMemo`, `useState` or `useReducer` callback. A use in an
 * Effect, a handler or another nested function does not run during render.
 * With `lazyCounts`, lazy initialization (`if (ref.current == null) …`) does
 * not count either. The scan reads text. It recognizes strings, comments and
 * template literals, and no other syntax.
 */
function renderUses(source, uses, {lazyCounts}) {
  const found = [];
  const blocks = [];
  const modes = ['code'];
  let statementStart = 0;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];
    const mode = modes.at(-1);
    if (mode === 'line-comment') {
      if (char === '\n') modes.pop();
      continue;
    }
    if (mode === 'block-comment') {
      if (char === '*' && next === '/') {
        modes.pop();
        i += 1;
      }
      continue;
    }
    if (mode === "'" || mode === '"') {
      if (char === '\\') i += 1;
      else if (char === mode || char === '\n') modes.pop();
      continue;
    }
    if (mode === '`') {
      if (char === '\\') i += 1;
      else if (char === '`') modes.pop();
      else if (char === '$' && next === '{') {
        modes.push('code');
        blocks.push({kind: 'template', statementStart, inParentheses: true});
        i += 1;
        statementStart = i + 1;
      }
      continue;
    }
    if (char === '/' && next === '/') {
      modes.push('line-comment');
      i += 1;
    } else if (char === '/' && next === '*') {
      modes.push('block-comment');
      i += 1;
    } else if (char === "'" || char === '"' || char === '`') {
      modes.push(char);
    } else if (char === '{') {
      const header = source.slice(statementStart, i);
      blocks.push({
        ...blockKind(header.trim()),
        statementStart,
        inParentheses: hasOpenParenthesis(header),
      });
      statementStart = i + 1;
    } else if (char === '}') {
      const block = blocks.pop();
      if (block?.kind === 'template') modes.pop();
      statementStart = block?.inParentheses ? block.statementStart : i + 1;
    } else if (char === ';') {
      statementStart = i + 1;
    } else if (uses.has(i)) {
      const ref = uses.get(i);
      const prefix = source.slice(statementStart, i);
      const owner = blocks.findLast(
        block => block.kind === 'render' || block.kind === 'callback',
      );
      const guarded = blocks
        .slice(blocks.lastIndexOf(owner) + 1)
        .some(block => guardsLazyInit(block.header ?? '', ref));
      const inExpressionCallback =
        /=>|\bfunction\b/.test(prefix) && !RENDER_EXPRESSION.test(prefix);
      const lazy =
        lazyCounts &&
        (guarded ||
          guardsLazyInit(prefix, ref) ||
          new RegExp(
            `${escapeRegExp(ref)}\\.current\\s*(?:\\|\\||\\?\\?)\\s*\\(?\\s*$`,
          ).test(prefix));
      if (owner?.kind === 'render' && !inExpressionCallback && !lazy) {
        found.push({line: source.slice(0, i).split('\n').length, ref});
      }
    }
  }
  return found;
}

/**
 * The lines of `source` that write a ref's `current` during render: directly
 * in the body of a component or a hook (a function named `Name` or `useName`),
 * or in an inline `useMemo`, `useState` or `useReducer` callback. A write in an
 * Effect, a handler or another nested function, and lazy initialization
 * (`if (ref.current == null) ref.current = …`), are not render writes. The scan
 * reads text. It recognizes strings, comments and template literals, and no
 * other syntax.
 */
export function renderRefWrites(source) {
  const writes = new Map();
  for (const pattern of REF_WRITES) {
    for (const match of source.matchAll(pattern)) {
      writes.set(match.index, match[1]);
    }
  }
  return renderUses(source, writes, {lazyCounts: true});
}

const COMMITTED_REF_NAMES = [
  /\b(?:const|let|var)\s+([\w$]+)\s*(?::[^=]+)?=\s*useCommittedRef\s*[<(]/g,
  /\buseCommittedRefInto\s*(?:<[^>]*>)?\s*\(\s*([\w$]+)\s*,/g,
];

/**
 * The lines of `source` that read the `current` of a committed ref (one that
 * `useCommittedRef` returns or `useCommittedRefInto` writes) during render or
 * in an inline `useMemo`, `useState` or `useReducer` callback.
 */
export function renderCommittedRefReads(source) {
  const names = new Set();
  for (const pattern of COMMITTED_REF_NAMES) {
    for (const match of source.matchAll(pattern)) names.add(match[1]);
  }
  const reads = new Map();
  for (const name of names) {
    const read = new RegExp(
      String.raw`(?<![\w$.])${escapeRegExp(name)}\.current\b(?!\s*(?:(?:[-+*/%&|^]|\*\*|<<|>>>?|&&|\|\||\?\?)?=(?![=>])|\+\+|--))`,
      'g',
    );
    for (const match of source.matchAll(read)) reads.set(match.index, name);
  }
  return renderUses(source, reads, {lazyCounts: false});
}

/** Item j. `readHead(file)` returns the file at the head, or null. */
export function effectFindings(addedLines, readHead) {
  const findings = [];
  const sources = new Map();
  const renderUsesByFile = new Map();
  const add = (file, line, rule, fix) =>
    findings.push({item: 'j', file, line, rule, fix});
  const linesOf = file => {
    if (!sources.has(file)) sources.set(file, readHead(file));
    return sources.get(file)?.split('\n') ?? null;
  };
  const byLine = uses => new Map(uses.map(use => [use.line, use.ref]));
  const renderUsesOf = file => {
    if (!renderUsesByFile.has(file)) {
      const source = sources.get(file) ?? readHead(file);
      sources.set(file, source);
      renderUsesByFile.set(file, {
        writes: byLine(source == null ? [] : renderRefWrites(source)),
        reads: byLine(source == null ? [] : renderCommittedRefReads(source)),
      });
    }
    return renderUsesByFile.get(file);
  };
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
    if (/\.current\b/.test(text)) {
      const {writes, reads} = renderUsesOf(file);
      if (writes.has(line) && !isRenderWriteException(file, writes.get(line))) {
        add(
          file,
          line,
          `\`${writes.get(line)}.current\` is written during render`,
          `React can discard a render, and the ref then keeps a value that never committed. Write the ref in the handler that changes it, or keep the latest prop or callback with ${COMMITTED_REF_HOOKS}. Only lazy initialization (\`if (ref.current == null) ref.current = …\`) stays in render (${RUNTIME} INV17).`,
        );
      }
      if (reads.has(line)) {
        add(
          file,
          line,
          `\`${reads.get(line)}.current\` is read during render`,
          `A committed ref holds the last committed value, one render behind. Read the value itself during render and in \`useMemo\`; read the ref only in event and gesture callbacks (${RUNTIME} INV3).`,
        );
      }
    }
    if (!EFFECT.test(text)) continue;
    const lines = linesOf(file);
    if (lines == null) continue;
    const body = effectBody(lines, line - 1);
    const hasNote = hasEffectNote(lines, line - 1, body);
    if (body != null && copiesIntoRef(body)) {
      if (file !== COMMITTED_REF_MODULE) {
        add(
          file,
          line,
          'The Effect only copies a value into a ref',
          `Keep a latest prop or callback with ${COMMITTED_REF_HOOKS}, not a per-site Effect. Otherwise read the value where it is used (${RUNTIME} INV3).`,
        );
      }
    } else if (body != null && copiesIntoState(body)) {
      add(
        file,
        line,
        'The Effect only copies a value into state',
        `Derive the value during render, or set the state in the handler that changes it (${RUNTIME} INV1 and INV2).`,
      );
    } else if (!hasNote) {
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
