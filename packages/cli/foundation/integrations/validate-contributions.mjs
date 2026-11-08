// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file On-disk contribution checks for a LOADED integration.
 *
 * These validators live in foundation rather than beside the
 * Doctor integration validation because foundation itself needs them:
 * `Project` collects integration issues while assembling components/templates,
 * and `integration-warnings` nudges about them on ordinary commands. Keeping
 * them here means those callers no longer reach up into `api/`.
 *
 * The base manifest schema is not re-validated here — `loadIntegrations` already
 * did that. Optional contributions such as `agentDocs` carry their own error
 * marker so a bad contribution is reported without withdrawing valid roots.
 * What is re-checked is the on-disk contributions (roots +
 * codemods/templates/components/docs/themes), because those regress independently of the
 * manifest: a deleted directory, a template that lost its source file.
 *
 * @input a loaded-integration-shaped object (absolute contribution roots + identity)
 * @output AstryxIntegrationIssue[]
 * @position packages/cli/foundation/integrations — shared contribution validators
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {spawnSync} from 'node:child_process';
import {builtinModules} from 'node:module';
import {parse as parseModule} from '@babel/parser';
import {isValidSemver} from '../env/semver.mjs';
import {findProjectCoreDir} from '../fs/paths.mjs';
import {KNOWN_INTEGRATION_KEYS} from '../../authoring/integration/schema.mjs';
import {
  contributionFiles,
  findSourceOnlyCandidates,
  findTemplateSourceOnlyCandidates,
} from './contribution-inventory.mjs';
import {
  CODEMOD_FILE_RE,
  CODEMOD_SKIP_DIRS,
  CODEMOD_TEST_RE,
  createFixContext,
  DOC_CANDIDATE_RE,
  heldRootFix,
  newComponentDocNote,
  notACodemodFix,
  notAComponentFix,
  readContributionStamp,
  sharedCodemodsRootFix,
  stampOf,
  themeImporting,
  TEMPLATE_CANDIDATE_RE,
} from './contribution-fixes.mjs';
import {MANIFEST_BASENAMES} from './integrations.mjs';
import {npmCommand} from '../release/cache.mjs';
import {discoverIntegrationCodemods} from '../../assets/codemods/integration-discovery.mjs';
import {discoverIntegrationTemplatesForOne} from '../discovery/template-adapter.mjs';
import * as componentDiscovery from '../discovery/component-discovery.mjs';
import {loadComponentDoc} from '../discovery/component-loader.mjs';
import {
  moduleExportNames,
  moduleExportsName,
  moduleExportVerdict,
} from '../discovery/module-exports.mjs';
import {discoverIntegrationDocs} from '../discovery/docs-discovery.mjs';
import {discoverIntegrationThemes} from '../discovery/theme-discovery.mjs';

/**
 * @typedef {import('./issue').AstryxIntegrationIssue} Issue
 * @typedef {import('./integrations.mjs').LoadedIntegration} LoadedIntegration
 */

/** Stable issue code for an invalid optional agent-doc contribution. */
export const INVALID_AGENT_DOCS = 'invalid_agent_docs';

/** Stable issue code for a `cliCommand` that was ignored as invalid. */
export const INVALID_CLI_COMMAND = 'invalid_cli_command';

/** Stable issue code for a package whose provider ID is already claimed. */
export const DUPLICATE_PROVIDER = 'duplicate_provider';

/** @param {string} code @param {string} message @returns {Issue} */
export function issueError(code, message) {
  return {code, severity: 'error', message};
}

/** @param {string} code @param {string} message @returns {Issue} */
export function issueWarning(code, message) {
  return {code, severity: 'warning', message};
}

/** Issues `issueListed` made: listed in validate's `layout` report only. */
const LISTED = new WeakSet();

/**
 * A layout finding added after the last minor release: validate lists it, in
 * its `layout` report, but it is never an issue, so nothing counts it and
 * `integration check --strict` does not fail on it. A new failing finding
 * joins only in a minor release (architecture:cli-surface INV35).
 * @param {string} code
 * @param {string} message
 * @returns {Issue}
 */
export function issueListed(code, message) {
  const issue = issueWarning(code, message);
  LISTED.add(issue);
  return issue;
}

/**
 * Whether `issueListed` made this issue.
 * @param {Issue} issue
 */
export function isListedIssue(issue) {
  return LISTED.has(issue);
}

/**
 * Report the manifest keys this CLI does not know.
 *
 * A WARNING, deliberately: an integration is published once and installed
 * against many CLI versions, so a key introduced by a later CLI arrives here
 * routinely and means only that this CLI cannot act on it. It used to be fatal
 * — `.strict()` rejected the manifest, and a manifest that fails to parse
 * contributes nothing at all, so one added field took the package's
 * components, templates and codemods down with it on every older consumer
 * (#5119). The fix is upgrading the CLI, which is what the message says.
 *
 * @param {LoadedIntegration} integration
 * @param {Issue[]} issues
 */
function checkUnknownKeys(integration, issues) {
  const keys = integration.__unknownKeys ?? [];
  if (keys.length === 0) return;
  // A key one edit away from a known one is almost always a typo: say so
  // first, since "a newer CLI" sends the author to upgrade for nothing.
  const typos = keys
    .map(key => ({key, known: nearestKnownKey(key)}))
    .filter(each => each.known != null);
  for (const {key, known} of typos) {
    // The manifest object already declares the key it is a near miss of:
    // renaming would give it twice, so the stray key goes. Read from what
    // the manifest says, not the loaded integration, which fills some keys
    // in (providerId from the package name).
    const alreadySet = (integration.__declaredKeys ?? []).includes(
      /** @type {string} */ (known),
    );
    const fix = alreadySet
      ? `Fix: remove "${key}" from ${manifestName(integration)}; it already sets "${known}".`
      : `Fix: rename "${key}" to "${known}" in ${manifestName(integration)}.`;
    issues.push(
      issueWarning(
        'unknown_manifest_key',
        `This CLI does not know the manifest key "${key}", so it is ignored. Did you mean \`${known}\`? ${fix} If it is a key from a newer Astryx CLI instead, upgrading @astryxdesign/cli picks it up.`,
      ),
    );
  }
  const rest = keys.filter(key => !typos.some(each => each.key === key));
  if (rest.length === 0) return;
  issues.push(
    issueWarning(
      'unknown_manifest_key',
      `This CLI does not know the manifest ${rest.length === 1 ? 'key' : 'keys'} ` +
        `${rest.map(key => `"${key}"`).join(', ')}, so ${rest.length === 1 ? 'it is' : 'they are'} ` +
        `ignored — everything else in the manifest still applies. This usually ` +
        `means the integration was published against a newer Astryx CLI than ` +
        `this project resolves; upgrading @astryxdesign/cli picks it up.`,
    ),
  );
}

/** @param {{__manifestFile?: string}} integration */
function manifestName(integration) {
  return integration.__manifestFile
    ? path.basename(integration.__manifestFile)
    : 'the integration manifest';
}

/**
 * The known manifest key `key` is a near miss of: a different letter case, or
 * at most two letters added, dropped or changed (`component`, `doc`,
 * `tempaltes`). Null when no known key is that close, or two are.
 * @param {string} key
 * @returns {string | null}
 */
export function nearestKnownKey(key) {
  const lower = key.toLowerCase();
  const limit = lower.length <= 4 ? 1 : 2;
  /** @type {string[]} */
  const close = [];
  for (const known of KNOWN_INTEGRATION_KEYS) {
    const distance = editDistance(lower, known.toLowerCase());
    if (distance <= limit) close.push(known);
  }
  return close.length === 1 ? close[0] : null;
}

/**
 * Levenshtein distance, with a swap of two neighbours counted as one edit.
 * @param {string} a
 * @param {string} b
 */
