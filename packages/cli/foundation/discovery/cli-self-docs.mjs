// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The CLI's own typed docs, read by their `namespace`: every command,
 * API function, schema, and enum doc the CLI ships names the group that reads
 * it. The docs tree adopts `cli/commands` and `cli/api` (spec:AST-046); the
 * authoring topic reads `authoring` from its own list.
 *
 * @input The command, function, schema, and enum docs under
 *   clients/cli/commands, api, authoring, and foundation.
 * @output {@link loadCliSelfDocs} for the docs tree, {@link cliDocSection} for
 *   what `astryx docs <route>` prints for one of them, and
 *   {@link auditCliSelfDocs}, which `astryx doctor` runs.
 * @position foundation/discovery. The tree (doc-compiler/tree.mjs) gives each
 *   doc its route; this module only loads the docs and renders one.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {CLI_ROOT} from '../fs/paths.mjs';
import {readDocView} from '../doc-compiler/read.mjs';
import {AUTHORING_SELF_DOCS, selfDocSection} from './authoring-self-docs.mjs';
import {
  DOC_OUTPUT_BUDGET_BYTES,
  oversizedDocSections,
} from './docs-output-budget.mjs';
import {routeSegment} from './docs-section-key.mjs';
import {formatCliCommand} from '../env/package-manager.mjs';

/** The directories, relative to the CLI root, that hold the CLI's own docs. */
export const CLI_SELF_DOC_DIRS = [
  'clients/cli/commands',
  'api',
  'authoring',
  'foundation',
];

/** The doc kinds that declare a namespace. */
const NAMESPACED_KINDS = new Set(['command', 'function', 'schema', 'enum']);

/**
 * Every namespace a CLI doc may declare, and what reads it. The docs tree
 * adopts `cli/commands` (under `cli/commands`) and `cli/api` (under
 * `cli/api/<kind>s`); the field reference (`astryx docs authoring/field-reference`)
 * reads `authoring` from its list.
 * @type {Record<string, {reader: 'tree' | 'authoring'}>}
 */
export const CLI_DOC_NAMESPACES = {
  'cli/commands': {reader: 'tree'},
  'cli/api': {reader: 'tree'},
  authoring: {reader: 'authoring'},
};

/** Blocks a doc's notes may carry that a topic section can render. */
const TOPIC_BLOCKS = new Set(['prose', 'list', 'code', 'heading', 'table']);

/**
 * Every `*.doc.mjs` under the CLI's doc directories, relative to `root` and
 * sorted. Fixture, test, and dependency directories are skipped.
 * @param {string} [root]
 * @returns {string[]}
 */
export function discoverCliSelfDocSources(root = CLI_ROOT) {
  /** @type {string[]} */
  const found = [];
  /** @param {string} dir */
  const walk = dir => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      if (
        entry.name === 'node_modules' ||
        entry.name.startsWith('__') ||
        entry.name.startsWith('.')
      ) {
        continue;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.doc.mjs')) {
        found.push(path.relative(root, full).split(path.sep).join('/'));
      }
    }
  };
  for (const dir of CLI_SELF_DOC_DIRS) walk(path.join(root, dir));
  return found.sort();
}

/**
 * Read each doc through the compiler and keep the kinds that declare a
 * namespace. One that fails is reported, never thrown, so one bad file cannot
 * take the rest of the topic down with it.
 * @param {string[]} [sources]
 * @param {string} [root]
 * @returns {Promise<{loaded: {source: string, doc: any}[], failed: {source: string, error: string}[]}>}
 */
