// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file docs command — Print Astryx reference docs
 *
 * In text, a topic prints whole, unless its whole text is over
 * WHOLE_READ_MAX_BYTES: then it lists its sections, so a reader opens one by
 * its key. `--index` lists the sections of any topic, and `--full` prints any
 * topic whole. `--depth`
 * reads a docs-tree namespace as many levels down as asked, each doc below it
 * at --detail (brief by default: one line each). `--json` keeps the docs()
 * contract: a topic returns its whole doc, and `--index` its sections.
 * Supports --detail (full|compact|brief) and --lang (en|zh|dense). A code
 * block's label prints above its fence, and table cells escape their pipes.
 * Docs write commands as bare `astryx ...`; text output prefixes them with the
 * project's invocation (prefixCliCommands, in formatBlock and the summaries),
 * and JSON keeps them bare.
 *
 * Usage:
 *   astryx docs                          List available topics
 *   astryx docs --list                   The same list, asked for by flag
 *   astryx docs <topic>                  Print the topic (its sections when
 *                                        its whole text is over 16 KB)
 *   astryx docs <topic> --index          List the topic's sections
 *   astryx docs <topic> <section>        Print one section
 *   astryx docs <topic> --full           Print the whole topic
 *   astryx docs <route>                  Open a node of the docs tree, such as
 *                                        cli, cli/api, or cli/api/functions/search
 *   astryx docs <route> --depth <n|all>  Read that many levels below it
 */

import {
  formatCliCommand,
  getCliInvocation,
  prefixCliCommands,
} from '../../../foundation/env/package-manager.mjs';
import {jsonOut} from '../../../foundation/response/json.mjs';
import {
  formatBlock,
  formatReferenceFull,
  formatSection,
} from '../../../foundation/doc-compiler/doc-text.mjs';
import {
  emit,
  section,
  records,
  text,
  code,
  wrapText,
  record,
} from '../formatters/index.mjs';
import {cliError} from '../lib/cli-error.mjs';
import {ERROR_CODES} from '../../../foundation/response/error-codes.mjs';
import {defineCommand} from '../lib/define-command.mjs';
import {resultSet} from '../../../foundation/debug/index.mjs';
import {docs as docsApi} from '../../../api/docs/docs.mjs';
import {doc as docsCommand} from './docs.doc.mjs';
import {doc as docsFn} from '../../../api/docs/docs.doc.mjs';

/**
 * The longest whole topic a bare text read prints, in bytes of the topic's own
 * text at the read's detail: its title, description and sections, without the
 * package line and the moves that frame the read. Up to this size, reading the
 * whole topic costs no more than a reader who wants the answer reads through
 * the section list and the sections it opens; a longer topic lists its
 * sections.
 */
export const WHOLE_READ_MAX_BYTES = 16 * 1024;

// ─── Formatting ──────────────────────────────────────────────────────────────

export {formatBlock};

/**
 * @param {string} title
 * @param {number} level
 * @returns {string}
 */
function treeHeading(title, level) {
  return `${'#'.repeat(Math.max(1, Math.min(6, level)))} ${title}`;
}

/**
 * A doc's blocks at one depth: its headings move down with it.
 * @param {import('@astryxdesign/cli/authoring').ReferenceContentBlock[]} blocks
 * @param {'full' | 'compact' | 'brief'} detail
 * @param {number} headingOffset
 * @returns {string[]}
 */
function formatTreeBlocks(blocks, detail, headingOffset) {
  /** @type {string[]} */
  const formatted = [];
  for (const block of blocks) {
    const value =
      block.type === 'heading'
        ? treeHeading(block.text, (block.level || 3) + headingOffset)
        : formatBlock(block, detail);
    if (value) formatted.push(value);
  }
  return formatted;
}

/**
 * @param {import('../../../api/docs/docs.type.mjs').DocsReadSection} docSection
 * @param {'full' | 'compact' | 'brief'} detail
 * @param {number} headingLevel
 * @returns {string}
 */
function formatTreeSection(docSection, detail, headingLevel) {
  const heading = treeHeading(docSection.title, headingLevel);
  const blocks = formatTreeBlocks(docSection.content, detail, headingLevel - 2);
  return blocks.length > 0 ? `${heading}\n\n${blocks.join('\n\n')}` : heading;
}

