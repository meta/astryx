#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Template audit ledger reader, writer, queue, stats, and wiki publisher.
 * @input Template scorecards, the canonical rubric exported by
 *   packages/cli/assets/docs/tree/template-quality.doc.mjs, and page/block
 *   templates under packages/cli/assets/templates.
 * @output Validated template-scores.json updates, summaries, and optional wiki
 *   pushes.
 * @position Ledger persistence for the public rubric. Category ids, weights,
 *   version, and grade bands are owned by the shipped template-quality doc.
 *
 * SYNC: Keep this schema aligned with apps/sandbox/src/data/templateAudits.ts.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {TEMPLATE_RUBRIC} from '../packages/cli/assets/docs/tree/template-grading-rubric.doc.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const TEMPLATE_LEDGER_FILENAME = 'template-scores.json';
export const TEMPLATE_LEDGER_URL =
  'https://raw.githubusercontent.com/wiki/meta/astryx/template-scores.json';
export const WIKI_REMOTE = 'https://github.com/meta/astryx.wiki.git';
export const WIKI_BRANCH = 'master';
export const TEMPLATE_AUDITS_PAGE_URL =
  'https://astryx.atmeta.com/sandbox/templates/';
export const LEDGER_FETCH_TIMEOUT_MS = 10_000;
export const WIKI_CACHE_DIR = path.join(
  os.tmpdir(),
  'astryx-template-score-ledger-wiki',
);

export const TEMPLATE_CATEGORIES = Object.freeze(
  TEMPLATE_RUBRIC.categories.map(({id, title, max}) =>
    Object.freeze({id, title, max}),
  ),
);

const CATEGORY_BY_ID = new Map(
  TEMPLATE_CATEGORIES.map(category => [category.id, category]),
);
const CATEGORY_STATUSES = new Set([
  'published',
  'inferred',
  'intermediate',
  'unresolved',
]);
const AUDIT_STATUSES = new Set(['historical', 'current']);
const LEDGER_FIELDS = new Set([
  'ledgerVersion',
  'rubricVersion',
  'updated',
  'about',
  'caveats',
  'templates',
]);
const AUDIT_FIELDS = new Set([
  'id',
  'score',
  'grade',
  'recordedGrade',
  'status',
  'lastAudited',
  'commit',
  'pr',
  'rubricVersion',
  'categories',
  'findings',
  'topFixes',
  'evidence',
  'notes',
]);
const SCORECARD_FIELDS = new Set(
  [...AUDIT_FIELDS].filter(field => field !== 'id' && field !== 'status'),
);
const CATEGORY_FIELDS = new Set(['score', 'status', 'note']);
const EVIDENCE_FIELDS = new Set(['label', 'href']);

const USAGE = `
Usage: node scripts/template-score-ledger.mjs <subcommand> [options]

Subcommands
  --queue                 Unaudited templates first, then oldest and lowest-scoring.
  --stats                 Coverage and score summary.
  --record <type/slug>    Write one page or block template audit.

Options
  --ledger <path|url>       Ledger source. Default: the wiki raw URL.
                            --record needs a local path, --dry-run, or --push.
  --from <file|->           --record scorecard JSON; '-' reads stdin.
  --limit <n>               --queue row limit (default 5).
  --allow-regression <why>  Permit a lower score and put the reason in the commit.
  --push                    Clone/refresh the wiki, commit, rebase, and push.
  --dry-run                 Print the ledger diff and commit message; write nothing.
  --json                    Machine-readable queue/stats output.
`.trim();

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertNoUnknownFields(value, allowed, label) {
  const unknown = Object.keys(value).filter(key => !allowed.has(key));
  assert(
    unknown.length === 0,
    `${label}: unknown field(s): ${unknown.join(', ')}`,
  );
}

function assertNonEmptyString(value, label) {
  assert(
    typeof value === 'string' && value.trim() !== '',
    `${label} is required`,
  );
}

export function templateGrade(score) {
  return TEMPLATE_RUBRIC.grades.find(({min}) => score >= min)?.grade ?? 'F';
}

export function isTemplateId(id) {
  return (
    typeof id === 'string' &&
    /^(page|block)\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)
  );
}

