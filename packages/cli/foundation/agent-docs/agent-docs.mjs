// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file agent-docs — Install/update agent docs for AI coding tools
 *
 * Generates a CLI cheat sheet from actual command metadata and writes it, as
 * one managed block, into the files AI coding tools read.
 *
 * Default (no --agent or --agent-docs-path): every agent reads the block, in a
 * file the project commits.
 *
 * - AGENTS.md holds the block. Most agents read it; Claude Code reads it when
 *   the folder has no CLAUDE.md or .claude/CLAUDE.md.
 * - The Claude Code file the project already has holds a copy: root CLAUDE.md,
 *   else .claude/CLAUDE.md, even when it imports AGENTS.md, because Claude Code
 *   does not follow that import from a subfolder. Init creates no Claude file.
 * - Gemini CLI reads only GEMINI.md: it gets a managed import, `@./AGENTS.md`,
 *   created when missing, unless GEMINI.md already imports AGENTS.md. Project
 *   settings that point Gemini at AGENTS.md don't replace it: Gemini loads them
 *   only when it starts at the project root.
 * - Existing Cursor (.cursorrules) and Hermes (.hermes.md, HERMES.md) files
 *   keep a full block.
 *
 * No mode writes into the home folder, or into a settings folder in it outside a
 * project: agents read the files there in every project. A project inside a
 * settings folder, such as an agent worktree, is written normally.
 *
 * --agent <tool>: target a specific tool preset (claude, cursor, codex, hermes, muse, all)
 * --agent-docs-path <path>: explicit file path(s)
 */

import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {findCoreDir, findInstalledPackage, CLI_ROOT} from '../fs/paths.mjs';
import {assertWithin, PathSafetyError} from '../fs/path-safety.mjs';
import {createFileProtectionResolver} from '../fs/file-protection.mjs';
import {
  docPackageManager,
  getCliInvocation,
} from '../env/package-manager.mjs';
import {renderCommandTokens} from '../doc-compiler/doc-syntax.mjs';
import {isValidSemver, semverGte} from '../env/semver.mjs';
import {discoverComponents} from '../discovery/component-discovery.mjs';
import {Project} from '../config/project.mjs';
import {cliRootNamespaceNames} from '../doc-compiler/tree.mjs';
import {humanLog} from '../response/json.mjs';
import {ERROR_CODES} from '../response/error-codes.mjs';
import {
  AGENTS_MD,
  AGENT_DOC_PATHS,
  CLAUDE_MD,
  CLAUDE_DIR_MD,
  CURSOR_RULES,
  GEMINI_MD,
  HERMES_DOT_MD,
  HERMES_MD,
  MARKER_START,
  MARKER_END,
  LEGACY_MARKER_START,
  LEGACY_MARKER_END,
  discoverAgentDocs,
  isAstryxInitialized,
  isAstryxPromptInReach,
  SELF_CHECK_CSS,
  WORKFLOW_STEPS,
  WORKFLOW_TITLE,
} from './agent-doc-state.mjs';

// The agent-doc locations, markers, and the setup-state predicates
// (discoverAgentDocs, isAstryxInitialized, isAstryxPromptInReach) are the ONE
// canonical contract. They live in the dependency-free leaf
// ./agent-doc-state.mjs so the postinstall nudge (enforcement layer 2) can load
// them safely at install time. Re-exported here so existing importers
// (init/upgrade commands, the layer-3 nudge in clients/cli/index.mjs, tests)
// keep their `from './agent-docs.mjs'` paths.
export {discoverAgentDocs, isAstryxInitialized, isAstryxPromptInReach};

const MAX_PROJECT_AGENT_DOC_LINES = 32;
const MANAGED_MARKER_TEXT = /(?:ASTRYX|XDS):(START|END)/u;

/** @param {unknown} value @returns {string} */
function validateIntegrationLabel(value) {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    throw new Error('Integration package name is not safe to render in agent docs.');
  }
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (
      codePoint <= 0x1f ||
      (codePoint >= 0x7f && codePoint <= 0x9f) ||
      codePoint === 0x2028 ||
      codePoint === 0x2029
    ) {
      throw new Error('Integration package name is not safe to render in agent docs.');
    }
  }
  if (MANAGED_MARKER_TEXT.test(value) || value.includes('`')) {
    throw new Error('Integration package name is not safe to render in agent docs.');
  }
  return value;
}

/**
 * The `@path` imports of other agent docs in each agent doc. Only an import
 * whose normalized target is another known agent doc counts; prose mentions do
 * not. Lines inside the managed block are Astryx's own (the default writes an
 * import of AGENTS.md there), so they never count as the project's import.
 *
 * @param {string} targetDir
 * @param {string[]} agentDocs
 * @param {string[]} [extraTargets] Import targets that count even though they
 *   do not exist yet (the default always writes AGENTS.md).
 * @returns {Map<string, Set<string>>} each importing doc and the docs it imports.
 */
function readAgentDocImports(targetDir, agentDocs, extraTargets = []) {
  const known = new Set([...agentDocs, ...extraTargets].map(p => path.normalize(p)));
  /** @type {Map<string, Set<string>>} */
  const imports = new Map();

  for (const rel of agentDocs) {
    let content;
    try {
      content = withoutManagedBlock(fs.readFileSync(path.join(targetDir, rel), 'utf-8'));
    } catch {
      continue;
    }

    const targets = new Set();
    for (const line of content.split(/\r?\n/)) {
      const match = /^\s*@([^\s]+)\s*$/.exec(line);
      if (match == null || path.isAbsolute(match[1])) continue;
      const imported = path.normalize(path.join(path.dirname(rel), match[1]));
      if (imported !== path.normalize(rel) && known.has(imported)) {
        targets.add(imported);
      }
    }
    if (targets.size > 0) imports.set(rel, targets);
  }
  return imports;
}

/**
 * Find tool-specific files that import another detected agent doc.
 *
 * Claude's `@path` directive is a real include, so injecting the full managed
 * block beside it duplicates the same instructions. Standalone files keep the
 * normal initialization behavior. Import cycles have no canonical owner, so
 * their members also stay standalone.
 *
 * @param {Map<string, Set<string>>} imports From {@link readAgentDocImports}.
 * @returns {Map<string, Set<string>>} each wrapper and the agent docs it imports.
 */
function findAgentDocWrappers(imports) {
  /** @param {string} start */
  const isCyclic = start => {
    /**
     * @param {string} current
     * @param {Set<string>} seen
     */
    const visit = (current, seen) => {
      for (const imported of imports.get(current) ?? []) {
        if (imported === start) return true;
        if (seen.has(imported)) continue;
        seen.add(imported);
        if (visit(imported, seen)) return true;
      }
      return false;
    };
    return visit(start, new Set([start]));
  };

  return new Map([...imports].filter(([rel]) => !isCyclic(rel)));
}

/**
 * Locate the single well-formed managed block in `content`.
 *
 * A naive `indexOf(START)` + `indexOf(END)` corrupts user content on malformed
 * input: an END that appears before START makes the slice boundaries overlap
 * (duplicating text), and a stray START with no END silently looks like "no
 * block" so a fresh block gets appended below the broken one. This searches for
 * END strictly *after* START (so the boundaries can never cross) and refuses to
 * touch a file that has more than one START of the same kind — better to ask the
 * user to fix an ambiguous file than to guess and drop their content.
 *
 * @param {string} content
 * @returns {{start: number, end: number} | null} start = index of START marker;
 *   end = index just past the END marker. null when there is no block. Throws on
 *   an ambiguous file (duplicate/nested START markers).
 */
function findManagedBlock(content) {
  for (const [start, end] of [
    [MARKER_START, MARKER_END],
    [LEGACY_MARKER_START, LEGACY_MARKER_END],
  ]) {
    const startIdx = content.indexOf(start);
    if (startIdx === -1) continue;
    // Search for END after START so end > start is guaranteed.
    const endIdx = content.indexOf(end, startIdx + start.length);
    if (endIdx === -1) continue; // START without a matching END → treat as no block
    // A second START of the same kind means the file is ambiguous (duplicate or
    // nested block). Refuse rather than orphan/mangle content.
    if (content.indexOf(start, startIdx + start.length) !== -1) {
      throw new Error(
        `Malformed agent-docs block: multiple "${start}" markers found. ` +
          `Remove the duplicate/broken block manually, then re-run.`,
      );
    }
    return {start: startIdx, end: endIdx + end.length};
  }
  return null;
}

/**
 * `content` with its managed block cut out. A malformed block is left in
 * place; the writers refuse it later.
 * @param {string} content
 * @returns {string}
 */
function withoutManagedBlock(content) {
  try {
    const block = findManagedBlock(content);
    return block ? content.slice(0, block.start) + content.slice(block.end) : content;
  } catch {
    return content;
  }
}

/**
 * The managed one-line import of AGENTS.md that the default writes, keyed by
 * file. Gemini CLI reads only GEMINI.md, and expands `@./AGENTS.md` there.
 *
 * @type {Readonly<Record<string, string>>}
 */
