// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Project — the single API for reading resolved project configuration.
 *
 * `Project` is the one entry point a command uses to read everything it needs
 * about a consumer's project: the validated config surface, the configured
 * integrations, and the resolved discovery sets (components, templates,
 * codemods, docs, themes, icon sets) — plus issue routing (issuesUrl) and the accumulated
 * integration issues. It replaces the old `loadConfig(cwd)` plain-object loader
 * and the per-command fan-out into the various discovery helpers.
 *
 * Design:
 *   - `Project.load(cwd, {cache})` is the async factory (constructors can't be
 *     async). It does what loadConfig did — find the config sibling-of
 *     package.json, import + validate it, load the configured integrations —
 *     plus autolink the installed ones no config names, and self-resolve the
 *     package being authored when it carries a manifest. Provider identity is
 *     resolved once over all three (see integrations/provider-resolution), and
 *     the ledger is kept for {@link providerLedgerOf}. Discovery is LAZY.
 *   - Discovery methods (components/templates/codemods/docs/themes/iconSets) are MEMOIZED per
 *     instance (via the pluggable cache) and orchestrate the EXISTING discovery
 *     functions — Project never reimplements discovery.
 *   - SKIP + WARN policy: discovery records each integration issue. Other valid
 *     contribution kinds remain available; invalid template and component files
 *     do not hide valid siblings. A manifest load failure still withdraws the
 *     package because its roots cannot be trusted.
 *   - `issues()` returns the deduped accumulated set, and (when called
 *     directly) fills in validation for any configured integration not yet
 *     visited by a discovery call, so it is always complete on demand.
 *
 * @position lib — orchestration over config-schema / integrations /
 *   component-discovery / template / codemod discovery; commands consume it.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {findPresentFiles, loadModuleWithParser} from '../fs/module-loader.mjs';
import {parseConfig} from '../../authoring/config/parse.mjs';
import {
  loadIntegrations,
  loadLocalIntegration,
  resolveInstalledIntegrationDir,
} from '../integrations/integrations.mjs';
import {loadAutolinkCandidates} from '../integrations/autolink.mjs';
import {
  computerInstallRoots,
  loadComputerIntegrations,
  scanComputerIntegrations,
} from '../integrations/computer-integrations.mjs';
import {relativeWithin, samePath} from '../fs/path-compare.mjs';
import {isOutsideProject} from '../env/project-scope.mjs';
import {cliVersion} from '../release/run-context.mjs';
import {isGlobalCopy} from '../release/choose.mjs';
import {astryxCommandsOnSearchPath} from '../env/search-path.mjs';
import {resolveProviders} from '../integrations/provider-resolution.mjs';
import {
  setProject as setDebugProject,
  setEventHandler as setDebugEventHandler,
  setIntegrationEventHandlers as setDebugIntegrationEventHandlers,
} from '../debug/index.mjs';
import {
  CORE_PACKAGE,
  discoverOwnedComponents,
  discoverValidIntegrationComponents,
} from '../discovery/component-discovery.mjs';
import {resolveComponentReplacements} from '../discovery/component-replacement.mjs';
import {CLI_ROOT, findCoreDir, findPackageRoot, findProjectCoreDir} from '../fs/paths.mjs';
import {
  applyTemplateReplacements,
  effectiveTemplateDiscovery,
  discoverAllUnresolved as discoverTemplates,
  discoverCoreTemplates,
  discoverIntegrationTemplatesForOne,
} from '../discovery/template-adapter.mjs';
import {
  DocsCatalog,
  discoverIntegrationDocs,
} from '../discovery/docs-discovery.mjs';
import {
  discoverBundledThemes,
  discoverIntegrationThemes,
  discoverLocalThemes,
} from '../discovery/theme-discovery.mjs';
import {
  chooseProjectIconSet,
  discoverIntegrationIconSets,
  orderIconSets,
} from '../discovery/icon-set-discovery.mjs';
import {iconDefinitionTreeInput} from '../doc-compiler/tree.mjs';
import {getTransformsBetween} from '../../assets/codemods/registry.mjs';
import {
  discoverIntegrationCodemods,
  selectIntegrationCodemods,
} from '../../assets/codemods/integration-discovery.mjs';
import {validateLoadedIntegration} from '../integrations/validate-contributions.mjs';
import {recordDeclaredCliCommands} from '../env/cli-command.mjs';
import {
  hostedRun,
  recordResolvedIntegrations,
} from '../runtime/package-root.mjs';
import {
  InMemoryConfigCache,
  cacheKey,
  configContentHash,
} from './config-cache.mjs';

/**
 * Extract a human-readable message from an unknown thrown value.
 * Reproduces the historical `err?.message ?? String(err)` behavior in a
 * strict-checkJs-safe way: prefer a non-nullish `.message` (covers Error
 * instances and error-like objects thrown by integration code), else `String()`.
 * @param {unknown} err
 * @returns {string}
 */
function errorMessage(err) {
  const message =
    err && typeof err === 'object' && 'message' in err
      ? /** @type {{message: unknown}} */ (err).message
      : undefined;
  return message == null ? String(err) : String(message);
}

/**
 * The computer-level integrations (spec AST-081 FR12), read from package.json
 * files only. Outside a project, those installed beside the running CLI;
 * inside one, where the project's own CLI may be the copy that answers, those
 * installed beside the CLI installed for the computer (see globalCliRoot).
 * @param {string} [cwd]
 * @returns {import('../integrations/computer-integrations.mjs').ComputerIntegrationCandidate[]}
 */
