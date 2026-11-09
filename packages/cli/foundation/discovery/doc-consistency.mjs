// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file What an integration's docs say that no reader can serve, read from
 * the docs alone, with no compiler.
 *
 * Component docs:
 * - `duplicate_prop`: a prop table lists one prop twice, so a reader sees it
 *   twice and the two entries can disagree;
 * - `unknown_translated_prop`: a `docsZh`/`docsDense` overlay's
 *   `propDescriptions` key matches no prop entry's `name` as written (an
 *   overlay applies by the entry's whole name, `value / onChange` included),
 *   so its text is dropped when the overlay is laid over the doc.
 *
 * Topics (the docs root):
 * - `empty_section`: a section with no content, which reads as a bare title;
 * - `duplicate_section_key`: two sections of one topic whose keys (their
 *   `id`, else the key their title derives) collide, so the later one is
 *   served only at a suffixed key nobody wrote; the fix names that key;
 * - `orphan_doc_overlay`: a `{topic}.doc.zh.mjs` or `{topic}.doc.dense.mjs`
 *   file beside no `{topic}.doc.mjs`, which ships and is never read.
 *
 * Every finding is a warning with a fix ready to paste.
 *
 * @input A loaded integration (its roots) and the package directory.
 * @output AstryxIntegrationIssue warnings, each with a `fix` and a `file`.
 * @position Run by `astryx doctor integration validate`, so
 *   `astryx integration check --strict` fails on them.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {sectionKeyProblems, withSectionKeys} from './docs-section-key.mjs';
import {importDocModule} from '../doc-compiler/import.mjs';
import {OVERLAY_LANGUAGES} from '../doc-compiler/read.mjs';

/**
 * @typedef {import('../integrations/issue').AstryxIntegrationIssue} Issue
 */

/**
 * The codes this check raises.
 * @typedef {'duplicate_prop' | 'unknown_translated_prop' | 'empty_section' | 'duplicate_section_key' | 'orphan_doc_overlay'} DocConsistencyProblem
 */

const TOPIC_SUFFIXES = ['.doc.ts', '.doc.mjs', '.doc.js'];

/**
 * @param {DocConsistencyProblem} code
 * @param {string} message
 * @param {string} fix
 * @param {string} file relative to the package
 * @param {number} [line] 1-based, where the check can locate it
 * @returns {Issue}
 */
function finding(code, message, fix, file, line) {
  return {
    code,
    severity: 'warning',
    message,
    fix,
    file,
    ...(line != null ? {line} : {}),
  };
}

/**
 * The 1-based line of the `nth` match of `pattern` in `text` at or after
 * `from`, or undefined.
 * @param {string} text
 * @param {RegExp} pattern a global pattern
 * @param {number} [nth]
 * @param {number} [from]
 * @returns {number | undefined}
 */
function lineOf(text, pattern, nth = 0, from = 0) {
  if (!text) return undefined;
  const matches = [...text.slice(from).matchAll(pattern)];
  const match = matches[Math.min(nth, matches.length - 1)];
  if (match?.index == null) return undefined;
  return text.slice(0, from + match.index).split('\n').length;
}

/** @param {string} file */
function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

