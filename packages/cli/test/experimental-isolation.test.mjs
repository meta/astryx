// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Experimental isolation (spec:AST-017 FR27, spec:AST-084 FR0): in a
 *   project with no icon set installed and no `experimental.iconSet`, every
 *   stable command answers exactly as it does without icon sets.
 *
 *   The goldens under `__golden__/no-icon-set/` were written by the CLI
 *   without the icon-set feature, so a result, field, section, count, or
 *   `stability` that an experimental surface adds to search, the docs, a
 *   template copy, doctor, or an integration's verify report fails here, as
 *   does any sentence that names an experimental surface. They hold no prose
 *   (titles, summaries, descriptions, snippets), so main's ordinary doc and
 *   command wording edits rewrite none of them. Help, the
 *   manifest, and the `astryx docs cli` listing gain only the experimental
 *   group or namespace, the one marked entry point FR27 allows.
 *
 * Updating the goldens has two phases.
 *
 * While main lacks the icon-set feature (before the feature lands), the
 * goldens are main's own output: regenerate them from a checkout of main
 * with `GOLDEN_CLI_BIN=<main>/packages/cli/clients/cli/bin/astryx.mjs
 * GOLDEN_CLI_ROOT=<main>/packages/cli vitest run
 * packages/cli/test/experimental-isolation.test.mjs --update`, run from this
 * checkout. Name the file before `--update`: vitest 4 reads `-u <file>` as
 * the value of `-u` and updates every suite. That runs
 * main's CLI in test projects created inside main's checkout, so main's CLI
 * and Core answer: a project inside this checkout would hand the run over to
 * this checkout's CLI, and the goldens would record this branch's own output.
 * A run that hands over fails. Tests that need the feature are skipped while
 * regenerating, and every golden that this branch's CLI may add to (help,
 * the manifest, the `cli` docs listings) is compared with those additions
 * stripped.
 *
 * Once the feature is on main, a branch with an intended change to stable
 * output runs `vitest run packages/cli/test/experimental-isolation.test.mjs
 * --update` in the branch itself, then reviews
 * the diff of `__golden__/no-icon-set/`: a diff that names an icon set, an
 * icon definition, or `experimental` is the leak this test exists to catch.
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {CLI_ROOT} from '../foundation/fs/paths.mjs';
import {writeIconSetProject} from '../test-utils/icon-set-fixture.mjs';

const REPO_ROOT = path.resolve(CLI_ROOT, '..', '..');
// Goldens come from the CLI without the feature: point these at a checkout of
// main to rewrite them (`GOLDEN_CLI_BIN=<main>/packages/cli/clients/cli/bin/
// astryx.mjs GOLDEN_CLI_ROOT=<main>/packages/cli vitest run
// packages/cli/test/experimental-isolation.test.mjs --update`).
const CLI_BIN =
  process.env.GOLDEN_CLI_BIN ??
  path.join(CLI_ROOT, 'clients', 'cli', 'bin', 'astryx.mjs');
const GOLDEN_REPO = process.env.GOLDEN_CLI_ROOT
  ? path.resolve(process.env.GOLDEN_CLI_ROOT, '..', '..')
  : REPO_ROOT;
const GOLDEN = path.join(CLI_ROOT, 'test', '__golden__', 'no-icon-set');
/** Words an experimental surface's text uses; a stable doc that gains one leaks. */
const LEAK_WORDS =
  /\bexperimental\b|\bicon[- ]?sets?\b|\bicon[- ]definitions?\b/iu;
/** Writing the goldens from main's CLI, not checking this branch's. */
const REGENERATING = Boolean(process.env.GOLDEN_CLI_ROOT);
/**
 * The release of the CLI that answers, read from its package.json: each exact
 * mention becomes `<version>`, so a release bump rewrites no golden.
 */
const CLI_VERSION = JSON.parse(
  fs.readFileSync(
    path.join(process.env.GOLDEN_CLI_ROOT ?? CLI_ROOT, 'package.json'),
    'utf8',
  ),
).version;
/**
 * The version alone, bare or after `v`: no letter, digit, dot, or hyphen
 * around it, so `0.7.40`, `10.7.4`, and a prerelease never match.
 */
const VERSION_PATTERN = new RegExp(
  `(?<![\\w.-])(v?)${CLI_VERSION.replaceAll('.', '\\.')}(?![\\w-]|\\.\\w)`,
  'gu',
);
/**
 * Every command that prints the integration-issue nudge to stderr (spec:AST-084
 * FR0), with an invocation that reaches it: in text mode, after the command
 * succeeds. Run in this order, in one project (the theme writers build on one
 * another; `upgrade` is a dry run).
 */