function editDistance(a, b) {
  /** @type {number[][]} */
  const d = Array.from({length: a.length + 1}, (_, i) =>
    Array.from({length: b.length + 1}, (_, j) =>
      i === 0 ? j : j === 0 ? i : 0,
    ),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/**
 * Why a declared root cannot be read as a folder, or null when it can.
 * A missing root keeps its own issue; a root that is a file or that the
 * user running astryx cannot read used to surface as a raw errno from
 * whichever check touched it first, or end validation outright.
 * @param {string} root
 * @returns {{kind: 'missing'} | {kind: 'not-a-folder'} | {kind: 'unreadable', code: string} | null}
 */
export function rootProblem(root) {
  let stat;
  try {
    stat = fs.statSync(root);
  } catch (err) {
    const code = /** @type {any} */ (err)?.code;
    return code === 'ENOENT' || code === 'ENOTDIR'
      ? {kind: 'missing'}
      : {kind: 'unreadable', code: String(code ?? 'unknown error')};
  }
  if (!stat.isDirectory()) return {kind: 'not-a-folder'};
  try {
    fs.accessSync(root, fs.constants.R_OK | fs.constants.X_OK);
  } catch (err) {
    return {
      kind: 'unreadable',
      code: String(/** @type {any} */ (err)?.code ?? 'unknown error'),
    };
  }
  return null;
}

/**
 * Verify each declared contribution root is a folder Astryx can read. A
 * declared-but-missing root is a `missing_root` error, a file is an
 * `invalid_root` error, and a folder that cannot be read is an
 * `unreadable_root` error. The contribution checks skip all three.
 * A readable root reached through a symlinked folder is a `symlinked_root`
 * warning: npm pack does not follow it, so the published package loses it.
 * @param {{components?: string, templates?: string, codemods?: string, docs?: string, themes?: string, iconSets?: string, __manifestFile?: string}} resolved
 *   absolute resolved roots (undefined when not declared)
 * @param {Issue[]} issues
 * @param {string} [packageDir] the package the roots belong to
 */
function checkRoots(resolved, issues, packageDir) {
  const kinds = /** @type {const} */ ([
    'components',
    'templates',
    'codemods',
    'docs',
    'themes',
    'iconSets',
  ]);
  for (const kind of kinds) {
    const root = resolved[kind];
    if (root == null) continue;
    const problem = rootProblem(root);
    if (problem == null) {
      const link = packageDir ? symlinkedFolder(root, packageDir) : null;
      if (link && packageDir) {
        const shown = slash(path.relative(packageDir, link.path));
        const realPackage = fs.realpathSync(packageDir);
        const target = slash(path.relative(realPackage, link.target));
        const realRoot = slash(
          path.relative(realPackage, fs.realpathSync(root)),
        );
        const outside = target.startsWith('../') || path.isAbsolute(target);
        const fix = outside
          ? 'replace the link with a real folder holding its files'
          : `replace the link with the folder itself (move ${target}/ to ${shown}/), or set \`${kind}: './${realRoot}'\` in ${manifestName(resolved)}`;
        issues.push(
          issueListed(
            'symlinked_root',
            `Declared ${kind} root "${slash(path.relative(packageDir, root))}" is reached through the symlink "${shown}" (to "${target}"). Astryx follows it locally, but npm pack does not follow a symlinked folder, so the published package ships none of these files. Fix: ${fix}.`,
          ),
        );
      }
      continue;
    }
    if (problem.kind === 'missing') {
      issues.push(
        issueError(
          'missing_root',
          `Declared ${kind} root does not exist on disk: ${root}`,
        ),
      );
    } else if (problem.kind === 'not-a-folder') {
      issues.push(
        issueError(
          'invalid_root',
          `Declared ${kind} root is a file, not a folder: ${root}. Fix: point "${kind}" in the manifest at the folder that holds them.`,
        ),
      );
    } else {
      issues.push(
        issueError(
          'unreadable_root',
          `Declared ${kind} root cannot be read (${problem.code}): ${root}. Fix: make it readable by the user running astryx.`,
        ),
      );
    }
  }
}

/** @param {string} file */
function slash(file) {
  return file.split(path.sep).join('/');
}

/**
 * The first folder on the way from the package to `root` (the root itself
 * included) that is a symlink, with where it points, or null.
 * @param {string} root absolute
 * @param {string} packageDir absolute
 * @returns {{path: string, target: string} | null}
 */
export function symlinkedFolder(root, packageDir) {
  const relative = path.relative(packageDir, root);
  if (
    relative === '' ||
    relative.startsWith('..') ||
    path.isAbsolute(relative)
  ) {
    return null;
  }
  let current = packageDir;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) {
        return {path: current, target: fs.realpathSync(current)};
      }
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Validate the integration's codemods via the landed discovery. Discovery is
 * strict (throws on bad export / duplicate id); we convert any throw into an
 * `invalid_codemod` error.
 * @param {LoadedIntegration} integration loaded-integration-shaped object
 * @param {Issue[]} issues
 */
async function checkCodemods(integration, issues) {
  if (!integration.codemods || rootProblem(integration.codemods)) return;
  const context = integration.__packageDir
    ? createFixContext(integration.__packageDir, integration)
    : null;
  const shared = context && sharedCodemodsRootFix(context);
  for (const entry of fs.readdirSync(integration.codemods, {
    withFileTypes: true,
  })) {
    if (
      entry.isFile() &&
      CODEMOD_FILE_RE.test(entry.name) &&
      !CODEMOD_TEST_RE.test(entry.name) &&
      // The manifest sits beside package.json and is never a codemod.
      !(
        integration.codemods === integration.__packageDir &&
        MANIFEST_BASENAMES.includes(entry.name)
      )
    ) {
      const shown = path
        .relative(
          integration.__packageDir ?? path.dirname(integration.codemods),
          path.join(integration.codemods, entry.name),
        )
        .split(path.sep)
        .join('/');
      const root = path.dirname(shown);
      const full = path.join(integration.codemods, entry.name);
      const stamp =
        context &&
        (DOC_CANDIDATE_RE.test(entry.name) ||
          TEMPLATE_CANDIDATE_RE.test(entry.name))
          ? stampOf(context, full)
          : null;
      // A theme's entry module may sit beside its descriptor.
      const themeDoc = ['.doc.mjs', '.doc.ts', '.doc.js']
        .map(suffix => full.replace(/\.(?:ts|mjs|js)$/u, suffix))
        .find(candidate => candidate !== full && fs.existsSync(candidate));
      const themeStamp =
        context && !stamp && themeDoc ? stampOf(context, themeDoc) : null;
      let fix = `Fix: move it into the folder named for the version it migrates to, for example ${root}/1.2.0/${entry.name}.`;
      if (shared) fix = sharedCodemodsRootFix(context, entry.name) ?? fix;
      else if (context && stamp) fix = notACodemodFix(context, full, stamp);
      else if (context && themeDoc && themeStamp?.type === 'theme') {
        fix = notACodemodFix(context, themeDoc, themeStamp, entry.name);
      } else if (context) {
        const owner = themeImporting(context, full);
        if (owner) {
          fix = notACodemodFix(
            context,
            owner.doc,
            owner.stamp,
            owner.source,
            entry.name,
          );
        }
      }
      issues.push(
        issueWarning(
          'codemod_outside_version',
          `Codemod file "${shown}" is outside a version folder, so upgrade will never load it. ${fix}`,
        ),
      );
    }
    if (
      entry.isDirectory() &&
      !CODEMOD_SKIP_DIRS.has(entry.name) &&
      !isValidSemver(entry.name)
    ) {
      const fix =
        shared ??
        (context &&
          heldRootFix(context, path.join(integration.codemods, entry.name))) ??
        'Fix: rename it to the exact version its codemods migrate to.';
      issues.push(
        issueError(
          'invalid_codemod_version',
          `Codemod folder "${entry.name}" is not an exact semver version such as 1.2.0. ${fix}`,
        ),
      );
    }
  }
  try {
    await discoverIntegrationCodemods([integration]);
  } catch (err) {
    issues.push(
      issueError('invalid_codemod', /** @type {any} */ (err).message),
    );
  }
}

/**
 * Validate the integration's templates via the landed discovery. Per-template
 * problems are reported as `invalid_template` errors.
 * @param {LoadedIntegration} integration loaded-integration-shaped object
 * @param {Issue[]} issues
 */
async function checkTemplates(integration, issues) {
  if (!integration.templates || rootProblem(integration.templates)) return;
  try {
    const {errors} = await discoverIntegrationTemplatesForOne(integration);
    for (const e of errors) {
      issues.push({
        code: e.code ?? 'invalid_template',
        severity: e.severity ?? 'error',
        message: e.message,
      });
    }
  } catch (err) {
    issues.push(
      issueError('invalid_template', /** @type {any} */ (err).message),
    );
  }
  checkTemplateSourcesWithoutDoc(integration, issues);
}

/**
 * The component names each of a package's templates gives in `exampleFor`
 * and `componentsUsed`, judged against the components `astryx component`
 * finds: the package's own, and every doc it resolves in Core. A name the
 * template imports needs no doc of its own. A name neither has is an
 * `unknown_block_component` finding, since the template list and the
 * block's search keywords then give a name no one can look up. A name the
 * template may reach through anything the walk does not model, and, without
 * Core installed, a name the package does not have, cannot be judged and is
 * listed in `unchecked` instead.
 * @param {LoadedIntegration} integration
 * @returns {Promise<{findings: Array<{docPath: string, name: string, message: string}>, unchecked: Array<{docPath: string, name: string, reason: string}>}>}
 */
async function judgeBlockComponents(integration) {
  /** @type {Array<{docPath: string, name: string, message: string}>} */
  const findings = [];
  /** @type {Array<{docPath: string, name: string, reason: string}>} */
  const unchecked = [];
  const root = integration.templates;
  if (!root || rootProblem(root)) return {findings, unchecked};
  let templates;
  try {
    ({templates} = await discoverIntegrationTemplatesForOne(integration));
  } catch {
    return {findings, unchecked};
  }
  /** @type {Set<string>} */
  let own;
  try {
    own = new Set(
      componentDiscovery
        .discoverIntegrationComponents(integration)
        .map(record => record.name),
    );
  } catch {
    return {findings, unchecked};
  }
  // The Core installed beside the package, never the one the CLI carries:
  // a name is judged against the Core the package's users install.
  const coreDir = findProjectCoreDir(integration.__packageDir ?? root);
  /** @type {Map<string, boolean>} */
  const inCore = new Map();
  /** @param {string} name */
  const coreHas = name => {
    if (!coreDir) return false;
    if (!inCore.has(name)) {
      let found;
      try {
        found = componentDiscovery.findComponentReadme(coreDir, name) != null;
      } catch {
        found = false;
      }
      inCore.set(name, found);
    }
    return /** @type {boolean} */ (inCore.get(name));
  };
  for (const template of templates) {
    const fields = [
      ...(typeof template.exampleFor === 'string'
        ? [{field: 'exampleFor', name: template.exampleFor}]
        : []),
      ...(Array.isArray(template.componentsUsed) ? template.componentsUsed : [])
        .filter(name => typeof name === 'string')
        .map(name => ({field: 'componentsUsed', name})),
    ];
    if (fields.length === 0) continue;
    const imported = importedNames(template.filePath, integration);
    for (const {field, name} of fields) {
      if (own.has(name) || imported.names.has(name)) continue;
      if (coreHas(name)) continue;
      // A name the template may reach through a namespace import, or
      // through a local module this read could not follow, is not judged.
      if (imported.unread.length > 0) {
        unchecked.push({
          docPath: template.docPath,
          name,
          reason: imported.unread[0],
        });
        continue;
      }
      if (!coreDir) {
        unchecked.push({
          docPath: template.docPath,
          name,
          reason:
            'Core is not installed, so its component names cannot be checked.',
        });
        continue;
      }
      findings.push({
        docPath: template.docPath,
        name,
        message: `Template "${template.dirName}" names "${name}" in ${field}, but neither this package nor Core has a component by that name and the template does not import it, so \`astryx template --list\` and the block's search keywords give a component name no one can look up. Fix: use the component's exact name, or remove "${name}" from ${field}.`,
      });
    }
  }
  return {findings, unchecked};
}

/**
 * Visit every node under `node`, depth first.
 * @param {any} node
 * @param {(node: any) => void} visit
 */
function walkNodes(node, visit) {
  if (node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const each of node) walkNodes(each, visit);
    return;
  }
  if (typeof node.type === 'string') visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (
      key === 'loc' ||
      key === 'start' ||
      key === 'end' ||
      key === 'extra' ||
      key === 'leadingComments' ||
      key === 'trailingComments'
    ) {
      continue;
    }
    if (value && typeof value === 'object') walkNodes(value, visit);
  }
}

/** The extensions a local import may leave off, in the order tried. */
const LOCAL_MODULE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js', '.mjs'];

/**
 * Libraries that render no component of this package or of Core: React's
 * own exports and StyleX. Importing them, even as a namespace
 * (`import * as stylex`), leaves no name unjudged.
 */
const RENDERLESS_SOURCES = ['react', 'react-dom', '@stylexjs/stylex'];

/**
 * Packages a template may import from without leaving its names unjudged:
 * Core and the renderless libraries. Any other package may render components
 * this check does not see, such as a grid that renders its cards.
 */
const KNOWN_SOURCES = ['@astryxdesign/core', ...RENDERLESS_SOURCES];

/** @param {string} source */
function renderlessSource(source) {
  return RENDERLESS_SOURCES.some(
    known => source === known || source.startsWith(`${known}/`),
  );
}

/**
 * Whether an import source is one whose components this check sees: Core, a
 * library that renders none, or a relative helper (followed and read in full
 * on its own). The package's own name is followed like a helper too.
 * @param {string} source
 */
