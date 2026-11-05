// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Detect the project's package manager.
 *
 * The order is: the `packageManager` field a project DECLARES, then the
 * lockfiles it happens to have, then a committed package-manager config, then
 * the runner that launched us. Returns the correct command prefix for running
 * package binaries (e.g. 'npx astryx', 'yarn astryx', 'pnpm exec astryx'), and
 * the scoped one-off form ('npx @astryxdesign/cli') when the `astryx` bin does
 * not resolve from the project. An integration's declared `cliCommand`, then
 * a host's door name, come first (see cli-command.mjs).
 */

import {AsyncLocalStorage} from 'node:async_hooks';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {cliDoor, declaredCliCommand} from './cli-command.mjs';
import {CLI_ROOT} from '../fs/paths.mjs';
import {cliVersion, runChoice} from '../release/run-context.mjs';
import {isGlobalCopy} from '../release/choose.mjs';
import {isInReleaseCache} from '../release/cache.mjs';

/**
 * A package manager we can install with and run binaries through.
 * @typedef {'yarn' | 'pnpm' | 'bun' | 'npm'} PackageManager
 */

/**
 * Result of package-manager detection. `'npx'` is the sentinel for "nothing
 * detected" — no lockfile, no `packageManager` field, no runner user-agent —
 * so callers fall back to npm/npx. It is a distinct value from {@link PackageManager}
 * because it means "undetected", not "npm was chosen".
 * @typedef {PackageManager | 'npx'} DetectedPackageManager
 */

/** @type {readonly PackageManager[]} */
const KNOWN_PMS = ['yarn', 'pnpm', 'bun', 'npm'];

/**
 * Lockfile names by package manager. Order is the tiebreak of LAST resort —
 * see {@link explainPackageManager} for why it should rarely decide anything.
 * @type {readonly [PackageManager, readonly string[]][]}
 */
const LOCKFILES = [
  ['yarn', ['yarn.lock']],
  ['pnpm', ['pnpm-lock.yaml']],
  ['bun', ['bun.lockb', 'bun.lock']],
  ['npm', ['package-lock.json']],
];

/**
 * A lockfile found on disk: which package manager owns it, and the file that
 * was actually there (bun has two spellings), so a caller can name it.
 * @typedef {{pm: PackageManager, file: string}} FoundLockfile
 */

/**
 * Narrow an arbitrary string to a known {@link PackageManager}.
 * @param {string} name
 * @returns {name is PackageManager}
 */
function isKnownPackageManager(name) {
  return /** @type {readonly string[]} */ (KNOWN_PMS).includes(name);
}

/**
 * The `packageManager` field of a directory's package.json, if it names one we
 * know. This is the declarative answer (corepack's field), so it outranks any
 * lockfile sitting next to it.
 * @param {string} dir
 * @returns {PackageManager | null}
 */
function declaredPackageManager(dir) {
  const pkgPath = path.join(dir, 'package.json');
  if (!fs.existsSync(pkgPath)) return null;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const name = String(pkg.packageManager ?? '').split('@')[0];
    return isKnownPackageManager(name) ? name : null;
  } catch {
    // Best-effort: unreadable/invalid package.json.
    return null;
  }
}

/**
 * The package manager currently running us, from the user agent every PM sets
 * on the scripts and binaries it spawns.
 * @returns {PackageManager | null}
 */
function runningPackageManager() {
  const name = String(process.env.npm_config_user_agent ?? '').split('/')[0];
  return isKnownPackageManager(name) ? name : null;
}

/**
 * Every lockfile in this directory, with the file that was found.
 * @param {string} dir
 * @returns {FoundLockfile[]}
 */
function lockfilesIn(dir) {
  /** @type {FoundLockfile[]} */
  const found = [];
  for (const [pm, names] of LOCKFILES) {
    const file = names.find(name => fs.existsSync(path.join(dir, name)));
    if (file) found.push({pm, file});
  }
  return found;
}