/** @param {string} value */
function escapeRe(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A pattern for `name: '<value>'` in any quote style.
 * @param {string} value
 */
function namePattern(value) {
  return new RegExp(`\\bname['"]?\\s*:\\s*(['"\`])${escapeRe(value)}\\1`, 'g');
}

/**
 * The names one prop entry documents: `a / b` names two.
 * @param {any} prop
 * @returns {string[]}
 */
function namesOf(prop) {
  if (!prop || typeof prop.name !== 'string') return [];
  return prop.name
    .split(/\s+\/\s+/)
    .map((/** @type {string} */ name) => name.trim())
    .filter(Boolean);
}

/**
 * Each prop table a component doc holds: its own `props`, and each
 * `components` entry's, with where it sits.
 * @param {any} doc
 * @returns {Array<{at: string, owner: string, props: any[]}>}
 */
function propTablesOf(doc) {
  /** @type {Array<{at: string, owner: string, props: any[]}>} */
  const tables = [];
  if (!doc || typeof doc !== 'object') return tables;
  if (Array.isArray(doc.props)) {
    tables.push({at: 'props', owner: String(doc.name ?? ''), props: doc.props});
  }
  if (Array.isArray(doc.components)) {
    doc.components.forEach(
      (/** @type {any} */ entry, /** @type {number} */ i) => {
        if (entry && Array.isArray(entry.props)) {
          tables.push({
            at: `components[${i}].props`,
            owner: String(entry.name ?? ''),
            props: entry.props,
          });
        }
      },
    );
  }
  return tables;
}

/**
 * The closest name to `name` among `names`, when one is near enough to be a
 * typo of it.
 * @param {string} name
 * @param {Iterable<string>} names
 * @returns {string | undefined}
 */
function closest(name, names) {
  let best;
  let bestDistance = Infinity;
  for (const candidate of names) {
    const distance = editDistance(name.toLowerCase(), candidate.toLowerCase());
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best != null &&
    bestDistance <= Math.max(2, Math.floor(name.length / 3))
    ? best
    : undefined;
}

/** @param {string} a @param {string} b */
function editDistance(a, b) {
  const row = Array.from({length: b.length + 1}, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const kept = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      previous = kept;
    }
  }
  return row[b.length];
}

/**
 * Problems in one component doc module.
 * @param {Record<string, any>} mod
 * @param {string} file relative to the package
 * @param {string} [text] the file's source, to locate each finding's line
 * @returns {Issue[]}
 */
export function componentDocProblems(mod, file, text = '') {
  /** @type {Issue[]} */
  const issues = [];
  const doc = mod?.default ?? mod?.docs;
  if (!doc || typeof doc !== 'object') return issues;
  const tables = propTablesOf(doc);

  // A prop documented twice: doc structure the reader silently drops
  // (architecture:cli-surface DEC-8).
  /** @type {Map<string, number>} entries of each name seen so far, file-wide */
  const seenNames = new Map();
  for (const {at, owner, props} of tables) {
    /** @type {Map<string, number>} */
    const first = new Map();
    props.forEach((/** @type {any} */ prop, /** @type {number} */ i) => {
      for (const name of namesOf(prop)) {
        const whole = typeof prop.name === 'string' ? prop.name : name;
        const nth = seenNames.get(whole) ?? 0;
        seenNames.set(whole, nth + 1);
        const earlier = first.get(name);
        if (earlier == null) {
          first.set(name, i);
          continue;
        }
        issues.push(
          finding(
            'duplicate_prop',
            `${owner ? `${owner}'s ` : ''}prop "${name}" is documented twice: ${at}[${earlier}] and ${at}[${i}].`,
            `In ${file}, delete ${at}[${i}] (the second "${name}" entry), keeping what it adds in ${at}[${earlier}].`,
            file,
            lineOf(text, namePattern(whole), nth),
          ),
        );
      }
    });
  }

  // An overlay key that names no prop entry: doc structure the reader
  // silently drops (architecture:cli-surface DEC-8).
  for (const exportName of ['docsZh', 'docsDense']) {
    const overlay = mod?.[exportName];
    if (!overlay || typeof overlay !== 'object') continue;
    /** @type {Array<{at: string, descriptions: unknown, props: any[] | undefined, owner: string}>} */
    const checks = [
      {
        at: `${exportName}.propDescriptions`,
        descriptions: overlay.propDescriptions,
        props: Array.isArray(doc.props) ? doc.props : undefined,
        owner: String(doc.name ?? ''),
      },
    ];
    if (Array.isArray(overlay.components) && Array.isArray(doc.components)) {
      overlay.components.forEach(
        (/** @type {any} */ entry, /** @type {number} */ i) => {
          if (!entry || typeof entry !== 'object') return;
          const base =
            doc.components.find(
              (/** @type {any} */ c) => c?.name === entry.name,
            ) ?? doc.components[i];
          checks.push({
            at: `${exportName}.components[${i}].propDescriptions`,
            descriptions: entry.propDescriptions,
            props: Array.isArray(base?.props) ? base.props : undefined,
            owner: String(base?.name ?? entry.name ?? ''),
          });
        },
      );
    }
    const exportAt = Math.max(
      0,
      text.search(new RegExp(`\\b${exportName}\\b\\s*=`)),
    );
    for (const {at, descriptions, props, owner} of checks) {
      if (!props || !descriptions || typeof descriptions !== 'object') continue;
      // An overlay applies by the entry's whole name, as written.
      const known = new Set(
        props
          .map(prop => (typeof prop?.name === 'string' ? prop.name : null))
          .filter(name => name != null),
      );
      /** @type {Map<string, string>} each name an entry documents, to its whole name */
      const wholeOf = new Map();
      for (const prop of props) {
        for (const each of namesOf(prop)) wholeOf.set(each, prop.name);
      }
      for (const key of Object.keys(descriptions)) {
        if (known.has(key)) continue;
        const part = closest(key, [...wholeOf.keys(), ...known]);
        const near = part == null ? undefined : (wholeOf.get(part) ?? part);
        issues.push(
          finding(
            'unknown_translated_prop',
            `${at} names "${key}", but no prop entry of ${owner || 'the doc'} is named "${key}" (an overlay matches an entry's whole name), so that text is never shown.`,
            near
              ? `In ${file}, rename the key "${key}" in ${at} to "${near}".`
              : `In ${file}, remove "${key}" from ${at}, or document the prop "${key}" first.`,
            file,
            lineOf(
              text,
              new RegExp(`(['"\`]?)${escapeRe(key)}\\1\\s*:`, 'g'),
              0,
              exportAt,
            ),
          ),
        );
      }
    }
  }
  return issues;
}

/**
 * Every file under a folder whose name passes `test`, skipping
 * `node_modules`, `.git` and `__tests__`.
 * @param {string} dir
 * @param {(name: string) => boolean} test
 * @returns {string[]}
 */
function filesUnder(dir, test) {
  /** @type {string[]} */
  const found = [];
  /** @param {string} folder */
  const walk = folder => {
    /** @type {fs.Dirent[]} */
    let entries;
    try {
      entries = fs.readdirSync(folder, {withFileTypes: true});
    } catch {
      return;
    }
    for (const entry of entries) {
      if (['node_modules', '.git', '__tests__'].includes(entry.name)) continue;
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (test(entry.name)) found.push(full);
    }
  };
  walk(dir);
  return found.sort();
}

/**
 * Problems in one topic doc.
 * @param {any} doc
 * @param {string} file relative to the package
 * @param {string} [text] the file's source, to locate each finding's line
 * @returns {Issue[]}
 */
export function topicDocProblems(doc, file, text = '') {
  /** @type {Issue[]} */
  const issues = [];
  if (!doc || typeof doc !== 'object' || doc.type === 'namespace') {
    return issues;
  }
  const name = String(doc.name ?? '');
  const sections = Array.isArray(doc.sections) ? doc.sections : [];
  // A section with no content is fluff, the limiting case of the density
  // floor (architecture:cli-surface DEC-8).
  let empties = 0;
  sections.forEach((/** @type {any} */ section, /** @type {number} */ i) => {
    if (Array.isArray(section?.content) && section.content.length === 0) {
      const nth = empties++;
      const title =
        typeof section.title === 'string' ? ` "${section.title}"` : '';
      issues.push(
        finding(
          'empty_section',
          `Topic "${name}" section${title} (sections[${i}]) has no content, so it reads as a bare title.`,
          `In ${file}, give sections[${i}] content, such as content: [{type: 'prose', text: '…'}], or delete the section.`,
          file,
          lineOf(text, /\bcontent['"]?\s*:\s*\[\s*\]/g, nth),
        ),
      );
    }
  });
  // Two sections with one key: doc structure the reader silently drops
  // (architecture:cli-surface DEC-8).
  for (const problem of sectionKeyProblems(sections)) {
    const collision =
      /^sections\[(\d+)\]: the key "([^"]+)" is already used by sections\[(\d+)\]/.exec(
        problem,
      );
    if (!collision) continue;
    const [, later, key, earlier] = collision;
    // A later section that writes its own `id` is an invalid doc, which docs
    // discovery reports (sectionKeyErrors); only a derived key is served at a
    // suffix.
    if (sections[Number(later)]?.id != null) continue;
    let served = `${key}-2`;
    try {
      served = withSectionKeys({sections}).sections[Number(later)].id ?? served;
    } catch {
      // Keep the first suffix withSectionKeys tries.
    }
    const laterTitle = sections[Number(later)]?.title;
    const laterLine =
      typeof laterTitle === 'string'
        ? lineOf(
            text,
            new RegExp(
              `\\btitle['"]?\\s*:\\s*(['"\`])${escapeRe(laterTitle)}\\1`,
              'g',
            ),
            sections
              .slice(0, Number(later))
              .filter((/** @type {any} */ each) => each?.title === laterTitle)
              .length,
          )
        : undefined;
    const titleOf = (/** @type {string} */ i) =>
      typeof sections[Number(i)]?.title === 'string'
        ? ` "${sections[Number(i)].title}"`
        : '';
    issues.push(
      finding(
        'duplicate_section_key',
        `Topic "${name}": sections[${earlier}]${titleOf(earlier)} and sections[${later}]${titleOf(later)} both have the key "${key}", so \`astryx docs ${name} ${key}\` opens only sections[${earlier}]; sections[${later}] is served at "${served}", a key no one wrote.`,
        `In ${file}, give sections[${later}] its own title, or write the key it is already served at: id: '${served}'.`,
        file,
        laterLine,
      ),
    );
  }
  return issues;
}

