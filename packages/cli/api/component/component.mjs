// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Programmatic API for the component command — DISPATCHER + BARREL.
 *
 * Returns the same typed envelope { type, data } that `astryx --json component`
 * outputs. `component(name, opts)` parses one selector or an ordered selector
 * list, resolves each subject through `_adapter`, and routes to the correct leaf
 * (list · detail · detail.props/source/showcase/blocks). The CLI command handler
 * is a thin wrapper around this function.
 *
 * Every leaf is also re-exported for direct scripting use.
 */

import {
  docPackageManager,
  runWithDocPackageManager,
} from '../../foundation/env/package-manager.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {AstryxError} from '../error.mjs';
import {
  CORE_PACKAGE,
  requireCoreDir,
  loadIntegrationsSafely,
  resolveOwners,
  scopeIntegrationMember,
  classifyScope,
  assertUnambiguousOwners,
  resolveLegacyExternalDoc,
  legacyExternalKeeps,
  resolveCoreSourcePath,
  resolveUnscopedDoc,
  loadComponentDoc,
  scopeSubComponent,
  ComponentAmbiguityError,
  installedComponentPackageVersion,
  resolveComponentReplacement,
  unscopedComponentOwners,
  linkComponentResponse,
} from './_adapter.mjs';
import {componentList} from './list/list.mjs';
import {componentDetail} from './detail/detail.mjs';
import {componentDetailProps} from './detail/props/props.mjs';
import {componentDetailSource} from './detail/source/source.mjs';
import {componentDetailShowcase} from './detail/showcase/showcase.mjs';
import {componentDetailBlocks} from './detail/blocks/blocks.mjs';

/** Maximum selectors accepted before any component resolution starts. */
export const COMPONENT_BATCH_SELECTOR_LIMIT = 100;

/** @type {ReadonlyArray<string>} */
const DETAIL_LEVELS = ['full', 'compact', 'brief'];
/** @type {ReadonlyArray<string>} */
const LANGS = ['en', 'zh', 'dense'];
/** @type {Set<string>} */
const NOT_FOUND_CODES = new Set([
  ERROR_CODES.ERR_UNKNOWN_COMPONENT,
  ERROR_CODES.ERR_UNKNOWN_PACKAGE,
  ERROR_CODES.ERR_NOT_FOUND,
]);

/**
 * Discover-compatible package target grammar. Versions belong to the package
 * head, never the item after the package slash.
 * @param {string} selector
 * @returns {{scoped: boolean, name: string, version?: string, item?: string}}
 */
function splitSelector(selector) {
  const scoped = selector.startsWith('@');
  const firstSlash = selector.indexOf('/');
  let head = selector;
  /** @type {string | undefined} */
  let rest;
  const split = scoped
    ? firstSlash < 0
      ? -1
      : selector.indexOf('/', firstSlash + 1)
    : firstSlash;
  if (split > 0) {
    head = selector.slice(0, split);
    rest = selector.slice(split + 1) || undefined;
  }
  const at = head.indexOf('@', 1);
  return {
    scoped,
    name: at > 0 ? head.slice(0, at) : head,
    ...(at > 0 && head.slice(at + 1) ? {version: head.slice(at + 1)} : {}),
    ...(rest ? {item: rest} : {}),
  };
}

/**
 * Resolve one component selector into the existing single-component API inputs.
 * @param {unknown} value
 * @param {string|undefined} packageScope
 * @returns {{selector: string, name: string, package?: string, version?: string}}
 */
