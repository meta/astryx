// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Stray doc pointers (architecture:cli-surface DEC-8): a code span in
 * prose that is exactly `astryx docs <name>`, or its `{@command docs <name>}`
 * token, for a doc that exists. The doc's
 * `{@link}` prints the command that opens the doc and is checked by doctor's
 * link check, so a written command is a pointer nothing checks.
 *
 * @input the docs a package ships, as discoverIntegrationDocs returns them
 * @output each stray pointer, with the link that replaces it
 * @position foundation/discovery, called through api/integration/_adapter.mjs
 */

import fs from 'node:fs';

import {textFields} from '../doc-compiler/links.mjs';
import {builtinGuideFiles} from './docs-discovery.mjs';
import {
  fileWords,
  lineAtOffset,
  loadQuietly,
  locateWords,
  textWords,
} from './copied-passages.mjs';

/**
 * A code span that is exactly the command opening one doc. A command with
 * more words, a flag, or a route is a walkthrough, not a pointer. A name holds
 * what a topic name may (letters, digits, `_` and `-`), never opening with `-`.
 */
const POINTER =
  /`astryx docs ([A-Za-z0-9_][A-Za-z0-9_-]*)`|`?\{@command docs ([A-Za-z0-9_][A-Za-z0-9_-]*)\}`?/g;

/** @type {Promise<Map<string, string>> | undefined} */
let coreKinds;

/**
 * The CLI's own docs by name, each with the kind a link names it by: a
 * namespace doc as `namespace`, a topic or guide as `generic`.
 * @returns {Promise<Map<string, string>>}
 */
function loadCoreKinds() {
  coreKinds ??= (async () => {
    const kinds = new Map();
    for (const file of builtinGuideFiles()) {
      const doc = await loadQuietly(file);
      if (typeof doc?.name === 'string') {
        kinds.set(doc.name, doc.type === 'namespace' ? 'namespace' : 'generic');
      }
    }
    return kinds;
  })();
  return coreKinds;
}

/**
 * The strings of a doc the CLI resolves links in (spec:AST-047 FR9). In a
 * topic: its description and summary, then the text of prose and heading
 * blocks, list items, and table cells in each section's content, with the
 * section's title. In a component doc (any doc with no sections): every text
 * field, such as its description, usage, best practices, and each prop's and
 * example's description, with the field's path. Code is never read.
 *
 * @param {unknown} doc an authored doc object
 * @returns {{text: string, section: string | null, field: string | null}[]}
 */
export function linkableStrings(doc) {
  /** @type {{text: string, section: string | null, field: string | null}[]} */
  const strings = [];
  if (doc == null || typeof doc !== 'object') return strings;
  const top = /** @type {Record<string, any>} */ (doc);
  if (!Array.isArray(top.sections)) {
    for (const {field, text} of textFields(doc)) {
      strings.push({text, section: null, field});
    }
    return strings;
  }
  for (const field of ['description', 'summary']) {
    if (typeof top[field] === 'string') {
      strings.push({text: top[field], section: null, field});
    }
  }
  /**
   * @param {unknown} value
   * @param {string | null} section
   */
  const walk = (value, section) => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item, section);
      return;
    }
    if (value == null || typeof value !== 'object') return;
    const record = /** @type {Record<string, any>} */ (value);
    const title = typeof record.title === 'string' ? record.title : section;
    if (Array.isArray(record.sections)) walk(record.sections, section);
    if (!Array.isArray(record.content)) return;
    for (const block of record.content) {
      const add = (/** @type {unknown} */ text) => {
        if (typeof text === 'string') {
          strings.push({text, section: title, field: null});
        }
      };
      switch (block?.type) {
        case 'prose':
        case 'heading':
          add(block.text);
          break;
        case 'list':
          (block.items ?? []).forEach(add);
          break;
        case 'table':
          (block.headers ?? []).forEach(add);
          for (const row of block.rows ?? []) row.forEach(add);
          break;
        default:
          walk(block, title);
      }
    }
  };
  walk(doc, null);
  return strings;
}

/**
 * Every pointer span in one prose string, in order.
 * @param {string} text
 * @returns {string[]} the doc name each one points at
 */
export function pointersIn(text) {
  return [...text.matchAll(POINTER)].map(match => match[1] ?? match[2]);
}

/**
 * Where a string's words start among a file's words, from `from` on. A
 * one-line string the file holds as a quoted literal is found at that
 * literal, so a list item that is only `astryx docs theme` is not placed at a
 * summary or code block that writes the same words.
 *
 * @param {string[]} lines the file's lines
 * @param {{word: string, line: number}[]} file the file's words
 * @param {string} text
 * @param {{word: string}[]} words the string's words
 * @param {number} from
 * @returns {number}
 */