export function computerIntegrationCandidates(cwd = process.cwd()) {
  try {
    const outside = isOutsideProject(cwd);
    const cliRoot = outside ? CLI_ROOT : globalCliRoot(cwd);
    return cliRoot
      ? scanComputerIntegrations({
          cliRoot,
          release: cliVersion(),
          // Outside a project, the integrations a host approves load from the
          // package set that serves the run too (cli-surface INV30).
          approved: outside ? (hostedRun()?.integrations ?? []) : [],
        })
      : [];
  } catch {
    return [];
  }
}

/**
 * The CLI package whose install root holds the computer-level integrations
 * for a folder inside a project: this copy when it was installed outside the
 * project (installed for the computer, or in a tool's package set), else the
 * first `astryx` on the search path that is installed for the computer. A
 * project's own CLI and a release from the per-user cache are neither.
 * @param {string} cwd
 * @returns {string | null}
 */
function globalCliRoot(cwd) {
  let folder = path.resolve(cwd);
  try {
    folder = fs.realpathSync(folder);
  } catch {
    // A folder that cannot be resolved is compared as written.
  }
  const own = computerInstallRoots(CLI_ROOT);
  if (
    own.length > 0 &&
    !own.some(
      root => samePath(root, folder) || relativeWithin(root, folder) != null,
    )
  ) {
    return CLI_ROOT;
  }
  for (const command of astryxCommandsOnSearchPath()) {
    if (command.cliRoot && isGlobalCopy(command.cliRoot)) {
      return command.cliRoot;
    }
  }
  return null;
}

/**
 * The computer-level integrations a project could add (spec AST-081 FR12):
 * those it does not install, whose peer ranges admit the release that
 * answers, and whose manifest loads.
 * @param {string} cwd
 * @param {Set<string>} installed package names the project loads or declares
 * @returns {Promise<import('../integrations/computer-integrations.mjs').ComputerIntegrationCandidate[]>}
 */
export async function availableComputerIntegrations(cwd, installed) {
  const candidates = computerIntegrationCandidates(cwd).filter(
    c => !c.incompatible && !installed.has(c.name),
  );
  if (candidates.length === 0) return [];
  const loaded = await loadComputerIntegrations(candidates);
  const usable = new Set(
    loaded.flatMap(entry =>
      entry.integration && !entry.integration.__loadError ? [entry.spec] : [],
    ),
  );
  return candidates.filter(c => usable.has(c.name));
}

/**
 * Load the configured integrations one at a time, so a package that cannot
 * load at all (not installed, no manifest, more than one manifest, not a bare
 * name) becomes that entry's load-error marker instead of failing the project.
 * @param {string[]} specs
 * @param {{cwd: string, fresh: boolean}} options
 * @returns {Promise<import('../integrations/integrations.mjs').LoadedIntegration[]>}
 */
async function loadConfiguredIntegrations(specs, {cwd, fresh}) {
  /** @type {import('../integrations/integrations.mjs').LoadedIntegration[]} */
  const loaded = [];
  const seen = new Set();
  for (const spec of specs) {
    if (!spec || seen.has(spec)) continue;
    seen.add(spec);
    try {
      loaded.push(
        ...(await loadIntegrations([spec], {
          cwd,
          fresh,
          resolveProviders: false,
        })),
      );
    } catch (err) {
      /** @type {string|undefined} */
      let packageDir;
      try {
        packageDir = resolveInstalledIntegrationDir(spec, cwd);
      } catch {
        // Not a bare package name: there is no install location to record.
      }
      const pkg = packageDir ? readPackageJson(packageDir) : null;
      loaded.push(
        loadErrorMarker({
          name: packageName(pkg) ?? spec,
          version: pkg?.version,
          spec,
          packageDir,
          err,
        }),
      );
    }
  }
  return loaded;
}

/**
 * Resolve the package being authored. Every failure, including an unreadable
 * package.json or more than one manifest, becomes its load-error marker.
 * @param {string} projectDir
 * @param {boolean} fresh
 * @returns {Promise<import('../integrations/integrations.mjs').LoadedIntegration|null>}
 */
async function loadLocalIntegrationSafely(projectDir, fresh) {
  try {
    return await loadLocalIntegration(projectDir, {fresh});
  } catch (err) {
    const pkg = readPackageJson(projectDir);
    const name = packageName(pkg) ?? '(local integration)';
    return {
      ...loadErrorMarker({
        name,
        version: pkg?.version,
        spec: name,
        packageDir: projectDir,
        err,
      }),
      __local: true,
    };
  }
}

/**
 * An inert entry for an integration that could not be loaded. It contributes
 * nothing; Project reports its `__loadError` as the package's issue.
 * @param {{name: string, version?: unknown, spec: string, packageDir?: string, err: unknown}} input
 * @returns {import('../integrations/integrations.mjs').LoadedIntegration}
 */
function loadErrorMarker({name, version, spec, packageDir, err}) {
  return /** @type {import('../integrations/integrations.mjs').LoadedIntegration} */ ({
    name,
    ...(typeof version === 'string' ? {version} : {}),
    __spec: spec,
    ...(packageDir ? {__packageDir: packageDir} : {}),
    __loadError: errorMessage(err),
  });
}

/**
 * @param {Record<string, unknown>|null} pkg
 * @returns {string|undefined}
 */
function packageName(pkg) {
  const name = pkg?.name;
  return typeof name === 'string' && name.length > 0 ? name : undefined;
}

/**
 * @param {string} dir
 * @returns {Record<string, unknown>|null}
 */
function readPackageJson(dir) {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'),
    );
    return pkg && typeof pkg === 'object' ? pkg : null;
  } catch {
    return null;
  }
}

