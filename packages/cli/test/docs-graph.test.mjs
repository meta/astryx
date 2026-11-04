// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The docs graph stays walkable (spec:AST-047, spec:AST-046).
 *
 * The walk starts at the topic list and opens every topic, topic index,
 * section, namespace, and typed doc the CLI ships, the way a reader would: it
 * follows each child and each move a read offers (`up`, `previous`, `next`),
 * and fails on any move that does not open. It then checks the moves agree
 * with each other, opens every `astryx docs ...` command written in a doc's
 * own text, and opens every search hit's command and parent. Nothing stores
 * the moves, so this is what proves they stay right as docs are added, moved,
 * or removed.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, it, expect, beforeAll} from 'vitest';
import {docs} from '../api/docs/docs.mjs';
import {typedEdges} from '../api/docs/node/node.mjs';
import {
  builtinCatalog,
  docsLinkProblems,
  projectTree,
} from '../api/docs/_adapter.mjs';
import {loadDocsCatalog} from '../api/docs/_adapter.mjs';
import {search} from '../api/search/search.mjs';
import {loadDocsTree} from '../foundation/doc-compiler/tree.mjs';
import {
  discoverCliSelfDocSources,
  loadCliSelfDocs,
} from '../foundation/discovery/cli-self-docs.mjs';
import {routeSegment} from '../foundation/discovery/docs-section-key.mjs';
import {EXPERIMENTAL_AUTHORING_ROUTE} from '../foundation/discovery/authoring-self-docs.mjs';
import {generateCompressedIndex} from '../foundation/agent-docs/agent-docs.mjs';
import {program, JSON_SUPPORTED} from '../clients/cli/index.mjs';
import {buildManifest} from '../clients/cli/lib/manifest.mjs';
import {runCli} from '../test-utils/run-cli.mjs';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SLOW = 180_000;
const TOP = 'astryx docs';

/**
 * Open one `astryx docs ...` command through the API, as the CLI would.
 * @param {string} command
 */
function open(command) {
  const words = command.trim().split(/\s+/);
  if (words[0] !== 'astryx' || words[1] !== 'docs') {
    throw new Error(`not a docs command: ${command}`);
  }
  const rest = words.slice(2);
  /** @type {string[]} */
  const positional = [];
  /** @type {Record<string, string>} */
  const valued = {};
  for (let i = 0; i < rest.length; i++) {
    const word = rest[i];
    if (word === '--depth' || word === '--detail' || word === '--lang') {
      valued[word.slice(2)] = rest[++i];
    } else if (!word.startsWith('--')) {
      positional.push(word);
    }
  }
  const [topic, section] = positional;
  const depth =
    valued.depth == null
      ? undefined
      : valued.depth === 'all'
        ? 'all'
        : Number(valued.depth);
  return docs(topic, section, {
    index: rest.includes('--index'),
    full: rest.includes('--full'),
    ...(depth == null
      ? {}
      : {
          depth,
          ...(valued.detail
            ? {detail: /** @type {any} */ (valued.detail)}
            : {}),
        }),
  });
}

/**
 * Every place a read leads: its children, and its moves.
 * @param {any} res
 * @returns {Array<[string, string]>} [kind of move, command]
 */
function movesOf(res) {
  /** @type {Array<[string, string]>} */
  const out = [];
  const {type, data} = res;
  if (type === 'docs.list') {
    for (const entry of data) {
      out.push(['down', `${TOP} ${entry.topic}`]);
      out.push(['down', `${TOP} ${entry.topic} --index`]);
    }
    for (const entry of res.meta?.namespaces ?? []) {
      out.push(['down', `${TOP} ${entry.topic}`]);
    }
  }
  if (type === 'docs.node') {
    for (const slot of data.slots) {
      for (const child of slot.children) out.push(['down', `${TOP} ${child.route}`]);
    }
  }
  if (type === 'docs.index') {
    for (const section of data.sections) {
      out.push(['down', `${TOP} ${data.name} ${section.id}`]);
    }
  }
  for (const [kind, value] of Object.entries(data?.links ?? {})) {
    for (const command of [value].flat()) {
      out.push([kind, /** @type {string} */ (command)]);
    }
  }
  // Links between docs are moves too: each reference block, and each
  // workflow step's references.
  const blocks = [
    ...(data?.content ?? []),
    ...(data?.sections ?? []).flatMap((/** @type {any} */ s) => s.content ?? []),
  ];
  for (const block of blocks) {
    if (block?.type === 'reference' && block.link) {
      out.push(['reference', block.link.command]);
    }
    for (const step of block?.type === 'workflow' ? block.steps : []) {
      for (const link of step.links ?? []) {
        if (link) out.push(['reference', link.command]);
      }
    }
  }
  return out;
}

