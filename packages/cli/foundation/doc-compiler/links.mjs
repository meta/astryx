// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Links between docs, named by doc identity (spec:AST-047 FR9).
 *
 * @input A link target, `[<provider>:]<kind>:<name>`, written as a `reference`
 *   block, in a `workflow` step's `references`, or inline in text as
 *   `{@link <target>}`; and a resolver that finds the doc a target names.
 * @output The same content with every link resolved: an inline link becomes
 *   the `astryx docs` command that opens its doc, and a block carries a `link`
 *   with the doc's identity, route, title, summary, and command. A reference
 *   block in a topic section also carries the `content` it includes. A link
 *   that names no doc is a problem, never a guess.
 *   Doc tokens render here too (renderTokens), so text and JSON carry the
 *   same commands.
 * @position Pure, apart from reading which package manager the working
 *   directory's project uses, for `{@pm}` tokens. The docs adapter owns the
 *   resolver (the project's docs tree and topic catalog) and applies this to
 *   every read and every doctor check.
 */

import {renderCommandTokens} from './doc-syntax.mjs';
import {docPackageManager} from '../env/package-manager.mjs';

/** The kinds a link can name: every authored doc kind. */
export const LINK_KINDS = new Set([
  'generic',
  'command',
  'function',
  'schema',
  'enum',
  'namespace',
  'component',
  'page',
  'block',
]);

/** An inline link in text: `{@link <target>}`. */
export const INLINE_LINK = /\{@link\s+([^{}]+?)\s*\}/g;

/** Code spans in text, which show link syntax as written. */
const CODE_SPAN = /(`[^`]*`)/;

/**
 * @typedef {object} LinkTarget
 * @property {string | null} provider the provider id it names, or null for the
 *   linking doc's own provider
 * @property {string} kind
 * @property {string} name
 */

/**
 * The doc a link opens, as a docs read returns it.
 * @typedef {object} DocLink
 * @property {string} target the target as written: `[<provider>:]<kind>:<name>`
 * @property {string} id the doc's identity (a DocId)
 * @property {string | null} route what `astryx docs <route>` opens; null for a
 *   component, page, or block doc, which no docs route opens
 * @property {string} title
 * @property {string} summary
 * @property {string} command the command that opens it: `astryx docs <route>`,
 *   or `astryx component` or `astryx template` for a component, page, or block
 */

/**
 * Finds the doc a target names, or says why none matches.
 * @typedef {(target: string) => Promise<DocLink | {problem: string}>} LinkResolver
 */

/**
 * @typedef {object} LinkProblem
 * @property {string} target the target as written
 * @property {string} message
 * @property {string} [section] the key of the section the link sits in
 * @property {string} [field] the field the link sits in, outside any section:
 *   `description`, or a path such as `props[2].description`
 * @property {true} [include] the problem is in a `reference` block, which
 *   includes content rather than linking to it: a reader loses that content,
 *   so the authoring check fails on it
 */

/**
 * What a `reference` block in a topic section includes of the doc it names:
 * stable content blocks, with anything it could not include named in
 * `problems`.
 * @typedef {(block: any) => Promise<{content: any[], problems: string[]}>} DocIncluder
 */

/**
 * Parse `[<provider>:]<kind>:<name>`. A name may hold spaces
 * (`command:theme build`); no part holds a colon.
 * @param {unknown} target
 * @returns {LinkTarget | {error: string}}
 */
export function parseLinkTarget(target) {
  if (typeof target !== 'string' || target.trim() === '') {
    return {
      error:
        'a link target is a non-empty string: `[<provider>:]<kind>:<name>`',
    };
  }
  const parts = target.trim().split(':');
  if (
    parts.length < 2 ||
    parts.length > 3 ||
    parts.some(p => p.trim() === '')
  ) {
    return {error: `"${target}" is not \`[<provider>:]<kind>:<name>\``};
  }
  const provider = parts.length === 3 ? parts[0].trim() : null;
  const kind = parts[parts.length - 2].trim();
  const name = parts[parts.length - 1].trim();
  if (!LINK_KINDS.has(kind)) {
    return {
      error: `"${target}" names the kind "${kind}"; a doc kind is one of ${[
        ...LINK_KINDS,
      ].join(', ')}`,
    };
  }
  return {provider, kind, name};
}

/**
 * Text with each inline link replaced by its name and each doc token by its
 * command, for indexes that must not read the syntax as words.
 * @param {string} text
 * @returns {string}
 */
export function unlinkText(text) {
  return String(renderTokens(text))
    .split(CODE_SPAN)
    .map(part =>
      part.startsWith('`')
        ? part
        : part.replace(INLINE_LINK, (_, target) => {
            const parsed = parseLinkTarget(target);
            return 'error' in parsed ? target : parsed.name;
          }),
    )
    .join('');
}