/**
 * Files a project COMMITS that name its package manager. A stray `install` in
 * the wrong tool drops a lockfile; it does not write any of these. That is what
 * makes them project-owned evidence and a lockfile, on its own, merely a trace.
 * @type {readonly [PackageManager, readonly string[]][]}
 */
const PROJECT_EVIDENCE = [
  ['pnpm', ['pnpm-workspace.yaml']],
  ['yarn', ['.yarnrc.yml', '.yarnrc']],
  ['bun', ['bunfig.toml']],
];

/**
 * Every package manager this directory declares through a committed config file.
 * @param {string} dir
 * @returns {PackageManager[]}
 */
function evidenceIn(dir) {
  return PROJECT_EVIDENCE.filter(([, names]) =>
    names.some(name => fs.existsSync(path.join(dir, name))),
  ).map(([pm]) => pm);
}

/**
 * A detection result, with the reasoning a caller needs to report it.
 * @typedef {object} PackageManagerResolution
 * @property {DetectedPackageManager} pm - What to use.
 * @property {boolean} ambiguous - True when several lockfiles sit in one
 *   directory and nothing the project owns picks between them. `pm` is then the
 *   neutral `'npx'`: correct under every package manager, wrong under none.
 * @property {string | null} dir - The directory that answered, if any.
 * @property {PackageManager[]} candidates - The lockfile owners in `dir`.
 * @property {PackageManager | null} declared - The `packageManager` field in
 *   `dir`, when it names one we know. Non-null means the project SAID which
 *   one, and `pm` is that.
 * @property {'declared' | 'lockfile' | 'evidence' | 'runner' | 'none'} source -
 *   What decided `pm`.
 * @property {FoundLockfile[]} strayLockfiles - Lockfiles in `dir` that the
 *   declared field contradicts. Detection ignores them; `astryx doctor` reports
 *   them, because a tool that trusts the lockfile instead will disagree with us.
 */

/**
 * What one directory's own files say about its package manager, by the rules
 * {@link explainPackageManager} applies within a directory (declared field,
 * then a single lockfile, then committed config when lockfiles tie). Returns
 * null when the directory has neither a declaration nor a lockfile, so a caller
 * walking up keeps looking. An ambiguous directory reports `ambiguous: true`
 * with the lockfiles that disagree, so a caller can name them.
 * @param {string} dir
 * @returns {(Omit<PackageManagerResolution, 'dir'> & {lockfiles: FoundLockfile[]}) | null}
 */
export function decidePackageManagerIn(dir) {
  const locks = lockfilesIn(dir);
  const candidates = locks.map(lock => lock.pm);
  const declared = declaredPackageManager(dir);

  // The project declared one. Nothing on the filesystem outranks that.
  if (declared) {
    return {
      pm: declared,
      ambiguous: false,
      candidates,
      declared,
      source: 'declared',
      lockfiles: locks,
      strayLockfiles: locks.filter(lock => lock.pm !== declared),
    };
  }

  // One lockfile is unambiguous.
  if (locks.length === 1) {
    return {
      pm: locks[0].pm,
      ambiguous: false,
      candidates,
      declared: null,
      source: 'lockfile',
      lockfiles: locks,
      strayLockfiles: [],
    };
  }

  // Several lockfiles and no declaration: the filesystem cannot say. Only a
  // file the project committed on purpose can.
  if (locks.length > 1) {
    const evidence = evidenceIn(dir).filter(pm => candidates.includes(pm));
    if (evidence.length === 1) {
      return {
        pm: evidence[0],
        ambiguous: false,
        candidates,
        declared: null,
        source: 'evidence',
        lockfiles: locks,
        strayLockfiles: [],
      };
    }
    return {
      pm: 'npx',
      ambiguous: true,
      candidates,
      declared: null,
      source: 'none',
      lockfiles: locks,
      strayLockfiles: [],
    };
  }

  return null;
}