function knownSource(source) {
  if (source.startsWith('.')) return true;
  return KNOWN_SOURCES.some(
    known => source === known || source.startsWith(`${known}/`),
  );
}

/**
 * Every name a template imports, as imported and as bound locally, read
 * without running it, with the names its local helper modules import (a
 * relative import or re-export is followed, so a barrel such as
 * `parts/index.ts` counts). A name is judged only where the template reaches
 * components solely through named imports and re-exports this walk reads:
 * `unread` gives the reason for anything else it meets, which leaves an
 * unresolved name unjudged. That covers a default or namespace import, an
 * alias of an imported binding, a member read off one (in JSX or not,
 * optional or computed), a rendered component it cannot trace to an import,
 * `require()`, a dynamic `import()`, an `export *` from another package, and
 * a local module it cannot read. So does any `default` binding (`import X`,
 * `{default as X}`, `export {default as X} from`) and any import from a
 * package other than Core or a library that renders no component (see
 * KNOWN_SOURCES). An import of the package's own name is followed like a
 * relative helper, through its package.json `exports`. Type-only imports
 * render nothing and are skipped, as is a namespace or default import of a
 * library that renders no component.
 * @param {string} file
 * @param {LoadedIntegration} integration
 * @returns {{names: Set<string>, unread: string[]}}
 */
function importedNames(file, integration) {
  const packageName = integration.name;
  /** @type {Set<string>} */
  const names = new Set();
  /** @type {string[]} */
  const unread = [];
  const top = path.dirname(file);
  const shownTop = path.basename(file);
  /** @type {Set<string>} */
  const seen = new Set();
  /** @param {string} current */
  const visit = current => {
    if (seen.has(current)) return;
    seen.add(current);
    const shown = slash(path.relative(top, current)) || shownTop;
    let ast;
    try {
      ast = parseModule(fs.readFileSync(current, 'utf8'), {
        sourceType: 'module',
        plugins: ['typescript', 'jsx'],
        errorRecovery: true,
      });
    } catch {
      unread.push(
        `${shown} could not be read, so the components it renders are not known.`,
      );
      return;
    }
    // A file that parses only with errors recovered may be missing parts.
    if (/** @type {any} */ (ast).errors?.length > 0) {
      unread.push(
        `${shown} does not parse cleanly, so the components it renders are not known.`,
      );
    }
    /** @type {Map<string, string>} local binding -> the module it came from */
    const bindings = new Map();
    for (const node of ast.program.body) {
      const reexport =
        (node.type === 'ExportNamedDeclaration' && node.source != null) ||
        node.type === 'ExportAllDeclaration';
      if (node.type !== 'ImportDeclaration' && !reexport) continue;
      // A type-only import or re-export renders nothing.
      if (
        /** @type {any} */ (node).importKind === 'type' ||
        /** @type {any} */ (node).exportKind === 'type'
      ) {
        continue;
      }
      const source = String(/** @type {any} */ (node).source.value);
      // The package's own name: read like a relative helper, below.
      const own =
        typeof packageName === 'string' &&
        packageName !== '' &&
        (source === packageName || source.startsWith(`${packageName}/`));
      if (!own && !knownSource(source)) {
        unread.push(
          `${shown} imports from "${source}", another package whose components may render ones this check does not see.`,
        );
      }
      if (node.type === 'ImportDeclaration') {
        for (const specifier of node.specifiers) {
          if (/** @type {any} */ (specifier).importKind === 'type') continue;
          if (specifier.type === 'ImportNamespaceSpecifier') {
            // `import * as stylex`: a library that renders no component.
            if (renderlessSource(source)) continue;
            unread.push(
              `${shown} imports "${source}" as a namespace (${specifier.local.name}), whose component names this check does not read.`,
            );
            continue;
          }
          if (
            specifier.type === 'ImportDefaultSpecifier' &&
            !renderlessSource(source)
          ) {
            // A default may be any component, under any name.
            unread.push(
              `${shown} imports the default of "${source}" as ${specifier.local.name}, which may be any component.`,
            );
          }
          names.add(specifier.local.name);
          bindings.set(specifier.local.name, source);
          if (specifier.type === 'ImportSpecifier') {
            const imported = specifier.imported;
            const importedName =
              imported.type === 'Identifier' ? imported.name : imported.value;
            if (importedName === 'default') {
              unread.push(
                `${shown} imports the default of "${source}" as ${specifier.local.name}, which may be any component.`,
              );
            } else {
              names.add(importedName);
            }
          }
        }
      } else if (node.type === 'ExportNamedDeclaration') {
        // A barrel: `export {Body} from './Body'` passes Body on, and what
        // Body renders comes from the module it names.
        for (const each of node.specifiers) {
          const specifier = /** @type {any} */ (each);
          if (specifier.exportKind === 'type') continue;
          if (specifier.type !== 'ExportSpecifier') {
            // `export * as UI from`, `export UI from`.
            unread.push(
              `${shown} re-exports "${source}" as a whole (${specifier.exported.type === 'Identifier' ? specifier.exported.name : specifier.exported.value}), whose component names this check does not read.`,
            );
            continue;
          }
          const local =
            specifier.local.type === 'Identifier'
              ? specifier.local.name
              : specifier.local.value;
          const exported =
            specifier.exported.type === 'Identifier'
              ? specifier.exported.name
              : specifier.exported.value;
          if (local === 'default') {
            unread.push(
              `${shown} re-exports the default of "${source}" as ${exported}, which may be any component.`,
            );
          } else {
            names.add(local);
          }
          names.add(exported);
        }
      } else if (!source.startsWith('.') && !own) {
        // `export * from` another package passes on names this check
        // does not list.
        unread.push(
          `${shown} re-exports everything from "${source}", whose component names this check does not read.`,
        );
        continue;
      } else if (/** @type {any} */ (node).exported) {
        // `export * as UI from './parts'`.
        unread.push(
          `${shown} re-exports "${source}" as a whole, whose component names this check does not read.`,
        );
      }
      if (!source.startsWith('.') && !own) continue;
      if (own) {
        const resolved = componentDiscovery.ownPackageModule(
          integration,
          source,
        );
        /** @type {boolean} */
        let isFile;
        try {
          isFile = resolved != null && fs.statSync(resolved).isFile();
        } catch {
          isFile = false;
        }
        if (
          resolved &&
          isFile &&
          LOCAL_MODULE_EXTENSIONS.includes(path.extname(resolved))
        ) {
          visit(resolved);
        } else {
          unread.push(
            `${shown} imports "${source}", this package's own name, which resolves to no source this check can read.`,
          );
        }
        continue;
      }
      const base = path.resolve(path.dirname(current), source);
      const target = [
        base,
        ...LOCAL_MODULE_EXTENSIONS.map(extension => `${base}${extension}`),
        ...LOCAL_MODULE_EXTENSIONS.map(extension =>
          path.join(base, `index${extension}`),
        ),
      ].find(candidate => {
        try {
          return fs.statSync(candidate).isFile();
        } catch {
          return false;
        }
      });
      if (!target) {
        unread.push(
          `${shown} imports "${source}", which resolves to no file this check can read.`,
        );
      } else if (LOCAL_MODULE_EXTENSIONS.includes(path.extname(target))) {
        visit(target);
      }
    }
    // Anything this check does not model leaves the names unjudged: what
    // the module renders through a binding, an alias, a member read, a
    // component held in a variable, or a module loaded at runtime.
    /** @type {Set<string>} functions and classes the module declares */
    const declared = new Set();
    walkNodes(ast.program, node => {
      if (
        (node.type === 'FunctionDeclaration' ||
          node.type === 'ClassDeclaration') &&
        node.id?.name
      ) {
        declared.add(node.id.name);
      } else if (
        node.type === 'VariableDeclarator' &&
        node.id?.type === 'Identifier' &&
        [
          'ArrowFunctionExpression',
          'FunctionExpression',
          'ClassExpression',
        ].includes(node.init?.type)
      ) {
        declared.add(node.id.name);
      }
    });
    const from = (/** @type {string} */ name) =>
      bindings.has(name) ? ` (imported from "${bindings.get(name)}")` : '';
    walkNodes(ast.program, node => {
      if (node.type === 'JSXMemberExpression') {
        let object = node.object;
        while (object?.type === 'JSXMemberExpression') object = object.object;
        const name = object?.name ?? 'an object';
        unread.push(
          `${shown} renders members of ${name}${from(name)}, whose names this check does not read.`,
        );
      } else if (
        node.type === 'JSXOpeningElement' &&
        node.name?.type === 'JSXIdentifier' &&
        /^[A-Z]/u.test(node.name.name) &&
        !names.has(node.name.name) &&
        !declared.has(node.name.name)
      ) {
        unread.push(
          `${shown} renders ${node.name.name}, a value this check does not trace to an import.`,
        );
      } else if (
        node.type === 'VariableDeclarator' &&
        node.init?.type === 'Identifier' &&
        bindings.has(node.init.name)
      ) {
        // `const UI = Lib`, `const {Panel} = Lib`: an alias of an import.
        if (node.id?.type === 'Identifier') {
          bindings.set(
            node.id.name,
            /** @type {string} */ (bindings.get(node.init.name)),
          );
        }
        unread.push(
          `${shown} reads ${node.init.name}${from(node.init.name)} into another name, which this check does not follow.`,
        );
      } else if (
        (node.type === 'MemberExpression' ||
          node.type === 'OptionalMemberExpression') &&
        node.object?.type === 'Identifier' &&
        bindings.has(node.object.name)
      ) {
        // `UI.Panel`, `UI?.Panel`, `UI['Panel']`, `createElement(UI.Panel)`.
        unread.push(
          `${shown} reads members of ${node.object.name}${from(node.object.name)}, whose names this check does not read.`,
        );
      } else if (
        node.type === 'CallExpression' &&
        node.callee?.type === 'Identifier' &&
        node.callee.name === 'require'
      ) {
        const argument = node.arguments?.[0];
        const spec =
          argument?.type === 'StringLiteral'
            ? `"${argument.value}"`
            : 'a module';
        unread.push(
          `${shown} loads ${spec} with require(), whose component names this check does not read.`,
        );
      } else if (
        node.type === 'ImportExpression' ||
        (node.type === 'CallExpression' && node.callee?.type === 'Import')
      ) {
        const argument = node.source ?? node.arguments?.[0];
        const spec =
          argument?.type === 'StringLiteral'
            ? `"${argument.value}"`
            : 'a module';
        unread.push(
          `${shown} loads ${spec} with a dynamic import(), whose component names this check does not read.`,
        );
      }
    });
  };
  visit(file);
  return {names, unread};
}

/**
 * The local name a module's default export declares (`export default
 * function AcmeWidget()`, `export default class AcmeWidget`), or of the
 * binding it exports as default (`export default AcmeWidget`), or null.
 * @param {string} file
 * @returns {string | null}
 */