/**
 * Where a route sits below the namespace a read names.
 * @param {string} route
 * @param {string} root
 * @returns {string}
 */
function belowRoot(route, root) {
  return route.startsWith(`${root}/`) ? route.slice(root.length + 1) : route;
}

/**
 * @param {number} count
 * @returns {string}
 */
function docsBelow(count) {
  return `${count} ${count === 1 ? 'doc' : 'docs'} below`;
}

/**
 * Every child of a depth read, one row each in reading order, named by where
 * it sits below the read's namespace.
 * @param {import('../../../api/docs/docs.type.mjs').DocsNodeChild[]} children
 * @param {string} root
 * @param {string} owner the package that owns the read's namespace
 * @returns {{name: string, summary: string}[]}
 */
function treeRows(children, root, owner) {
  return children.flatMap(child => [
    {
      // A child another package owns says which one.
      name:
        child.package === owner
          ? belowRoot(child.route, root)
          : `${belowRoot(child.route, root)} (${child.package})`,
      summary: child.childCount
        ? `${childRow(child, owner).summary} (${docsBelow(child.childCount)})`
        : childRow(child, owner).summary,
    },
    ...(child.slots ?? []).flatMap(slot =>
      treeRows(slot.children, root, owner),
    ),
  ]);
}

/**
 * One child of a depth read with its text, under a heading for its level, and
 * its own children below it.
 * @param {import('../../../api/docs/docs.type.mjs').DocsNodeChild} child
 * @param {'full' | 'compact'} detail
 * @param {number} level
 * @param {string} root
 * @param {string} run
 * @param {string} owner the package that owns the read's namespace
 * @returns {string}
 */
function formatTreeChild(child, detail, level, root, run, owner) {
  // A child another package owns says which one.
  const place =
    child.package === owner
      ? belowRoot(child.route, root)
      : `${belowRoot(child.route, root)}, ${child.package}`;
  const parts = [`${treeHeading(child.title, level)} (${place})`];
  if (
    child.summary &&
    (child.kind === 'namespace' || child.kind === 'generic')
  ) {
    parts.push(prefixCliCommands(child.summary, run));
  }
  const content = formatTreeBlocks(child.content ?? [], detail, level - 2);
  if (content.length > 0) parts.push(content.join('\n\n'));
  parts.push(
    ...(child.sections ?? []).map(docSection =>
      formatTreeSection(docSection, detail, level + 1),
    ),
  );
  if (child.childCount) {
    parts.push(
      `${docsBelow(child.childCount)}: ${run} docs ${child.route} --depth 1`,
    );
  }
  for (const slot of child.slots ?? []) {
    parts.push(
      ...slot.children.map(each =>
        formatTreeChild(each, detail, level + 1, root, run, owner),
      ),
    );
  }
  return parts.join('\n\n');
}

/**
 * A depth read of a namespace: its intro, then each slot's docs as deep as
 * asked, one line each (brief) or with their text (compact, full). A typed doc
 * has nothing below it, so it reads as it always does.
 * @param {import('../../../api/docs/docs.type.mjs').DocsNode} node
 * @param {'full' | 'compact' | 'brief'} detail how the named node reads
 * @param {'full' | 'compact' | 'brief'} childDetail how each doc below reads
 * @param {string} run
 */
function emitTree(node, detail, childDetail, run) {
  if (node.kind !== 'namespace') {
    emitNode(node, detail, run);
    return;
  }
  /**
   * @param {import('../../../api/docs/docs.type.mjs').DocsNodeChild[]} children
   * @returns {string[]}
   */
  const routes = children =>
    children.flatMap(child => [
      child.route,
      ...(child.slots ?? []).flatMap(slot => routes(slot.children)),
    ]);
  const allBelow = node.slots
    .flatMap(slot => routes(slot.children))
    .every(route => route.startsWith(`${node.route}/`));
  const root = allBelow ? node.route : '';
  emit(
    section(node.title, wrapText(prefixCliCommands(node.summary, run))),
    record({package: node.package}),
    ...(node.content?.length
      ? [
          text(
            node.content
              .map(b => formatBlock(b, detail))
              .filter(Boolean)
              .join('\n\n'),
          ),
        ]
      : []),
    ...(node.childCount
      ? [
          text(
            `${docsBelow(node.childCount)}. Read them: ${run} docs ${node.route} --depth 1`,
          ),
        ]
      : []),
    ...node.slots.flatMap(slot => [
      ...(node.slots.length === 1 && slot.title === node.title
        ? []
        : [section(slot.title)]),
      childDetail === 'brief'
        ? records(treeRows(slot.children, root, node.package), {
            fields: ['name', 'summary'],
            layout: 'inline',
          })
        : code(
            slot.children
              .map(child =>
                formatTreeChild(child, childDetail, 2, root, run, node.package),
              )
              .join('\n\n'),
          ),
    ]),
    text(
      [
        ...(node.slots.length > 0
          ? [
              allBelow
                ? `Open one: ${run} docs ${node.route}/<name>`
                : `Open one: ${run} docs <name>`,
            ]
          : []),
        ...linkLines(node.links),
      ].join('\n'),
    ),
  );
}

