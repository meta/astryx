#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Which browser accessibility specs a pull request runs, then run them.
 * @input The browser specs `playwright.config.ts` matches (`playwright test
 *   --list`), each spec's own `@pr-a11y` routing lines, the files the PR changes
 *   since its merge base, the PR's component scope (`a11y-pr-scope.mjs
 *   analysis.json`), and the PR title.
 * @output One `playwright test` run over the selected files; on a
 *   "[Component Audit] <Name>:" PR, that component's own axe pass first
 *   (`.github/a11y-audit-axe.json` holds the audits that need an open state, a
 *   different component set, or a different receipt folder); the selection,
 *   the JSON report, and the axe report in `pr-a11y-evidence/`.
 * @position `pnpm test:a11y-contract:pr`, run by the `pr-a11y` job in ci.yml;
 *   with `--changed-only` and `--owned-by`, by its
 *   `pr-component-a11y-contracts` job.
 *   Adding a browser spec needs no workflow change: the spec is discovered by
 *   its file name, and its own routing lines decide when a PR runs it. The
 *   release check runs every spec in `a11y-contracts` instead.
 *
 * Routing lines sit in the spec's header comment, one per line:
 *
 *   @pr-a11y always              every PR accessibility run, and release-check
 *   @pr-a11y scope <token> ...   also run when one token matches (see below)
 *   @pr-a11y audit <Name>, ...   only on a "[Component Audit] <Name>:" PR
 *   @pr-a11y release-only        the release check; on a PR only for its own
 *                                component (see below)
 *
 * A spec with no `always`, `audit`, or `release-only` line is scoped: a PR runs
 * it when it changes the spec, the spec's component folder, or a component the
 * spec is named after, or matches one of its `scope` tokens. A changed
 * knowledge record (`*.spec.md`) counts toward neither the folder nor a path
 * token: no browser renders it. A token starting
 * with `^` is a regular expression over changed paths; any other token is a
 * package-qualified component (`core/Selector`, `richtext/*`) matched against
 * the PR's component scope.
 *
 * Unknown scope (no merge base, no changed-file list) runs every scoped spec,
 * never fewer. A PR runs a `release-only` spec only when the spec changes, its
 * component folder changes, or a component it is named after is in scope;
 * never for a `scope` token or an unknown scope.
 *
 * `--changed-only <specs> --changed-files <files> --owned-by <components>
 * [--dependents-of <folders>]` (the default check of the components a pull
 * request touches, a wide change included): run the browser specs the pull
 * request adds or modifies, listed one per line in <specs>, then the `scoped`
 * and `release-only` specs that the comma-separated touched components own
 * (`ownedSpecs`; <files> lists every changed path, one per line, for the
 * folder-change rule), then the `scoped` and `release-only` specs of the
 * component folders that render a touched folder (`dependentSpecs`, nearest
 * first), in the time left. It reads no title and runs no component audit; a
 * changed `audit` spec still waits for its audit pull request. To stay inside the job's 15-minute budget
 * it takes at most CHANGED_SPEC_LIMIT changed files, starts each file only
 * when the run still fits PLAN_BUDGET_MS at that file's recorded time
 * (.github/a11y-contract-durations.json), and stops at
 * DEFAULT_CHECK_BUDGET_MS. Each file
 * it leaves out is reported as not run, never as passed or failed. Locally,
 * `pnpm test:a11y-contract:pr origin/main --dry-run` prints what a PR from
 * this branch would run.
 *
 * The CI step loads this file from the merge commit its steps come from
 * (`WORKFLOW_SHA`), and reads each spec's routing lines from that commit too,
 * so an older PR head is routed by current policy. It uses only Node
 * built-ins, since such a head may not have it.
 */

import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {costOf, splitByDuration} from '../../scripts/lib/duration-split.mjs';

export const EVIDENCE_DIR = 'pr-a11y-evidence';

const MODES = new Set(['always', 'audit', 'release-only', 'scoped']);

/**
 * Reads a spec's `@pr-a11y` routing lines.
 * @param {string} source
 * @returns {{mode: string, scope: string[], audits: string[]}}
 */
export function parseRouting(source) {
  const routing = {mode: 'scoped', scope: [], audits: []};
  const modes = new Set();
  for (const line of source.split('\n')) {
    const match =
      /^\s*(?:\/\/|\/?\*+)\s*@pr-a11y\s+([a-z-]+)\s*(.*?)\s*(?:\*\/)?\s*$/.exec(
        line,
      );
    if (!match) continue;
    const [, key, value] = match;
    if (key === 'scope') {
      const tokens = value.split(/\s+/).filter(Boolean);
      if (tokens.length === 0) throw new Error('@pr-a11y scope needs a token');
      for (const token of tokens) {
        if (token.startsWith('^')) new RegExp(token);
        else if (!/^[a-z][a-z0-9-]*\/(\*|[A-Z][A-Za-z0-9]*)$/.test(token)) {
          throw new Error(`@pr-a11y scope token is not a component: ${token}`);
        }
      }
      routing.scope.push(...tokens);
    } else if (key === 'audit') {
      const names = value.split(/[\s,]+/).filter(Boolean);
      if (names.length === 0 || names.some(n => !/^[A-Z]\w*$/.test(n))) {
        throw new Error(`@pr-a11y audit needs component names: ${value}`);
      }
      routing.audits.push(...names);
      modes.add('audit');
    } else if (key === 'always' || key === 'release-only') {
      if (value) throw new Error(`@pr-a11y ${key} takes no value`);
      modes.add(key);
    } else {
      throw new Error(`Unknown @pr-a11y routing line: ${key}`);
    }
  }
  if (modes.size > 1) {
    throw new Error(`Conflicting @pr-a11y modes: ${[...modes].join(', ')}`);
  }
  if (modes.size === 1) routing.mode = [...modes][0];
  if (!MODES.has(routing.mode)) throw new Error(routing.mode);
  return routing;
}

/**
 * The folder and component names a spec belongs to by its location.
 * `packages/core/src/Chat/__tests__/ChatSendButton.a11y.chromium.spec.ts`
 * belongs to `packages/core/src/Chat/` and to `core/Chat` and
 * `core/ChatSendButton`.
 * @param {string} file repository-relative path
 */
