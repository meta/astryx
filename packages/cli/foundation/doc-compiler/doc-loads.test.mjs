// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Every module in the CLI package that runs anything but its static
 *   imports of other CLI code (a doc file, a module chosen at run time, a code
 *   string, a thread, or a process) is listed here, site by site, with what it
 *   runs. A doc read that goes around the doc compiler (./read.mjs) is such a
 *   site, so it fails this test until it is listed; so does any other new
 *   site, and a listed one that is gone.
 *
 *   What it claims: every ordinary way a module runs code — the shapes code
 *   review sees, whatever the local names. What it does not claim: that the
 *   rule cannot be evaded on purpose. Deliberate obfuscation (a method name
 *   built at run time, a runner stashed behind a computed key or a getter) is
 *   out of scope; this test records what the CLI does, it does not sandbox it.
 *   It checks where code runs, not what a computed site loads: each entry
 *   says that.
 */

import {describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {isBuiltin} from 'node:module';
import {parse} from '@babel/parser';
import babelTypes from '@babel/types';
import {CLI_ROOT} from '../fs/paths.mjs';

const {VISITOR_KEYS, isReferenced, isTSType} = babelTypes;

/**
 * Command modules build their help text from the raw exports of their own
 * self-docs, imported statically: those reads skip the compiler.
 */
const SELF_DOCS = 'its self-docs, statically: raw exports build its help text';

/**
 * Every module that runs anything but its static imports of other CLI code:
 * what it runs, and each site the scan finds in it (`×n` for a repeated one).
 * @type {Record<string, {runs: string, sites: string[]}>}
 */
const RUNNERS = {
  'api/doctor/doctor.mjs': {
    runs: "the project's astryx.config, for the config check",
    sites: ['import(<computed>)'],
  },
  'api/gap-report/gap-report-worker.mjs': {
    runs: "an integration's gap-report handler, in the worker thread",
    sites: ['importUserModule'],
  },
  'api/gap-report/gap-report.mjs': {
    runs: 'the gap-report worker thread, and `gh issue create` as the GitHub fallback',
    sites: ['import(node:child_process)', 'worker_threads.Worker'],
  },
  'api/integration/pack-check.mjs': {
    runs: "`npm pack`, `tar`, and a Node script that resolves the packed specifiers, to check a package as published, and the package's doc modules, to see which need a newer CLI",
    sites: ['child_process.spawnSync ×3', 'loadTopicModule'],
  },
  'api/swizzle/_github.mjs': {
    runs: '`gh auth status`, to check the GitHub CLI is signed in',
    sites: ['child_process.execFileSync'],
  },
  'api/theme/_adapter.mjs': {
    runs: 'recorded built theme modules through the shared app-theme loader',
    sites: ['importThemeArtifact'],
  },
  'api/theme/build/build.mjs': {
    runs: "theme source modules, through jiti; the project's installed Core",
    sites: [
      '.evalModule() ×2',
      '.import()',
      'createJiti ×5',
      'import(<computed>) ×3',
    ],
  },
  'api/theme/build/core-interception.mjs': {
    runs: "@astryxdesign/core as a theme's CommonJS dependencies require it, to wrap defineTheme",
    sites: ['require(<computed>)'],
  },
  'api/upgrade/_adapter.mjs': {
    runs: 'the commands a codemod declares as its post-codemod hooks',
    sites: ['child_process.execFile'],
  },
  'assets/codemods/ensure-jscodeshift.mjs': {
    runs: 'the package manager, to install jscodeshift',
    sites: ['child_process.execSync'],
  },
  'assets/codemods/integration-discovery.mjs': {
    runs: "each integration's codemods, through the codemod parser, to plan an upgrade",
    sites: ['loadModuleWithParser(..., parseCodemod)'],
  },
  'authoring/shadcn/source-variants.mjs': {
    runs: "@babel/plugin-transform-typescript (CommonJS), to reproduce the ShadCN client's transform",
    sites: ['require(@babel/plugin-transform-typescript)'],
  },
  'clients/cli/bin/astryx.mjs': {
    runs: "the CLI's own modules, by real path, so a linked bin finds them",
    sites: ['import(<computed>)'],
  },
  'clients/cli/commands/blog.mjs': {
    runs: SELF_DOCS,
    sites: ['import ../../../api/blog/blog.doc.mjs', 'import ./blog.doc.mjs'],
  },
  'clients/cli/commands/experimental/icon.mjs': {
    runs: SELF_DOCS,
    sites: [
      'import ../../../../api/icon/icon.doc.mjs',
      'import ../../../../api/icon/iconAdd.doc.mjs',
      'import ../../../../api/icon/iconMap.doc.mjs',
      'import ../../../../api/icon/iconNewDefinition.doc.mjs',
      'import ../../../../api/icon/iconNewSet.doc.mjs',
      'import ../../../../api/icon/iconUse.doc.mjs',
      'import ../experimental-icon-add.doc.mjs',
      'import ../experimental-icon-map.doc.mjs',
      'import ../experimental-icon-new-definition.doc.mjs',
      'import ../experimental-icon-new-set.doc.mjs',
      'import ../experimental-icon-use.doc.mjs',
      'import ../experimental-icon.doc.mjs',
    ],
  },
  'clients/cli/commands/experimental/index.mjs': {
    runs: SELF_DOCS,
    sites: ['import ../experimental.doc.mjs'],
  },
  'clients/cli/commands/experimental/render.mjs': {
    runs: SELF_DOCS,
    sites: [
      'import ../../../../api/render/render.doc.mjs',
      'import ../experimental-render.doc.mjs',
    ],
  },
  'clients/cli/commands/manifest.mjs': {
    runs: SELF_DOCS,
    sites: ['import ./manifest.doc.mjs'],
  },
  'clients/cli/commands/postinstall.mjs': {
    runs: SELF_DOCS,
    sites: ['import ./postinstall.doc.mjs'],
  },
  'clients/cli/commands/theme.mjs': {
    runs: `${SELF_DOCS}; and \`astryx theme build\`, a child process per theme`,
    sites: [
      'child_process.spawn',
      'import ../../../api/theme/themeAdd.doc.mjs',
      'import ../../../api/theme/themeBuild.doc.mjs',
      'import ../../../api/theme/themeEject.doc.mjs',
      'import ../../../api/theme/themeListAvailable.doc.mjs',
      'import ../../../api/theme/themePaletteGenerate.doc.mjs',
      'import ../../../api/theme/themeRemove.doc.mjs',
      'import ../../../api/theme/themeTargets.doc.mjs',
      'import ../../../api/theme/themeTemplate.doc.mjs',
      'import ../../../api/theme/themeUse.doc.mjs',
      'import ./theme-add.doc.mjs',
      'import ./theme-build.doc.mjs',
      'import ./theme-eject.doc.mjs',
      'import ./theme-list.doc.mjs',
      'import ./theme-palette-generate.doc.mjs',
      'import ./theme-palette.doc.mjs',
      'import ./theme-remove.doc.mjs',
      'import ./theme-targets.doc.mjs',
      'import ./theme-template.doc.mjs',
      'import ./theme-use.doc.mjs',
      'import ./theme.doc.mjs',
    ],
  },
  'clients/cli/commands/build.mjs': {
    runs: SELF_DOCS,
    sites: [
      'import ../../../api/build/build.doc.mjs',
      'import ./build.doc.mjs',
    ],
  },
  'clients/cli/commands/component.mjs': {
    runs: SELF_DOCS,
    sites: [
      'import ../../../api/component/component.doc.mjs',
      'import ./component.doc.mjs',
    ],
  },
  'clients/cli/commands/discover.mjs': {
    runs: SELF_DOCS,
    sites: [
      'import ../../../api/discover/discover.doc.mjs',
      'import ./discover.doc.mjs',
    ],
  },
  'clients/cli/commands/docs.mjs': {
    runs: SELF_DOCS,
    sites: ['import ../../../api/docs/docs.doc.mjs', 'import ./docs.doc.mjs'],
  },
  'clients/cli/commands/doctor.mjs': {
    runs: SELF_DOCS,
    sites: [
      'import ../../../api/doctor/doctor.doc.mjs',
      'import ../../../api/integration/integrationComponentConflicts.doc.mjs',
      'import ../../../api/integration/integrationDocConflicts.doc.mjs',
      'import ../../../api/integration/integrationTemplateConflicts.doc.mjs',
      'import ../../../api/integration/validateIntegration.doc.mjs',
      'import ./doctor-integration-components.doc.mjs',
      'import ./doctor-integration-docs.doc.mjs',
      'import ./doctor-integration-templates.doc.mjs',
      'import ./doctor-integration-validate.doc.mjs',
      'import ./doctor-integration.doc.mjs',
      'import ./doctor.doc.mjs',
    ],
  },
  'clients/cli/commands/ensure-core-built.mjs': {
    runs: '`pnpm -F @astryxdesign/core build`: a test helper that builds core once for the theme-build suites',
    sites: ['child_process.execFileSync'],
  },
  'clients/cli/commands/gap-report.mjs': {
    runs: SELF_DOCS,
    sites: [
      'import ../../../api/gap-report/gap-report.doc.mjs',
      'import ./gap-report.doc.mjs',
    ],
  },
  'clients/cli/commands/hook.mjs': {
    runs: SELF_DOCS,
    sites: ['import ../../../api/hook/hook.doc.mjs', 'import ./hook.doc.mjs'],
  },
  'clients/cli/commands/init.mjs': {
    runs: SELF_DOCS,
    sites: ['import ../../../api/init/init.doc.mjs', 'import ./init.doc.mjs'],
  },
  'clients/cli/commands/integration.mjs': {
    runs: SELF_DOCS,
    sites: [
      'import ../../../api/integration/integrationAdd.doc.mjs',
      'import ../../../api/integration/integrationCheck.doc.mjs',
      'import ../../../api/integration/integrationPackCheck.doc.mjs',
      'import ./integration-add.doc.mjs',
      'import ./integration-check.doc.mjs',
      'import ./integration-pack.doc.mjs',
      'import ./integration-verify.doc.mjs',
      'import ./integration.doc.mjs',
    ],
  },
  'clients/cli/commands/search.mjs': {
    runs: SELF_DOCS,
    sites: [
      'import ../../../api/search/search.doc.mjs',
      'import ./search.doc.mjs',
    ],
  },
  'clients/cli/commands/swizzle.mjs': {
    runs: SELF_DOCS,
    sites: [
      'import ../../../api/swizzle/swizzle.doc.mjs',
      'import ./swizzle.doc.mjs',
    ],
  },
  'clients/cli/commands/template.mjs': {
    runs: SELF_DOCS,
    sites: [
      'import ../../../api/template/template.doc.mjs',
      'import ./template.doc.mjs',
    ],
  },
  'clients/cli/commands/upgrade.mjs': {
    runs: SELF_DOCS,
    sites: [
      'import ../../../api/upgrade/upgrade.doc.mjs',
      'import ./upgrade.doc.mjs',
    ],
  },
  'clients/cli/index.mjs': {
    runs: 'the command modules, to register each command',
    sites: ['import(<computed>)'],
  },
  'clients/cli/lib/manifest.mjs': {
    runs: 'the manifest command doc, for the exit codes the manifest reports',
    sites: ['import ../commands/manifest.doc.mjs'],
  },
  'clients/cli/lib/resolve-theme.mjs': {
    runs: 'the generated record default theme, or the released package.json astryx.theme value when no record exists',
    sites: ['require(<computed>)'],
  },
  'foundation/config/project.mjs': {
    runs: 'astryx.config, through the config parser',
    sites: ['loadModuleWithParser(..., parseConfig)'],
  },
  'foundation/agent-docs/agent-docs.mjs': {
    runs: 'git, sl or hg, to read whether the repository ignores an untracked agent file',
    sites: ['child_process.spawnSync'],
  },
  'foundation/fs/file-protection.mjs': {
    runs: 'the ignore matcher (CommonJS), loaded when a resolver first reads an ignore file',
    sites: ['require(ignore)'],
  },
  'foundation/discovery/component-discovery.mjs': {
    runs: '@babel/parser, on first use, to read the members a family doc lists in its components without running the doc',
    sites: ['require(@babel/parser)'],
  },
  'foundation/discovery/copied-passages.mjs': {
    runs: "the CLI's own guides and the package's topics, to compare their prose for passages two topics repeat",
    sites: ['builtinGuideFiles', 'loadTopicModule'],
  },
  'foundation/discovery/doc-consistency.mjs': {
    runs: "a package's component docs and topics, to read the props, overlays, sections, and replaces/extends they declare",
    sites: ['importDocModule ×2'],
  },
  'foundation/discovery/doc-stability.mjs': {
    runs: "an integration's template docs, to see which set `stability`",
    sites: ['loadTopicModule'],
  },
  'foundation/discovery/template-icon-notes.mjs': {
    runs: "an integration's template docs, to read the icons each declares",
    sites: ['loadTopicModule'],
  },
  'foundation/discovery/doc-fluff.mjs': {
    runs: "the CLI's own guides, to measure the median share of content words a topic's density is compared with",
    sites: ['builtinGuideFiles'],
  },
  'foundation/discovery/docs-discovery.mjs': {
    runs: 'a contributed topic, for its catalog fields: name, title, description, category, and relationships',
    sites: ['importDocModule'],
  },
  'foundation/discovery/runner-commands.mjs': {
    runs: "the package's topics, to find each Astryx command written with a package runner",
    sites: ['loadTopicModule'],
  },
  'foundation/discovery/stray-pointers.mjs': {
    runs: "the CLI's own guides, for their names, to tell which written `astryx docs <name>` points at a doc that exists",
    sites: ['builtinGuideFiles'],
  },
  'foundation/discovery/project-typescript.mjs': {
    runs: "the project's own typescript, for the author checks that read source and docs with it, and its package.json for the version of one they cannot use; beside TypeScript 7, which has no compiler API, the TypeScript 6 API package @typescript/typescript6",
    sites: [
      'require(<computed>)',
      'require(typescript)',
      'require(typescript/package.json)',
    ],
  },
  'foundation/discovery/template-adapter.mjs': {
    runs: '@babel/parser, to find the fixture references and page-local bindings in template source; and a template doc that does not validate, to read the replacement it declares',
    sites: ['importDocModule', 'require(@babel/parser)'],
  },
  'foundation/discovery/theme-discovery.mjs': {
    runs: '@babel/parser and jscodeshift (CommonJS), each on first use, so listing bundled themes never loads jscodeshift',
    sites: ['require(@babel/parser)', 'require(jscodeshift)'],
  },
  'foundation/doc-compiler/import.mjs': {
    runs: 'authored doc files, for the doc reader and discovery, and again after an edit',
    sites: [
      '.import() ×2',
      'createJiti ×2',
      'import(<computed>) ×4',
      'importUserModule ×2',
    ],
  },
  'foundation/doc-compiler/read.mjs': {
    runs: 'authored doc files, each one handed to the compiler, with the loader its reader has always used',
    sites: ['importDocModule', 'importNativeModule ×3', 'importTemplateModule'],
  },
  'foundation/render/page-worker.mjs': {
    runs: 'the page `astryx experimental render` renders, its local modules, React, and the StyleX compiler, in a worker',
    sites: ['.import() ×3', 'createJiti ×2', 'require(@stylexjs/babel-plugin)'],
  },
  'foundation/render/render-page.mjs': {
    runs: 'the render worker, so a page that never finishes can be stopped',
    sites: ['worker_threads.Worker'],
  },
  'foundation/fs/module-loader.mjs': {
    runs: 'user modules (config, manifests, handlers, codemods): natively, through jiti, or by require for a fresh CommonJS read',
    sites: [
      '.import() ×3',
      'createJiti ×3',
      'import(<computed>)',
      'require(<computed>)',
      'require.cache',
    ],
  },
  'foundation/fs/read-record.mjs': {
    runs: "nothing; it wraps node:fs's read calls to record the paths an operation reads, and republishes them to ESM imports",
    sites: ['module.syncBuiltinESMExports'],
  },
  'foundation/fs/paths.mjs': {
    runs: "Yarn's pnpapi, under Plug'n'Play, to find an installed package",
    sites: ['require(pnpapi)'],
  },
  'foundation/integrations/integrations.mjs': {
    runs: "each installed integration's manifest",
    sites: ['importUserModule'],
  },
  'foundation/integrations/validate-contributions.mjs': {
    runs: "`npm pack --dry-run --json --ignore-scripts`, to read which files an integration's package holds when a template loads an asset (no lifecycle script runs, nothing is written)",
    sites: ['child_process.spawnSync'],
  },
  'foundation/release/cache.mjs': {
    runs: 'npm (under npm-guard.mjs), to install and look up CLI releases in the per-user cache; each installed release once, to check it starts and reports its version; and ps (tasklist on Windows), to confirm the process a stale lock records is node or npm before ending it',
    sites: ['child_process.spawnSync ×5'],
  },
  'foundation/release/npm-guard.mjs': {
    runs: 'npm, in a process group of its own that it ends at the time limit, on Ctrl-C, or when the run that started it goes away',
    sites: ['child_process.spawn'],
  },
  'foundation/release/global-state.mjs': {
    runs: "the background check of the registry's `latest` release, the agent-text step, and the step that installs the global copy's own Core into the release cache, each detached",
    sites: ['child_process.spawn'],
  },
  'foundation/release/handoff.mjs': {
    runs: "the CLI release that answers a project's run, when it is not this copy",
    sites: ['child_process.spawn'],
  },
  'host/index.mjs': {
    runs: "another release's host entry, from one of the host's package sets, when that release answers a hosted run",
    sites: ['import(<computed>)'],
  },
  'scripts/generate-cli-readme.mjs': {
    runs: '`astryx manifest` and the error-code and response-type docs, to write the README tables (build time, not shipped)',
    sites: ['child_process.spawnSync', 'import(<computed>)'],
  },
  'scripts/sync-api-types.mjs': {
    runs: '`tsc`, to emit the API declarations (build time, not shipped)',
    sites: ['child_process.execFileSync'],
  },
};

/**
 * Modules that hand back whatever module or doc they are pointed at. Every
 * export is a loader except those named here, which hand back no module.
 * @type {Record<string, string[]>}
 */
const LOADER_MODULES = {
  'foundation/doc-compiler/import.mjs': [],
  'foundation/fs/module-loader.mjs': ['findPresentFiles'],
  // loadTopicModule hands back a topic's raw doc.
  'foundation/discovery/docs-discovery.mjs': [
    'BUILTIN_DOCS_PACKAGE',
    'DocsCatalog',
    'discoverBuiltinTopics',
    'discoverIntegrationDocs',
    'GRAPH_BLOCK_TYPES',
    'GRAPH_ONLY_FIELDS',
    'isGuideRoute',
    'mergeTopic',
    'mergeTopicReport',
    'problemsInTopic',
    'withoutPosition',
    'withSourceTitle',
  ],
};

/**
 * Built-ins that run code. Every export counts except those named here.
 * @type {Record<string, string[]>}
 */
const RUNNER_BUILTINS = {
  child_process: [],
  cluster: [],
  inspector: [],
  'inspector/promises': [],
  module: [
    'builtinModules',
    'constants',
    'enableCompileCache',
    'findPackageJSON',
    'findSourceMap',
    'flushCompileCache',
    'getCompileCacheDir',
    'isBuiltin',
    'SourceMap',
    'stripTypeScriptTypes',
  ],
  repl: [],
  test: [],
  vm: [],
  worker_threads: [
    'BroadcastChannel',
    'isMainThread',
    'MessageChannel',
    'MessagePort',
    'parentPort',
    'threadId',
    'workerData',
  ],
};

/** Packages whose every export runs modules. */
const RUNNER_PACKAGES = new Set(['jiti']);

/** Globals that run code, and the objects they can be read from. */
const RUNNER_GLOBALS = new Set([
  'eval',
  'Function',
  'ShadowRealm',
  'SharedWorker',
  'Worker',
]);
const GLOBAL_OBJECTS = new Set(['globalThis', 'global', 'self', 'window']);

/** Members of `process` that run code. */
const PROCESS_RUNNERS = new Set([
  'binding',
  'dlopen',
  'execve',
  'getBuiltinModule',
]);

/** Members of `WebAssembly` that run code. */
const WASM_RUNNERS = new Set([
  'compile',
  'compileStreaming',
  'Instance',
  'instantiate',
  'instantiateStreaming',
  'Module',
]);

/** URL schemes that carry code rather than name a file in this package. */
const CODE_URL = /^(?:data|blob|https?):/;

/** Methods that run code whatever they are called on: jiti's, vm's, a realm's. */
const RUNNER_METHODS = new Set([
  'compileFunction',
  'evalModule',
  'import',
  'importValue',
  'runInContext',
  'runInNewContext',
  'runInThisContext',
]);

/** A doc file specifier: `x.doc.mjs`, `x.doc.ts`, `x.doc.zh.mjs`, `x.doc`. */
const DOC_FILE = /\.doc(?:\.[\w-]+)?(?:\.[cm]?[jt]sx?)?$/;

/** Syntax that only types; it never runs. */
const TYPE_ONLY = new Set([
  'TSDeclareFunction',
  'TSDeclareMethod',
  'TSInterfaceDeclaration',
  'TSTypeAliasDeclaration',
  'TSTypeAnnotation',
  'TSTypeParameterDeclaration',
  'TSTypeParameterInstantiation',
]);

/** Values whose `.constructor` reaches Function in a step or two. */
const LITERALS = new Set([
  'ArrayExpression',
  'ArrowFunctionExpression',
  'ClassExpression',
  'FunctionExpression',
  'NumericLiteral',
  'ObjectExpression',
  'RegExpLiteral',
  'StringLiteral',
  'TemplateLiteral',
]);

/** A code file Node or jiti can run. */
const CODE_FILE = /\.(?:[cm]?[jt]s|[jt]sx)$/;
/** Directories that hold no code the CLI runs as itself, by name... */
const UNSCANNED_NAMES = new Set(['node_modules', '__fixtures__', '__tests__']);
/**
 * ...and the temporary folders tests create with mkdtemp (`__<prefix>_XXXXXX`)
 * and delete while this scan runs. Any other `__*` folder is scanned.
 */
const TRANSIENT_DIR = /^__[a-z][a-z_]*_[A-Za-z0-9]{6}$/;
/** ...and by path: tests, and the authored docs and templates. */
const UNSCANNED_PATHS = new Set([
  'assets/docs',
  'assets/templates',
  'test',
  'test-utils',
]);

/** @param {string} full @returns {string} */
const relOf = full => path.relative(CLI_ROOT, full).split(path.sep).join('/');

/**
 * Every code file under `dir` the CLI can run as itself: not a test, fixture,
 * dependency, generated `.d.mts`, or file in a hidden (transient) directory.
 * @param {string} dir
 * @returns {string[]}
 */
function sources(dir) {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const skip =
        entry.name.startsWith('.') ||
        TRANSIENT_DIR.test(entry.name) ||
        UNSCANNED_NAMES.has(entry.name) ||
        UNSCANNED_PATHS.has(relOf(full));
      return skip ? [] : sources(full);
    }
    const code =
      CODE_FILE.test(entry.name) &&
      !/\.test\.[^.]+$/.test(entry.name) &&
      !entry.name.endsWith('.d.mts');
    return code ? [full] : [];
  });
}