/**
 * The moves a read offers (spec:AST-047), one runnable command per line: up to
 * the level it sits in, the item before and after it, and the docs it names.
 * @param {import('../../../api/docs/docs.type.mjs').DocsLinks | undefined} links
 * @returns {string[]}
 */
function linkLines(links) {
  if (!links) return [];
  return [
    `Up: ${formatCliCommand(links.up)}`,
    ...(links.previous
      ? [`Previous: ${formatCliCommand(links.previous)}`]
      : []),
    ...(links.next ? [`Next: ${formatCliCommand(links.next)}`] : []),
    ...(links.related ?? []).map(
      (command, i) =>
        `${i === 0 ? 'Related: ' : '         '}${formatCliCommand(command)}`,
    ),
  ];
}

/**
 * A section title naming the package that wrote it, once: a title an author
 * already ended with that package keeps its own.
 * @param {string} title
 * @param {string} pkg
 * @returns {string}
 */
function titledWithPackage(title, pkg) {
  const label = `(${pkg})`;
  return title.endsWith(label) ? title : `${title} ${label}`;
}

/**
 * What a topic or guide took the place of, and whose it was, as the line
 * read right after its `package:` line (INV28); nothing for any other read.
 * @param {{replaces?: string, replacedPackage?: string}} data
 * @returns {ReturnType<typeof text>[]}
 */
function replacedLine(data) {
  if (data.replaces == null || data.replacedPackage == null) return [];
  return [text(`replaces ${data.replacedPackage}'s ${data.replaces}`)];
}

/**
 * One line per other package whose sections a topic holds, at the top of the
 * read. Another package's section joins the end of the topic unless it names
 * where it goes (spec:AST-046 FR11), so a reader who reads only the start of a
 * long topic would never learn an installed integration added to it.
 * @param {ReadonlyArray<{id?: string, package?: string}>} sections each
 *   section as a read returns it, by the key a section read takes
 * @param {string} owner the package that owns the topic
 */
function addedSectionLines(sections, owner) {
  /** @type {Map<string, string[]>} */
  const byPackage = new Map();
  for (const each of sections) {
    if (each.id == null || each.package == null || each.package === owner) {
      continue;
    }
    byPackage.set(each.package, [
      ...(byPackage.get(each.package) ?? []),
      each.id,
    ]);
  }
  return [...byPackage].map(([pkg, ids]) =>
    text(`sections from ${pkg}: ${ids.join(', ')}`),
  );
}

/**
 * A topic's section index: what the topic is, one line per section with the
 * key to read it by, and how to read further.
 * @param {import('../../../api/docs/docs.type.mjs').DocsIndex} index
 * @param {string} owner the package that owns the topic
 * @param {string} run
 */
function emitIndex(index, owner, run) {
  emit(
    section(
      index.title,
      index.description ? wrapText(index.description) : undefined,
    ),
    record({package: owner}),
    ...replacedLine(index),
    ...addedSectionLines(index.sections, owner),
    // Summaries wrap rather than being cut: the summary is how a reader picks
    // the one section to open. A section another package wrote says which one.
    records(
      index.sections.map(s => {
        const shown = {...s, summary: prefixCliCommands(s.summary ?? '', run)};
        return s.package === owner
          ? shown
          : {...shown, title: titledWithPackage(s.title, s.package)};
      }),
      {
        fields: ['id', 'title', 'summary'],
        layout: 'inline',
      },
    ),
    text(
      [
        `Read one section: ${run} docs ${index.name} <section>`,
        `Read everything:  ${run} docs ${index.name} --full`,
        ...linkLines(index.links),
      ].join('\n'),
    ),
  );
}