function validateCategory(value, id, auditId) {
  assert(isRecord(value), `${auditId}: category ${id} must be an object`);
  assertNoUnknownFields(value, CATEGORY_FIELDS, `${auditId}: category ${id}`);
  const definition = CATEGORY_BY_ID.get(id);
  assert(definition, `${auditId}: unknown category id "${id}"`);
  assert(
    value.score === null ||
      (typeof value.score === 'number' &&
        Number.isFinite(value.score) &&
        value.score >= 0 &&
        value.score <= definition.max),
    `${auditId}: category ${id} score must be null or between 0 and ${definition.max}`,
  );
  assert(
    CATEGORY_STATUSES.has(value.status),
    `${auditId}: category ${id} has unknown status "${String(value.status)}"`,
  );
  assert(
    value.note === undefined || typeof value.note === 'string',
    `${auditId}: category ${id} note must be a string`,
  );
}

function validateEvidence(value, auditId, index) {
  assert(isRecord(value), `${auditId}: evidence ${index} must be an object`);
  assertNoUnknownFields(
    value,
    EVIDENCE_FIELDS,
    `${auditId}: evidence ${index}`,
  );
  assertNonEmptyString(value.label, `${auditId}: evidence ${index} label`);
  assert(
    value.href === undefined || typeof value.href === 'string',
    `${auditId}: evidence ${index} href must be a string`,
  );
}

export function validateAudit(value) {
  assert(isRecord(value), 'template audit must be an object');
  assertNoUnknownFields(value, AUDIT_FIELDS, 'template audit');
  assert(isTemplateId(value.id), `invalid template id "${String(value.id)}"`);
  assert(
    typeof value.score === 'number' &&
      Number.isFinite(value.score) &&
      value.score >= 0 &&
      value.score <= 100,
    `${value.id}: score must be between 0 and 100`,
  );
  const expectedGrade = templateGrade(value.score);
  assert(
    value.grade === expectedGrade,
    `${value.id}: grade ${String(value.grade)} contradicts score ${value.score}; expected ${expectedGrade}`,
  );
  assert(
    AUDIT_STATUSES.has(value.status),
    `${value.id}: status must be historical or current`,
  );
  assertNonEmptyString(value.lastAudited, `${value.id}: lastAudited`);
  assertNonEmptyString(value.commit, `${value.id}: commit`);
  assertNonEmptyString(value.rubricVersion, `${value.id}: rubricVersion`);
  assert(
    value.recordedGrade === undefined ||
      typeof value.recordedGrade === 'string',
    `${value.id}: recordedGrade must be a string`,
  );
  assert(
    value.pr === undefined || (Number.isInteger(value.pr) && value.pr > 0),
    `${value.id}: pr must be a positive integer`,
  );
  assert(
    isRecord(value.categories),
    `${value.id}: categories must be an object`,
  );
  for (const [id, category] of Object.entries(value.categories)) {
    validateCategory(category, id, value.id);
  }
  if (value.status === 'current') {
    const categoryIds = Object.keys(value.categories);
    const missing = TEMPLATE_CATEGORIES.filter(
      category => !Object.hasOwn(value.categories, category.id),
    ).map(category => category.id);
    assert(
      categoryIds.length === TEMPLATE_CATEGORIES.length && missing.length === 0,
      `${value.id}: current audits must include all seven categories` +
        (missing.length ? `; missing ${missing.join(', ')}` : ''),
    );
    const categoryScores = TEMPLATE_CATEGORIES.map(
      category => value.categories[category.id].score,
    );
    assert(
      categoryScores.every(score => typeof score === 'number'),
      `${value.id}: current audit category scores cannot be null`,
    );
    const categoryTotal = categoryScores.reduce((sum, score) => sum + score, 0);
    assert(
      Math.abs(categoryTotal - value.score) < 1e-9,
      `${value.id}: category scores total ${categoryTotal}, not overall score ${value.score}`,
    );
  }
  for (const field of ['findings', 'topFixes']) {
    assert(
      Array.isArray(value[field]),
      `${value.id}: ${field} must be an array`,
    );
    assert(
      value[field].every(item => typeof item === 'string'),
      `${value.id}: ${field} entries must be strings`,
    );
  }
  assert(
    Array.isArray(value.evidence),
    `${value.id}: evidence must be an array`,
  );
  value.evidence.forEach((item, index) =>
    validateEvidence(item, value.id, index),
  );
  assert(
    typeof value.notes === 'string',
    `${value.id}: notes must be a string`,
  );
  return value;
}