/**
 * The words a read says: prose, list items, and table cells.
 * @param {any} res
 * @returns {string[]}
 */
function textOf(res) {
  /** @type {string[]} */
  const out = [];
  /** @param {any[]} blocks */
  const scan = blocks => {
    for (const block of blocks ?? []) {
      if (block.type === 'prose' && block.text) out.push(block.text);
      if (block.type === 'list') {
        for (const item of block.items ?? []) {
          out.push(typeof item === 'string' ? item : (item?.text ?? ''));
        }
      }
      if (block.type === 'table') {
        for (const row of block.rows ?? []) out.push(...row.map(String));
      }
      if (block.type === 'code' && typeof block.code === 'string') {
        out.push(block.code);
      }
    }
  };
  const {type, data} = res;
  if (type === 'docs.detail') {
    out.push(data.description ?? '');
    for (const section of data.sections ?? []) scan(section.content);
  }
  if (type === 'docs.index') out.push(data.description ?? '');
  if (type === 'docs.detail.section') scan(data.content);
  if (type === 'docs.node') scan(data.content);
  return out;
}

/**
 * Every `astryx ...` command a text shows: in code ticks, or on a line of its
 * own (a code block line, or a hint line such as `Up: npx astryx docs cli`).
 * A hint's description, after two spaces or a `#`, is cut off.
 * @param {string} text
 * @returns {string[]}
 */
