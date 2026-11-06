// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Integration component replacement (spec:AST-035 FR10–FR15).
 *
 * @input Core's component catalog and the loaded integrations, in precedence
 *   order (configured, then autolinked, then the package being authored).
 * @output The active replacement for each replaced Core component, and the
 *   findings Doctor reports.
 * @position foundation/discovery — the one place component replacement is
 *   decided. Component detail, list, search, swizzle, gap-report routing,
 *   Project, and `doctor integration components` read the result instead of
 *   deciding it again.
 *
 * A component opts in by setting `replaces` in its own doc. The replacement
 * applies only when the component's package also declares a
 * `@astryxdesign/cli` peer range that starts at COMPONENT_REPLACES_CLI: a
 * package published for an earlier CLI keeps the behavior it shipped with,
 * and every finding about it is a warning.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  discoverComponents,
  discoverValidIntegrationComponents,
} from './component-discovery.mjs';
import {
  CLI_PACKAGE,
  COMPONENT_REPLACES_CLI,
  componentReplacesCliProblem,
} from '../integrations/cli-requirement.mjs';
import {formatCliCommand} from '../env/package-manager.mjs';

/**
 * @typedef {import('../integrations/integrations.mjs').LoadedIntegration} LoadedIntegration
 */

/**
 * One Doctor finding about a component replacement.
 * @typedef {object} ComponentReplacementFinding
 * @property {string} package the package that declares the replacement
 * @property {string} component the declaring component's own name
 * @property {'missing_component_replacement_target' | 'invalid_component_replacement' | 'ambiguous_component_replacement' | 'inactive_component_replacement' | 'shadowed_component_name'} code
 * @property {'warning' | 'error'} severity
 * @property {string} message
 * @property {boolean} optedIn whether the finding is about a package that
 *   declares the CLI floor. Project issues and the everyday-command nudge
 *   carry only these; a package without the floor is reported to its author
 *   through `doctor integration components` and the pack check alone.
 */

/**
 * The integration component that answers to a Core component's name.
 * @typedef {object} ActiveComponentReplacement
 * @property {string} target the replaced Core component's name
 * @property {string} name the replacement's own name
 * @property {string} package
 * @property {string} docPath
 * @property {string|null} sourcePath
 * @property {string|undefined} issuesUrl
 * @property {LoadedIntegration} integration
 */

/**
 * @typedef {object} ComponentReplacements
 * @property {ActiveComponentReplacement[]} active in Core catalog order
 * @property {ComponentReplacementFinding[]} findings
 * @property {(name: unknown) => ActiveComponentReplacement | undefined} forTarget
 *   the active replacement for a Core component name, matched exactly, as
 *   Core component lookups are
 */

/**
 * @typedef {object} Declaration
 * @property {string} name
 * @property {string} package
 * @property {string} docPath
 * @property {string|null} sourcePath
 * @property {string|undefined} issuesUrl
 * @property {unknown} replaces
 * @property {LoadedIntegration} integration
 * @property {boolean} autolinked
 * @property {boolean} optedIn
 */

/** @param {string} value @returns {string} */
const keyOf = value => value.toLowerCase();

/**
 * The package.json beside an integration, or an empty object when it cannot
 * be read: a package with no readable manifest declares no CLI range.
 * @param {LoadedIntegration} integration
 * @returns {any}
 */