export function specOwners(file) {
  const base = path.posix.basename(file);
  const named = base.split('.')[0].replace(/Audit$/, '');
  const pkg = /^packages\/([^/]+)\/src\/([^/]+)\//.exec(file);
  if (pkg) {
    const [, packageName, top] = pkg;
    const folder = /^[A-Z]/.test(top)
      ? `packages/${packageName}/src/${top}/`
      : null;
    const components = new Set();
    if (folder) components.add(`${packageName}/${top}`);
    if (/^[A-Z]/.test(named)) components.add(`${packageName}/${named}`);
    return {prefixes: folder ? [folder] : [], components: [...components]};
  }
  // A pattern's files share its stem: `menu.ts`, `menu.fixtures.ts`, but not
  // `menu-button.ts`.
  return {
    prefixes: [`${path.posix.dirname(file)}/${named}.`],
    components: [],
  };
}

function componentMatches(token, components) {
  if (token.endsWith('/*')) {
    const prefix = token.slice(0, -1);
    return components.some(component => component.startsWith(prefix));
  }
  return components.includes(token);
}

/**
 * Audited component names from a "[Component Audit] <Name>: ..." title. Like
 * GitHub's `startsWith`, the match ignores case; names compare with
 * `sameComponent`.
 * @param {string} title
 */
export function auditedComponents(title) {
  const match = /^\[component audit\] (\w+):/i.exec(title ?? '');
  return match ? [match[1]] : [];
}

/** Component names compared without case, as an audit title is. */
export function sameComponent(a, b) {
  return a.toLowerCase() === b.toLowerCase();
}