/**
 * Detect the project's package manager, with the reasoning attached.
 * Walks up from targetDir, taking the first directory that answers.
 *
 * The order within a directory, strongest first:
 *
 * 1. **The declared `packageManager` field.** This is the project saying which
 *    one it uses — corepack's field, the only signal a person writes on
 *    purpose — so it decides, whatever lockfiles happen to sit beside it. A
 *    single `yarn install` in a pnpm project drops a `yarn.lock` that never
 *    goes away, and letting that trace outrank the declaration made every
 *    command the CLI printed wrong for the project, including the invocation
 *    line written into agent docs, which agents copy. The contradicted
 *    lockfiles come back as `strayLockfiles` so `doctor` can say so.
 * 2. **A single lockfile**, when nothing is declared. Unambiguous, and the
 *    long-standing fallback.
 * 3. **A committed package-manager config** (`pnpm-workspace.yaml`,
 *    `.yarnrc.yml`, `bunfig.toml`), when several lockfiles tie and nothing is
 *    declared. A stray `install` drops a lockfile; it does not write one of
 *    these.
 * 4. **Nothing project-owned decides it** — then the answer is not a guess, it
 *    is `'npx'`, which runs correctly under every package manager, plus
 *    `ambiguous: true` so `astryx doctor` can report the real problem. (Same
 *    idea as `findConfigPath`, which refuses to choose between coexisting
 *    configs.)
 * 5. **The runner**, only once the whole walk found nothing on disk.
 *    Deliberately last, and never a tiebreak: an agent handed the wrong `yarn
 *    astryx` line runs the CLI *through yarn*, so the runner agrees with the
 *    mistake and the wrong line reproduces itself forever.
 *
 * @param {string} [targetDir=process.cwd()]
 * @returns {PackageManagerResolution}
 */
export function explainPackageManager(targetDir = process.cwd()) {
  let dir = path.resolve(targetDir);
  const root = path.parse(dir).root;

  while (dir !== root) {
    const decision = decidePackageManagerIn(dir);
    if (decision) {
      return {
        pm: decision.pm,
        ambiguous: decision.ambiguous,
        dir,
        candidates: decision.candidates,
        declared: decision.declared,
        source: decision.source,
        strayLockfiles: decision.strayLockfiles,
      };
    }

    dir = path.dirname(dir);
  }

  // 5. Nothing on disk said anything anywhere. With no project evidence to
  //    contradict, the runner is the only signal there is.
  const running = runningPackageManager();
  return {
    pm: running ?? 'npx',
    ambiguous: false,
    dir: null,
    candidates: [],
    declared: null,
    source: running ? 'runner' : 'none',
    strayLockfiles: [],
  };
}

/**
 * Detect the package manager used in a project directory.
 *
 * Returns `'npx'` when nothing can be detected, and also when several lockfiles
 * tie with nothing project-owned to break them — see
 * {@link explainPackageManager}, which carries the `ambiguous` flag callers need
 * to report that second case.
 *
 * @param {string} [targetDir=process.cwd()]
 * @returns {DetectedPackageManager}
 */
export function detectPackageManager(targetDir = process.cwd()) {
  return explainPackageManager(targetDir).pm;
}

/**
 * Get the command prefix for running a package binary.
 *
 * @param {string} [targetDir]
 * @returns {string} e.g. 'npx', 'yarn', 'pnpm exec', 'bunx'
 */
export function getRunPrefix(targetDir) {
  const pm = detectPackageManager(targetDir);
  switch (pm) {
    case 'yarn':
      return 'yarn';
    case 'pnpm':
      return 'pnpm exec';
    case 'bun':
      return 'bunx';
    case 'npm':
    default:
      return 'npx';
  }
}

/** The published CLI package name — used for one-off (uninstalled) invocations. */
export const CLI_PACKAGE = '@astryxdesign/cli';

/** The CLI binary name — only resolves once the CLI is installed (or run via CLI_PACKAGE). */
export const CLI_BIN = 'astryx';