function shownCommands(text) {
  const RUN = '(?:npx |pnpm exec |pnpm dlx |yarn |bunx )?astryx(?: [^`\\n]*)?';
  /** @param {string} s */
  const clean = s => s.replace(/\s{2,}.*$/, '').replace(/\s+#.*$/, '').trim();
  /** @type {Set<string>} */
  const out = new Set();
  // A chain such as `astryx a && astryx b` is two commands; each is checked
  // on its own, so a flag of the second is never read as the first's.
  /** @param {string} s */
  const add = s => {
    for (const part of clean(s).split(/\s*(?:&&|\|\||;)\s*|\s+\|\s+/)) {
      if (new RegExp('^' + RUN + '$').test(part.trim())) out.add(part.trim());
    }
  };
  for (const m of text.matchAll(new RegExp('`(' + RUN + ')`', 'g'))) {
    add(m[1]);
  }
  for (const line of text.split('\n')) {
    const m = new RegExp('^\\s*(?:\\$\\s+|[A-Z][A-Za-z ]*:\\s+)?(' + RUN + ')$').exec(line);
    if (m) add(m[1]);
  }
  return [...out];
}

/**
 * The CLI's commands and options, from the live manifest: nothing here is a
 * list someone keeps.
 */
function cliSurface() {
  const manifest = buildManifest(program, {jsonSupported: JSON_SUPPORTED});
  /** @param {Array<{flag: string}>} options */
  const flagsOf = options => {
    /** @type {Map<string, boolean>} flag -> takes a value */
    const flags = new Map();
    for (const option of options ?? []) {
      const takes = /[<[]/.test(option.flag);
      for (const flag of option.flag.split(/[\s,]+/)) {
        if (flag.startsWith('-')) flags.set(flag, takes);
      }
    }
    return flags;
  };
  /** @type {Map<string, Map<string, boolean>>} */
  const commands = new Map();
  /** @type {Set<string>} groups that take a subcommand and no argument */
  const groups = new Set();
  /** @param {any[]} list */
  const add = list => {
    for (const command of list ?? []) {
      commands.set(command.name, flagsOf(command.options));
      if (command.subcommands?.length && !command.arguments?.length) {
        groups.add(command.name);
      }
      add(command.subcommands);
    }
  };
  add(manifest.commands);
  // Hidden commands (a package-script hook) are documented but left out of
  // the manifest; they are still real commands.
  for (const command of program.commands) {
    if (!(/** @type {any} */ (command)._hidden)) continue;
    commands.set(
      command.name(),
      flagsOf(command.options.map(option => ({flag: option.flags}))),
    );
  }
  return {commands, groups, global: flagsOf(manifest.globalOptions)};
}

/**
 * What is wrong with one shown command, or null: an unknown command, or an
 * option its command does not take. Positional arguments are not checked
 * here; `astryx docs` routes are, by the walk.
 * @param {string} shown
 * @param {ReturnType<typeof cliSurface>} surface
 * @returns {string | null}
 */
function problemWith(shown, {commands, groups, global}) {
  const words = shown.split(/\s+/);
  const rest = words.slice(words.indexOf('astryx') + 1).filter(Boolean);
  /** @param {Map<string, boolean>} flags @param {string} token */
  const known = (flags, token) => {
    const flag = token.split('=')[0];
    return (
      flag === '--help' ||
      flag === '-h' ||
      flags.has(flag) ||
      (flag.startsWith('--no-') && flags.has(`--${flag.slice(5)}`))
    );
  };
  let i = 0;
  while (i < rest.length && rest[i].startsWith('-')) {
    if (!known(global, rest[i])) return `unknown global option ${rest[i]}`;
    if (global.get(rest[i]) && !rest[i].includes('=')) i++;
    i++;
  }
  // `help` is Commander's own command; a placeholder names no command.
  if (i >= rest.length || rest[i] === 'help' || /^(?:[<[]|\.\.\.|…)/.test(rest[i])) return null;
  let name = null;
  for (let n = rest.length - i; n > 0; n--) {
    const candidate = rest.slice(i, i + n).join(' ');
    if (commands.has(candidate)) {
      name = candidate;
      i += n;
      break;
    }
  }
  if (name == null) return `unknown command "${rest[i]}"`;
  // A group takes a subcommand, so a word after it names one it lacks:
  // `astryx integration bogus` names a subcommand `integration` lacks.
  if (groups.has(name) && i < rest.length && /^[a-z]/.test(rest[i])) {
    return `\`astryx ${name}\` has no subcommand ${rest[i]}`;
  }
  const flags = new Map([...global, ...(commands.get(name) ?? [])]);
  for (; i < rest.length; i++) {
    const token = rest[i];
    if (!/^--?[a-zA-Z]/.test(token)) continue;
    if (!known(flags, token)) {
      return `\`astryx ${name}\` has no option ${token.split('=')[0]}`;
    }
    if (flags.get(token) && !token.includes('=')) i++;
  }
  return null;
}

/**
 * Commands a doc shows on purpose as wrong: the error codes they trigger. Each
 * must still appear in a doc, or the entry is stale.
 */
const WRONG_ON_PURPOSE = new Map([
  ['astryx bogus', 'the ERR_UNKNOWN_COMMAND example'],
  ['astryx theme bogus', 'the ERR_UNKNOWN_SUBCOMMAND example'],
]);

/**
 * Commands a doc shows that the CLI does not accept yet, each waiting on a
 * decision. An entry fails once the command works or no doc shows it, so it
 * cannot outlive the decision.
 */
const AWAITING_DECISION = new Map([
]);

/** The CLI's own reads whose hint lines show commands. */
const HINT_READS = [
  ['docs'],
  ['docs', 'cli'],
  ['docs', 'cli/api/functions/search'],
  ['docs', 'theme'],
  ['docs', 'authoring', 'codemods'],
  ['search', 'token-ref', '--type', 'doc'],
  ['--help'],
  ['docs', '--help'],
];

/** The `astryx docs ...` commands written in text, placeholders skipped. */
function docsCommandsIn(text) {
  /** @type {string[]} */
  const out = [];
  for (const m of text.matchAll(/`(?:npx |pnpm exec |yarn |bunx )?astryx docs( [^`]*)?`/g)) {
    const args = (m[1] ?? '').trim();
    if (/[<>…]|\.\.\.|\|/.test(args)) continue;
    out.push(args ? `${TOP} ${args}` : TOP);
  }
  // A code block line or a chain opens too, for the CLI's own tree. Other
  // routes there are an integration's topics, shown as examples.
  for (const shown of shownCommands(text)) {
    const m = /^(?:npx |pnpm exec |pnpm dlx |yarn |bunx )?astryx docs (cli(?:\/\S*)?(?: .*)?)$/.exec(shown);
    if (!m) continue;
    const args = m[1].replace(/\s--(?:detail|lang)\s+\S+/g, '').trim();
    if (/[<>…[\]]|\.\.\.|\|/.test(args)) continue;
    out.push(`${TOP} ${args}`);
  }
  return out;
}

describe('the docs graph', () => {
  /** @type {Map<string, any>} */
  const reads = new Map();
  /** @type {Array<[string, string, string]>} */
  const moves = [];
  /** @type {string[]} */
  const dead = [];

  beforeAll(async () => {
    const queue = [TOP];
    while (queue.length > 0) {
      const command = /** @type {string} */ (queue.shift());
      if (reads.has(command)) continue;
      let res;
      try {
        res = await open(command);
      } catch (e) {
        dead.push(`${command}: ${/** @type {Error} */ (e).message}`);
        reads.set(command, null);
        continue;
      }
      reads.set(command, res);
      for (const [kind, to] of movesOf(res)) {
        moves.push([command, kind, to]);
        if (!reads.has(to)) queue.push(to);
      }
    }
  }, SLOW);

  it('opens every move a read offers, from the top down', () => {
    expect(dead).toEqual([]);
    expect(reads.size).toBeGreaterThan(200);
  });

  it('reaches every node of the tree', async () => {
    const tree = await loadDocsTree();
    const missed = [...tree.nodes.values()]
      .map(node => `${TOP} ${node.route}`)
      .filter(command => !reads.get(command));
    expect(missed).toEqual([]);
  });

  it('reaches every doc file the CLI ships, and every doc file is one the CLI reads', async () => {
    const tree = await loadDocsTree();
    const reached = (/** @type {string} */ command) => Boolean(reads.get(command));
    /** @type {string[]} */
    const unreached = [];
    // Command, API, schema, enum, and authoring docs: a tree leaf, or a section
    // of the field reference, which `astryx docs authoring <name>` reads.
    const {loaded, failed} = await loadCliSelfDocs(discoverCliSelfDocSources(CLI), CLI);
    expect(failed).toEqual([]);
    // An experimental schema is a section of its own experimental route
    // instead (spec:AST-084 FR0); that route is a tree node, and one read
    // returns all its sections.
    const sectionsOf = (/** @type {string} */ route) =>
      (reads.get(`${TOP} ${route} --index`) ?? reads.get(`${TOP} ${route}`))
        ?.data.sections ?? [];
    expect(sectionsOf('authoring/field-reference').length).toBeGreaterThan(10);
    for (const {source, doc} of loaded) {
      const leaf = [...tree.nodes.values()].find(
        node => node.kind === doc.type && node.name === doc.name,
      );
      const route =
        doc.stability === 'experimental'
          ? EXPERIMENTAL_AUTHORING_ROUTE
          : 'authoring/field-reference';
      const section = sectionsOf(route).find(
        (/** @type {any} */ s) => s.id === routeSegment(doc.name) || s.title === doc.displayName,
      );
      const ok = leaf
        ? reached(`${TOP} ${leaf.route}`)
        : section
          ? reached(`${TOP} authoring ${section.id}`) ||
            reached(`${TOP} ${route} ${section.id}`) ||
            // The walk opens the reference whole, with every section.
            reached(`${TOP} ${route}`)
          : false;
      if (!ok) unreached.push(source);
    }
    // Topics, and the tree's own files.
    const catalog = await loadDocsCatalog(CLI);
    const topicFiles = new Set();
    for (const entry of catalog.entries()) {
      topicFiles.add(path.resolve(entry.path));
      if (!reached(`${TOP} ${entry.name}`)) unreached.push(`topic ${entry.name}`);
    }
    const treeFiles = fs
      .readdirSync(path.join(CLI, 'assets/docs/tree'))
      .filter(name => name.endsWith('.doc.mjs'))
      .map(name => `assets/docs/tree/${name}`);
    for (const file of treeFiles) {
      const node = [...tree.nodes.values()].find(n =>
        [n.source, n.ref?.topicFile].some(s => String(s ?? '').endsWith(file)),
      );
      if (!node || !reached(`${TOP} ${node.route}`)) unreached.push(file);
    }
    expect(unreached).toEqual([]);

    // Every doc file under the docs directory is a topic, an overlay of one
    // (`.doc.<variant>.mjs`), or a tree file: none sits where nothing reads it.
    const orphans = fs
      .readdirSync(path.join(CLI, 'assets/docs'))
      .filter(name => /\.doc\.mjs$/.test(name))
      .filter(name => !topicFiles.has(path.resolve(CLI, 'assets/docs', name)));
    expect(orphans).toEqual([]);
    expect(loaded.length).toBeGreaterThan(90);
  });

  it('resolves every typed edge a doc declares: command, fn, and related', async () => {
    const tree = await loadDocsTree();
    /** @type {string[]} */
    const broken = [];
    for (const node of tree.nodes.values()) {
      for (const edge of typedEdges(tree, node).unresolved) {
        broken.push(`${node.route}: ${edge}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('resolves every link written in a doc: inline, reference, and workflow', async () => {
    // The walk opens each resolved link as a move; a link that names no doc
    // has no command to open, so it is caught here, by the same resolver
    // `astryx doctor` uses.
    const catalog = builtinCatalog();
    expect(await docsLinkProblems(catalog, await projectTree(catalog))).toEqual(
      [],
    );
    for (const [command, res] of reads) {
      const blocks = [
        ...(res?.data?.content ?? []),
        ...(res?.data?.sections ?? []).flatMap(
          (/** @type {any} */ s) => s.content ?? [],
        ),
      ];
      for (const block of blocks) {
        if (block?.type === 'reference') {
          expect(block.link, `${command}: ${block.target}`).toBeTruthy();
        }
        for (const text of [block?.text, ...(block?.items ?? [])]) {
          if (typeof text === 'string') {
            expect(
              text.replace(/`[^`]*`/g, ''),
              `${command} shows an unresolved link`,
            ).not.toMatch(/\{@link /);
          }
        }
      }
    }
  }, SLOW);

  it('offers a way up from every read but the top, and up always ends at the top', () => {
    const noUp = [...reads]
      .filter(([command, res]) => res && command !== TOP && !res.data?.links?.up)
      .map(([command]) => command);
    expect(noUp).toEqual([]);
    /** @type {string[]} */
    const lost = [];
    for (const [command, res] of reads) {
      let at = res;
      let steps = 0;
      while (at?.data?.links?.up && steps < 10) {
        at = reads.get(at.data.links.up);
        steps++;
      }
      if (at?.type !== 'docs.list') lost.push(command);
    }
    expect(lost).toEqual([]);
  });

  it('agrees on neighbors: the next read names this one as its previous', async () => {
    /** @type {string[]} */
    const broken = [];
    // A topic's section list and its whole read are one place.
    /** @param {string | undefined} command */
    const place = command => command?.replace(/ --index$/, '');
    for (const [from, kind, to] of moves) {
      if (kind !== 'next') continue;
      const back = reads.get(to)?.data?.links?.previous;
      if (place(back) !== place(from)) broken.push(`${from} -> ${to} <- ${back}`);
    }
    expect(broken).toEqual([]);
  });

  it('opens every `astryx docs ...` command written in a doc', async () => {
    /** @type {string[]} */
    const stale = [];
    const checked = new Set();
    for (const [command, res] of reads) {
      if (!res) continue;
      for (const text of textOf(res)) {
        for (const link of docsCommandsIn(text)) {
          if (checked.has(link)) continue;
          checked.add(link);
          try {
            await open(link);
          } catch (e) {
            stale.push(`${command} names \`${link}\`: ${/** @type {Error} */ (e).message}`);
          }
        }
      }
    }
    expect(stale).toEqual([]);
    expect(checked.size).toBeGreaterThan(10);
  }, SLOW);

  it('shows only real commands with real options, in docs, hints, and the agent prompt', async () => {
    const surface = cliSurface();
    /** @type {Map<string, string>} command -> where it is shown */
    const shown = new Map();
    for (const [command, res] of reads) {
      if (!res) continue;
      for (const text of textOf(res)) {
        for (const each of shownCommands(text)) {
          if (!shown.has(each)) shown.set(each, command);
        }
      }
    }
    for (const args of HINT_READS) {
      const {stdout} = await runCli(args);
      for (const each of shownCommands(stdout)) {
        if (!shown.has(each)) shown.set(each, `astryx ${args.join(' ')}`);
      }
    }
    const prompt = fs.readFileSync(path.join(CLI, '..', '..', 'AGENTS.md'), 'utf8');
    const block = /<!-- ASTRYX-CLI:START -->([\s\S]*?)<!-- ASTRYX-CLI:END -->/.exec(prompt)?.[1] ?? '';
    for (const each of shownCommands(block)) {
      if (!shown.has(each)) shown.set(each, 'the agent prompt in AGENTS.md');
    }
    // The block `astryx init` writes into an app's AGENTS.md. Its key-commands
    // lines are bare subcommands, each followed by its description.
    const appBlock = generateCompressedIndex('0.0.0', {invocation: 'npx astryx'});
    for (const each of shownCommands(appBlock)) {
      if (!shown.has(each)) shown.set(each, 'the agent block astryx init writes');
    }
    // The compact block lists key commands after a prose lead-in, indented by
    // two spaces. build/template/component are intentionally omitted because
    // they are covered in the WORKFLOW section above the command list.
    const keySection = (appBlock.split('Key ones beyond the workflow:')[1] ?? '').split(/\n\s*\n/)[0];
    const bare = [...keySection.matchAll(/^ {2}(\S.*?)(?: {3,}|$)/gm)].map(m => `astryx ${m[1]}`);
    expect(bare.length).toBeGreaterThan(3);
    for (const each of bare) {
      if (!shown.has(each)) shown.set(each, 'the agent block astryx init writes');
    }
    // The examples `astryx manifest --json` gives agents for each command.
    /** @param {any[]} list @returns {string[]} */
    const examplesOf = list =>
      (list ?? []).flatMap(c => [...(c.examples ?? []), ...examplesOf(c.subcommands)]);
    const examples = examplesOf(buildManifest(program, {jsonSupported: JSON_SUPPORTED}).commands);
    expect(examples.length).toBeGreaterThan(10);
    for (const each of examples) {
      if (!shown.has(each)) shown.set(each, 'the manifest examples');
    }
    /** @type {string[]} */
    const wrong = [];
    for (const [command, where] of shown) {
      const bare = command.replace(/^(?:npx |pnpm exec |yarn |bunx )/, '');
      if (WRONG_ON_PURPOSE.has(bare)) continue;
      const problem = problemWith(command, surface);
      if (AWAITING_DECISION.has(bare)) {
        if (!problem) wrong.push(`${where} shows \`${command}\`, which now works: drop it from AWAITING_DECISION`);
        continue;
      }
      if (problem) wrong.push(`${where} shows \`${command}\`: ${problem}`);
    }
    expect(wrong).toEqual([]);
    const stale = [...WRONG_ON_PURPOSE.keys(), ...AWAITING_DECISION.keys()].filter(
      command => ![...shown.keys()].some(each => each.endsWith(command)),
    );
    expect(stale).toEqual([]);
    expect(shown.size).toBeGreaterThan(50);
  }, SLOW);

  it("opens every search hit's command and parent", async () => {
    /** @type {string[]} */
    const broken = [];
    for (const query of ['assertResponse', 'token-ref', 'codemod protected files', 'agent docs', 'ERR_UNKNOWN_SECTION', 'theme', 'foundations', 'Astryx CLI']) {
      const {data} = await search(query, {type: 'doc', limit: 20});
      for (const hit of data.results) {
        if (!hit.parent) broken.push(`"${query}": ${hit.name} has no parent`);
        for (const command of [hit.command, hit.parent].filter(Boolean)) {
          try {
            await open(command);
          } catch (e) {
            broken.push(`"${query}": ${command}: ${/** @type {Error} */ (e).message}`);
          }
        }
      }
    }
    expect(broken).toEqual([]);
  }, SLOW);
});
