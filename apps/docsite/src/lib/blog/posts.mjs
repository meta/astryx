// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file posts.mjs
 *
 * Build-time blog post discovery, frontmatter parsing, and validation.
 *
 * This module is the single source of truth for how blog posts are read and
 * validated. It is consumed both by the docsite data generator
 * (scripts/generate-data.mjs) and by the test suite (src/__tests__/blog.test.ts),
 * so the same rules apply at build time and in CI.
 *
 * Authoring model (see issue #2896): a blog post is a single Markdown file with
 * YAML frontmatter under src/content/blog/posts/<slug>.md. No bespoke wiring is
 * required — files are discovered automatically and sorted latest-first.
 *
 * Why a hand-written frontmatter parser instead of a YAML dependency: the
 * frontmatter schema is small and fixed (scalars, string sequences, and a
 * sequence of {title, href} maps for relatedDocs). Keeping the parser local
 * avoids adding a dependency to the lockfile of a public repo for a build-only
 * concern, and it is fully covered by tests.
 *
 * @input  src/content/blog/posts/<slug>.md files with YAML frontmatter
 * @output Array of validated post objects ({ ...frontmatter, slug, body, readingTimeMinutes })
 * @position Imported by scripts/generate-data.mjs and src/__tests__/blog.test.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * The small, stable set of editorial post types used for primary filtering.
 * Keep this in sync with the proposal in issue #2896.
 */
export const POST_TYPES = [
  'update',
  'guide',
  'design',
  'story',
  'perspective',
  'engineering',
];

/** Maximum number of tags allowed per post (keeps the index calm and scannable). */
export const MAX_TAGS = 4;

// ── Frontmatter parsing ────────────────────────────────────────────────

/** Strip one layer of matching surrounding quotes and unescape common sequences. */
function unquote(value) {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      const inner = trimmed.slice(1, -1);
      if (first === '"') {
        return inner
          .replace(/\\"/g, '"')
          .replace(/\\n/g, '\n')
          .replace(/\\\\/g, '\\');
      }
      return inner;
    }
  }
  return trimmed;
}

/** Coerce an unquoted scalar into boolean/null where appropriate, else string. */
function coerceScalar(raw) {
  const trimmed = raw.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null' || trimmed === '~' || trimmed === '') return null;
  return unquote(trimmed);
}

/** Parse an inline flow sequence: ["a", "b"] or [a, b]. */
function parseInlineSequence(raw) {
  const inner = raw.trim().slice(1, -1).trim();
  if (inner === '') return [];
  // Split on commas not inside quotes.
  const items = [];
  let buf = '';
  let quote = null;
  for (const ch of inner) {
    if (quote) {
      if (ch === quote) quote = null;
      buf += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      buf += ch;
    } else if (ch === ',') {
      items.push(buf);
      buf = '';
    } else {
      buf += ch;
    }
  }
  if (buf.trim() !== '') items.push(buf);
  return items.map(coerceScalar);
}

/** Indentation width (number of leading spaces) of a line. */
function indentOf(line) {
  const match = line.match(/^( *)/);
  return match ? match[1].length : 0;
}

/**
 * Parse the limited subset of YAML used in blog frontmatter.
 *
 * Supported shapes:
 *   key: scalar                 → string | boolean | null
 *   key: ["a", "b"]             → string[]
 *   key:\n  - "a"\n  - "b"      → string[]
 *   key:\n  - title: x\n    href: y   → Array<Record<string,string>>
 *
 * Throws on structurally malformed input (e.g. a list item under a scalar).
 *
 * @param {string} text
 * @returns {Record<string, unknown>}
 */