export function validateLedger(value) {
  assert(isRecord(value), 'template ledger must be an object');
  assertNoUnknownFields(value, LEDGER_FIELDS, 'template ledger');
  assert(
    Number.isInteger(value.ledgerVersion) && value.ledgerVersion > 0,
    'template ledger: ledgerVersion must be a positive integer',
  );
  assertNonEmptyString(value.rubricVersion, 'template ledger: rubricVersion');
  assertNonEmptyString(value.updated, 'template ledger: updated');
  assert(
    value.about === undefined || typeof value.about === 'string',
    'template ledger: about must be a string',
  );
  assert(
    value.caveats === undefined ||
      (Array.isArray(value.caveats) &&
        value.caveats.every(caveat => typeof caveat === 'string')),
    'template ledger: caveats must be an array of strings',
  );
  assert(
    Array.isArray(value.templates),
    'template ledger: templates must be an array',
  );
  value.templates.forEach(validateAudit);
  const ids = value.templates.map(audit => audit.id);
  assert(
    new Set(ids).size === ids.length,
    'template ledger: duplicate template ids',
  );
  return value;
}

const isUrl = source => /^https?:\/\//.test(source);

export async function loadLedger(
  source,
  {timeoutMs = LEDGER_FETCH_TIMEOUT_MS} = {},
) {
  try {
    let text;
    if (isUrl(source)) {
      const response = await fetch(source, {
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      text = await response.text();
    } else {
      text = fs.readFileSync(source, 'utf8');
    }
    return {ledger: validateLedger(JSON.parse(text)), error: null};
  } catch (error) {
    const message =
      error.name === 'TimeoutError'
        ? `no response within ${timeoutMs}ms`
        : error.message;
    return {ledger: null, error: `${source}: ${message}`};
  }
}

function findFilesRecursive(dir, pattern) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory())
      files.push(...findFilesRecursive(absolute, pattern));
    else if (pattern.test(entry.name)) files.push(absolute);
  }
  return files;
}

export function listTemplates(repoRoot = ROOT) {
  const templateRoot = path.join(
    repoRoot,
    'packages',
    'cli',
    'assets',
    'templates',
  );
  const pageRoot = path.join(templateRoot, 'pages');
  const blockRoot = path.join(templateRoot, 'blocks');
  const roster = [];

  if (fs.existsSync(pageRoot)) {
    for (const entry of fs.readdirSync(pageRoot, {withFileTypes: true})) {
      if (!entry.isDirectory()) continue;
      const code = path.join(pageRoot, entry.name, 'page.tsx');
      const doc = path.join(pageRoot, entry.name, 'template.doc.mjs');
      if (!fs.existsSync(code) || !fs.existsSync(doc)) continue;
      roster.push({
        id: `page/${entry.name}`,
        type: 'page',
        slug: entry.name,
        codePath: path.relative(repoRoot, code),
        docPath: path.relative(repoRoot, doc),
      });
    }
  }

  for (const doc of findFilesRecursive(blockRoot, /\.doc\.mjs$/)) {
    const slug = path.basename(doc, '.doc.mjs');
    const code = path.join(path.dirname(doc), `${slug}.tsx`);
    if (!fs.existsSync(code)) continue;
    roster.push({
      id: `block/${slug}`,
      type: 'block',
      slug,
      codePath: path.relative(repoRoot, code),
      docPath: path.relative(repoRoot, doc),
    });
  }

  return roster.sort((a, b) => a.id.localeCompare(b.id));
}

export function buildRoster(ledger, templates = listTemplates()) {
  validateLedger(ledger);
  const byId = new Map(ledger.templates.map(audit => [audit.id, audit]));
  const roster = templates.map(template => ({
    ...template,
    live: true,
    audit: byId.get(template.id) ?? null,
  }));
  const liveIds = new Set(roster.map(row => row.id));
  for (const audit of ledger.templates) {
    if (liveIds.has(audit.id)) continue;
    const [type, slug] = audit.id.split('/');
    roster.push({id: audit.id, type, slug, live: false, audit});
  }
  return roster.sort((a, b) => a.id.localeCompare(b.id));
}

