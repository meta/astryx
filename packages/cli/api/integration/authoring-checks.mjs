// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Integration authoring diagnostics against the built-in Core catalog.
 *
 * The components check also compares each component doc's props with the
 * component's TypeScript props (foundation/discovery/prop-drift.mjs); those
 * findings are warnings under `propDrift`.
 *
 * Templates may intentionally replace Core identities; undeclared same-id
 * overlaps stay fail-closed and require package selection. The CLI package
 * version gates replacement-specific fields so 0.6.x keeps its released shape.
 * Docs have explicit `replaces` / `extends` relationships with parallel
 * validation semantics.
 *
 * @input Integration packages, built-in catalogs, and the CLI release boundary.
 * @output Typed template, component, and documentation authoring diagnostics.
 * @position Public integration-authoring API over private discovery adapters.
 */

import path from 'node:path';
import {getCliInvocation} from '../../foundation/env/package-manager.mjs';
import {
  packageComponentLinkProblems,
  packageDocTargets,
  packageDocsProblems,
  packageReferenceProblems,
} from '../docs/_adapter.mjs';
import {findProjectCoreDir} from '../../foundation/fs/paths.mjs';
import {
  discoverIntegrationComponents,
  discoverOwnedComponents,
} from '../../foundation/discovery/component-discovery.mjs';
import {loadComponentReplacements} from '../component/_adapter.mjs';
import {
  integrationCopiedPassages,
  integrationFluff,
  integrationPropDrift,
  integrationStrayPointers,
} from './_adapter.mjs';
import {
  BUILTIN_DOCS_PACKAGE,
  discoverBuiltinTopics,
  discoverIntegrationDocs,
  isGuideRoute,
} from '../../foundation/discovery/docs-discovery.mjs';
import {
  applyTemplateReplacements,
  discoverCoreTemplates,
  discoverIntegrationTemplatesForOne,
} from '../../foundation/discovery/template-adapter.mjs';
import {expandedTemplateConflictSchemaActive} from '../../foundation/discovery/template-conflict-release.mjs';
import {
  validateInstalledIntegration,
  validateLocalIntegration,
} from './validate-integration.mjs';
import {rootProblem} from '../../foundation/integrations/validate-contributions.mjs';
import {normalizeProviderId} from '../../foundation/identity/provider-identity.mjs';