/**
 * @param {string} source
 * @param {string} rel
 */
function parseModule(source, rel) {
  const typescript = /\.[cm]?tsx?$/.test(rel);
  /** @type {import('@babel/parser').ParserPlugin[]} */
  const plugins = typescript
    ? [['typescript', {dts: /\.d\.[cm]?ts$/.test(rel)}]]
    : [];
  if (!typescript || rel.endsWith('x')) plugins.push('jsx');
  return parse(source, {
    sourceType: rel.endsWith('.cjs') ? 'script' : 'module',
    allowReturnOutsideFunction: rel.endsWith('.cjs'),
    plugins,
  });
}

/**
 * Visit every node that runs, depth first, with its ancestors.
 * @param {any} node
 * @param {any[]} ancestors
 * @param {(node: any, ancestors: any[]) => void} visit
 */
function walk(node, ancestors, visit) {
  if (typeof node?.type !== 'string') return;
  if (TYPE_ONLY.has(node.type) || isTSType(node) || node.declare) return;
  if (node.importKind === 'type' || node.exportKind === 'type') return;
  visit(node, ancestors);
  ancestors.push(node);
  for (const key of VISITOR_KEYS[node.type] ?? []) {
    for (const child of [node[key]].flat()) walk(child, ancestors, visit);
  }
  ancestors.pop();
}

