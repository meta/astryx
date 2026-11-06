// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file no-comment-provenance.js
 * @description Disallow provenance in source comments: knowledge record and
 * claim ids, pull request and issue references, date stamps, and blocks that
 * quote requirement text.
 *
 *   // Matches spec:AST-108 FR4 (#9428, 2026-10-31).
 *   // The panel MUST close when focus leaves it.
 *
 * A comment explains only what the code cannot show: a reason, a constraint,
 * an invariant, or a platform quirk. The record links the code, so
 * `pnpm specs:for <path>` finds it; a citation in a comment goes stale and
 * duplicates that link. The rule reads comments only, never strings.
 *
 * Every comment is checked, public JSDoc and file headers included, except
 * the lines a tool reads and code samples:
 *   - lint, TypeScript, and other tool directives;
 *   - `@pr-a11y` routing lines and `SYNC:` blocks, with their continuation
 *     lines;
 *   - the copyright line;
 *   - `@example` sections and fenced code.
 *
 * Options: `{baseline: {[repoRelativeFile]: string[]}, root: string}`. The
 * baseline lists, per file, each finding once per site that predates
 * enforcement: the cited id, reference, or date, or `spec quote` for a quote
 * block. That many stay allowed until removed; one more is reported. A
 * citation that is a file's only link to a record stays until a record links
 * the file; the message says how.
 *
 * Known limitations:
 *   - A claim id is matched only with a known claim prefix (`FR`, `INV`,
 *     `DEC`, and the others in `CLAIM_PREFIXES`), so a one-letter claim such
 *     as `G3` is not found.
 *   - A quote block is found only by `MUST` or `SHALL` in capitals, or as a
 *     long block that cites a record. A short paraphrase is not found.
 *   - A bare `#123` with 3, 6, or 8 digits can be a hex colour, so it is not
 *     found. `PR #123` and `issue #123` are found.
 */

import {baselineAllowance} from './rule-baseline.mjs';

/**
 * Where the repository config enforces the rule: shipped source in every
 * package. Tests, stories, and fixtures are out of scope.
 */
export const scope = {
  files: ['packages/*/src/**/*.{ts,tsx,mts,cts,js,jsx,mjs}'],
  ignores: [
    '**/*.test.*',
    '**/*.spec.*',
    '**/*.stories.*',
    '**/*.testing.*',
    '**/*.render-testing.*',
    '**/__tests__/**',
    '**/__fixtures__/**',
    '**/dist/**',
  ],
};

/** The baseline entry of a quote block. */
export const QUOTE_ENTRY = 'spec quote';

// The record kinds that `pnpm check:knowledge` reads, as `kind:name` ids.
const RECORD_KINDS = [
  'spec',
  'component',
  'module',
  'theme',
  'architecture',
  'family',
  'design',
  'plan',
];

// Claim prefixes that records define (`FR12`, `INV3`, `DEC-4`, ...). The id
// grammar is the one `check:knowledge` reads: prefix, optional hyphen, number,
// optional letter. One-letter prefixes are left out; they match too much.
const CLAIM_PREFIXES = [
  'FR',
  'NFR',
  'AR',
  'DEC',
  'INV',
  'ORD',
  'OQ',
  'DR',
  'IR',
  'DD',
  'DEP',
  'CLN',
];

const MONTH =
  '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';

/**
 * The text of each match is its baseline entry. The order matters: a later
 * finder does not see text that an earlier one matched, so
 * `spec:AST-108/FR4` is one finding, not three.
 */