function defaultBinding(file) {
  let ast;
  try {
    ast = parseModule(fs.readFileSync(file, 'utf8'), {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
      errorRecovery: true,
    });
  } catch {
    return null;
  }
  for (const node of ast.program.body) {
    if (node.type !== 'ExportDefaultDeclaration') continue;
    const declaration = /** @type {any} */ (node.declaration);
    if (typeof declaration?.id?.name === 'string') return declaration.id.name;
    if (declaration?.type === 'Identifier') return declaration.name;
  }
  return null;
}

/**
 * A note: information beside validate's issues that fails nothing, with the
 * fix in its message.
 * @typedef {{code: string, message: string}} Note
 */

/**
 * @param {string} code
 * @param {{message: string}} finding
 * @returns {Note}
 */
function note(code, finding) {
  return {code, message: finding.message};
}

/**
 * The block component names this check could not judge, shaped like the
 * doc type report so `integration check` counts them as not compared: each
 * name a template gives in `exampleFor` or `componentsUsed` that neither the
 * package nor Core has, when the template reaches components through
 * anything but named imports and re-exports from the package, Core, or
 * helpers read in full (see importedNames), or when Core is not installed to
 * look it up in; its findings are always empty. A name judged unknown is an
 * `unknown_block_component` note, with its fix in the message: validate
 * lists notes beside its issues, and nothing counts them, so `--strict` does
 * not fail on it until the next minor release (architecture:cli-surface
 * INV35).
 * @param {LoadedIntegration} integration
 * @returns {Promise<{report: {status: 'checked', findings: [], unchecked: Array<{file: string, name: string, reason: string}>}, notes: Note[]}>}
 */
export async function blockComponentsCheck(integration) {
  const {findings, unchecked} = await judgeBlockComponents(integration);
  const base = integration.__packageDir ?? integration.templates ?? '';
  return {
    report: {
      status: 'checked',
      findings: [],
      unchecked: unchecked.map(entry => ({
        file: slash(path.relative(base, entry.docPath)),
        name: entry.name,
        reason: entry.reason,
      })),
    },
    notes: findings.map(entry => note('unknown_block_component', entry)),
  };
}

/** A package's own template category: `"<Group> - <Variant>"`. */
/**
 * A category written as a path, such as `components/Button`: a slash with no
 * " - " between a group and a variant. Single words (`Settings`) and
 * `"<Group> - <Variant>"` (`Table - Index/Detail`) are fine.
 */
// A category written as a path: lowercase first segment and no spaces
// (`components/X`, `blocks/forms`), not a name with a slash in it (`UI/UX`,
// `A/B Testing`).
const PATH_CATEGORY = /^[a-z0-9][\w.-]*(?:\/[\w.-]+)+$/u;

/** Imports a browser cannot load, which a showcase must not make. */
const SERVER_ONLY_IMPORTS =
  /^(?:server-only|next\/headers|next\/server|next\/cache|node:.+)$/u;

/**
 * Every spelling a glob's `{a,b}` braces stand for, nested braces included.
 * @param {string} pattern
 * @returns {string[]}
 */
function expandBraces(pattern) {
  let depth = 0;
  let open = -1;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '\\') {
      i++;
    } else if (ch === '{') {
      if (depth++ === 0) open = i;
    } else if (ch === '}' && depth > 0 && --depth === 0) {
      const body = pattern.slice(open + 1, i);
      /** @type {string[]} */
      const parts = [];
      let level = 0;
      let from = 0;
      for (let j = 0; j < body.length; j++) {
        if (body[j] === '{') level++;
        else if (body[j] === '}') level--;
        else if (body[j] === ',' && level === 0) {
          parts.push(body.slice(from, j));
          from = j + 1;
        }
      }
      parts.push(body.slice(from));
      if (parts.length < 2) continue;
      const head = pattern.slice(0, open);
      const tail = pattern.slice(i + 1);
      return parts.flatMap(part => expandBraces(head + part + tail));
    }
  }
  return [pattern];
}

/**
 * One brace-free glob as a regular expression source: `**`, `*`, `?` and
 * `[…]` classes (`[!…]` negated), as npm's `files` matching reads them.
 * @param {string} pattern
 */
function globSource(pattern) {
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        const slashAfter = pattern[i + 2] === '/';
        const atStart = i === 0 || pattern[i - 1] === '/';
        if (atStart && slashAfter) {
          out += '(?:.*/)?';
          i += 2;
        } else if (atStart && i + 2 === pattern.length) {
          out = out.replace(/\/$/u, '') + '(?:/.*)?';
          i += 1;
        } else {
          out += '.*';
          i += 1;
        }
      } else {
        out += '[^/]*';
      }
    } else if (ch === '?') {
      out += '[^/]';
    } else if (ch === '[') {
      const close = pattern.indexOf(']', i + 2);
      if (close === -1) {
        out += '\\[';
      } else {
        let body = pattern.slice(i + 1, close);
        const negated = body.startsWith('!') || body.startsWith('^');
        if (negated) body = body.slice(1);
        out += `[${negated ? '^' : ''}${body.replace(/[\\\]]/gu, '\\$&')}]`;
        i = close;
      }
    } else if (ch === '\\' && i + 1 < pattern.length) {
      out += pattern[++i].replace(/[.+^${}()|[\]\\*?/]/gu, '\\$&');
    } else {
      out += ch.replace(/[.+^${}()|[\]\\]/gu, '\\$&');
    }
  }
  return out;
}

/**
 * The paths npm packs for the package in `base`, read from
 * `npm pack --dry-run --json --ignore-scripts` (nothing runs, nothing is
 * written), started the way the CLI starts npm everywhere else, or why npm
 * could not answer.
 * @param {string} base
 * @returns {{paths: Set<string>} | {error: string}}
 */
function npmPackedPaths(base) {
  let npm;
  try {
    npm = npmCommand();
  } catch {
    return {error: 'npm was not found'};
  }
  const result = spawnSync(
    npm.command,
    [
      ...npm.prefix,
      'pack',
      '--dry-run',
      '--json',
      '--ignore-scripts',
      '--silent',
    ],
    {
      cwd: base,
      encoding: 'utf-8',
      shell: false,
      timeout: 60_000,
      // One line per packed file: room for a very large package.
      maxBuffer: 256 * 1024 * 1024,
    },
  );
  if (result.error) return {error: `npm did not run (${result.error.message})`};
  if (result.status !== 0) {
    let code = '';
    try {
      code = JSON.parse(result.stdout)?.error?.code ?? '';
    } catch {
      // not JSON
    }
    return {
      error: `npm pack failed${code ? ` (${code})` : ` with exit ${result.status}`}`,
    };
  }
  try {
    const [info] = JSON.parse(result.stdout);
    if (Array.isArray(info?.files)) {
      return {
        paths: new Set(
          info.files.map((/** @type {{path: string}} */ f) => f.path),
        ),
      };
    }
  } catch {
    // fall through
  }
  return {error: 'npm pack printed no file list'};
}

/**
 * The ignore files npm reads for one path in a package with no `files`
 * field: in the root and each folder down to the path's own, `.npmignore`,
 * or `.gitignore` where that folder has none. Root first, each relative to
 * the package root.
 * @param {string} base
 * @param {string} rel POSIX, relative to the package root
 * @returns {string[]}
 */
function ignoreFilesFor(base, rel) {
  /** @type {string[]} */
  const found = [];
  const folders = rel.split('/').slice(0, -1);
  for (let depth = 0; depth <= folders.length; depth++) {
    const folder = folders.slice(0, depth).join('/');
    const file = ['.npmignore', '.gitignore'].find(name =>
      fs.existsSync(path.join(base, folder, name)),
    );
    if (file) found.push(folder ? `${folder}/${file}` : file);
  }
  return found;
}

/**
 * The note for an asset a package with no `files` field leaves out through
 * an ignore file, naming the line that drops it, never a `files` field,
 * which would leave out everything else. The deepest file with a matching
 * line is named; an entry is read relative to its own folder.
 * @param {string} base
 * @param {string} template
 * @param {string} asset
 * @param {boolean} [nestedOnly] with a `files` field npm skips the root's
 *   ignore file but still reads those in folders below it
 */
function ignoreFix(base, template, asset, nestedOnly = false) {
  const files = ignoreFilesFor(base, asset).filter(
    file => !nestedOnly || file.includes('/'),
  );
  for (const file of [...files].reverse()) {
    const folder = path.posix.dirname(file);
    const within = folder === '.' ? asset : asset.slice(folder.length + 1);
    /** @type {string[]} */
    let lines;
    try {
      lines = fs.readFileSync(path.join(base, file), 'utf8').split(/\r?\n/);
    } catch {
      continue;
    }
    const line = lines.find(
      entry =>
        entry.trim() !== '' &&
        !entry.trim().startsWith('#') &&
        !entry.trim().startsWith('!') &&
        !outsideFiles(within, [entry.trim()]),
    );
    if (line) {
      return `${template}: loads ${asset}, which npm leaves out of the package because ${file} drops it, so the template breaks once installed. Fix: remove or narrow the line \`${line.trim()}\` in ${file}, and confirm with \`npm pack --dry-run\`.`;
    }
  }
  const file = files.at(-1) ?? '.npmignore';
  return `${template}: loads ${asset}, which npm leaves out of the package because an ignore file drops it, so the template breaks once installed. Fix: remove the line in ${file} (or another ignore file on its path) that matches ${asset}, and confirm with \`npm pack --dry-run\`.`;
}

/**
 * Whether no `files` entry can reach a path, read case-insensitively and
 * generously (`{a,b}` braces, globs, a no-slash entry at any depth, an entry
 * for the path or any folder above it), for when npm cannot say what it
 * packs: a path this misses is out of the package however npm reads the list.
 * @param {string} rel POSIX, relative to the package root
 * @param {unknown} files
 */
