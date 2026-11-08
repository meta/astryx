// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file agent-doc-state — the canonical, dependency-free contract for "where
 * Astryx writes its agent block" and "has this project run init yet?".
 *
 * Deliberately a LEAF module: it imports only node builtins (`fs`, `path`), so
 * it is safe to load in constrained contexts — most importantly the CLI's
 * `postinstall` script, which runs at `npm install` time, before the rest of the
 * CLI's module graph is guaranteed importable. Its sibling `agent-docs.mjs`
 * reaches component discovery, package-manager detection, and the response
 * layer, so the pure setup-check lives HERE and `agent-docs.mjs` re-exports it.
 *
 * SINGLE SOURCE OF TRUTH for every "is Astryx set up?" enforcement layer:
 *   - layer 3 — the per-command setup nudge (`clients/cli/index.mjs`),
 *   - layer 2 — the CLI postinstall nudge (`scripts/postinstall.mjs`),
 *   - the `init` / `upgrade` / `agent-docs` commands (via `agent-docs.mjs`).
 * Core's postinstall (layer 1) is a separate published package and cannot import
 * the CLI, so it ships a package-local copy at
 * `packages/core/scripts/agent-doc-state.mjs`. That copy is GENERATED from this
 * file, byte for byte, by `scripts/generate-setup-contract.mjs`, and
 * `pnpm check:setup-contract` (part of `check:repo`) fails the build when the
 * two differ. Edit the contract HERE and nowhere else.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export const AGENTS_MD = 'AGENTS.md';
export const CLAUDE_MD = 'CLAUDE.md';
export const CLAUDE_DIR_MD = '.claude/CLAUDE.md'; // cross-platform literal
export const GEMINI_MD = 'GEMINI.md';
export const CURSOR_RULES = '.cursorrules';
export const HERMES_DOT_MD = '.hermes.md';
export const HERMES_MD = 'HERMES.md';

/**
 * The page workflow every Astryx agent text gives, written with the command
 * name `astryx`: the project agent docs and the computer-level skill both
 * render these lines, so the two never drift.
 */
export const WORKFLOW_TITLE =
  'WORKFLOW — start every page from a template, never from scratch:';
export const WORKFLOW_STEPS = Object.freeze([
  '1. `astryx build "<idea>"` — names the template to scaffold from and the parts it lacks.',
  '2. `astryx template <name> <path>` — scaffold it; keep its frame, gap and padding; replace the content.',
  '3. `astryx template <Block>` for parts it lacks; `astryx component <Name>` to read props before using one.',
]);

/**
 * The self-check's fix for a project with no StyleX or Tailwind compiler,
 * and for an agent outside a project.
 */
export const SELF_CHECK_CSS =
  'replace any raw <div>/<span>, imported .css/@apply, or hardcoded #hex/px with the component or a token';

export const MARKER_START = '<!-- ASTRYX:START -->';
export const MARKER_END = '<!-- ASTRYX:END -->';
// Legacy markers — read during migration so the script finds existing XDS blocks
export const LEGACY_MARKER_START = '<!-- XDS:START -->';
export const LEGACY_MARKER_END = '<!-- XDS:END -->';

/**
 * The canonical set of EVERY location an --agent preset (or the default) can
 * write a managed Astryx block — the full block, or the one-line import of
 * AGENTS.md that the default writes to GEMINI.md. SINGLE
 * SOURCE OF TRUTH: discovery, removal, and the `isAstryxInitialized` predicate
 * all derive from this list, so "where init writes" and "where we look" can
 * never drift. (Explicit --agent-docs-path targets are user-chosen and not
 * enumerable here.)
 */
export const AGENT_DOC_PATHS = [
  AGENTS_MD, // Codex / ChatGPT / Muse / generic
  CLAUDE_MD, // Claude Code (root)
  CLAUDE_DIR_MD, // Claude Code (.claude/CLAUDE.md)
  GEMINI_MD, // Gemini CLI
  CURSOR_RULES, // Cursor
  HERMES_DOT_MD, // Hermes
  HERMES_MD, // Hermes
];

/**
 * Markers whose presence means an Astryx block has been installed — the current
 * marker plus the legacy XDS one, so pre-rename projects still count as set up.
 */
export const INIT_MARKERS = [MARKER_START, LEGACY_MARKER_START];

/**
 * Find all existing agent doc files in a directory, across EVERY location any
 * preset can write (see {@link AGENT_DOC_PATHS}: AGENTS.md, CLAUDE.md,
 * .claude/CLAUDE.md, GEMINI.md, .cursorrules, .hermes.md, HERMES.md).
 * @param {string} targetDir
 * @returns {string[]} Relative paths of existing agent doc files
 */
export function discoverAgentDocs(targetDir) {
  return AGENT_DOC_PATHS.filter(p => fs.existsSync(path.join(targetDir, p)));
}