const NUDGE_COMMANDS = [
  {name: 'component', args: ['component', 'Button']},
  {name: 'discover', args: ['discover']},
  {name: 'search', args: ['search', 'close']},
  {name: 'template', args: ['template', 'settings-dialog']},
  {name: 'theme list', args: ['theme', 'list']},
  {name: 'theme eject', args: ['theme', 'eject', 'stone']},
  {name: 'theme add', args: ['theme', 'add', 'stone']},
  {name: 'theme use', args: ['theme', 'use', 'stone']},
  {name: 'theme remove', args: ['theme', 'remove', 'matcha']},
  {name: 'upgrade', args: ['upgrade', '--from', '0.7.0']},
];
/** A call of the nudge or of a wrapper around it. */
const NUDGE_CALL =
  /(?<!function )\b(?:warnOnIntegrationIssues|warnOnThemeIntegrationIssues|warnIntegrationIssues)\(/gu;
/**
 * Where NUDGE_CALL appears, by file, and how often: the commands above and
 * the two wrappers (theme.mjs and upgrade's adapter each call the nudge once).
 */
const NUDGE_CALLERS = {
  // component
  'clients/cli/commands/component.mjs': 1,
  // discover
  'clients/cli/commands/discover.mjs': 1,
  // search
  'clients/cli/commands/search.mjs': 1,
  // template
  'clients/cli/commands/template.mjs': 1,
  // the wrapper, then theme list, add, remove, use, eject
  'clients/cli/commands/theme.mjs': 6,
  // upgrade: the wrapper, and its one call
  'api/upgrade/_adapter.mjs': 1,
  'api/upgrade/run/run.mjs': 1,
};
/**
 * Every source file that reads an integration's icon-set root (`.iconSets`)
 * or runs icon-set discovery or checks, and why a project without
 * `experimental.iconSet` never sees what it reads (spec:AST-084 FR0, FR17).
 * A new reader fails the test below until it is listed with its gate.
 */
const ICON_SET_READERS = {
  // Readers that hold the gate.
  'foundation/config/project.mjs':
    'iconSets() reads no set without the opt-in; integration issues strip the root without it',
  'api/integration/validate-integration.mjs':
    'an installed package is checked only with the opt-in; the package being authored always',
  'api/upgrade/run/run.mjs':
    'passes the opt-in to the nudge, which strips the root without it',
  'api/discover/_adapter.mjs':
    'reads sets only with the opt-in, and strips the root before collecting identities',
  // Readers behind a gated reader.
  'api/doctor/doctor.mjs': 'project.iconSets()',
  'api/template/_adapter.mjs': 'project.iconSets()',
  'foundation/doc-compiler/inputs.mjs': 'project.iconSets()',
  'foundation/discovery/icon-set-discovery.mjs':
    'discovery itself: called by the gated readers',
  'foundation/discovery/icon-set-checks.mjs':
    'the checks: called by validate-integration',
  'foundation/discovery/integration-doc-files.mjs':
    'the loaded root validate-integration resolved, so only with its gate',
  'foundation/integrations/contribution-inventory.mjs':
    'the package being authored (verify, pack-check, writers), or the root a gated caller passes',
  'foundation/integrations/validate-contributions.mjs':
    'the root of the integration a gated caller passes',
  'foundation/integrations/integrations.mjs':
    'resolves the root on the loaded integration; every reader of it is listed here',
  'foundation/integrations/manifest-writer.mjs':
    'writes the root of the package being authored',
  // The experimental commands and the authoring output.
  'api/icon/_adapter.mjs': 'astryx experimental icon',
  'api/icon/_authoring.mjs': 'astryx experimental icon new-set and friends',
  'foundation/discovery/icon-set-writer.mjs':
    'astryx experimental icon writers',
  'clients/cli/commands/experimental/icon.mjs': 'astryx experimental icon',
  'clients/cli/commands/integration.mjs':
    'integration verify, for the package being authored',
  'clients/cli/commands/doctor.mjs':
    "prints validate's iconSets, which validate fills only with its gate",
};
/** A read of an icon-set root, or a run of icon-set discovery or checks. */
const ICON_SET_READ =
  /\.iconSets\b|\b(?:discoverIntegrationIconSets|discoverIconSetDirectory|iconSetIssues|iconSetCoverage)\(/u;
/** Where test projects go: inside the checkout whose CLI answers. */
const PROJECTS_ROOT = REGENERATING ? GOLDEN_REPO : REPO_ROOT;

/** @type {string} */
let project;

/**
 * Run the CLI in the project; machine paths and the CLI's release version
 * become placeholders.
 * @param {string[]} args
 */
function astryx(args, cwd = project) {
  const result = spawnSync(process.execPath, [CLI_BIN, ...args], {
    cwd,
    encoding: 'utf8',
    env: {...process.env, NO_COLOR: '1', FORCE_COLOR: '0', COLUMNS: '100'},
  });
  // A golden is main's own answer, never one main handed to this checkout.
  if (REGENERATING && /handed over from CLI/u.test(result.stderr)) {
    throw new Error(
      `main's CLI handed \`astryx ${args.join(' ')}\` over to another CLI: ${result.stderr.trim()}`,
    );
  }
  /** @param {string} text */
  const clean = text =>
    text
      .split(cwd)
      .join('<project>')
      .split(REPO_ROOT)
      .join('<repo>')
      .split(GOLDEN_REPO)
      .join('<repo>')
      .replace(VERSION_PATTERN, '$1<version>');
  return {
    status: result.status,
    stdout: clean(result.stdout),
    stderr: clean(result.stderr),
  };
}

/** Doctor checks that read the computer, not the project. */
const COMPUTER_CHECKS = new Set([
  'newest-release',
  'cli-on-path',
  'computer-integrations',
]);

/**
 * A doctor JSON report with the computer's checks reduced to their ids, and
 * the summary counting only the project's: those checks answer from this
 * machine's cache and search path, which no golden can hold.
 * @param {string} stdout
 */
function withoutComputerChecks(stdout) {
  const report = JSON.parse(stdout);
  const summary = {pass: 0, warn: 0, fail: 0, info: 0};
  report.data.checks = report.data.checks.map((/** @type {any} */ check) => {
    if (COMPUTER_CHECKS.has(check.id)) return {id: check.id};
    summary[/** @type {keyof typeof summary} */ (check.status)] += 1;
    // A message is prose; its counts are what icon sets could change. The
    // Node version is the machine's, not the project's.
    return {
      ...check,
      message: numbersIn(
        check.id === 'node-version'
          ? check.message.replace(/v\d+\.\d+\.\d+/u, 'v<node>')
          : check.message,
      ),
    };
  });
  report.data.summary = summary;
  const shaped = skeleton(report);
  report.data.checks.forEach(
    (/** @type {any} */ check, /** @type {number} */ at) => {
      if (check.message != null) shaped.data.checks[at].message = check.message;
    },
  );
  return asGolden(shaped);
}

/*
 * The goldens hold what icon sets could change, not main's prose: an edit to a
 * stable doc's title, summary, description, or snippet, or to a command's
 * description, rewrites no golden. Each golden keeps identities (ids, routes,
 * names, kinds, packages, commands), structure (which fields, sections,
 * children, and results there are, in order), counts, and the leak fields:
 * every `stability`, and every sentence that names `experimental`, an icon
 * set, or an icon definition.
 */

/** String fields kept as they are: identities, never prose. */
const IDENTITY_KEYS = new Set([
  'apiVersion',
  'type',
  'package',
  'id',
  'key',
  'route',
  'name',
  'topic',
  'kind',
  'domain',
  'import',
  'command',
  'parent',
  'stability',
  'slot',
  'template',
  'outputDir',
  'fileName',
  'status',
  'code',
  'flag',
  'version',
  'query',
  'cli',
  'core',
  'copy',
  'severity',
  'file',
  'installCommand',
  'lang',
]);
/** Fields whose strings are a list of identities. */
const IDENTITY_LIST_KEYS = new Set([
  'components',
  'missingPackages',
  'jsonSupported',
  'choices',
  'iconSets',
]);
/** Numbers derived from prose (a match in a title scores higher). */
const PROSE_NUMBER_KEYS = new Set(['score']);
/** What a prose string becomes. */
const TEXT = '<text>';

/**
 * A JSON value with its prose replaced by {@link TEXT}: every string outside
 * {@link IDENTITY_KEYS} and {@link IDENTITY_LIST_KEYS}, and every number in
 * {@link PROSE_NUMBER_KEYS}. Keys, arrays, and their order stay.
 * @param {any} value
 * @param {string} [key]
 * @returns {any}
 */
function skeleton(value, key) {
  if (typeof value === 'string') {
    return key != null && IDENTITY_KEYS.has(key) ? value : TEXT;
  }
  if (typeof value === 'number') {
    return key != null && PROSE_NUMBER_KEYS.has(key) ? TEXT : value;
  }
  if (Array.isArray(value)) {
    return value.map(each =>
      typeof each === 'string' && key != null && IDENTITY_LIST_KEYS.has(key)
        ? each
        : skeleton(each, typeof each === 'string' ? undefined : key),
    );
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([field, each]) => [
        field,
        skeleton(each, field),
      ]),
    );
  }
  return value;
}