export function outsideFiles(rel, files) {
  if (!Array.isArray(files)) return false;
  const parts = rel.split('/');
  const paths = parts.map((_, i) => parts.slice(0, i + 1).join('/'));
  return !files.some(entry => {
    if (typeof entry !== 'string' || entry.startsWith('!')) return false;
    const trimmed = entry
      .replace(/^\.?\//u, '')
      .replace(/\/+$/u, '')
      .replace(/\/\*$/u, '/**');
    return expandBraces(trimmed).some(spelling => {
      const pattern = new RegExp(`^${globSource(spelling)}$`, 'iu');
      return spelling.includes('/') || /^\.?\//u.test(entry)
        ? paths.some(at => pattern.test(at))
        : parts.some(name => pattern.test(name));
    });
  });
}

/**
 * The `!` entry of a `files` field that leaves out `rel` or a folder above
 * it, as written; null when none does.
 * @param {string} rel package-relative path
 * @param {unknown} files the `files` field
 * @returns {string | null}
 */
export function negatedFilesEntry(rel, files) {
  if (!Array.isArray(files)) return null;
  const parts = rel.split('/');
  const paths = parts.map((_, i) => parts.slice(0, i + 1).join('/'));
  for (const entry of files) {
    if (typeof entry !== 'string' || !entry.startsWith('!')) continue;
    const trimmed = entry
      .slice(1)
      .replace(/^\.?\//u, '')
      .replace(/\/+$/u, '')
      .replace(/\/\*$/u, '/**');
    const hit = expandBraces(trimmed).some(spelling => {
      const pattern = new RegExp(`^${globSource(spelling)}$`, 'iu');
      return spelling.includes('/') || /^!\.?\//u.test(entry)
        ? paths.some(at => pattern.test(at))
        : parts.some(name => pattern.test(name));
    });
    if (hit) return entry;
  }
  return null;
}

/**
 * The path a `new URL()` argument spells out: a string, or a template
 * literal with no expressions. Anything computed is not read.
 * @param {any} node
 * @returns {string | null}
 */
function literalPath(node) {
  if (node?.type === 'StringLiteral') return node.value;
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0]?.value?.cooked ?? null;
  }
  return null;
}

/**
 * A template module, parsed, so strings, JSX text, comments and type-only
 * imports and exports never count. `server` is what a browser cannot run: an
 * import, re-export or `require()` of a server-only module or an uninstalled
 * Node builtin, a read of `process.env` other than `process.env.NODE_ENV`
 * (which bundlers replace). `assets` are the relative paths it loads with `new URL('./x', import.meta.url)`. A module
 * that does not parse reports nothing; the template check owns that.
 * @param {string} source
 * @param {Set<string>} builtins
 * @returns {{server: string[], assets: string[]}}
 */
function readModule(source, builtins) {
  /** @type {any} */
  let ast;
  try {
    ast = parseModule(source, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
      errorRecovery: true,
    });
  } catch {
    return {server: [], assets: []};
  }
  /** @type {string[]} */
  const assets = [];
  /** @type {string[]} */
  const found = [];
  /** @param {unknown} spec */
  const checkSpec = spec => {
    if (
      typeof spec === 'string' &&
      (SERVER_ONLY_IMPORTS.test(spec) || builtins.has(spec))
    ) {
      found.push(`imports '${spec}'`);
    }
  };
  /** @param {any} node */
  const visit = node => {
    if (!node || typeof node.type !== 'string') return;
    switch (node.type) {
      case 'ImportDeclaration':
        if (
          node.importKind !== 'type' &&
          !(
            node.specifiers.length > 0 &&
            node.specifiers.every(
              (/** @type {any} */ s) => s.importKind === 'type',
            )
          )
        ) {
          checkSpec(node.source.value);
        }
        return;
      case 'ExportNamedDeclaration':
      case 'ExportAllDeclaration':
        if (
          node.source &&
          node.exportKind !== 'type' &&
          !(
            node.specifiers?.length > 0 &&
            node.specifiers.every(
              (/** @type {any} */ s) => s.exportKind === 'type',
            )
          )
        ) {
          checkSpec(node.source.value);
        }
        break;
      case 'CallExpression':
        if (
          (node.callee.type === 'Identifier' &&
            node.callee.name === 'require') ||
          node.callee.type === 'Import'
        ) {
          checkSpec(node.arguments[0]?.value);
        }
        break;
      case 'ImportExpression':
        checkSpec(node.source?.value);
        break;
      case 'NewExpression': {
        const [first, second] = node.arguments ?? [];
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'URL' &&
          literalPath(first) != null &&
          /^\.{1,2}\//u.test(/** @type {string} */ (literalPath(first))) &&
          second?.type === 'MemberExpression' &&
          second.object?.type === 'MetaProperty' &&
          second.object.meta?.name === 'import' &&
          second.object.property?.name === 'meta' &&
          !second.computed &&
          second.property?.name === 'url'
        ) {
          assets.push(/** @type {string} */ (literalPath(first)));
        }
        break;
      }
      case 'MemberExpression': {
        const object = node.object;
        if (
          object.type === 'Identifier' &&
          object.name === 'process' &&
          !node.computed &&
          node.property.name === 'env'
        ) {
          found.push('reads process.env');
          return;
        }
        if (
          object.type === 'MemberExpression' &&
          object.object.type === 'Identifier' &&
          object.object.name === 'process' &&
          !object.computed &&
          object.property.name === 'env'
        ) {
          if (!node.computed && node.property.name === 'NODE_ENV') return;
          found.push('reads process.env');
          return;
        }
        break;
      }
      default:
        break;
    }
    for (const key of Object.keys(node)) {
      if (
        key === 'loc' ||
        key === 'start' ||
        key === 'end' ||
        key === 'leadingComments' ||
        key === 'trailingComments' ||
        key === 'innerComments'
      ) {
        continue;
      }
      const value = node[key];
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  };
  visit(ast.program);
  return {server: found, assets};
}

/**
 * What a package's examples need to work everywhere they are shown: template
 * lists, docs pages and catalog cards, which render each block alone from
 * the packed package. Four `next` notes, each with a fix to paste
 * (architecture:cli-surface INV35, DEC-11):
 * - `component_without_example`: a published component no block template
 *   shows, as its `exampleFor` with `isShowcase: true` (or in
 *   `alsoShowcaseFor`). A block named like a showcase that sets neither is a
 *   standalone block and does not count. Exempt, because an example cannot
 *   fix them: a hidden doc (`hidden: true`), a member of a family (its
 *   family's example covers it), a doc kept off the overview
 *   (`isHiddenFromOverview: true`, for parts that only make sense inside a
 *   parent), and a `Utility` component (providers and context).
 * - `template_category`: a template `category` written as a path, such as
 *   `components/X`, with a `"<Group> - <Variant>"` one to write.
 * - `showcase_not_standalone`: a showcase that imports what a browser cannot
 *   load (`server-only`, `next/headers`, `next/server`, `next/cache`, a Node
 *   built-in) or reads `process.env` past `NODE_ENV`. Type-only imports and
 *   comments don't count, and live data is fine: a showcase may fetch
 *   through the app. Only the showcase's own file is read.
 * - `template_asset_not_packed`: a file a template loads with `new URL(…,
 *   import.meta.url)` that does not exist, or that npm leaves out of the
 *   package (`npm pack --dry-run`). When npm cannot answer, an asset no
 *   `files` entry can reach is still a note, and any other is returned in
 *   `unchecked`.
 * @param {LoadedIntegration} integration
 * @returns {Promise<{notes: Note[], unchecked: Array<{file: string, asset: string, reason: string}>}>}
 */