/**
 * Get the one-off ("dlx") runner for the detected package manager.
 *
 * Unlike {@link getRunPrefix} (which runs an *installed* binary), this fetches
 * and runs a package on demand — so it is always paired with the scoped
 * {@link CLI_PACKAGE}, never the bare `astryx` bin. Running bare `npx astryx`
 * without the CLI installed resolves to an unrelated package on the registry.
 *
 * Classic Yarn (1.x) has no `dlx`, so its projects get `npx`, which every
 * Node install carries.
 *
 * @param {string} [targetDir]
 * @returns {string} e.g. 'npx', 'pnpm dlx', 'yarn dlx', 'bunx'
 */
export function getDlxPrefix(targetDir) {
  const resolution = explainPackageManager(targetDir);
  switch (resolution.pm) {
    case 'yarn':
      return isYarnClassic(resolution) ? 'npx' : 'yarn dlx';
    case 'pnpm':
      return 'pnpm dlx';
    case 'bun':
      return 'bunx';
    case 'npm':
    default:
      return 'npx';
  }
}

/**
 * Is the project's Yarn the classic line (1.x), which has no `dlx`?
 *
 * Read from the signals detection trusts, in the same order: the declared
 * `packageManager` version, then the lockfile header (`# yarn lockfile v1`
 * is classic; Berry's lockfile carries `__metadata:`), then a committed
 * config (`.yarnrc.yml` is Berry, a lone `.yarnrc` classic), then the
 * runner's user agent (`yarn/1.22.21 …`). With none of them it is Berry.
 *
 * @param {PackageManagerResolution} resolution
 * @returns {boolean}
 */
function isYarnClassic({dir}) {
  if (dir) {
    const declared = declaredYarnMajor(dir);
    if (declared !== null) return declared === 1;
    const lockfile = path.join(dir, 'yarn.lock');
    if (fs.existsSync(lockfile)) {
      const head = readHead(lockfile);
      if (/^# yarn lockfile v1\b/m.test(head)) return true;
      if (/^__metadata:/m.test(head)) return false;
    }
    if (fs.existsSync(path.join(dir, '.yarnrc.yml'))) return false;
    if (fs.existsSync(path.join(dir, '.yarnrc'))) return true;
  }
  const agent = /^yarn\/(\d+)\./.exec(
    String(process.env.npm_config_user_agent ?? ''),
  );
  return agent ? agent[1] === '1' : false;
}

/**
 * The major version in a directory's `packageManager: "yarn@<version>"`.
 * @param {string} dir
 * @returns {number | null}
 */
function declaredYarnMajor(dir) {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'),
    );
    const match = /^yarn@(\d+)(?:[.+]|$)/.exec(
      String(pkg.packageManager ?? ''),
    );
    return match ? Number(match[1]) : null;
  } catch {
    // Best-effort: no package.json, or an unreadable one.
    return null;
  }
}

/**
 * The first bytes of a file — enough for a lockfile's header.
 * @param {string} file
 * @returns {string}
 */
function readHead(file) {
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const buffer = Buffer.alloc(512);
      const bytes = fs.readSync(fd, buffer, 0, buffer.length, 0);
      return buffer.toString('utf-8', 0, bytes);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return '';
  }
}

/**
 * Heuristic: was the running CLI launched one-off via a package runner
 * (npx / pnpm dlx / yarn dlx / bunx) rather than from an installed dependency?
 *
 * We sniff the entry path (`process.argv[1]`) for well-known runner-cache
 * markers. This errs safe in both directions: a false negative falls back to
 * {@link getCliInvocation}'s on-disk check, and a false positive emits the
 * always-valid scoped form (`<dlx> @astryxdesign/cli`).
 *
 * @returns {boolean}
 */
export function isCliOneOff() {
  const entry = String(process.argv[1] || '').replace(/\\/g, '/');
  return /\/_npx\/|\/dlx[-/]|\/\.bun\/install\/cache\/|\/bunx-/.test(entry);
}