export function parseYamlFrontmatter(text) {
  const rawLines = text.split('\n');
  // Drop comment-only and blank lines while preserving structure for sequences.
  const lines = rawLines.filter(l => {
    const t = l.trim();
    return t !== '' && !t.startsWith('#');
  });

  const result = {};
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (indentOf(line) !== 0) {
      throw new Error(`Unexpected indentation at frontmatter line: "${line}"`);
    }
    const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!keyMatch) {
      throw new Error(`Malformed frontmatter line: "${line}"`);
    }
    const key = keyMatch[1];
    const rest = keyMatch[2];
    i += 1;

    if (rest.trim() !== '') {
      // Inline value on the same line.
      if (rest.trim().startsWith('[')) {
        result[key] = parseInlineSequence(rest);
      } else {
        result[key] = coerceScalar(rest);
      }
      continue;
    }

    // Block value: collect more-indented following lines.
    const block = [];
    while (i < lines.length && indentOf(lines[i]) > 0) {
      block.push(lines[i]);
      i += 1;
    }

    if (block.length === 0) {
      result[key] = null;
      continue;
    }

    // Block sequence (items begin with "- ").
    const itemIndent = indentOf(block[0]);
    const seq = [];
    let j = 0;
    while (j < block.length) {
      const bLine = block[j];
      const trimmed = bLine.trim();
      if (!trimmed.startsWith('- ')) {
        throw new Error(
          `Expected a "- " sequence item under "${key}", got: "${bLine}"`,
        );
      }
      const afterDash = trimmed.slice(2);
      const mapField = afterDash.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
      if (mapField && mapField[2].trim() !== '') {
        // Sequence of maps: first field on the dash line, more fields below.
        const obj = {};
        obj[mapField[1]] = coerceScalar(mapField[2]);
        j += 1;
        while (
          j < block.length &&
          !block[j].trim().startsWith('- ') &&
          indentOf(block[j]) > itemIndent
        ) {
          const fld = block[j].trim().match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
          if (!fld) {
            throw new Error(
              `Malformed map field under "${key}": "${block[j]}"`,
            );
          }
          obj[fld[1]] = coerceScalar(fld[2]);
          j += 1;
        }
        seq.push(obj);
      } else {
        // Sequence of scalars.
        seq.push(coerceScalar(afterDash));
        j += 1;
      }
    }
    result[key] = seq;
  }

  return result;
}

/**
 * Split a raw file into { data, body }. Frontmatter is delimited by leading
 * "---" lines. A file without frontmatter yields empty data and full body.
 *
 * @param {string} raw
 * @returns {{data: Record<string, unknown>, body: string}}
 */
export function parseFrontmatter(raw) {
  const normalized = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return {data: {}, body: normalized.trim()};
  }
  return {data: parseYamlFrontmatter(match[1]), body: match[2].trim()};
}

// ── Validation ─────────────────────────────────────────────────────────

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const d = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

/**
 * Validate a parsed post's frontmatter against the v1 schema. Throws an Error
 * with a clear, slug-prefixed message on the first problem found.
 *
 * Returns a normalized data object (defaults applied: draft=false, arrays kept).
 */
export function validatePostFrontmatter(slug, data) {
  const err = msg => {
    throw new Error(`Blog post "${slug}": ${msg}`);
  };

  const requireString = field => {
    if (typeof data[field] !== 'string' || data[field].trim() === '') {
      err(`missing required string field "${field}"`);
    }
  };

  requireString('title');
  requireString('description');
  requireString('date');
  requireString('type');

  if (!isValidDate(data.date)) {
    err(`"date" must be an ISO date (YYYY-MM-DD), got "${data.date}"`);
  }
  if (!POST_TYPES.includes(data.type)) {
    err(`"type" must be one of ${POST_TYPES.join(', ')}; got "${data.type}"`);
  }

  if (!Array.isArray(data.authors) || data.authors.length === 0) {
    err('"authors" must be a non-empty list of author handles');
  }
  for (const a of data.authors) {
    if (typeof a !== 'string' || a.trim() === '') {
      err('every entry in "authors" must be a non-empty string handle');
    }
  }

  if (!Array.isArray(data.tags) || data.tags.length === 0) {
    err('"tags" must be a non-empty list');
  }
  if (data.tags.length > MAX_TAGS) {
    err(`"tags" allows at most ${MAX_TAGS} entries; got ${data.tags.length}`);
  }
  for (const t of data.tags) {
    if (typeof t !== 'string' || t.trim() === '') {
      err('every entry in "tags" must be a non-empty string');
    }
  }

  if (data.coverImage != null && typeof data.coverImage !== 'string') {
    err('"coverImage" must be a string path when provided');
  }

  if (
    data.releasePackage != null &&
    (typeof data.releasePackage !== 'string' ||
      data.releasePackage.trim() === '')
  ) {
    err('"releasePackage" must be a non-empty string when provided');
  }
  if (data.coverImage != null) {
    if (typeof data.coverAlt !== 'string' || data.coverAlt.trim() === '') {
      err('"coverAlt" is required (non-empty) when "coverImage" is set');
    }
  }

  if (data.updatedAt != null && !isValidDate(data.updatedAt)) {
    err(
      `"updatedAt" must be an ISO date (YYYY-MM-DD), got "${data.updatedAt}"`,
    );
  }

  if (
    data.dek != null &&
    (typeof data.dek !== 'string' || data.dek.trim() === '')
  ) {
    err('"dek" must be a non-empty string when provided');
  }

  if (data.draft != null && typeof data.draft !== 'boolean') {
    err('"draft" must be a boolean when provided');
  }

  if (data.relatedDocs != null) {
    if (!Array.isArray(data.relatedDocs)) {
      err('"relatedDocs" must be a list when provided');
    }
    for (const doc of data.relatedDocs) {
      if (
        !doc ||
        typeof doc.title !== 'string' ||
        doc.title.trim() === '' ||
        typeof doc.href !== 'string' ||
        doc.href.trim() === ''
      ) {
        err('every "relatedDocs" entry needs non-empty "title" and "href"');
      }
    }
  }

  return {
    title: data.title,
    description: data.description,
    dek: data.dek ?? null,
    date: data.date,
    type: data.type,
    authors: data.authors,
    tags: data.tags,
    updatedAt: data.updatedAt ?? null,
    draft: data.draft === true,
    coverImage: data.coverImage ?? null,
    coverAlt: data.coverAlt ?? null,
    releasePackage: data.releasePackage ?? null,
    relatedDocs: data.relatedDocs ?? null,
  };
}