/**
 * Check an integration's component docs and topics.
 * @param {{components?: string, docs?: string}} integration absolute roots
 * @param {string} packageDir
 * @returns {Promise<Issue[]>}
 */
export async function integrationDocConsistency(integration, packageDir) {
  /** @type {Issue[]} */
  const issues = [];
  const rel = (/** @type {string} */ file) =>
    path.relative(packageDir, file).split(path.sep).join('/');

  /** @type {string[]} */
  const componentDocs = [];
  if (integration.components) {
    componentDocs.push(
      ...filesUnder(integration.components, name =>
        TOPIC_SUFFIXES.some(suffix => name.endsWith(suffix)),
      ),
    );
  }
  for (const docPath of componentDocs.sort()) {
    let mod;
    try {
      mod = await importDocModule(docPath);
    } catch {
      // A doc that does not load is reported by the checks that load it.
      continue;
    }
    issues.push(...componentDocProblems(mod, rel(docPath), readText(docPath)));
  }

  const docsDir = integration.docs;
  if (docsDir && fs.existsSync(docsDir)) {
    const topicFiles = filesUnder(docsDir, name =>
      TOPIC_SUFFIXES.some(suffix => name.endsWith(suffix)),
    );
    /** @type {Array<{file: string, doc: any}>} */
    const topics = [];
    for (const file of topicFiles) {
      try {
        const mod = await importDocModule(file);
        topics.push({file, doc: mod?.docs ?? mod?.default});
      } catch {
        // Reported by docs discovery.
      }
    }
    for (const {file, doc} of topics) {
      issues.push(...topicDocProblems(doc, rel(file), readText(file)));
    }

    // An overlay beside no topic file: doc structure the reader silently drops
    // (architecture:cli-surface DEC-8).
    // An overlay is read beside the topic file of its stem.
    for (const overlay of filesUnder(docsDir, name =>
      OVERLAY_LANGUAGES.some(lang => name.endsWith(`.doc.${lang}.mjs`)),
    )) {
      const base = path.basename(overlay);
      const lang = /** @type {string} */ (
        OVERLAY_LANGUAGES.find(each => base.endsWith(`.doc.${each}.mjs`))
      );
      const stem = base.slice(0, -`.doc.${lang}.mjs`.length);
      const dir = path.dirname(overlay);
      if (
        TOPIC_SUFFIXES.some(suffix =>
          fs.existsSync(path.join(dir, `${stem}${suffix}`)),
        )
      ) {
        continue;
      }
      const topicNames = topics
        .filter(({file}) => path.dirname(file) === dir)
        .map(({file}) =>
          path.basename(file).replace(/\.doc\.(ts|mjs|js)$/, ''),
        );
      const near = closest(stem, topicNames);
      issues.push(
        finding(
          'orphan_doc_overlay',
          `${rel(overlay)} overlays a topic file ${stem}.doc.mjs that does not exist, so it ships and is never read.`,
          near
            ? `Rename ${rel(overlay)} to ${rel(path.join(dir, `${near}.doc.${lang}.mjs`))}, the overlay of ${near}.doc.mjs.`
            : `Delete ${rel(overlay)}, or add the topic it translates as ${rel(path.join(dir, `${stem}.doc.mjs`))}.`,
          rel(overlay),
          1,
        ),
      );
    }
  }
  return issues;
}
