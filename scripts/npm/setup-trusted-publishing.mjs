#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * npm trusted-publishing maintainer script —
 * `node scripts/npm/setup-trusted-publishing.mjs [flags]`.
 *
 * A one-time / occasional MAINTAINER script (run locally by a human who has an
 * active npm session) that prepares every publishable @astryxdesign/* package
 * for npm TRUSTED PUBLISHING: OIDC-based publishing from GitHub Actions with no
 * long-lived npm token. Once configured, the `publish`/`canary` jobs in
 * .github/workflows/release.yml can publish with `--provenance` and zero secrets.
 *
 * It ports facebook/lexical's scripts/npm/setup-trusted-publishing.mjs to astryx
 * conventions (node:util parseArgs, node:fs, node:child_process, global fetch —
 * no minimist / fs-extra, which astryx does not declare). It does three
 * logically separable jobs, gated by flags:
 *
 *   1. CHECK (default, no write flags): read-only audit of which packages exist
 *      on the registry and which already have a matching trust config; print the
 *      npmjs.com /access URLs plus the exact values to enter manually.
 *   2. BOOTSTRAP (--bootstrap): npm trusted publishing can only be configured on
 *      a name that ALREADY EXISTS on the registry (unlike PyPI there is no
 *      "pending publisher"). None of the @astryxdesign/* names exist yet, so this
 *      mode publishes a deprecated 0.0.0-bootstrap.0 stub to claim each name.
 *   3. SETUP-TRUST (--setup-trust): run `npm trust github` per package to
 *      register the GitHub Actions OIDC trusted publisher, skipping packages that
 *      already match, optionally revoking + replacing conflicts (--replace).
 *
 * Modes combine: e.g. `--bootstrap --setup-trust` claims then configures in one
 * pass. `--dry-run` prints what would happen without any registry writes.
 *
 * This script does NOT publish real releases — that is release.yml's job. Its
 * only purpose is to make the tokenless OIDC publish in CI succeed.
 *
 * WHY `release.yml` is the default --workflow (the workflow_ref subtlety):
 *   npm validates a trusted publish by matching the trust config's workflow
 *   filename against the OIDC token's `workflow_ref` claim. `workflow_ref` is the
 *   CALLING (entry) workflow — the file that triggered the run — NOT a reusable
 *   workflow that merely contains the publish job (npm does not check
 *   `job_workflow_ref`). ALL of astryx's npm publishing (stable and canary) runs
 *   directly in the non-reusable .github/workflows/release.yml — deploy.yml is
 *   website-only — so the caller IS the publish workflow, and the filename to
 *   trust is `release.yml` (see release.yml's own header, which states the same
 *   single-trusted-publisher constraint).
 *
 * npm also allows only ONE trust config per package: POSTing a second config
 * (even for a different workflow) returns E409, which is why --workflow takes a
 * single filename and switching workflows requires --replace.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {execFile, spawn as nodeSpawn} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {expandWorkspaceDirs} from '../lib/workspace-globs.mjs';

// This script lives in scripts/npm/, so the repo root is two levels up.
const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);

// promisified execFile — resolves {stdout, stderr}, rejects on non-zero exit
// (the rejection error carries .stderr / .code). Used for the simple
// capture-style commands (npm whoami, npm --version, stub publish/deprecate).
const execFileAsync = promisify(execFile);

const MAX_TRUST_ATTEMPTS = 4;
const RATE_LIMIT_BACKOFF_BASE_MS = 5_000;
const RATE_LIMIT_BACKOFF_MAX_MS = 60_000;

// ---------------------------------------------------------------------------
// Package discovery
//
// Walks the pnpm-workspace.yaml globs (via scripts/lib/workspace-globs.mjs) and
// reads each package.json. The publishable filter mirrors check-changesets.mjs:
// non-private AND not in the changeset `ignore` list. There is no hardcoded
// package list — the set is derived from the workspace + .changeset/config.json.
// ---------------------------------------------------------------------------

function discoverPackages() {
  const pkgs = [];
  for (const dir of expandWorkspaceDirs(ROOT)) {
    const pj = path.join(dir, 'package.json');
    if (!fs.existsSync(pj)) continue;
    const p = JSON.parse(fs.readFileSync(pj, 'utf8'));
    if (p.name) {
      pkgs.push({
        dir,
        name: p.name,
        private: !!p.private,
        canaryOnly: !!p.astryx?.canaryOnly,
        version: p.version,
      });
    }
  }
  return pkgs;
}

function readChangesetConfig() {
  return JSON.parse(
    fs.readFileSync(path.join(ROOT, '.changeset', 'config.json'), 'utf8'),
  );
}

// The publishable @astryxdesign/* packages that need a trusted-publisher config.
// This includes canaryOnly packages (e.g. lab): they stay `private: true` in git
// as npm's hard guard against a stable publish, but they DO publish to the
// @canary dist-tag from CI, so their name must still be claimed (bootstrap) and
// trusted here. Everything else is included when non-private; ignored packages
// are always excluded. Sorted by npm name for deterministic, readable output.
function publishablePackages() {
  const config = readChangesetConfig();
  const ignore = new Set(config.ignore || []);
  return discoverPackages()
    .filter(p => (!p.private || p.canaryOnly) && !ignore.has(p.name))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// CLI flags (node:util parseArgs — astryx avoids minimist)
// ---------------------------------------------------------------------------

function parseCliArgs(argv) {
  const {values} = parseArgs({
    args: argv,
    options: {
      bootstrap: {type: 'boolean', default: false},
      'setup-trust': {type: 'boolean', default: false},
      'dry-run': {type: 'boolean', default: false},
      replace: {type: 'boolean', default: false},
      registry: {type: 'string', default: 'https://registry.npmjs.org'},
      'stub-version': {type: 'string', default: '0.0.0-bootstrap.0'},
      // The CALLING workflow filename npm should trust. For astryx this is the
      // single, non-reusable release.yml that runs ALL npm publishing (see the
      // workflow_ref subtlety in the file header and release.yml's own header).
      workflow: {type: 'string', default: 'release.yml'},
      repo: {type: 'string', default: 'meta/astryx'},
    },
    allowPositionals: false,
  });
  return values;
}

// ---------------------------------------------------------------------------
// pnpm env hygiene
//
// pnpm exports its own (pnpm-only) settings as npm_config_* env vars when
// running scripts. npm 11+ warns ("Unknown env config …") on each unrecognized
// one and threatens to error in npm 12. Strip both spellings (env var names use
// underscores; npm normalizes hyphens back when reading) from every spawned npm
// invocation so the OTP/web-auth output stays clean.
// ---------------------------------------------------------------------------

const PNPM_ONLY_NPM_CONFIG_KEYS = [
  'npm-globalconfig',
  'verify-deps-before-run',
  '_jsr-registry',
  'manage-package-manager-versions',
];

function npmCleanEnv() {
  const env = {...process.env};
  for (const key of PNPM_ONLY_NPM_CONFIG_KEYS) {
    delete env[`npm_config_${key}`];
    delete env[`npm_config_${key.replace(/-/g, '_')}`];
  }
  return env;
}

// ---------------------------------------------------------------------------
// runNpm — the interactive/captured npm spawner
//
// TTY rule this encodes: npm only runs its interactive web-auth/OTP recovery
// when BOTH stdin and stdout are TTYs (npm's `otplease`). So:
//   - Default mode inherits stdin+stdout, letting npm stream the OTP/web-auth
//     URL to the terminal in real time, while stderr is piped AND mirrored so it
//     can be classified (E409/E429).
//   - captureStdout mode pipes stdout (to parse JSON), which makes stdout a
//     non-TTY → a fresh OTP cannot be satisfied → hence the one warm-up read
//     in warmTrustAuth() must run first within npm's 5-minute 2FA-skip window.
// Never rejects: resolves {code, stdout, stderr}.
// ---------------------------------------------------------------------------

function runNpm(args, {captureStdout = false} = {}) {
  return new Promise(resolve => {
    const child = nodeSpawn('npm', args, {
      env: npmCleanEnv(),
      stdio: ['inherit', captureStdout ? 'pipe' : 'inherit', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    if (child.stdout) {
      child.stdout.on('data', chunk => {
        stdout += chunk;
      });
    }
    if (child.stderr) {
      child.stderr.on('data', chunk => {
        // Mirror stderr so the web-auth URL / OTP prompt is visible live, while
        // still capturing it for classification.
        process.stderr.write(chunk);
        stderr += chunk;
      });
    }
    child.on('error', err => {
      resolve({code: -1, stdout, stderr: stderr + String(err)});
    });
    child.on('close', code => {
      resolve({code: code ?? -1, stdout, stderr});
    });
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Preflights / auth gates
// ---------------------------------------------------------------------------

// `npm whoami` — only required before we mutate registry state. Returns the
// authenticated username, or null on failure.
async function checkAuth(registry) {
  try {
    const {stdout} = await execFileAsync('npm', [
      'whoami',
      '--registry',
      registry,
    ]);
    return stdout.trim();
  } catch {
    return null;
  }
}

// npm >= 11.15 is required. Older npm ignores `--allow-publish`, so the
// publisher it creates may only stage releases and CI's direct publish fails,
// and its `npm trust list` omits permissions, so every existing publisher
// reads as a conflict.
async function checkNpmTrustSupport() {
  let version;
  try {
    const {stdout} = await execFileAsync('npm', ['--version']);
    version = stdout.trim();
  } catch (err) {
    return {ok: false, reason: `Unable to determine npm version: ${err}`};
  }
  const [major, minor] = version.split('.').map(n => parseInt(n, 10));
  if (major < 11 || (major === 11 && minor < 15)) {
    return {
      ok: false,
      reason:
        `npm ${version} is too old for 'npm trust github'. ` +
        `Upgrade to npm >= 11.15 (\`npm i -g npm@latest\`) and re-run.`,
    };
  }
  try {
    await execFileAsync('npm', ['trust', '--help']);
  } catch (err) {
    return {
      ok: false,
      reason: `'npm trust' is not available in this npm (${version}): ${err}`,
    };
  }
  return {ok: true, version};
}

// ---------------------------------------------------------------------------
// Registry existence probe
// ---------------------------------------------------------------------------

// HEAD the registry for the package document. 404 → not on registry; res.ok →
// exists; anything else → throw (surface unexpected registry states).
async function packageExistsOnRegistry(registry, name) {
  const url = `${registry}/${name}`;
  const res = await fetch(url, {method: 'HEAD'});
  if (res.status === 404) return false;
  if (res.ok) return true;
  throw new Error(`Unexpected status ${res.status} from ${url}`);
}

// ---------------------------------------------------------------------------
// Bootstrap (stub publish) — claim the npm name so trust can be configured
// ---------------------------------------------------------------------------

function writeStubFiles(dir, pkg, {stubVersion, repo}) {
  const packageJson = {
    name: pkg.name,
    version: stubVersion,
    description:
      'Placeholder published to claim the npm name during trusted ' +
      'publishing setup. Do not install.',
    homepage: 'https://github.com/' + repo,
    license: 'MIT',
    repository: {type: 'git', url: `git+https://github.com/${repo}.git`},
  };
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify(packageJson, null, 2) + '\n',
  );
  fs.writeFileSync(
    path.join(dir, 'README.md'),
    `# ${pkg.name}\n\n` +
      `This is a \`${stubVersion}\` placeholder published only to claim the ` +
      `npm name while configuring npm trusted publishing. Do not install it; ` +
      `it will be superseded by the first real release.\n`,
  );
  // Carry the package's LICENSE through if it has one.
  const license = path.join(pkg.dir, 'LICENSE');
  if (fs.existsSync(license)) {
    fs.copyFileSync(license, path.join(dir, 'LICENSE'));
  }
}

// Publish a deprecated stub under dist-tag `bootstrap` (NOT latest) so the
// placeholder never becomes the default install target. Returns true on success.
async function publishStub(pkg, {registry, stubVersion, repo, dryRun}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-stub-'));
  try {
    writeStubFiles(tmpDir, pkg, {repo, stubVersion});
    if (dryRun) {
      console.log(`  [dry-run] Would publish ${pkg.name}@${stubVersion}`);
      return true;
    }
    try {
      await execFileAsync(
        'npm',
        [
          'publish',
          '--registry',
          registry,
          '--access',
          'public',
          '--tag',
          'bootstrap',
        ],
        {cwd: tmpDir},
      );
    } catch (err) {
      // 409: this version already exists, which means an earlier run claimed
      // the name. Registry reads can keep answering 404 for a few minutes after
      // a package is created, so a re-run lands here; continue to trust setup.
      if (
        /E409|409 Conflict/.test(`${err.stderr ?? ''}\n${err.message ?? ''}`)
      ) {
        console.log(
          `  ${pkg.name}@${stubVersion} already exists; the name is claimed`,
        );
        return true;
      }
      throw err;
    }
    console.log(`  Published ${pkg.name}@${stubVersion}`);
    // Best-effort deprecate — the stub is already published (which is what
    // unblocks trust setup), so a deprecation failure must not fail the run.
    await execFileAsync('npm', [
      'deprecate',
      '--registry',
      registry,
      `${pkg.name}@${stubVersion}`,
      'Bootstrap placeholder for trusted publishing setup; do not install',
    ]).catch(err => {
      console.warn(`  (warn) could not deprecate ${pkg.name}: ${err.message}`);
    });
    return true;
  } finally {
    fs.rmSync(tmpDir, {recursive: true, force: true});
  }
}

// ---------------------------------------------------------------------------
// Reading existing trust config (idempotency)
// ---------------------------------------------------------------------------

// One fully-interactive read first, so npm can satisfy a fresh OTP/web-auth
// challenge while stdout is a real TTY. The user should pick "Skip two-factor
// authentication for the next 5 minutes" so subsequent CAPTURED reads (which
// pipe stdout → non-TTY) succeed within that window.
async function warmTrustAuth(sampleName, {registry}) {
  console.log(
    `\nWarming up npm auth with an interactive read of ${sampleName}.\n` +
      `If prompted, complete web auth and choose ` +
      `"Skip two-factor authentication for the next 5 minutes" so the ` +
      `per-package checks that follow don't re-prompt.\n`,
  );
  return new Promise(resolve => {
    const child = nodeSpawn(
      'npm',
      ['trust', 'list', sampleName, '--registry', registry],
      {env: npmCleanEnv(), stdio: 'inherit'},
    );
    child.on('error', () => resolve(false));
    child.on('close', code => resolve(code === 0));
  });
}

// Read one package's trust config via `npm trust list <name> --json`. Returns
// {configs} (possibly empty) on success, or {error} on a genuine failure —
// failures are surfaced, not silently swallowed.
async function fetchTrustConfig(name, {registry}) {
  const {code, stdout, stderr} = await runNpm(
    ['trust', 'list', name, '--json', '--registry', registry],
    {captureStdout: true},
  );
  const combined = `${stdout}\n${stderr}`;
  // A package with no trust config 404s → treat as "no configs".
  if (/E404|not found/i.test(combined)) return {configs: []};
  const trimmed = stdout.trim();
  if (trimmed) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && parsed.error) {
        if (/E404/i.test(parsed.error.code || '')) return {configs: []};
        return {
          error: parsed.error.summary || parsed.error.code || 'unknown error',
        };
      }
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      return {configs: arr.filter(Boolean)};
    } catch {
      // Unparseable JSON but the command succeeded → treat as no configs.
      if (code === 0) return {configs: []};
    }
  }
  if (code === 0) return {configs: []};
  // Surface the first meaningful stderr line.
  const firstLine = stderr
    .split('\n')
    .map(l => l.replace(/^npm (error|warn)\s*/i, '').trim())
    .filter(l => l && !/^code\s/i.test(l))[0];
  return {error: firstLine || `npm exited ${code}`};
}