function packageJsonOf(integration) {
  const dir = integration.__packageDir;
  if (typeof dir !== 'string') return {};
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Whether a package's declared CLI range turns its component replacements on.
 * @param {any} pkg package.json
 * @returns {boolean}
 */
export function componentReplacementsEnabled(pkg) {
  return componentReplacesCliProblem(pkg) == null;
}

/**
 * The sentence a finding about a package without the floor ends with.
 * @param {string} name
 * @param {string} target
 * @returns {string}
 */
function inactiveTail(name, target) {
  const until =
    name === target
      ? `Until then the bare name "${name}" stays ambiguous between Core and this package; select either one with --package.`
      : `Until then "${name}" keeps its own name and "${target}" stays Core.`;
  return (
    `This CLI applies the replacement only when the package declares "${CLI_PACKAGE}": ">=${COMPONENT_REPLACES_CLI}" ` +
    `in peerDependencies (optional in peerDependenciesMeta). ${until}`
  );
}

/**
 * Decide every component replacement for one project.
 *
 * Each integration's valid components are read once. A declaration on a
 * package without the CLI floor never applies, and its findings are warnings.
 * For packages with the floor: a missing Core target, an invalid value, a
 * component named after a different Core component, or two declarations for
 * one target in one package are errors, and an invalid declaration never
 * replaces Core. When several packages validly replace one target, an
 * explicitly configured package beats an autolinked one, and among the
 * remaining contenders the later package wins with a warning.
 *
 * @param {string|null} coreDir
 * @param {readonly LoadedIntegration[]} loadedIntegrations
 * @returns {Promise<ComponentReplacements>}
 */
export async function resolveComponentReplacements(
  coreDir,
  loadedIntegrations,
) {
  /** @type {ComponentReplacementFinding[]} */
  const findings = [];
  /** @type {Map<string, ActiveComponentReplacement>} */
  const byTarget = new Map();
  const result = {
    /** @type {ActiveComponentReplacement[]} */
    active: [],
    findings,
    /** @param {unknown} name */
    forTarget: name =>
      typeof name === 'string' ? byTarget.get(name) : undefined,
  };

  // A first read under file names alone settles the common case, no
  // declaration anywhere, without reading the names docs document.
  let declares = false;
  for (const integration of loadedIntegrations) {
    if (declares || !integration?.components || integration.__loadError)
      continue;
    try {
      const {components} = await discoverValidIntegrationComponents(
        integration,
        {documentedNames: false},
      );
      declares = components.some(record => record.replaces !== undefined);
    } catch {
      // Read again below, where a root that cannot be read is skipped.
    }
  }
  if (!declares) return result;

  /** @type {Declaration[]} */
  const declarations = [];
  /** @type {Array<{name: string, package: string}>} */
  const nativeComponents = [];
  for (const integration of loadedIntegrations) {
    if (
      integration == null ||
      integration.__loadError ||
      !integration.components
    ) {
      continue;
    }
    /** @type {Awaited<ReturnType<typeof discoverValidIntegrationComponents>>['components']} */
    let components;
    try {
      // Every valid component, with the `replaces` its loaded doc sets: a
      // doc may spread, re-export, compute, or build the field, so only the
      // loaded value says whether it declares a replacement.
      ({components} = await discoverValidIntegrationComponents(integration));
    } catch {
      // Project and Doctor report a component root that cannot be read.
      continue;
    }
    /** @type {boolean | null} */
    let optedIn = null;
    for (const record of components) {
      if (record.replaces === undefined) {
        nativeComponents.push({name: record.name, package: record.package});
        continue;
      }
      optedIn ??= componentReplacementsEnabled(packageJsonOf(integration));
      declarations.push({
        name: record.name,
        package: record.package,
        docPath: record.docPath,
        sourcePath: record.sourcePath,
        issuesUrl: record.issuesUrl,
        replaces: record.replaces,
        integration,
        autolinked: integration.__autolinked === true,
        optedIn,
      });
    }
  }
  if (declarations.length === 0) return result;

  /** @type {string[]} */
  let coreNames = [];
  if (coreDir) {
    try {
      coreNames = Object.values(discoverComponents(coreDir)).flat();
    } catch {
      coreNames = [];
    }
  }
  /** @type {Map<string, string>} */
  const coreByKey = new Map(coreNames.map(name => [keyOf(name), name]));
  const coreSet = new Set(coreNames);

  /**
   * @param {Declaration} declaration
   * @param {ComponentReplacementFinding['code']} code
   * @param {string} message
   */
  const report = (declaration, code, message) => {
    findings.push({
      package: declaration.package,
      component: declaration.name,
      code,
      severity: declaration.optedIn ? 'error' : 'warning',
      message,
      optedIn: declaration.optedIn,
    });
  };

  /**
   * Valid declarations per canonical Core target, in precedence order.
   * @type {Map<string, Declaration[]>}
   */
  const validByTarget = new Map();
  /** @type {Set<string>} targets an opted-in error makes invalid */
  const invalidTargets = new Set();
  /** @type {Map<string, Declaration[]>} errors per target, for precedence */
  const failedByTarget = new Map();

  for (const declaration of declarations) {
    const {name, replaces} = declaration;
    const shown = typeof replaces === 'string' ? replaces : String(replaces);
    if (!declaration.optedIn) {
      findings.push({
        package: declaration.package,
        component: name,
        code: 'inactive_component_replacement',
        severity: 'warning',
        message: `Component "${name}" sets \`replaces: ${JSON.stringify(shown)}\`. ${inactiveTail(name, shown)}`,
        optedIn: false,
      });
    }
    if (typeof replaces !== 'string' || replaces.trim() === '') {
      report(
        declaration,
        'invalid_component_replacement',
        `Component "${name}" sets \`replaces\` to ${JSON.stringify(replaces) ?? String(replaces)}. Set it to the exact name of one Core component, such as "SideNav".`,
      );
      continue;
    }
    if (!coreSet.has(replaces)) {
      const differentCase = coreByKey.get(keyOf(replaces));
      report(
        declaration,
        'missing_component_replacement_target',
        differentCase
          ? `Component "${name}" replaces "${replaces}", which is not a Core component name. Core names it "${differentCase}".`
          : `Component "${name}" replaces "${replaces}", which is not a Core component. Run \`${formatCliCommand('component --list')}\` for Core component names.`,
      );
      if (declaration.optedIn) {
        const key = differentCase ?? replaces;
        const failed = failedByTarget.get(key) ?? [];
        failed.push(declaration);
        failedByTarget.set(key, failed);
      }
      continue;
    }
    const ownCore = coreSet.has(name) ? name : null;
    if (ownCore != null && ownCore !== replaces) {
      report(
        declaration,
        'invalid_component_replacement',
        `Component "${name}" replaces "${replaces}", but its own name is the Core component "${ownCore}". Rename it, or replace "${ownCore}" instead.`,
      );
      if (declaration.optedIn) {
        const failed = failedByTarget.get(replaces) ?? [];
        failed.push(declaration);
        failedByTarget.set(replaces, failed);
      }
      continue;
    }
    const valid = validByTarget.get(replaces) ?? [];
    valid.push(declaration);
    validByTarget.set(replaces, valid);
  }

  // Two components in one package replacing one target: neither applies. A
  // package without the floor gets the same finding, as a warning.
  for (const [target, valid] of validByTarget) {
    /** @type {Map<string, Declaration[]>} */
    const byPackage = new Map();
    for (const declaration of valid) {
      const group = byPackage.get(declaration.package) ?? [];
      group.push(declaration);
      byPackage.set(declaration.package, group);
    }
    for (const [pkg, group] of byPackage) {
      if (group.length < 2) continue;
      const names = group
        .map(declaration => `"${declaration.name}"`)
        .join(', ');
      for (const declaration of group) {
        report(
          declaration,
          'ambiguous_component_replacement',
          `${pkg} declares ${group.length} components as replacements for Core component "${target}" (${names}). One package declares at most one replacement for a Core component.`,
        );
      }
      if (group[0].optedIn) {
        const failed = failedByTarget.get(target) ?? [];
        failed.push(...group);
        failedByTarget.set(target, failed);
      }
      validByTarget.set(
        target,
        (validByTarget.get(target) ?? []).filter(d => d.package !== pkg),
      );
    }
  }

  // Only declarations from packages with the floor contend for a target.
  /** @param {string} target */
  const contendersFor = target =>
    (validByTarget.get(target) ?? []).filter(
      declaration => declaration.optedIn,
    );

  for (const [target, failed] of failedByTarget) {
    const valid = contendersFor(target);
    const hasExplicitIntent =
      valid.some(declaration => !declaration.autolinked) ||
      failed.some(declaration => !declaration.autolinked);
    // An invalid autolinked declaration never disables explicit intent.
    if (
      failed.some(declaration => !hasExplicitIntent || !declaration.autolinked)
    ) {
      invalidTargets.add(target);
    }
  }

  for (const target of coreNames) {
    const valid = contendersFor(target);
    if (valid.length === 0 || invalidTargets.has(target)) continue;
    const hasExplicitIntent = valid.some(
      declaration => !declaration.autolinked,
    );
    const contenders = hasExplicitIntent
      ? valid.filter(declaration => !declaration.autolinked)
      : valid;
    const winner = contenders[contenders.length - 1];
    if (valid.length > 1) {
      const packages = valid.map(declaration => declaration.package).join(', ');
      const reason =
        hasExplicitIntent && valid.some(declaration => declaration.autolinked)
          ? `${winner.package} is explicitly configured, so it wins over autolinked integrations.`
          : hasExplicitIntent
            ? `${winner.package} is configured later, so it wins.`
            : `${winner.package} is listed later in package.json dependencies, so it wins. Add the intended package to astryx.config integrations to make precedence explicit.`;
      findings.push({
        package: winner.package,
        component: winner.name,
        code: 'ambiguous_component_replacement',
        severity: 'warning',
        message: `Core component "${target}" is replaced by ${packages}. ${reason}`,
        optedIn: true,
      });
    }
    const active = {
      target,
      name: winner.name,
      package: winner.package,
      docPath: winner.docPath,
      sourcePath: winner.sourcePath,
      issuesUrl: winner.issuesUrl,
      integration: winner.integration,
    };
    byTarget.set(target, active);
    result.active.push(active);

    // An integration component named after the target, from another
    // package, is no longer what the bare name selects.
    for (const native of nativeComponents) {
      if (native.package === winner.package || native.name !== target) {
        continue;
      }
      findings.push({
        package: native.package,
        component: native.name,
        code: 'shadowed_component_name',
        severity: 'warning',
        message: `Component "${native.name}" from ${native.package} is shadowed by "${winner.name}" from ${winner.package}, which replaces Core "${target}". Select it with --package ${native.package}.`,
        optedIn: true,
      });
    }
  }

  return result;
}