/**
 * Every sentence in a value that names an experimental surface, sorted.
 * @param {any} value
 * @returns {string[]}
 */
function leakMentions(value) {
  /** @type {Set<string>} */
  const found = new Set();
  /** @param {any} each */
  const visit = each => {
    if (typeof each === 'string') {
      for (const sentence of each.split(/(?<=[.!?])\s+/u)) {
        if (LEAK_WORDS.test(sentence)) found.add(sentence.trim());
      }
    } else if (Array.isArray(each)) {
      each.forEach(visit);
    } else if (each && typeof each === 'object') {
      Object.values(each).forEach(visit);
    }
  };
  visit(value);
  return [...found].sort();
}

/** @param {any} value */
const asGolden = value => `${JSON.stringify(value, null, 2)}\n`;

/**
 * Text output with its prose dropped: a line matching one of `keep` stays;
 * a two-column row (`name   description`) keeps its first column and the
 * column it sets; a line that wraps a row's description is dropped; any
 * other run of lines becomes one {@link TEXT}.
 * @param {string} text
 * @param {RegExp[]} [keep]
 */
function textShape(text, keep = []) {
  /** @type {string[]} */
  const out = [];
  for (const line of text.split('\n')) {
    if (line.trim() === '') {
      out.push('');
    } else if (keep.some(pattern => pattern.test(line))) {
      out.push(line);
    } else if (/^\s{8,}\S/u.test(line)) {
      continue;
    } else {
      const row = /^(\s*\S(?:.*?\S)?)( {2,})\S/u.exec(line);
      const shaped = row ? `${row[1]}${row[2]}${TEXT}` : TEXT;
      // A paragraph's lines are one prose run, however it wraps.
      if (shaped !== TEXT || out.at(-1) !== TEXT) out.push(shaped);
    }
  }
  return out.join('\n');
}

/**
 * `astryx search` as a golden: the count, and each result's identity and
 * order, with the sentences that name an experimental surface (the stable
 * icons topic names "the icon set" a theme swaps). No result is experimental,
 * an icon, or an icon definition.
 * @param {string} query
 * @param {string} cwd
 */
function searchGolden(query, cwd) {
  const json = astryx(['search', ...query.split(' '), '--json'], cwd);
  expect(json.status).toBe(0);
  const body = JSON.parse(json.stdout);
  // The one stable addition FR18 makes: the field reference's `stability`
  // field, named by its value. Main has no such field; nothing else may be
  // added.
  const added = body.data.results.filter(isStableAddition);
  body.data.results = body.data.results.filter(
    (/** @type {any} */ result) => !isStableAddition(result),
  );
  body.data.matchCount -= added.length;
  for (const result of body.data.results) {
    expect(result).not.toHaveProperty('stability');
    expect(['icon', 'icon-set', 'icon-definition']).not.toContain(
      result.domain,
    );
    expect(
      [result.name, result.command, result.route, result.parent].join(' '),
    ).not.toMatch(/experimental|icon-definitions|icon-sets?\b/u);
  }
  body.data.results = body.data.results.map((/** @type {any} */ result) => ({
    ...skeleton(result),
    mentions: leakMentions(result),
  }));
  const text = astryx(['search', ...query.split(' ')], cwd);
  // The same addition left out of the text: its block, and its count.
  const blocks = text.stdout
    .split('\n\n')
    .filter(
      block =>
        !(
          /^name: +authoring\/field-reference$/mu.test(block) &&
          /^section: +authored-doc-graph-fields$/mu.test(block)
        ),
    );
  return {
    json: asGolden(body),
    // Each result's identity lines and the count; descriptions are prose.
    text: blocks
      .join('\n\n')
      .replace(
        /^(Results for .*\()(\d+)((?: of (\d+))?\))$/mu,
        (_, head, shown, tail, total) =>
          total
            ? `${head}${Number(shown)}${tail.replace(total, String(Number(total) - added.length))}`
            : `${head}${Number(shown) - added.length}${tail}`,
      )
      .split('\n')
      .filter(line =>
        /^(?:Results for |(?:name|section|domain|package|import|command|parent|route):\s)/u.test(
          line,
        ),
      )
      .join('\n'),
  };
}

/**
 * Is this search result FR18's one stable addition: the field reference's
 * section on the authored doc graph fields, which gains `stability`?
 * @param {any} result
 */
function isStableAddition(result) {
  return (
    result.name === 'authoring/field-reference' &&
    result.section === 'authored-doc-graph-fields' &&
    !REGENERATING
  );
}