/**
 * Text with its doc tokens rendered (doc-syntax.mjs): `{@command …}` as the
 * bare `astryx …` command, which text output then starts with the reader's
 * runner the way it starts every command, and `{@pm …}` in the package
 * manager of the project the CLI runs in. JSON readers get runnable commands,
 * the way they did before docs wrote tokens.
 * @param {unknown} text
 * @param {string | null} [lang] the code block's language for a block's body
 * @returns {any}
 */
export function renderTokens(text, lang = null) {
  if (typeof text !== 'string' || !text.includes('{@')) return text;
  return renderCommandTokens(
    text,
    {stem: 'astryx', pm: docPackageManager(process.cwd())},
    lang,
  );
}

/**
 * Text with each inline link replaced by the command that opens its doc. A
 * link written inside code ticks is shown as written: it documents the syntax,
 * it does not link. A link that names no doc prints as written: text that was
 * never meant as a link reads the way it did, and doctor names the problem.
 * @param {unknown} text
 * @param {(target: string) => Promise<DocLink | null>} find
 * @returns {Promise<any>}
 */
async function resolveInline(text, find) {
  if (typeof text !== 'string') return text;
  if (!text.includes('{@link')) return renderTokens(text);
  let out = '';
  for (const part of text.split(CODE_SPAN)) {
    if (part.startsWith('`')) {
      out += part;
      continue;
    }
    let last = 0;
    for (const match of part.matchAll(INLINE_LINK)) {
      const link = await find(match[1]);
      const at = /** @type {number} */ (match.index);
      out += part.slice(last, at);
      out += link ? `\`${link.command}\`` : match[0];
      last = at + match[0].length;
    }
    out += part.slice(last);
  }
  return renderTokens(out);
}

/**
 * The fields of a doc that hold text a reader reads, where a link resolves:
 * a description or summary, an example's label, and each value of a
 * `propDescriptions` overlay. Every other string is a name, a type, a
 * default, or code, and is shown as written.
 */
const TEXT_FIELDS = new Set(['description', 'summary', 'label']);

/** Fields that hold code or data, never text: nothing below them links. */
const CODE_FIELDS = new Set([
  'code',
  'playground',
  'slotElements',
  'registry',
  'keywords',
]);

/**
 * Every text field of a doc object, in authored order, by the same rules
 * {@link linkFields} resolves links by: the strings a reader reads, never a
 * name, type, default, or code.
 * @param {unknown} doc
 * @returns {{field: string, text: string}[]}
 */
export function textFields(doc) {
  /** @type {{field: string, text: string}[]} */
  const out = [];
  /**
   * @param {unknown} value
   * @param {string} at
   * @param {boolean} text
   */
  const walk = (value, at, text) => {
    if (typeof value === 'string') {
      if (text) out.push({field: at, text: value});
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, i) => walk(item, `${at}[${i}]`, false));
      return;
    }
    if (value == null || typeof value !== 'object') return;
    for (const [key, field] of Object.entries(value)) {
      const path = at === '' ? key : `${at}.${key}`;
      if (CODE_FIELDS.has(key)) continue;
      if (key === 'propDescriptions' && field && typeof field === 'object') {
        for (const [prop, description] of Object.entries(field)) {
          walk(description, `${path}.${prop}`, true);
        }
      } else {
        walk(field, path, TEXT_FIELDS.has(key));
      }
    }
  };
  walk(doc, '', false);
  return out;
}

/**
 * Resolve every inline link in the text fields of a doc object, such as a
 * component doc or a topic's summary fields (spec:AST-047 FR9): its
 * description, its usage and best practices, each prop's and example's
 * description, at any depth. Code and code ticks show link syntax as written.
 * @template T
 * @param {T} doc
 * @param {LinkResolver} resolve
 * @returns {Promise<{doc: T, problems: LinkProblem[]}>}
 */