/** @param {any} node @returns {string | undefined} */
function stringValue(node) {
  if (node?.type === 'StringLiteral') return node.value;
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0].value.cooked;
  }
  return undefined;
}

/** @param {any} node @returns {string} */
const nameOf = node => (node.type === 'Identifier' ? node.name : node.value);

/** @param {any} node @returns {boolean} */
const isMember = node =>
  node?.type === 'MemberExpression' ||
  node?.type === 'OptionalMemberExpression';

/** @param {any} node @returns {boolean} */
const isCall = node =>
  node?.type === 'CallExpression' ||
  node?.type === 'OptionalCallExpression' ||
  node?.type === 'NewExpression';

/** @param {any} member @returns {string | undefined} */
const memberName = member =>
  member.computed ? stringValue(member.property) : member.property.name;

/** @param {string} specifier */
const withoutQuery = specifier => specifier.replace(/[?#].*$/, '');

/**
 * @typedef {object} Target
 * @property {'doc' | 'url' | 'unscanned' | 'loader' | 'builtin' | 'package'}
 *   kind — `url`: code carried by the specifier or fetched, not a file in this
 *   package; `unscanned`: a file in a part of the package this test does not
 *   scan
 * @property {string} key
 */

/**
 * What an import specifier names, seen from `rel`, when it matters here.
 * @param {string} specifier
 * @param {string} rel
 * @returns {Target | null}
 */
function targetOf(specifier, rel) {
  if (CODE_URL.test(specifier)) return {kind: 'url', key: specifier};
  let file = withoutQuery(specifier);
  const local = /^(?:\.|\/|file:)/.test(file);
  if (local) {
    try {
      file = decodeURIComponent(file);
    } catch {
      // A malformed escape names no file; compare it as written.
    }
  }
  if (DOC_FILE.test(file)) return {kind: 'doc', key: specifier};
  if (isBuiltin(file)) {
    const name = file.replace(/^node:/, '');
    return Object.hasOwn(RUNNER_BUILTINS, name)
      ? {kind: 'builtin', key: name}
      : null;
  }
  if (local) {
    const resolved = file.startsWith('.')
      ? path.posix.join(path.posix.dirname(rel), file)
      : file.replace(/^file:\/\//, '');
    // Extension-free and case-free: TypeScript and case-insensitive disks
    // resolve both.
    /** @param {string} p */
    const stem = p =>
      p.toLowerCase().replace(/(?:\/index)?\.[cm]?[jt]sx?$/, '');
    const loader = Object.keys(LOADER_MODULES).find(
      mod =>
        stem(resolved) === stem(mod) ||
        stem(resolved).endsWith(`/${stem(mod)}`),
    );
    if (loader) return {kind: 'loader', key: loader};
    const unscanned =
      [...UNSCANNED_PATHS].some(dir => resolved.startsWith(`${dir}/`)) ||
      resolved
        .split('/')
        .slice(0, -1)
        .some(
          part =>
            UNSCANNED_NAMES.has(part) ||
            TRANSIENT_DIR.test(part) ||
            (part.startsWith('.') && part !== '..'),
        ) ||
      /\.test\.[^./]+$/.test(resolved);
    return unscanned ? {kind: 'unscanned', key: specifier} : null;
  }
  const pkg = file
    .split('/')
    .slice(0, file.startsWith('@') ? 2 : 1)
    .join('/');
  return RUNNER_PACKAGES.has(pkg) ? {kind: 'package', key: pkg} : null;
}

/** Targets whose every export is code this test does not read. */
const UNREAD = new Set(['doc', 'unscanned', 'url']);

/** @param {Target} target @returns {string[]} */
function inertExports(target) {
  if (target.kind === 'loader') return LOADER_MODULES[target.key];
  if (target.kind === 'builtin') return RUNNER_BUILTINS[target.key];
  return [];
}

/**
 * Every ordinary place `source` runs code outside its static imports, as
 * labels (deliberate obfuscation is out of scope, as the file header says):
 *
 * - a static import or re-export of a doc file, or of a file this test does
 *   not scan;
 * - a use of a loader module's export under any local name: called, passed,
 *   re-exported, or read off a namespace;
 * - `import()` of a computed specifier, a doc file, a loader module, or a
 *   built-in or package that runs code;
 * - a require function, CommonJS or from createRequire, called or passed on
 *   (resolving is not running);
 * - an export of jiti, or a code-running export of child_process, cluster,
 *   inspector, module, repl, test, vm, or worker_threads, imported or
 *   fetched with getBuiltinModule;
 * - eval, Function (also as any called `.constructor`), ShadowRealm, a
 *   global Worker, `module.require`; a jiti, vm, or realm method on anything;
 * - a doc file resolved as a module.
 *
 * Names are matched without scope analysis, so a shadowing local cannot hide
 * a loader; it can only add a site.
 * @param {string} source
 * @param {string} rel path under packages/cli
 * @returns {{sites: string[], problems: string[]}}
 */
function scanModule(source, rel) {
  const program = parseModule(source, rel).program;
  /** @type {string[]} */
  const sites = [];
  /** @type {string[]} */
  const problems = [];
  /** @type {Map<string, {target: Target, imported: string | null}>} */
  const bindings = new Map();
  /** Local names holding a require function; CommonJS has `require`. */
  const requires = new Set(['require']);
  /** Local names holding the global object. */
  const globals = new Set(GLOBAL_OBJECTS);

  walk(program, [], node => {
    if (node.type === 'ImportDeclaration') {
      const target = targetOf(node.source.value, rel);
      if (!target || UNREAD.has(target.kind)) return;
      for (const specifier of node.specifiers) {
        if (specifier.importKind === 'type') continue;
        const imported =
          specifier.type === 'ImportSpecifier'
            ? nameOf(specifier.imported)
            : null;
        bindings.set(specifier.local.name, {
          target,
          imported: imported === 'default' ? null : imported,
        });
      }
    } else if (
      node.type === 'TSImportEqualsDeclaration' &&
      node.moduleReference.type === 'TSExternalModuleReference'
    ) {
      const target = targetOf(node.moduleReference.expression.value, rel);
      if (target && !UNREAD.has(target.kind)) {
        bindings.set(node.id.name, {target, imported: null});
      }
    }
  });

  /** @param {any} expr `createRequire` from `module`, under any name */
  const isCreateRequire = expr => {
    const id = isMember(expr) ? expr.object : expr;
    const binding = id?.type === 'Identifier' ? bindings.get(id.name) : null;
    if (binding?.target.kind !== 'builtin' || binding.target.key !== 'module') {
      return false;
    }
    return isMember(expr)
      ? binding.imported === null && memberName(expr) === 'createRequire'
      : binding.imported === 'createRequire';
  };
  // A name bound to a require function or to the global object stands in for
  // it, and is bound before it is used.
  walk(program, [], node => {
    const [id, value] =
      node.type === 'VariableDeclarator'
        ? [node.id, node.init]
        : node.type === 'AssignmentExpression'
          ? [node.left, node.right]
          : [];
    if (id?.type !== 'Identifier') return;
    if (isCall(value) && isCreateRequire(value.callee)) requires.add(id.name);
    if (value?.type === 'Identifier' && globals.has(value.name)) {
      globals.add(id.name);
    }
  });

  /**
   * `const {eval: e} = globalThis`: taking the member is the site, whatever
   * the local name.
   * @param {any} pattern
   * @param {ReadonlySet<string>} runners
   * @param {string} owner
   */
  const destructured = (pattern, runners, owner) => {
    if (pattern?.type !== 'ObjectPattern') return;
    for (const property of pattern.properties) {
      const name =
        property.type === 'ObjectProperty'
          ? property.computed
            ? stringValue(property.key)
            : nameOf(property.key)
          : undefined;
      if (name === undefined) sites.push(`${owner}[<computed>]`);
      else if (runners.has(name)) sites.push(name);
    }
  };

  /** @param {any} node */
  const docResolve = node => {
    const specifier = stringValue(node);
    if (specifier !== undefined && DOC_FILE.test(withoutQuery(specifier))) {
      sites.push(`resolve(${specifier})`);
    }
  };

  /** @param {any} call */
  const requireCall = call => {
    const specifier = stringValue(call.arguments[0]);
    if (
      specifier !== undefined &&
      isBuiltin(specifier) &&
      !targetOf(specifier, rel)
    ) {
      return;
    }
    sites.push(`require(${specifier ?? '<computed>'})`);
  };

  /**
   * `process.getBuiltinModule`: a built-in without an import.
   * @param {any} call
   */
  const builtinGetter = call => {
    const specifier = stringValue(call.arguments[0]);
    if (specifier === undefined) sites.push('getBuiltinModule(<computed>)');
    else if (targetOf(specifier, rel)) {
      sites.push(`getBuiltinModule(${specifier})`);
    }
  };

  /**
   * `createRequire`: a site unless the require function it makes is kept by
   * name (tracked above), only resolves, or runs right here.
   * @param {any} ref
   * @param {any[]} ancestors
   */
  const createRequireSite = (ref, ancestors) => {
    const call = ancestors.at(-1);
    const up = ancestors.at(-2);
    const kept =
      (up?.type === 'VariableDeclarator' && up.init === call) ||
      (up?.type === 'AssignmentExpression' && up.right === call);
    if (!isCall(call) || call.callee !== ref) sites.push('createRequire');
    else if (isCall(up) && up.callee === call) requireCall(up);
    else if (isMember(up) && up.object === call) {
      if (memberName(up) !== 'resolve') sites.push('createRequire');
    } else if (!kept || (up.id ?? up.left).type !== 'Identifier') {
      sites.push('createRequire');
    }
  };

  /**
   * `loadModuleWithParser`: the parser it is handed says what it loads.
   * @param {any} ref
   * @param {any[]} ancestors
   */
  const parserSite = (ref, ancestors) => {
    const call = ancestors.at(-1);
    if (!isCall(call) || call.callee !== ref) {
      sites.push('loadModuleWithParser');
      return;
    }
    const parser = call.arguments[1];
    const text = parser
      ? source.slice(parser.start, parser.end).replace(/\s+/g, ' ')
      : '';
    sites.push(`loadModuleWithParser(..., ${text})`);
    let docParser = false;
    walk(parser, [], node => {
      const name = node.type === 'Identifier' ? node.name : stringValue(node);
      docParser ||= name !== undefined && DOC_PARSERS.has(name);
    });
    if (docParser) {
      problems.push(
        `${rel}: loadModuleWithParser(..., ${text}) loads a doc outside the compiler`,
      );
    }
  };

  /**
   * @param {Target} target
   * @param {string} name the export used
   * @param {any} ref the expression that reads it
   * @param {any[]} ancestors
   */
  const exportSite = (target, name, ref, ancestors) => {
    if (inertExports(target).includes(name)) return;
    if (target.key === 'module' && name === 'createRequire') {
      createRequireSite(ref, ancestors);
    } else if (target.kind === 'loader' && name === 'loadModuleWithParser') {
      parserSite(ref, ancestors);
    } else {
      sites.push(target.kind === 'builtin' ? `${target.key}.${name}` : name);
    }
  };

  /**
   * @param {any} id an identifier that is read
   * @param {any[]} ancestors
   */
  const reference = (id, ancestors) => {
    const parent = ancestors.at(-1);
    const binding = bindings.get(id.name);
    if (binding) {
      const {target, imported} = binding;
      if (imported !== null) {
        exportSite(target, imported, id, ancestors);
      } else if (isMember(parent) && parent.object === id) {
        const name = memberName(parent);
        if (name === undefined) sites.push(`${target.key}[<computed>]`);
        else exportSite(target, name, parent, ancestors.slice(0, -1));
      } else {
        sites.push(target.key);
      }
    } else if (requires.has(id.name)) {
      if (isCall(parent) && parent.callee === id) requireCall(parent);
      else if (!isMember(parent) || parent.object !== id) sites.push('require');
      else if (memberName(parent) !== 'resolve') {
        sites.push(`require.${memberName(parent) ?? '<computed>'}`);
      }
    } else if (id.name === 'getBuiltinModule') {
      if (isCall(parent) && parent.callee === id) builtinGetter(parent);
      else sites.push('getBuiltinModule');
    } else if (
      RUNNER_GLOBALS.has(id.name) &&
      !(parent.operator === 'instanceof' && parent.right === id)
    ) {
      sites.push(id.name);
    }
  };

  walk(program, [], (node, ancestors) => {
    switch (node.type) {
      case 'VariableDeclarator':
      case 'AssignmentExpression': {
        const [id, value] =
          node.type === 'VariableDeclarator'
            ? [node.id, node.init]
            : [node.left, node.right];
        if (value?.type !== 'Identifier') return;
        if (globals.has(value.name))
          destructured(id, RUNNER_GLOBALS, value.name);
        else if (value.name === 'process') {
          destructured(id, PROCESS_RUNNERS, 'process');
        }
        return;
      }
      case 'ImportDeclaration':
      case 'ExportAllDeclaration':
      case 'ExportNamedDeclaration': {
        if (!node.source) return;
        const specifier = node.source.value;
        const target = targetOf(specifier, rel);
        if (!target) return;
        if (UNREAD.has(target.kind)) {
          const how =
            node.type === 'ImportDeclaration' ? 'import' : 'export from';
          sites.push(`${how} ${specifier}`);
        } else if (node.type === 'ExportAllDeclaration') {
          sites.push(`export * from ${specifier}`);
        } else if (node.type === 'ExportNamedDeclaration') {
          for (const s of node.specifiers) {
            if (s.exportKind === 'type') continue;
            const name = s.type === 'ExportSpecifier' ? nameOf(s.local) : '*';
            if (!inertExports(target).includes(name)) {
              sites.push(`export ${name} from ${specifier}`);
            }
          }
        }
        return;
      }
      case 'TSImportEqualsDeclaration': {
        const ref = node.moduleReference;
        if (ref.type !== 'TSExternalModuleReference') return;
        const specifier = ref.expression.value;
        const target = targetOf(specifier, rel);
        if (target && UNREAD.has(target.kind)) {
          sites.push(`import ${specifier}`);
        } else if (target && node.isExport) {
          sites.push(`export * from ${specifier}`);
        }
        return;
      }
      case 'ImportExpression':
      case 'CallExpression':
      case 'OptionalCallExpression': {
        if (node.type === 'ImportExpression' || node.callee.type === 'Import') {
          const specifier = stringValue(
            node.type === 'ImportExpression' ? node.source : node.arguments[0],
          );
          if (specifier === undefined) sites.push('import(<computed>)');
          else if (targetOf(specifier, rel)) sites.push(`import(${specifier})`);
          return;
        }
        const callee = node.callee;
        if (!isMember(callee)) return;
        const name = memberName(callee);
        const object = callee.object;
        if (name === 'constructor') sites.push('.constructor()');
        if (name === 'getBuiltinModule') builtinGetter(node);
        if (
          name === 'get' &&
          object.type === 'Identifier' &&
          object.name === 'Reflect'
        ) {
          const key = stringValue(node.arguments[1]);
          if (
            key !== undefined &&
            (RUNNER_GLOBALS.has(key) || PROCESS_RUNNERS.has(key))
          ) {
            sites.push(key);
          }
        }
        const resolver =
          object.type === 'MetaProperty' ||
          (object.type === 'Identifier' && requires.has(object.name)) ||
          (isCall(object) && isCreateRequire(object.callee));
        if (name === 'resolve' && resolver) docResolve(node.arguments[0]);
        if (
          name !== undefined &&
          RUNNER_METHODS.has(name) &&
          !(object.type === 'Identifier' && bindings.has(object.name))
        ) {
          sites.push(`.${name}()`);
        }
        return;
      }
      case 'NewExpression':
        if (node.callee.type === 'Identifier' && node.callee.name === 'URL') {
          docResolve(node.arguments[0]);
        }
        return;
      case 'MemberExpression':
      case 'OptionalMemberExpression': {
        const object = node.object;
        const name = memberName(node);
        const global =
          (object.type === 'Identifier' && globals.has(object.name)) ||
          (isMember(object) &&
            object.object.type === 'Identifier' &&
            globals.has(object.object.name));
        if (name === 'constructor' && LITERALS.has(object.type)) {
          sites.push('.constructor');
        } else if (
          WASM_RUNNERS.has(name ?? '') &&
          ((object.type === 'Identifier' && object.name === 'WebAssembly') ||
            (isMember(object) && memberName(object) === 'WebAssembly'))
        ) {
          sites.push(`WebAssembly.${name}`);
        } else if (isMember(object)) {
          return;
        } else if (object.type !== 'Identifier' || bindings.has(object.name)) {
          return;
        } else if (object.name === 'module') {
          if (name === 'require' || name === 'constructor') {
            sites.push(`module.${name}`);
          }
        } else if (object.name === 'process') {
          if (name !== 'getBuiltinModule' && PROCESS_RUNNERS.has(name ?? '')) {
            sites.push(`process.${name}`);
          }
        } else if (global) {
          if (name === undefined) sites.push(`${object.name}[<computed>]`);
          else if (RUNNER_GLOBALS.has(name)) sites.push(name);
        }
        return;
      }
      case 'Identifier': {
        const parent = ancestors.at(-1);
        if (parent?.type === 'TSImportEqualsDeclaration') return;
        if (parent && isReferenced(node, parent, ancestors.at(-2))) {
          reference(node, ancestors);
        }
        return;
      }
    }
  });

  return {sites, problems};
}

/**
 * The names a module exports.
 * @param {string} source
 * @param {string} rel
 * @returns {string[]}
 */
function exportNames(source, rel) {
  return parseModule(source, rel).program.body.flatMap(
    (/** @type {any} */ node) => {
      if (node.type === 'ExportDefaultDeclaration') return ['default'];
      if (node.type !== 'ExportNamedDeclaration') return [];
      const declaration = node.declaration;
      return [
        ...(declaration?.id ? [declaration.id.name] : []),
        ...(declaration?.declarations ?? []).map(
          (/** @type {any} */ d) => d.id.name,
        ),
        ...node.specifiers.map((/** @type {any} */ s) => nameOf(s.exported)),
      ];
    },
  );
}

/** @param {string} rel */
const read = rel => fs.readFileSync(path.join(CLI_ROOT, rel), 'utf8');

/** Every doc kind's parser: the `parse*` exports under authoring/doctypes. */
const DOC_PARSERS = new Set(
  sources(path.join(CLI_ROOT, 'authoring/doctypes')).flatMap(full =>
    exportNames(read(relOf(full)), relOf(full)).filter(name =>
      /^parse[A-Z]/.test(name),
    ),
  ),
);

/**
 * A module's sites as the list writes them: sorted, repeats counted.
 * @param {string[]} sites
 * @returns {string[]}
 */
function tally(sites) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const site of sites) counts.set(site, (counts.get(site) ?? 0) + 1);
  return [...counts]
    .map(([site, n]) => (n === 1 ? site : `${site} ×${n}`))
    .sort();
}

/**
 * How one module breaks the list: sites other than its entry's, or a doc
 * parser handed to a generic loader, which no entry can allow.
 * @param {string} rel
 * @param {string} source
 * @param {readonly string[]} [entry] the listed sites
 * @returns {string[]}
 */
function violations(rel, source, entry = RUNNERS[rel]?.sites ?? []) {
  const {sites, problems} = scanModule(source, rel);
  const found = tally(sites);
  const listed = [...entry].sort();
  const same = found.join('\n') === listed.join('\n');
  return same
    ? problems
    : [
        ...problems,
        `${rel} runs [${found.join(', ')}], listed [${listed.join(', ')}]`,
      ];
}

describe('every module that runs code outside its static imports is listed', () => {
  const scanned = sources(CLI_ROOT).map(relOf);

  it('lists each one with exactly the sites it has', () => {
    const found = scanned.flatMap(rel => {
      try {
        return violations(rel, read(rel));
      } catch (error) {
        return [
          `${rel} does not parse: ${/** @type {Error} */ (error).message}`,
        ];
      }
    });
    expect(found).toEqual([]);
  });

  it('lists no module that is gone', () => {
    expect(Object.keys(RUNNERS).filter(rel => !scanned.includes(rel))).toEqual(
      [],
    );
  });

  it('names only exports the loader modules still have', () => {
    const stale = Object.entries(LOADER_MODULES).flatMap(([rel, inert]) => {
      const names = exportNames(read(rel), rel);
      return inert
        .filter(name => !names.includes(name))
        .map(n => `${rel}#${n}`);
    });
    expect(stale).toEqual([]);
  });
});

/** A module the list does not name. */
const LEAF = 'api/leaf/leaf.mjs';
const MODULE_LOADER = "'../../foundation/fs/module-loader.mjs'";
const IMPORTERS = "'../../foundation/doc-compiler/import.mjs'";

/**
 * A listed module's real source, edited.
 * @param {string} rel
 * @param {(source: string) => string} edit
 */
const edited = (rel, edit) => {
  const code = edit(read(rel));
  if (code === read(rel)) throw new Error(`the edit to ${rel} changed nothing`);
  return {file: rel, code};
};

/**
 * Ways to run a doc file (or any module) that the list must catch.
 * @type {Array<{name: string, file: string, code: string}>}
 */
const BYPASSES = [
  // The 23 cases from review of the first scan.
  ['computed import(file)', 'const m = await import(file);'],
  [
    'importUserModule(docPath)',
    `import {importUserModule} from ${MODULE_LOADER};\nawait importUserModule(docPath);`,
  ],
  [
    'a static import of a doc file',
    "import {doc} from './Button.doc.mjs';\nconsole.log(doc);",
  ],
  [
    'a static default import of a doc file',
    "import doc from '../../foundation/x/Button.doc.mjs';",
  ],
  [
    'a literal dynamic import of a doc file',
    "await import('/abs/node_modules/@acme/kit/components/Foo.doc.mjs');",
  ],
  [
    'createRequire(...)(docPath)',
    "import {createRequire} from 'node:module';\ncreateRequire(import.meta.url)(docPath);",
  ],
  [
    'require = createRequire(...); require(docPath)',
    "import {createRequire} from 'node:module';\nconst require = createRequire(import.meta.url);\nrequire(docPath);",
  ],
  ["eval('import(docPath)')", "await eval('import(docPath)');"],
  [
    "new Function('p', 'return import(p)')",
    "await new Function('p', 'return import(p)')(docPath);",
  ],
  [
    "jiti['import'](docPath)",
    "import {createJiti} from 'jiti';\nawait createJiti(import.meta.url)['import'](docPath);",
  ],
  [
    'a jiti instance called as require',
    "import {createJiti} from 'jiti';\nconst jiti = createJiti(import.meta.url);\njiti(docPath);",
  ],
  [
    'loader.importUserModule(docPath) through a namespace import',
    `import * as loader from ${MODULE_LOADER};\nawait loader.importUserModule(docPath);`,
  ],
  [
    'a renamed import of a loader',
    `import {importUserModule as load} from ${MODULE_LOADER};\nawait load(docPath);`,
  ],
  [
    'files.map(importUserModule): a loader passed as a value',
    `import {importUserModule} from ${MODULE_LOADER};\nawait Promise.all(files.map(importUserModule));`,
  ],
  [
    'importUserModule.call(null, docPath)',
    `import {importUserModule} from ${MODULE_LOADER};\nawait importUserModule.call(null, docPath);`,
  ],
  [
    'a re-export of the doc importers',
    `export {importDocModule} from ${IMPORTERS};`,
  ],
  [
    'a literal dynamic import of the doc importers',
    `const {importDocModule} = await import(${IMPORTERS});\nawait importDocModule(docPath);`,
  ],
  [
    'loadModuleWithParser(file, parsers.parseDoc)',
    `import {loadModuleWithParser} from ${MODULE_LOADER};\nawait loadModuleWithParser(file, parsers.parseDoc);`,
  ],
  [
    'loadModuleWithParser(file, x => parseDoc(x))',
    `import {loadModuleWithParser} from ${MODULE_LOADER};\nawait loadModuleWithParser(file, x => parseDoc(x));`,
  ],
  [
    'new Worker(docPath)',
    "import {Worker} from 'node:worker_threads';\nnew Worker(docPath);",
  ],
  [
    'child_process fork(docPath)',
    "import {fork} from 'node:child_process';\nfork(docPath);",
  ],
  [
    'vm.runInThisContext(readFileSync(docPath))',
    "import vm from 'node:vm';\nimport fs from 'node:fs';\nvm.runInThisContext(fs.readFileSync(docPath, 'utf8'));",
  ],
  [
    'import.meta.resolve of a doc file',
    "const url = import.meta.resolve('./Button.doc.mjs');",
  ],
  // The same, reached another way.
  [
    'importUserModule.apply(null, [docPath])',
    `import {importUserModule} from ${MODULE_LOADER};\nawait importUserModule.apply(null, [docPath]);`,
  ],
  [
    'a dynamic import of import.mjs, then m.importDocModule(docPath)',
    `const m = await import(${IMPORTERS});\nawait m.importDocModule(docPath);`,
  ],
  ['export * from import.mjs', `export * from ${IMPORTERS};`],
  [
    'a namespace of import.mjs passed on',
    `import * as importers from ${IMPORTERS};\nexport default importers;`,
  ],
  [
    'a computed member of a loader namespace',
    `import * as loader from ${MODULE_LOADER};\nloader[name](docPath);`,
  ],
  [
    'a loader re-exported by a local export',
    `import {importUserModule} from ${MODULE_LOADER};\nexport {importUserModule};`,
  ],
  [
    'a loader in an object shorthand',
    `import {importUserModule} from ${MODULE_LOADER};\nexport const api = {importUserModule};`,
  ],
  [
    'a loader behind a block-scoped shadow',
    `import {importUserModule as load} from ${MODULE_LOADER};\nexport function f(p) {\n  { const load = () => {}; }\n  return load(p);\n}`,
  ],
  [
    'a loader import with a query string',
    "import {importDocModule} from '../../foundation/doc-compiler/import.mjs?v=1';\nimportDocModule(docPath);",
  ],
  [
    'a loader import with an escaped character',
    "import {importDocModule} from '../../foundation/doc-compiler/%69mport.mjs';\nimportDocModule(docPath);",
  ],
  [
    'a raw topic loader from discovery',
    "import {loadTopicModule} from '../../foundation/discovery/docs-discovery.mjs';\nawait loadTopicModule(docPath);",
  ],
  ['a side-effect import of a doc file', "import './Button.doc.mjs';"],
  [
    'a static import of a doc overlay',
    "import {docsZh} from './Button.doc.zh.mjs';",
  ],
  ['a re-export of a doc file', "export {doc} from './Button.doc.mjs';"],
  [
    'Module.createRequire(...)(docPath) through a default import',
    "import Module from 'node:module';\nModule.createRequire(import.meta.url)(docPath);",
  ],
  [
    'a require function passed on',
    "import {createRequire} from 'node:module';\nconst r = createRequire(import.meta.url);\nconst q = r;\nq(docPath);",
  ],
  [
    'module.register',
    "import {register} from 'node:module';\nregister('./hooks.mjs', import.meta.url);",
  ],
  ['(0, eval)(source)', '(0, eval)(source);'],
  ['globalThis.eval(source)', 'globalThis.eval(source);'],
  ["globalThis['ev' + 'al'](source)", "globalThis['ev' + 'al'](source);"],
  [
    "Function('return import(p)') without new",
    "Function('return import(p)')();",
  ],
  [
    "import('node:child_process')",
    "const {fork} = await import('node:child_process');",
  ],
  [
    "require('worker_threads').Worker",
    "new (require('worker_threads').Worker)(docPath);",
  ],
  [
    'a default import of child_process',
    "import cp from 'child_process';\ncp.fork(docPath);",
  ],
  ['jiti.evalModule(source)', 'jiti.evalModule(source);'],
  [
    'process.getBuiltinModule, with no import',
    "process.getBuiltinModule('node:child_process').fork(docPath);",
  ],
  [
    'getBuiltinModule taken off process',
    "const {getBuiltinModule} = process;\ngetBuiltinModule('node:vm');",
  ],
  ['a ShadowRealm', 'const realm = new ShadowRealm();'],
  ["a realm's importValue", "await realm.importValue(docPath, 'doc');"],
  [
    "an async function's constructor",
    "await (async () => {}).constructor('return import(p)')();",
  ],
  [
    'node:test running files',
    "import {run} from 'node:test';\nrun({files: [docPath]});",
  ],
  [
    'a helper from a directory the scan skips',
    "import {runCli} from '../../test-utils/run-cli.mjs';\nrunCli(docPath);",
  ],
  [
    'a static import of a data: URL',
    "import one from 'data:text/javascript,export default 1';\nexport {one};",
  ],
  [
    'a dynamic import of a data: URL',
    "await import('data:text/javascript,export default 1');",
  ],
  [
    'a dynamic import over https',
    "await import('https://example.test/x.mjs');",
  ],
  ['process.dlopen', 'process.dlopen({exports: {}}, file);'],
  ['process.execve', 'process.execve(file, args);'],
  [
    'dlopen destructured off process',
    'const {dlopen} = process;\ndlopen({exports: {}}, file);',
  ],
  ['WebAssembly.instantiate', 'await WebAssembly.instantiate(bytes);'],
  [
    'WebAssembly.compile through globalThis',
    'await globalThis.WebAssembly.compile(bytes);',
  ],
  ['new WebAssembly.Module', 'new WebAssembly.Module(bytes);'],
  ['Object.constructor(source)', 'Object.constructor(source)();'],
  [
    "a function literal's constructor, taken and kept",
    'const F = (() => {}).constructor;\nexport {F};',
  ],
  [
    '[].constructor.constructor(source)',
    '[].constructor.constructor(source)();',
  ],
  [
    "''.constructor.constructor(source)",
    "''.constructor.constructor(source)();",
  ],
  [
    "a prototype's constructor",
    'Object.getPrototypeOf(async function () {}).constructor(source)();',
  ],
  [
    'eval destructured off globalThis',
    'const {eval: e} = globalThis;\ne(source);',
  ],
  [
    'Function destructured off globalThis',
    'const {Function: F} = globalThis;\nF(source)();',
  ],
  [
    'eval through an alias of globalThis',
    'const g = globalThis;\ng.eval(source);',
  ],
  [
    'eval through a chain of aliases',
    'const g = globalThis;\nconst h = g;\nh.eval(source);',
  ],
  [
    'a computed destructuring off globalThis',
    "const {['ev' + 'al']: e} = globalThis;\ne(source);",
  ],
  [
    "Reflect.get(globalThis, 'eval')",
    "Reflect.get(globalThis, 'eval')(source);",
  ],
  [
    'a module under the authored templates',
    "import helper from '../../assets/templates/x/helper.mjs';",
  ],
  [
    'a module in a hidden directory',
    "import {load} from './.cache/load.mjs';\nload(docPath);",
  ],
  [
    'a module in a fixtures directory',
    "import {load} from './__fixtures__/load.mjs';\nload(docPath);",
  ],
  ['a test module', "import {load} from './load.test.mjs';\nload(docPath);"],
  [
    'the doc importers by absolute file URL',
    "import {importDocModule} from 'file:///repo/packages/cli/foundation/doc-compiler/import.mjs';\nimportDocModule(docPath);",
  ],
  [
    'child_process imported as {default as cp}',
    "import {default as cp} from 'node:child_process';\ncp.fork(docPath);",
  ],
  [
    'createRequire passed on',
    "import {createRequire} from 'node:module';\nconst make = createRequire;\nmake(import.meta.url)(docPath);",
  ],
].map(([name, code]) => ({name, file: LEAF, code}));

BYPASSES.push(
  {
    name: 'a require of a doc file, in CommonJS',
    file: 'api/leaf/leaf.cjs',
    code: "const {doc} = require('./Button.doc.cjs');",
  },
  {
    name: 'an import-equals of a doc file, in TypeScript',
    file: 'api/leaf/leaf.ts',
    code: "import doc = require('./Button.doc.mjs');",
  },
  {
    name: 'module.require, in CommonJS',
    file: 'api/leaf/leaf.cjs',
    code: 'module.require(docPath);',
  },
  {
    name: 'a loader module re-exported by import-equals, in TypeScript',
    file: 'api/leaf/leaf.ts',
    code: `export import loader = require(${MODULE_LOADER});`,
  },
  {
    name: 'an extension-free import of the doc importers, in TypeScript',
    file: 'api/leaf/leaf.ts',
    code: "import {importDocModule} from '../../foundation/doc-compiler/import';\nimportDocModule(docPath);",
  },
  {
    name: 'import(docPath) in a listed module',
    ...edited(
      'foundation/config/project.mjs',
      s => `${s}\nawait import(docPath);`,
    ),
  },
  {
    name: 'a doc parser swapped into a listed loadModuleWithParser call',
    ...edited('foundation/config/project.mjs', s =>
      s.replace(
        'loadModuleWithParser(configPath, parseConfig',
        'loadModuleWithParser(configPath, parseDoc',
      ),
    ),
  },
  {
    name: 'a second loader call in a listed module',
    ...edited(
      'foundation/integrations/integrations.mjs',
      s => `${s}\nawait importUserModule(docPath);`,
    ),
  },
);

/**
 * Code that runs nothing outside its static imports.
 * @type {Array<{name: string, file: string, code: string}>}
 */
const INNOCENT = [
  ['a literal import of a built-in', "await import('node:fs');"],
  ['a literal lazy import', "const m = await import('./other.mjs');"],
  [
    'an inert loader-module export',
    `import {findPresentFiles} from ${MODULE_LOADER};\nfindPresentFiles(dir, names);`,
  ],
  [
    'an inert export read off a loader namespace',
    `import * as loader from ${MODULE_LOADER};\nloader.findPresentFiles(dir, names);`,
  ],
  [
    'a require function that only resolves',
    "import {createRequire} from 'node:module';\nconst require = createRequire(import.meta.url);\nrequire.resolve('pkg/package.json');",
  ],
  [
    'createRequire(...).resolve',
    "import {createRequire} from 'node:module';\ncreateRequire(import.meta.url).resolve('pkg');",
  ],
  [
    'a doc path as data',
    "const target = name + '.doc.mjs';\nif (file.endsWith('.doc.mjs')) files.push(target);",
  ],
  [
    'an inert member of {default as x}',
    "import {default as threads} from 'node:worker_threads';\nthreads.parentPort.postMessage(1);",
  ],
  [
    'the worker side of worker_threads',
    "import {parentPort, workerData} from 'node:worker_threads';\nparentPort.postMessage(workerData);",
  ],
  ['x instanceof Function', 'if (x instanceof Function) f();'],
  ['j.Function, an AST node type', 'root.find(j.Function);'],
  [
    'a property that shares a loader name',
    'const o = {importUserModule: 1};\nconsole.log(o.importUserModule);',
  ],
  [
    'a read through the compiler',
    "import {readDocView} from '../../foundation/doc-compiler/read.mjs';\nawait readDocView(file, {root: 'components'});",
  ],
  [
    'the docs catalog',
    "import {DocsCatalog} from '../../foundation/discovery/docs-discovery.mjs';\nnew DocsCatalog();",
  ],
  [
    'an inert export of module',
    "import {builtinModules} from 'node:module';\nbuiltinModules.includes(name);",
  ],
  [
    'a URL of a module that is not a doc',
    "const worker = new URL('./worker.mjs', import.meta.url);",
  ],
  ['a string that mentions import()', "const text = 'await import(x)';"],
  [
    'getBuiltinModule of an inert built-in',
    "const fs = process.getBuiltinModule('node:fs');",
  ],
  ['an inert member of process', 'const dir = process.cwd();'],
  ['an inert destructuring of process', 'const {env, argv} = process;'],
  ['an inert member of globalThis', 'globalThis.crypto.randomUUID();'],
  ['WebAssembly.validate', 'WebAssembly.validate(bytes);'],
  ['a constructor read and passed on', 'patchPrototype(command.constructor);'],
  [
    "a constructor's name",
    "const kind = proto?.constructor?.name ?? 'non-plain object';",
  ],
  ['a property named constructor', 'const o = {constructor: 1};\nread(o);'],
].map(([name, code]) => ({name, file: LEAF, code}));

INNOCENT.push(
  {
    name: 'a require of a built-in, in CommonJS',
    file: 'api/leaf/leaf.cjs',
    code: "const path = require('node:path');",
  },
  {
    name: 'a type-only import of a doc file, in TypeScript',
    file: 'api/leaf/leaf.ts',
    code: "import type {Doc} from './Button.doc.mjs';\nexport type D = Doc;",
  },
  {
    name: 'a loader named in a type, in TypeScript',
    file: 'api/leaf/leaf.ts',
    code: `import {importDocModule} from ${IMPORTERS};\nlet load: typeof importDocModule | undefined;`,
  },
);

describe('the scan', () => {
  it('reads every code file but tests, fixtures, dependencies, and generated or hidden ones', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-loads-'));
    const code = [
      'a.cjs',
      'a.cts',
      'a.js',
      'a.jsx',
      'a.mjs',
      'a.mts',
      'a.ts',
      'a.tsx',
    ];
    const skipped = [
      '.cache/a.mjs',
      '__fixtures__/a.mjs',
      '__tests__/a.mjs',
      'a.d.mts',
      'a.json',
      'a.test.mjs',
      'a.test.ts',
      'node_modules/a.mjs',
    ];
    try {
      for (const file of [...code, ...skipped]) {
        fs.mkdirSync(path.dirname(path.join(dir, file)), {recursive: true});
        fs.writeFileSync(path.join(dir, file), '');
      }
      const found = sources(dir).map(full => path.relative(dir, full));
      expect(found.sort()).toEqual(code);
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  it.each(BYPASSES)('catches $name', ({file, code}) => {
    expect(violations(file, code)).not.toEqual([]);
  });

  it.each(INNOCENT)('passes $name', ({file, code}) => {
    expect(scanModule(code, file)).toEqual({sites: [], problems: []});
  });

  it('refuses a doc parser handed to a loader, even with the site listed', () => {
    for (const parser of ['parsers.parseDoc', 'x => parseFunction(x)']) {
      const code = `import {loadModuleWithParser} from ${MODULE_LOADER};\nloadModuleWithParser(file, ${parser});`;
      const listed = tally(scanModule(code, LEAF).sites);
      expect(violations(LEAF, code, listed)).toEqual([
        `${LEAF}: loadModuleWithParser(..., ${parser}) loads a doc outside the compiler`,
      ]);
    }
  });
});

describe('the scan walks every folder that can ship', () => {
  it('skips only test scaffolding and the temporary folders tests create', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-loads-walk-'));
    try {
      for (const dir of [
        '__generated__',
        '__tests__',
        '__fixtures__',
        '__import_hint_integration_Ab12Cd',
        '.hidden',
        'node_modules',
      ]) {
        fs.mkdirSync(path.join(root, dir));
        fs.writeFileSync(path.join(root, dir, 'run.mjs'), "eval('1');\n");
      }
      expect(
        sources(root).map(file => path.basename(path.dirname(file))),
      ).toEqual(['__generated__']);
    } finally {
      fs.rmSync(root, {recursive: true, force: true});
    }
  });
});