// `npm trust list --json` returns either a flattened shape
// ({file, repository, environment, id, type, permissions}) or a raw registry
// shape ({claims: {workflow_ref: {file}, repository, environment}}). Normalize.
const configFile = c => c.file ?? c.claims?.workflow_ref?.file;
const configRepo = c => c.repository ?? c.claims?.repository;
const configEnvironment = c => c.environment ?? c.claims?.environment;
const describeConfig = c => configFile(c) || c.type || '?';

// "Already configured" predicate. The stored permission name is `createPackage`
// even though the CLI flag we pass when adding is `--allow-publish`.
function configMatches(c, {repo, workflow}) {
  return (
    c.type === 'github' &&
    configRepo(c) === repo &&
    configFile(c) === workflow &&
    !configEnvironment(c) &&
    Array.isArray(c.permissions) &&
    c.permissions.includes('createPackage')
  );
}

// ---------------------------------------------------------------------------
// Adding the trust config — `npm trust github …`
// ---------------------------------------------------------------------------

// Returns 'configured' | 'already-configured' | 'dry-run' | 'failed'.
async function addTrustConfig(pkg, {registry, repo, workflow, dryRun}) {
  // Exact command:
  //   npm trust github <name> --file <workflow> --repo <owner/name>
  //     --registry <registry> --allow-publish -y
  const args = [
    'trust',
    'github',
    pkg.name,
    '--file',
    workflow,
    '--repo',
    repo,
    '--registry',
    registry,
    '--allow-publish', // surfaces in the stored config as `createPackage`
    '-y',
  ];
  if (dryRun) {
    console.log(`  [dry-run] npm ${args.join(' ')}`);
    return 'dry-run';
  }
  for (let attempt = 1; attempt <= MAX_TRUST_ATTEMPTS; attempt++) {
    // stdin+stdout inherited so the OTP/web-auth URL streams live; stderr piped
    // for E409/E429 classification.
    const {code, stderr} = await runNpm(args);
    if (code === 0) {
      console.log(`  Configured ${pkg.name}`);
      return 'configured';
    }
    // E409: the registry's way of saying this exact config already exists. This
    // is the safety net for the pre-check's "unable to check" / race cases.
    if (/code E409|409 Conflict/i.test(stderr)) {
      console.log(`  ${pkg.name} already configured (E409)`);
      return 'already-configured';
    }
    // E429: exponential backoff (5s, 10s, 20s … capped at 60s).
    if (
      /code E429|429 Too Many Requests/i.test(stderr) &&
      attempt < MAX_TRUST_ATTEMPTS
    ) {
      const backoff = Math.min(
        RATE_LIMIT_BACKOFF_MAX_MS,
        RATE_LIMIT_BACKOFF_BASE_MS * 2 ** (attempt - 1),
      );
      console.warn(
        `  Rate limited (E429); backing off ${backoff / 1000}s ` +
          `(attempt ${attempt}/${MAX_TRUST_ATTEMPTS})`,
      );
      await sleep(backoff);
      continue;
    }
    console.error(`  FAILED ${pkg.name} (npm exit ${code})`);
    return 'failed';
  }
  console.error(
    `  FAILED ${pkg.name} (gave up after ${MAX_TRUST_ATTEMPTS} attempts)`,
  );
  return 'failed';
}