const FINDERS = [
  {
    kind: 'reference',
    pattern:
      /https?:\/\/github\.com\/[\w.-]+\/[\w.-]+\/(?:pull|issues|discussions|commit)\/\w+/g,
  },
  {
    kind: 'record',
    pattern: new RegExp(
      `(?<![\\w-])(?:${RECORD_KINDS.join('|')}):[A-Za-z][\\w/.-]*[\\w]`,
      'g',
    ),
  },
  {kind: 'record', pattern: /(?<![\w/#-])AST-\d+[a-z]?(?:\/[A-Z]+-?\d+)?\b/g},
  {
    kind: 'claim',
    pattern: new RegExp(
      `(?<![\\w/#-])(?:${CLAIM_PREFIXES.join('|')})-?\\d+[a-z]?\\b`,
      'g',
    ),
  },
  {
    kind: 'reference',
    pattern: /\b(?:PR|[Pp]ull request|[Ii]ssue)s?\s+#?\d+\b/g,
  },
  {kind: 'reference', pattern: /(?<![\w&#/])#\d+\b/g, accept: isIssueNumber},
  {
    kind: 'date',
    pattern:
      /(?<![\w'"`-])(?:19|20)\d\d-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])(?![\w'"`:-])/g,
  },
  {
    kind: 'date',
    pattern: new RegExp(
      `\\b[Aa]s of (?:${MONTH}\\.?(?:\\s+\\d{1,2})?(?:,?\\s+\\d{4})?|\\d{4})\\b`,
      'g',
    ),
  },
];

/** `#1234` is an issue number; `#000` and `#333333` are hex colours. */
function isIssueNumber(text) {
  const digits = text.length - 1;
  return digits !== 3 && digits !== 6 && digits !== 8;
}

const QUOTE_KEYWORD = /\b(?:MUST|SHALL)\b/;

// A block longer than this that cites a record restates the record. The
// citation is reported, and the block is reported once more as a quote.
const QUOTE_BLOCK_LINES = 6;

const DIRECTIVE =
  /^(?:eslint\b|eslint-|global\s|globals\s|exported\s|@ts-|\/\s*<reference|prettier-ignore|istanbul\s|c8\s|v8\s|@vitest-environment|@jsx|#__PURE__|@__PURE__|@__NO_SIDE_EFFECTS__|webpack[A-Z]|@refresh|@license|@preserve)/;

// A line that a repository tool reads. Its continuation lines run to the next
// tag, a blank line, or the end of the comment.
const TOOL_TAG = /^(?:@pr-a11y|SYNC:)/;
const ANY_TAG = /^@\w/;
const COPYRIGHT = /^Copyright\b/;

/** The comment's lines, each with its text and its source index. */
function commentLines(comment) {
  const start = comment.range[0] + 2;
  if (comment.type === 'Line') {
    return [{text: comment.value, index: start}];
  }
  const lines = [];
  let index = start;
  for (const text of comment.value.split('\n')) {
    lines.push({text, index});
    index += text.length + 1;
  }
  return lines;
}

/** A line's text without comment decoration (` * `). */
function bareText(text) {
  return text.replace(/^\s*\*?\s?/, '').trim();
}

const rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow record ids, claim ids, pull request and issue references, date stamps, and quoted requirement text in source comments',
    },
    schema: [
      {
        type: 'object',
        properties: {
          baseline: {
            type: 'object',
            additionalProperties: {type: 'array', items: {type: 'string'}},
          },
          root: {type: 'string'},
        },
        additionalProperties: false,
      },
    ],
    messages: {
      record:
        '`{{entry}}` cites a knowledge record. A comment explains a reason, a ' +
        'constraint, or a quirk; `pnpm specs:for <path>` finds the record. If ' +
        'this is the file’s only link to the record, add the link to a record ' +
        'first (the "Source comments" rule in ' +
        'docs/architecture/knowledge-contracts.md says how), then remove the ' +
        'citation.',
      claim:
        '`{{entry}}` cites a record claim. A comment explains a reason, a ' +
        'constraint, or a quirk; `pnpm specs:for <path>` finds the record. If ' +
        'this is the file’s only link to the claim, add a claim-scoped ' +
        'reference to the file’s own record first (the "Source comments" rule ' +
        'in docs/architecture/knowledge-contracts.md says how), then remove ' +
        'the citation.',
      reference:
        '`{{entry}}` names a pull request or an issue. History stays in ' +
        'version control; the comment states only the reason that holds now.',
      date:
        '`{{entry}}` is a date stamp. A comment states what is true now; ' +
        'version control records when it changed.',
      quote:
        '`{{entry}}`: this comment quotes requirement text (MUST or SHALL). ' +
        'The record holds the requirement; the comment states only the reason ' +
        'the code needs, in short sentences.',
      longQuote:
        '`{{entry}}`: this long comment cites a record and restates it. The ' +
        'record holds the requirement; the comment states only the reason the ' +
        'code needs, in short sentences.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const isAllowed = baselineAllowance(context);

    function report(entry, messageId, index) {
      if (isAllowed(entry)) {
        return;
      }
      context.report({
        loc: {
          start: sourceCode.getLocFromIndex(index),
          end: sourceCode.getLocFromIndex(
            index + (entry === QUOTE_ENTRY ? 0 : entry.length),
          ),
        },
        messageId,
        data: {entry},
      });
    }

    /**
     * Lines a reader sees as prose: tool lines and code samples removed.
     * `state` carries over the comments of one block, so a `// SYNC:` line
     * keeps its continuation lines.
     */
    function proseLines(comment, state) {
      const lines = [];
      for (const line of commentLines(comment)) {
        const text = bareText(line.text);
        if (text.startsWith('```')) {
          state.inFence = !state.inFence;
          continue;
        }
        if (state.inFence) {
          continue;
        }
        if (text === '' || ANY_TAG.test(text)) {
          state.inToolTag = false;
          state.inExample = false;
        }
        if (TOOL_TAG.test(text)) {
          state.inToolTag = true;
        } else if (text.startsWith('@example')) {
          state.inExample = true;
        }
        if (state.inToolTag || state.inExample || COPYRIGHT.test(text)) {
          continue;
        }
        lines.push(line);
      }
      return lines;
    }

    /** Reports the line's findings; returns whether it cites a record. */
    function checkLine(line) {
      let citesRecord = false;
      const masked = [];
      const isMasked = (start, end) =>
        masked.some(([from, to]) => start < to && end > from);
      for (const finder of FINDERS) {
        for (const match of line.text.matchAll(finder.pattern)) {
          const start = match.index;
          const end = start + match[0].length;
          if (isMasked(start, end) || finder.accept?.(match[0]) === false) {
            continue;
          }
          masked.push([start, end]);
          citesRecord ||= finder.kind === 'record' || finder.kind === 'claim';
          report(match[0], finder.kind, line.index + start);
        }
      }
      return citesRecord;
    }

    function checkBlock(block) {
      let quoteIndex = null;
      let quoteMessage = 'quote';
      let firstIndex = null;
      let lineCount = 0;
      let citesRecord = false;
      const state = {inToolTag: false, inExample: false, inFence: false};
      for (const comment of block) {
        if (DIRECTIVE.test(comment.value.trim())) {
          continue;
        }
        for (const line of proseLines(comment, state)) {
          if (bareText(line.text) === '') {
            continue;
          }
          firstIndex ??= line.index + line.text.search(/\S/);
          lineCount += 1;
          citesRecord = checkLine(line) || citesRecord;
          if (quoteIndex == null && QUOTE_KEYWORD.test(line.text)) {
            quoteIndex = line.index + line.text.search(QUOTE_KEYWORD);
          }
        }
      }
      if (quoteIndex == null && citesRecord && lineCount > QUOTE_BLOCK_LINES) {
        quoteIndex = firstIndex;
        quoteMessage = 'longQuote';
      }
      if (quoteIndex != null) {
        report(QUOTE_ENTRY, quoteMessage, quoteIndex);
      }
    }

    /**
     * Adjacent line comments that start in one column are one block, so a
     * quote over several lines is one finding.
     */
    function blocks(comments) {
      const result = [];
      for (const comment of comments) {
        const block = result[result.length - 1];
        const previous = block?.[block.length - 1];
        if (
          previous?.type === 'Line' &&
          comment.type === 'Line' &&
          comment.loc.start.line === previous.loc.end.line + 1 &&
          comment.loc.start.column === previous.loc.start.column
        ) {
          block.push(comment);
        } else {
          result.push([comment]);
        }
      }
      return result;
    }

    return {
      Program() {
        for (const block of blocks(sourceCode.getAllComments())) {
          checkBlock(block);
        }
      },
    };
  },
};

export default rule;