export async function linkFields(doc, resolve) {
  /** @type {LinkProblem[]} */
  const problems = [];
  /**
   * @param {unknown} value
   * @param {string} at the field path, e.g. `usage.bestPractices[0].description`
   * @param {boolean} text whether a string here is text
   * @returns {Promise<any>}
   */
  const walk = async (value, at, text) => {
    if (typeof value === 'string') {
      if (!text) return value;
      return resolveInline(value, async target => {
        const found = await resolve(target);
        if ('problem' in found) {
          problems.push({target, message: found.problem, field: at});
          return null;
        }
        return found;
      });
    }
    if (Array.isArray(value)) {
      const out = [];
      for (let i = 0; i < value.length; i++) {
        out.push(await walk(value[i], `${at}[${i}]`, false));
      }
      return out;
    }
    if (value == null || typeof value !== 'object') return value;
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const [key, field] of Object.entries(value)) {
      const path = at === '' ? key : `${at}.${key}`;
      if (CODE_FIELDS.has(key)) {
        out[key] = field;
      } else if (
        key === 'propDescriptions' &&
        field &&
        typeof field === 'object'
      ) {
        /** @type {Record<string, unknown>} */
        const described = {};
        for (const [prop, description] of Object.entries(field)) {
          described[prop] = await walk(description, `${path}.${prop}`, true);
        }
        out[key] = described;
      } else {
        out[key] = await walk(field, path, TEXT_FIELDS.has(key));
      }
    }
    return out;
  };
  return {doc: await walk(doc, '', false), problems};
}

/**
 * Resolve every link in a list of content blocks, in order.
 * @param {any[]} blocks
 * @param {LinkResolver} resolve
 * @param {{section?: string}} [at]
 * @param {DocIncluder} [include] how a `reference` block includes the doc it
 *   names; without it, the block only carries its `link`
 * @returns {Promise<{content: any[], problems: LinkProblem[]}>}
 */
export async function linkBlocks(blocks, resolve, at = {}, include) {
  /** @type {LinkProblem[]} */
  const problems = [];
  const where = at.section ? {section: at.section} : {};
  /**
   * @param {string} target
   * @returns {Promise<DocLink | null>}
   */
  const find = async target => {
    const found = await resolve(target);
    if ('problem' in found) {
      problems.push({target, message: found.problem, ...where});
      return null;
    }
    return found;
  };
  /**
   * @param {unknown} text
   * @returns {Promise<any>}
   */
  const linkText = text => resolveInline(text, find);
  /**
   * @param {unknown[]} values
   * @returns {Promise<any[]>}
   */
  const linkAll = async values => {
    const out = [];
    for (const value of values) out.push(await linkText(value));
    return out;
  };

  const content = [];
  for (const block of blocks ?? []) {
    switch (block?.type) {
      case 'prose':
      case 'heading':
        content.push({...block, text: await linkText(block.text)});
        break;
      case 'list':
        content.push({...block, items: await linkAll(block.items ?? [])});
        break;
      case 'table': {
        const rows = [];
        for (const row of block.rows ?? []) rows.push(await linkAll(row));
        content.push({
          ...block,
          headers: await linkAll(block.headers ?? []),
          rows,
        });
        break;
      }
      case 'reference': {
        // A reference includes content, so what it cannot include is a
        // problem the authoring check fails on, not one that prints as written.
        const found = await resolve(block.target);
        if ('problem' in found) {
          problems.push({
            target: block.target,
            message: found.problem,
            include: true,
            ...where,
          });
          content.push({...block, link: null});
          break;
        }
        /** @type {any} */
        const linked = {...block, link: found};
        if (include) {
          const included = await include(block);
          for (const message of included.problems) {
            problems.push({
              target: block.target,
              message,
              include: true,
              ...where,
            });
          }
          linked.content = included.content;
        }
        content.push(linked);
        break;
      }
      case 'workflow': {
        const steps = [];
        for (const step of block.steps ?? []) {
          /** @type {any} */
          const linked = {...step};
          if (step.description != null) {
            linked.description = await linkText(step.description);
          }
          if (Array.isArray(step.references)) {
            const links = [];
            for (const target of step.references)
              links.push(await find(target));
            linked.links = links;
          }
          steps.push(linked);
        }
        content.push({...block, steps});
        break;
      }
      case 'code':
        content.push({
          ...block,
          code: renderTokens(block.code, block.lang ?? ''),
        });
        break;
      case 'collection':
        problems.push({
          target: `collection:${block.source?.slot ?? ''}`,
          message:
            'a collection block is not rendered yet; link each doc with a reference block instead',
          ...where,
        });
        content.push(block);
        break;
      default:
        content.push(block);
    }
  }
  return {content, problems};
}

/**
 * Resolve every link in a topic's sections.
 * @param {any[]} sections
 * @param {LinkResolver} resolve
 * @returns {Promise<{sections: any[], problems: LinkProblem[]}>}
 */
export async function linkSections(sections, resolve) {
  /** @type {LinkProblem[]} */
  const problems = [];
  const out = [];
  for (const section of sections ?? []) {
    const linked = await linkBlocks(section.content, resolve, {
      section: section.id ?? section.title,
    });
    problems.push(...linked.problems);
    out.push({...section, content: linked.content});
  }
  return {sections: out, problems};
}