// Revoke one existing config so a new one can replace it (npm allows only one
// config per package). Returns true on success.
async function revokeTrustConfig(name, id, {registry, dryRun}) {
  const args = ['trust', 'revoke', name, `--id=${id}`, '--registry', registry];
  if (dryRun) {
    console.log(`  [dry-run] npm ${args.join(' ')}`);
    return true;
  }
  const {code} = await runNpm(args);
  return code === 0;
}

// ---------------------------------------------------------------------------
// Manual-setup printout (when not running --setup-trust but config is needed)
// ---------------------------------------------------------------------------

function printManualSetup(entries, {repo, workflow}) {
  const [repoOwner, repoName] = repo.split('/');
  console.log('\nManual trusted-publishing setup on npmjs.com:');
  console.log('  Publisher:         GitHub Actions');
  console.log(`  Repository owner:  ${repoOwner}`);
  console.log(`  Repository name:   ${repoName}`);
  console.log(`  Workflow filename: ${workflow}`);
  console.log('  Environment:       (leave empty)');
  console.log('  Permissions:       Allow publish');
  console.log('\nConfigure each package at its /access page:');
  for (const e of entries) {
    const note =
      e.existing && e.existing.length > 0
        ? ` (will conflict with ${e.existing.length} existing config; use --replace)`
        : '';
    console.log(`  ${e.pkg.name}${note}`);
    console.log(`    https://www.npmjs.com/package/${e.pkg.name}/access`);
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const argv = parseCliArgs(process.argv.slice(2));

  const bootstrap = argv.bootstrap;
  const setupTrust = argv['setup-trust'];
  const dryRun = argv['dry-run'];
  const replace = argv.replace;
  const registry = argv.registry.replace(/\/+$/, '');
  const stubVersion = argv['stub-version'];
  const workflow = argv.workflow;
  const repo = argv.repo;

  // --workflow must be a single filename (npm allows one trust config per
  // package, matched against the OIDC workflow_ref claim).
  if (typeof workflow !== 'string' || workflow.includes(',')) {
    console.error(
      `Invalid --workflow value "${workflow}". Expected a single workflow ` +
        `filename, e.g. release.yml.`,
    );
    process.exit(1);
  }
  const [repoOwner, repoName] = repo.split('/');
  if (!repoOwner || !repoName) {
    console.error(
      `Invalid --repo value "${repo}". Expected owner/name, e.g. meta/astryx.`,
    );
    process.exit(1);
  }

  const pkgs = publishablePackages();
  console.log(
    `Found ${pkgs.length} publishable @astryxdesign/* package(s); ` +
      `target registry: ${registry}`,
  );
  console.log(
    `Trusting GitHub repo ${repo} via workflow ${workflow}` +
      (dryRun ? ' (dry-run)' : ''),
  );

  const willWrite = (bootstrap || setupTrust) && !dryRun;

  // Preflight: npm whoami before any mutation.
  if (willWrite) {
    const authedUser = await checkAuth(registry);
    if (!authedUser) {
      console.error(
        `npm whoami failed for ${registry}. ` +
          `Run 'npm login --registry ${registry}' before re-running.`,
      );
      process.exit(1);
    }
    console.log(`Authenticated to ${registry} as ${authedUser}`);
  }

  // Preflight: npm >= 11.15 with `npm trust` available, before any trust read
  // or write (the trust reads below run whenever this is not a pure dry run).
  if (setupTrust || !dryRun) {
    const support = await checkNpmTrustSupport();
    if (!support.ok) {
      console.error(support.reason);
      process.exit(1);
    }
    console.log(`Using npm ${support.version} (supports 'npm trust')`);
  }

  const failures = [];

  // --- Registry existence partition ----------------------------------------
  console.log('\nChecking registry for existing packages:');
  const existing = [];
  const missing = [];
  for (const pkg of pkgs) {
    const exists = await packageExistsOnRegistry(registry, pkg.name);
    console.log(`  ${pkg.name} ... ${exists ? 'exists' : 'NOT FOUND'}`);
    (exists ? existing : missing).push(pkg);
  }

  // --- Bootstrap missing names ---------------------------------------------
  if (missing.length > 0 && !bootstrap) {
    console.log(`\n${missing.length} package(s) are not on the registry yet:`);
    for (const pkg of missing) console.log(`  ${pkg.name}`);
    console.log(
      `\nRe-run with --bootstrap to publish placeholder stubs that claim ` +
        `these names, then configure trusted publishing.`,
    );
  } else if (missing.length > 0 && bootstrap) {
    console.log(`\nBootstrapping ${missing.length} missing package(s):`);
    for (const pkg of missing) {
      try {
        await publishStub(pkg, {dryRun, registry, repo, stubVersion});
      } catch (err) {
        console.error(
          `  FAILED to bootstrap ${pkg.name}: ${err.message || err}`,
        );
        failures.push(pkg.name);
      }
    }
  }

  // --- Choose trust candidates ---------------------------------------------
  // Everything already on the registry, plus (only under --bootstrap) the stubs
  // we just published successfully. Missing-without-bootstrap packages are not
  // candidates — `npm trust github` would fail on a name that doesn't exist.
  const trustCandidates = [
    ...existing,
    ...(bootstrap ? missing.filter(p => !failures.includes(p.name)) : []),
  ];

  if (trustCandidates.length === 0) {
    if (failures.length > 0) {
      throw new Error(
        `Setup did not complete for ${failures.length} package(s):\n` +
          failures.map(f => ` - ${f}`).join('\n'),
      );
    }
    console.log('\nNo packages are available to configure yet. Done.');
    return;
  }

  // --- Read existing trust config (idempotency) ----------------------------
  // The captured reads pipe stdout (non-TTY), so do one interactive warm-up
  // first to satisfy any OTP within npm's 5-minute 2FA-skip window. Only needed
  // when we actually intend to read/mutate trust state.
  if ((setupTrust || !dryRun) && trustCandidates.length > 0) {
    await warmTrustAuth(trustCandidates[0].name, {registry});
  }

  console.log('\nReading existing trust config:');
  const toRegister = [];
  const conflicts = [];
  let anyUnknown = false;
  for (const pkg of trustCandidates) {
    const {configs, error} = await fetchTrustConfig(pkg.name, {registry});
    if (error || !configs) {
      console.log(
        `  ${pkg.name} ... unable to check (${error}); will try anyway`,
      );
      anyUnknown = true;
      toRegister.push({pkg, existing: []});
    } else if (configs.some(c => configMatches(c, {repo, workflow}))) {
      console.log(`  ${pkg.name} ... already configured`);
    } else if (configs.length > 0) {
      console.log(
        `  ${pkg.name} ... CONFLICT: existing config(s) for ` +
          `[${configs.map(describeConfig).join(', ')}]`,
      );
      conflicts.push({pkg, existing: configs});
    } else {
      console.log(`  ${pkg.name} ... needs configuration`);
      toRegister.push({pkg, existing: []});
    }
  }
  if (anyUnknown) {
    console.warn(
      '\n(warn) Some packages could not be checked; an existing config cannot ' +
        'be auto-revoked for those, and `npm trust github` may return E409.',
    );
  }

  // --- Setup trust (or print manual instructions) --------------------------
  if (!setupTrust) {
    if (toRegister.length > 0 || conflicts.length > 0) {
      printManualSetup([...toRegister, ...conflicts], {repo, workflow});
      console.log(
        '\nRe-run with --setup-trust to configure these automatically ' +
          '(add --replace to overwrite conflicting configs).',
      );
    } else {
      console.log('\nAll candidate packages are already configured. Done.');
    }
  } else {
    // Conflicts without --replace: report and stop touching them.
    if (conflicts.length > 0 && !replace) {
      console.log(
        `\n${conflicts.length} package(s) have a conflicting trust config:`,
      );
      for (const c of conflicts) {
        console.log(
          `  ${c.pkg.name} -> [${c.existing.map(describeConfig).join(', ')}]`,
        );
      }
      console.log(
        '\nnpm allows only one trust configuration per package, so adding a ' +
          'new one returns E409 while the old one is present. Re-run with ' +
          '--replace to revoke the old config(s) first.',
      );
    }

    const actionable = replace ? [...toRegister, ...conflicts] : toRegister;
    if (actionable.length > 0) {
      console.log(
        '\nConfiguring trusted publishers. On the first OTP/web-auth prompt, ' +
          'choose "Skip two-factor authentication for the next 5 minutes" so ' +
          'subsequent packages go through without re-prompting.\n',
      );
    }

    for (let i = 0; i < actionable.length; i++) {
      const entry = actionable[i];
      // Space requests out to stay under the E429 rate limit.
      if (i > 0) await sleep(2_000);

      // Revoke any existing config first (only conflicts carry these).
      let revokeFailed = false;
      if (entry.existing && entry.existing.length > 0) {
        for (let j = 0; j < entry.existing.length; j++) {
          const cfg = entry.existing[j];
          if (!cfg.id) continue;
          if (j > 0) await sleep(2_000);
          const ok = await revokeTrustConfig(entry.pkg.name, cfg.id, {
            dryRun,
            registry,
          });
          if (!ok) {
            console.error(`  FAILED to revoke ${entry.pkg.name} (${cfg.id})`);
            failures.push(`${entry.pkg.name} (revoke failed)`);
            revokeFailed = true;
            break;
          }
        }
      }
      if (revokeFailed) continue;

      const result = await addTrustConfig(entry.pkg, {
        dryRun,
        registry,
        repo,
        workflow,
      });
      if (result === 'failed') failures.push(entry.pkg.name);
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Setup did not complete for ${failures.length} package(s):\n` +
        failures.map(f => ` - ${f}`).join('\n'),
    );
  }

  console.log('\nDone.');
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