/** The `astryx` bin as package managers link it, including the Windows shims. */
const CLI_BIN_LINKS = [CLI_BIN, `${CLI_BIN}.cmd`, `${CLI_BIN}.ps1`];

/**
 * Does the bare `astryx` bin resolve from `targetDir`?
 *
 * A package runner finds an installed bin in `node_modules/.bin`, in the
 * project or in a folder above it (a workspace root). When no such link
 * exists, `npx astryx` and `bunx astryx` fetch the unrelated registry package
 * named `astryx` instead of running this CLI, and `pnpm exec astryx` or
 * `yarn astryx` fail. A global install, or a workspace install running in a
 * fresh package, is exactly that case.
 *
 * A false negative (a layout without `node_modules/.bin`, such as Yarn Plug'n'Play)
 * is safe: the caller suggests the scoped package, which always resolves.
 *
 * @param {string} [targetDir=process.cwd()]
 * @returns {boolean}
 */
export function cliBinResolves(targetDir = process.cwd()) {
  let dir = path.resolve(targetDir);
  for (;;) {
    const binDir = path.join(dir, 'node_modules', '.bin');
    if (CLI_BIN_LINKS.some(name => fs.existsSync(path.join(binDir, name)))) {
      return true;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
}

/**
 * The CLI invocation stem every printed command starts with. The one picker:
 * every hint, error, Doctor fix and doc line that names a command goes through
 * it (directly, or through {@link formatCliCommand} and
 * {@link formatCliCommandsIn}). JSON fields that carry a command stay bare.
 *
 * In order:
 *
 * - The `cliCommand` an integration loaded in this project declares, e.g.
 *   `acme astryx`. When two integrations declare different commands,
 *   neither is used, the guess below is (even when a host set a door), and
 *   `astryx doctor` warns.
 * - The door a host ran this call through (see cli-command.mjs). Empty in a
 *   plain run.
 * - Otherwise the guess below.
 *
 * The guess names a command that, run from `targetDir`, reaches the release
 * that answered (spec AST-081 FR5):
 *
 * - The project's own CLI answered and its `astryx` bin resolves from
 *   `targetDir`: `<run-prefix> astryx` (e.g. `pnpm exec astryx`).
 * - Outside a project, the CLI installed for the computer (or the release it
 *   keeps) answered: `astryx`.
 * - Otherwise: `<dlx-prefix> @astryxdesign/cli@<answering version>`, pinned so
 *   the package runner starts the same release. The bare `astryx` name would
 *   make npm fetch an unrelated registry package, and the unpinned scoped
 *   package the newest release.
 *
 * With `installed`, the line follows a step that installs the project's own
 * CLI (an update notice, the hint that matches a project's CLI to its Core),
 * so the guess is that CLI: `<run-prefix> astryx`. A declared `cliCommand`
 * and a host's door still come first.
 *
 * @param {string} [targetDir] the project the printed command runs in;
 *   defaults to the working directory
 * @param {{installed?: boolean}} [options]
 * @returns {string}
 */
export function getCliInvocation(targetDir, {installed = false} = {}) {
  const declared = declaredCliCommand(targetDir);
  if (declared.command) return declared.command;
  const guess = () =>
    installed
      ? `${getRunPrefix(targetDir)} ${CLI_BIN}`
      : guessCliInvocation(targetDir);
  if (declared.conflict) return guess();
  return cliDoor() ?? guess();
}

/**
 * The package-manager guess alone, without any integration's `cliCommand` or
 * a host's door. The picker falls back to it when declared commands conflict,
 * and Doctor names it then.
 *
 * @param {string} [targetDir]
 * @returns {string}
 */
export function guessCliInvocation(targetDir) {
  // Who answered this run decides the stem, so every command one run prints
  // reaches the same release, whichever folder a line names.
  const choice = runChoice(process.cwd());
  if (choice.copy === 'project' && !isCliOneOff() && cliBinResolves(targetDir)) {
    return `${getRunPrefix(targetDir)} ${CLI_BIN}`;
  }
  if (!choice.inProject && (isGlobalCopy(CLI_ROOT) || isInReleaseCache(CLI_ROOT))) {
    return CLI_BIN;
  }
  return `${getDlxPrefix(targetDir)} ${CLI_PACKAGE}@${cliVersion()}`;
}

/**
 * Format a full, runnable CLI command from a subcommand string.
 *
 * Accepts either `astryx component Button` or `component Button` (a leading
 * `astryx` token is stripped) and prepends the install-aware invocation stem
 * from {@link getCliInvocation}.
 *
 * @param {string} command e.g. 'astryx component Button' | 'docs tokens'
 * @param {string} [targetDir]
 * @returns {string}
 */
export function formatCliCommand(command, targetDir) {
  const sub = String(command)
    .replace(/^\s*astryx\b\s*/, '')
    .trim();
  const stem = getCliInvocation(targetDir);
  return sub ? `${stem} ${sub}` : stem;
}

/** Code-fence languages whose lines are shell commands. */
const SHELL_FENCES = new Set(['', 'bash', 'sh', 'shell', 'zsh', 'console']);

/** Code-fence languages that hold prose, such as a prompt to paste. */
const PROSE_FENCES = new Set(['text', 'txt', 'markdown', 'md']);

/** `astryx` where a shell line starts a command: line start, `$ `, `&&`, `||`, `;`, `|`. */
const SHELL_COMMAND = /(^\s*(?:\$\s+)?|(?:&&|\|\||;|\|)\s*)astryx(?=\s|$)/g;

/** `astryx` opening an inline code span: `` `astryx docs` `` or `` `astryx` ``. */
const INLINE_COMMAND = /`astryx(?=[\s`])/g;

