// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file agent-docs-target.mjs
 * @input The folder a run starts in, the home folder, and the package.json
 *   files and repository markers above the folder
 * @output AgentDocsHomeError, assertAgentDocsTarget, resolveAgentDocsRoot and
 *   agentDocsTargetDir, with the realDir and REPOSITORY_MARKERS helpers
 * @position The folder agent docs go to. It imports node builtins only, so the
 *   per-command setup nudge (clients/cli/index.mjs) loads it without
 *   agent-docs.mjs's discovery and config. agent-docs.mjs re-exports it.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * Thrown when agent docs would be written into the home folder, or into a
 * settings folder in it such as `~/.gemini` outside a project. Agents read the
 * files there (for example `~/.claude/CLAUDE.md` or `~/.gemini/GEMINI.md`) in
 * every project, so a project's version-pinned block never goes there. Removal
 * stays allowed.
 */
export class AgentDocsHomeError extends Error {
  /** @param {string} dir */
  constructor(dir) {
    super(
      `Agent docs are not written into the home folder, or into a settings folder in it outside a project (${dir}): agents read the files there in every project. Run init inside a project folder.`,
    );
    this.name = 'AgentDocsHomeError';
    /** The refused folder. */
    this.dir = dir;
  }
}

/**
 * `p` resolved, through symlinks when it exists.
 * @param {string} p
 * @returns {string}
 */
export function realDir(p) {
  try {
    return fs.realpathSync(path.resolve(p));
  } catch {
    return path.resolve(p);
  }
}

/**
 * `dir` relative to the home folder, compared without symlinks (and without
 * case on Windows). null when there is no home folder.
 * @param {string} dir
 * @returns {string | null}
 */
function relativeToHome(dir) {
  let home;
  try {
    home = os.homedir();
  } catch {
    return null;
  }
  if (!home) return null;
  /** @param {string} p */
  const fold = p => (process.platform === 'win32' ? p.toLowerCase() : p);
  return path.relative(fold(realDir(home)), fold(realDir(dir)));
}

/**
 * Whether `dir` is the home folder.
 * @param {string} dir
 * @returns {boolean}
 */
function isHomeFolder(dir) {
  return relativeToHome(dir) === '';
}

/**
 * Whether agent docs stay out of `dir`: the home folder, or a folder in a
 * settings folder of it (a folder of the home folder whose name starts with a
 * dot, such as `~/.gemini` or `~/.claude`) that belongs to no project there.
 * Agents read the files at the top of a settings folder in every project, so
 * the settings folder itself is never a project, even with a package.json. A
 * folder below it with a package.json at or above it is a project, such as an
 * agent worktree in `~/.codex/worktrees/<id>/<repo>`.
 * @param {string} dir
 * @returns {boolean}
 */
function isHomeOrSettingsFolder(dir) {
  const rel = relativeToHome(dir);
  if (rel == null) return false;
  if (rel === '') return true;
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    return false;
  }
  const parts = rel.split(path.sep);
  if (!parts[0].startsWith('.')) return false;
  // Look for a package.json from `dir` up to, not including, the settings folder.
  let current = realDir(dir);
  for (let depth = parts.length; depth > 1; depth--) {
    if (fs.existsSync(path.join(current, 'package.json'))) return false;
    current = path.dirname(current);
  }
  return true;
}

/**
 * Throw {@link AgentDocsHomeError} when `targetDir` is the home folder, or a
 * settings folder in it outside a project.
 * @param {string} targetDir
 */
export function assertAgentDocsTarget(targetDir) {
  if (isHomeOrSettingsFolder(targetDir))
    throw new AgentDocsHomeError(realDir(targetDir));
}

/** Folders that mark a repository root; the project search stops there. */
export const REPOSITORY_MARKERS = ['.git', '.hg', '.sl'];

/** Dependency fields where a project declares the Astryx packages it uses. */
const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];

/**
 * The package.json in `dir`: its parsed content, `null` when it exists but
 * does not parse, or `undefined` when there is none.
 * @param {string} dir
 * @returns {Record<string, unknown> | null | undefined}
 */
function readPackageJson(dir) {
  const file = path.join(dir, 'package.json');
  if (!fs.existsSync(file)) return undefined;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Whether a parsed package.json declares an `@astryxdesign` package.
 * @param {Record<string, unknown> | null} manifest
 * @returns {boolean}
 */
function declaresAstryx(manifest) {
  return DEPENDENCY_FIELDS.some(field => {
    const deps = manifest?.[field];
    return (
      deps != null &&
      typeof deps === 'object' &&
      Object.keys(deps).some(name => name.startsWith('@astryxdesign/'))
    );
  });
}

/**
 * The folder a run started in `cwd` writes agent docs to: the nearest folder at
 * or above it whose package.json declares an `@astryxdesign` package, else the
 * nearest folder with any package.json. The search stops at a repository root
 * and never reaches the home folder, so a stray `~/package.json` cannot pull
 * the docs there.
 * @param {string} cwd
 * @returns {string | null} null when no folder it searches has a package.json;
 *   init then writes where it runs, as before.
 */
export function resolveAgentDocsRoot(cwd) {
  let dir = path.resolve(cwd);
  /** @type {string | null} */
  let nearest = null;
  for (let i = 0; i < 50 && !isHomeFolder(dir); i++) {
    const manifest = readPackageJson(dir);
    if (manifest !== undefined) {
      if (declaresAstryx(manifest)) return dir;
      nearest ??= dir;
    }
    if (
      REPOSITORY_MARKERS.some(marker => fs.existsSync(path.join(dir, marker)))
    )
      break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return nearest;
}

/**
 * The folder `init` run in `cwd` writes the agent docs to: the project root
 * {@link resolveAgentDocsRoot} finds, else `cwd` itself. The one definition
 * that init, its removal, and the per-command setup nudge all use.
 * @param {string} cwd
 * @returns {string}
 */
export function agentDocsTargetDir(cwd) {
  return resolveAgentDocsRoot(cwd) ?? cwd;
}