/**
 * The mark a listed doc row opens with: an experimental doc is marked as help
 * marks an experimental command, so a reader cannot take it for a stable doc,
 * unless its own summary already opens by saying so. Every docs list that
 * marks a row asks here, so the namespace view and the `--depth` list agree.
 * @param {string | undefined} stability
 * @param {string} summary
 * @returns {'[experimental] ' | ''}
 */
function experimentalMark(stability, summary) {
  return stability === 'experimental' && !/^experimental\b/iu.test(summary)
    ? '[experimental] '
    : '';
}

/**
 * One child row of a namespace. Namespace and guide route names are already
 * readable, so repeating their titles adds noise (`start-a-template  Start a
 * template`). Typed docs keep a distinct title when it carries the real symbol
 * name (`assert-response  assertResponse()`).
 * @param {import('../../../api/docs/docs.type.mjs').DocsNodeChild} child
 * @param {string} owner the package that owns the namespace
 * @returns {{name: string, summary: string, experimental: boolean}}
 */
function childRow(child, owner) {
  const titleAddsIdentity =
    child.kind !== 'namespace' &&
    child.kind !== 'generic' &&
    child.title !== child.name;
  return {
    // A child another package owns says which one.
    name:
      child.package === owner ? child.name : `${child.name} (${child.package})`,
    summary: prefixCliCommands(
      `${experimentalMark(child.stability, child.summary)}${
        titleAddsIdentity ? `${child.title}: ${child.summary}` : child.summary
      }`,
      getCliInvocation(),
    ),
    experimental: child.stability === 'experimental',
  };
}

/**
 * One node of the docs tree. A namespace lists each slot's children, one level
 * down, with the command to open one; a typed doc prints its content. Both end
 * with the way back up.
 * @param {import('../../../api/docs/docs.type.mjs').DocsNode} node
 * @param {'full' | 'compact' | 'brief'} detail
 * @param {string} run
 */
function emitNode(node, detail, run) {
  if (node.kind === 'namespace') {
    emit(
      section(node.title, wrapText(prefixCliCommands(node.summary, run))),
      record({package: node.package}),
      // A namespace may author intro `blocks`; they render above its children,
      // prose wrapped like the summary.
      ...(node.content?.length
        ? [
            text(
              node.content
                .map(b =>
                  b.type === 'prose'
                    ? wrapText(formatBlock(b, detail) ?? '')
                    : formatBlock(b, detail),
                )
                .filter(Boolean)
                .join('\n\n'),
            ),
          ]
        : []),
      ...node.slots.flatMap(slot => [
        // A namespace with one slot titled like itself needs no second heading.
        ...(node.slots.length === 1 && slot.title === node.title
          ? []
          : [section(slot.title)]),
        records(
          slot.children.map(child => childRow(child, node.package)),
          {
            fields: ['name', 'summary'],
            layout: 'inline',
            // Stable rows set the column, so an experimental entry changes no
            // stable line (spec:AST-017 FR27); a long experimental name
            // overhangs. A slot of experimental entries only sizes from them.
            sizesColumn: row =>
              !row.experimental ||
              slot.children.every(child => child.stability === 'experimental'),
          },
        ),
      ]),
      text(
        [
          // A child's route is its parent's route and its name, except a flat
          // topic in a topic level, which keeps its own name.
          node.slots.every(slot =>
            slot.children.every(child =>
              child.route.startsWith(`${node.route}/`),
            ),
          )
            ? `Open one: ${run} docs ${node.route}/<name>`
            : `Open one: ${run} docs <name>`,
          ...linkLines(node.links),
        ].join('\n'),
      ),
    );
    return;
  }
  emit(
    record({package: node.package}),
    code(formatSection({title: node.title, content: node.content}, detail)),
    text(linkLines(node.links).join('\n')),
  );
}