/**
 * Whether `content` holds an Astryx block. A managed block that only imports
 * another file (the one-line `@./AGENTS.md` that init writes to GEMINI.md) does
 * not count: it holds nothing once that file has lost its block. A malformed
 * block still counts, so a half-written file reads as set up.
 *
 * @param {string} content
 * @returns {boolean}
 */
export function holdsAstryxBlock(content) {
  for (const marker of INIT_MARKERS) {
    let at = content.indexOf(marker);
    while (at !== -1) {
      const from = at + marker.length;
      const end = content.indexOf('<!--', from);
      const inner = (
        end === -1 ? content.slice(from) : content.slice(from, end)
      ).trim();
      if (!/^@\S+$/.test(inner)) return true;
      at = content.indexOf(marker, from);
    }
  }
  return false;
}

/**
 * Single source of truth for "is Astryx set up in this project?" — true when any
 * agent-doc file already holds an Astryx block, i.e. `init` / `agent-docs` has
 * run. Reused by the init & upgrade commands, the per-command setup nudge
 * (enforcement layer 3), and the cli postinstall nudge (layer 2). Core's
 * postinstall (separate package, layer 1) mirrors the same marker contract.
 *
 * @param {string} [targetDir=process.cwd()]
 * @returns {boolean}
 */
export function isAstryxInitialized(targetDir = process.cwd()) {
  for (const rel of discoverAgentDocs(targetDir)) {
    try {
      const content = fs.readFileSync(path.join(targetDir, rel), 'utf-8');
      if (holdsAstryxBlock(content)) {
        return true;
      }
    } catch {
      // Unreadable file — ignore and keep checking the others.
    }
  }
  return false;
}

/**
 * Does an agent working in `startDir` already have the Astryx prompt in reach?
 *
 * Coding agents read the agent docs between the repository root and the folder
 * they work in. So inside a git repository, init's block in any folder from
 * `startDir` up to the repository root counts: a workspace package of a
 * monorepo initialized at its root is set up. Outside a repository only
 * `startDir` itself is checked, as {@link isAstryxInitialized} does. Both the
 * per-command nudge and the postinstall nudges ask this.
 *
 * @param {string} [startDir=process.cwd()]
 * @returns {boolean}
 */
export function isAstryxPromptInReach(startDir = process.cwd()) {
  const start = path.resolve(startDir);
  const repositoryRoot = findRepositoryRoot(start);
  if (!repositoryRoot) return isAstryxInitialized(start);
  for (let dir = start; ; dir = path.dirname(dir)) {
    if (isAstryxInitialized(dir)) return true;
    if (dir === repositoryRoot) return false;
  }
}

/**
 * The nearest folder at or above `start` that holds `.git` (a folder, or the
 * file a worktree uses), or null outside a repository.
 * @param {string} start
 * @returns {string | null}
 */
function findRepositoryRoot(start) {
  for (let dir = start; ;) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * The invocation the setup nudge falls back to when the CLI's picker
 * (`getCliInvocation`) cannot be loaded. Scoped package form
 * (`@astryxdesign/cli`) — always resolves to us, even before the CLI is
 * installed. npx with the unscoped name would fetch an unrelated look-alike
 * package (see PR #4151).
 */
export const SETUP_INVOCATION = 'npx @astryxdesign/cli';

/**
 * The one-line next-step every setup layer prints. Kept here so layer 1
 * (core), layer 2 (cli postinstall) and layer 3 (each command) can never word
 * it differently. Each layer passes the stem from the CLI's picker when it can
 * load it.
 *
 * @param {string} [invocation] the CLI invocation stem, e.g. `pnpm exec astryx`
 * @param {{before?: string | null}} [options] `before`: a command to run
 *   first, such as the one that adds the CLI to a project that has none
 * @returns {string}
 */
export function setupNudge(
  invocation = SETUP_INVOCATION,
  {before = null} = {},
) {
  const run = before
    ? `\`${before}\`, then \`${invocation} init\``
    : `\`${invocation} init\``;
  return `\nNext step: run ${run} to finish setup and install the Astryx agent prompt.\n\n`;
}

/** The nudge with the fallback invocation. */
export const SETUP_NUDGE = setupNudge();

/**
 * Pure decision: should a postinstall print the setup nudge? Shared by BOTH
 * postinstall layers, so the matrix cannot drift between them, and unit-testable
 * without an actual npm install.
 *
 * @param {object} [opts]
 * @param {string} [opts.scriptPath] - Absolute path of the calling script
 *   (location tells us dependency vs monorepo vs npx-cache).
 * @param {string} [opts.npmCommand] - process.env.npm_command ('install', 'exec', …).
 * @param {boolean} [opts.isSetUp] - Whether the project already ran init.
 * @returns {boolean}
 */
export function shouldNudge({scriptPath, npmCommand, isSetUp} = {}) {
  if (!scriptPath || !scriptPath.includes('node_modules')) return false; // monorepo/source build
  if (scriptPath.includes('_npx') || npmCommand === 'exec') return false; // npx transient — init runs next
  if (isSetUp) return false; // already set up — stay quiet
  return true;
}
