// Copyright (c) Meta Platforms, Inc. and affiliates.

'use strict';
/* global module */

// This helper is loaded by privileged workflow code from the trusted base.
// Keep it dependency-free CommonJS and deterministic over the supplied bytes.

const DESIGN_DECISIONS_MARKER = '<!-- design-decisions:v1 -->';
const DESIGN_DECISIONS_COLUMNS = [
  'ID',
  'Decision',
  'Intent or reason',
  'Applies to',
  'Allowed variation',
];
const DESIGN_DECISION_ID = /^DD[1-9][0-9]*$/;

function splitMarkdownRow(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null;

  const cells = [];
  let cell = '';
  let escaped = false;
  for (const character of trimmed.slice(1, -1)) {
    if (escaped) {
      cell += character;
      escaped = false;
    } else if (character === '\\') {
      cell += character;
      escaped = true;
    } else if (character === '|') {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += character;
    }
  }
  cells.push(cell.trim());
  return cells;
}

function parseFrontmatterIdentity(content, filePath) {
  const problems = [];
  const values = new Map();
  for (const fieldName of ['authority', 'kind']) {
    const pattern = new RegExp(
      `^${fieldName}:\\s*['"]?([a-z-]+)['"]?\\s*$`,
      'gm',
    );
    const matches = [...content.matchAll(pattern)];
    if (matches.length === 0) {
      problems.push(`${filePath}: missing frontmatter field ${fieldName}.`);
      continue;
    }
    if (matches.length > 1) {
      problems.push(`${filePath}: duplicate frontmatter field ${fieldName}.`);
      continue;
    }
    values.set(fieldName, matches[0][1]);
  }

  return {
    authority: values.get('authority') ?? null,
    kind: values.get('kind') ?? null,
    problems,
  };
}