/**
 * The numbers a message states, in order, standing for the message: the
 * counts icon sets could change, without the prose around them.
 * @param {string} message
 */
function numbersIn(message) {
  return `${TEXT} ${(message.match(/\d+(?:\.\d+)*/gu) ?? []).join(' ')}`.trim();
}

beforeAll(() => {
  // Inside the checkout whose CLI answers, so it finds that checkout's Core.
  project = fs.mkdtempSync(path.join(PROJECTS_ROOT, '.astryx-no-icon-set-'));
  fs.writeFileSync(
    path.join(project, 'package.json'),
    JSON.stringify({name: 'no-icon-set', version: '1.0.0'}),
  );
  fs.mkdirSync(path.join(project, 'node_modules', '.bin'), {recursive: true});
  fs.writeFileSync(path.join(project, 'node_modules', '.bin', 'astryx'), '');
});

afterAll(() => {
  fs.rmSync(project, {recursive: true, force: true});
});

describe('with no icon set, stable output is unchanged', () => {
  // Every stable docs topic, against the CLI without the feature: the
  // listing, each topic's sections, a digest of each topic's JSON skeleton
  // (its fields, blocks, and identities, not its prose), and the leak fields.
  it('every stable docs topic: the listing, its sections, and its JSON', async () => {
    const list = JSON.parse(astryx(['docs', '--json']).stdout);
    /** @type {Record<string, any>} */
    const topics = {};
    for (const {topic} of list.data) {
      const doc = JSON.parse(astryx(['docs', topic, '--json']).stdout);
      topics[topic] = {
        sections: (doc.data.sections ?? []).map(
          (/** @type {any} */ section) => section.id ?? section.key,
        ),
        skeleton: createHash('sha256')
          .update(JSON.stringify(skeleton(doc)))
          .digest('hex'),
        ...(doc.data.stability ? {stability: doc.data.stability} : {}),
        mentions: leakMentions(doc),
      };
    }
    await expect(
      asGolden({list: skeleton(list.data), topics}),
    ).toMatchFileSnapshot(path.join(GOLDEN, 'docs-topics.json'));
  }, 120_000);

  // Every stable node of the docs tree outside `cli`, by structure and by
  // what could leak, so an unrelated doc edit rewrites no line here: each
  // namespace's children (routes) and each guide's sections (ids), every `stability` the node or a child carries, and every
  // sentence in the node that names `experimental`, an icon set, or an icon
  // definition. The field reference gains the stable `stability` field of
  // every doc kind, so it is compared by sections.
  it('every stable docs tree node: its children or sections, and its JSON', async () => {
    const root = process.env.GOLDEN_CLI_ROOT ?? CLI_ROOT;
    const {docs} = await import(
      pathToFileURL(path.join(root, 'api', 'docs', 'docs.mjs')).href
    );
    // The `cli` namespace is FR0's own case: its listing gains the
    // experimental group, and the experimental commands and API functions
    // document themselves on its routes, each marked experimental. Every
    // other namespace answers exactly as it does without the feature.
    const experimental = (/** @type {string} */ route) =>
      route === 'cli' || route.startsWith('cli/');
    /** @param {any} value */
    const clean = value =>
      JSON.stringify(value)
        .split(project)
        .join('<project>')
        .split(path.resolve(root, '..', '..'))
        .join('<repo>');
    /**
     * Every `stability` a read carries, on the node or a child, by where.
     * @param {any} res
     */
    const stabilities = res => {
      /** @type {string[]} */
      const marked = [];
      if (res.data?.stability) marked.push(`node: ${res.data.stability}`);
      for (const slot of res.data?.slots ?? []) {
        for (const child of slot.children ?? []) {
          if (child.stability) {
            marked.push(`${child.route}: ${child.stability}`);
          }
        }
      }
      return marked.length > 0 ? {stability: marked} : {};
    };
    /**
     * Every sentence in a read that names an experimental surface.
     * @param {any} value
     */
    const mentions = value => {
      /** @type {Set<string>} */
      const found = new Set();
      /** @param {any} each */
      const visit = each => {
        if (typeof each === 'string') {
          for (const sentence of each.split(/(?<=[.!?])\s+/u)) {
            if (LEAK_WORDS.test(sentence)) found.add(sentence);
          }
        } else if (Array.isArray(each)) {
          each.forEach(visit);
        } else if (each && typeof each === 'object') {
          Object.values(each).forEach(visit);
        }
      };
      visit(value);
      return [...found].sort();
    };
    const list = await docs(undefined, undefined, {cwd: project});
    const queue = (list.meta?.namespaces ?? []).map(
      (/** @type {any} */ entry) => entry.topic,
    );
    /** @type {Record<string, any>} */
    const nodes = {};
    while (queue.length > 0) {
      const route = queue.shift();
      if (route in nodes || experimental(route)) continue;
      const res = await docs(route, undefined, {cwd: project});
      if (res.type === 'docs.node') {
        for (const slot of res.data.slots) {
          slot.children = slot.children.filter(
            (/** @type {any} */ child) => !experimental(child.route),
          );
          for (const child of slot.children) queue.push(child.route);
        }
      }
      nodes[route] = {
        type: res.type,
        ...(res.type === 'docs.node'
          ? {
              children: res.data.slots.flatMap((/** @type {any} */ slot) =>
                slot.children.map((/** @type {any} */ c) => c.route),
              ),
            }
          : {
              sections: (res.data.sections ?? []).map(
                (/** @type {any} */ section) => section.id ?? section.key,
              ),
            }),
        ...stabilities(res),
        ...(route === 'authoring/field-reference'
          ? {}
          : {mentions: mentions(JSON.parse(clean(res)))}),
      };
    }
    const sorted = Object.fromEntries(
      Object.keys(nodes)
        .sort()
        .map(route => [route, nodes[route]]),
    );
    await expect(`${JSON.stringify(sorted, null, 2)}\n`).toMatchFileSnapshot(
      path.join(GOLDEN, 'docs-tree.json'),
    );
  }, 120_000);

  // Every stable node of the `cli` tree (the tree minus the nodes marked
  // experimental and what sits under them): every sentence, link, and
  // command in it that names `experimental`, an icon set, or an icon
  // definition, which must be main's own (spec:AST-084 FR0). A stable doc
  // that points at an experimental route, or a stable node whose previous or
  // next link is one, fails here.
  it('every stable cli docs node: no mention of an experimental surface main lacks', async () => {
    const root = process.env.GOLDEN_CLI_ROOT ?? CLI_ROOT;
    const {docs} = await import(
      pathToFileURL(path.join(root, 'api', 'docs', 'docs.mjs')).href
    );
    /** @type {Record<string, string[]>} */
    const mentions = {};
    const queue = ['cli'];
    /** @type {Set<string>} */
    const seen = new Set();
    while (queue.length > 0) {
      const route = /** @type {string} */ (queue.shift());
      if (seen.has(route)) continue;
      seen.add(route);
      const res = await docs(route, undefined, {cwd: project});
      if (res.data?.stability === 'experimental') continue;
      if (res.type === 'docs.node') {
        for (const slot of res.data.slots) {
          slot.children = slot.children.filter(
            (/** @type {any} */ child) => child.stability !== 'experimental',
          );
          for (const child of slot.children) queue.push(child.route);
        }
      }
      const found = leakMentions(res.data);
      if (found.length > 0) mentions[route] = found;
    }
    expect(seen.size).toBeGreaterThan(50);
    const sorted = Object.fromEntries(
      Object.keys(mentions)
        .sort()
        .map(route => [route, mentions[route]]),
    );
    await expect(asGolden(sorted)).toMatchFileSnapshot(
      path.join(GOLDEN, 'docs-cli-mentions.json'),
    );
  }, 120_000);

  // The `cli` listings are FR0's one docs exception: they gain the
  // experimental group, commands, and API functions, each marked as help marks
  // the command group. Every entry not marked experimental reads exactly as it
  // does without the feature, in JSON and in text: stable rows
  // set the name column, and an experimental row overhangs it.
  it.each(['cli', 'cli/commands', 'cli/api/functions'])(
    'docs %s: every entry not marked experimental, text and JSON',
    async route => {
      const slug = route.replaceAll('/', '-');
      const json = JSON.parse(astryx(['docs', route, '--json']).stdout);
      for (const slot of json.data.slots) {
        slot.children = slot.children.filter(
          (/** @type {any} */ child) => child.stability !== 'experimental',
        );
      }
      delete json.meta;
      await expect(asGolden(skeleton(json))).toMatchFileSnapshot(
        path.join(GOLDEN, `docs-${slug}.json`),
      );
      // An experimental row and the lines it wraps onto are left out; every
      // other row is compared by its name and the name column it sets, so an
      // experimental name that widened the stable column would show.
      /** @type {string[]} */
      const lines = [];
      let inExperimental = false;
      for (const line of astryx(['docs', route]).stdout.split('\n')) {
        if (/^\S+ {2,}\[experimental\] /u.test(line)) {
          inExperimental = true;
          continue;
        }
        if (inExperimental && /^ {8,}\S/u.test(line)) continue;
        inExperimental = false;
        lines.push(line);
      }
      await expect(
        textShape(lines.join('\n'), [/^package: /u]),
      ).toMatchFileSnapshot(path.join(GOLDEN, `docs-${slug}.txt`));
    },
  );

  it.each([
    'delete',
    'close',
    'icon',
    'trash can',
    'search',
    'experimental',
    'icon set',
  ])('search %s, text and JSON', async query => {
    const slug = query.replace(/\s+/g, '-');
    const {json, text} = searchGolden(query, project);
    await expect(json).toMatchFileSnapshot(
      path.join(GOLDEN, `search-${slug}.json`),
    );
    await expect(text).toMatchFileSnapshot(
      path.join(GOLDEN, `search-${slug}.txt`),
    );
  });

  it('search --type icon is an unknown type, offering only the stable domains', async () => {
    const res = astryx(['search', 'trash', '--type', 'icon', '--json']);
    expect(res.status).toBe(1);
    const body = JSON.parse(res.stdout);
    expect(body.code).toBe('ERR_INVALID_ARGUMENT');
    expect(body.suggestions.map((/** @type {any} */ s) => s.name)).toEqual([
      'component',
      'hook',
      'doc',
      'template',
      'theme',
    ]);
  });

  it('a template that declares icons prints and copies as it always has', async () => {
    // The template's own source, from the checkout whose CLI answers: printed
    // and copied unchanged, icons included.
    const page = fs.readFileSync(
      path.join(
        process.env.GOLDEN_CLI_ROOT ?? CLI_ROOT,
        'assets',
        'templates',
        'pages',
        'settings-dialog',
        'page.tsx',
      ),
      'utf-8',
    );
    const shown = astryx(['template', 'settings-dialog', '--json']);
    expect(shown.status).toBe(0);
    const shownBody = JSON.parse(shown.stdout);
    expect(shownBody.data).not.toHaveProperty('icons');
    expect(shownBody.data.source).toBe(page);
    await expect(asGolden(skeleton(shownBody))).toMatchFileSnapshot(
      path.join(GOLDEN, 'template-show.json'),
    );

    const copied = astryx([
      'template',
      'settings-dialog',
      'out/json',
      '--json',
    ]);
    expect(copied.status).toBe(0);
    const copiedBody = JSON.parse(copied.stdout);
    expect(copiedBody.data).not.toHaveProperty('icons');
    await expect(asGolden(skeleton(copiedBody))).toMatchFileSnapshot(
      path.join(GOLDEN, 'template-copy.json'),
    );

    const text = astryx(['template', 'settings-dialog', 'out/text']);
    expect(text.status).toBe(0);
    expect(`${text.stdout}${text.stderr}`).not.toContain('icons:');
    await expect(
      textShape(text.stdout, [
        /^Copied template to /u,
        /^package: /u,
        /^Install missing dependencies: /u,
      ]),
    ).toMatchFileSnapshot(path.join(GOLDEN, 'template-copy.txt'));
    // The written file is the template's source with its own icons.
    for (const out of ['out/json', 'out/text']) {
      expect(
        fs.readFileSync(path.join(project, out, 'page.tsx'), 'utf-8'),
      ).toBe(page);
    }
  });

  it('help gains only the experimental group', async () => {
    const help = astryx(['help']).stdout.split('\n');
    const added = help.filter(line => /experimental|\bicon\b/i.test(line));
    if (!REGENERATING) {
      expect(added).toHaveLength(1);
      expect(added[0]).toMatch(/^\s+experimental\s+\[experimental\] /);
    }
    // Every other line as main prints it, by command and option and the
    // column they set; descriptions are prose.
    await expect(
      textShape(help.filter(line => !added.includes(line)).join('\n'), [
        /^(?:Usage|Options|Commands|Exit codes|Examples):/u,
      ]),
    ).toMatchFileSnapshot(path.join(GOLDEN, 'help.txt'));
  });

  it('the manifest gains only the experimental group and its commands', async () => {
    const manifest = JSON.parse(astryx(['manifest', '--json']).stdout);
    const isExperimental = (/** @type {string} */ name) =>
      name === 'experimental' || name.startsWith('experimental ');
    const data = manifest.data;
    if (!REGENERATING) {
      expect(
        data.commands.filter((/** @type {any} */ c) => isExperimental(c.name)),
      ).toHaveLength(1);
    }
    data.commands = data.commands.filter(
      (/** @type {any} */ c) => !isExperimental(c.name),
    );
    data.jsonSupported = data.jsonSupported.filter(
      (/** @type {string} */ name) => !isExperimental(name),
    );
    data.responseTypes = Object.fromEntries(
      Object.entries(data.responseTypes).filter(
        ([name]) => !isExperimental(name),
      ),
    );
    await expect(asGolden(skeleton(manifest))).toMatchFileSnapshot(
      path.join(GOLDEN, 'manifest.json'),
    );
  });

  it('doctor has no icon-sets check, and its doc counts leave experimental docs out', async () => {
    const res = astryx(['doctor', '--json']);
    const checks = JSON.parse(res.stdout).data.checks;
    expect(
      checks.map((/** @type {{id: string}} */ check) => check.id),
    ).not.toContain('icon-sets');
    const counts = checks
      .filter((/** @type {{id: string}} */ check) =>
        [
          'authoring-docs',
          'cli-docs',
          'docs-tree',
          'docs-progressive-disclosure',
        ].includes(check.id),
      )
      .map(
        (/** @type {{id: string, message: string}} */ check) =>
          `${check.id}: ${numbersIn(check.message)}`,
      )
      .join('\n');
    await expect(`${counts}\n`).toMatchFileSnapshot(
      path.join(GOLDEN, 'doctor-doc-counts.txt'),
    );
  });

  it.skipIf(REGENERATING)(
    'no stable command family gains an icon-set subcommand or kind',
    () => {
      const manifest = JSON.parse(astryx(['manifest', '--json']).stdout);
      /** @type {string[]} */
      const names = [];
      /** @param {any[]} commands */
      const walk = commands => {
        for (const command of commands ?? []) {
          names.push(command.name);
          walk(command.subcommands);
        }
      };
      walk(manifest.data?.commands ?? manifest.commands);
      const iconCommands = names.filter(name => /\bicon\b/.test(name));
      expect(iconCommands.length).toBeGreaterThan(0);
      for (const name of iconCommands) {
        expect(name.startsWith('experimental ')).toBe(true);
      }
      const res = astryx([
        'integration',
        'add',
        'icon-set',
        'outline',
        '--json',
      ]);
      expect(res.status).toBe(1);
      expect(JSON.parse(res.stdout).code).toBe('ERR_INVALID_ARGUMENT');
    },
  );
});