function parseComponentSelector(value, packageScope) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new AstryxError(
      `Invalid component selector "${String(value)}"`,
      undefined,
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }
  const target = splitSelector(value);
  const packageShaped =
    target.scoped || target.item != null || target.version != null;
  if (!packageShaped) {
    return {selector: value, name: target.name, package: packageScope};
  }
  if (!target.item) {
    throw new AstryxError(
      `Component selector "${value}" names a package but no component`,
      undefined,
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }
  if (packageScope && packageScope !== target.name) {
    throw new AstryxError(
      `Component selector "${value}" conflicts with --package "${packageScope}"`,
      undefined,
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }
  return {
    selector: value,
    name: target.item,
    package: target.name,
    ...(target.version ? {version: target.version} : {}),
  };
}

/**
 * A version-qualified selector never falls through to another installed
 * version. Its structured suggestion points at the command that can discover
 * the requested package release.
 * @param {{package?: string, version?: string}} target
 * @param {string} coreDir
 * @param {import('../../foundation/integrations/integrations.mjs').LoadedIntegration[]} loadedIntegrations
 * @returns {void}
 */
function requireInstalledSelectorVersion(target, coreDir, loadedIntegrations) {
  if (!target.version) return;
  const packageName = /** @type {string} */ (target.package);
  const installed = installedComponentPackageVersion(
    coreDir,
    loadedIntegrations,
    packageName,
  );
  if (installed === target.version) return;
  const exact = `${packageName}@${target.version}`;
  throw new AstryxError(
    `Package "${exact}" is not installed`,
    [
      {
        name: `astryx discover ${exact}`,
        reason: 'look up this package version',
      },
    ],
    ERROR_CODES.ERR_UNKNOWN_PACKAGE,
  );
}

/**
 * Turn a single-lookup failure into one complete batch row.
 * @param {string} selector
 * @param {unknown} error
 * @returns {import('./component.type.mjs').ComponentBatchResult}
 */
function batchFailure(selector, error) {
  const err =
    error instanceof AstryxError
      ? error
      : new AstryxError(
          error instanceof Error ? error.message : String(error),
          undefined,
          ERROR_CODES.ERR_UNKNOWN,
        );
  if (err instanceof ComponentAmbiguityError) {
    return {
      selector,
      status: 'ambiguous',
      code: err.code,
      error: err.message,
      candidates: err.candidates,
    };
  }
  return {
    selector,
    status: NOT_FOUND_CODES.has(err.code) ? 'not_found' : 'error',
    code: err.code,
    error: err.message,
    ...(err.suggestions ? {suggestions: err.suggestions} : {}),
  };
}

/**
 * @param {unknown[]} selectors
 * @param {object} options
 * @param {string} options.cwd
 * @param {string} [options.package]
 * @param {boolean} [options.props]
 * @param {boolean} [options.source]
 * @param {boolean} [options.showcase]
 * @param {boolean} [options.blocks]
 * @param {'full'|'compact'|'brief'} [options.detail]
 * @param {string|null} [options.lang]
 * @param {boolean} [options.zh]
 * @param {boolean} [options.dense]
 * @param {string} coreDir
 * @returns {Promise<import('./component.type.mjs').ComponentBatchResponse>}
 */
async function componentBatch(selectors, options, coreDir) {
  const loadedIntegrations = await loadIntegrationsSafely(options.cwd);
  /** @type {import('./component.type.mjs').ComponentBatchResult[]} */
  const results = [];
  for (const value of selectors) {
    const selector = typeof value === 'string' ? value : String(value);
    try {
      const target = parseComponentSelector(value, options.package);
      requireInstalledSelectorVersion(target, coreDir, loadedIntegrations);
      const result =
        /** @type {import('./component.type.mjs').ComponentSingleResponse} */ (
          await component(target.name, {
            ...options,
            lang: options.lang ?? undefined,
            package: target.package,
          })
        );
      results.push({selector, status: 'found', result});
    } catch (error) {
      results.push(batchFailure(selector, error));
    }
  }
  return {type: 'component.batch', data: {count: results.length, results}};
}

/**
 * @param {string|string[]} [name]
 * @param {object} [options]
 * @param {string} [options.cwd]
 * @param {boolean} [options.list]
 * @param {string} [options.category]
 * @param {string} [options.package] - Scope to a specific external package (e.g. '@acme/xds-widgets')
 * @param {boolean} [options.props]
 * @param {boolean} [options.source]
 * @param {boolean} [options.showcase]
 * @param {boolean} [options.blocks]
 * @param {'full'|'compact'|'brief'} [options.detail] - Defaults to 'full' for a single component, 'brief' for list views (list/category/no name), matching the CLI.
 * @param {string} [options.lang]
 * @param {boolean} [options.zh]
 * @param {boolean} [options.dense]
 * @returns {Promise<(
 *   import('./component.type.mjs').ComponentListResponse
 *   | import('./component.type.mjs').ComponentBatchResponse
 *   | import('./component.type.mjs').ComponentDetailResponse
 *   | import('./component.type.mjs').ComponentDetailPropsResponse
 *   | import('./component.type.mjs').ComponentDetailSourceResponse
 *   | import('./component.type.mjs').ComponentDetailShowcaseResponse
 *   | import('./component.type.mjs').ComponentDetailBlocksResponse
 * )>}
 */
export async function component(name, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  // Every read resolves the links in the doc text it returns (spec:AST-047
  // FR9); a batch's results are each a read of their own. Doc tokens render
  // for the project in `cwd`.
  return runWithDocPackageManager(
    docPackageManager(cwd),
    async () =>
      /** @type {any} */ (
        await linkComponentResponse(await componentRead(name, options), cwd)
      ),
  );
}

/**
 * {@link component}, with each `{@link}` in its doc text as written.
 * @param {string|string[]} [name]
 * @param {Parameters<typeof component>[1]} [options]
 * @returns {ReturnType<typeof component>}
 */
async function componentRead(name, options = {}) {
  const {
    cwd = process.cwd(),
    list = false,
    category,
    package: packageScope,
    props = false,
    source = false,
    showcase = false,
    blocks = false,
    detail: detailOption,
    lang = null,
    zh = false,
    dense = false,
  } = options;

  const selectorList = Array.isArray(name) ? name : null;
  const noName = selectorList == null && !name;

  // Default detail level mirrors the CLI (see commands/component.mjs):
  // single-component views default to 'full', list-style views (--list,
  // --category, or no name) default to 'brief' (scannable name lists).
  // An explicit array remains a batch even when it is empty or a caller also
  // passes a list-only option.
  const isListView =
    selectorList == null && (list || category != null || noName);
  const detail = detailOption ?? (isListView ? 'brief' : 'full');

  // Same accepted values and codes as the CLI's --detail and --lang, checked
  // first as the CLI parser does.
  if (!DETAIL_LEVELS.includes(detail)) {
    throw new AstryxError(
      `Invalid detail "${String(detail)}". Valid levels: ${DETAIL_LEVELS.join(', ')}`,
      undefined,
      ERROR_CODES.ERR_INVALID_DETAIL,
    );
  }
  if (lang != null && !LANGS.includes(lang)) {
    throw new AstryxError(
      `Invalid lang "${String(lang)}". Valid values: ${LANGS.join(', ')}`,
      undefined,
      ERROR_CODES.ERR_INVALID_LANG,
    );
  }

  if (selectorList && selectorList.length > COMPONENT_BATCH_SELECTOR_LIMIT) {
    throw new AstryxError(
      `Component batch accepts at most ${COMPONENT_BATCH_SELECTOR_LIMIT} selectors; received ${selectorList.length}`,
      undefined,
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  }

  const coreDir = requireCoreDir(cwd);

  // A public API caller could pass a non-string category; the list leaf does
  // `category.toLowerCase()`, so guard it up front (same class as the name
  // guard below) instead of throwing a raw TypeError with no `.code`.
  if (category != null && typeof category !== 'string') {
    throw new AstryxError(
      `Unknown category "${String(category)}"`,
      undefined,
      ERROR_CODES.ERR_UNKNOWN_CATEGORY,
    );
  }

  // ── Explicit batch selector list ─────────────────────────────────
  // Array shape owns cardinality even if a caller also supplies a list-only
  // option. The aggregate limit above is checked before core or integrations
  // are resolved, so an oversized request can never emit a partial receipt.
  if (selectorList) {
    return componentBatch(
      selectorList,
      {
        cwd,
        package: packageScope,
        props,
        source,
        showcase,
        blocks,
        detail,
        lang,
        zh,
        dense,
      },
      coreDir,
    );
  }

  // ── List mode ──────────────────────────────────────────────────
  if (category || list || noName) {
    return componentList(coreDir, {cwd, category, detail, zh, dense, lang});
  }

  if (typeof name === 'string') {
    const target = parseComponentSelector(name, packageScope);
    if (target.version) {
      const loadedIntegrations = await loadIntegrationsSafely(cwd);
      requireInstalledSelectorVersion(target, coreDir, loadedIntegrations);
    }
    if (target.name !== name || target.package !== packageScope) {
      return componentRead(target.name, {...options, package: target.package});
    }
    name = target.name;
  }

  // ── Single component ───────────────────────────────────────────
  if (typeof name !== 'string') {
    throw new AstryxError(
      `No component named "${String(name)}"`,
      undefined,
      ERROR_CODES.ERR_UNKNOWN_COMPONENT,
    );
  }

  const dirName = name.replace(/^XDS/, '');
  const docOpts = {zh, dense, lang};

  // Ownership-aware resolution: who provides `dirName` across core + every
  // loaded integration. The scoped/ambiguity/fuzzy resolution below all read
  // this set (built once, in the adapter).
  const loadedIntegrations = await loadIntegrationsSafely(cwd);
  const owners = resolveOwners(coreDir, dirName, loadedIntegrations);

  // ── Scoped to a specific package (--package) ───────────────────
  // Searches that package first — critical for names that exist in both core
  // and an external package (AppShell, Button, SideNav).
  if (packageScope) {
    // The package whose component replaces a Core component answers to that
    // Core name too, as the bare name does (spec:AST-035 FR11).
    if (
      packageScope !== CORE_PACKAGE &&
      !owners.some(owner => owner.package === packageScope)
    ) {
      const replacement = await resolveComponentReplacement(
        coreDir,
        loadedIntegrations,
        dirName,
      );
      if (replacement?.package === packageScope) {
        return componentRead(replacement.name, {
          ...options,
          package: packageScope,
        });
      }
    }
    const scoped = classifyScope(packageScope, {
      owners,
      loadedIntegrations,
      cwd,
      name,
    });

    if (scoped.kind === 'core' || scoped.kind === 'integration') {
      const owner = scoped.owner;
      if (source) {
        return componentDetailSource(dirName, owner.sourcePath, {
          name,
          notFoundInPackage:
            scoped.kind === 'integration' ? packageScope : null,
          ownerPackage: owner.package,
        });
      }
      // showcase/blocks were previously dropped on the scoped path — a
      // `--package ... --showcase`/`--blocks` request silently fell through to
      // component.detail. Route them to the same leaves the no-scope path uses.
      // Core showcases carry no `package` field, so a core scope must NOT pass
      // packageScope (findShowcase filters those out); integrations never carry
      // a showcase, so skip discovery entirely.
      if (showcase) {
        return scoped.kind === 'core'
          ? componentDetailShowcase(dirName, {
              cwd,
              name,
              ownerPackage: owner.package,
            })
          : componentDetailShowcase(dirName, {
              cwd,
              name,
              resolve: false,
              ownerPackage: owner.package,
            });
      }
      if (blocks) {
        return componentDetailBlocks(dirName, cwd, owner.package);
      }
      const loaded = await loadComponentDoc(owner.docPath, docOpts);
      // A family member reads as that member, scoped the way the unscoped
      // lookup scopes it: an integration member by its own entry, a Core
      // sub-component (HStack in the Stack doc) by scopeSubComponent.
      const sub =
        scoped.kind === 'core'
          ? scopeSubComponent(loaded, dirName, coreDir)
          : null;
      if (sub) {
        if (props) {
          return componentDetailProps(
            {props: sub.matchingComponent.props},
            owner.package,
          );
        }
        return componentDetail(sub.scoped, owner, dirName, coreDir);
      }
      const docs =
        scoped.kind === 'integration'
          ? scopeIntegrationMember(loaded, owner, dirName)
          : loaded;
      if (props) return componentDetailProps(docs, owner.package);
      return componentDetail(docs, owner, dirName, coreDir);
    }

    // Legacy `pkg.astryx.docs` external package.
    if (showcase) {
      return componentDetailShowcase(dirName, {
        cwd,
        name,
        packageScope,
        ownerPackage: packageScope,
      });
    }
    const extDocPath = resolveLegacyExternalDoc(scoped.ext, dirName);
    if (extDocPath) {
      // Legacy packages ship docs, never source.
      if (source) {
        return componentDetailSource(dirName, null, {
          name,
          notFoundInPackage: packageScope,
          ownerPackage: scoped.ext.name,
        });
      }
      if (blocks) {
        return componentDetailBlocks(dirName, cwd, scoped.ext.name);
      }
      const docs = await loadComponentDoc(extDocPath, docOpts);
      if (props) return componentDetailProps(docs, scoped.ext.name);
      return componentDetail(
        docs,
        {package: scoped.ext.name, sourcePath: null},
        dirName,
        coreDir,
      );
    }
    throw new AstryxError(
      `No component "${name}" in package "${packageScope}"`,
      undefined,
      ERROR_CODES.ERR_UNKNOWN_COMPONENT,
    );
  }

  // ── Replaced Core component (spec:AST-035 FR11) ────────────────
  // An active integration replacement answers to the Core name it replaces,
  // bare or qualified by its own package (above). The original stays
  // reachable with `--package @astryxdesign/core`.
  const replacement = await resolveComponentReplacement(
    coreDir,
    loadedIntegrations,
    dirName,
  );
  if (replacement) {
    return componentRead(replacement.name, {
      ...options,
      package: replacement.package,
    });
  }

  // The owner rule runs first, over valid and invalid owners alike.
  const ruled = unscopedComponentOwners(owners);
  // Invalid integration metadata does not create ambiguity against a valid
  // owner. Keep ruled owners only when no doc owner is valid, so an integration-
  // only component still exposes its source and returns ERR_INVALID_DOC for
  // detail instead of degrading to an unrelated unknown-component error.
  const validOwners = [];
  for (const owner of ruled) {
    if (owner.package === CORE_PACKAGE) {
      validOwners.push(owner);
      continue;
    }
    try {
      await loadComponentDoc(owner.docPath);
      validOwners.push(owner);
    } catch {
      // Project/Doctor report invalid metadata; it is not an effective owner.
    }
  }
  const loadable = validOwners.length > 0 ? validOwners : ruled;
  // A legacy docs package's exact doc keeps its name over an export name a doc
  // records, as Core and file-named owners do.
  const effectiveOwners = legacyExternalKeeps(cwd, dirName, loadable)
    ? []
    : loadable;

  // ── Ambiguity: owned by MORE THAN ONE valid package, no --package ──
  assertUnambiguousOwners(effectiveOwners, dirName);

  // ── Single non-core owner (an integration provides it, core does not) ──
  if (
    effectiveOwners.length === 1 &&
    effectiveOwners[0].package !== CORE_PACKAGE
  ) {
    const owner = effectiveOwners[0];
    if (source) {
      return componentDetailSource(dirName, owner.sourcePath, {
        name,
        ownerPackage: owner.package,
      });
    }
    if (showcase) {
      // Integration components don't carry showcases — fail without scanning.
      return componentDetailShowcase(dirName, {
        cwd,
        name,
        resolve: false,
        ownerPackage: owner.package,
      });
    }
    const loaded = await loadComponentDoc(owner.docPath, docOpts);
    const docs = scopeIntegrationMember(loaded, owner, dirName);
    if (props) return componentDetailProps(docs, owner.package);
    return componentDetail(docs, owner, dirName, coreDir);
  }

  // ── No-scope core path ─────────────────────────────────────────
  // `--source` reads core directly (no external/fuzzy fallback).
  if (source) {
    return componentDetailSource(
      dirName,
      resolveCoreSourcePath(coreDir, dirName),
      {name, ownerPackage: CORE_PACKAGE},
    );
  }
  if (showcase) {
    return componentDetailShowcase(dirName, {
      cwd,
      name,
      ownerPackage: CORE_PACKAGE,
    });
  }

  const resolved = await resolveUnscopedDoc(dirName, {coreDir, cwd, name});
  const docs = await loadComponentDoc(resolved.readmePath, docOpts);

  // ── Blocks mode ──────────────────────────────────────────────
  if (blocks) {
    return componentDetailBlocks(dirName, cwd, resolved.resolvedOwnerPackage);
  }

  // ── Sub-component scoping ────────────────────────────────────
  // If the user asked for "Code" but the doc is for "CodeBlock" (parent),
  // scope the response to just the matching sub-component.
  const sub = scopeSubComponent(docs, dirName, coreDir);
  if (sub) {
    if (props)
      return componentDetailProps(
        {props: sub.matchingComponent.props},
        resolved.resolvedOwnerPackage,
      );
    return componentDetail(
      sub.scoped,
      {
        package: resolved.resolvedOwnerPackage,
        sourcePath: resolved.resolvedSourcePath,
      },
      dirName,
      coreDir,
    );
  }

  if (props) return componentDetailProps(docs, resolved.resolvedOwnerPackage);
  return componentDetail(
    docs,
    {
      package: resolved.resolvedOwnerPackage,
      sourcePath: resolved.resolvedSourcePath,
    },
    resolved.resolvedName,
    coreDir,
  );
}