const AGENTS_IMPORTS = Object.freeze({
  [GEMINI_MD]: '@./AGENTS.md',
});

/**
 * Agent docs 0.7.0 already wrote. A path-safety refusal on one of them stays an
 * error, as it was; a file only the current layout writes is skipped instead.
 */
const LEGACY_DOC_PATHS = AGENT_DOC_PATHS.filter(p => p !== GEMINI_MD);

/**
 * The managed block holding the import of AGENTS.md for `rel`.
 * @param {string} rel A key of {@link AGENTS_IMPORTS}.
 * @returns {string}
 */
function renderAgentsImportBlock(rel) {
  return `${MARKER_START}\n${AGENTS_IMPORTS[rel]}\n${MARKER_END}`;
}

/**
 * Whether the managed block in `content` holds only an import of the root
 * AGENTS.md, resolved from the folder of `rel`. Such a block names no version,
 * so it stays current while it points at AGENTS.md.
 * @param {string} rel Project-relative path of the file `content` came from.
 * @param {string} content
 * @returns {boolean}
 */
function isAgentsImportBlock(rel, content) {
  let block;
  try {
    block = findManagedBlock(content);
  } catch {
    return false;
  }
  if (block == null) return false;
  const text = content.slice(block.start, block.end);
  const inner = text.slice(text.indexOf('-->') + 3, text.lastIndexOf('<!--')).trim();
  const match = /^@(\S+)$/.exec(inner);
  if (match == null || path.isAbsolute(match[1])) return false;
  return path.normalize(path.join(path.dirname(rel), match[1])) === AGENTS_MD;
}

/**
 * The paths Gemini CLI imports from `content`, in order. Gemini reads `@path`
 * where the `@` starts the text or follows whitespace, and the path runs to the
 * next whitespace and starts with `.`, `/` or a letter. An `@` inside backticks
 * (inline code or a fenced block) is not an import.
 * @param {string} content
 * @returns {string[]}
 */