/**
 * Prefix the CLI commands in one line.
 * @param {string} line
 * @param {string} stem
 * @param {string | null} lang the fence the line sits in; null for prose
 * @returns {string}
 */
function prefixLine(line, stem, lang) {
  if (lang == null) return line.replace(INLINE_COMMAND, `\`${stem}`);
  if (SHELL_FENCES.has(lang)) return line.replace(SHELL_COMMAND, `$1${stem}`);
  if (PROSE_FENCES.has(lang)) {
    return line
      .replace(INLINE_COMMAND, `\`${stem}`)
      .replace(SHELL_COMMAND, `$1${stem}`);
  }
  return line;
}

/**
 * Prefix every CLI command in doc text with `stem`, the invocation from
 * {@link getCliInvocation}.
 *
 * Docs, including an integration's, are written with bare `astryx ...`
 * commands; this rewrites them when they are shown. In prose, an inline code
 * span that starts with `astryx`. In a shell code fence (no language, `bash`,
 * `sh`, `shell`, `zsh`, `console`), each `astryx` that starts a command. In a
 * `text` or `markdown` fence, both. Other fences, and plain words, are left
 * alone. JSON output keeps the authored text.
 *
 * @param {string} text Markdown-style doc text, or the body of one code block.
 * @param {string} stem e.g. `pnpm exec astryx`
 * @param {string | null} [lang] the code block's language when `text` is one
 *   block's body; omit for Markdown, whose fences are followed
 * @returns {string}
 */