// ── Reading time ───────────────────────────────────────────────────────

/** Estimate reading time in minutes from a markdown body (~200 wpm, min 1). */
export function estimateReadingTime(body) {
  const words = body
    .replace(/```[\s\S]*?```/g, ' ') // drop code fences from the count
    .replace(/[#>*_`~\-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

// ── Discovery ──────────────────────────────────────────────────────────

/** Slug from a post filename, e.g. "my-post.md" → "my-post". */
export function slugFromFilename(filename) {
  return filename.replace(/\.mdx?$/, '');
}

/**
 * Discover, parse, and validate all blog posts in a directory.
 *
 * @param {string} postsDir Absolute path to the posts directory.
 * @param {{includeDrafts?: boolean}} [options]
 * @returns Array of validated posts, sorted by date descending (latest first).
 */
export function discoverPosts(postsDir, options = {}) {
  const includeDrafts = options.includeDrafts ?? false;
  if (!fs.existsSync(postsDir)) return [];

  const files = fs
    .readdirSync(postsDir)
    .filter(f => /\.mdx?$/.test(f))
    .sort();

  const posts = [];
  const seenSlugs = new Set();

  for (const file of files) {
    const slug = slugFromFilename(file);
    if (seenSlugs.has(slug)) {
      throw new Error(`Duplicate blog post slug "${slug}" (file ${file})`);
    }
    seenSlugs.add(slug);

    const raw = fs.readFileSync(path.join(postsDir, file), 'utf-8');
    const {data, body} = parseFrontmatter(raw);
    const meta = validatePostFrontmatter(slug, data);

    if (body.trim() === '') {
      throw new Error(`Blog post "${slug}": body is empty`);
    }

    posts.push({
      slug,
      ...meta,
      body,
      readingTimeMinutes: estimateReadingTime(body),
    });
  }

  const visible = includeDrafts ? posts : posts.filter(p => !p.draft);

  visible.sort((a, b) => {
    if (a.date === b.date) return a.slug.localeCompare(b.slug);
    return a.date < b.date ? 1 : -1; // descending
  });

  return visible;
}

/**
 * A post's example assets (spec:AST-033 FR22): the modules in the directory
 * named after the post, beside its Markdown file (`posts/<slug>/TarotCard.tsx`
 * next to `posts/<slug>.md`). A `tsx live` block in that post imports one as
 * `./TarotCard`. They are docs-only demo material: no package exports them and
 * no catalog lists them, and only their own post's examples can resolve them.
 *
 * @param {string} postsDir Absolute path to the directory holding the post.
 * @param {string} slug The post's slug.
 * @returns {{specifier: string, file: string}[]} Sorted by specifier; `file`
 *   is the absolute path of the module.
 */
export function collectExampleAssets(postsDir, slug) {
  const dir = path.join(postsDir, slug);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
  return fs
    .readdirSync(dir)
    .filter(f => /\.(tsx?|jsx?)$/.test(f) && !/\.(test|spec)\./.test(f))
    .sort()
    .map(f => ({
      specifier: `./${f.replace(/\.(tsx?|jsx?)$/, '')}`,
      file: path.join(dir, f),
    }));
}

/** Distinct post types present in the given posts (ordered by POST_TYPES). */
export function collectTypes(posts) {
  const present = new Set(posts.map(p => p.type));
  return POST_TYPES.filter(t => present.has(t));
}

/** Distinct tags present in the given posts (alphabetical). */
export function collectTags(posts) {
  const tags = new Set();
  for (const p of posts) for (const t of p.tags) tags.add(t);
  return [...tags].sort((a, b) => a.localeCompare(b));
}