function findGeminiImports(content) {
  /** @type {Array<[number, number]>} */
  const code = [];
  for (const match of content.matchAll(/(`+)[\s\S]*?\1/g)) {
    code.push([match.index, match.index + match[0].length]);
  }
  /** @type {string[]} */
  const found = [];
  for (const match of content.matchAll(/(?<=^|[ \t\r\n])@([^ \t\r\n]+)/g)) {
    if (!/^[./A-Za-z]/.test(match[1])) continue;
    if (code.some(([start, end]) => match.index >= start && match.index < end)) {
      continue;
    }
    found.push(match[1]);
  }
  return found;
}

/**
 * Whether GEMINI.md, outside Astryx's managed block, already has Gemini CLI
 * import AGENTS.md, on a line of its own or inline in a sentence.
 * @param {string} targetDir
 * @returns {boolean}
 */
function geminiImportsAgentsMd(targetDir) {
  let content;
  try {
    content = fs.readFileSync(path.join(targetDir, GEMINI_MD), 'utf-8');
  } catch {
    return false;
  }
  const agents = path.resolve(targetDir, AGENTS_MD);
  return findGeminiImports(withoutManagedBlock(content)).some(
    rel => path.resolve(targetDir, rel) === agents,
  );
}

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
function realDir(p) {
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
  if (isHomeOrSettingsFolder(targetDir)) throw new AgentDocsHomeError(realDir(targetDir));
}

/** Folders that mark a repository root; the project search stops there. */
const REPOSITORY_MARKERS = ['.git', '.hg', '.sl'];

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
    if (REPOSITORY_MARKERS.some(marker => fs.existsSync(path.join(dir, marker)))) break;
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

/**
 * Agent tool presets — maps tool names to their file search paths.
 * Order matters: first existing file wins, last entry is the default (created if none exist).
 */
const AGENT_PRESETS = {
  claude: [CLAUDE_MD, CLAUDE_DIR_MD],
  cursor: [CURSOR_RULES, AGENTS_MD],
  codex: [AGENTS_MD],
  hermes: [HERMES_DOT_MD, HERMES_MD, AGENTS_MD],
  muse: [AGENTS_MD],
};

/**
 * Parse the Astryx version a managed block was generated for, from its header
 * line ("Astryx v1.2.3 · N components"). Returns null when the block predates
 * the versioned header (e.g. a legacy XDS block) or has no header at all.
 *
 * @param {string} content File contents, or just the block text.
 * @returns {string|null}
 */
export function parseBlockVersion(content) {
  const match = /Astryx v(\d+\.\d+\.\d+[^\s·]*)/.exec(content ?? '');
  return match ? match[1] : null;
}

/**
 * Read-only staleness assessment of the managed agent-docs block(s) against the
 * installed core version. This is the detection half of the `astryx upgrade`
 * agent-docs refresh: it never writes, so `upgrade` can run it on EVERY path —
 * including the up-to-date / no-codemods short-circuits — and decide whether to
 * rewrite a stale block, nudge an uninitialized repo, or stay silent.
 *
 * A managed block is:
 * - `stale`   — it carries a legacy XDS marker, has no parseable version, or
 *               records a version other than the installed one.
 * - `current` — every managed block already matches the installed version.
 * And the project is `missing` when no managed block exists anywhere (the repo
 * has agent-doc files without our markers, or none at all — i.e. never `init`ed).
 * A managed import of AGENTS.md is not a block here: it names no version and
 * stays current while AGENTS.md holds the block.
 *
 * @param {string} targetDir
 * @param {string} [installedVersion] Defaults to the installed core version.
 * @param {string} [expectedBlock] Fully rendered block for this project. When
 *   present, byte differences are stale even if the Core version is unchanged.
 * @returns {{
 *   installedVersion: string,
 *   status: 'missing' | 'stale' | 'current',
 *   files: Array<{path: string, blockVersion: string|null, legacy: boolean, stale: boolean}>,
 *   staleFiles: string[],
 *   blockVersions: string[],
 * }}
 */
export function inspectAgentDocs(targetDir, installedVersion, expectedBlock) {
  const version = installedVersion ?? getXdsVersion(findCoreDir(targetDir));
  /** @type {Array<{path: string, blockVersion: string|null, legacy: boolean, stale: boolean}>} */
  const files = [];

  for (const rel of discoverAgentDocs(targetDir)) {
    /** @type {string} */
    let content;
    try {
      content = fs.readFileSync(path.join(targetDir, rel), 'utf-8');
    } catch {
      continue; // Unreadable — treat as absent.
    }
    const hasNew = content.includes(MARKER_START);
    const hasLegacy = content.includes(LEGACY_MARKER_START);
    if (!hasNew && !hasLegacy) continue; // Not a block we manage.
    // An import of AGENTS.md names no version and never needs a refresh.
    if (isAgentsImportBlock(rel, content)) continue;

    const legacy = !hasNew && hasLegacy;
    const blockVersion = parseBlockVersion(content);
    let contentMatches = true;
    if (expectedBlock != null) {
      try {
        const block = findManagedBlock(content);
        contentMatches =
          block != null &&
          content.slice(block.start, block.end) === expectedBlock;
      } catch {
        contentMatches = false;
      }
    }
    const stale =
      legacy ||
      blockVersion == null ||
      blockVersion !== version ||
      !contentMatches;
    files.push({path: rel, blockVersion, legacy, stale});
  }

  const staleEntries = files.filter(f => f.stale);
  const staleFiles = staleEntries.map(f => f.path);
  const blockVersions = [
    ...new Set(staleEntries.map(f => f.blockVersion).filter(/** @returns {v is string} */ (v) => v != null)),
  ];

  /** @type {'missing' | 'stale' | 'current'} */
  let status;
  if (files.length === 0) status = 'missing';
  else if (staleFiles.length > 0) status = 'stale';
  else status = 'current';

  return {installedVersion: version, status, files, staleFiles, blockVersions};
}

/**
 * Resolve which file(s) to write for a given agent tool preset.
 * Searches for existing files first, falls back to default creation path.
 *
 * @param {string} targetDir
 * @param {string} agent - Preset name: 'claude', 'cursor', 'codex', 'hermes', 'muse', 'all'
 * @returns {{inject: string[], create: string[]}} Files to inject into vs create fresh
 */
export function resolveAgentPaths(targetDir, agent) {
  if (agent === 'all') {
    // Every existing agent doc gets the block, except GEMINI.md, which keeps
    // the one-line import of AGENTS.md the default writes. When CLAUDE.md is
    // among them, installAgentDocs then removes the block from
    // .claude/CLAUDE.md, unless the project ignores CLAUDE.md (INV31).
    const existing = discoverAgentDocs(targetDir).filter(p => p !== GEMINI_MD);
    if (existing.length > 0) {
      return {inject: existing, create: []};
    }
    // Nothing exists — create default for each tool
    return {inject: [], create: [AGENTS_MD, CLAUDE_DIR_MD]};
  }

  const searchPaths = /** @type {Record<string, string[]>} */ (AGENT_PRESETS)[agent];
  if (!searchPaths) {
    return {inject: [], create: [AGENTS_MD]};
  }

  // Find first existing file from search order
  for (const p of searchPaths) {
    if (fs.existsSync(path.join(targetDir, p))) {
      return {inject: [p], create: []};
    }
  }

  // None found — create the last entry (default location)
  return {inject: [], create: [searchPaths[searchPaths.length - 1]]};
}

/**
 * Detect which styling system the consumer project has wired up, so the agent
 * docs recommend a path that actually compiles in THIS project.
 *
 * `xstyle`/StyleX needs the StyleX compiler (the `@stylexjs/stylex` runtime
 * alone throws at runtime → blank page); Tailwind utilities need Tailwind.
 * Recommending either when it isn't configured yields unstyled or blank output.
 * Plain CSS variables (via `style`/`className`) always work, so they're the
 * safe default. Precedence: stylex (compiler wired) → tailwind → css.
 *
 * @param {string} targetDir
 * @returns {'stylex' | 'tailwind' | 'css'}
 */
export function detectStylingSystem(targetDir) {
  try {
    const pkgPath = path.join(targetDir, 'package.json');
    if (!fs.existsSync(pkgPath)) return 'css';
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const deps = {...pkg.dependencies, ...pkg.devDependencies};
    // Key off a StyleX *compiler* plugin — the runtime alone won't render.
    const stylexCompilers = [
      '@stylexjs/babel-plugin',
      '@stylexjs/rollup-plugin',
      '@stylexjs/webpack-plugin',
      '@stylexjs/nextjs-plugin',
      '@stylexjs/unplugin',
      'vite-plugin-stylex',
      'unplugin-stylex',
      '@stylexswc/unplugin',
      '@stylexswc/nextjs-plugin',
      'stylex-webpack',
    ];
    if (stylexCompilers.some(d => d in deps)) return 'stylex';
    if ('tailwindcss' in deps) return 'tailwind';
    return 'css';
  } catch {
    // Best-effort: default to the universally-safe CSS-variable path.
    return 'css';
  }
}

/** The first release whose `doctor` takes `--built`. */
const BUILT_CHECK_SINCE = '0.7.4';

/**
 * Whether a project on this Core release can run `astryx doctor --built`. A
 * prerelease of the first release is below it: its canaries predate the
 * option.
 * @param {string | null | undefined} version
 */
function hasBuiltCheck(version) {
  if (typeof version !== 'string' || !isValidSemver(version)) return false;
  const [release, prerelease] = version.split('-', 2);
  if (prerelease !== undefined && release === BUILT_CHECK_SINCE) return false;
  return semverGte(release, BUILT_CHECK_SINCE);
}

/**
 * Whether the project at `dir` can run `astryx doctor --built`: the CLI it
 * installs, which answers it whatever the running copy is, has the option.
 * Read from the installed CLI (the folder's own, or its workspace's), never
 * from declared ranges or the running copy, so a block written before
 * install, or by a newer copy, never names an option the project's CLI
 * rejects; the next `init` or `upgrade --apply` after install adds it.
 * @param {string} dir
 * @returns {boolean}
 */
export function projectHasBuiltCheck(dir) {
  const installed = findInstalledPackage(dir, '@astryxdesign/cli');
  if (!installed) return false;
  try {
    const {version} = JSON.parse(
      fs.readFileSync(path.join(installed, 'package.json'), 'utf8'),
    );
    return hasBuiltCheck(version);
  } catch {
    return false;
  }
}

/**
 * Generate the agent cheat sheet from live CLI metadata.
 *
 * Structured as: workflow (behavioral) → rules (error prevention) → CLI reference.
 * Templates lead the workflow: every page starts from a scaffolded template,
 * because the template already carries the frame and spacing that an agent
 * composing from components would have to re-derive, and usually gets wrong.
 *
 * `stylingSystem` tailors the custom-styling guidance to what the project has
 * configured (see {@link detectStylingSystem}) so the agent never reaches for a
 * styling path that isn't compiled here.
 *
 * `topics` is the project's doc-topic list. Passing it is what puts an
 * integration's topics — including one it contributed in place of a built-in —
 * in front of the agent by name; without it the block falls back to the CLI's
 * own topics, because resolving a project's catalog is async and this is not.
 *
 * Either way the list now includes the hyphenated topics. The fallback scan
 * matched `\w+`, which does not match `-`, so five real topics were missing
 * from every block ever written — `getting-started` and `cli-integrations`
 * among them. An agent cannot ask for a topic it was never told about, and
 * `getting-started` is the one it should reach for first.
 *
 * @param {string | null} version the Core version
 * @param {{coreDir?: string|null, invocation?: string, stylingSystem?: 'stylex'|'tailwind'|'css', zh?: boolean, lang?: string, topics?: string[], agentDocs?: Array<{package: string, append: readonly string[]}>, builtCheck?: boolean}} [options]
 * @returns {string}
 */
export function generateCompressedIndex(
  version,
  {
    coreDir,
    invocation = getCliInvocation(),
    stylingSystem = 'css',
    topics,
    agentDocs = [],
    builtCheck = false,
  } = {},
) {
  const run = invocation;
  const totalAgentDocLines = agentDocs.reduce(
    (count, contribution) => count + contribution.append.length,
    0,
  );
  if (totalAgentDocLines > MAX_PROJECT_AGENT_DOC_LINES) {
    throw new Error(
      `Configured integrations contribute ${totalAgentDocLines} agent-doc lines, exceeding the ${MAX_PROJECT_AGENT_DOC_LINES}-line project limit.`,
    );
  }
  // Annotated because MARKER_START is now an imported const: its literal type
  // survives the module boundary, so the array would infer as that one literal.
  /** @type {string[]} */
  const lines = [MARKER_START];

  // Component count from live discovery
  let componentCount = '90+';
  if (coreDir) {
    try {
      const comps = discoverComponents(coreDir);
      let total = 0;
      for (const list of Object.values(comps)) total += list.length;
      if (total > 0) componentCount = String(total);
    } catch {
      // Best-effort: component count is cosmetic; fall back to the default.
    }
  }
  lines.push(`Astryx v${version} · ${componentCount} components`);

  // State the CLI prefix once; commands below are shown as `astryx <cmd>`.
  lines.push(
    `CLI: run every command as \`${run} <cmd>\` (shown below as \`astryx ...\`).`,
  );
  lines.push('');

  // Required setup — components ship precompiled CSS; without these imports
  // everything renders unstyled. Theme is optional (a default ships in astryx.css).
  lines.push('SETUP (once, in app entry e.g. main.tsx) — without these, components render unstyled:');
  lines.push('  import "@astryxdesign/core/reset.css";');
  lines.push('  import "@astryxdesign/core/astryx.css";');
  lines.push('');

  // Workflow — `build` is the front door, and every page starts from the
  // template it names. build/template/component are covered here, so they are
  // intentionally omitted from the command reference below.
  lines.push(WORKFLOW_TITLE, ...WORKFLOW_STEPS);
  lines.push('Changing an existing page? Keep it: skip step 2 and add blocks/components inside its sections.');
  // Only for a project whose recorded releases have `doctor --built`
  // (projectHasBuiltCheck): a newer copy may write this block in a project
  // whose install then brings an older CLI, which rejects the option. The computer-level
  // skill names only entry points every release keeps (AST-081 FR8).
  if (builtCheck) {
    lines.push("Before you deliver a build, run `astryx doctor --built <dir>`; don't deliver it if it fails.");
  }
  lines.push('');

  // Rules — the top error-preventers.
  lines.push('RULES:');
  lines.push('- No <div> — components handle all layout and spacing.');
  lines.push('- Read `astryx docs layout` before changing a template\'s frame.');
  lines.push('- Dense data = rows (Table, List/Item), not Card-wrapped lists. Badge = counts only.');
  // Styling guidance tailored to the project's configured system — never
  // recommend a path that isn't compiled here (xstyle needs the StyleX compiler;
  // utilities need Tailwind). Tokens are always the source of truth.
  if (stylingSystem === 'stylex') {
    lines.push('- Style with component props first, then the xstyle prop / StyleX tokens. No raw hex/px.');
  } else if (stylingSystem === 'tailwind') {
    lines.push('- Style with component props first, then Tailwind utilities backed by tokens. No raw hex/px.');
  } else {
    lines.push("- Style with component props first, then tokens (var(--color-*|--spacing-*|--radius-*)). No raw hex/px. No StyleX/Tailwind compiler here — don't use xstyle/utility classes directly. Some templates use StyleX and need a compiler plugin; see `astryx docs styling-overview`.");
  }
  lines.push('- Palettes and custom colors go through the theme, never :root overrides. Run `astryx theme add <slug>` to import; `theme eject <slug>` only forks source. See `astryx docs theme`.');
  // Self-check — post-generation pass. Validated via vibe tests (internal/vibe-tests/
  // prompt-purity-test): on complex multi-step UIs the rules above alone still leave raw
  // CSS in ~11-13% of runs; a re-read-and-fix pass cuts that ~4x at negligible token cost.
  const selfCheckFix = {
    stylex:
      'replace any className=, style={{…}}, raw <div>/<span>, imported .css/@apply, or hardcoded #hex/px with the component or the xstyle prop + a token',
    tailwind:
      'replace any style={{…}}, raw <div>/<span>, imported .css/@apply, or hardcoded/arbitrary value (bg-[#fff], p-[13px]) with the component or a token-backed utility',
    css: SELF_CHECK_CSS,
  };
  lines.push(
    `- SELF-CHECK: re-read the file; ${selfCheckFix[stylingSystem] ?? selfCheckFix.css}.`,
  );
  lines.push('');

  // build/template/component are covered in WORKFLOW above and intentionally
  // omitted here. `astryx help` is the full reference.
  lines.push('`astryx help` lists every command. Key ones beyond the workflow:');
  lines.push('  search "<query>"   find any component / hook / doc / template');
  lines.push('  discover <words>   integrations you could add');
  const docsDir = path.join(CLI_ROOT, 'assets', 'docs');
  const resolvedTopics =
    topics ??
    (fs.existsSync(docsDir)
      ? fs
          .readdirSync(docsDir)
          .map(f => f.match(/^([\w-]+)\.doc\.mjs$/))
          .filter(/** @returns {m is RegExpMatchArray} */ (m) => m != null)
          .map(m => m[1])
          .concat(cliRootNamespaceNames())
          .sort()
      : []);
  if (resolvedTopics.length > 0) {
    // Show key topics inline, point at `astryx docs` for the full list.
    const keyTopics = ['getting-started', 'principles', 'tokens', 'theme'];
    const shown = keyTopics.filter(t => resolvedTopics.includes(t));
    const suffix = resolvedTopics.length > shown.length ? ' …' : '';
    lines.push(`  docs <topic>       ${shown.join(', ')}${suffix} (\`astryx docs\` lists all)`);
  }
  lines.push('  docs cli           commands and API reference');
  lines.push('  docs authoring     build an integration package, and every field it holds');
  lines.push('  upgrade --from <old version> --apply   run after a dependency bump');
  const appendCount = agentDocs.reduce(
    (count, contribution) => count + contribution.append.length,
    0,
  );
  if (appendCount > 0) {
    lines.push('');
    lines.push('INTEGRATIONS:');
    for (const contribution of agentDocs) {
      for (const line of contribution.append) {
        lines.push(`- \`${contribution.package}\`: ${line}`);
      }
    }
  }
  lines.push(MARKER_END);

  return lines.join('\n');
}

/**
 * Resolve the complete expected block for one installed project.
 *
 * Config and integration modules load once through the existing Project seam.
 * The returned bytes are reused for every target file.
 *
 * @param {string} targetDir
 * @param {{installedVersion?: string, fresh?: boolean}} [options]
 * @returns {Promise<string>}
 */
export async function renderAgentDocsBlock(
  targetDir,
  {installedVersion, fresh = false} = {},
) {
  const coreDir = findCoreDir(targetDir);
  const version = installedVersion ?? getXdsVersion(coreDir);
  const project = await Project.load(targetDir, {fresh});
  const failedIntegration = project.loadedIntegrations.find(
    integration => integration.__loadError != null,
  );
  if (failedIntegration) {
    const packageLabel = validateIntegrationLabel(
      failedIntegration.name ?? failedIntegration.__spec,
    );
    throw new Error(
      `Cannot render agent docs because integration ${packageLabel} failed to load: ${failedIntegration.__loadError}`,
    );
  }
  const invalidAgentDocs = project.loadedIntegrations.find(
    integration => integration.__agentDocsError != null,
  );
  if (invalidAgentDocs) {
    const packageLabel = validateIntegrationLabel(
      invalidAgentDocs.name ?? invalidAgentDocs.__spec,
    );
    throw new Error(
      `Cannot render agent docs because integration ${packageLabel} has invalid agentDocs: ${invalidAgentDocs.__agentDocsError}`,
    );
  }
  const catalog = await project.docs();
  // Every name `astryx docs <name>` opens: the flat topics, and each root
  // namespace of the docs tree (a topic split into guides keeps its name).
  const topics = [
    ...catalog.names(),
    ...cliRootNamespaceNames(),
    ...catalog.treeInputs.flatMap(inputs =>
      inputs.namespaces
        .filter(input => !input.doc?.placement?.parent)
        .map(input => input.doc.name),
    ),
  ];
  // Doc tokens in an integration's lines render here, for the project's
  // package manager; the block's header names the runner for bare commands.
  const tokenOptions = {stem: 'astryx', pm: docPackageManager(targetDir)};
  const agentDocs = project.loadedIntegrations.flatMap(integration => {
    const append = (integration.agentDocs?.append ?? []).map(line =>
      renderCommandTokens(line, tokenOptions),
    );
    if (append.length === 0) return [];
    return [
      {
        package: validateIntegrationLabel(
          integration.name ?? integration.__spec,
        ),
        append,
      },
    ];
  });

  return generateCompressedIndex(version, {
    coreDir,
    builtCheck: projectHasBuiltCheck(targetDir),
    invocation: getCliInvocation(targetDir),
    stylingSystem: detectStylingSystem(targetDir),
    topics,
    agentDocs,
  });
}

/**
 * Get Astryx version from core package.
 * @param {string|null} coreDir
 * @returns {string}
 */
export function getXdsVersion(coreDir) {
  if (coreDir) {
    const pkgPath = path.join(coreDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      return pkg.version;
    }
  }
  const cliPkgPath = path.join(CLI_ROOT, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(cliPkgPath, 'utf-8'));
  return pkg.version;
}

/**
 * Inject or update Astryx section in a file using Astryx markers.
 * If the file has existing markers, replaces the content between them.
 * If the file exists without markers, appends the block (unless onlyReplace is true).
 * If createIfMissing is true and the file doesn't exist, creates it with a header.
 *
 * @param {string} filePath
 * @param {string} compressedIndex
 * @param {object} [options]
 * @param {boolean} [options.createIfMissing] - Create the file if it doesn't exist
 * @param {string} [options.header] - Header for newly created files
 * @param {boolean} [options.onlyReplace] - Only write if Astryx markers already exist (skip files without markers)
 * @returns {boolean} Whether the file was written
 */
export function injectXdsBlock(filePath, compressedIndex, {createIfMissing = false, header = '', onlyReplace = false} = {}) {
  let content;

  if (fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, 'utf-8');

    // Find existing section (new or legacy markers), well-formed only.
    const block = findManagedBlock(content);

    if (block) {
      content =
        content.slice(0, block.start) +
        compressedIndex +
        content.slice(block.end);
    } else if (content.includes(MARKER_START) || content.includes(LEGACY_MARKER_START)) {
      // A START with no matching END (e.g. an interrupted previous write). Don't
      // append a second block below the broken one — that leaves two STARTs the
      // tool can never converge. Refuse and ask the user to clean it up.
      throw new Error(
        `Malformed agent-docs block: found a start marker with no matching end ` +
          `in ${filePath}. Remove the incomplete block manually, then re-run.`,
      );
    } else if (onlyReplace) {
      // File exists but has no Astryx markers — skip it
      return false;
    } else {
      content = content.trimEnd() + '\n\n' + compressedIndex + '\n';
    }
  } else if (createIfMissing) {
    content = header ? header + '\n\n' + compressedIndex + '\n' : compressedIndex + '\n';
  } else {
    return false;
  }

  fs.writeFileSync(filePath, content);
  return true;
}

/**
 * Inject or update Astryx section in AGENTS.md.
 * Always creates the file if it doesn't exist.
 *
 * @param {string} targetDir
 * @param {string} version
 */
export function injectAgentsMd(targetDir, version) {
  const agentsPath = path.join(targetDir, AGENTS_MD);
  const compressedIndex = generateCompressedIndex(version, {
    coreDir: findCoreDir(targetDir),
    builtCheck: projectHasBuiltCheck(targetDir),
    stylingSystem: detectStylingSystem(targetDir),
  });
  injectXdsBlock(agentsPath, compressedIndex, {
    createIfMissing: true,
    header: `# AGENTS.md\n\nProject-specific guidance for AI coding agents.`,
  });
}

/**
 * Inject or update Astryx section in CLAUDE.md.
 * Only injects if CLAUDE.md already exists.
 *
 * @param {string} targetDir
 * @param {string} version
 * @returns {boolean} Whether the file was written
 */
export function injectClaudeMd(targetDir, version) {
  const claudePath = path.join(targetDir, CLAUDE_MD);
  const compressedIndex = generateCompressedIndex(version, {
    coreDir: findCoreDir(targetDir),
    builtCheck: projectHasBuiltCheck(targetDir),
    stylingSystem: detectStylingSystem(targetDir),
  });
  return injectXdsBlock(claudePath, compressedIndex);
}

/**
 * Remove the Astryx-managed block, between its markers, from a file, leaving
 * every other line as it is. With `deleteIfEmpty`, the file is deleted when
 * nothing is left but whitespace or the exact heading init writes into a file
 * it creates; with `deleteIfBlank`, only when nothing but whitespace is left.
 *
 * @param {string} filePath
 * @param {{deleteIfEmpty?: boolean, deleteIfBlank?: boolean}} [options]
 * @returns {boolean} Whether the Astryx section was found and removed
 */
export function removeXdsBlock(filePath, {deleteIfEmpty = false, deleteIfBlank = false} = {}) {
  if (!fs.existsSync(filePath)) return false;

  let content = fs.readFileSync(filePath, 'utf-8');
  // Find existing section (new or legacy markers), well-formed only.
  const block = findManagedBlock(content);
  if (!block) return false;

  const before = content.slice(0, block.start).trimEnd();
  const after = content.slice(block.end).trimStart();
  content = before + (after ? '\n\n' + after : '') + '\n';

  const rest = content.trim();
  if (
    (deleteIfBlank && rest === '') ||
    (deleteIfEmpty && (rest === '' || CREATED_HEADING.test(rest)))
  ) {
    fs.unlinkSync(filePath);
    return true;
  }

  fs.writeFileSync(filePath, content);
  return true;
}

/**
 * The whole of a file init created, once its block is gone: the heading init
 * writes, `# <name>` and its one line, and nothing else.
 */
const CREATED_HEADING =
  /^# [^\n]+\n\nProject-specific guidance for AI coding agents\.$/u;

/**
 * Whether the project's ignore rules exclude root CLAUDE.md, read with the
 * working-tree ignore reader upgrade uses, from the repository root down to
 * the project root. It decides only where the copy
 * goes (a fresh clone lacks an ignored file); the managed block is written
 * whatever the ignore rules say (INV31). An ignore file that cannot be read
 * counts as excluding root CLAUDE.md, so the copy in .claude/CLAUDE.md stays.
 * @param {string} targetDir
 * @returns {boolean}
 */
function rootClaudeIgnored(targetDir) {
  return uncommittedHere(targetDir, CLAUDE_MD, true);
}

/**
 * Whether a fresh clone lacks `rel` in `targetDir`: it is untracked and
 * ignored. Inside a repository the repository answers, with every ignore
 * source it reads (its ignore files, its local exclude file and configured
 * excludes), and a tracked file is committed whatever they say, as git and
 * Mercurial ignore only untracked files. Outside one, the project's ignore
 * files answer. `unreadable` is the answer when the repository, or an ignore
 * file, cannot answer.
 * @param {string} targetDir
 * @param {string} rel
 * @param {boolean} unreadable
 * @returns {boolean}
 */
function uncommittedHere(targetDir, rel, unreadable) {
  const root = repositoryRootOf(targetDir);
  if (!root) return ignoredHere(targetDir, rel, unreadable);
  return untrackedIgnored(root, targetDir, rel) ?? unreadable;
}

/**
 * How each repository kind lists `rel` when it is untracked and ignored:
 * `git check-ignore` exits 0 for such a file and 1 otherwise (it never
 * reports a tracked file); `status -i -n` prints it, or nothing.
 */
const IGNORED_QUERIES = [
  {marker: '.git', command: 'git', args: ['check-ignore', '-q', '--'], by: 'exit'},
  {marker: '.sl', command: 'sl', args: ['status', '-i', '-n', '--'], by: 'output'},
  {marker: '.hg', command: 'hg', args: ['status', '-i', '-n', '--'], by: 'output'},
];

/**
 * Whether the repository at `root` holds `rel` in `targetDir` as untracked
 * and ignored; null, which keeps the copy, when it cannot answer: its tool is
 * not installed or cannot start, runs past the time limit, or exits with a
 * code other than its documented answers.
 * @param {string} root
 * @param {string} targetDir
 * @param {string} rel
 * @returns {boolean | null}
 */
function untrackedIgnored(root, targetDir, rel) {
  const query = IGNORED_QUERIES.find(q => fs.existsSync(path.join(root, q.marker)));
  if (!query) return null;
  const result = spawnSync(query.command, [...query.args, rel], {
    cwd: targetDir,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 10_000,
    windowsHide: true,
    shell: false,
  });
  if (result.error) return null;
  if (query.by === 'exit') {
    if (result.status === 0) return true;
    if (result.status === 1) return false;
    return null;
  }
  if (result.status !== 0) return null;
  return result.stdout.trim() !== '';
}

/**
 * Whether the ignore files in `targetDir` exclude `rel`, read with the
 * working-tree ignore reader upgrade uses; for a folder outside any
 * repository. `unreadable` when an ignore file cannot be read.
 * @param {string} targetDir
 * @param {string} rel
 * @param {boolean} unreadable
 * @returns {boolean}
 */
function ignoredHere(targetDir, rel, unreadable) {
  try {
    return createFileProtectionResolver(targetDir)
      .classify(path.join(targetDir, rel))
      .some(item => item.reason === 'ignored');
  } catch {
    return unreadable;
  }
}

/**
 * The repository root at or above `dir`: the nearest folder holding `.git`,
 * `.hg`, or `.sl`. Null outside a repository.
 * @param {string} dir
 * @returns {string | null}
 */
function repositoryRootOf(dir) {
  for (let current = path.resolve(dir); ; ) {
    if (REPOSITORY_MARKERS.some(marker => fs.existsSync(path.join(current, marker)))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * Whether .claude/CLAUDE.md keeps a copy beside root CLAUDE.md (INV31): while
 * a fresh clone lacks root CLAUDE.md (the project ignores it and does not
 * track it), a .claude/CLAUDE.md the project commits (tracked, or not
 * ignored) gets the copy too (DEC-2: an extra copy beats none). One the
 * project ignores and does not track follows the usual rule: its block goes
 * once root CLAUDE.md holds one. An ignore file, or tracking, that cannot be
 * read keeps the copy.
 * @param {string} targetDir
 * @returns {boolean}
 */
function claudeDirKeepsCopy(targetDir) {
  if (!rootClaudeIgnored(targetDir)) return false;
  return !uncommittedHere(targetDir, CLAUDE_DIR_MD, false);
}

/**
 * `rels` without the files that resolve outside `targetDir`, each reported
 * through `onSkipped`.
 * @param {string} targetDir
 * @param {readonly string[]} rels
 * @param {((rel: string, reason: string) => void) | undefined} onSkipped
 * @returns {Set<string>} the files skipped
 */
function skipEscaping(targetDir, rels, onSkipped) {
  /** @type {Set<string>} */
  const skipped = new Set();
  for (const p of rels) {
    try {
      assertWithin(p, targetDir, {label: 'agent docs path'});
    } catch (err) {
      if (!(err instanceof PathSafetyError)) throw err;
      skipped.add(p);
      onSkipped?.(p, err.message);
    }
  }
  return skipped;
}

/**
 * Whether root CLAUDE.md holds `block` as its managed block, so a copy in
 * .claude/CLAUDE.md may go.
 * @param {string} targetDir
 * @param {string} block
 * @returns {boolean}
 */
function rootClaudeHolds(targetDir, block) {
  // A root CLAUDE.md the project ignores is not in a fresh clone, so it never
  // stands in for a committed copy in .claude/CLAUDE.md (an extra copy beats
  // none, DEC-2). An ignored .claude/CLAUDE.md is not in one either, so the
  // usual rule holds for it.
  if (claudeDirKeepsCopy(targetDir)) return false;
  try {
    const content = fs.readFileSync(path.join(targetDir, CLAUDE_MD), 'utf-8');
    const found = findManagedBlock(content);
    return found != null && content.slice(found.start, found.end) === block.trim();
  } catch {
    return false;
  }
}

/**
 * Whether an agent-doc file already carries a managed-block marker.
 * @param {string} filePath
 * @returns {boolean}
 */
function hasManagedMarker(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.includes(MARKER_START) || content.includes(LEGACY_MARKER_START);
  } catch {
    return false;
  }
}

/**
 * Whether `removeXdsBlock` would change `filePath`: it holds one well-formed
 * managed block.
 * @param {string} filePath
 * @returns {boolean}
 */
function hasRemovableBlock(filePath) {
  try {
    return findManagedBlock(fs.readFileSync(filePath, 'utf-8')) != null;
  } catch {
    return false;
  }
}

/**
 * Every file a run writes must resolve inside `targetDir`, symlinks
 * included. Checked for the whole write set before the first write, so an
 * escape writes nothing.
 * @param {string} targetDir
 * @param {Iterable<string>} relPaths
 */
function assertTargetsWithin(targetDir, relPaths) {
  for (const p of relPaths) {
    assertWithin(p, targetDir, {label: 'agent docs path'});
  }
}

/**
 * Throw `ERR_PATH_TRAVERSAL` when an agent doc in `targetDir` that holds a
 * managed block resolves outside `targetDir`.
 * @param {string} targetDir
 */
function assertRemovableWithin(targetDir, skip = new Set()) {
  const allPaths = discoverAgentDocs(targetDir);
  try {
    assertTargetsWithin(
      targetDir,
      allPaths.filter(
        p => !skip.has(p) && hasRemovableBlock(path.join(targetDir, p)),
      ),
    );
  } catch (err) {
    // The code reaches the error envelope as is, so it must be registered.
    if (!(err instanceof PathSafetyError)) throw err;
    throw new PathSafetyError(err.message, ERROR_CODES.ERR_PATH_TRAVERSAL);
  }
}

/**
 * Remove Astryx section from all known agent doc files.
 * @param {string} targetDir
 * @param {object} [options]
 * @param {string} [options.shownFrom] - Folder the logged paths are shown
 *   relative to; defaults to `targetDir`.
 * @param {Set<string>} [options.skip] - Files left as they are.
 * @returns {string[]} the project-relative files a block was removed from.
 * @throws {PathSafetyError} `ERR_PATH_TRAVERSAL` when a file it would change
 *   resolves outside `targetDir`; nothing is changed.
 */
export function removeAgentDocs(targetDir, {shownFrom = targetDir, skip = new Set()} = {}) {
  assertRemovableWithin(targetDir, skip);
  const allPaths = discoverAgentDocs(targetDir).filter(p => !skip.has(p));

  /** @type {string[]} */
  const removedFrom = [];
  for (const p of allPaths) {
    const filePath = path.join(targetDir, p);
    // Delete if empty for files we created (AGENTS.md, .claude/CLAUDE.md)
    const deleteIfEmpty = p === AGENTS_MD || p === CLAUDE_DIR_MD;
    if (removeXdsBlock(filePath, {deleteIfEmpty})) {
      // The default creates GEMINI.md holding only the import of AGENTS.md.
      if (p === GEMINI_MD && fs.readFileSync(filePath, 'utf-8').trim() === '') {
        fs.unlinkSync(filePath);
      }
      removedFrom.push(p);
      const shown = path.relative(shownFrom, filePath).split(path.sep).join('/') || p;
      if (!fs.existsSync(filePath)) {
        humanLog(`[ok] Removed empty ${shown}`);
      } else {
        humanLog(`[ok] Removed design system section from ${shown}`);
      }
    }
  }
  return removedFrom;
}

/**
 * Remove the managed block where init writes it, the project root (see
 * {@link resolveAgentDocsRoot}), and in `cwd`, so a block an earlier version
 * wrote in that folder goes too. Each folder is checked before anything is
 * changed. Run below the project root, a project-root agent file holding a
 * block that resolves outside the project is left as it is and reported to
 * `onSkipped`, as install does there; 0.7.x touched only `cwd`. A file in
 * `cwd`, or at the root when run there, that resolves outside refuses the run.
 *
 * @param {string} cwd
 * @param {{onSkipped?: (rel: string, reason: string) => void}} [options]
 * @returns {string[]} the files a block was removed from, relative to `cwd`
 * @throws {PathSafetyError} `ERR_PATH_TRAVERSAL`; nothing is changed
 */
export function removeProjectAgentDocs(cwd, {onSkipped} = {}) {
  const root = agentDocsTargetDir(cwd);
  const below = realDir(root) !== realDir(cwd);
  /** @type {Set<string>} */
  const rootSkip = below
    ? skipEscaping(
        root,
        discoverAgentDocs(root).filter(p => hasRemovableBlock(path.join(root, p))),
        (rel, reason) =>
          onSkipped?.(path.relative(cwd, path.join(root, rel)).split(path.sep).join('/'), reason),
      )
    : new Set();
  const dirs = below ? [root, cwd] : [cwd];
  for (const dir of dirs) assertRemovableWithin(dir, dir === root ? rootSkip : undefined);
  return dirs.flatMap(dir =>
    removeAgentDocs(dir, {shownFrom: cwd, skip: dir === root ? rootSkip : undefined}).map(rel =>
      path.relative(cwd, path.join(dir, rel)).split(path.sep).join('/'),
    ),
  );
}

/**
 * Write the block into each standalone agent doc and remove a managed block
 * from each import wrapper. A refresh (`onlyReplace`) skips files without a
 * block and leaves a managed import of AGENTS.md as it is.
 *
 * @param {string} targetDir
 * @param {string[]} existing
 * @param {Map<string, Set<string>>} givenWrappers
 * @param {string} compressedIndex
 * @param {boolean} onlyReplace
 * @param {((rel: string, reason: string) => void) | undefined} onSkipped
 * @param {boolean} [refuseEscapes] whether a file 0.7.1 wrote that escapes
 *   `targetDir` refuses the run
 * @returns {string[]} files written
 */
function writeEachAgentDoc(targetDir, existing, givenWrappers, compressedIndex, onlyReplace, onSkipped, refuseEscapes = true) {
  /** @param {string} p */
  const marked = p => hasManagedMarker(path.join(targetDir, p));
  // A committed .claude/CLAUDE.md beside an ignored root CLAUDE.md keeps a
  // copy (INV31): one that already holds a block is refreshed where it is,
  // even when it imports another agent file, rather than left stale.
  const keptCopy =
    givenWrappers.has(CLAUDE_DIR_MD) && marked(CLAUDE_DIR_MD) && claudeDirKeepsCopy(targetDir);
  const wrappers = new Map(givenWrappers);
  if (keptCopy) wrappers.delete(CLAUDE_DIR_MD);
  /** @param {string} p */
  const isImport = p => {
    try {
      return isAgentsImportBlock(p, fs.readFileSync(path.join(targetDir, p), 'utf-8'));
    } catch {
      return false;
    }
  };
  // Every agent file that imports no other agent file holds a copy, GEMINI.md
  // included (INV31); a managed import of AGENTS.md is left as it is.
  const targets = existing.filter(p => !wrappers.has(p) && !isImport(p));
  const writes = targets.filter(p => !onlyReplace || marked(p));
  const strips = [...wrappers.keys()].filter(marked);
  // A file 0.7.1 did not write here (GEMINI.md, or any file when init runs
  // below the project root) that resolves outside the project is skipped and
  // reported, as in the default layout, and the rest is written. A path of a
  // file 0.7.1 wrote that escapes the project refuses the run, as in 0.7.1.
  const skipped = skipEscaping(
    targetDir,
    // A kept copy here already holds a block, which 0.7.x wrote, so its
    // escape refuses the run like any file 0.7.x wrote.
    [...writes, ...strips].filter(p => !refuseEscapes || p === GEMINI_MD),
    onSkipped,
  );
  assertTargetsWithin(
    targetDir,
    [...writes, ...strips].filter(p => !skipped.has(p)),
  );
  // A refresh skips unmarked files and a wrapper is only written when it
  // carries a block, so only the files this run writes are checked.
  /** @type {string[]} */
  const written = [];
  for (const p of targets) {
    if (skipped.has(p)) continue;
    const didWrite = injectXdsBlock(path.join(targetDir, p), compressedIndex, {onlyReplace});
    if (didWrite) written.push(p);
  }
  for (const p of wrappers.keys()) {
    if (skipped.has(p)) continue;
    // The copy in .claude/CLAUDE.md goes only once root CLAUDE.md holds it.
    if (
      p === CLAUDE_DIR_MD &&
      (skipped.has(CLAUDE_MD) || !rootClaudeHolds(targetDir, compressedIndex))
    ) {
      continue;
    }
    if (stripManagedBlock(path.join(targetDir, p), compressedIndex)) written.push(p);
  }
  return written;
}

/**
 * The Claude Code file that holds the copy of the block: root CLAUDE.md, which
 * projects commit even when they ignore .claude/, else .claude/CLAUDE.md. It
 * holds the copy even when it imports AGENTS.md: Claude Code does not follow an
 * import of a file above the folder it starts in, so a session started in a
 * subfolder reads only the copy.
 *
 * @param {Set<string>} present Existing agent docs that are not AGENTS.md under
 *   another name.
 * @param {Set<string>} aliases Files that are AGENTS.md under another name.
 * @returns {string | null} null when the project has no Claude file, or when
 *   root CLAUDE.md is AGENTS.md under another name and so holds the block.
 */
function claudeCopyFile(present, aliases) {
  if (aliases.has(CLAUDE_MD)) return null;
  return [CLAUDE_MD, CLAUDE_DIR_MD].find(p => present.has(p)) ?? null;
}

/**
 * Plan the default layout. AGENTS.md holds the block. The Claude Code file the
 * project already has holds a copy (see {@link claudeCopyFile}), so the block
 * sits in a file the project commits; init creates no Claude file. GEMINI.md
 * imports AGENTS.md unless it already does. Every other wrapper here imports
 * AGENTS.md, so it already reaches the block.
 *
 * @param {string} targetDir
 * @param {string[]} existing
 * @param {Map<string, Set<string>>} wrappers
 * @param {Set<string>} aliases Files that are AGENTS.md under another name;
 *   they are never written.
 * @returns {Map<string, 'block' | 'import' | 'strip'>}
 */
function planDefaultAgentDocs(targetDir, existing, wrappers, aliases) {
  const present = new Set(existing.filter(p => !aliases.has(p)));
  /** @type {Map<string, 'block' | 'import' | 'strip'>} */
  const plan = new Map([[AGENTS_MD, 'block']]);

  // Claude Code reads CLAUDE.md and .claude/CLAUDE.md, and skips AGENTS.md
  // when either exists. One Claude file holds the copy, so Claude Code reads
  // it once in a subfolder and at most twice at the root, where it also
  // follows that file's import of AGENTS.md.
  const claudeCopy = claudeCopyFile(present, aliases);
  for (const p of [CLAUDE_MD, CLAUDE_DIR_MD]) {
    if (present.has(p)) plan.set(p, p === claudeCopy ? 'block' : 'strip');
  }

  // Gemini CLI reads GEMINI.md. Project settings can point it at AGENTS.md
  // too, but Gemini loads them only when it starts at the project root, so the
  // import is written anyway: two copies at the root beat none in a subfolder.
  // An import GEMINI.md already has, even inline, is enough.
  if (!aliases.has(GEMINI_MD)) {
    if (geminiImportsAgentsMd(targetDir)) {
      if (present.has(GEMINI_MD)) plan.set(GEMINI_MD, 'strip');
    } else {
      plan.set(GEMINI_MD, 'import');
    }
  }

  // Every other file: a full block when standalone, none in a wrapper.
  for (const p of present) {
    if (!plan.has(p)) plan.set(p, wrappers.has(p) ? 'strip' : 'block');
  }
  return plan;
}

/**
 * Write the default layout (see {@link planDefaultAgentDocs}).
 *
 * Path safety follows 0.7.0: an agent doc it would have written that resolves
 * outside `targetDir` refuses the whole run before any write. A file only this
 * layout writes, such as GEMINI.md, is skipped instead, reported through
 * `onSkipped`, and the rest is written.
 *
 * @param {string} targetDir
 * @param {string[]} existing
 * @param {Map<string, Set<string>>} wrappers
 * @param {Set<string>} aliases
 * @param {string} compressedIndex
 * @param {((rel: string, reason: string) => void) | undefined} onSkipped
 * @param {boolean} [refuseEscapes] whether a file 0.7.1 wrote that escapes
 *   `targetDir` refuses the run
 * @returns {string[]} files written, in {@link AGENT_DOC_PATHS} order
 */
function writeDefaultAgentDocs(targetDir, existing, wrappers, aliases, compressedIndex, onSkipped, refuseEscapes = true) {
  const plan = planDefaultAgentDocs(targetDir, existing, wrappers, aliases);
  // While root CLAUDE.md is one the project ignores, .claude/CLAUDE.md gets
  // the copy too, first run included: a fresh clone has only that file.
  if (plan.get(CLAUDE_DIR_MD) === 'strip' && claudeDirKeepsCopy(targetDir)) {
    plan.set(CLAUDE_DIR_MD, 'block');
  }
  // 0.7.x left a block-less import of an existing AGENTS.md alone, so a Claude
  // file of that shape that now gets the copy and resolves outside the project
  // is skipped and reported. Any other agent file 0.7.x wrote, so its escape
  // still refuses the run.
  /** @param {string} p */
  const leftAlone = p =>
    existing.includes(AGENTS_MD) &&
    wrappers.get(p)?.has(AGENTS_MD) === true &&
    !hasManagedMarker(path.join(targetDir, p));
  const foundLegacy = existing.filter(p => LEGACY_DOC_PATHS.includes(p));
  /** @param {string} p */
  const legacy = p =>
    !leftAlone(p) &&
    (foundLegacy.includes(p) || (p === AGENTS_MD && foundLegacy.length === 0));

  /** @type {Set<string>} */
  const escaped = new Set();
  for (const [p, action] of [...plan]) {
    // A strip writes only a file that carries a block.
    if (action === 'strip' && !hasManagedMarker(path.join(targetDir, p))) {
      plan.delete(p);
      continue;
    }
    try {
      assertWithin(p, targetDir, {label: 'agent docs path'});
    } catch (err) {
      if (!(err instanceof PathSafetyError) || (refuseEscapes && legacy(p))) throw err;
      plan.delete(p);
      escaped.add(p);
      onSkipped?.(p, err.message);
    }
  }
  // An import of an AGENTS.md left as it is would point at no block, so the
  // GEMINI.md import is not written either.
  if (escaped.has(AGENTS_MD) && plan.get(GEMINI_MD) === 'import') {
    plan.delete(GEMINI_MD);
    onSkipped?.(GEMINI_MD, 'its import of AGENTS.md would point at a file left as it is');
  }

  /** @type {string[]} */
  const written = [];
  for (const p of AGENT_DOC_PATHS) {
    const action = plan.get(p);
    if (action == null) continue;
    const filePath = path.join(targetDir, p);
    if (action === 'strip') {
      // The copy in .claude/CLAUDE.md goes only once root CLAUDE.md holds it.
      if (
        p === CLAUDE_DIR_MD &&
        (escaped.has(CLAUDE_MD) || !rootClaudeHolds(targetDir, compressedIndex))
      ) {
        continue;
      }
      if (stripManagedBlock(filePath, compressedIndex)) written.push(p);
      continue;
    }
    fs.mkdirSync(path.dirname(filePath), {recursive: true});
    injectXdsBlock(
      filePath,
      action === 'block' ? compressedIndex : renderAgentsImportBlock(p),
      {createIfMissing: true, header: CREATED_HEADERS[p] ?? ''},
    );
    written.push(p);
  }
  return written;
}

/**
 * Heading of the AGENTS.md the default creates; the same text the presets
 * write, so `--remove-agents` recognizes and deletes it.
 * @type {Readonly<Record<string, string>>}
 */
const CREATED_HEADERS = Object.freeze({
  [AGENTS_MD]: '# AGENTS.md\n\nProject-specific guidance for AI coding agents.',
});

/**
 * Agent docs that are one file under several names (symlinks), resolved inside
 * or outside the project.
 * @param {string} targetDir
 * @param {string[]} existing
 * @returns {{agentsAliases: Set<string>, otherShared: boolean}} the files that
 *   are AGENTS.md under another name, and whether any other two docs share a
 *   file.
 */
function findSharedAgentDocs(targetDir, existing) {
  /** @type {Map<string, string[]>} */
  const byFile = new Map();
  for (const p of existing) {
    let real;
    try {
      real = fs.realpathSync(path.join(targetDir, p));
    } catch {
      real = path.resolve(targetDir, p);
    }
    byFile.set(real, [...(byFile.get(real) ?? []), p]);
  }
  /** @type {Set<string>} */
  const agentsAliases = new Set();
  let otherShared = false;
  for (const names of byFile.values()) {
    if (names.length < 2) continue;
    if (!names.includes(AGENTS_MD)) {
      otherShared = true;
      continue;
    }
    for (const name of names) if (name !== AGENTS_MD) agentsAliases.add(name);
  }
  return {agentsAliases, otherShared};
}

/**
 * Remove the managed block from a file that should not carry one, leaving the
 * rest of the file as it is. A malformed block is refused (throws) rather than
 * guessed at. `.claude/CLAUDE.md` is deleted when nothing but whitespace is
 * left.
 * @param {string} filePath
 * @param {string} compressedIndex
 * @returns {boolean} whether the file changed
 */
function stripManagedBlock(filePath, compressedIndex) {
  const deleteIfBlank =
    path.basename(filePath) === path.basename(CLAUDE_DIR_MD) &&
    path.basename(path.dirname(filePath)) === path.dirname(CLAUDE_DIR_MD);
  if (removeXdsBlock(filePath, {deleteIfBlank})) return true;
  if (hasManagedMarker(filePath)) {
    // Preserve the existing fail-closed behavior for malformed blocks.
    injectXdsBlock(filePath, compressedIndex, {onlyReplace: true});
  }
  return false;
}

/**
 * Programmatic entry point for installing agent docs.
 * Used by the init command, upgrade command, and agent-docs command.
 *
 * Default strategy (no agent/paths specified), so every agent reads the block:
 * - Write the block to AGENTS.md (created when missing).
 * - Write the block to the project's Claude Code file: root CLAUDE.md when it
 *   exists, else an existing .claude/CLAUDE.md, even when it imports AGENTS.md.
 *   Remove a block from the other one. Create no Claude file.
 * - Write a managed import of AGENTS.md to GEMINI.md (created when missing),
 *   unless GEMINI.md already imports AGENTS.md.
 * - Keep a full block in every other existing standalone file.
 * - Leave every other `@path` import wrapper untouched; if an older run
 *   expanded a block into one, remove that duplicate block. When a wrapper
 *   imports a file other than AGENTS.md, the project keeps its own layout:
 *   every standalone file gets the block.
 * A refresh (`onlyReplace`) rewrites existing blocks in place, the Claude
 * file's copy included, leaves imports of AGENTS.md as they are, and creates
 * nothing.
 *
 * @param {string} targetDir
 * @param {object} [options]
 * @param {boolean} [options.zh]
 * @param {string} [options.lang]
 * @param {string} [options.agent] - Tool preset: 'claude', 'cursor', 'codex', 'hermes', 'muse', 'all'
 * @param {string[]} [options.paths] - Explicit paths (overrides agent/auto-detect)
 * @param {boolean} [options.onlyReplace] - Only update files that already have Astryx markers (for upgrades)
 * @param {string[]} [options.topics] - Doc topics to list in the block; defaults
 *   to the CLI's own. Pass the project's catalog (`(await project.docs()).names()`)
 *   so an integration's topics reach the agent.
 * @param {string} [options.renderedBlock] - Fully rendered expected block. Init
 *   and upgrade pass one shared block to every target.
 * @param {(rel: string, reason: string) => void} [options.onSkipped] - Called
 *   for each file skipped because it resolves outside `targetDir` and 0.7.1
 *   never wrote it: GEMINI.md, or any file when `refuseEscapes` is false.
 * @param {boolean} [options.refuseEscapes] - Whether a file 0.7.1 wrote that
 *   resolves outside `targetDir` refuses the run (default). Init passes false
 *   when it runs below the project root, where 0.7.1 wrote in the folder it
 *   ran in instead.
 * @returns {string[]} List of files written
 * @throws {import('../fs/path-safety.mjs').PathSafetyError} when a file it would
 *   write resolves outside `targetDir`; nothing is written.
 * @throws {AgentDocsHomeError} when `targetDir` is the home folder, or a settings
 *   folder in it outside a project, or, with `paths`, when a file's own folder
 *   is; nothing is written.
 */
export function installAgentDocs(
  targetDir,
  {
    zh = false,
    lang,
    agent,
    paths,
    onlyReplace = false,
    topics,
    renderedBlock,
    onSkipped,
    refuseEscapes = true,
  } = {},
) {
  const explicit = paths != null && paths.length > 0;
  // Explicit paths are checked file by file below: each file's own folder
  // is what agents would read in every project.
  if (!explicit) assertAgentDocsTarget(targetDir);
  const coreDir = findCoreDir(targetDir);
  const version = getXdsVersion(coreDir);
  const invocation = getCliInvocation(targetDir);
  const stylingSystem = detectStylingSystem(targetDir);
  const compressedIndex =
    renderedBlock ??
    generateCompressedIndex(version, {
      coreDir,
      builtCheck: projectHasBuiltCheck(targetDir),
      zh,
      lang,
      invocation,
      stylingSystem,
      topics,
    });
  /** @type {string[]} */
  const written = [];

  // Explicit paths override everything
  if (explicit) {
    // Path-safety: each --agent-docs-path entry must resolve inside the
    // target directory. Reject absolute paths (silent re-rooting via
    // path.join hides intent) and `..` traversal.
    for (const p of paths) {
      assertWithin(p, targetDir, {label: 'agent docs path'});
    }
    // A file directly in the home folder, or at the top of a settings folder
    // in it, is refused, as 0.7.x never wrote there unasked; a file in a
    // plain folder of the home folder, such as ~/notes/AI.md, is written.
    // Every path is checked before anything is written.
    for (const p of paths) {
      assertAgentDocsTarget(path.dirname(path.join(targetDir, p)));
    }
    for (const p of paths) {
      const filePath = path.join(targetDir, p);
      const dir = path.dirname(filePath);
      if (dir !== targetDir) {
        fs.mkdirSync(dir, {recursive: true});
      }
      injectXdsBlock(filePath, compressedIndex, {
        createIfMissing: true,
        header: `# ${path.basename(p, path.extname(p))}\n\nProject-specific guidance for AI coding agents.`,
      });
      written.push(p);
    }
    return written;
  }

  // Agent preset
  if (agent) {
    const {inject, create} = resolveAgentPaths(targetDir, agent);
    // Claude Code reads CLAUDE.md and .claude/CLAUDE.md together: when the
    // block goes in CLAUDE.md, .claude/CLAUDE.md gets none, and a block there
    // is removed.
    const claudeRoot = inject.includes(CLAUDE_MD);
    // While root CLAUDE.md is ignored, a committed .claude/CLAUDE.md holds a
    // copy too, with `claude` and `all` alike (INV31), first run included.
    const keepDirCopy = claudeRoot && claudeDirKeepsCopy(targetDir);
    const injectAll = !claudeRoot
      ? inject
      : keepDirCopy
        ? [...new Set([...inject, CLAUDE_DIR_MD])].filter(p =>
            p !== CLAUDE_DIR_MD || fs.existsSync(path.join(targetDir, CLAUDE_DIR_MD)),
          )
        : inject.filter(p => p !== CLAUDE_DIR_MD);
    const dirHasBlock = hasManagedMarker(path.join(targetDir, CLAUDE_DIR_MD));
    const strip = claudeRoot && !keepDirCopy && dirHasBlock ? [CLAUDE_DIR_MD] : [];
    // A path that escapes the project refuses the run, as in 0.7.0; below the
    // project root, where 0.7.1 wrote nothing, it is skipped and reported. A
    // .claude/CLAUDE.md the preset adds beside an ignored root, which 0.7.1
    // did not write, is skipped and reported wherever init runs.
    // So is removing a block from .claude/CLAUDE.md with `claude`, whose
    // 0.7.1 preset wrote only root CLAUDE.md there; `all` wrote both, so its
    // escape still refuses.
    const added = injectAll.filter(p => !inject.includes(p));
    const unrefused = agent === 'claude' ? [...added, ...strip] : added;
    const escaping = refuseEscapes
      ? skipEscaping(targetDir, unrefused, onSkipped)
      : skipEscaping(targetDir, [...injectAll, ...create, ...strip], onSkipped);
    const injectHere = injectAll.filter(p => !escaping.has(p));
    const createHere = create.filter(p => !escaping.has(p));
    const stripHere = escaping.has(CLAUDE_MD) ? [] : strip.filter(p => !escaping.has(p));
    assertTargetsWithin(targetDir, [...injectHere, ...createHere, ...stripHere]);
    for (const p of injectHere) {
      injectXdsBlock(path.join(targetDir, p), compressedIndex);
      written.push(p);
    }
    for (const p of createHere) {
      const filePath = path.join(targetDir, p);
      const dir = path.dirname(filePath);
      if (dir !== targetDir) {
        fs.mkdirSync(dir, {recursive: true});
      }
      injectXdsBlock(filePath, compressedIndex, {
        createIfMissing: true,
        header: `# ${path.basename(p, path.extname(p))}\n\nProject-specific guidance for AI coding agents.`,
      });
      written.push(p);
    }
    for (const p of stripHere) {
      if (!rootClaudeHolds(targetDir, compressedIndex)) continue;
      if (stripManagedBlock(path.join(targetDir, p), compressedIndex)) written.push(p);
    }
    return written;
  }

  // Auto-detect. A refresh rewrites each existing block where it is.
  const existing = discoverAgentDocs(targetDir);
  if (onlyReplace) {
    const wrappers = findAgentDocWrappers(readAgentDocImports(targetDir, existing));
    // The Claude file keeps its copy even when it imports AGENTS.md, so a
    // refresh rewrites that block rather than removing it.
    const {agentsAliases} = findSharedAgentDocs(targetDir, existing);
    const claudeCopy = claudeCopyFile(
      new Set(existing.filter(p => !agentsAliases.has(p))),
      agentsAliases,
    );
    if (claudeCopy != null) wrappers.delete(claudeCopy);
    // A committed .claude/CLAUDE.md kept beside an ignored root CLAUDE.md is
    // refreshed even when it imports AGENTS.md (writeEachAgentDoc).
    return writeEachAgentDoc(targetDir, existing, wrappers, compressedIndex, true, onSkipped, refuseEscapes);
  }
  // A wrapper that imports something other than AGENTS.md, or two agent docs
  // that are one file, mean the project chose its own layout: keep the
  // per-file layout then. AGENTS.md under another name is fine.
  const wrappers = findAgentDocWrappers(readAgentDocImports(targetDir, existing, [AGENTS_MD]));
  const {agentsAliases, otherShared} = findSharedAgentDocs(targetDir, existing);
  if (otherShared || [...wrappers.values()].some(targets => !targets.has(AGENTS_MD))) {
    const ownWrappers = findAgentDocWrappers(readAgentDocImports(targetDir, existing));
    return writeEachAgentDoc(targetDir, existing, ownWrappers, compressedIndex, false, onSkipped, refuseEscapes);
  }
  return writeDefaultAgentDocs(
    targetDir,
    existing,
    wrappers,
    agentsAliases,
    compressedIndex,
    onSkipped,
    refuseEscapes,
  );
}