/**
 * An integration issue tagged with the owner package. The base
 * {@link import('../integrations/issue').AstryxIntegrationIssue} fields plus the
 * `package` that produced it, which Project tracks for routing/dedup.
 * @typedef {import('../integrations/issue').AstryxIntegrationIssue & {package: string}} ProjectIntegrationIssue
 */

/** Conventional config basenames, in load-precedence order. */
export const CONFIG_BASENAMES = [
  'astryx.config.ts',
  'astryx.config.mjs',
  'astryx.config.js',
];

/** Default issue tracker used when neither config nor integration routes one. */
export const DEFAULT_ISSUES_URL =
  'https://github.com/meta/astryx/issues/new';

/**
 * Whether this project accepts `debug` handlers contributed by the
 * integrations it loads.
 *
 * On by default: installing an integration is how a project asks for that
 * package's behaviour, and a handler it contributes is behaviour. A project
 * that wants none of it says so in its package.json —
 *
 *     {"astryx": {"inheritDebug": false}}
 *
 * package.json rather than astryx.config because the answer has to survive an
 * older CLI reading the same project: an unknown config key is a hard config
 * error, while `astryx` in package.json is inert to every version that does not
 * look for it. Only `false` opts out; anything else, including a missing file,
 * leaves inheritance on.
 *
 * This governs INHERITED handlers only. A project's own `debug` always runs.
 *
 * Read from the project root whether or not an astryx.config exists: an
 * autolinked integration contributes a handler with no config at all.
 *
 * @param {string} projectDir directory holding the project's package.json
 * @returns {boolean}
 */