export async function loadCliSelfDocs(
  sources = discoverCliSelfDocSources(),
  root = CLI_ROOT,
) {
  const loaded = [];
  const failed = [];
  for (const source of sources) {
    try {
      const doc = await readDocView(path.join(root, source), {
        root: 'self-docs',
        loader: 'native',
      });
      if (!NAMESPACED_KINDS.has(doc?.type)) continue;
      if (typeof doc.name !== 'string' || doc.name === '') {
        throw new Error('exports no doc with a name');
      }
      loaded.push({source, doc});
    } catch (error) {
      failed.push({
        source,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return {loaded, failed};
}

/**
 * What cross-links need: the loaded function docs by name, the command names,
 * and the route the docs tree gave a doc, if it gave one.
 * @typedef {object} CliDocIndex
 * @property {Map<string, any>} functions
 * @property {Set<string>} commands
 * @property {(kind: string, name: string) => string | null} route
 */

/**
 * @param {any[]} docs every loaded CLI typed doc
 * @param {(kind: string, name: string) => string | null} [route]
 * @returns {CliDocIndex}
 */
export function cliDocIndex(docs, route = () => null) {
  return {
    functions: new Map(
      docs.filter(d => d.type === 'function').map(d => [d.name, d]),
    ),
    commands: new Set(docs.filter(d => d.type === 'command').map(d => d.name)),
    route,
  };
}

/** @param {unknown} value */
function defaultText(value) {
  if (value === undefined || value === false || value === '') return null;
  if (Array.isArray(value)) return value.length > 0 ? value.join(' ') : null;
  return String(value);
}

/**
 * @param {any} cmd
 * @returns {string}
 */
function usage(cmd) {
  const args = (cmd.args ?? []).map((/** @type {any} */ arg) => {
    const name = arg.variadic ? `${arg.name}...` : arg.name;
    return arg.required ? `<${name}>` : `[${name}]`;
  });
  return ['astryx', cmd.name, ...args].join(' ');
}

/**
 * The text for a command option or argument: its own, or else the text of the
 * API parameter it maps to, as `--help` shows.
 * @param {{description?: string, param?: string}} entry
 * @param {any} fn the FunctionDoc the command calls, if any
 * @returns {string}
 */
function entryText(entry, fn) {
  if (typeof entry.description === 'string' && entry.description !== '') {
    return entry.description;
  }
  const param = (fn?.params ?? []).find(
    (/** @type {any} */ p) => p.name === entry.param,
  );
  return typeof param?.description === 'string' ? param.description : '';
}

/**
 * `text`, ending in a full stop when more text follows it in the same cell.
 * @param {string} text
 * @param {boolean} more
 */
function sentence(text, more) {
  return more && text !== '' && !/[.!?:]$/.test(text) ? `${text}.` : text;
}

/**
 * The line a command doc prints for what it does outside a project (spec
 * AST-081 FR4). A group that only holds subcommands declares nothing and
 * prints nothing.
 * @type {Record<string, string>}
 */
const OUTSIDE_PROJECT_TEXT = {
  same: "Outside a project (`same`): it answers as it would in a new project on this release, reading this release's Core, as it does in a project with nothing installed: the one installed beside the CLI, else one in the per-user cache, which a global install downloads in the background after a command run online (in CI, the first command that needs it downloads it).",
  refuse:
    'Outside a project (`refuse`): it writes nothing and fails, naming the app project or integration package it needs.',
  own: 'Outside a project (`own`): it does what the description above says it does outside a project.',
};

/** @param {any[]} notes */
function noteBlocks(notes) {
  return (notes ?? []).filter(note => TOPIC_BLOCKS.has(note?.type));
}

/**
 * What `astryx docs <route>` prints for one command doc.
 * @param {any} cmd
 * @param {CliDocIndex} index
 */
function commandSection(cmd, index) {
  const fn = cmd.fn == null ? undefined : index.functions.get(cmd.fn);
  /** @type {any[]} */
  const content = [{type: 'prose', text: cmd.summary}];
  if (cmd.description) content.push({type: 'prose', text: cmd.description});
  content.push({type: 'code', lang: 'bash', code: usage(cmd)});
  const args = cmd.args ?? [];
  if (args.length > 0) {
    content.push({
      type: 'table',
      headers: ['Argument', 'Description'],
      rows: args.map((/** @type {any} */ arg) => [
        `\`${arg.name}\``,
        entryText(arg, fn),
      ]),
    });
  }
  const options = cmd.options ?? [];
  if (options.length > 0) {
    content.push({
      type: 'table',
      headers: ['Option', 'Description'],
      rows: options.map((/** @type {any} */ option) => {
        const extra = [
          option.choices?.length
            ? `One of: ${option.choices.map((/** @type {string} */ c) => `\`${c}\``).join(', ')}.`
            : null,
          defaultText(option.default) == null
            ? null
            : `Default: \`${defaultText(option.default)}\`.`,
        ].filter(Boolean);
        return [
          `\`${option.flag}\``,
          [sentence(entryText(option, fn), extra.length > 0), ...extra]
            .filter(Boolean)
            .join(' '),
        ];
      }),
    });
  }
  const examples = (cmd.examples ?? []).flatMap((/** @type {any} */ e) =>
    e.label ? [`# ${e.label}`, e.cli] : [e.cli],
  );
  if (examples.length > 0) {
    content.push({type: 'code', lang: 'bash', code: examples.join('\n')});
  }
  const exitCodes = cmd.exitCodes ?? [];
  if (exitCodes.length > 0) {
    content.push({
      type: 'table',
      headers: ['Exit code', 'When'],
      rows: exitCodes.map((/** @type {any} */ e) => [String(e.code), e.when]),
    });
  }
  const outside = OUTSIDE_PROJECT_TEXT[cmd.outsideProject];
  if (outside) content.push({type: 'prose', text: outside});
  // Links name docs by identity; the route in each command is derived when
  // the doc is read (spec:AST-047 FR9).
  const subcommands = (cmd.subcommands ?? []).filter(
    (/** @type {string} */ sub) => index.commands.has(`${cmd.name} ${sub}`),
  );
  if (subcommands.length > 0) {
    content.push({
      type: 'list',
      style: 'unordered',
      items: subcommands.map(
        (/** @type {string} */ sub) =>
          `\`astryx ${cmd.name} ${sub}\`: {@link command:${cmd.name} ${sub}}`,
      ),
    });
  }
  if (fn != null) {
    content.push({
      type: 'prose',
      text: `It runs \`${fn.name}()\` from \`${fn.importPath}\`. Read it with {@link function:${fn.name}}.`,
    });
  }
  content.push(...noteBlocks(cmd.notes));
  return {
    id: routeSegment(cmd.name),
    title: cmd.displayName ?? `astryx ${cmd.name}`,
    content,
  };
}

/**
 * The command doc a command line belongs to: its longest leading words that
 * name one (`integration add theme` is the `integration add` command).
 * @param {string} line
 * @param {Set<string>} commands
 * @returns {string | null}
 */
function commandDocName(line, commands) {
  const words = line.trim().split(/\s+/);
  for (let n = words.length; n > 0; n--) {
    const name = words.slice(0, n).join(' ');
    if (commands.has(name)) return name;
  }
  return null;
}

/**
 * What `astryx docs <route>` prints for one API function doc.
 * @param {any} fn
 * @param {CliDocIndex} index
 */
function functionSection(fn, index) {
  /** @type {any[]} */
  const content = [{type: 'prose', text: fn.summary ?? fn.description ?? ''}];
  if (fn.summary && fn.description) {
    content.push({type: 'prose', text: fn.description});
  }
  if (fn.signature) {
    content.push({type: 'code', lang: 'ts', code: fn.signature});
  }
  if (fn.importPath) {
    content.push({type: 'prose', text: `Import it from \`${fn.importPath}\`.`});
  }
  const params = fn.params ?? [];
  if (params.length > 0) {
    // A Default column only when some parameter declares a default, so a
    // function with none keeps a three-column table.
    const defaults = params.some(
      (/** @type {any} */ p) =>
        typeof p.default === 'string' && p.default !== '',
    );
    content.push({
      type: 'table',
      headers: defaults
        ? ['Parameter', 'Type', 'Default', 'Description']
        : ['Parameter', 'Type', 'Description'],
      rows: params.map((/** @type {any} */ p) => [
        `\`${p.name}\`${p.required ? ' (required)' : ''}`,
        `\`${p.type ?? ''}\``,
        ...(defaults ? [p.default ?? ''] : []),
        p.description ?? '',
      ]),
    });
  }
  const returns = fn.returns ?? [];
  if (returns.length > 0) {
    content.push({
      type: 'table',
      headers: ['Returns', 'Description'],
      rows: returns.map((/** @type {any} */ r) => [
        `\`${r.name ? `${r.name}: ` : ''}${r.type}\``,
        r.description ?? '',
      ]),
    });
  }
  const throws = fn.throws ?? [];
  if (throws.length > 0) {
    content.push({
      type: 'table',
      headers: ['Throws', 'When'],
      rows: throws.map((/** @type {any} */ t) => [`\`${t.code}\``, t.when]),
    });
  }
  for (const example of fn.examples ?? []) {
    if (typeof example?.code !== 'string' || example.code.trim() === '') {
      continue;
    }
    content.push({
      type: 'code',
      lang: 'ts',
      ...(example.label ? {label: example.label} : {}),
      code: example.code,
    });
  }
  const commandDoc =
    fn.command == null ? null : commandDocName(fn.command, index.commands);
  if (commandDoc != null) {
    content.push({
      type: 'prose',
      text: `\`astryx ${fn.command}\` runs it. Read it with {@link command:${commandDoc}}.`,
    });
  }
  return {
    id: routeSegment(fn.name),
    title: fn.displayName ?? `${fn.name}()`,
    content,
  };
}

/**
 * What `astryx docs <route>` prints for one enum doc.
 * @param {any} doc
 */
function enumSection(doc) {
  return {
    id: routeSegment(doc.name),
    title: doc.displayName ?? doc.name,
    content: [
      {type: 'prose', text: doc.description},
      {
        type: 'table',
        headers: ['Value', 'Meaning'],
        // An experimental value is documented on its feature's experimental
        // route, never in the stable enum's table (spec:AST-017 FR27).
        rows: (doc.members ?? [])
          .filter((/** @type {any} */ m) => m.stability !== 'experimental')
          .map((/** @type {any} */ m) => [
            `\`${m.value}\``,
            m.deprecated
              ? `${m.description} Deprecated: ${m.deprecated}`
              : m.description,
          ]),
      },
    ],
  };
}

/**
 * What `astryx docs <route>` prints for one icon definition: its description,
 * its words, whether it is built in, and the command
 * that finds the icon each installed set draws for it.
 * @param {any} doc
 */
function iconDefinitionSection(doc) {
  /** @type {string[][]} */
  const rows = [
    [
      'Words',
      doc.words.map((/** @type {string} */ w) => `\`${w}\``).join(', '),
    ],
  ];
  if (doc.builtIn) {
    rows.push([
      'Built in',
      'Yes: every icon set maps it, and Core renders it.',
    ]);
  }
  const content = [
    {type: 'prose', text: doc.description},
    {type: 'table', headers: ['Field', 'Value'], rows},
    {
      type: 'prose',
      text: `An icon set registers the icon that draws this definition in its data file: \`"map": {"${doc.name}": "<icon id>"}\`. Find it in each installed set: \`astryx experimental icon ${doc.name}\`.`,
    },
    {
      type: 'prose',
      text: 'Icon definitions are experimental: they may change or be removed in a patch release.',
    },
  ];
  return {id: routeSegment(doc.name), title: doc.name, content};
}

/**
 * What `astryx docs <route>` prints for one CLI typed doc: its title and the
 * blocks of its content, with cross-links to the routes the tree gave.
 * @param {any} doc
 * @param {CliDocIndex} index
 * @returns {{id: string, title: string, content: any[]}}
 */
export function cliDocSection(doc, index) {
  if (doc.type === 'command') return commandSection(doc, index);
  if (doc.type === 'icon-definition') return iconDefinitionSection(doc);
  if (doc.type === 'function') return functionSection(doc, index);
  if (doc.type === 'enum') return enumSection(doc);
  if (doc.type === 'namespace')
    return {
      id: routeSegment(doc.name),
      title: doc.title,
      content: doc.blocks ?? [],
    };
  return {...selfDocSection(doc), id: routeSegment(doc.name)};
}

/**
 * What stands between a CLI doc and a reader: a missing namespace, one nothing
 * reads, one that disagrees with the authoring topic's list, a doc that fails
 * to load, and a tree leaf too large for one read. Whether the tree gives
 * every `cli/...` doc a route is the docs-tree check's job.
 * @param {{root?: string, sources?: string[], budget?: number, authoringSources?: string[]}} [options]
 * @returns {Promise<{
 *   docs: number,
 *   tree: number,
 *   authoring: number,
 *   experimental: {docs: number, tree: number, authoring: number},
 *   missing: string[],
 *   unknown: {source: string, namespace: string}[],
 *   misfiled: {source: string, message: string}[],
 *   failed: {source: string, error: string}[],
 *   oversized: {key: string, title: string, bytes: number}[],
 * }>}
 */
export async function auditCliSelfDocs({
  root = CLI_ROOT,
  sources,
  budget = DOC_OUTPUT_BUDGET_BYTES,
  authoringSources = AUTHORING_SELF_DOCS,
} = {}) {
  const {loaded, failed} = await loadCliSelfDocs(
    sources ?? discoverCliSelfDocSources(root),
    root,
  );
  const listed = new Set(authoringSources.map(source => `authoring/${source}`));
  /** @type {string[]} */
  const missing = [];
  /** @type {{source: string, namespace: string}[]} */
  const unknown = [];
  /** @type {{source: string, message: string}[]} */
  const misfiled = [];
  /** @type {any[]} */
  const treeDocs = [];
  let authoring = 0;
  for (const {source, doc} of loaded) {
    const namespace = doc.namespace;
    if (typeof namespace !== 'string' || namespace === '') {
      missing.push(source);
      continue;
    }
    if (!Object.hasOwn(CLI_DOC_NAMESPACES, namespace)) {
      unknown.push({source, namespace});
      continue;
    }
    const inAuthoring = listed.has(source);
    if (CLI_DOC_NAMESPACES[namespace].reader === 'authoring') {
      if (inAuthoring) authoring++;
      else {
        misfiled.push({
          source,
          message: `${source} has namespace "authoring", but \`${formatCliCommand('docs authoring/field-reference')}\` does not list it`,
        });
      }
    } else if (inAuthoring) {
      misfiled.push({
        source,
        message: `${source} is read in \`${formatCliCommand('docs authoring/field-reference')}\`, but its namespace is "${namespace}"`,
      });
    } else {
      treeDocs.push(doc);
    }
  }
  const index = cliDocIndex(loaded.map(entry => entry.doc));
  // Experimental docs (spec:AST-017 FR27) are audited like every other, and
  // counted apart, so the stable counts stay what they were.
  const experimental = (/** @type {any} */ doc) =>
    doc?.stability === 'experimental';
  return {
    docs: loaded.length,
    tree: treeDocs.length,
    authoring,
    experimental: {
      docs: loaded.filter(entry => experimental(entry.doc)).length,
      tree: treeDocs.filter(experimental).length,
      authoring: loaded.filter(
        entry => listed.has(entry.source) && experimental(entry.doc),
      ).length,
    },
    missing,
    unknown,
    misfiled,
    failed,
    oversized: oversizedDocSections(
      treeDocs.map(doc => cliDocSection(doc, index)),
      budget,
    ),
  };
}