/** `DropdownMenuItem` -> `dropdown-menu-item`. */
export function kebab(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * The audited component's own axe pass and evidence, from the default and
 * its entry in `.github/a11y-audit-axe.json`, if any.
 * @param {string} name
 * @param {Record<string, object>} config
 */
export function auditPlan(name, config) {
  const entry = (name !== '$comment' && config[name]) || {};
  const known = new Set([
    'components',
    'stories',
    'readySelector',
    'env',
    'report',
    'evidence',
  ]);
  for (const key of Object.keys(entry)) {
    if (!known.has(key)) throw new Error(`a11y-audit-axe.json ${name}: ${key}`);
  }
  const report = entry.report ?? kebab(name);
  return {
    components: entry.components ?? [name],
    stories: entry.stories ?? [],
    readySelector: entry.readySelector ?? null,
    env: entry.env ?? {},
    reportFile: `${EVIDENCE_DIR}/${report}-a11y-report.json`,
    evidence:
      entry.evidence === undefined
        ? `${report}-audit-evidence`
        : entry.evidence,
  };
}

/**
 * The audit plan for a "[Component Audit] <Name>:" title, or null when no
 * spec names the audit and the config has no entry for it: such a name may
 * have no owned Storybook route, and axe must not be handed it.
 * @param {string | undefined} name
 * @param {{routing: {audits: string[]}}[]} specs
 * @param {Record<string, object>} config
 */
export function planFor(name, specs, config) {
  if (!name) return null;
  const canonical =
    Object.keys(config).find(
      key => key !== '$comment' && sameComponent(key, name),
    ) ??
    specs
      .flatMap(({routing}) => routing.audits)
      .find(audit => sameComponent(audit, name));
  return canonical ? auditPlan(canonical, config) : null;
}

/** The `accessibility-audit.js` arguments for an audit plan. */
export function auditArgs(plan) {
  return [
    '.github/scripts/accessibility-audit.js',
    '--storybook-dir',
    'apps/storybook/dist',
    '--output',
    plan.reportFile,
    '--components',
    plan.components.join(','),
    ...(plan.stories.length ? ['--stories', plan.stories.join(',')] : []),
    ...(plan.readySelector ? ['--ready-selector', plan.readySelector] : []),
    '--baseline',
    '.github/a11y-baseline.json',
    '--fail-on-new',
  ];
}

/**
 * Decides which specs run and why.
 * @param {object} options
 * @param {{file: string, routing: ReturnType<typeof parseRouting>}[]} options.specs
 * @param {boolean} options.isPullRequest
 * @param {string[] | null} options.changedPaths null when unknown
 * @param {string[]} options.components the PR's package-qualified components
 * @param {string} options.title the PR title
 * @returns {{file: string, reason: string}[]}
 */
export function selectSpecs({
  specs,
  isPullRequest,
  changedPaths,
  components,
  title,
}) {
  const audited = auditedComponents(title);
  // A knowledge record (`<Name>.spec.md`) is Markdown no browser renders, so a
  // changed record selects no spec by its folder or a path token.
  const rendered = changedPaths?.filter(p => !isKnowledgeRecord(p));
  const selected = [];
  for (const {file, routing} of specs) {
    const reason = (() => {
      if (routing.mode === 'always') return 'always';
      if (!isPullRequest) return null;
      if (routing.mode === 'audit') {
        const name = routing.audits.find(n =>
          audited.some(a => sameComponent(a, n)),
        );
        return name ? `component audit ${name}` : null;
      }
      if (changedPaths == null) {
        return routing.mode === 'release-only' ? null : 'scope unknown';
      }
      if (changedPaths.includes(file)) return 'spec changed';
      const owners = specOwners(file);
      for (const prefix of owners.prefixes) {
        const hit = rendered.find(p => p.startsWith(prefix));
        if (hit) return `changed ${hit}`;
      }
      for (const component of owners.components) {
        if (components.includes(component)) return `component ${component}`;
      }
      if (routing.mode === 'release-only') return null;
      for (const token of routing.scope) {
        if (token.startsWith('^')) {
          const pattern = new RegExp(token);
          const hit = rendered.find(p => pattern.test(p));
          if (hit) return `changed ${hit}`;
        } else if (componentMatches(token, components)) {
          return `component ${token}`;
        }
      }
      return null;
    })();
    if (reason) selected.push({file, reason});
  }
  return selected;
}

/** The most changed spec files the default check runs. */
export const CHANGED_SPEC_LIMIT = 4;

/** The default check's wall-clock bound, inside the job's 15 minutes. */
export const DEFAULT_CHECK_BUDGET_MS = 8 * 60 * 1000;

/**
 * The time the default check plans: three quarters of its stop. A
 * pull-request runner can run a file slower than its recorded time even with
 * the margin, and a file that the stop cuts fails the run, so the plan keeps
 * the last quarter free.
 */
export const PLAN_BUDGET_MS = 6 * 60 * 1000;

/**
 * The times come from the release legs. A pull-request runner can be slower,
 * and a file that the budget stops fails the run. Thus the plan adds a margin
 * to each recorded time and keeps time for Playwright to start.
 */
export const RECORDED_TIME_MARGIN = 1.25;
export const STARTUP_MS = 30 * 1000;

/**
 * The most a run spends on the specs of folders that render a touched
 * component: their share of the projected time, after the changed and owned
 * specs.
 */
export const DEPENDENT_SHARE_MS = 60 * 1000;

/** The expected time of a file that has no recorded time. */
const UNRECORDED_FILE_SECONDS = 60;

const TITLE_DELIMITER = ' \u203A ';

/**
 * Split a changed-only selection at the limit: the first files, in path order,
 * run; the rest are not run, with the label that runs them.
 * @param {{file: string, reason: string}[]} selected
 * @param {number} [limit]
 */
export function withinBudget(selected, limit = CHANGED_SPEC_LIMIT) {
  const ordered = [...selected].sort((a, b) => a.file.localeCompare(b.file));
  return {
    run: ordered.slice(0, limit),
    notRun: ordered.slice(limit).map(({file}) => ({
      file,
      reason: `over the default check's ${limit}-file budget; add ci:run-a11y to run it`,
    })),
  };
}

/** Whether a path is inside a component folder (`packages/<pkg>/src/<Name>/`). */
export function isComponentPath(file) {
  return /^packages\/[^/]+\/src\/[A-Z][^/]*\//.test(file);
}

/**
 * The `scoped` and `release-only` specs the touched components own. It is the
 * labelled run's selection (`selectSpecs`) with two limits: only changes inside
 * a component folder count, so a change to a shared module, the contract
 * harness or a story selects nothing; and an `audit` or `always` spec is never
 * owned. With no touched component nothing is owned.
 * @param {object} options
 * @param {{file: string, routing: ReturnType<typeof parseRouting>}[]} options.specs
 * @param {string[]} options.components package-qualified touched components
 * @param {string[]} options.changedPaths
 * @returns {{file: string, reason: string}[]}
 */
export function ownedSpecs({specs, components, changedPaths}) {
  if (components.length === 0) return [];
  return selectSpecs({
    specs: specs.filter(
      ({routing}) =>
        routing.mode === 'scoped' || routing.mode === 'release-only',
    ),
    isPullRequest: true,
    changedPaths: changedPaths.filter(isComponentPath),
    components,
    title: '',
  });
}

// The component folders that render a touched component (spec:AST-030 FR12).
// The CI step runs this file alone from the merge commit, so it imports no
// repository module. The graph is file by file over value imports and
// re-exports (`import type` and `export type` put no code on a page): a
// relative specifier, a package subpath (`@astryxdesign/core/internal/touch`),
// or a named import from a package root, through that package's folder
// barrels. Reach crosses shared files (`utils`, `hooks`, `internal`) without
// counting a step; each step into another component folder counts one.

const SOURCE = /\.(?:[cm]?[jt]sx?)$/;
const NOT_RENDERED =
  /(?:^|\/)__tests__\/|\.(?:test|stories|doc)\.[^/]+$|\.spec\.[^/]+$|\.d\.ts$/;
const STATEMENT =
  /(?:^|[\n;])\s*(import|export)\s+(type\s+)?([^'";]*?)\s*from\s*['"]([^'"]+)['"]|(?:^|[\n;])\s*import\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
/** The suffixes an import specifier resolves through, in order. */
export const RESOLVE_SUFFIXES = [
  '',
  '.ts',
  '.tsx',
  '.mts',
  '.js',
  '.jsx',
  '.mjs',
  '/index.ts',
  '/index.tsx',
  '/index.js',
];

const COMPONENT_FOLDER = /^packages\/([^/]+)\/src\/([A-Z][^/]*)\//;

/**
 * The component folder that holds a file, as `<package>/<Folder>`.
 * @param {string} file
 */
export const componentFolderOf = file => {
  const match = COMPONENT_FOLDER.exec(file);
  return match ? `${match[1]}/${match[2]}` : null;
};

/**
 * The folder path of the component a file belongs to: its component folder
 * (`packages/core/src/Button/`), else its package's source folder, as for a
 * package with no component folders (`packages/richtext/src/`).
 * @param {string} file
 * @returns {string | null}
 */
export const componentPathOf = file => {
  const match = COMPONENT_FOLDER.exec(file);
  if (match) return `packages/${match[1]}/src/${match[2]}/`;
  const source = /^packages\/([^/]+)\/src\//.exec(file);
  return source ? `packages/${source[1]}/src/` : null;
};

/**
 * Whether a file is source the import graph follows: code that can put
 * something on a page, never a test, story, doc or type declaration.
 * @param {string} file
 */
export function isRenderedSource(file) {
  return SOURCE.test(file) && !NOT_RENDERED.test(file);
}

function sourceFiles(root, dir) {
  const out = [];
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) return out;
  for (const entry of fs.readdirSync(full, {withFileTypes: true})) {
    const file = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist')
        out.push(...sourceFiles(root, file));
    } else if (isRenderedSource(file)) {
      out.push(file);
    }
  }
  return out;
}

/**
 * The value imports of one source text: `[{specifier, names}]`, where `names`
 * lists the named value bindings (empty for a default, namespace or bare
 * import, which take the whole module).
 */
export function valueImports(text) {
  const out = [];
  for (const match of text.matchAll(STATEMENT)) {
    // A bare `import './x'` or a dynamic `import('./x')` takes the module.
    if (match[5] || match[6]) {
      out.push({specifier: match[5] ?? match[6], names: []});
      continue;
    }
    if (match[2]) continue;
    const clause = match[3] ?? '';
    const braced = /\{([^}]*)\}/.exec(clause);
    const names = braced
      ? braced[1]
          .split(',')
          .map(part => part.trim())
          .filter(part => part && !part.startsWith('type '))
          .map(part => part.split(/\s+as\s+/)[0].trim())
      : [];
    const outsideBraces = clause
      .replace(/\{[^}]*\}/, '')
      .replace(/,/g, '')
      .trim();
    // `import {type A, type B} from` imports no value.
    if (braced && names.length === 0 && !outsideBraces) continue;
    out.push({specifier: match[4], names: outsideBraces ? [] : names});
  }
  return out;
}

/**
 * Edges `imported file -> importing files` over the packages' rendered
 * sources.
 * @param {string} root
 * @returns {Map<string, Set<string>>}
 */