export async function componentExamplesCheck(integration) {
  /** @type {Note[]} */
  const notes = [];
  const base = integration.__packageDir ?? integration.components ?? '';
  const root = integration.templates;
  /** @type {any[]} */
  let templates = [];
  if (root && !rootProblem(root)) {
    try {
      ({templates} = await discoverIntegrationTemplatesForOne(integration));
    } catch {
      // Templates that cannot be read are reported by the template check.
      return {notes, unchecked: []};
    }
  }
  const rel = (/** @type {string} */ file) => slash(path.relative(base, file));
  /** @type {unknown} */
  let packedFiles;
  /** @type {Set<string>} */
  const declared = new Set();
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(base, 'package.json'), 'utf8'),
    );
    packedFiles = pkg.files;
    for (const field of [
      'dependencies',
      'peerDependencies',
      'optionalDependencies',
      'devDependencies',
    ]) {
      for (const name of Object.keys(pkg[field] ?? {})) declared.add(name);
    }
  } catch {
    packedFiles = undefined;
  }
  /** @type {{paths: Set<string>} | {error: string} | undefined} what npm packs, read once */
  let packed;
  /** @type {Array<{file: string, asset: string, reason: string}>} */
  const unchecked = [];
  // A bare builtin name the package installs from npm (`buffer`, `events`)
  // is that package, which bundlers ship to the browser.
  const builtins = new Set(builtinModules.filter(name => !declared.has(name)));
  /** @type {Set<string>} */
  const shown = new Set();
  for (const template of templates) {
    const docFile = rel(template.docPath ?? template.filePath);
    if (template.type === 'block') {
      if (typeof template.exampleFor === 'string' && template.isShowcase) {
        shown.add(template.exampleFor);
      }
      for (const name of template.alsoShowcaseFor ?? []) shown.add(name);
    }
    if (
      typeof template.category === 'string' &&
      template.category !== '' &&
      PATH_CATEGORY.test(template.category)
    ) {
      const [group, ...rest] = template.category.split('/');
      const variant =
        rest.join(' ').trim() || template.displayName || template.id;
      const suggested = `${group.charAt(0).toUpperCase()}${group.slice(1)} - ${variant}`;
      notes.push({
        code: 'template_category',
        message: `${docFile}: category '${template.category}' reads as a file path, and \`astryx template\` lists templates under their category as written. Fix: category: '${suggested}', a "<Group> - <Variant>" name.`,
      });
    }
    /** @type {string} */
    let source;
    try {
      source = fs.readFileSync(template.filePath, 'utf8');
    } catch {
      continue;
    }
    const parsed = readModule(source, builtins);
    // A block is a showcase when it says so, or when it shows components
    // through `alsoShowcaseFor`, which counts them as shown above.
    const showcase =
      template.isShowcase === true ||
      (Array.isArray(template.alsoShowcaseFor) &&
        template.alsoShowcaseFor.length > 0);
    if (template.type === 'block' && showcase) {
      const blocked = parsed.server;
      if (blocked.length > 0) {
        notes.push({
          code: 'showcase_not_standalone',
          message: `${rel(template.filePath)}: the showcase ${[...new Set(blocked)].join(', ')}, which cannot run in a browser, so a docs page or catalog card cannot render it. Fix: move that code into the app; pass values in as props or a sample-data provider the showcase renders itself. Fetching live data through the app is fine.`,
        });
      }
    }
    for (const loaded of new Set(parsed.assets)) {
      const asset = path.resolve(path.dirname(template.filePath), loaded);
      const assetRel = rel(asset);
      const exists = fs.existsSync(asset);
      // npm packs nothing outside the package root, whatever `files` says.
      const fromBase = path.relative(base, asset);
      if (fromBase.startsWith('..') || path.isAbsolute(fromBase)) {
        notes.push({
          code: 'template_asset_not_packed',
          message: `${rel(template.filePath)}: loads ${assetRel}, which is outside the package, so npm never packs it and the template breaks once installed. Fix: move it inside the package (beside the template is simplest), point \`new URL()\` at the new place, and confirm with \`npm pack --dry-run\`.`,
        });
        continue;
      }
      // A folder URL is packed when npm packs anything inside it.
      const isFolder = exists && fs.statSync(asset).isDirectory();
      if (exists) {
        // With no `files` field npm packs everything but what an ignore file
        // drops, in the package root or any folder down to the asset, so
        // with no ignore file on that path there is nothing to ask.
        if (
          !Array.isArray(packedFiles) &&
          ignoreFilesFor(base, assetRel).length === 0
        ) {
          continue;
        }
        // What npm packs decides. Without npm's answer, an asset no entry
        // can reach is reported, and any other is listed as not checked.
        packed ??= npmPackedPaths(base);
        if ('paths' in packed) {
          if (packed.paths.has(assetRel)) continue;
          if (
            isFolder &&
            [...packed.paths].some(each => each.startsWith(`${assetRel}/`))
          ) {
            continue;
          }
        } else if (
          !Array.isArray(packedFiles) ||
          !outsideFiles(assetRel, packedFiles)
        ) {
          unchecked.push({
            file: rel(template.filePath),
            asset: assetRel,
            reason: Array.isArray(packedFiles)
              ? `${packed.error}, and a \`files\` entry may reach it`
              : `${packed.error}, and ${ignoreFilesFor(base, assetRel).at(-1) ?? '.npmignore'} may drop it`,
          });
          continue;
        }
      }
      const folder =
        path.posix.dirname(assetRel) === '.'
          ? assetRel
          : path.posix.dirname(assetRel);
      const negated = negatedFilesEntry(assetRel, packedFiles);
      notes.push({
        code: 'template_asset_not_packed',
        message: !exists
          ? `${rel(template.filePath)}: loads ${assetRel}, which does not exist. Fix: add the file, or point \`new URL()\` at one that does.`
          : negated != null && !outsideFiles(assetRel, packedFiles)
            ? `${rel(template.filePath)}: loads ${assetRel}, which the \`files\` entry "${negated}" leaves out of the package, so the template breaks once installed. Fix: drop or narrow "${negated}" so it no longer matches ${assetRel}, and confirm with \`npm pack --dry-run\`.`
            : Array.isArray(packedFiles) &&
            (outsideFiles(assetRel, packedFiles) ||
              !ignoreFilesFor(base, assetRel).some(file => file.includes('/')))
            ? `${rel(template.filePath)}: loads ${assetRel}, which npm leaves out of the package by its \`files\` field, so the template breaks once installed. Fix: add "${folder}" to \`files\`, drop any \`!\` entry that excludes it, and confirm with \`npm pack --dry-run\`.`
            : ignoreFix(
                base,
                rel(template.filePath),
                assetRel,
                Array.isArray(packedFiles),
              ),
      });
    }
  }
  if (!integration.components || rootProblem(integration.components)) {
    return {notes, unchecked};
  }
  /** @type {any[]} */
  let records;
  try {
    records = componentDiscovery.discoverIntegrationComponents(integration);
  } catch {
    return {notes, unchecked};
  }
  const templatesDir = root ? rel(root) || '.' : 'templates';
  /** @type {Set<unknown>} blocks a note has already asked to show one component */
  const claimed = new Set();
  // A block that names a component, by its category, name, display name or
  // file (`acme-badge-showcase`), is offered to that component alone, so two
  // notes never ask one block to show two components. The longest matching
  // name wins (`AcmeBadgeGroup` over `AcmeBadge`).
  const key = (/** @type {string} */ value) =>
    value.toLowerCase().replace(/[-_\s]/g, '');
  const componentNames = records
    .map(record => record.name)
    .filter(name => typeof name === 'string')
    .sort((a, b) => b.length - a.length);
  /** @type {Map<unknown, string>} */
  const ownerOf = new Map();
  for (const template of templates) {
    if (template.type !== 'block' || typeof template.exampleFor === 'string') {
      continue;
    }
    const words = [
      template.category,
      template.name,
      template.displayName,
      typeof template.filePath === 'string'
        ? path.basename(template.filePath).replace(/\.[^.]+$/u, '')
        : undefined,
    ]
      .filter(value => typeof value === 'string')
      .map(key);
    const owner = componentNames.find(name =>
      words.some(word => word.includes(key(name))),
    );
    if (owner) ownerOf.set(template, owner);
  }
  for (const record of records) {
    if (componentDiscovery.isIntegrationMember(record)) continue;
    if (shown.has(record.name)) continue;
    let doc;
    try {
      doc = await loadComponentDoc(record.docPath);
    } catch {
      continue;
    }
    if (doc?.hidden === true || doc?.isHiddenFromOverview === true) continue;
    if (doc?.category === 'Utility') continue;
    const name = record.name;
    const stem = `${name.replace(/([a-z0-9])([A-Z])/gu, '$1-$2').toLowerCase()}-showcase`;
    // A block that already composes the component only needs the fields.
    // A block that composes the component and shows nothing else takes the
    // fields; one that is already another component's showcase takes
    // `alsoShowcaseFor` instead, so it keeps its own.
    // A block whose `exampleFor` already names the component only needs
    // `isShowcase: true`.
    const named = templates.find(
      template => template.type === 'block' && template.exampleFor === name,
    );
    if (named) {
      notes.push({
        code: 'component_without_example',
        message: `${rel(record.docPath)}: no block template shows "${name}" (\`exampleFor: '${name}'\` with \`isShowcase: true\`), so template lists, docs pages and catalog cards have no example of it. Fix: add \`isShowcase: true\` to ${rel(named.docPath ?? named.filePath)}, whose \`exampleFor\` already names ${name}.`,
      });
      continue;
    }
    // Among the blocks that compose it, prefer the one that names it, then
    // one that names no component and shows nothing yet; a block that names
    // another component is that component's.
    const namesIt = (/** @type {any} */ template) =>
      ownerOf.get(template) === name;
    const composing = templates
      .filter(
        template =>
          template.type === 'block' &&
          Array.isArray(template.componentsUsed) &&
          template.componentsUsed.includes(name) &&
          (!ownerOf.has(template) || ownerOf.get(template) === name),
      )
      .sort(
        (a, b) =>
          Number(namesIt(b)) - Number(namesIt(a)) ||
          Number(typeof a.exampleFor === 'string') -
            Number(typeof b.exampleFor === 'string'),
      );
    const existing =
      composing.find(
        template =>
          typeof template.exampleFor !== 'string' && !claimed.has(template),
      ) ?? composing.find(template => typeof template.exampleFor === 'string');
    const showsAnother =
      existing != null && typeof existing.exampleFor === 'string';
    if (existing && !showsAnother) claimed.add(existing);
    // The stem path is free to suggest unless a block there already shows
    // another component; then the new files take the next free stem.
    const stemTemplate = templates.find(
      template =>
        typeof template.filePath === 'string' &&
        path.basename(template.filePath).replace(/\.[^.]+$/u, '') === stem,
    );
    const stemShowsAnother =
      stemTemplate != null &&
      typeof stemTemplate.exampleFor === 'string' &&
      stemTemplate.exampleFor !== name;
    let freeStem = stem;
    if (stemShowsAnother && root && !rootProblem(root)) {
      for (
        let n = 2;
        fs.existsSync(path.join(root, `${freeStem}.tsx`)) ||
        fs.existsSync(path.join(root, `${freeStem}.doc.mjs`));
        n++
      ) {
        freeStem = `${stem}-${n}`;
      }
    }
    const taken =
      !existing &&
      !stemShowsAnother &&
      root &&
      !rootProblem(root) &&
      fs.existsSync(path.join(root, `${stem}.tsx`));
    if (existing || taken) {
      const doc = existing
        ? rel(existing.docPath ?? existing.filePath)
        : `${templatesDir}/${stem}.doc.mjs`;
      notes.push({
        code: 'component_without_example',
        message: `${rel(record.docPath)}: no block template shows "${name}" (\`exampleFor: '${name}'\` with \`isShowcase: true\`), so template lists, docs pages and catalog cards have no example of it. Fix: ${showsAnother ? `add '${name}' to \`alsoShowcaseFor\` in ${doc}, the block that already composes ${name} as the showcase of ${existing.exampleFor}` : `add \`exampleFor: '${name}'\` and \`isShowcase: true\` to ${doc}${existing ? `, the block that already composes ${name}` : ''}`}. A doc set to \`hidden\`, \`isHiddenFromOverview\` or category \`Utility\` needs no example.`,
      });
      continue;
    }
    notes.push({
      code: 'component_without_example',
      message:
        `${rel(record.docPath)}: no block template shows "${name}" (\`exampleFor: '${name}'\` with \`isShowcase: true\`), so template lists, docs pages and catalog cards have no example of it.` +
        (root
          ? ''
          : " The manifest sets no `templates` root; add `templates: './templates'` to it.") +
        ` Fix: add ${templatesDir}/${freeStem}.tsx, a small composition that renders ${name}, and beside it ${templatesDir}/${freeStem}.doc.mjs:` +
        ` export default {type: 'block', name: '${freeStem}', displayName: '${name} showcase', description: 'A ${name} in use.', exampleFor: '${name}', isShowcase: true, aspectRatio: 16 / 10};` +
        ' A doc set to `hidden`, `isHiddenFromOverview` or category `Utility` needs no example.',
    });
  }
  return {notes, unchecked};
}

/**
 * Warn about a `.tsx` directly in the templates root with no same-stem template
 * metadata: template discovery pairs sources with docs, so `astryx template`
 * never lists it. A PascalCase file directly in a shared components root is
 * left to the component check, which already warns about it.
 * @param {LoadedIntegration} integration loaded-integration-shaped object
 * @param {Issue[]} issues
 */
function checkTemplateSourcesWithoutDoc(integration, issues) {
  const root = /** @type {string} */ (integration.templates);
  const sharedComponents =
    integration.components != null &&
    path.resolve(integration.components) === path.resolve(root);
  for (const file of findTemplateSourceOnlyCandidates(root)) {
    if (sharedComponents && /^[A-Z]/u.test(file)) continue;
    const stem = file.slice(0, -'.tsx'.length);
    issues.push(
      issueWarning(
        'source_without_template_doc',
        `Template source "${file}" has no same-stem metadata file ${stem}.doc.mjs, so \`astryx template\` never lists it. Fix: add ${stem}.doc.mjs beside it with type: 'page' or 'block'; \`astryx docs authoring integration-template-doc\` lists its fields. If it is not a template, move it out of the templates root.`,
      ),
    );
  }
}

/**
 * Validate the integration's components through the same load-and-parse boundary
 * that component detail uses. Missing source and invalid metadata are reported
 * per component so valid siblings remain available.
 * @param {LoadedIntegration} integration loaded-integration-shaped object
 * @param {Issue[]} issues
 */
