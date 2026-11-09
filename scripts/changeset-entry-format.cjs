// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Shared parser/formatter for XDS changeset bodies.
 *
 * XDS encodes two extra signals in the changeset *body* (not frontmatter,
 * because @changesets/parse treats every frontmatter key as a package→bump
 * mapping and rejects anything else):
 *
 *   [category] one-line user-facing summary (#1234)
 *   @contributor1 @contributor2
 *   ...optional extra body (codemod notes, etc.)
 *
 * - category  -> editorial grouping for the changelog, decoupled from semver.
 * - @handle   -> contributor(s), captured at authoring time (correct human,
 *               not the release bot).
 *
 * This module is the single source of truth for that convention. It is used
 * by:
 *   - .changeset/changelog.cjs       (release-line rendering)
 *   - scripts/changeset-new.mjs      (the authoring wrapper)
 *   - scripts/check-changesets.mjs   (CI lint)
 *   - scripts/format-changelogs.mjs  (post-version formatter)
 *
 * NOTE: lives in scripts/ (not .changeset/) on purpose — @changesets/read
 * treats every *subdirectory* of .changeset/ as a legacy v1 changeset, so a
 * .changeset/lib/ dir breaks `changeset version`.
 */

// Canonical category set. Order here is the order sections render in the
// changelog. `label` is the changelog section heading.
const CATEGORIES = [
  {key: 'breaking', label: 'Breaking Changes'},
  {key: 'experimental', label: 'Experimental APIs'},
  {key: 'component', label: 'New Components'},
  {key: 'feat', label: 'New Features'},
  {key: 'fix', label: 'Fixes'},
  {key: 'perf', label: 'Performance'},
  {key: 'docs', label: 'Documentation'},
  {key: 'chore', label: 'Other Changes'},
];

const CATEGORY_KEYS = CATEGORIES.map(c => c.key);

// Aliases people are likely to type.
const CATEGORY_ALIASES = {
  bug: 'fix',
  bugfix: 'fix',
  fixes: 'fix',
  feature: 'feat',
  features: 'feat',
  break: 'breaking',
  major: 'breaking',
  components: 'component',
  new: 'component',
  performance: 'perf',
  doc: 'docs',
  refactor: 'chore',
  internal: 'chore',
};

function normalizeCategory(raw) {
  if (!raw) return null;
  const k = String(raw).trim().toLowerCase();
  if (CATEGORY_KEYS.includes(k)) return k;
  if (CATEGORY_ALIASES[k]) return CATEGORY_ALIASES[k];
  return null;
}

function labelFor(key) {
  const c = CATEGORIES.find(x => x.key === key);
  return c ? c.label : 'Other Changes';
}

const CONTRIB_LINE = /^@[\w-]+(\s+@[\w-]+)*\s*$/;
const HANDLE = /@([\w-]+)/g;

/**
 * Parse a changeset summary body into structured parts.
 * Tolerant: missing category/contributors are reported, not thrown — the
 * checker decides severity.
 */
function parseEntry(summary) {
  const lines = String(summary || '')
    .replace(/\r\n/g, '\n')
    .split('\n');

  let category = null;
  let headline = '';
  const contributors = [];
  const extra = [];

  let consumedHeadline = false;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!consumedHeadline) {
      if (line.trim() === '') continue; // skip leading blanks
      // First non-empty line is the headline; may carry a [category] prefix.
      const m = line.match(/^\s*\[([^\]]+)\]\s*(.*)$/);
      if (m) {
        category = normalizeCategory(m[1]);
        headline = m[2].trim();
      } else {
        headline = line.trim();
      }
      consumedHeadline = true;
      continue;
    }

    // After the headline: a line that is only @handles is a contributor line.
    if (CONTRIB_LINE.test(line.trim()) && line.trim().startsWith('@')) {
      let mm;
      const re = new RegExp(HANDLE.source, 'g');
      while ((mm = re.exec(line)) !== null) {
        if (!contributors.includes(mm[1])) contributors.push(mm[1]);
      }
      continue;
    }
    extra.push(rawLine);
  }

  // Trim leading/trailing blank lines from extra.
  while (extra.length && extra[0].trim() === '') extra.shift();
  while (extra.length && extra[extra.length - 1].trim() === '') extra.pop();

  return {
    category,
    headline,
    contributors,
    extra: extra.join('\n'),
  };
}

/**
 * Render a single changelog bullet for a parsed entry. Used by getReleaseLine.
 * Keeps the [category] tag inline so the post-version formatter can regroup,
 * and appends contributor attribution.
 */
function renderReleaseLine(parsed) {
  const cat = parsed.category || 'chore';
  let line = `- [${cat}] ${parsed.headline}`;
  if (parsed.contributors.length) {
    line += ` — thanks ${parsed.contributors.map(c => `@${c}`).join(', ')}`;
  }
  if (parsed.extra) {
    const indented = parsed.extra
      .split('\n')
      .map(l => (l.trim() ? `  ${l}` : ''))
      .join('\n');
    line += `\n${indented}`;
  }
  return line;
}

module.exports = {
  CATEGORIES,
  CATEGORY_KEYS,
  normalizeCategory,
  labelFor,
  parseEntry,
  renderReleaseLine,
};