export function buildQueue(roster, limit = Infinity) {
  const unaudited = roster
    .filter(row => row.live && !row.audit)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(row => ({id: row.id, why: 'never audited'}));
  const audited = roster
    .filter(row => row.audit)
    .sort((a, b) => {
      const byDate = String(a.audit.lastAudited).localeCompare(
        String(b.audit.lastAudited),
      );
      if (byDate !== 0) return byDate;
      if (a.audit.score !== b.audit.score) return a.audit.score - b.audit.score;
      return a.id.localeCompare(b.id);
    })
    .map(row => ({
      id: row.id,
      why:
        `audited ${row.audit.lastAudited} · ${row.audit.grade} ` +
        `${row.audit.score.toFixed(1)}${row.live ? '' : ' · NO LONGER IN THE ROSTER'}`,
    }));
  return [...unaudited, ...audited].slice(0, limit);
}

export function buildStats(roster) {
  const live = roster.filter(row => row.live);
  const audited = live.filter(row => row.audit);
  const scores = audited.map(row => row.audit.score);
  const grades = {A: 0, B: 0, C: 0, D: 0, F: 0};
  for (const row of audited) grades[row.audit.grade] += 1;
  const byType = {};
  for (const type of ['page', 'block']) {
    const rows = live.filter(row => row.type === type);
    byType[type] = {
      total: rows.length,
      audited: rows.filter(row => row.audit).length,
    };
  }
  return {
    total: live.length,
    audited: audited.length,
    unaudited: live.length - audited.length,
    percentAudited: live.length
      ? Math.round((audited.length / live.length) * 1000) / 10
      : 0,
    meanScore: scores.length
      ? Math.round(
          (scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10,
        ) / 10
      : null,
    grades,
    byType,
    oldestAudit: audited.map(row => row.audit.lastAudited).sort()[0] ?? null,
    newestAudit:
      audited
        .map(row => row.audit.lastAudited)
        .sort()
        .at(-1) ?? null,
    orphanRows: roster.filter(row => !row.live).map(row => row.id),
  };
}

export function applyScorecard(existing, scorecard, {id}) {
  assert(isTemplateId(id), `invalid template id "${String(id)}"`);
  assert(isRecord(scorecard), `${id}: scorecard must be an object`);
  assertNoUnknownFields(scorecard, SCORECARD_FIELDS, `${id}: scorecard`);

  const next = {
    id,
    score: null,
    grade: null,
    status: 'current',
    lastAudited: null,
    commit: null,
    rubricVersion: null,
    categories: {},
    findings: [],
    topFixes: [],
    evidence: [],
    notes: '',
    ...structuredClone(scorecard),
    id,
    status: 'current',
  };

  if (!Object.hasOwn(scorecard, 'grade'))
    next.grade = templateGrade(next.score);
  return validateAudit(next);
}

export function commitMessage(entry, {regression = null} = {}) {
  const subject =
    `template scores: ${entry.id} ${entry.grade} (${entry.score.toFixed(1)}), ` +
    `rubric ${entry.rubricVersion}`;
  if (!regression) return {subject, body: ''};
  return {
    subject,
    body: [
      `Regression allowed: ${regression.reason}`,
      '',
      `Score ${regression.from.toFixed(1)} → ${entry.score.toFixed(1)}.`,
    ].join('\n'),
  };
}

function git(cwd, ...argv) {
  return execFileSync('git', argv, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function tryGit(cwd, ...argv) {
  try {
    return {ok: true, out: git(cwd, ...argv)};
  } catch (error) {
    const out = `${error.stdout || ''}\n${error.stderr || ''}`.trim();
    return {ok: false, out: out || error.message};
  }
}

export function ensureWikiClone(dir = WIKI_CACHE_DIR, remote = WIKI_REMOTE) {
  if (fs.existsSync(path.join(dir, '.git'))) {
    git(dir, 'remote', 'set-url', 'origin', remote);
    git(dir, 'fetch', '--depth', '1', 'origin', WIKI_BRANCH);
  } else {
    fs.rmSync(dir, {recursive: true, force: true});
    git(
      os.tmpdir(),
      'clone',
      '--depth',
      '1',
      '--branch',
      WIKI_BRANCH,
      remote,
      dir,
    );
  }
  git(dir, 'checkout', '-B', WIKI_BRANCH, `origin/${WIKI_BRANCH}`);
  git(dir, 'reset', '--hard', `origin/${WIKI_BRANCH}`);
  git(dir, 'clean', '-fd');
  return dir;
}

export function repoFromWikiRemote(remote = WIKI_REMOTE) {
  const match = /github\.com[/:]([^/]+)\/(.+?)\.wiki(\.git)?$/.exec(remote);
  return match ? `${match[1]}/${match[2]}` : 'meta/astryx';
}

export function wikiCommitUrl(sha, remote = WIKI_REMOTE) {
  return `https://github.com/${repoFromWikiRemote(remote)}/wiki/_compare/${sha}`;
}

function requireGitIdentity(dir) {
  const name = tryGit(dir, 'config', 'user.name');
  const email = tryGit(dir, 'config', 'user.email');
  if (!name.ok || !name.out || !email.ok || !email.out) {
    throw new Error(
      'no git identity configured — set user.name and user.email before --push',
    );
  }
}

function unifiedDiff(before, after, label) {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'template-score-ledger-diff-'),
  );
  try {
    const a = path.join(dir, 'a');
    const b = path.join(dir, 'b');
    fs.writeFileSync(a, before);
    fs.writeFileSync(b, after);
    try {
      execFileSync(
        'diff',
        ['-u', '--label', `a/${label}`, '--label', `b/${label}`, a, b],
        {encoding: 'utf8'},
      );
      return '';
    } catch (error) {
      if (error.status === 1) return String(error.stdout);
      throw error;
    }
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

export function commitAndPush(dir, file, apply, {attempts = 2} = {}) {
  const root = fs.realpathSync(dir);
  const target = fs.realpathSync(file);
  const relative = path.relative(root, target) || path.basename(target);
  requireGitIdentity(root);
  let lastFailure = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const applied = apply();
    fs.writeFileSync(target, applied.text);
    const dirtyOthers = [
      ...git(root, 'diff', '--name-only', 'HEAD').split('\n'),
      ...git(root, 'ls-files', '--others', '--exclude-standard').split('\n'),
    ]
      .filter(Boolean)
      .filter(fileName => fileName !== relative);
    if (dirtyOthers.length) {
      throw new Error(
        `the wiki working copy has unrelated changes (${dirtyOthers.join(', ')})`,
      );
    }

    git(root, 'add', '--', relative);
    const {subject, body} = applied.message;
    const commitArgs = ['commit', '-m', subject];
    if (body) commitArgs.push('-m', body);
    const committed = tryGit(root, ...commitArgs);
    if (!committed.ok) {
      throw new Error(`could not commit the ledger: ${committed.out}`);
    }

    const pulled = tryGit(root, 'pull', '--rebase', 'origin', WIKI_BRANCH);
    if (!pulled.ok) {
      tryGit(root, 'rebase', '--abort');
      lastFailure = pulled.out;
      if (attempt < attempts) {
        console.log(
          'template-score-ledger: the wiki moved under us — re-applying onto the new tip.',
        );
        git(root, 'fetch', '--depth', '1', 'origin', WIKI_BRANCH);
        git(root, 'reset', '--hard', `origin/${WIKI_BRANCH}`);
        continue;
      }
      break;
    }

    const pushed = tryGit(root, 'push', 'origin', `HEAD:${WIKI_BRANCH}`);
    if (pushed.ok) {
      const sha = git(root, 'rev-parse', 'HEAD');
      return {sha, url: wikiCommitUrl(sha), applied};
    }
    lastFailure = pushed.out;
    const raced = /non-fast-forward|fetch first|rejected|stale info/i.test(
      pushed.out,
    );
    if (!raced || attempt >= attempts) break;
    console.log(
      'template-score-ledger: push rejected — re-applying and retrying once.',
    );
    git(root, 'fetch', '--depth', '1', 'origin', WIKI_BRANCH);
    git(root, 'reset', '--hard', `origin/${WIKI_BRANCH}`);
  }

  throw new Error(
    `could not push the ledger after ${attempts} attempt(s): ${lastFailure}\n` +
      'Nothing was published. If this is an auth failure, run `gh auth setup-git`.',
  );
}

function parseArgs(argv) {
  const args = {_: []};
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (!argument.startsWith('--')) {
      args._.push(argument);
      continue;
    }
    const key = argument.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('--')) args[key] = true;
    else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function flagValue(value) {
  return value === true || value === false || value == null ? null : value;
}

async function readLedgerForCommand(args) {
  const source = flagValue(args.ledger) || TEMPLATE_LEDGER_URL;
  const result = await loadLedger(source);
  if (!result.ledger) throw new Error(result.error);
  return result.ledger;
}

async function cmdQueue(args) {
  let ledger;
  try {
    ledger = await readLedgerForCommand(args);
  } catch (error) {
    console.error(`template-score-ledger: ${error.message}`);
    return 1;
  }
  const parsedLimit = Number.parseInt(flagValue(args.limit) || '5', 10);
  const limit =
    Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : 5;
  const queue = buildQueue(buildRoster(ledger), limit);
  if (args.json) console.log(JSON.stringify(queue, null, 2));
  else if (queue.length === 0) console.log('No templates in the queue.');
  else
    queue.forEach((row, index) =>
      console.log(`${index + 1}. ${row.id} — ${row.why}`),
    );
  return 0;
}

async function cmdStats(args) {
  let ledger;
  try {
    ledger = await readLedgerForCommand(args);
  } catch (error) {
    console.error(`template-score-ledger: ${error.message}`);
    return 1;
  }
  const stats = buildStats(buildRoster(ledger));
  if (args.json) console.log(JSON.stringify(stats, null, 2));
  else {
    console.log(
      `Template audit ledger — v${ledger.ledgerVersion}, rubric v${ledger.rubricVersion}`,
    );
    console.log(
      `  Audited:  ${stats.audited}/${stats.total} (${stats.percentAudited}%)`,
    );
    console.log(
      `  Mean:     ${stats.meanScore === null ? '—' : stats.meanScore.toFixed(1)}`,
    );
    console.log(
      `  Grades:   ${Object.entries(stats.grades)
        .map(([grade, count]) => `${grade} ${count}`)
        .join(' · ')}`,
    );
    console.log(
      `  Pages:    ${stats.byType.page.audited}/${stats.byType.page.total}`,
    );
    console.log(
      `  Blocks:   ${stats.byType.block.audited}/${stats.byType.block.total}`,
    );
  }
  return 0;
}

async function cmdRecord(args) {
  const id = flagValue(args.record);
  if (!isTemplateId(id)) {
    console.error(
      'template-score-ledger --record: pass a template id such as page/centered-hero or block/AppShellShowcase',
    );
    return 1;
  }
  const source = flagValue(args.from);
  if (!source) {
    console.error(
      'template-score-ledger --record: --from <scorecard.json|-> is required',
    );
    return 1;
  }

  let scorecard;
  try {
    scorecard = JSON.parse(
      source === '-'
        ? fs.readFileSync(0, 'utf8')
        : fs.readFileSync(source, 'utf8'),
    );
  } catch (error) {
    console.error(
      `template-score-ledger --record: could not read ${source} — ${error.message}`,
    );
    return 1;
  }

  if (args['allow-regression'] === true) {
    console.error(
      'template-score-ledger --record: --allow-regression needs a reason',
    );
    return 1;
  }

  const push = Boolean(args.push);
  const dryRun = Boolean(args['dry-run']);
  let ledgerPath = flagValue(args.ledger);
  let repoDir = null;
  if (ledgerPath && isUrl(ledgerPath)) {
    console.error(
      'template-score-ledger --record: --ledger must be a local path; use --push for the wiki',
    );
    return 1;
  }
  try {
    if (!ledgerPath) {
      if (!push && !dryRun) {
        console.error(
          'template-score-ledger --record: pass --push, --dry-run, or --ledger <path>',
        );
        return 1;
      }
      repoDir = ensureWikiClone();
      ledgerPath = path.join(repoDir, TEMPLATE_LEDGER_FILENAME);
    } else if (push) {
      const top = tryGit(
        path.dirname(path.resolve(ledgerPath)),
        'rev-parse',
        '--show-toplevel',
      );
      if (!top.ok) {
        console.error(
          'template-score-ledger --record: --push requires the ledger to be inside a wiki git clone',
        );
        return 1;
      }
      repoDir = top.out;
    }
  } catch (error) {
    console.error(`template-score-ledger --record: ${error.message}`);
    return 1;
  }

  const rosterIds = new Set(listTemplates().map(template => template.id));
  if (!rosterIds.has(id)) {
    console.log(
      `template-score-ledger: warning — ${id} is not in the current page/block roster; recording anyway.`,
    );
  }

  const applyOnce = () => {
    if (!fs.existsSync(ledgerPath)) {
      throw new Error(
        `${TEMPLATE_LEDGER_FILENAME} does not exist; refusing to create a partial one-row ledger. ` +
          'Bootstrap the wiki file from the bundled 25-row historical seed, then retry.',
      );
    }
    const raw = fs.readFileSync(ledgerPath, 'utf8');
    const ledger = validateLedger(JSON.parse(raw));
    const index = ledger.templates.findIndex(audit => audit.id === id);
    const before = index === -1 ? null : ledger.templates[index];
    const after = applyScorecard(before, scorecard, {id});
    let regression = null;
    if (before && after.score < before.score) {
      const reason = flagValue(args['allow-regression']);
      if (!reason) {
        throw new Error(
          `refusing — score decreased ${before.score} -> ${after.score}; re-run with --allow-regression "<why>"`,
        );
      }
      regression = {reason: String(reason), from: before.score};
    }
    if (index === -1) ledger.templates.push(after);
    else ledger.templates[index] = after;
    ledger.templates.sort((a, b) => a.id.localeCompare(b.id));
    ledger.updated = new Date().toISOString().slice(0, 10);
    validateLedger(ledger);
    return {
      before,
      after,
      regression,
      raw,
      text: `${JSON.stringify(ledger, null, 2)}\n`,
      message: commitMessage(after, {regression}),
    };
  };

  let applied;
  try {
    applied = applyOnce();
  } catch (error) {
    console.error(`template-score-ledger --record: ${error.message}`);
    return 1;
  }

  if (dryRun) {
    console.log(
      unifiedDiff(applied.raw, applied.text, TEMPLATE_LEDGER_FILENAME) ||
        `(${TEMPLATE_LEDGER_FILENAME} is already unchanged)`,
    );
    console.log('--- commit message ---');
    console.log(applied.message.subject);
    if (applied.message.body) console.log(`\n${applied.message.body}`);
    console.log(
      'template-score-ledger: --dry-run — nothing written or pushed.',
    );
    return 0;
  }

  if (push) {
    try {
      const result = commitAndPush(repoDir, ledgerPath, applyOnce);
      applied = result.applied;
      console.log(
        `template-score-ledger: recorded ${id} — ${applied.after.grade} ` +
          `${applied.after.score.toFixed(1)} and pushed ${result.sha.slice(0, 10)}`,
      );
      console.log(`  commit: ${result.url}`);
      console.log(`  live on: ${TEMPLATE_AUDITS_PAGE_URL}`);
      return 0;
    } catch (error) {
      console.error(`template-score-ledger --record: ${error.message}`);
      return 1;
    }
  }

  fs.writeFileSync(ledgerPath, applied.text);
  console.log(`template-score-ledger: recorded ${id} in ${ledgerPath}`);
  console.log(
    'template-score-ledger: not published — commit the wiki or use --push.',
  );
  return 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    console.log(USAGE);
    return 0;
  }
  if (args.queue) return cmdQueue(args);
  if (args.stats) return cmdStats(args);
  if (args.record) return cmdRecord(args);
  console.log(USAGE);
  return 1;
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  main().then(
    code => process.exit(code),
    error => {
      console.error(`template-score-ledger: ${error.message}`);
      process.exit(1);
    },
  );
}