function inheritsIntegrationDebug(projectDir) {
  try {
    const pkgPath = path.join(projectDir, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return pkg?.astryx?.inheritDebug !== false;
  } catch {
    // No package.json, or unreadable/malformed — not an opt-out.
    return true;
  }
}

/**
 * Find astryx.config.{ts,mjs,js} as a sibling of the nearest package.json.
 * Returns the absolute path, or null if none is present. Throws if multiple
 * config files exist at that root.
 * @param {string} [startDir]
 * @returns {string|null}
 */
export function findConfigPath(startDir = process.cwd()) {
  const root = findPackageRoot(startDir) ?? startDir;
  const present = findPresentFiles(root, CONFIG_BASENAMES);
  if (present.length > 1) {
    throw new Error(
      `Multiple Astryx config files found in ${root} (${present
        .map(p => path.basename(p))
        .join(', ')}). Keep exactly one.`,
    );
  }
  return present.length === 1 ? present[0] : null;
}

/**
 * The provider ledger each loaded Project resolved, kept off the class so it
 * is not part of the Project API.
 * @type {WeakMap<Project, import('../integrations/provider-resolution.mjs').ProviderLedger>}
 */
const PROVIDER_LEDGERS = new WeakMap();

/**
 * The provider ledger a Project resolved at load: one outcome for every
 * package directory configured, autolinked, or authored. Internal: upgrade
 * resolves on top of it, and tests account for every candidate with it.
 * @param {Project} project
 * @returns {import('../integrations/provider-resolution.mjs').ProviderLedger}
 */
export function providerLedgerOf(project) {
  return PROVIDER_LEDGERS.get(project) ?? new Map();
}

/**
 * The single API for reading resolved project configuration. Construct via the
 * async {@link Project.load} factory.
 */
export class Project {
  /** @type {string} */
  #cwd;
  /** @type {string|null} */
  #configPath;
  /** @type {import('../../authoring/config/type').AstryxConfig} */
  #config;
  /** @type {string[]} */
  #integrations;
  /** @type {import('../integrations/integrations.mjs').LoadedIntegration[]} */
  #loadedIntegrations;
  /** @type {import('./config-cache.mjs').ConfigCache} */
  #cache;
  /** @type {string} */
  #hash;
  /**
   * Which Core the project reads: `any`, its installed Core else the Core the
   * answering release carries, or `project`, its installed Core only.
   * @type {'any' | 'project'}
   */
  #core = 'any';
  /** @type {ProjectIntegrationIssue[]} */
  #issues = [];
  /**
   * Loaded integrations whose issues have already been collected (via a
   * discovery method or a direct issues() validation), so issues() can fill in
   * only the ones not yet visited and never double-collect. Keyed by entry, not
   * label: two entries can share a package name (an alias at another version).
   * @type {Set<object>}
   */
  #visitedIssues = new Set();
  /** @type {Promise<Array<object>> | null} */
  #templatesPromise = null;

  /**
   * @param {object} init
   * @param {string} init.cwd
   * @param {string|null} init.configPath
   * @param {import('../../authoring/config/type').AstryxConfig} init.config validated AstryxConfig surface
   * @param {string[]} init.integrations
   * @param {import('../integrations/integrations.mjs').LoadedIntegration[]} init.loadedIntegrations
   * @param {import('./config-cache.mjs').ConfigCache} init.cache
   * @param {string} init.hash config content hash
   * @param {'any' | 'project'} [init.core] which Core it reads
   */
  constructor({
    cwd,
    configPath,
    config,
    integrations,
    loadedIntegrations,
    cache,
    hash,
    core = 'any',
  }) {
    this.#core = core;
    this.#cwd = cwd;
    this.#configPath = configPath;
    this.#config = config;
    this.#integrations = integrations;
    this.#loadedIntegrations = loadedIntegrations;
    this.#cache = cache;
    this.#hash = hash;
  }

  /**
   * Async factory. Finds + validates the config (the same work loadConfig did)
   * and loads the configured integrations. Discovery is NOT run here — it is
   * lazy and memoized on the returned instance.
   *
   * `core: 'project'` reads only the project's installed Core, never the Core
   * the answering release carries: the commands that judge or change a
   * project (`doctor`, `swizzle`, `upgrade`) load it so (spec AST-081 FR3).
   *
   * @param {string} [cwd]
   * @param {{cache?: import('./config-cache.mjs').ConfigCache, fresh?: boolean, core?: 'any' | 'project'}} [options]
   * @returns {Promise<Project>}
   */
  static async load(cwd = process.cwd(), {cache, fresh = false, core = 'any'} = {}) {
    const resolvedCache = fresh
      ? new InMemoryConfigCache()
      : (cache ?? new InMemoryConfigCache());
    const configPath = findConfigPath(cwd);
    const hash = configContentHash(configPath);
    // The project root: the config's directory when there is one (findConfigPath
    // resolves the config as a sibling of the nearest package.json, so the two
    // agree), otherwise that package.json's directory. Dependencies are declared
    // there, and installed packages resolve from there up the node_modules
    // chain.
    const projectDir = configPath
      ? path.dirname(configPath)
      : (findPackageRoot(cwd) ?? cwd);

    /** @type {import('../../authoring/config/type').AstryxConfig} */
    let config = {integrations: []};
    /** @type {string[]} */
    let integrations = [];
    /** @type {import('../integrations/integrations.mjs').LoadedIntegration[]} */
    let loadedIntegrations = [];

    if (configPath) {
      config = await loadModuleWithParser(configPath, parseConfig, {
        label: 'astryx.config',
        fresh,
      });
      integrations = config.integrations ?? [];
      // Provider identity is resolved once, below, over the final set.
      loadedIntegrations = await loadConfiguredIntegrations(integrations, {
        cwd: projectDir,
        fresh,
      });
    }

    // An installed integration the config does not name is still installed.
    // This runs whether or not a config exists, because the projects it reaches
    // are overwhelmingly the ones with no astryx.config at all: a scaffold adds
    // the dependency and writes no config, and the integration then contributes
    // nothing for want of a line nobody knew to write. Resolved AFTER the
    // configured ones so an explicit entry keeps its position and its
    // precedence in every discovery order.
    const autolinked = await loadAutolinkCandidates({
      projectDir,
      loaded: loadedIntegrations,
      fresh,
    });

    // The package being authored is the one package that cannot install itself.
    // When it carries a manifest, resolve its working bytes directly so every
    // existing consumer command doubles as the author's preview. A local copy
    // replaces the same installed package in place, preserving configured
    // precedence while making the source being edited authoritative.
    const localIntegration = await loadLocalIntegrationSafely(
      projectDir,
      fresh,
    );

    // Outside a project, the integrations installed beside the running CLI
    // load too (spec AST-081 FR12); a package the folder already loads keeps
    // its own copy. Inside a project they never load.
    const computer = isOutsideProject(cwd)
      ? await loadComputerIntegrations(computerIntegrationCandidates(cwd), {
          fresh,
          exclude: [
            ...loadedIntegrations.map(integration => integration.name),
            ...autolinked.flatMap(candidate =>
              candidate.integration ? [candidate.integration.name] : [],
            ),
            ...(localIntegration ? [localIntegration.name] : []),
          ],
        })
      : [];

    // Autolinked and local packages can claim a provider ID that a configured
    // package already holds, so identity is resolved once over the final set.
    const resolution = resolveProviders([
      ...loadedIntegrations.map(integration => ({
        source: /** @type {const} */ ('configured'),
        integration,
        spec: integration.__spec,
      })),
      ...autolinked,
      ...computer,
      ...(localIntegration
        ? [
            {
              source: /** @type {const} */ ('local'),
              integration: localIntegration,
              spec: localIntegration.__spec,
            },
          ]
        : []),
    ]);
    loadedIntegrations = resolution.integrations;
    // A hosted run returns each package it resolved (cli-surface INV30).
    recordResolvedIntegrations(loadedIntegrations);
    // The picker (getCliInvocation) is synchronous, so the commands these
    // integrations declare are recorded here, where they become known.
    recordDeclaredCliCommands(projectDir, loadedIntegrations);

    // The debug recorder resolves its settings synchronously, long before any
    // command gets here, so this is where a project's `debug` block gets a
    // turn. The event is not written until process exit, so settings applied
    // now still shape the record for this same invocation.
    try {
      // The `debug` function is the destination for recorded runs. The
      // recorder collects provisionally until now precisely because the config
      // could not be read any earlier; it only needs the handler by exit.
      setDebugEventHandler(config.debug);
      // Integrations may contribute a handler too, as a `debug` NAMED export
      // from their manifest module. Both destinations receive the event: an
      // app that sets `debug` to watch its own runs must not thereby drop out
      // of an integration's debug logs, and an integration must not silence the
      // app. Passed as one ordered list rather than appended one at a time,
      // because Project.load can run more than once in a process and appending
      // would deliver twice.
      setDebugIntegrationEventHandlers(
        inheritsIntegrationDebug(projectDir)
          ? loadedIntegrations.map(integration => integration.__debug)
          : [],
      );
      setDebugProject({
        hasConfig: Boolean(configPath),
        integrationCount: integrations.length,
      });
    } catch {
      // Never let recording break config loading.
    }

    const project = new Project({
      cwd,
      configPath,
      config,
      integrations,
      loadedIntegrations,
      cache: resolvedCache,
      hash,
      core,
    });
    PROVIDER_LEDGERS.set(project, resolution.ledger);
    return project;
  }

  /**
   * The validated config surface (same data loadConfig returned, minus the
   * resolved `loadedIntegrations` which is exposed separately).
   * @returns {import('../../authoring/config/type').AstryxConfig}
   */
  get config() {
    return this.#config;
  }

  /**
   * Integration package names the config names. NOT the full set that is
   * loaded — an autolinked integration is absent here by definition. For
   * everything in play, read {@link Project.loadedIntegrations}.
   * @returns {string[]}
   */
  get integrations() {
    return this.#integrations;
  }

  /**
   * Every resolved integration (lib/integrations.mjs shape): configured first,
   * then autolinked (`__autolinked`), with the local authoring package
   * (`__local`) replacing the same installed package or appended last.
   * @returns {import('../integrations/integrations.mjs').LoadedIntegration[]}
   */
  get loadedIntegrations() {
    return this.#loadedIntegrations;
  }

  /** @returns {string} */
  get cwd() {
    return this.#cwd;
  }

  /**
   * Absolute path to the resolved config file, or null when the project has
   * no config (defaults-only).
   * @returns {string|null}
   */
  get configPath() {
    return this.#configPath;
  }

  /**
   * Memoize an async producer behind the pluggable cache, keyed by the config
   * content hash + cwd + discovery kind. A sentinel wrapper distinguishes a
   * cached `undefined`/falsy value from a cache miss.
   * @template T
   * @param {string} kind
   * @param {() => Promise<T>} produce
   * @returns {Promise<T>}
   */
  async #memo(kind, produce) {
    const key = cacheKey(this.#hash, this.#cwd, kind);
    const hit = /** @type {{value: T} | undefined} */ (this.#cache.get(key));
    if (hit !== undefined) return hit.value;
    const value = await produce();
    this.#cache.set(key, {value});
    return value;
  }

  /**
   * Record a single integration issue, deduped by (package, code, message).
   * @param {string} pkg
   * @param {import('../integrations/issue').AstryxIntegrationIssue} issue
   */
  #pushIssue(pkg, issue) {
    const code = issue?.code ?? 'unknown';
    const message = issue?.message ?? '';
    const exists = this.#issues.some(
      e => e.package === pkg && e.code === code && e.message === message,
    );
    if (exists) return;
    this.#issues.push({
      package: pkg,
      code,
      severity: issue?.severity ?? 'error',
      message,
    });
  }

  /** Package label for a loaded integration.
   * @param {import('../integrations/integrations.mjs').LoadedIntegration} integration
   * @returns {string}
   */
  #pkgLabel(integration) {
    // A set-aside package is labelled name@version, so its issue never reads as
    // the winner's, even when both share a package name.
    if (integration?.__providerConflict) {
      return integration.version
        ? `${integration.name}@${integration.version}`
        : (integration.__spec ?? integration.name);
    }
    return integration?.name ?? integration?.__spec ?? '(integration)';
  }

  /**
   * Validate one loaded integration and collect any issues. Marks the
   * integration visited so issues() won't redo the work. Best-effort: a
   * validator throwing is itself recorded as an issue, never propagated.
   * @param {import('../integrations/integrations.mjs').LoadedIntegration} integration
   */
  async #collectIssues(integration) {
    const pkg = this.#pkgLabel(integration);
    if (this.#visitedIssues.has(integration)) return;
    this.#visitedIssues.add(integration);
    // A manifest that failed to load (throwing import / invalid shape) is
    // recorded as a marker by loadIntegrations — surface it as an issue and
    // skip validation (there's no manifest to validate).
    if (integration?.__loadError) {
      this.#pushIssue(pkg, {
        code: 'integration_error',
        severity: 'error',
        message: integration.__loadError,
      });
      return;
    }
    try {
      // An experimental root is checked only in a project that opts in
      // (spec:AST-017 FR27); the package's own checks read it either way.
      const found = await validateLoadedIntegration(
        this.#config.experimental?.iconSet
          ? integration
          : {...integration, iconSets: undefined},
      );
      for (const issue of found ?? []) this.#pushIssue(pkg, issue);
    } catch (err) {
      this.#pushIssue(pkg, {
        code: 'integration_error',
        severity: 'error',
        message: errorMessage(err),
      });
    }
  }

  /**
   * The Core this project reads: its installed Core, else, unless it was
   * loaded with `core: 'project'`, the Core the answering release carries
   * (spec AST-081 FR3). Null when there is none.
   * @returns {string | null}
   */
  coreDir() {
    return this.#core === 'project'
      ? findProjectCoreDir(this.#cwd)
      : findCoreDir(this.#cwd);
  }

  /**
   * Core + integration component ownership records. Wraps
   * discoverOwnedComponents for core and discoverIntegrationComponents (via
   * discoverOwnedComponents) for integrations. Invalid component records are
   * omitted and reported; valid component siblings and other contribution kinds
   * remain available. Memoized per instance.
   *
   * @returns {Promise<Array<{name: string, package: string, group: string|null, docPath: string|null, sourcePath: string|null, issuesUrl: string|undefined}>>}
   */
  async components() {
    return this.#memo('components', async () => {
      const coreDir = this.coreDir();
      /** @type {Array<{name: string, package: string, group: string|null, docPath: string|null, sourcePath: string|null, issuesUrl: string|undefined}>} */
      const records = [];

      // Core records (no integrations) — never integration-broken.
      if (coreDir) {
        try {
          records.push(...discoverOwnedComponents(coreDir, []));
        } catch {
          // Core discovery failure is not an integration issue; surface
          // nothing here (core problems show up via doctor/other paths).
        }
      }

      // Each integration is discovered independently. Invalid records are
      // omitted below without hiding valid siblings or other contribution kinds.
      for (const integration of this.#loadedIntegrations) {
        await this.#collectIssues(integration);
        const pkg = this.#pkgLabel(integration);
        try {
          // #collectIssues (above) already reported each withdrawn record,
          // with its fix, through the same discovery.
          const {components} =
            await discoverValidIntegrationComponents(integration);
          records.push(...components);
        } catch (err) {
          this.#pushIssue(pkg, {
            code: 'invalid_component',
            severity: 'error',
            message: errorMessage(err),
          });
        }
      }

      return records;
    });
  }

  /**
   * Integration component replacements (spec:AST-035 FR10–FR15): the active
   * replacement for each replaced Core component. A finding about a package
   * that declares the CLI floor joins the project's integration issues under
   * that package. A package without the floor adds nothing to an app's
   * output (FR15); its author sees the findings in `doctor integration
   * components`. Memoized per instance.
   *
   * @returns {Promise<import('../discovery/component-replacement.mjs').ComponentReplacements>}
   */
  async componentReplacements() {
    return this.#memo('componentReplacements', async () => {
      const replacements = await resolveComponentReplacements(
        this.coreDir(),
        this.#loadedIntegrations,
      );
      for (const finding of replacements.findings) {
        if (!finding.optedIn) continue;
        this.#pushIssue(finding.package, {
          code: finding.code,
          severity: finding.severity,
          message: finding.message,
        });
      }
      return replacements;
    });
  }

  /**
   * Core + integration templates, type-tagged, with valid integration
   * replacements projected over their Core targets. Wraps raw template discovery
   * (Core + external blocks) and discoverIntegrationTemplatesForOne per integration
   * so unusable template files are reported and omitted while valid siblings
   * remain available. Memoized per instance.
   *
   * @returns {Promise<Array<object>>}
   */
  async templates() {
    if (this.#templatesPromise) return this.#templatesPromise;
    this.#templatesPromise = (async () => {
      /** @type {any[]} */
      const templates = [];
      /** @type {import('../discovery/template-adapter.mjs').TemplateDiscoveryError[]} */
      const replacementErrors = [];

      // Core + external-package templates (discoverTemplates internally also
      // loads integration templates via loadConfig today; we intentionally
      // re-collect integration templates below through the per-integration
      // path so the skip+warn policy and issue collection apply, then dedupe).
      try {
        const core = await discoverTemplates(this.#cwd);
        for (const t of /** @type {any[]} */ (core)) {
          // Skip integration-owned templates here; they are re-added (and
          // issue-collected) per integration below to honor skip+warn.
          if (t.package && t.package !== CORE_PACKAGE) continue;
          templates.push(t);
        }
      } catch {
        // Core/template discovery failure contributes no templates.
      }

      for (const integration of this.#loadedIntegrations) {
        await this.#collectIssues(integration);
        const pkg = this.#pkgLabel(integration);
        // Template discovery already isolates invalid template files and returns
        // every valid sibling. Do not withdraw templates because another
        // contribution kind in this package is broken.
        try {
          const {templates: ts, errors} =
            await discoverIntegrationTemplatesForOne(integration);
          for (const e of errors) {
            this.#pushIssue(pkg, {
              code: e.code ?? 'invalid_template',
              severity: e.severity ?? 'error',
              message: e.message,
            });
            if (e.replacementTarget != null) replacementErrors.push(e);
          }
          // Discovery already omits each unusable template from `ts`. Keep all
          // valid siblings, while the collected errors remain visible through
          // issues() and replacement errors disable only their own targets.
          templates.push(...ts);
        } catch (err) {
          this.#pushIssue(pkg, {
            code: 'invalid_template',
            severity: 'error',
            message: errorMessage(err),
          });
        }
      }

      const resolved = applyTemplateReplacements(templates, replacementErrors);
      for (const error of resolved.errors) {
        this.#pushIssue(error.package, {
          code: error.code,
          severity: error.severity,
          message: error.message,
        });
      }
      return effectiveTemplateDiscovery(resolved.templates);
    })();
    return this.#templatesPromise;
  }

  /**
   * Bundled source themes, themes contributed by installed integrations, and
   * source themes under this app's conventional local authoring root. Each
   * record keeps its owner and source directory so app imports and explicit
   * ejects share one discovery seam. A broken integration theme contribution is
   * reported without hiding the package's other valid kinds.
   *
   * @param {{includeLocal?: boolean}} [options]
   * @returns {Promise<import('../discovery/theme-discovery.mjs').DiscoveredTheme[]>}
   */
  async themes({includeLocal = true} = {}) {
    return this.#memo(includeLocal ? 'themes' : 'themes:external', async () => {
      const themes = discoverBundledThemes();
      const projectDir = findPackageRoot(this.#cwd) ?? this.#cwd;
      if (includeLocal) themes.push(...discoverLocalThemes(projectDir));

      for (const integration of this.#loadedIntegrations) {
        await this.#collectIssues(integration);
        const pkg = this.#pkgLabel(integration);
        if (!integration?.themes) continue;
        try {
          themes.push(...(await discoverIntegrationThemes(integration)));
        } catch (err) {
          this.#pushIssue(pkg, {
            code: 'invalid_theme',
            severity: 'error',
            message: errorMessage(err),
          });
        }
      }

      return themes;
    });
  }

  /**
   * Installed icon sets, the sets withdrawn and why, and the project's icon
   * set (AST-084 FR7, FR8). Sets come from each loaded integration's
   * `iconSets` root in load order; `sets` puts the project's set first, the
   * tie order every icon surface uses. A set whose descriptor or data file is
   * invalid is withdrawn and reported as an `invalid_icon_set` issue; a set
   * whose module does not resolve from the project is withdrawn without one.
   *
   * Icon sets are experimental (spec:AST-017 FR27): every surface but
   * `astryx experimental icon` reads them only in a project that sets
   * `experimental.iconSet`. Without it this answers no sets and records no
   * issue, unless `experimental` asks for the installed sets anyway.
   *
   * @param {{experimental?: boolean}} [options] `experimental`: read the
   *   installed sets without the opt-in, for `astryx experimental icon`
   * @returns {Promise<{sets: import('../discovery/icon-set-discovery.mjs').DiscoveredIconSet[], withdrawn: import('../discovery/icon-set-discovery.mjs').WithdrawnIconSet[], choice: import('../discovery/icon-set-discovery.mjs').IconSetChoice}>}
   */
  async iconSets({experimental = false} = {}) {
    if (!experimental && !this.#config.experimental?.iconSet) {
      return {
        sets: [],
        withdrawn: [],
        choice: {
          status: /** @type {const} */ ('none'),
          reason: 'astryx.config sets no experimental.iconSet.',
        },
      };
    }
    return this.#memo('iconSets', async () => {
      const projectDir = findPackageRoot(this.#cwd) ?? this.#cwd;
      /** @type {import('../discovery/icon-set-discovery.mjs').DiscoveredIconSet[]} */
      const sets = [];
      /** @type {import('../discovery/icon-set-discovery.mjs').WithdrawnIconSet[]} */
      const withdrawn = [];
      for (const integration of this.#loadedIntegrations) {
        if (!integration?.iconSets || integration.__loadError) continue;
        if (integration.__providerConflict) continue;
        await this.#collectIssues(integration);
        const pkg = this.#pkgLabel(integration);
        try {
          const found = discoverIntegrationIconSets(integration, {projectDir});
          sets.push(...found.sets);
          for (const each of found.withdrawn) {
            withdrawn.push(each);
            if (each.kind === 'invalid') {
              this.#pushIssue(pkg, {
                code: 'invalid_icon_set',
                severity: 'error',
                message: each.reason,
              });
            }
          }
        } catch (err) {
          this.#pushIssue(pkg, {
            code: 'invalid_icon_set',
            severity: 'error',
            message: errorMessage(err),
          });
        }
      }
      const choice = chooseProjectIconSet(
        sets,
        this.#config.experimental?.iconSet,
        withdrawn,
      );
      return {sets: orderIconSets(sets, choice), withdrawn, choice};
    });
  }

  /**
   * The components and templates this project reads, as links name them: by
   * owner provider id, kind, and name (a template by its id).
   * @returns {Promise<import('../discovery/docs-discovery.mjs').LinkableContributions>}
   */
  async #linkableContributions() {
    /** @type {Map<string, string>} */
    const providers = new Map([[CORE_PACKAGE, CORE_PACKAGE]]);
    for (const integration of this.#loadedIntegrations) {
      if (integration?.name) {
        providers.set(
          integration.name,
          integration.providerId ?? integration.name,
        );
      }
    }
    const providerOf = (/** @type {string | undefined} */ pkg) =>
      providers.get(pkg ?? CORE_PACKAGE) ?? pkg ?? CORE_PACKAGE;
    // An active replacement answers to the Core name it replaces, so a link
    // to that Core component has to select Core (spec:AST-035 FR11).
    /** @type {Map<string, string>} */
    const replacing = new Map();
    if (this.#loadedIntegrations.length > 0) {
      const {active} = await resolveComponentReplacements(
        this.coreDir(),
        this.#loadedIntegrations,
      );
      for (const each of active) {
        replacing.set(`${each.package}\0${each.name}`, each.target);
      }
    }
    const components = (await this.components()).map(record => {
      const replaces = replacing.get(`${record.package}\0${record.name}`);
      return {
        providerId: providerOf(record.package),
        package: record.package,
        name: record.name,
        docPath: record.docPath,
        ...(replaces == null ? {} : {replaces}),
      };
    });
    /** @param {any} template @param {string} pkg */
    const linkable = (template, pkg) => ({
      providerId: providerOf(pkg),
      package: pkg,
      type: template.type,
      id: template.dirName,
      name: template.name,
      ...(template.displayName == null
        ? {}
        : {displayName: template.displayName}),
      ...(template.description == null
        ? {}
        : {description: template.description}),
      ...(typeof template.replaces === 'string'
        ? {replaces: template.replaces}
        : {}),
    });
    /** @param {any} template */
    const isPageOrBlock = template =>
      template.type === 'page' || template.type === 'block';
    // Every Core template, a replaced one too, since `--package
    // @astryxdesign/core` still opens it; everyone else's as unqualified
    // lookups see them, an active replacement with the id it takes over.
    const templates = [
      ...(await discoverCoreTemplates())
        .filter(isPageOrBlock)
        .map(template => linkable(template, CORE_PACKAGE)),
      .../** @type {any[]} */ (await this.templates())
        .filter(
          template =>
            isPageOrBlock(template) &&
            (template.package ?? CORE_PACKAGE) !== CORE_PACKAGE,
        )
        .map(template => linkable(template, template.package)),
    ];
    return {components, templates};
  }

  /**
   * The CLI's own doc topics plus the ones the configured integrations
   * contribute, resolved into one catalog: additions, replacements (with the
   * replaced name left as an alias), and extensions merged in configuration
   * order. Same skip+warn policy as its siblings — a broken integration
   * contributes no topics and its issues are collected. Memoized per instance.
   *
   * Two problems can only be seen with every integration in hand, so they are
   * raised here rather than in the per-integration validators: a topic that
   * collides with one another package already provides, and a `replaces` /
   * `extends` that names a topic nothing provides.
   *
   * @returns {Promise<DocsCatalog>}
   */
  async docs() {
    return this.#memo('docs', async () => {
      const catalog = DocsCatalog.fromBuiltins();
      // Links name component, page, and block docs too (spec:AST-047 FR9).
      catalog.setContributions(() => this.#linkableContributions());
      let rank = 0;

      for (const integration of this.#loadedIntegrations) {
        rank += 1;
        await this.#collectIssues(integration);
        const pkg = this.#pkgLabel(integration);
        if (!integration?.docs) continue;
        try {
          const {records, errors, namespaces, guides} =
            await discoverIntegrationDocs(integration);
          for (const e of errors) {
            this.#pushIssue(pkg, {
              code: 'invalid_doc',
              severity: 'error',
              message: e.message,
            });
          }
          // Any unusable doc withdraws the whole package's topics, matching
          // how a bad template withdraws its package's templates: a partial
          // docs contribution is the state where a `replaces` silently does
          // nothing and a reader gets the topic it was meant to replace.
          if (errors.length > 0) {
            for (const e of errors) {
              catalog.addIssue({
                package: integration.name ?? pkg,
                message: e.message,
              });
            }
            continue;
          }
          for (const record of records) {
            const issue = catalog.add(record);
            if (issue) this.#pushIssue(pkg, issue);
          }
          catalog.addTreeInputs({
            namespaces: namespaces.map(input => ({...input, rank})),
            guides: guides.map(input => ({...input, rank})),
          });
        } catch (err) {
          this.#pushIssue(pkg, {
            code: 'invalid_doc',
            severity: 'error',
            message: errorMessage(err),
          });
        }
      }

      // With the opt-in (`iconSets()` reads no set without it), each installed
      // icon set's own icon definitions join Astryx's under the
      // `icon-definitions` namespace, marked with their package.
      const {sets} = await this.iconSets();
      for (const set of sets) {
        if (set.definitions.length === 0) continue;
        const at = this.#loadedIntegrations.findIndex(
          each => each?.name === set.package,
        );
        const integration = this.#loadedIntegrations[at];
        const providerId = integration?.providerId ?? set.package;
        catalog.addTreeInputs({
          namespaces: [],
          guides: set.definitions.map(({doc, file}) => ({
            ...iconDefinitionTreeInput(doc, file, set.package, providerId),
            summary: `${doc.description} (from ${set.package}, icon set "${set.name}")`,
            rank: at + 1,
          })),
        });
      }

      return catalog;
    });
  }

  /**
   * Core registry transforms + integration codemods for an upgrade range.
   * Wraps getTransformsBetween (core) and discoverIntegrationCodemods /
   * selectIntegrationCodemods (integrations). An invalid codemod contribution
   * is reported and omitted without hiding other valid contribution kinds.
   * Memoized per (from, to) key.
   *
   * @param {string} fromVersion exclusive lower bound
   * @param {string} toVersion inclusive upper bound
   * @returns {Promise<{core: Array<{version: string, transforms: Array<object>}>, integration: Array<{version: string, codemods: Array<object>}>}>}
   */
  async codemods(fromVersion, toVersion) {
    return this.#memo(`codemods:${fromVersion}..${toVersion}`, async () => {
      const core = await getTransformsBetween(fromVersion, toVersion);

      // Discover integration codemods per integration so a single broken
      // integration is skipped (issue collected) without losing the others.
      /** @type {import('../integrations/integrations.mjs').LoadedIntegration[]} */
      const good = [];
      for (const integration of this.#loadedIntegrations) {
        await this.#collectIssues(integration);
        const pkg = this.#pkgLabel(integration);
        if (!integration?.codemods) continue;
        try {
          // Validate this integration's codemods discover cleanly in
          // isolation; if so it is safe to include.
          await discoverIntegrationCodemods([integration]);
          good.push(integration);
        } catch (err) {
          this.#pushIssue(pkg, {
            code: 'invalid_codemod',
            severity: 'error',
            message: errorMessage(err),
          });
        }
      }

      const byVersion = await discoverIntegrationCodemods(good);
      const integration = selectIntegrationCodemods(
        byVersion,
        fromVersion,
        toVersion,
      );

      return {core, integration};
    });
  }

  /**
   * Route an issues URL for a component/source reference.
   *
   * - `package === CORE_PACKAGE` or omitted => this.config.issuesUrl or the
   *   default core issues URL.
   * - an integration package => that loaded integration's manifest issuesUrl
   *   (which may be undefined when the integration ships none).
   *
   * @param {{package?: string}} [ref]
   * @returns {string|undefined}
   */
  issuesUrl(ref = {}) {
    const pkg = ref?.package;
    if (!pkg || pkg === CORE_PACKAGE) {
      return this.#config.issuesUrl ?? DEFAULT_ISSUES_URL;
    }
    const integration = this.#loadedIntegrations.find(i => i.name === pkg);
    return integration?.issuesUrl;
  }

  /**
   * The accumulated integration issues (deduped by package, code, message).
   * When called directly, also validates any configured integration not yet
   * visited by a discovery call, so the returned set is complete on demand.
   *
   * @returns {Promise<ProjectIntegrationIssue[]>}
   */
  async issues() {
    // Template replacement validity depends on the combined Core + integration
    // catalog. Resolve it first so issue results never depend on which discovery
    // method the caller happened to invoke earlier.
    await this.templates();
    // Component replacement validity likewise depends on Core plus every
    // integration's components.
    await this.componentReplacements();
    for (const integration of this.#loadedIntegrations) {
      await this.#collectIssues(integration);
    }
    // Return a stable copy so callers can't mutate internal state.
    return this.#issues.map(i => ({...i}));
  }
}
