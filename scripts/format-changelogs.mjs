#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * Release-branch changelog formatter — `node scripts/format-changelogs.mjs`.
 *
 * The custom `pnpm version-packages` step uses the pinned Changesets libraries
 * to write raw entries under the version already declared at the cut. Those
 * entries have the form:
 *
 *   ## 0.0.16
 *
 *   ### Patch Changes
 *
 *   - [fix] XDSButton: spinner contrast (#2717) — thanks @cixzhang
 *   - [breaking] Stack element -> as (#2441) — thanks @ejhammond
 *
 * This rewrites the just-added version block of every package CHANGELOG into
 * the doc-site format the Release-Process wiki mandates:
 *
 *   # 0.0.16                       (h1, was ## )
 *
 *   #### Breaking Changes          (h4 category sections, canonical order)
 *   - Stack element -> as (#2441)
 *
 *   #### Experimental APIs
 *   - Rename an experimental callback (#2442)
 *
 *   #### Fixes
 *   - XDSButton: spinner contrast (#2717)
 *
 *   #### Contributors              (aggregated, de-duped, sorted)
 *
 *   Thanks to everyone who contributed to this release:
 *
 *   - @cixzhang
 *   - @ejhammond
 *
 *   ---                            (divider before the previous version)
 *
 * Idempotent: a block already in `# x.y.z` form with no `### Patch Changes`
 * subheading and no `- [cat]` bullets is left untouched. Run right after
 * `pnpm version-packages` (which calls it automatically).
 *
 * Flags:
 *   --check   exit 1 if any CHANGELOG would change (CI drift guard)
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

import {expandWorkspaceDirs} from './lib/workspace-globs.mjs';

const require = createRequire(import.meta.url);
const {
  CATEGORIES,
  labelFor,
  normalizeCategory,
} = require('./changeset-entry-format.cjs');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

function discoverChangelogs() {
  const files = [];
  for (const dir of expandWorkspaceDirs(ROOT)) {
    const cl = path.join(dir, 'CHANGELOG.md');
    if (fs.existsSync(cl)) files.push(cl);
  }
  return files;
}

// A bullet may span multiple lines (continuation lines are indented).
//
// A blank line ends the bullet only when what follows is not more of it. An
// entry whose body has several paragraphs renders as `- head`, prose, blank
// line, indented prose — so treating every blank line as a terminator dropped
// each paragraph after the first, silently, on its way into the changelog.
function splitBullets(body) {
  const lines = body.split('\n');
  const bullets = [];
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*-\s+/.test(line)) {
      if (cur) bullets.push(cur);
      cur = line;
    } else if (cur && line.trim() !== '') {
      cur += '\n' + line;
    } else if (cur && line.trim() === '') {
      if (continuesAfterBlank(lines, i)) {
        cur += '\n';
      } else {
        bullets.push(cur);
        cur = null;
      }
    }
  }
  if (cur) bullets.push(cur);
  return bullets;
}

// Does the blank line at `i` sit inside a bullet? Only if the next non-blank
// line is an indented continuation — an unindented line (the next bullet, a
// `####` section, a `---` divider) closes it.
function continuesAfterBlank(lines, i) {
  for (let j = i + 1; j < lines.length; j++) {
    const next = lines[j];
    if (next.trim() === '') continue;
    return /^ {2,}\S/.test(next);
  }
  return false;
}

// Reflow a bullet's continuation body into consistent line wrapping.
//
// Changeset authors wrap prose inconsistently — some write one long line, some
// hard-wrap mid-sentence at ~75 chars. Since the release notes are compiled
// verbatim from these entries, that inconsistency shows up in the published
// changelog. This collapses each soft-wrapped prose paragraph into a single
// line (Markdown reflows visually), indents continuation content two spaces so
// it stays inside the list item, and leaves structural content untouched:
// blank lines (paragraph breaks), fenced code blocks, and sub-bullets.
function reflowBulletBody(rest) {
  if (!rest) return '';
  const lines = rest.split('\n');
  const out = [];
  let para = [];
  let inFence = false;

  const flush = () => {
    if (para.length) {
      out.push('  ' + para.join(' '));
      para = [];
    }
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    const trimmed = line.trim();

    if (/^```/.test(trimmed)) {
      flush();
      out.push('  ' + trimmed);
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      // Preserve code verbatim, but keep it inside the list item.
      out.push('  ' + line.replace(/^ {0,2}/, ''));
      continue;
    }
    if (trimmed === '') {
      flush();
      out.push('');
      continue;
    }
    // Sub-bullets keep their own line; flush preceding prose first.
    if (/^[-*]\s+/.test(trimmed)) {
      flush();
      out.push('  ' + trimmed);
      continue;
    }
    para.push(trimmed);
  }
  flush();

  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n+$/, '');
}

// Parse one rendered bullet: "- [cat] headline — thanks @a, @b"
function parseBullet(bullet) {
  const firstNl = bullet.indexOf('\n');
  const head = firstNl === -1 ? bullet : bullet.slice(0, firstNl);
  const rest = firstNl === -1 ? '' : bullet.slice(firstNl + 1);

  let text = head.replace(/^\s*-\s+/, '');
  let category = 'chore';
  const cm = text.match(/^\[([^\]]+)\]\s*(.*)$/);
  if (cm) {
    category = normalizeCategory(cm[1]) || 'chore';
    text = cm[2];
  }
  const contributors = [];
  text = text
    .replace(/\s*[—-]+\s*thanks\s+(.+)$/i, (_, who) => {
      let mm;
      const re = /@([\w-]+)/g;
      while ((mm = re.exec(who)) !== null) contributors.push(mm[1]);
      return '';
    })
    .trim();

  return {category, text, contributors, extra: reflowBulletBody(rest)};
}

function formatVersionBlock(version, body) {
  const bullets = splitBullets(body)
    .map(parseBullet)
    .filter(b => b.text);
  const byCat = new Map();
  const contributors = new Set();
  for (const b of bullets) {
    b.contributors.forEach(c => contributors.add(c));
    if (!byCat.has(b.category)) byCat.set(b.category, []);
    byCat.get(b.category).push(b);
  }

  const out = [`# ${version}`, ''];
  for (const {key} of CATEGORIES) {
    const items = byCat.get(key);
    if (!items || !items.length) continue;
    out.push(`#### ${labelFor(key)}`, '');
    for (const it of items) {
      let line = `- ${it.text}`;
      if (it.extra) line += '\n' + it.extra;
      out.push(line);
    }
    out.push('');
  }

  if (contributors.size) {
    out.push(
      '#### Contributors',
      '',
      'Thanks to everyone who contributed to this release:',
      '',
    );
    for (const c of [...contributors].sort((a, b) => a.localeCompare(b)))
      out.push(`- @${c}`);
    out.push('');
  }
  return (
    out
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd() + '\n'
  );
}

// Returns { changed, contents }
function processFile(file) {
  const original = fs.readFileSync(file, 'utf8');
  const lines = original.split('\n');

  let i = 0;
  const titleLines = [];
  while (i < lines.length && !/^#{1,2}\s+\d+\.\d+\.\d+/.test(lines[i])) {
    titleLines.push(lines[i]);
    i++;
  }
  if (i >= lines.length) return {changed: false, contents: original};

  const headMatch = lines[i].match(/^(#{1,2})\s+(\d+\.\d+\.\d+.*)$/);
  if (!headMatch) return {changed: false, contents: original};
  const version = headMatch[2].trim();
  const startedAsH2 = headMatch[1] === '##';
  i++;

  const bodyLines = [];
  while (i < lines.length && !/^#{1,2}\s+\d+\.\d+\.\d+/.test(lines[i])) {
    bodyLines.push(lines[i]);
    i++;
  }
  const rawBody = bodyLines.join('\n');

  // Only transform raw (changesets-native) blocks.
  const looksRaw =
    startedAsH2 ||
    /^###\s+(Patch|Minor|Major)\s+Changes/m.test(rawBody) ||
    /^\s*-\s*\[[a-z]+\]/im.test(rawBody);
  if (!looksRaw) return {changed: false, contents: original};

  const cleanedBody = rawBody.replace(
    /^###\s+(Patch|Minor|Major)\s+Changes\s*$/gm,
    '',
  );
  const formatted = formatVersionBlock(version, cleanedBody);

  const rest = lines.slice(i).join('\n').replace(/^\n+/, '');
  const head = titleLines.join('\n').replace(/\n+$/, '');
  const parts = [head, '', formatted.trimEnd()];
  if (rest.trim()) parts.push('', '---', '', rest.trimEnd());
  const contents =
    parts
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd() + '\n';

  return {changed: contents !== original, contents};
}

function main() {
  const files = discoverChangelogs();
  const drifted = [];
  for (const f of files) {
    const {changed, contents} = processFile(f);
    if (!changed) continue;
    drifted.push(path.relative(ROOT, f));
    if (!CHECK) fs.writeFileSync(f, contents, 'utf8');
  }

  if (CHECK) {
    if (drifted.length) {
      console.error(
        `✗ ${drifted.length} CHANGELOG(s) not formatted:\n` +
          drifted.map(d => '  - ' + d).join('\n'),
      );
      console.error(
        '\nRun `node scripts/format-changelogs.mjs` (or `pnpm version-packages`).',
      );
      process.exit(1);
    }
    console.log('✓ all CHANGELOGs formatted');
    return;
  }
  if (drifted.length)
    console.log(
      `✓ formatted ${drifted.length} CHANGELOG(s):\n` +
        drifted.map(d => '  - ' + d).join('\n'),
    );
  else console.log('✓ no CHANGELOGs needed formatting');
}

// Run as a script, but stay importable for unit tests.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export {reflowBulletBody, formatVersionBlock};