describe('an integration package without experimental.iconSets', () => {
  /** @type {string} */
  let pkg;
  beforeAll(() => {
    // Outside the repo, so this CLI answers, as the CLI without icon sets
    // that wrote the golden did.
    pkg = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-no-icon-sets-pkg-'));
    fs.writeFileSync(
      path.join(pkg, 'package.json'),
      `${JSON.stringify({
        name: '@acme/widgets',
        version: '1.0.0',
        files: ['astryx.integration.mjs', 'docs'],
        exports: {'./package.json': './package.json'},
      })}\n`,
    );
    fs.writeFileSync(
      path.join(pkg, 'astryx.integration.mjs'),
      "export default {\n  docs: './docs'\n};\n",
    );
    fs.mkdirSync(path.join(pkg, 'docs'));
    fs.writeFileSync(
      path.join(pkg, 'docs', 'local-guide.doc.mjs'),
      `/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export default {
  type: 'generic',
  name: 'local-guide',
  title: 'Local Guide',
  description: 'Local Guide documentation.',
  sections: [
    {
      title: 'Overview',
      content: [{type: 'prose', text: 'Local Guide documentation.'}],
    },
  ],
};
`,
    );
  });
  afterAll(() => {
    fs.rmSync(pkg, {recursive: true, force: true});
  });

  // The golden was written by the CLI without icon sets; only the gzip size
  // of the tarball, which depends on the machine's zlib, is a placeholder.
  it('integration verify --json answers as it does without icon sets: no iconSets identities', async () => {
    const res = astryx(['integration', 'verify', '--json'], pkg);
    expect(res.status).toBe(0);
    const body = JSON.parse(res.stdout);
    expect(body.data.contributions.local).not.toHaveProperty('iconSets');
    expect(body.data.contributions.packed).not.toHaveProperty('iconSets');
    await expect(
      res.stdout.replace(/("size": )\d+/u, '$1"<gzip>"'),
    ).toMatchFileSnapshot(path.join(GOLDEN, 'integration-verify.json'));
  });
});