function parseDesignDecisionsBlock(content, filePath = '<knowledge record>') {
  const problems = [];
  const headingMatches = [
    ...content.matchAll(/^### Design decisions[ \t]*\r?$/gm),
  ];
  const markerMatches = [...content.matchAll(/<!-- design-decisions:v1 -->/g)];

  if (headingMatches.length === 0) {
    if (markerMatches.length > 0) {
      problems.push(
        `${filePath}: ${DESIGN_DECISIONS_MARKER} must be inside a unique "Design decisions" subsection.`,
      );
    }
    return {
      present: false,
      valid: problems.length === 0,
      rows: [],
      problems,
      range: null,
      raw: null,
      outside: content,
    };
  }

  if (headingMatches.length > 1) {
    problems.push(`${filePath}: duplicate "Design decisions" subsections.`);
  }
  if (markerMatches.length !== 1) {
    problems.push(
      `${filePath}: "Design decisions" requires exactly one ${DESIGN_DECISIONS_MARKER} marker.`,
    );
  }

  const heading = headingMatches[0];
  const precedingSections = [
    ...content.slice(0, heading.index).matchAll(/^##(?!#)\s+(.+?)\s*$/gm),
  ];
  if (precedingSections.at(-1)?.[1] !== 'Design relationships') {
    problems.push(
      `${filePath}: "Design decisions" must be a level-three subsection of "Design relationships".`,
    );
  }

  const afterHeading = heading.index + heading[0].length;
  const followingHeading = /^#{1,3}(?!#)\s+.+?\s*$/gm;
  followingHeading.lastIndex = afterHeading;
  const next = followingHeading.exec(content);
  const end = next?.index ?? content.length;
  const range = {start: heading.index, end};
  const raw = content.slice(range.start, range.end);
  const outside = content.slice(0, range.start) + content.slice(range.end);
  const rows = [];

  const subsectionLines = content.slice(afterHeading, end).split(/\r?\n/);
  let lineIndex = 0;
  while (
    lineIndex < subsectionLines.length &&
    subsectionLines[lineIndex].trim() === ''
  ) {
    lineIndex += 1;
  }

  if (subsectionLines[lineIndex]?.trim() !== DESIGN_DECISIONS_MARKER) {
    problems.push(
      `${filePath}: "Design decisions" must contain only its marker, exact table, contiguous rows, and whitespace.`,
    );
  } else {
    lineIndex += 1;
    while (
      lineIndex < subsectionLines.length &&
      subsectionLines[lineIndex].trim() === ''
    ) {
      lineIndex += 1;
    }

    const header = splitMarkdownRow(subsectionLines[lineIndex] ?? '');
    lineIndex += 1;
    const separator = splitMarkdownRow(subsectionLines[lineIndex] ?? '');
    lineIndex += 1;
    if (
      header === null ||
      header.length !== DESIGN_DECISIONS_COLUMNS.length ||
      !header.every((cell, index) => cell === DESIGN_DECISIONS_COLUMNS[index])
    ) {
      problems.push(
        `${filePath}: ${DESIGN_DECISIONS_MARKER} table columns must be exactly ${DESIGN_DECISIONS_COLUMNS.join(', ')}.`,
      );
    }
    if (
      separator === null ||
      separator.length !== DESIGN_DECISIONS_COLUMNS.length ||
      !separator.every(cell => /^:?-{3,}:?$/.test(cell))
    ) {
      problems.push(
        `${filePath}: ${DESIGN_DECISIONS_MARKER} must include a valid Markdown separator row.`,
      );
    }

    const seenIds = new Set();
    while (lineIndex < subsectionLines.length) {
      const line = subsectionLines[lineIndex];
      if (line.trim() === '') break;
      const cells = splitMarkdownRow(line);
      if (cells === null) break;
      if (cells.length !== DESIGN_DECISIONS_COLUMNS.length) {
        problems.push(
          `${filePath}: every design-decision row must have exactly ${DESIGN_DECISIONS_COLUMNS.length} cells.`,
        );
      } else if (cells.some(cell => cell.length === 0)) {
        problems.push(
          `${filePath}: every authored design-decision row must have non-empty cells.`,
        );
      } else {
        const id = cells[0];
        if (!DESIGN_DECISION_ID.test(id)) {
          problems.push(
            `${filePath}: design-decision id ${JSON.stringify(id)} must match DD1, DD2, and so on.`,
          );
        } else if (seenIds.has(id)) {
          problems.push(`${filePath}: duplicate design-decision id ${id}.`);
        }
        seenIds.add(id);
        rows.push({
          id,
          decision: cells[1],
          intentOrReason: cells[2],
          appliesTo: cells[3],
          allowedVariation: cells[4],
        });
      }
      lineIndex += 1;
    }

    while (
      lineIndex < subsectionLines.length &&
      subsectionLines[lineIndex].trim() === ''
    ) {
      lineIndex += 1;
    }
    if (lineIndex !== subsectionLines.length) {
      problems.push(
        `${filePath}: "Design decisions" must contain only its marker, exact table, contiguous rows, and whitespace.`,
      );
    }
  }

  return {
    present: true,
    valid: problems.length === 0,
    rows,
    problems,
    range,
    raw,
    outside,
  };
}

function validateDesignDecisionsBlock(
  parsed,
  {allowHeaderOnly = false, filePath = '<knowledge record>'} = {},
) {
  const problems = [...parsed.problems];
  if (parsed.present && parsed.rows.length === 0 && !allowHeaderOnly) {
    problems.push(
      `${filePath}: an authored "Design decisions" subsection requires at least one decision row.`,
    );
  }
  return problems;
}

function classifyDesignDecisionChange({
  basePath,
  headPath,
  baseContent,
  headContent,
}) {
  const samePath =
    typeof basePath === 'string' &&
    typeof headPath === 'string' &&
    basePath === headPath;
  const baseBlock =
    typeof baseContent === 'string'
      ? parseDesignDecisionsBlock(baseContent, basePath || '<base>')
      : {
          present: false,
          valid: true,
          raw: null,
          outside: baseContent,
          problems: [],
        };
  const headBlock =
    typeof headContent === 'string'
      ? parseDesignDecisionsBlock(headContent, headPath || '<head>')
      : {
          present: false,
          valid: true,
          raw: null,
          outside: headContent,
          problems: [],
        };
  const baseIdentity =
    typeof baseContent === 'string'
      ? parseFrontmatterIdentity(baseContent, basePath || '<base>')
      : {authority: null, kind: null, problems: []};
  const headIdentity =
    typeof headContent === 'string'
      ? parseFrontmatterIdentity(headContent, headPath || '<head>')
      : {authority: null, kind: null, problems: []};
  const problems = [
    ...validateDesignDecisionsBlock(baseBlock, {
      filePath: basePath || '<base>',
    }),
    ...validateDesignDecisionsBlock(headBlock, {
      filePath: headPath || '<head>',
    }),
    ...baseIdentity.problems,
    ...headIdentity.problems,
  ];
  const blockChanged = baseBlock.raw !== headBlock.raw;

  if (!samePath) {
    return {
      classification: 'mixed',
      blockChanged,
      problems: [...problems, 'Knowledge-record renames fail closed.'],
    };
  }
  if (problems.length > 0) {
    return {classification: 'mixed', blockChanged, problems};
  }
  if (!blockChanged) {
    return {classification: 'no-dd-change', blockChanged: false, problems: []};
  }

  const sameComponentKind =
    baseIdentity.kind === headIdentity.kind &&
    (baseIdentity.kind === 'component' || baseIdentity.kind === 'module');
  const currentOnBothSides =
    baseIdentity.authority === 'current' &&
    headIdentity.authority === 'current';
  const outsideUnchanged = baseBlock.outside === headBlock.outside;
  if (sameComponentKind && currentOnBothSides && outsideUnchanged) {
    return {classification: 'dd-only', blockChanged: true, problems: []};
  }

  return {classification: 'mixed', blockChanged: true, problems: []};
}

module.exports = {
  DESIGN_DECISIONS_COLUMNS,
  DESIGN_DECISIONS_MARKER,
  classifyDesignDecisionChange,
  parseDesignDecisionsBlock,
  validateDesignDecisionsBlock,
};
