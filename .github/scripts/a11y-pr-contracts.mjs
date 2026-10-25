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
 * @position `pnpm test:a11y-contract:pr`, run by the `pr-a11y` job in ci.yml.
 *   Adding a browser spec needs no workflow change: the spec is discovered by
 *   its file name, and its own routing lines decide when a PR runs it. The
 *   release check runs every spec in `a11y-contracts` instead.
 *
 * Routing lines sit in the spec's header comment, one per line:
 *
 *   @pr-a11y always              every PR accessibility run, and release-check
 *   @pr-a11y scope <token> ...   also run when one token matches (see below)
 *   @pr-a11y audit <Name>, ...   only on a "[Component Audit] <Name>:" PR
 *   @pr-a11y release-only        never on a PR; the release check runs it
 *
 * A spec with no `always`, `audit`, or `release-only` line is scoped: a PR runs
 * it when it changes the spec, the spec's component folder, or a component the
 * spec is named after, or matches one of its `scope` tokens. A token starting
 * with `^` is a regular expression over changed paths; any other token is a
 * package-qualified component (`core/Selector`, `richtext/*`) matched against
 * the PR's component scope.
 *
 * Unknown scope (no merge base, no changed-file list) runs every scoped spec,
 * never fewer. Locally, `pnpm test:a11y-contract:pr origin/main --dry-run`
 * prints what a PR from this branch would run.
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
  const selected = [];
  for (const {file, routing} of specs) {
    const reason = (() => {
      if (routing.mode === 'always') return 'always';
      if (!isPullRequest || routing.mode === 'release-only') return null;
      if (routing.mode === 'audit') {
        const name = routing.audits.find(n =>
          audited.some(a => sameComponent(a, n)),
        );
        return name ? `component audit ${name}` : null;
      }
      if (changedPaths == null) return 'scope unknown';
      if (changedPaths.includes(file)) return 'spec changed';
      const owners = specOwners(file);
      for (const prefix of owners.prefixes) {
        const hit = changedPaths.find(p => p.startsWith(prefix));
        if (hit) return `changed ${hit}`;
      }
      for (const component of owners.components) {
        if (components.includes(component)) return `component ${component}`;
      }
      for (const token of routing.scope) {
        if (token.startsWith('^')) {
          const pattern = new RegExp(token);
          const hit = changedPaths.find(p => pattern.test(p));
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
 * A spec's routing lines (and the audit config) come from the commit the
 * workflow steps come from when it has the file (an older PR head predates
 * current routing); otherwise from the checkout.
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
  const isPullRequest = process.env.GITHUB_EVENT_NAME
    ? process.env.GITHUB_EVENT_NAME === 'pull_request'
    : true;
  // Outside CI, a run with no base compares with origin/main.
  const base =
    process.env.BASE_SHA ||
    process.argv.slice(2).find(arg => !arg.startsWith('-')) ||
    (process.env.GITHUB_ACTIONS ? undefined : 'origin/main');
  const policySha = process.env.WORKFLOW_SHA;
  const specs = listSpecs(root).map(file => ({
    file,
    routing: parseRouting(readPolicySource(root, file, policySha)),
  }));
  const changedPaths = isPullRequest ? changedSinceMergeBase(base) : [];
  const components = isPullRequest ? readComponents(root) : [];
  const title = isPullRequest ? (process.env.PR_TITLE ?? '') : '';
  const selected = selectSpecs({
    specs,
    isPullRequest,
    changedPaths,
    components,
    title,
  });
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
        scopeKnown: changedPaths != null,
        components,
        audit: plan && {component: audited, ...plan},
        selected,
      },
      null,
      2,
    )}\n`,
  );
  console.log(
    `PR accessibility specs: ${selected.length} of ${specs.length} discovered.`,
  );
  for (const {file, reason} of selected) console.log(`  ${file}  (${reason})`);
  if (process.argv.includes('--dry-run')) return 0;

  let status = 0;
  // A component audit's own axe pass, held until its open state is ready.
  if (plan) {
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