async function checkComponents(integration, issues) {
  if (!integration.components || rootProblem(integration.components)) return;
  const discover = componentDiscovery.discoverValidIntegrationComponents;
  if (typeof discover !== 'function') return; // feature not present yet
  const root = /** @type {string} */ (integration.components);
  const files = componentDocFiles(root);
  try {
    const {discovered, errors} = await discover(integration);
    /** @type {import('./contribution-fixes.mjs').FixContext | undefined} */
    let context;
    const byName = new Map(discovered.map(record => [record.name, record]));
    for (const error of errors) {
      const record = byName.get(error.name);
      if (record == null || record.sourcePath != null) {
        issues.push(issueError('invalid_component', error.message));
        continue;
      }
      const docPath = record.docPath;
      // Reported once, below, as the case mismatch it is.
      if (docPath && files.caseMismatch.has(docPath)) continue;
      const docName = docPath
        ? path.basename(docPath)
        : `${record.name}.doc.mjs`;
      let message = error.message;
      let fix = `Fix: add ${record.name}.tsx beside ${docName}.`;
      const stamp = docPath ? readContributionStamp(docPath, false) : null;
      if (stamp && stamp.type !== 'component' && integration.__packageDir) {
        context ??= createFixContext(integration.__packageDir, integration);
        fix = notAComponentFix(context, docPath, stamp);
      } else {
        const other = docPath ? otherSourceFor(docPath) : null;
        if (other) {
          message = `${message.replace(/\.$/u, '')}: found ${other}, but a component source must be a .tsx file.`;
          fix = `Fix: rename ${other} to ${record.name}.tsx (and point its package export at the new file).`;
        }
      }
      issues.push(issueError('invalid_component', `${message} ${fix}`));
    }
    /** @type {Set<string>} sources a case-only rename is reported for */
    const reportedSources = new Set();
    for (const [docPath, source] of files.caseMismatch) {
      const doc = path.basename(docPath);
      const renamed = `${source.slice(0, -'.tsx'.length)}${doc.slice(docStemOf(doc).length)}`;
      const shown = slash(path.relative(root, docPath));
      const linux = `They pair on a case-insensitive disk (macOS, Windows) but not on Linux, where CI and most installs run`;
      const fix = `Fix: rename ${doc} to ${renamed}.`;
      // Where discovery still pairs the doc with its source (a
      // case-insensitive disk), the component works here: listed, as
      // validate passed it before. A hidden doc that does not pair leaves its
      // source without a doc, which the source check below reports as it
      // always has (architecture:cli-surface INV37).
      const pairs = componentDiscovery.integrationSourceForDoc(docPath) != null;
      const hidden = componentDiscovery.isHiddenComponentDoc(docPath);
      if (hidden && !pairs) continue;
      reportedSources.add(path.join(path.dirname(docPath), source));
      if (hidden) {
        issues.push(
          issueListed(
            'source_without_component_doc',
            `Hidden component doc "${shown}" and its source "${source}" differ only in letter case. ${linux}. ${fix}`,
          ),
        );
      } else if (pairs) {
        issues.push(
          issueListed(
            'source_without_component_doc',
            `Component doc "${shown}" and its source "${source}" differ only in letter case. ${linux}, so there the component is missing. ${fix}`,
          ),
        );
      } else {
        issues.push(
          issueError(
            'invalid_component',
            `Component doc "${shown}" and its source "${source}" differ only in letter case. ${linux}, so here the component is missing. ${fix}`,
          ),
        );
      }
    }
    for (const {read, ignored} of files.duplicates) {
      const readName = path.basename(read);
      const ignoredNames = ignored.map(file => path.basename(file));
      issues.push(
        issueListed(
          'duplicate_component_doc',
          `Component "${docStemOf(readName)}" has ${ignored.length + 1} docs: ${[readName, ...ignoredNames].join(', ')}. Astryx reads ${readName} and ignores ${ignoredNames.join(' and ')}. Fix: delete ${ignoredNames.join(' and ')}, moving anything only ${ignored.length === 1 ? 'it says' : 'they say'} into ${readName}.`,
        ),
      );
    }
    const overlap = integration.__packageDir
      ? newComponentDocNote(
          (context ??= createFixContext(integration.__packageDir, integration)),
        )
      : '';
    for (const name of findSourceOnlyCandidates(
      integration.components,
      discovered.map(record => record.name),
    )) {
      // A hidden doc still pairs with its source; discovery just skips it.
      if (
        ['.doc.ts', '.doc.mjs', '.doc.js'].some(suffix =>
          fs.existsSync(path.join(root, `${name}${suffix}`)),
        )
      ) {
        continue;
      }
      // A doc whose name differs only in case is reported above.
      if (reportedSources.has(path.join(root, `${name}.tsx`))) continue;
      issues.push(
        issueWarning(
          'source_without_component_doc',
          `Component source "${name}.tsx" has no same-stem metadata file ${name}.doc.mjs, so Astryx ignores it. Fix: add ${name}.doc.mjs beside it with type: 'component'; \`astryx docs authoring component-doc\` lists its fields.${overlap}`,
        ),
      );
    }
  } catch (err) {
    issues.push(
      issueError('invalid_component', /** @type {any} */ (err).message),
    );
  }
}

const COMPONENT_DOC_SUFFIXES = ['.doc.ts', '.doc.mjs', '.doc.js'];

/** @param {string} file a doc file name */
function docStemOf(file) {
  const suffix = COMPONENT_DOC_SUFFIXES.find(each => file.endsWith(each));
  return suffix ? file.slice(0, -suffix.length) : file;
}

/**
 * A same-stem source discovery does not read: `.jsx`, `.js`, `.ts` or `.mjs`.
 * @param {string} docPath
 * @returns {string | null} its file name
 */
function otherSourceFor(docPath) {
  const stem = docStemOf(path.basename(docPath));
  const dir = path.dirname(docPath);
  return (
    ['.jsx', '.js', '.ts', '.mjs']
      .map(extension => `${stem}${extension}`)
      .find(file => fs.existsSync(path.join(dir, file))) ?? null
  );
}

/**
 * The component docs under a root, read from the real directory listings:
 * those beside a source whose name differs only in letter case (which an
 * existence check on a case-insensitive disk would call paired), and stems
 * with more than one doc, with the doc discovery reads.
 * @param {string} root
 */
function componentDocFiles(root) {
  /** @type {Map<string, string>} doc path -> the source's real file name */
  const caseMismatch = new Map();
  /** @type {Array<{read: string, ignored: string[]}>} */
  const duplicates = [];
  /** @param {string} dir */
  const walk = dir => {
    let entries;
    try {
      entries = fs.readdirSync(dir, {withFileTypes: true});
    } catch {
      return;
    }
    const names = new Set(entries.map(entry => entry.name));
    /** @type {Map<string, string[]>} */
    const byStem = new Map();
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== '__tests__') {
          walk(full);
        }
        continue;
      }
      const stem = docStemOf(entry.name);
      if (stem === entry.name) continue;
      byStem.set(stem, [...(byStem.get(stem) ?? []), entry.name]);
      const source = `${stem}.tsx`;
      if (names.has(source)) continue;
      const other = [...names].find(
        name => name !== source && name.toLowerCase() === source.toLowerCase(),
      );
      // The source's own doc, if it has one, is its pair.
      if (
        other &&
        !COMPONENT_DOC_SUFFIXES.some(suffix =>
          names.has(`${other.slice(0, -'.tsx'.length)}${suffix}`),
        )
      ) {
        caseMismatch.set(full, other);
      }
    }
    for (const docs of byStem.values()) {
      if (docs.length < 2) continue;
      const ordered = COMPONENT_DOC_SUFFIXES.map(suffix =>
        docs.find(doc => doc.endsWith(suffix)),
      ).filter(doc => doc != null);
      duplicates.push({
        read: path.join(dir, /** @type {string} */ (ordered[0])),
        ignored: ordered
          .slice(1)
          .map(doc => path.join(dir, /** @type {string} */ (doc))),
      });
    }
  };
  walk(root);
  return {caseMismatch, duplicates};
}

/**
 * Judge each component doc's `name` against the module its printed import
 * names: a finding when that module provably does not export it, and an
 * entry in `unchecked` when it cannot be judged, so it is listed instead.
 * @param {LoadedIntegration} integration
 * @param {Array<{name: string, docPath: string, sourcePath: string|null}>} components
 * @param {string} root the components root
 * @param {Map<string, string>} skip docs already reported, by path
 * @param {Array<{docPath: string, name: string, message: string}>} findings
 * @param {Array<{docPath: string, name: string, reason: string}>} unchecked
 */
async function judgeComponentDocNames(
  integration,
  components,
  root,
  skip,
  findings,
  unchecked,
) {
  const base = integration.__packageDir ?? root;
  for (const record of components) {
    if (componentDiscovery.isIntegrationMember(record)) continue;
    if (skip.has(record.docPath)) continue;
    // A doc with no source is its own error.
    if (record.sourcePath == null) continue;
    let doc;
    try {
      doc = await loadComponentDoc(record.docPath);
    } catch {
      continue;
    }
    const name = doc?.name;
    if (typeof name !== 'string' || name === record.name) continue;
    // The module the printed import names: the doc's import, the published
    // subpath, or the package root, resolved through package.json "exports".
    // Without a package to resolve it in, the same-stem source.
    const printed = componentDiscovery.importedModule(
      integration,
      record.docPath,
      doc,
    );
    if (printed === null) {
      unchecked.push({
        docPath: record.docPath,
        name,
        reason:
          'Its import names another package, or resolves to no file this check can read.',
      });
      continue;
    }
    const module = printed ?? record.sourcePath;
    const shown = slash(path.relative(base, module));
    // Only what the code contradicts: the module must provably not export
    // the name the doc gives.
    const judged = moduleExportVerdict(module, name);
    if (judged.verdict === 'exports') continue;
    if (judged.verdict === 'unknown') {
      unchecked.push({docPath: record.docPath, name, reason: judged.reason});
      continue;
    }
    // A source whose only export is a default, read because no printed
    // import could be resolved: the package's entry may publish it under
    // any name, so the name is not judged. A printed import that names a
    // default-only module does not export the name, which is a mismatch.
    const exportedNames = moduleExportNames(module);
    const defaultOnly =
      exportedNames != null &&
      exportedNames.length === 1 &&
      exportedNames[0] === 'default';
    if (defaultOnly && printed === undefined) {
      unchecked.push({
        docPath: record.docPath,
        name,
        reason: `${shown} exports a default, which the package entry may publish under any name.`,
      });
      continue;
    }
    const file = path.basename(record.docPath);
    // The name to propose: the file name when the module exports it, else
    // the one component the module exports.
    let fix;
    if (defaultOnly) {
      fix =
        defaultBinding(module) === name
          ? `Fix: add \`export {${name}};\` to ${shown}, so it exports ${name} by name as well, or set the doc's import to the module that publishes it as ${name}.`
          : `Fix: bind the default to ${name} in ${shown} and export it by name too (\`const ${name} = …; export default ${name}; export {${name}};\`), or set the doc's import to the module that publishes it as ${name}.`;
    } else if (moduleExportsName(module, record.name)) {
      fix = `Fix: set name: '${record.name}' in ${file}.`;
    } else {
      const exported = (exportedNames ?? []).filter(each =>
        /^[A-Z][A-Za-z0-9]*$/u.test(each),
      );
      fix =
        exported.length === 1
          ? `Fix: set name: '${exported[0]}' in ${file}, the component ${shown} exports.`
          : `Fix: set name in ${file} to the component ${shown} exports${exported.length > 1 ? ` (${exported.join(', ')})` : ''}.`;
    }
    findings.push({
      docPath: record.docPath,
      name,
      message: `Component doc "${slash(path.relative(root, record.docPath))}" sets name: '${name}', but ${shown}, the module its import names, does not export ${name}, so Astryx lists the component as "${record.name}" (its file name), and \`astryx component ${record.name}\` prints \`import {${name}}\`. ${fix}`,
    });
  }
}

