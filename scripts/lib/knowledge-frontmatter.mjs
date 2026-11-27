// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file knowledge-frontmatter.mjs
 * @input A knowledge record's text
 * @output `parseKnowledgeFrontmatter`: the record's front matter as a Map of
 *   field name to value (a string, a number, null, or an array for a list),
 *   plus any problems found
 * @position The one front-matter reader for knowledge records. Used by
 *   `check-knowledge.mjs` (and through it by `specs:for`) and by the ESLint
 *   plugin, which must not load the whole checker.
 */

function parseScalar(raw) {
  const value = raw.trim();
  if (value === 'null' || value === '~') return null;
  if (/^\[.*\]$/.test(value)) {
    const inner = value.slice(1, -1).trim();
    return inner
      ? inner
          .split(',')
          .map(item => item.trim())
          .filter(Boolean)
          .map(item => item.replace(/^['"]|['"]$/g, ''))
      : [];
  }
  if (/^[0-9]+$/.test(value)) return Number(value);
  return value.replace(/^['"]|['"]$/g, '');
}

/**
 * Reads the front matter at the start of `content`. `hasFrontmatter` is false
 * when the text has no front matter block. A list field may be written inline
 * (`[a, b]`), as a bracketed block over several lines, or as `- item` lines.
 */
export function parseKnowledgeFrontmatter(content, filePath = '<document>') {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    return {hasFrontmatter: false, frontmatter: new Map(), problems: []};
  }

  const frontmatter = new Map();
  const problems = [];
  const lines = match[1].split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (
      /^\s/.test(line) ||
      line.trim() === '' ||
      line.trimStart().startsWith('#')
    )
      continue;
    const field = line.match(/^([a-z][a-z0-9_]*):\s*(.*)$/);
    if (!field) continue;
    let raw = field[2].trim();
    if (raw === '') {
      const block = [];
      while (index + 1 < lines.length && /^\s/.test(lines[index + 1])) {
        block.push(lines[index + 1].trim());
        index += 1;
      }
      if (block.length === 1 && /^\[.*\]$/.test(block[0])) {
        raw = block[0];
      } else if (block[0] === '[' && block.at(-1) === ']') {
        raw = `[${block.slice(1, -1).join('')}]`;
      } else if (block.every(item => item.startsWith('- '))) {
        raw = `[${block.map(item => item.slice(2)).join(',')}]`;
      }
    }
    if (frontmatter.has(field[1])) {
      problems.push(`${filePath}: duplicate frontmatter field ${field[1]}.`);
      continue;
    }
    frontmatter.set(field[1], parseScalar(raw));
  }
  return {hasFrontmatter: true, frontmatter, problems};
}