export function importerGraph(root) {
  const packagesDir = path.join(root, 'packages');
  const packages = fs.existsSync(packagesDir)
    ? fs
        .readdirSync(packagesDir)
        .filter(pkg => fs.existsSync(path.join(packagesDir, pkg, 'src')))
    : [];
  const files = packages.flatMap(pkg =>
    sourceFiles(root, `packages/${pkg}/src`),
  );
  const known = new Set(files);
  const texts = new Map(
    files.map(file => [file, fs.readFileSync(path.join(root, file), 'utf8')]),
  );
  const resolve = target => {
    for (const suffix of RESOLVE_SUFFIXES) {
      if (known.has(`${target}${suffix}`)) return `${target}${suffix}`;
    }
    return null;
  };
  // A barrel's named exports (`index.ts`): each name to the file it comes
  // from, one `export *` level deep.
  const barrels = new Map();
  const namesOf = index => {
    if (barrels.has(index)) return barrels.get(index);
    const names = new Map();
    barrels.set(index, names);
    for (const {specifier, names: own} of valueImports(texts.get(index))) {
      if (!specifier.startsWith('.')) continue;
      const target = resolve(
        path.posix.normalize(`${path.posix.dirname(index)}/${specifier}`),
      );
      if (!target) continue;
      for (const name of own) names.set(name, target);
      if (own.length === 0) {
        for (const inner of valueImports(texts.get(target))) {
          for (const name of inner.names) names.set(name, target);
        }
        for (const match of texts
          .get(target)
          .matchAll(/export\s+(?:const|function|class)\s+(\w+)/g)) {
          names.set(match[1], target);
        }
      }
    }
    return names;
  };
  const isBarrel = file => /\/index\.[cm]?[jt]sx?$/.test(file ?? '');
  const importers = new Map();
  const add = (imported, importer) => {
    if (!imported || imported === importer) return;
    if (!importers.has(imported)) importers.set(imported, new Set());
    importers.get(imported).add(importer);
  };
  // Named imports from a barrel reach only the files those names come from.
  const link = (target, names, file) => {
    if (!target) return;
    if (!isBarrel(target) || names.length === 0) return add(target, file);
    const barrel = namesOf(target);
    for (const name of names) add(barrel.get(name) ?? target, file);
  };
  for (const file of files) {
    for (const {specifier, names} of valueImports(texts.get(file))) {
      if (specifier.startsWith('.')) {
        link(
          resolve(
            path.posix.normalize(`${path.posix.dirname(file)}/${specifier}`),
          ),
          names,
          file,
        );
        continue;
      }
      const match = /^@astryxdesign\/([^/]+)(?:\/(.+))?$/.exec(specifier);
      if (!match || !packages.includes(match[1])) continue;
      const [, pkg, subpath] = match;
      link(
        resolve(
          subpath
            ? `packages/${pkg}/src/${subpath}`
            : `packages/${pkg}/src/index`,
        ),
        names,
        file,
      );
    }
  }
  return importers;
}

/**
 * The component folders that render a touched folder, nearest first, then in
 * path order. A step from one component folder into another counts one;
 * steps inside a folder or through shared files count none.
 * @param {Map<string, Set<string>>} importers
 * @param {string[]} touched `<pkg>/<Folder>`
 * @returns {{folder: string, depth: number}[]}
 */
export function renderingFolders(importers, touched) {
  const touchedSet = new Set(touched);
  const depth = new Map();
  const deque = [];
  for (const file of importers.keys()) {
    if (touchedSet.has(componentFolderOf(file))) {
      depth.set(file, 0);
      deque.push(file);
    }
  }
  for (const [, set] of importers) {
    for (const file of set) {
      if (touchedSet.has(componentFolderOf(file)) && !depth.has(file)) {
        depth.set(file, 0);
        deque.push(file);
      }
    }
  }
  while (deque.length > 0) {
    const file = deque.shift();
    const here = depth.get(file);
    const folder = componentFolderOf(file);
    for (const importer of importers.get(file) ?? []) {
      const target = componentFolderOf(importer);
      if (touchedSet.has(target)) continue;
      const step = target && target !== folder ? 1 : 0;
      const next = here + step;
      if (depth.has(importer) && depth.get(importer) <= next) continue;
      depth.set(importer, next);
      if (step === 0) deque.unshift(importer);
      else deque.push(importer);
    }
  }
  const folders = new Map();
  for (const [file, d] of depth) {
    const folder = componentFolderOf(file);
    if (!folder || touchedSet.has(folder)) continue;
    if (!folders.has(folder) || folders.get(folder) > d) folders.set(folder, d);
  }
  return [...folders]
    .map(([folder, d]) => ({folder, depth: d}))
    .sort((a, b) => a.depth - b.depth || a.folder.localeCompare(b.folder));
}

/**
 * The listed file an import target names, through `RESOLVE_SUFFIXES`, or
 * null.
 * @param {Set<string>} known every listed file
 * @param {string} target a repository path without its suffix
 */
export function resolveModule(known, target) {
  for (const suffix of RESOLVE_SUFFIXES)
    if (known.has(`${target}${suffix}`)) return `${target}${suffix}`;
  return null;
}

/**
 * The files each proof page loads through value imports, followed file by
 * file: relative specifiers and `@astryxdesign/<package>` roots and paths.
 * The roots are the interaction specs and what their pages render: the
 * Storybook stories, Storybook's preview, and each fixture a spec bundles
 * (a quoted path in the spec that names a listed file). A unit test, doc,
 * record or
 * accessibility spec in a component folder puts nothing on a proof's page
 * and selects no proof, unless a root loads it; this map finds that case
 * (spec:AST-030 FR31). It throws when a root or a file it loads cannot be
 * read, so a caller runs every proof instead. `read` reads a file; by
 * default from `root`, and a sparse checkout passes one that falls back to
 * the commit.
 * @param {{root: string, listed: string[], isProof: (file: string) => boolean, read?: (file: string) => string}} options
 * @returns {Map<string, Set<string>>} each loaded file, to the roots that load it
 */