function locateString(lines, file, text, words, from) {
  /** @type {number[]} */
  const starts = [];
  for (let at = locateWords(file, words); at >= 0;) {
    starts.push(at);
    at = locateWords(file, words, at + 1);
  }
  if (starts.length === 0) return -1;
  const literals = text.includes('\n')
    ? []
    : [`'${text}'`, `"${text}"`, `'${text.replace(/'/g, "\\'")}'`];
  const quoted = starts.filter(at =>
    literals.some(literal => lines[file[at].line - 1]?.includes(literal)),
  );
  const pool = quoted.length > 0 ? quoted : starts;
  return pool.find(at => at >= from) ?? pool[0];
}

/**
 * Each stray pointer in a package's topics and component docs.
 *
 * @param {{records: {name: string, path: string}[], guides?: {name: string, ref?: {topicFile?: string}}[], namespaces?: {doc?: {name?: string}}[], components?: {name: string, file: string}[]}} discovered
 * @returns {Promise<import('../../api/integration/authoring-checks.type.mjs').StrayPointer[]>}
 */
export async function findStrayPointers(discovered) {
  /** @type {{name: string, file: string | undefined, kind: 'topic' | 'component'}[]} */
  const topics = [
    ...discovered.records.map(record => ({
      name: record.name,
      file: record.path,
      kind: /** @type {const} */ ('topic'),
    })),
    ...(discovered.guides ?? []).map(guide => ({
      name: guide.name,
      file: guide.ref?.topicFile,
      kind: /** @type {const} */ ('topic'),
    })),
  ];
  /** @type {Map<string, string>} */
  const own = new Map(topics.map(topic => [topic.name, 'generic']));
  for (const namespace of discovered.namespaces ?? []) {
    const name = namespace?.doc?.name;
    if (typeof name === 'string' && !own.has(name)) own.set(name, 'namespace');
  }
  for (const component of discovered.components ?? []) {
    topics.push({
      name: component.name,
      file: component.file,
      kind: 'component',
    });
  }
  const core = await loadCoreKinds();
  // A topic that extends another has no route of its own: a link to it names
  // the page it shows on, the topic it extends.
  /** @type {Map<string, string>} */
  const extendsOf = new Map();
  for (const topic of topics) {
    if (!topic.file) continue;
    const doc = /** @type {any} */ (await loadQuietly(topic.file));
    if (typeof doc?.extends === 'string')
      extendsOf.set(topic.name, doc.extends);
  }
  /** @param {string} target */
  const linkFor = target => {
    const page = extendsOf.get(target);
    if (page != null) {
      if (own.has(page) && !extendsOf.has(page)) {
        return `{@link ${own.get(page)}:${page}}`;
      }
      return core.has(page)
        ? `{@link @astryxdesign/cli:${core.get(page)}:${page}}`
        : null;
    }
    return own.has(target)
      ? `{@link ${own.get(target)}:${target}}`
      : core.has(target)
        ? `{@link @astryxdesign/cli:${core.get(target)}:${target}}`
        : null;
  };
  /** @type {import('../../api/integration/authoring-checks.type.mjs').StrayPointer[]} */
  const found = [];
  for (const topic of topics) {
    if (!topic.file) continue;
    const doc = await loadQuietly(topic.file);
    if (!doc) continue;
    /** @type {{word: string, line: number}[]} */
    let source = [];
    /** @type {string[]} */
    let lines = [];
    try {
      const raw = fs.readFileSync(topic.file, 'utf8');
      source = fileWords(raw);
      lines = raw.split('\n');
    } catch {
      // No line numbers; the finding still names the section.
    }
    // A component doc is named by its own name: a family doc by the family.
    const name =
      topic.kind === 'component' && typeof doc.name === 'string'
        ? doc.name
        : topic.name;
    const label =
      topic.kind === 'component' ? `component "${name}"` : `"${name}"`;
    // Each string is found by its whole run of words, from where the last
    // one was found, so two strings that open alike keep their own lines.
    let cursor = 0;
    for (const {text, section, field} of linkableStrings(doc)) {
      const words = textWords(text);
      const index = locateString(lines, source, text, words, cursor);
      if (index >= 0) cursor = index + words.length;
      for (const match of text.matchAll(POINTER)) {
        const target = match[1] ?? match[2];
        const link = linkFor(target);
        if (!link) continue;
        // As written: the bare command, or its `{@command}` token.
        const command =
          match[1] != null
            ? `astryx docs ${target}`
            : match[0].replace(/`/g, '');
        const line =
          index < 0
            ? null
            : lineAtOffset(
                source,
                index,
                words,
                /** @type {number} */ (match.index) + 1,
              );
        const where = [
          section ? `section "${section}"` : null,
          field ? `field ${field}` : null,
          line == null ? null : `line ${line}`,
        ]
          .filter(Boolean)
          .join(', ');
        found.push({
          topic: name,
          kind: topic.kind,
          section,
          field,
          file: topic.file,
          line,
          pointer: command,
          link,
          message:
            `${label}${where ? ` (${where})` : ''} points at a doc with the written command \`${command}\`. ` +
            `Replace \`${command}\`, code ticks included, with ${link}: the CLI prints the command that opens the doc, and doctor checks the link.`,
        });
      }
    }
  }
  return found;
}