/**
 * What the run answered with. A named topic (or one of its sections) resolves
 * or throws, so it is always a direct match of one doc; the bare form lists
 * every topic there is.
 *
 * @param {import('../../../api/docs/docs.type.mjs').DocsListResponse
 *   | import('../../../api/docs/docs.type.mjs').DocsIndexResponse
 *   | import('../../../api/docs/docs.type.mjs').DocsDetailResponse
 *   | import('../../../api/docs/docs.type.mjs').DocsDetailSectionResponse
 *   | import('../../../api/docs/docs.type.mjs').DocsNodeResponse
 *   | import('../../../api/docs/docs.type.mjs').DocsSkillsResponse
 *   | import('../../../api/docs/docs.type.mjs').DocsSkillResponse} result
 * @returns {import('../../../foundation/debug/command-result.mjs').CommandResult}
 */
function summarize(result) {
  return result.type === 'docs.list' || result.type === 'docs.skills'
    ? resultSet({count: result.data.length, resultKind: 'doc'})
    : resultSet({count: 1, resultKind: 'doc', directMatch: true});
}

// ─── Command ─────────────────────────────────────────────────────────────────

/**
 * Every namespace of the list and, where a `--depth` read carried them, the
 * docs below it, in reading order and in one flat list: each row's `topic` is
 * the route that opens it, so the depth of a row never changes how a reader
 * uses it, and each names the package that owns it.
 * @param {Array<import('../../../api/docs/docs.type.mjs').DocsListNamespace | import('../../../api/docs/docs.type.mjs').DocsListChild>} rows
 * @returns {Array<{topic: string, description: string, package: string}>}
 */
function flattenNamespaces(rows) {
  return rows.flatMap(row => [
    {
      topic: row.topic,
      description: `${experimentalMark(
        'stability' in row ? row.stability : undefined,
        row.description,
      )}${row.description}`,
      package: row.package,
    },
    ...flattenNamespaces(row.children ?? []),
  ]);
}

/**
 * @param {import('commander').Command} program
 */