export function proofImporters({
  root,
  listed,
  isProof,
  read = file => fs.readFileSync(path.join(root, file), 'utf8'),
}) {
  const known = new Set(listed);
  const resolve = target => resolveModule(known, target);
  const targetOf = (file, specifier) => {
    if (specifier.startsWith('.'))
      return resolve(
        path.posix.normalize(`${path.posix.dirname(file)}/${specifier}`),
      );
    const match = /^@astryxdesign\/([^/]+)(?:\/(.+))?$/.exec(specifier);
    return match
      ? resolve(`packages/${match[1]}/src/${match[2] ?? 'index'}`)
      : null;
  };
  // A spec bundles a fixture by path (`new URL('./fixture.ts', …)`,
  // `bundleOf('fixture.ts')`): every quoted path beside it that names a
  // listed source file counts as an import.
  const QUOTED_PATH = /['"`]((?:\.{1,2}\/)?[\w./-]+\.[cm]?[jt]sx?)['"`]/g;
  const bundledBy = (file, text) =>
    [...text.matchAll(QUOTED_PATH)]
      .map(match =>
        resolve(
          path.posix.normalize(
            `${path.posix.dirname(file)}/${match[1].replace(/^(?!\.)/, './')}`,
          ),
        ),
      )
      .filter(Boolean);
  const imports = new Map();
  const importsOf = file => {
    if (!imports.has(file)) {
      const text = read(file);
      imports.set(file, [
        ...valueImports(text)
          .map(({specifier}) => targetOf(file, specifier))
          .filter(Boolean),
        ...(isProof(file) ? bundledBy(file, text) : []),
      ]);
    }
    return imports.get(file);
  };
  const importers = new Map();
  for (const proof of listed.filter(isProof)) {
    const seen = new Set([proof]);
    const queue = [proof];
    while (queue.length > 0) {
      for (const target of importsOf(queue.pop())) {
        if (seen.has(target)) continue;
        seen.add(target);
        queue.push(target);
        if (!importers.has(target)) importers.set(target, new Set());
        importers.get(target).add(proof);
      }
    }
  }
  return importers;
}

/**
 * The `scoped` and `release-only` specs of the component folders that render a
 * touched folder, nearest first, then in path order, leaving out `planned`.
 * @param {{file: string, routing: {mode: string}}[]} specs
 * @param {{folder: string, depth: number}[]} rendering
 * @param {Set<string>} planned
 */
export function dependentSpecs(specs, rendering, planned) {
  const depthOf = new Map(rendering.map(({folder, depth}) => [folder, depth]));
  const folderOf = file => {
    const match = /^packages\/([^/]+)\/src\/([^/]+)\//.exec(file);
    return match ? `${match[1]}/${match[2]}` : null;
  };
  return specs
    .filter(
      ({file, routing}) =>
        (routing.mode === 'scoped' || routing.mode === 'release-only') &&
        !planned.has(file) &&
        depthOf.has(folderOf(file)),
    )
    .map(({file}) => ({file, depth: depthOf.get(folderOf(file))}))
    .sort((a, b) => a.depth - b.depth || a.file.localeCompare(b.file))
    .map(({file, depth}) => ({
      file,
      reason: `renders a touched component${depth > 1 ? ` (${depth} folders away)` : ''}`,
    }));
}

/**
 * Recorded seconds per spec file. Test entries (file and title path) are left
 * out.
 * @param {{seconds?: Record<string, number>}} durations
 */
export function fileSeconds(durations) {
  return Object.fromEntries(
    Object.entries(durations?.seconds ?? {}).filter(
      ([key, value]) =>
        !key.includes(TITLE_DELIMITER) && Number.isFinite(value),
    ),
  );
}

/**
 * The wall-clock time of one Playwright run. Playwright gives whole files, in
 * path order, to the first free worker.
 * @param {string[]} files
 * @param {(file: string) => number} msOf
 * @param {number} workers
 */
export function projectedMs(files, msOf, workers) {
  const busyUntil = Array.from({length: Math.max(1, workers)}, () => 0);
  for (const file of [...files].sort()) {
    const next = busyUntil.indexOf(Math.min(...busyUntil));
    busyUntil[next] += msOf(file);
  }
  return Math.max(...busyUntil);
}

function median(values) {
  if (values.length === 0) return UNRECORDED_FILE_SECONDS;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** The longest one opt-in accessibility leg should take. */
export const LEG_BUDGET_MS = 10 * 60 * 1000;

/**
 * The legs an opt-in run needs: enough that each leg's recorded time fits
 * LEG_BUDGET_MS, at most `maxLegs`, split slowest first onto the leg with the
 * least time (`splitByDuration`, as the other leg planners). The recorded
 * times come from release legs that run four files at once on four cores; one
 * file alone on a pull-request runner runs faster, so a leg sums them without
 * the default check's margin.
 * @param {string[]} files
 * @param {Record<string, number>} seconds
 * @param {number} maxLegs
 */
export function planLegs(files, seconds, maxLegs) {
  const cost = costOf(files, seconds);
  const sum = list => list.reduce((total, file) => total + cost(file), 0);
  const count = Math.min(
    Math.max(1, maxLegs),
    Math.max(1, Math.ceil((sum(files) * 1000) / LEG_BUDGET_MS)),
  );
  const shares = splitByDuration(files, count, cost);
  return {
    count,
    shares,
    longestMs: Math.max(...shares.map(share => sum(share) * 1000)),
  };
}

/**
 * The default check's run. First the changed specs, at most the limit, in path
 * order. Then the owned specs, in path order. Then the dependents' specs, in
 * the order given (nearest first), within their own share of the time. A file
 * starts only when the run still fits the budget with that file at its
 * recorded time (with the margin). The other files are not run, with the
 * label that runs them.
 * @param {object} options
 * @param {{file: string, reason: string}[]} options.changed
 * @param {{file: string, reason: string}[]} options.owned
 * @param {{file: string, reason: string}[]} [options.dependents]
 * @param {Record<string, number>} options.seconds recorded seconds per file
 * @param {number} options.workers
 * @param {number} [options.budgetMs]
 * @param {number} [options.dependentShareMs]
 */
export function planDefaultCheck({
  changed,
  owned,
  dependents = [],
  seconds,
  workers,
  budgetMs = PLAN_BUDGET_MS,
  dependentShareMs = DEPENDENT_SHARE_MS,
}) {
  const {run: changedInLimit, notRun} = withinBudget(changed);
  const fallback = median(Object.values(seconds));
  const secondsOf = file => seconds[file] ?? fallback;
  const msOf = file => secondsOf(file) * 1000 * RECORDED_TIME_MARGIN;
  const planned = new Set(changed.map(({file}) => file));
  const run = [];
  const files = [];
  const ordered = [...owned]
    .filter(({file}) => !planned.has(file))
    .sort((a, b) => a.file.localeCompare(b.file));
  const ownedFiles = new Set(ordered.map(({file}) => file));
  const after = dependents.filter(
    ({file}) => !planned.has(file) && !ownedFiles.has(file),
  );
  const tryRun = (entry, fits, limit) => {
    const withFile = [...files, entry.file];
    if (STARTUP_MS + projectedMs(withFile, msOf, workers) > budgetMs) {
      notRun.push({
        file: entry.file,
        reason: `${entry.reason}; its expected ${Math.round(secondsOf(entry.file))} s does not fit the default check's ${budgetMs / 60000}-minute plan; add ci:run-a11y to run it`,
      });
    } else if (!fits(withFile)) {
      notRun.push({
        file: entry.file,
        reason: `${entry.reason}; its expected ${Math.round(secondsOf(entry.file))} s does not fit the ${limit}; add ci:run-a11y to run it`,
      });
    } else {
      run.push(entry);
      files.push(entry.file);
    }
  };
  for (const entry of [...changedInLimit, ...ordered])
    tryRun(entry, () => true);
  const beforeDependents = projectedMs(files, msOf, workers);
  for (const entry of after) {
    tryRun(
      entry,
      withFile =>
        projectedMs(withFile, msOf, workers) - beforeDependents <=
        dependentShareMs,
      `${dependentShareMs / 60000}-minute share for folders that render a touched component`,
    );
  }
  return {run, notRun};
}

/**
 * The default check's job summary. A file that did not run is listed as not
 * run, so it never reads as passed.
 * @param {{components: string[], selected: {file: string, reason: string}[], notRun: {file: string, reason: string}[]}} plan
 */
export function summaryMarkdown({
  components,
  selected,
  notRun,
  rendering = [],
}) {
  const lines = ['### Component accessibility contracts', ''];
  lines.push(
    components.length
      ? `Touched components: ${components.map(c => `\`${c}\``).join(', ')}.`
      : 'No touched component.',
  );
  if (rendering.length) {
    lines.push(
      '',
      `Folders that render a touched component: ${rendering.length}; their specs run, nearest first, within ${DEPENDENT_SHARE_MS === 60 * 1000 ? 'one minute' : `${DEPENDENT_SHARE_MS / 60000} minutes`} of the time left.`,
    );
  }
  lines.push('');
  if (selected.length === 0 && notRun.length === 0) {
    lines.push('No accessibility contract to run.');
  }
  if (selected.length) {
    lines.push(`Ran ${selected.length} spec file(s):`, '');
    for (const {file, reason} of selected) {
      lines.push(`- \`${file}\` (${reason})`);
    }
    lines.push('');
  }
  if (notRun.length) {
    lines.push(
      `Not run: ${notRun.length} spec file(s). They did not pass or fail here; the release check runs them.`,
      '',
    );
    for (const {file, reason} of notRun) {
      lines.push(`- \`${file}\`: ${reason}`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

/**
 * The changed-only selection: of the specs the routing selects, only those the
 * pull request itself adds or modifies, each because it changed.
 * @param {{file: string, reason: string}[]} selected
 * @param {string[]} changedPaths
 */
export function changedOnly(selected, changedPaths) {
  const changed = new Set(changedPaths);
  return selected
    .filter(({file}) => changed.has(file))
    .map(({file}) => ({file, reason: 'spec changed'}));
}

/**
 * Path segments that never hold knowledge records. Mirrors
 * `IGNORED_COMPONENT_KNOWLEDGE_SEGMENTS` in `knowledge-paths.cjs` (a test
 * keeps them equal); copied because this runner uses only Node built-ins.
 */
export const IGNORED_RECORD_SEGMENTS = new Set([
  '__fixtures__',
  '__generated__',
  '__snapshots__',
  '__tests__',
  'build',
  'coverage',
  'dist',
  'fixtures',
  'generated',
  'node_modules',
  'test',
  'test-utils',
  'tests',
]);

/**
 * Whether a changed path is a knowledge record: Markdown, never rendered. A
 * hidden `*.spec.md`, one under a hidden, fixture, test, generated,
 * build-output, coverage, or dependency folder, or one named
 * `*.generated.spec.md`, is not a record (`architecture:knowledge-contracts` INV27), so it still selects specs.
 * @param {string} file
 */
export function isKnowledgeRecord(file) {
  if (!file.endsWith('.spec.md') || file.endsWith('.generated.spec.md')) {
    return false;
  }
  return !file
    .split('/')
    .some(
      segment =>
        segment.startsWith('.') || IGNORED_RECORD_SEGMENTS.has(segment),
    );
}

/** @param {{suites?: object[]}} listing Playwright JSON reporter output (`--list`). */
export function listedFiles(listing) {
  const files = new Set();
  const visit = suite => {
    for (const spec of suite.specs ?? []) files.add(spec.file ?? suite.file);
    for (const child of suite.suites ?? []) visit(child);
  };
  for (const suite of listing.suites ?? []) visit(suite);
  return [...files].filter(Boolean).sort();
}

function git(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/**
 * Files the PR changes since its merge base with `base`, or null when that
 * cannot be told. Deepens a shallow checkout until the merge base is found.
 * @param {string | undefined} base
 */
export function changedSinceMergeBase(base) {
  if (!base) return null;
  try {
    const head = git(['rev-parse', 'HEAD']);
    const shallow = () =>
      git(['rev-parse', '--is-shallow-repository']) === 'true';
    const has = rev => {
      try {
        git(['rev-parse', '--verify', '--quiet', `${rev}^{commit}`]);
        return true;
      } catch {
        return false;
      }
    };
    // Only CI's shallow checkout is fetched at a depth; a complete clone is
    // never made shallow. It fetches the base only when it lacks it.
    const fetch = extra =>
      git(['fetch', '--quiet', '--no-tags', ...extra, 'origin', base, head]);
    if (shallow()) fetch(['--depth=200']);
    else if (!has(base)) git(['fetch', '--quiet', '--no-tags', 'origin', base]);
    let mergeBase = null;
    for (;;) {
      try {
        mergeBase = git(['merge-base', base, head]);
        break;
      } catch {
        if (!shallow()) return null;
        fetch(['--deepen=200']);
      }
    }
    // --no-renames lists both sides of a move.
    return git(['diff', '--no-renames', '--name-only', mergeBase, head])
      .split('\n')
      .filter(Boolean);
  } catch {
    return null;
  }
}

/**
 * A spec's routing lines, the audit config and the recorded durations come
 * from the commit the workflow steps come from when it has the file (an older
 * PR head predates current routing); otherwise from the checkout.
 */
function readPolicySource(root, file, policySha) {
  if (policySha) {
    try {
      return execFileSync('git', ['show', `${policySha}:${file}`], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      // Not in that commit: the PR adds it.
    }
  }
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function readAuditConfig(root, file, policySha) {
  let source;
  try {
    source = readPolicySource(root, file, policySha);
  } catch {
    return {};
  }
  return JSON.parse(source);
}

function readDurations(root, policySha) {
  let source;
  try {
    source = readPolicySource(
      root,
      '.github/a11y-contract-durations.json',
      policySha,
    );
  } catch {
    return {};
  }
  return fileSeconds(JSON.parse(source));
}

/** The Playwright worker count, as playwright.config.ts reads it. */
function contractWorkers() {
  const workers = Number(process.env.A11Y_CONTRACT_WORKERS || 1);
  return Number.isInteger(workers) && workers > 0 ? workers : 1;
}

/** A file's non-empty lines, or null for no file name. */
function readLines(file) {
  if (!file) return null;
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
}

/** The value after a flag, or null when the flag is absent. */
function flagValue(argv, flag) {
  const index = argv.indexOf(flag);
  return index === -1 ? null : (argv[index + 1] ?? '');
}

function readComponents(root) {
  const analysis = path.join(root, 'analysis.json');
  if (!fs.existsSync(analysis)) {
    console.log(
      'No analysis.json: component scope is not evaluated, so specs selected only by a component token are left out. CI downloads it.',
    );
    return [];
  }
  const out = execFileSync(
    process.execPath,
    [path.join(root, '.github/scripts/a11y-pr-scope.mjs'), analysis],
    {cwd: root, encoding: 'utf8'},
  ).trim();
  return out ? out.split(',') : [];
}

function listSpecs(root) {
  const output = execFileSync(
    'pnpm',
    [
      'exec',
      'playwright',
      'test',
      '--list',
      '--reporter=json',
      '--config',
      'playwright.config.ts',
      '--project',
      'chromium',
    ],
    {cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024},
  );
  const listing = JSON.parse(output.slice(output.indexOf('{')));
  const testDir = listing.config?.rootDir ?? root;
  return listedFiles(listing).map(file =>
    path.relative(root, path.resolve(testDir, file)).split(path.sep).join('/'),
  );
}

function main() {
  const root = process.cwd();
  const argv = process.argv.slice(2);
  const isPullRequest = process.env.GITHUB_EVENT_NAME
    ? process.env.GITHUB_EVENT_NAME === 'pull_request'
    : true;
  const changedOnlyFile = flagValue(argv, '--changed-only');
  const changedFilesFile = flagValue(argv, '--changed-files');
  const ownedByValue = flagValue(argv, '--owned-by');
  const ownedBy = (ownedByValue ?? '').split(',').filter(Boolean);
  const dependentsOfValue = flagValue(argv, '--dependents-of');
  const dependentsOf = (dependentsOfValue ?? '').split(',').filter(Boolean);
  const countLegsValue = flagValue(argv, '--count-legs');
  const legValue = flagValue(argv, '--leg');
  const ofValue = flagValue(argv, '--of');
  const shareOutFile = flagValue(argv, '--share-out');
  const shareFile = flagValue(argv, '--share');
  if (
    (countLegsValue != null || shareFile != null) &&
    changedOnlyFile != null
  ) {
    throw new Error('--count-legs and --share split the opt-in run only');
  }
  if (
    (ownedByValue != null ||
      changedFilesFile != null ||
      dependentsOfValue != null) &&
    changedOnlyFile == null
  ) {
    throw new Error(
      '--owned-by, --changed-files and --dependents-of need --changed-only',
    );
  }
  // Without every changed path the folder rule selects nothing, and the
  // dropped contracts would read as passed.
  if (ownedBy.length > 0 && !changedFilesFile) {
    throw new Error(
      '--owned-by needs --changed-files with the list of changed paths',
    );
  }
  const flagValues = new Set([
    changedOnlyFile,
    changedFilesFile,
    ownedByValue,
    dependentsOfValue,
    countLegsValue,
    legValue,
    ofValue,
    shareOutFile,
    shareFile,
  ]);
  // Outside CI, a run with no base compares with origin/main.
  const base =
    process.env.BASE_SHA ||
    argv.find(arg => !arg.startsWith('-') && !flagValues.has(arg)) ||
    (process.env.GITHUB_ACTIONS ? undefined : 'origin/main');
  const policySha = process.env.WORKFLOW_SHA;
  const specs = listSpecs(root).map(file => ({
    file,
    routing: parseRouting(readPolicySource(root, file, policySha)),
  }));
  const changedPaths =
    changedOnlyFile != null
      ? fs.readFileSync(changedOnlyFile, 'utf8').split('\n').filter(Boolean)
      : isPullRequest
        ? changedSinceMergeBase(base)
        : [];
  const components =
    isPullRequest && changedOnlyFile == null ? readComponents(root) : [];
  const title =
    isPullRequest && changedOnlyFile == null
      ? (process.env.PR_TITLE ?? '')
      : '';
  const routed = selectSpecs({
    specs,
    // The changed-only run is always a pull request's.
    isPullRequest: isPullRequest || changedOnlyFile != null,
    changedPaths,
    components,
    title,
  });
  const rendering =
    changedOnlyFile != null && dependentsOf.length > 0
      ? renderingFolders(importerGraph(root), dependentsOf)
      : [];
  const budgeted = (() => {
    if (changedOnlyFile == null) return {run: routed, notRun: []};
    const changed = changedOnly(routed, changedPaths);
    const owned = ownedSpecs({
      specs,
      components: ownedBy,
      changedPaths: readLines(changedFilesFile) ?? changedPaths,
    });
    const planned = new Set([...changed, ...owned].map(({file}) => file));
    return planDefaultCheck({
      changed,
      owned,
      dependents: dependentSpecs(specs, rendering, planned),
      seconds: readDurations(root, policySha),
      workers: contractWorkers(),
    });
  })();
  const notRun = budgeted.notRun;
  // The opt-in run splits into legs by recorded time. The count step plans
  // them after the Storybook download, whose story index a changed
  // multi-component folder's components resolve through, and before the
  // Chromium install; each leg
  // then runs only its share.
  const scopeKnown = changedPaths != null;
  // Every leg counts on its own runner. A leg that cannot tell this pull
  // request's files would split another list than the other legs, so it
  // plans itself as the only leg, with the whole selection, as the
  // interaction legs do.
  const scopeLost = countLegsValue != null && isPullRequest && !scopeKnown;
  const legs =
    countLegsValue != null
      ? scopeLost
        ? planLegs(
            budgeted.run.map(({file}) => file),
            {},
            1,
          )
        : planLegs(
            budgeted.run.map(({file}) => file),
            readDurations(root, policySha),
            Number(countLegsValue),
          )
      : null;
  if (countLegsValue != null) {
    const leg = scopeLost ? 1 : Number(legValue ?? 1);
    if (scopeLost) {
      console.log(
        "::warning title=Accessibility scope unknown::This leg could not list the pull request's files, so it runs the whole selection as the only leg.",
      );
    }
    const minutes = (legs.longestMs / 60000).toFixed(1);
    console.log(
      `Accessibility legs: ${legs.count} for ${budgeted.run.length} spec files (the longest leg's recorded time ${minutes} min).`,
    );
    if (legs.longestMs > LEG_BUDGET_MS) {
      console.log(
        `::warning title=Accessibility specs over ten minutes::${legs.count} legs still leave ${minutes} min of recorded time in one leg. The selection needs more legs.`,
      );
    }
    // The run step reads this leg's share from here, so it runs exactly
    // what this count planned, never a selection of its own.
    if (shareOutFile) {
      const share = new Set(legs.shares[leg - 1] ?? []);
      fs.writeFileSync(
        shareOutFile,
        `${JSON.stringify({scopeKnown, run: budgeted.run.filter(({file}) => share.has(file))})}\n`,
      );
    }
    if (process.env.GITHUB_OUTPUT) {
      fs.appendFileSync(
        process.env.GITHUB_OUTPUT,
        `count=${legs.count}\nruns=${leg <= legs.count}\nleg=${leg}\n`,
      );
    }
    return 0;
  }
  const legIndex = legValue != null ? Number(legValue) : 1;
  // A leg runs the share its count step wrote. A missing or unreadable share
  // fails the leg, so a planned file is never dropped.
  const share =
    shareFile != null ? JSON.parse(fs.readFileSync(shareFile, 'utf8')) : null;
  const selected = share ? share.run : budgeted.run;
  const [audited] = auditedComponents(title);
  const auditConfigFile = '.github/a11y-audit-axe.json';
  const plan = planFor(
    audited,
    specs,
    readAuditConfig(root, auditConfigFile, policySha),
  );
  if (audited && !plan) {
    console.log(
      `No audit spec or ${auditConfigFile} entry names ${audited}; its own axe pass does not run (the scoped axe audit still covers changed components).`,
    );
  }

  fs.mkdirSync(EVIDENCE_DIR, {recursive: true});
  fs.writeFileSync(
    path.join(EVIDENCE_DIR, 'selection.json'),
    `${JSON.stringify(
      {
        head: process.env.ASTRYX_HEAD_SHA ?? null,
        discovered: specs.length,
        scopeKnown: share ? share.scopeKnown : scopeKnown,
        components,
        ownedBy,
        audit: plan && {component: audited, ...plan},
        selected,
        notRun,
      },
      null,
      2,
    )}\n`,
  );
  console.log(
    shareFile != null
      ? `PR accessibility specs, leg ${legIndex} of ${ofValue ?? '?'}: the ${selected.length} spec files of this leg's share.`
      : `PR accessibility specs: ${selected.length} of ${specs.length} discovered.`,
  );
  for (const {file, reason} of selected) console.log(`  ${file}  (${reason})`);
  for (const {file, reason} of notRun) {
    console.log(`::notice title=Not run::${file}: ${reason}`);
  }
  if (changedOnlyFile != null && process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      summaryMarkdown({components: ownedBy, selected, notRun, rendering}),
    );
  }
  if (process.argv.includes('--dry-run')) return 0;

  let status = 0;
  // A component audit's own axe pass, held until its open state is ready.
  // It runs once, on the first leg; every leg keeps the audit's environment
  // for the audit specs in its share.
  if (plan && legIndex === 1) {
    const axe = spawnSync(process.execPath, auditArgs(plan), {
      cwd: root,
      stdio: 'inherit',
    });
    if (axe.status !== 0) status = 1;
  }
  if (selected.length === 0) return status;

  // One run: Playwright keeps going past a failing file, and its own output
  // directory leaves the specs' evidence under test-results/ untouched. The
  // filters come before --project, which takes every value after it.
  const result = spawnSync(
    'pnpm',
    [
      'exec',
      'playwright',
      'test',
      ...selected.map(({file}) => file),
      '--config',
      'playwright.config.ts',
      '--reporter',
      // In CI, keep the config's `github` reporter so a failing spec still
      // annotates the pull request.
      process.env.GITHUB_ACTIONS ? 'list,json,github' : 'list,json',
      '--output',
      'pr-a11y-output',
      // The default check stops at its budget: an interrupted spec fails
      // the run, so a spec that did not finish is never read as passed.
      ...(changedOnlyFile != null
        ? ['--global-timeout', String(DEFAULT_CHECK_BUDGET_MS)]
        : []),
      '--project',
      'chromium',
    ],
    {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...process.env,
        ...(plan?.env ?? {}),
        PLAYWRIGHT_JSON_OUTPUT_FILE: path.join(EVIDENCE_DIR, 'report.json'),
      },
    },
  );
  if (result.status !== 0) status = 1;

  // An audit that ran its specs must leave their receipts.
  const ranAuditSpec = selected.some(({reason}) =>
    reason.startsWith('component audit'),
  );
  if (plan?.evidence && ranAuditSpec) {
    const found = [plan.evidence, `test-results/${plan.evidence}`].some(dir => {
      const full = path.join(root, dir);
      return fs.existsSync(full) && fs.readdirSync(full).length > 0;
    });
    if (!found) {
      console.error(
        `::error::The ${audited} audit wrote no receipts to ${plan.evidence}/ or test-results/${plan.evidence}/.`,
      );
      status = 1;
    }
  }
  return status;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