/**
 * The component doc names the check could not judge, shaped like the doc type
 * report so `integration check` counts them as not compared: each doc whose
 * `name` differs from the name it is listed under and whose source's exports
 * cannot all be read without running it; its findings are always empty. A
 * name the module its printed import names provably lacks is a
 * `doc_name_mismatch` note, with its fix in the message: validate lists
 * notes beside its issues, and nothing counts them, so `--strict` does not
 * fail on it until the next minor release (architecture:cli-surface INV35).
 * @param {LoadedIntegration} integration
 * @returns {Promise<{report: {status: 'checked', findings: [], unchecked: Array<{file: string, name: string, reason: string}>}, notes: Note[]}>}
 */
export async function componentDocNamesCheck(integration) {
  /** @type {Array<{docPath: string, name: string, message: string}>} */
  const findings = [];
  /** @type {Array<{docPath: string, name: string, reason: string}>} */
  const unchecked = [];
  const root = integration.components;
  if (root && !rootProblem(root)) {
    try {
      const {components} =
        await componentDiscovery.discoverValidIntegrationComponents(
          integration,
        );
      await judgeComponentDocNames(
        integration,
        components,
        root,
        componentDocFiles(root).caseMismatch,
        findings,
        unchecked,
      );
    } catch {
      // A components root discovery cannot read is reported as an issue.
    }
  }
  const base = integration.__packageDir ?? root ?? '';
  return {
    report: {
      status: 'checked',
      findings: [],
      unchecked: unchecked.map(entry => ({
        file: slash(path.relative(base, entry.docPath)),
        name: entry.name,
        reason: entry.reason,
      })),
    },
    notes: findings.map(entry => note('doc_name_mismatch', entry)),
  };
}

/**
 * Validate the integration's doc topics via the landed discovery. A doc that
 * cannot be loaded, is not a usable topic, or collides with a sibling is
 * reported as an `invalid_doc` error.
 *
 * Only per-file problems are visible here: a topic that collides with another
 * PACKAGE's, or names a `replaces`/`extends` target that does not exist, can
 * only be judged once every integration is resolved together, so those are
 * raised by `Project.docs()` instead.
 *
 * @param {LoadedIntegration} integration loaded-integration-shaped object
 * @param {Issue[]} issues
 */
async function checkDocs(integration, issues) {
  if (!integration.docs || rootProblem(integration.docs)) return;
  try {
    const {errors} = await discoverIntegrationDocs(integration);
    for (const e of errors) {
      issues.push(issueError('invalid_doc', e.message));
    }
  } catch (err) {
    issues.push(issueError('invalid_doc', /** @type {any} */ (err).message));
  }
}

/**
 * Validate the integration's source-theme descriptors. The same discovery function
 * powers Project and theme list/add, so validation cannot accept a shape that
 * consumers later fail to use.
 * @param {LoadedIntegration} integration
 * @param {Issue[]} issues
 */
async function checkThemes(integration, issues) {
  if (!integration.themes || rootProblem(integration.themes)) return;
  try {
    // A theme may name itself differently from its folder (its built files
    // then carry that name), so a name that differs is no finding here:
    // verify judges it against the files the package exports.
    await discoverIntegrationThemes(integration);
  } catch (err) {
    issues.push(issueError('invalid_theme', /** @type {any} */ (err).message));
  }
}

/**
 * The `name` a theme source passes to defineTheme for its exported theme,
 * when the file says it as a string literal: `export const oceanTheme =
 * defineTheme({name: 'ocean', ...})`. Null whenever only running the module
 * could tell (a variable, a factory, a spread after the name, `extends`
 * alone), so nothing is judged that a build would decide.
 * @param {string} file
 * @param {string} exportName
 * @returns {string | null}
 */
export function literalThemeName(file, exportName) {
  let ast;
  try {
    ast = parseModule(fs.readFileSync(file, 'utf8'), {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
      errorRecovery: true,
    });
  } catch {
    return null;
  }
  /** @type {any} */
  let init = null;
  for (const node of ast.program.body) {
    const declaration =
      node.type === 'ExportNamedDeclaration' ? node.declaration : node;
    if (declaration?.type !== 'VariableDeclaration') continue;
    for (const declarator of declaration.declarations) {
      if (
        declarator.id.type === 'Identifier' &&
        declarator.id.name === exportName
      ) {
        init = declarator.init;
      }
    }
  }
  while (
    init?.type === 'TSAsExpression' ||
    init?.type === 'TSSatisfiesExpression'
  ) {
    init = init.expression;
  }
  if (init?.type !== 'CallExpression') return null;
  const callee =
    init.callee.type === 'Identifier'
      ? init.callee.name
      : init.callee.type === 'MemberExpression' &&
          init.callee.property.type === 'Identifier'
        ? init.callee.property.name
        : null;
  if (callee !== 'defineTheme') return null;
  const [config] = init.arguments;
  if (config?.type !== 'ObjectExpression') return null;
  /** @type {string | null} */
  let name = null;
  for (const property of config.properties) {
    if (property.type === 'SpreadElement') {
      name = null;
      continue;
    }
    if (property.type !== 'ObjectProperty' || property.computed) continue;
    const key =
      property.key.type === 'Identifier'
        ? property.key.name
        : property.key.type === 'StringLiteral'
          ? property.key.value
          : null;
    if (key !== 'name') continue;
    name =
      property.value.type === 'StringLiteral' ? property.value.value : null;
  }
  return name;
}

/**
 * A warning for each contribution file a reader reads (the docs and sources
 * `integration verify` expects in the tarball) that the user running astryx
 * cannot read; files no reader takes, such as `.DS_Store`, are not looked at: Astryx cannot check it, and npm pack stops on it. A
 * warning, so validate keeps its exit code; `integration verify` fails on the
 * pack itself.
 * @param {LoadedIntegration} integration
 * @param {Issue[]} issues
 */
function checkUnreadableFiles(integration, issues) {
  const packageDir = integration.__packageDir;
  if (!packageDir) return;
  for (const shown of contributionFiles(integration, packageDir)) {
    try {
      fs.accessSync(path.join(packageDir, shown), fs.constants.R_OK);
    } catch (err) {
      const code = String(/** @type {any} */ (err)?.code ?? 'unknown error');
      issues.push(
        issueListed(
          'unreadable_file',
          `Could not read "${shown}" (${code}), so Astryx cannot check it and npm pack fails on it. Fix: make it readable (chmod a+r ${shown}), or delete it if it does not belong in the package.`,
        ),
      );
    }
  }
}

/**
 * Run every contribution validator against a loaded-integration-shaped object.
 * @param {LoadedIntegration} integration
 * @param {Issue[]} issues
 */
async function runContributionChecks(integration, issues) {
  checkUnreadableFiles(integration, issues);
  await checkCodemods(integration, issues);
  await checkTemplates(integration, issues);
  await checkComponents(integration, issues);
  await checkDocs(integration, issues);
  await checkThemes(integration, issues);
}

/**
 * Validate an already-LOADED integration (as produced by `loadIntegrations` —
 * absolute contribution roots plus identity) and return its issues. This is the
 * reuse seam for everyday commands that have already loaded the configured
 * integrations and want the SAME validators that Doctor runs,
 * without re-resolving the manifest from disk.
 *
 * @param {LoadedIntegration} loaded loaded-integration-shaped object
 * @returns {Promise<Issue[]>}
 */
export async function validateLoadedIntegration(loaded) {
  return (await validateLoadedIntegrationListed(loaded)).issues;
}

/**
 * Every contribution check, split: `issues` as validateLoadedIntegration
 * returns them, and `listed`, the layout findings validate lists in its
 * `layout` report without counting them.
 * @param {LoadedIntegration} loaded
 * @returns {Promise<{issues: Issue[], listed: Issue[]}>}
 */
export async function validateLoadedIntegrationListed(loaded) {
  const all = await allLoadedIntegrationIssues(loaded);
  return {
    issues: all.filter(issue => !LISTED.has(issue)),
    listed: all.filter(issue => LISTED.has(issue)),
  };
}

/**
 * @param {LoadedIntegration} loaded
 * @returns {Promise<Issue[]>}
 */
async function allLoadedIntegrationIssues(loaded) {
  /** @type {Issue[]} */
  const issues = [];
  if (!loaded || typeof loaded !== 'object') return issues;
  // A package set aside for claiming another package's provider ID has no
  // contribution roots to check; the conflict itself is what to report.
  if (loaded.__providerConflict) {
    return [
      issueWarning(DUPLICATE_PROVIDER, loaded.__providerConflict.message),
    ];
  }
  // A manifest that threw on import (or failed the schema) carries a load-error
  // marker and no contribution roots, so every check below would find nothing
  // and report a clean integration — which is how a stale manifest used to go
  // silently invisible. The load error IS the issue.
  if (loaded.__loadError) {
    return [issueError('integration_error', loaded.__loadError)];
  }
  checkUnknownKeys(loaded, issues);
  if (loaded.__agentDocsError) {
    issues.push(issueError(INVALID_AGENT_DOCS, loaded.__agentDocsError));
  }
  if (loaded.__cliCommandError) {
    issues.push(
      issueWarning(
        INVALID_CLI_COMMAND,
        `${loaded.__cliCommandError}. The command is ignored; printed commands use the package-manager prefix.`,
      ),
    );
  }
  checkRoots(
    {
      components: loaded.components,
      templates: loaded.templates,
      codemods: loaded.codemods,
      docs: loaded.docs,
      themes: loaded.themes,
      iconSets: loaded.iconSets,
      __manifestFile: loaded.__manifestFile,
    },
    issues,
    loaded.__packageDir,
  );
  await runContributionChecks(loaded, issues);
  return issues;
}