/** @param {string} value */
export function shellArg(value) {
  if (/^[A-Za-z0-9@/._-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * The provider ID a package without a name is checked under: a valid bare
 * package name no published package can hold (npm names are lowercase).
 */
const UNNAMED_PROVIDER = 'astryx-unnamed-local-package';

/**
 * A message as the package sees it: the stand-in provider ID gone, its docs
 * named by their path in the package.
 * @param {string} message
 */
function unnamedShown(message) {
  return message
    .split(`${UNNAMED_PROVIDER}/`)
    .join('')
    .split(UNNAMED_PROVIDER)
    .join('this package');
}

/**
 * Resolve one local or installed integration for an authoring check.
 * @param {string | undefined} pkg
 * @param {string} cwd
 */
async function resolveIntegration(pkg, cwd) {
  const resolved = pkg
    ? await validateInstalledIntegration(pkg, cwd)
    : await validateLocalIntegration(cwd);
  const integration = resolved.found ? resolved.integration : undefined;
  if (!integration) return resolved;
  // A root that is not a readable folder is reported in the issues; the
  // checks read nothing from it rather than fail on it.
  /** @type {typeof integration & {__unnamed?: boolean}} */
  const usable = {...integration};
  // The provider ID readers key the package on: the manifest's providerId,
  // else its name. A package with neither (validate warned about it) is
  // still checked; the docs check names its docs under a stand-in ID.
  try {
    usable.providerId = normalizeProviderId(
      integration.__declaredProviderId ?? integration.name,
    );
  } catch {
    usable.__unnamed = true;
  }
  for (const kind of /** @type {const} */ ([
    'components',
    'templates',
    'codemods',
    'docs',
    'themes',
  ])) {
    const root = usable[kind];
    if (root != null && rootProblem(root)) usable[kind] = undefined;
  }
  return {...resolved, integration: usable};
}

/**
 * Add discovery errors once to an issue list.
 * @param {Array<{code: string, severity: 'warning' | 'error', message: string}>} issues
 * @param {Array<{message: string, code?: string, severity?: 'warning' | 'error'} | Error>} errors
 * @param {string} code
 */
function addErrors(issues, errors, code) {
  for (const error of errors) {
    const message = error.message;
    const issueCode =
      'code' in error && typeof error.code === 'string' ? error.code : code;
    const severity =
      'severity' in error &&
      (error.severity === 'warning' || error.severity === 'error')
        ? error.severity
        : 'error';
    if (
      issues.some(
        issue => issue.code === issueCode && issue.message === message,
      )
    ) {
      continue;
    }
    issues.push({code: issueCode, severity, message});
  }
}

/**
 * Find integration template ids that are also owned by Core.
 * @param {string} [pkg] Installed integration package; omit for the local package.
 * @param {import('./authoring-checks.type.mjs').IntegrationAuthoringOptions} [options]
 * @returns {Promise<import('./authoring-checks.type.mjs').IntegrationTemplateConflictResponse>}
 */
export async function integrationTemplateConflicts(pkg, options = {}) {
  const {cwd = process.cwd()} = options;
  const resolved = await resolveIntegration(pkg, cwd);
  const validated = resolved.found;
  const name = resolved.found ? (resolved.name ?? null) : null;
  const version = resolved.found ? (resolved.version ?? null) : null;
  const issues = [...resolved.issues];

  if (!resolved.integration || name == null) {
    return {
      type: 'integration.template-conflicts',
      data: {validated, name, version, conflicts: [], issues},
    };
  }

  const [{templates, errors}, coreTemplates] = await Promise.all([
    discoverIntegrationTemplatesForOne(resolved.integration),
    discoverCoreTemplates(),
  ]);
  addErrors(issues, errors, 'invalid_template');

  const expandedConflictSchema = expandedTemplateConflictSchemaActive();
  const replacementResolution = applyTemplateReplacements(
    [...coreTemplates, ...templates],
    errors.filter(error => error.replacementTarget != null),
  );
  for (const error of replacementResolution.errors) {
    if (
      !issues.some(
        issue => issue.code === error.code && issue.message === error.message,
      )
    ) {
      issues.push({
        code: error.code,
        severity: error.severity,
        message: error.message,
      });
    }
  }
  const activeReplacementIds = new Set(
    replacementResolution.templates
      .filter(
        template => template.package === name && template.replaces != null,
      )
      .map(template => template.dirName),
  );

  /** @type {Map<string, Array<{type: 'page' | 'block', name: string}>>} */
  const coreById = new Map();
  for (const template of coreTemplates) {
    const matches = coreById.get(template.dirName) ?? [];
    matches.push({type: template.type, name: template.name});
    coreById.set(template.dirName, matches);
  }
  for (const matches of coreById.values()) {
    matches.sort((a, b) =>
      `${a.type}:${a.name}`.localeCompare(`${b.type}:${b.name}`),
    );
  }

  const run = getCliInvocation(cwd);
  /** @type {import('./authoring-checks.type.mjs').IntegrationTemplateConflict[]} */
  const conflicts = [];
  for (const template of templates) {
    const sameIdCore = coreById.get(template.dirName);
    const replacementIsActive = activeReplacementIds.has(template.dirName);

    if (
      expandedConflictSchema &&
      replacementIsActive &&
      template.replaces != null
    ) {
      // This branch is unreachable before the package reaches 0.7.0. Keep the
      // published 0.6.x conflict typedef narrow until the activation change.
      conflicts.push(
        /** @type {any} */ ({
          id: template.dirName,
          severity: 'info',
          relationship: 'replaces',
          replaces: template.replaces,
          integrationPackage: name,
          integrationType: template.type,
          integrationName: template.name,
          coreMatches: coreById.get(template.replaces) ?? [],
          message:
            `Intentional replacement: "${template.dirName}" replaces the Core template ` +
            `"${template.replaces}" for unqualified lookup.`,
          command: `${run} template ${shellArg(template.replaces)} --package ${shellArg('@astryxdesign/core')}`,
        }),
      );
    }

    if (
      sameIdCore &&
      !(replacementIsActive && template.replaces === template.dirName)
    ) {
      const coreKinds = sameIdCore
        .map(match => `${match.type} "${match.name}"`)
        .join(', ');
      const compatibleKind = sameIdCore.some(
        match => match.type === template.type,
      );
      conflicts.push({
        id: template.dirName,
        severity: 'warning',
        ...(expandedConflictSchema ? {relationship: 'accidental'} : {}),
        integrationPackage: name,
        integrationType: template.type,
        integrationName: template.name,
        coreMatches: sameIdCore,
        message: expandedConflictSchema
          ? compatibleKind
            ? `Template id "${template.dirName}" conflicts with Core (${coreKinds}). Consider renaming it, or set replaces: ${JSON.stringify(template.dirName)} in its metadata to replace the Core template.`
            : `Template id "${template.dirName}" conflicts with Core (${coreKinds}), but a ${template.type} template cannot replace a different template kind. Rename the integration template.`
          : `Template id "${template.dirName}" conflicts with Core (${coreKinds}). Consider renaming the integration template. If you keep it, always select it with --package.`,
        command: `${run} template ${shellArg(template.dirName)} --package ${shellArg(name)}`,
      });
    }
  }
  conflicts.sort((a, b) =>
    `${a.id}:${'relationship' in a ? a.relationship : ''}`.localeCompare(
      `${b.id}:${'relationship' in b ? b.relationship : ''}`,
    ),
  );

  return {
    type: 'integration.template-conflicts',
    data: {validated, name, version, conflicts, issues},
  };
}

/**
 * Find integration component names that are also owned by Core.
 * @param {string} [pkg]
 * @param {import('./authoring-checks.type.mjs').IntegrationAuthoringOptions} [options]
 * @returns {Promise<import('./authoring-checks.type.mjs').IntegrationComponentConflictResponse>}
 */
export async function integrationComponentConflicts(pkg, options = {}) {
  const {cwd = process.cwd()} = options;
  const resolved = await resolveIntegration(pkg, cwd);
  const validated = resolved.found;
  const name = resolved.found ? (resolved.name ?? null) : null;
  const version = resolved.found ? (resolved.version ?? null) : null;
  const issues = [...resolved.issues];

  if (!resolved.integration?.components || name == null) {
    return {
      type: 'integration.component-conflicts',
      data: {validated, name, version, conflicts: [], issues},
    };
  }

  // Each documented prop against the component's TypeScript props, read with
  // the project's own compiler; without one the report says it was skipped.
  const propDrift = await integrationPropDrift(resolved.integration, cwd);

  // A link in a component doc's text reads as the command that opens its doc,
  // as one in a topic does; one that names no doc prints as written, so it is
  // a warning (spec:AST-047 FR9). The package's own topics are linkable.
  const ownDocs = resolved.integration.docs
    ? await discoverIntegrationDocs(resolved.integration)
    : null;
  for (const {severity, message} of await packageComponentLinkProblems(
    resolved.integration,
    ownDocs,
  )) {
    issues.push({code: 'invalid_doc_graph', severity, message});
  }

  const coreDir = findProjectCoreDir(cwd);
  if (!coreDir) {
    issues.push({
      code: 'core_not_found',
      severity: 'error',
      message:
        'Could not resolve @astryxdesign/core, so component names could not be checked. Install Core and run this check again.',
    });
    return {
      type: 'integration.component-conflicts',
      data: {validated, name, version, conflicts: [], issues, propDrift},
    };
  }

  const coreNames = new Set(
    discoverOwnedComponents(coreDir, [])
      .filter(record => record.package === '@astryxdesign/core')
      .map(record => record.name),
  );
  // Component replacements (spec:AST-035 FR10-FR15). A package without the
  // CLI floor gets only warnings, so its exit code is what it was before the
  // floor existed. An active replacement named after its own target is
  // intentional, not a conflict.
  const replacements = await loadComponentReplacements(coreDir, [
    resolved.integration,
  ]);
  addErrors(issues, replacements.findings, 'invalid_component_replacement');
  const intentional = new Set(
    replacements.active
      .filter(
        active => active.package === name && active.name === active.target,
      )
      .map(active => active.name),
  );

  const run = getCliInvocation(cwd);
  const conflicts = discoverIntegrationComponents(resolved.integration)
    .filter(
      component =>
        coreNames.has(component.name) && !intentional.has(component.name),
    )
    .map(component => ({
      name: component.name,
      severity: /** @type {const} */ ('warning'),
      integrationPackage: name,
      message:
        `Component "${component.name}" conflicts with Core. Consider renaming the integration component. ` +
        'If you keep it, always select it with --package.',
      command: `${run} component ${shellArg(component.name)} --package ${shellArg(name)}`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    type: 'integration.component-conflicts',
    data: {validated, name, version, conflicts, issues, propDrift},
  };
}

/**
 * Classify integration docs that overlap with built-in Core topics.
 * @param {string} [pkg]
 * @param {import('./authoring-checks.type.mjs').IntegrationAuthoringOptions} [options]
 * @returns {Promise<import('./authoring-checks.type.mjs').IntegrationDocConflictResponse>}
 */
export async function integrationDocConflicts(pkg, options = {}) {
  const {cwd = process.cwd()} = options;
  const resolved = await resolveIntegration(pkg, cwd);
  const validated = resolved.found;
  const name = resolved.found ? (resolved.name ?? null) : null;
  const version = resolved.found ? (resolved.version ?? null) : null;
  const issues = [...resolved.issues];

  /** @type {import('./authoring-checks.type.mjs').CopiedPassage[]} */
  const copiedPassages = [];
  /** @type {import('./authoring-checks.type.mjs').DocFluff[]} */
  const fluff = [];
  /** @type {import('./authoring-checks.type.mjs').StrayPointer[]} */
  const strayPointers = [];
  // Like the other findings' `doc`, a fluff or stray-pointer `file` is
  // relative to the package root.
  const packageDir = /** @type {any} */ (resolved.integration)?.__packageDir;
  const fromPackage = (/** @type {string} */ file) =>
    typeof packageDir === 'string'
      ? path.relative(packageDir, file).split(path.sep).join('/')
      : file;
  if (!resolved.integration?.docs || name == null) {
    // A package that ships components and no topics still has component docs
    // a written pointer can sit in.
    if (name != null && resolved.integration?.components) {
      strayPointers.push(
        ...(
          await integrationStrayPointers(
            {records: [], guides: []},
            resolved.integration,
          )
        ).map(each => ({...each, file: fromPackage(each.file)})),
      );
      for (const {message} of strayPointers) {
        issues.push({code: 'stray_doc_pointer', severity: 'warning', message});
      }
    }
    return {
      type: 'integration.doc-conflicts',
      data: {
        validated,
        name,
        version,
        findings: [],
        copiedPassages,
        fluff,
        strayPointers,
        issues,
      },
    };
  }

  // The docs tree names a package's docs by its provider ID, which a
  // package.json without a name does not give: its docs are checked under a
  // stand-in ID, which no message names.
  const unnamed = /** @type {{__unnamed?: boolean}} */ (resolved.integration)
    .__unnamed;
  const docsIntegration = unnamed
    ? {
        ...resolved.integration,
        name: UNNAMED_PROVIDER,
        providerId: UNNAMED_PROVIDER,
      }
    : resolved.integration;
  const [discovered, builtinTopics] = await Promise.all([
    discoverIntegrationDocs(docsIntegration),
    Promise.resolve(discoverBuiltinTopics()),
  ]);
  const {records, errors} = discovered;
  addErrors(issues, errors, 'invalid_doc');
  const coreTopicsByKey = new Map(
    Object.keys(builtinTopics).map(topic => [topic.toLowerCase(), topic]),
  );

  /** @type {import('./authoring-checks.type.mjs').IntegrationDocFinding[]} */
  const findings = [];
  for (const record of records) {
    const replacedCore =
      record.replaces == null
        ? undefined
        : coreTopicsByKey.get(record.replaces.toLowerCase());
    const extendedCore =
      record.extendsTopic == null
        ? undefined
        : coreTopicsByKey.get(record.extendsTopic.toLowerCase());
    const sameNameCore = coreTopicsByKey.get(record.name.toLowerCase());

    if (replacedCore != null) {
      findings.push({
        topic: record.name,
        severity: 'info',
        relationship: 'replaces',
        coreTopic: replacedCore,
        message: `Intentional override: "${record.name}" replaces the Core topic "${replacedCore}".`,
      });
    }
    if (extendedCore != null) {
      findings.push({
        topic: record.name,
        severity: 'info',
        relationship: 'extends',
        coreTopic: extendedCore,
        message: `Intentional extension: "${record.name}" extends the Core topic "${extendedCore}".`,
      });
    }

    // An extension never owns its own name, and neither does a doc that
    // replaces a guide by its route: readers open the route. A topic
    // replacement does, so it may only reuse a Core name when that is the
    // Core topic it explicitly replaces.
    if (
      sameNameCore != null &&
      record.extendsTopic == null &&
      !isGuideRoute(record.replaces) &&
      replacedCore !== sameNameCore
    ) {
      findings.push({
        topic: record.name,
        severity: 'error',
        relationship: 'accidental',
        coreTopic: sameNameCore,
        message:
          `Accidental conflict: "${record.name}" is already a Core topic. ` +
          `Rename it, declare replaces: '${sameNameCore}' to take it over, or declare extends: '${sameNameCore}' to merge sections.`,
      });
    }
  }
  // A doc that replaces or extends one of the CLI's guides by its route is
  // as intentional as one that names a Core topic.
  if (errors.length === 0) {
    for (const target of await packageDocTargets(
      /** @type {{name: string}} */ (docsIntegration),
      discovered,
    )) {
      if (target.kind !== 'guide' || target.owner !== BUILTIN_DOCS_PACKAGE) {
        continue;
      }
      // A route the guide moved from names the guide at its route now.
      const route = target.guide ?? target.target;
      findings.push({
        topic: target.topic,
        severity: 'info',
        relationship: target.relationship,
        coreTopic: route,
        message: `Intentional ${target.relationship === 'replaces' ? 'override' : 'extension'}: "${target.topic}" ${target.relationship} the CLI guide "${route}".`,
      });
    }
  }
  findings.sort((a, b) =>
    `${a.topic}:${a.relationship}`.localeCompare(
      `${b.topic}:${b.relationship}`,
    ),
  );

  // The same graph checks `astryx doctor` runs in a project: the namespaces
  // and placed guides this package adds to the docs tree, and every link in
  // its docs (spec:AST-046, spec:AST-047).
  if (errors.length === 0) {
    for (const {severity, message} of await packageDocsProblems(
      /** @type {{name: string}} */ (docsIntegration),
      discovered,
    )) {
      issues.push({
        code: 'invalid_doc_graph',
        severity,
        message: unnamedShown(message),
      });
    }

    // A reference block includes content rather than linking to it, so one
    // that cannot include what it names loses that content for every reader:
    // an error, where a link that names no doc still prints as written.
    for (const message of await packageReferenceProblems(
      /** @type {{name: string}} */ (docsIntegration),
      discovered,
    )) {
      issues.push({
        code: 'invalid_doc_reference',
        severity: 'error',
        message: unnamedShown(message),
      });
    }

    // One fact has one owner: a passage two topics repeat goes stale in one
    // of them. Each is listed and is a warning (architecture:cli-surface
    // DEC-8), so `integration check --strict` fails until it is fixed;
    // `doctor integration docs` keeps its exit code, as it fails on errors.
    copiedPassages.push(
      ...(await integrationCopiedPassages(discovered)).map(passage => ({
        ...passage,
        message: unnamedShown(passage.message),
      })),
    );
    for (const {message} of copiedPassages) {
      issues.push({code: 'copied_passage', severity: 'warning', message});
    }
    // Docs should be dense: padding phrases and mostly-glue topics, listed
    // and warned about the same way (DEC-8).
    fluff.push(
      ...(await integrationFluff(discovered)).map(each => ({
        ...each,
        file: fromPackage(each.file),
        message: unnamedShown(each.message),
      })),
    );
    for (const {message} of fluff) {
      issues.push({code: 'doc_fluff', severity: 'warning', message});
    }
    // A pointer to a doc is a link, so doctor checks it (DEC-8).
    strayPointers.push(
      ...(await integrationStrayPointers(discovered, resolved.integration)).map(
        each => ({...each, file: fromPackage(each.file)}),
      ),
    );
    for (const {message} of strayPointers) {
      issues.push({code: 'stray_doc_pointer', severity: 'warning', message});
    }
  }

  return {
    type: 'integration.doc-conflicts',
    data: {
      validated,
      name,
      version,
      findings,
      copiedPassages,
      fluff,
      strayPointers,
      issues,
    },
  };
}