export function prefixCliCommands(text, stem, lang = null) {
  if (stem === CLI_BIN) return String(text);
  const blockLang = lang == null ? null : lang.toLowerCase();
  /** @type {{marker: string, lang: string} | null} */
  let fence = null;
  return String(text)
    .split('\n')
    .map(line => {
      if (blockLang != null) return prefixLine(line, stem, blockLang);
      const marker = /^\s*(`{3,}|~{3,})\s*([\w-]*)/.exec(line);
      if (marker) {
        if (fence == null) {
          fence = {marker: marker[1], lang: marker[2].toLowerCase()};
        } else if (marker[1].startsWith(fence.marker)) {
          fence = null;
        }
        return line;
      }
      return prefixLine(line, stem, fence?.lang ?? null);
    })
    .join('\n');
}

/** @type {AsyncLocalStorage<{pm: import('../doc-compiler/doc-syntax.mjs').DocPackageManager}>} */
const docPackageManagerScope = new AsyncLocalStorage();

/**
 * Run `fn` with doc `{@pm}` steps rendered for `pm`, whatever the working
 * directory's project uses: a host that shows docs to readers of every
 * package manager, such as the docsite, picks one.
 * @template T
 * @param {import('../doc-compiler/doc-syntax.mjs').DocPackageManager} pm
 * @param {() => T} fn
 * @returns {T}
 */
export function runWithDocPackageManager(pm, fn) {
  return docPackageManagerScope.run({pm}, fn);
}

/**
 * The package manager a doc's `{@pm}` steps render for, from the project in
 * `targetDir`: npm when nothing is detected, and Yarn 1 told apart from Yarn
 * 2 and newer; the one a host chose with runWithDocPackageManager wins.
 * @param {string} [targetDir]
 * @returns {import('../doc-compiler/doc-syntax.mjs').DocPackageManager}
 */
export function docPackageManager(targetDir) {
  const chosen = docPackageManagerScope.getStore()?.pm;
  if (chosen) return chosen;
  const resolution = explainPackageManager(targetDir);
  switch (resolution.pm) {
    case 'yarn':
      return isYarnClassic(resolution) ? 'yarn-classic' : 'yarn';
    case 'pnpm':
      return 'pnpm';
    case 'bun':
      return 'bun';
    default:
      return 'npm';
  }
}

/**
 * Quote one argument of a printed command so the shell it is pasted into
 * passes it on unchanged. Printed commands target a POSIX shell (sh, bash,
 * zsh), and PowerShell on Windows; cmd.exe is not a target. A value made only
 * of letters, digits and `@ / . _ -` (and, on Windows, a drive path's `:` and
 * `\`) stays bare. Any other value gets single quotes, inside which both
 * shells read `$`, backticks, `%`, `!`, spaces and double quotes literally. An
 * embedded single quote is written `'\''` for a POSIX shell and doubled for
 * PowerShell, which also ends a single-quoted string at the typographic
 * quotes `‘ ’ ‚ ‛`, so those are doubled too (`Macy’s` → `'Macy’’s'`).
 *
 * @param {string} value
 * @param {string} [platform] the `process.platform` the command is printed for
 * @returns {string}
 */
export function quoteCommandArgument(value, platform = process.platform) {
  const text = String(value);
  if (platform === 'win32') {
    if (/^[A-Za-z0-9@/._:\\-]+$/u.test(text)) return text;
    return `'${text.replace(/['\u2018\u2019\u201A\u201B]/gu, quote => quote + quote)}'`;
  }
  if (/^[A-Za-z0-9@/._-]+$/u.test(text)) return text;
  return `'${text.replace(/'/gu, `'\\''`)}'`;
}

/**
 * A printed command that changes to `dir`, then runs `command` there, so it
 * does the same work pasted from any folder. It runs `command` only when the
 * change worked. For a POSIX shell: `cd <dir> && <command>`. For PowerShell
 * on Windows: `cd -LiteralPath <dir> -ErrorAction Stop; <command>`, because
 * `-LiteralPath` reads `[` and `]` in a folder name literally, and a failed
 * change stops the line in Windows PowerShell 5.1, which has no `&&`, as in
 * PowerShell 7.
 *
 * @param {string} dir an absolute folder
 * @param {string} command the command to run there, its arguments already
 *   quoted with {@link quoteCommandArgument}
 * @param {string} [platform] the `process.platform` the command is printed for
 * @returns {string}
 */
export function commandInFolder(dir, command, platform = process.platform) {
  const folder = quoteCommandArgument(dir, platform);
  return platform === 'win32'
    ? `cd -LiteralPath ${folder} -ErrorAction Stop; ${command}`
    : `cd ${folder} && ${command}`;
}