// Only while main lacks the feature: main's CLI refuses
// `experimental.iconSet`, so regenerating from main skips these, which
// compare with the goldens the project without icon sets wrote. Once the
// feature is on main, `vitest run
// packages/cli/test/experimental-isolation.test.mjs --update` in a branch
// runs them too.
describe.skipIf(REGENERATING)(
  'with an icon set installed and configured, search is unchanged',
  () => {
    /** @type {string} */
    let root;
    /** @type {string} */
    let withSet;
    beforeAll(() => {
      root = fs.mkdtempSync(
        path.join(PROJECTS_ROOT, '.astryx-icon-set-search-'),
      );
      withSet = writeIconSetProject(root, {
        config: {experimental: {iconSet: 'glyphs'}},
      });
      fs.mkdirSync(path.join(withSet, 'node_modules', '.bin'), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(withSet, 'node_modules', '.bin', 'astryx'),
        '',
      );
    });
    afterAll(() => {
      fs.rmSync(root, {recursive: true, force: true});
    });

    it('the set is loaded', () => {
      const list = JSON.parse(
        astryx(['experimental', 'icon', '--list', '--json'], withSet).stdout,
      );
      expect(list.data.projectSet).toBe('@acme/glyphs/glyphs');
    });

    // Icon words: icon lookup by meaning is only `astryx experimental icon`;
    // `astryx search` joins it only at promotion (spec:AST-084 FR11).
    it.each(['delete', 'close', 'trash can', 'experimental', 'icon set'])(
      'search %s equals the output without icon sets, text and JSON',
      async query => {
        const slug = query.replace(/\s+/g, '-');
        const {json, text} = searchGolden(query, withSet);
        await expect(json).toMatchFileSnapshot(
          path.join(GOLDEN, `search-${slug}.json`),
        );
        await expect(text).toMatchFileSnapshot(
          path.join(GOLDEN, `search-${slug}.txt`),
        );
      },
    );

    it('search --type icon stays an unknown type', () => {
      const res = astryx(
        ['search', 'trash', '--type', 'icon', '--json'],
        withSet,
      );
      expect(res.status).toBe(1);
      expect(JSON.parse(res.stdout).code).toBe('ERR_INVALID_ARGUMENT');
    });
  },
);

