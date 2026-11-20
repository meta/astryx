// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Arm bases, their controls, and per-run workspaces outside the repo.
 * @input an arm descriptor and a run directory
 * @output an installed, control-checked base and fresh copies of it
 * @position Called by run.mjs before any agent starts
 */

import {spawn} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {armTemplateDir} from './arms.mjs';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);

/**
 * Runs a command without a shell, in its own process group. npx starts the
 * real tool as a grandchild, so a timeout kills the whole group.
 * @returns {Promise<{code: number | null, output: string, timedOut: boolean, ms: number}>}
 */
export function run(command, {cwd, timeoutMs = 300_000, env} = {}) {
  const started = Date.now();
  return new Promise(resolve => {
    const child = spawn(command[0], command.slice(1), {
      cwd,
      env: {...process.env, ...env},
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    let output = '';
    const append = chunk => {
      output += chunk;
      if (output.length > 200_000) output = output.slice(-200_000);
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    let timedOut = false;
    let settled = false;
    const finish = code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({code, output, timedOut, ms: Date.now() - started});
    };
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup(child);
      finish(null);
    }, timeoutMs);
    child.on('close', code => finish(code));
    child.on('error', error => {
      output += String(error);
      finish(null);
    });
  });
}

/** Kills a detached child and every process it started. */
export function killGroup(child) {
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    child.kill('SIGKILL');
  }
}

export function isInside(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

/** A run directory must sit outside the repository so agents cannot reach it. */
export function assertOutsideRepo(dir) {
  const resolved = path.resolve(dir);
  if (isInside(resolved, REPO_ROOT)) {
    throw new Error(`run directory must be outside the repository: ${resolved}`);
  }
  return resolved;
}

export function defaultRunDir() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(os.tmpdir(), 'astryx-vibe-eval', stamp);
}

/** sha256 over sorted relative paths and contents, node_modules and dist excluded. */
export function hashTree(root) {
  const hash = crypto.createHash('sha256');
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true}).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        hash.update(path.relative(root, full));
        hash.update('\0');
        hash.update(fs.readFileSync(full));
        hash.update('\0');
      }
    }
  };
  walk(root);
  return hash.digest('hex');
}

function installedVersions(base, packages) {
  return Object.fromEntries(
    packages.map(name => {
      const manifest = path.join(base, 'node_modules', name, 'package.json');
      const version = fs.existsSync(manifest)
        ? JSON.parse(fs.readFileSync(manifest, 'utf8')).version
        : null;
      return [name, version];
    }),
  );
}

/** Errors that tsc reports for one file. */
export function tscErrorsIn(output, file) {
  return output
    .split('\n')
    .filter(line => line.includes(file) && /error TS\d+/.test(line));
}

/**
 * Installs the arm once and proves the grader can tell good from bad:
 * the placeholder passes both checks, the negative control fails both.
 */
export async function prepareArmBase(arm, runDir, log = () => {}) {
  const base = path.join(runDir, 'bases', arm.id);
  fs.rmSync(base, {recursive: true, force: true});
  fs.cpSync(armTemplateDir(arm), base, {recursive: true});
  const templateHash = hashTree(base);

  log(`${arm.id}: installing`);
  const install = await run(arm.install, {cwd: base, timeoutMs: 900_000});
  if (install.code !== 0) {
    throw new Error(`${arm.id}: install failed\n${install.output.slice(-4000)}`);
  }

  const entry = path.join(base, arm.entry);
  const checks = async () => ({
    typecheck: await run(arm.typecheck, {cwd: base}),
    build: await run(arm.build, {cwd: base}),
  });

  fs.writeFileSync(entry, arm.negativeControl);
  const negative = await checks();
  const controlErrors = tscErrorsIn(negative.typecheck.output, arm.entry);
  if (negative.typecheck.code === 0 || controlErrors.length < 2) {
    throw new Error(
      `${arm.id}: negative control did not fail the type check with 2 errors ` +
        `(exit ${negative.typecheck.code}, ${controlErrors.length} errors)\n` +
        negative.typecheck.output.slice(-4000),
    );
  }
  if (negative.build.code === 0) {
    throw new Error(`${arm.id}: negative control did not fail the build`);
  }

  fs.writeFileSync(entry, arm.placeholder);
  const positive = await checks();
  if (positive.typecheck.code !== 0 || positive.build.code !== 0) {
    throw new Error(
      `${arm.id}: the untouched starter does not pass its checks\n` +
        positive.typecheck.output.slice(-2000) +
        positive.build.output.slice(-2000),
    );
  }
  fs.rmSync(path.join(base, 'dist'), {recursive: true, force: true});

  return {
    base,
    templateHash,
    versions: installedVersions(base, arm.packages),
    controls: {
      negativeTypecheckErrors: controlErrors.length,
      negativeBuildFailed: true,
      placeholderPasses: true,
    },
  };
}

/** A fresh, independent copy of the base for one agent run. */
export function createWorkspace(base, dest) {
  fs.rmSync(dest, {recursive: true, force: true});
  fs.mkdirSync(path.dirname(dest), {recursive: true});
  fs.cpSync(base, dest, {recursive: true, verbatimSymlinks: true});
  return fs.realpathSync(dest);
}