export function registerDocs(program) {
  defineCommand(program, docsCommand, {
    fn: docsFn,
    action: async (
      /** @type {string | undefined} */ topic,
      /** @type {string | undefined} */ sectionName,
      /** @type {{list?: boolean, index?: boolean, full?: boolean, depth?: string}} */ options = {},
    ) => {
      const run = getCliInvocation();
      const lang = program.opts().lang || null;
      const zh = program.opts().zh || false;
      const dense = program.opts().dense || false;
      const detail = program.opts().detail || 'full';
      const json = program.opts().json || false;

      if (options.index && options.full) {
        return cliError(
          'Ask for the section list or the whole topic, not both: --index and --full cannot both be set.',
          {code: ERROR_CODES.ERR_INVALID_ARGUMENT},
        );
      }
      /** @type {number | 'all' | undefined} */
      let depth;
      if (options.depth != null) {
        if (options.depth === 'all') depth = 'all';
        else if (/^\d+$/.test(options.depth)) depth = Number(options.depth);
        else {
          return cliError(
            `--depth takes a number of levels (0, 1, 2, ...) or all, not "${options.depth}".`,
            {code: ERROR_CODES.ERR_INVALID_ARGUMENT},
          );
        }
      }
      // With --depth, --detail is how much of each doc below shows; left at
      // its default, each is one line.
      const childDetail =
        program.getOptionValueSource('detail') === 'default' ? 'brief' : detail;
      // A text read prints a topic whole, as JSON and docs() do: agents act
      // on the first read, and most never open a section from an index. Only
      // a topic whose whole text is over WHOLE_READ_MAX_BYTES lists its
      // sections instead. --index always lists them, --full always prints
      // the whole topic, and the dense variant is written to be read whole.
      const mayList =
        !json &&
        !options.full &&
        !dense &&
        lang !== 'dense' &&
        sectionName == null;
      let result;
      try {
        result = await docsApi(topic, sectionName, {
          lang,
          zh,
          dense,
          list: options.list,
          index: Boolean(options.index),
          ...(depth != null ? {depth, detail: childDetail} : {}),
        });
        if (
          mayList &&
          !options.index &&
          result.type === 'docs.detail' &&
          result.data.sections.length > 1 &&
          Buffer.byteLength(formatReferenceFull(result.data, detail), 'utf8') >
            WHOLE_READ_MAX_BYTES
        ) {
          result = await docsApi(topic, sectionName, {lang, zh, index: true});
        }
      } catch (e) {
        // docs API throws structured errors with {name, reason} suggestions —
        // pass them through untouched so the CLI envelope matches the API.
        const err =
          /** @type {import('../../../api/error.mjs').AstryxError} */ (e);
        return cliError(err.message, {
          suggestions: err.suggestions || [],
          code: err.code,
        });
      }

      const answered = summarize(result);
      if (json) {
        jsonOut(result);
        return answered;
      }

      switch (result.type) {
        case 'docs.list': {
          // The text view mirrors the JSON list, with the docs tree's
          // namespaces (`meta.namespaces`) first under their own heading: that
          // is where the CLI's own docs start, and a namespace reads
          // differently from a topic. With --depth each branch is flattened
          // into the same list, so every line is a route a reader can pass
          // straight back to `docs`.
          const namespaces = flattenNamespaces(result.meta?.namespaces ?? []);
          const topics = result.data;
          emit(
            ...(namespaces.length > 0
              ? [
                  section('Docs tree'),
                  records(namespaces, {
                    fields: ['topic', 'description', 'package'],
                    layout: 'inline',
                  }),
                ]
              : []),
            section('Topics'),
            records(topics, {
              fields: ['topic', 'description', 'package'],
              layout: 'inline',
            }),
            text(
              [
                `Usage: ${run} docs <topic>                  read a topic`,
                `       ${run} docs <topic> --index          list a topic's sections`,
                `       ${run} docs <topic> <section>        read one section`,
                `       ${run} docs cli/api                  go down the docs tree one level at a time`,
                `       ${run} docs cli --depth all          every doc below cli, one line each`,
                `With --json, a topic returns its whole doc; add --index for its section list.`,
              ].join('\n'),
            ),
            // A package whose doc files did not load has no topics here; say
            // so, and where to look, instead of leaving them silently missing.
            ...(result.meta?.notLoaded?.length
              ? [
                  section('Not loaded'),
                  records(result.meta.notLoaded, {
                    fields: ['package', 'message'],
                    layout: 'inline',
                  }),
                  text(
                    `Run \`${run} doctor integration docs\` in that package to see every problem.`,
                  ),
                ]
              : []),
          );
          break;
        }

        case 'docs.index': {
          emitIndex(result.data, result.package, run);
          break;
        }

        case 'docs.detail': {
          const owner = result.package;
          emit(
            record({package: owner}),
            ...replacedLine(result.data),
            ...addedSectionLines(result.data.sections, owner),
            code(
              formatReferenceFull(
                {
                  ...result.data,
                  // A section another package wrote says which one.
                  sections: result.data.sections.map(s =>
                    s.package === owner
                      ? s
                      : {...s, title: titledWithPackage(s.title, s.package)},
                  ),
                },
                detail,
              ),
            ),
            text(
              [
                // A whole read ends with its moves too: down to one section
                // and to the section list, then up and across.
                ...(result.data.sections.length > 1
                  ? [
                      `Read one section: ${run} docs ${result.data.name} <section>`,
                      `List its sections: ${run} docs ${result.data.name} --index`,
                    ]
                  : []),
                ...linkLines(result.data.links),
              ].join('\n'),
            ),
          );
          break;
        }

        case 'docs.detail.section': {
          // One section ends with its moves: up to its topic's index, and to
          // the sections before and after it.
          emit(
            record({package: result.package}),
            code(formatSection(result.data, detail)),
            text(linkLines(result.data.links).join('\n')),
          );
          break;
        }

        case 'docs.skills': {
          emit(
            section('Skills'),
            records(
              result.data.map(each => ({
                topic: `skills/${each.name}`,
                description: each.description,
                package: each.package,
              })),
              {fields: ['topic', 'description', 'package'], layout: 'inline'},
            ),
            text(`Read one: ${run} docs skills/<name>`),
            // A skill a package declares but this run left out: say why.
            ...(result.meta?.notes?.length
              ? [
                  section('Left out'),
                  records(result.meta.notes, {fields: ['package', 'message'], layout: 'inline'}),
                ]
              : []),
          );
          break;
        }

        case 'docs.skill': {
          emit(
            record({package: result.package, skill: result.data.name}),
            code(result.data.text),
            text(`Up: ${run} docs skills`),
          );
          break;
        }

        case 'docs.node': {
          if (depth != null) emitTree(result.data, detail, childDetail, run);
          else emitNode(result.data, detail, run);
          break;
        }
      }
      return answered;
    },
  });
}