describe('with icon sets installed but no experimental.iconSet, stable output is unchanged', () => {
  /** @type {string} */
  let root;
  beforeAll(() => {
    root = fs.mkdtempSync(
      path.join(PROJECTS_ROOT, '.astryx-icon-set-no-opt-in-'),
    );
  });
  afterAll(() => {
    fs.rmSync(root, {recursive: true, force: true});
  });

  /**
   * A project that loads an icon-set package, its set valid or not.
   * @param {string} name
   * @param {unknown} [data] the set's data file; omit for a valid one
   */
  function installed(name, data) {
    const dir = writeIconSetProject(path.join(root, name), {
      packages: [data === undefined ? {} : {data}],
      config: {integrations: ['@acme/glyphs']},
    });
    fs.mkdirSync(path.join(dir, 'node_modules', '.bin'), {recursive: true});
    fs.writeFileSync(path.join(dir, 'node_modules', '.bin', 'astryx'), '');
    if (REGENERATING) {
      // Main's CLI warns about the manifest key it does not know.
      fs.writeFileSync(
        path.join(
          dir,
          'node_modules',
          '@acme',
          'glyphs',
          'astryx.integration.mjs',
        ),
        'export default {};\n',
      );
    }
    return dir;
  }

  // The goldens were written by the CLI without icon sets, in the same
  // project with the package's manifest emptied: that CLI warns about the
  // manifest key `experimental` it does not know, which is the one line no
  // CLI with this feature can print.
  it('discover lists no icon set, and --type icon-set is an unknown type', async () => {
    const cwd = installed('discover');
    await expect(
      astryx(['discover', '--json'], cwd).stdout,
    ).toMatchFileSnapshot(path.join(GOLDEN, 'discover.json'));
    const typed = astryx(['discover', '--type', 'icon-set', '--json'], cwd);
    expect(typed.status).toBe(1);
    await expect(typed.stdout).toMatchFileSnapshot(
      path.join(GOLDEN, 'discover-type-icon-set.json'),
    );
    const unknown = astryx(['discover', '--type', 'bogus', '--json'], cwd);
    await expect(unknown.stdout).toMatchFileSnapshot(
      path.join(GOLDEN, 'discover-type-bogus.json'),
    );
  });

  // A source that lists a malformed icon-set entry: without the opt-in its
  // fields are unknown and the entry is an unknown kind, so the source still
  // counts and discover answers as the CLI without icon sets does.
  it('a malformed icon-set entry in a source does not fail it', async () => {
    const cwd = writeIconSetProject(path.join(root, 'malformed-source'), {
      packages: [],
    });
    fs.writeFileSync(
      path.join(cwd, 'astryx.config.mjs'),
      `export default {
  discover: async () => ({
    schemaVersion: 1,
    source: {name: 'acme', generatedAt: '2026-01-01T00:00:00.000Z', complete: true},
    packages: [{
      package: '@acme/glyphs',
      integration: '@acme/glyphs',
      aliases: [],
      latest: '1.0.0',
      versions: [{version: '1.0.0', publishedAt: '2026-01-01T00:00:00.000Z', prerelease: false, status: 'published'}],
      contributions: [
        {kind: 'theme', name: 'glyph-theme', definitions: [7]},
        {kind: 'icon-set', name: 'outline', iconCount: -1, definitions: 'nope'},
      ],
    }],
  }),
};
`,
    );
    fs.mkdirSync(path.join(cwd, 'node_modules', '.bin'), {recursive: true});
    fs.writeFileSync(path.join(cwd, 'node_modules', '.bin', 'astryx'), '');
    const res = astryx(['discover', '--json'], cwd);
    expect(res.status).toBe(0);
    await expect(res.stdout).toMatchFileSnapshot(
      path.join(GOLDEN, 'discover-malformed-icon-set-source.json'),
    );
  });

  // The other difference FR0 names: every command that prints the
  // integration-issue nudge to stderr (NUDGE_COMMANDS) prints one for the
  // manifest key `experimental` in the CLI without icon sets; this CLI prints
  // none, so its stderr equals what that CLI prints for the package with the
  // key removed. The theme writers have no dry run and print the nudge only
  // after they succeed, so they run in this test's own project: two themes
  // are forked and their built files stubbed, then added, used, and removed.
  // `upgrade` runs without `--apply`, a dry run, against the repo's Core.
  it('every command that prints the integration-issue nudge prints none', async () => {
    const cwd = installed('nudge');
    const pkgFile = path.join(cwd, 'package.json');
    const pkgJson = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
    pkgJson.dependencies['@astryxdesign/core'] = '*';
    fs.writeFileSync(pkgFile, JSON.stringify(pkgJson));
    fs.mkdirSync(path.join(cwd, 'src'));
    fs.mkdirSync(path.join(cwd, 'node_modules', '@astryxdesign'));
    fs.symlinkSync(
      path.join(PROJECTS_ROOT, 'packages', 'core'),
      path.join(cwd, 'node_modules', '@astryxdesign', 'core'),
      'dir',
    );
    /** @type {Record<string, () => void>} */
    const setup = {
      'theme add': () => {
        // `theme eject` above forked stone; matcha is the second theme.
        expect(astryx(['theme', 'eject', 'matcha', '--json'], cwd).status).toBe(
          0,
        );
        for (const slug of ['stone', 'matcha']) {
          const dir = path.join(cwd, 'src', 'themes', slug);
          fs.writeFileSync(
            path.join(dir, `${slug}.js`),
            `export const ${slug}Theme = {};\n`,
          );
          fs.writeFileSync(path.join(dir, `${slug}.css`), '\n');
        }
      },
      'theme use': () => {
        expect(astryx(['theme', 'add', 'matcha', '--json'], cwd).status).toBe(
          0,
        );
      },
    };
    const stderr = NUDGE_COMMANDS.map(({name, args}) => {
      setup[name]?.();
      const res = astryx(args, cwd);
      expect(res.status, `astryx ${args.join(' ')}: ${res.stderr}`).toBe(0);
      if (!REGENERATING) {
        expect(res.stderr).not.toMatch(/integration issue/u);
      }
      return `$ astryx ${args.join(' ')}\n${textShape(res.stderr, [
        /^(?:Warning|Error):/u,
        /^package: /u,
      ])}`;
    }).join('\n');
    await expect(stderr).toMatchFileSnapshot(
      path.join(GOLDEN, 'installed-set-stderr.txt'),
    );
  });

  // The list is every caller of the nudge: a new caller fails here until it
  // joins NUDGE_COMMANDS, and FR0 names each command in the list.
  it('NUDGE_COMMANDS is every caller of the nudge, and FR0 names each one', () => {
    /** @type {Record<string, number>} */
    const callers = {};
    /** @param {string} dir */
    const walk = dir => {
      for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'node_modules' && entry.name !== 'test') {
            walk(file);
          }
        } else if (
          entry.name.endsWith('.mjs') &&
          !entry.name.endsWith('.test.mjs')
        ) {
          const text = fs.readFileSync(file, 'utf8');
          const calls = text.match(NUDGE_CALL)?.length ?? 0;
          if (calls > 0) {
            callers[path.relative(CLI_ROOT, file).split(path.sep).join('/')] =
              calls;
          }
        }
      }
    };
    for (const dir of ['api', 'clients', 'foundation']) {
      walk(path.join(CLI_ROOT, dir));
    }
    expect(callers).toEqual(NUDGE_CALLERS);
    const spec = fs.readFileSync(
      path.join(REPO_ROOT, 'docs', 'specs', 'AST-084-icon-sets', 'spec.md'),
      'utf8',
    );
    const fr0 = spec.slice(
      spec.indexOf('**FR0 '),
      spec.indexOf('### What a set declares'),
    );
    const text = fr0.replace(/\s+/gu, ' ');
    expect(text).toContain(
      'every command that prints the integration-issue nudge',
    );
    for (const {name} of NUDGE_COMMANDS) {
      expect(text).toContain(`\`${name}\``);
    }
  });

  // `doctor integration validate <installed package>` checks the package's
  // icon sets only with the opt-in: here it reports what the CLI without
  // icon sets reports for the package with the manifest key removed.
  it('doctor integration validate of the installed package: text, JSON, and exit code', async () => {
    const cwd = installed('validate');
    const json = astryx(
      ['doctor', 'integration', 'validate', '@acme/glyphs', '--json'],
      cwd,
    );
    const text = astryx(
      ['doctor', 'integration', 'validate', '@acme/glyphs'],
      cwd,
    );
    if (!REGENERATING) {
      expect(JSON.parse(json.stdout).data).not.toHaveProperty('iconSets');
      expect(json.stdout).not.toMatch(/icon/iu);
    }
    // One exit code for both; the text golden holds it.
    expect(json.status).toBe(text.status);
    await expect(json.stdout).toMatchFileSnapshot(
      path.join(GOLDEN, 'validate-installed-set.json'),
    );
    await expect(
      `exit ${text.status}\n${textShape(`${text.stdout}${text.stderr}`, [
        /^Validating integration: /u,
        /^Summary: /u,
        /^severity:|^code:/u,
      ])}`,
    ).toMatchFileSnapshot(path.join(GOLDEN, 'validate-installed-set.txt'));
  });

  it('every reader of an icon-set root is listed with its gate', () => {
    /** @type {string[]} */
    const readers = [];
    /** @param {string} dir */
    const walk = dir => {
      for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!['node_modules', 'test', '__tests__'].includes(entry.name)) {
            walk(file);
          }
        } else if (
          entry.name.endsWith('.mjs') &&
          !/\.(?:test|doc|type)\.mjs$/u.test(entry.name) &&
          ICON_SET_READ.test(fs.readFileSync(file, 'utf8'))
        ) {
          readers.push(path.relative(CLI_ROOT, file).split(path.sep).join('/'));
        }
      }
    };
    for (const dir of ['api', 'clients', 'foundation']) {
      walk(path.join(CLI_ROOT, dir));
    }
    expect(readers.sort()).toEqual(Object.keys(ICON_SET_READERS).sort());
  });

  it('doctor reports nothing about an invalid installed set', async () => {
    const cwd = installed('doctor', '{nope');
    const res = astryx(['doctor', '--json'], cwd);
    expect(res.stdout).not.toMatch(/icon/i);
    await expect(withoutComputerChecks(res.stdout)).toMatchFileSnapshot(
      path.join(GOLDEN, 'doctor-installed-set.json'),
    );
  });
});
