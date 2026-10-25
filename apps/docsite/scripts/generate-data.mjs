#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file generate-data.mjs
 *
 * Build-time data extraction for the Astryx docsite.
 * Reads package.json, .doc.mjs, templates, and markdown files across the
 * monorepo and generates typed TypeScript registries in src/generated/.
 *
 * Run: node scripts/generate-data.mjs
 *
 * Generates:
 *   - packageRegistry.ts   — metadata for every distributable package
 *   - componentRegistry.ts — component listings per package (from .doc.mjs)
 *   - blockRegistry.ts     — showcases + example blocks from CLI templates
 *   - templateRegistry.ts  — page templates including playground source
 *   - templateMetadataRegistry.ts — lightweight page-template metadata
 *   - docsRegistry.ts      — long-form documentation topics from CLI docs/
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {
  admittedStableIntegration,
  resolveContentRoot,
} from './resolve-content-root.mjs';
import {
  GUIDE_NAMESPACE_PAGES,
  GUIDE_PAGE_NAMESPACES,
  ROOT_PAGE_ALIASES,
  movedGuideRedirects,
  mergeFlatTopics,
  namespacePage,
  routeSlug,
  sectionAnchors,
  withCliCommands,
  withoutResolvedTokens,
} from './docs-pages.mjs';
import {
  DOCSITE_CLI_COMMAND,
  DOCSITE_PACKAGE_MANAGER,
  GLOBAL_PAGE,
  GLOBAL_PAGE_CLI_COMMAND,
  getCliInvocation,
  prefixCliCommands,
  runWithDocPackageManager,
  runWithCliDoor,
} from './lib/cli-command.mjs';
import {
  docs as readDocs,
  template as queryTemplates,
} from '@astryxdesign/cli/api';
import docsiteConfig from '../astryx.config.mjs';
import {
  integrationContentEnabled,
  integrationPackagesForTarget,
} from '../src/lib/integrationTargets.mjs';
import {expandWorkspaceDirs} from '../../../scripts/lib/workspace-globs.mjs';
import {projectThemingDoc} from './lib/theming-doc.mjs';
import {searchLinkTables} from '../src/lib/searchLinks.mjs';
import {collectBlogImages} from './lib/blog-images.mjs';
import {
  buildTypeDefinitionIndex,
  collectPropTypeRefs,
} from '../src/lib/typeDefinitions.mjs';
import {generateShadcnRegistryForTarget} from './generate-shadcn-registry.mjs';
import {
  blockRegistryIdentity,
  resolveShadcnRegistryOrigin,
} from '../src/lib/shadcnRegistry.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const DOCSITE_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(DOCSITE_ROOT, '..', '..');
const OUT_DIR = path.join(DOCSITE_ROOT, 'src', 'generated');
const CLI_BIN = path.join(
  REPO_ROOT,
  'packages',
  'cli',
  'clients',
  'cli',
  'bin',
  'astryx.mjs',
);

// Which version of the packages supplies the documented DATA (component
// .doc.mjs, package.json versions, READMEs). `canary` (and every PR preview)
// reads the live workspace; `latest` (production) reads the published release.
// CLI_ROOT is deliberately NOT pinned — template demos are live-rendered React
// against the bundled core, so they always come from the workspace.
const {
  target: DOCSITE_TARGET,
  contentRoot: CONTENT_ROOT,
  cliRoot: CLI_ROOT,
} = resolveContentRoot();

console.log(
  `Docsite content target: ${DOCSITE_TARGET} (reading package docs from ${
    path.relative(REPO_ROOT, CONTENT_ROOT) || '.'
  })`,
);

fs.mkdirSync(OUT_DIR, {recursive: true});

// ── Helpers ────────────────────────────────────────────────────────────

const COPYRIGHT_HEADER =
  '// Copyright (c) Meta Platforms, Inc. and affiliates.\n\n';

function writeRegistry(filename, content) {
  const outPath = path.join(OUT_DIR, filename);
  fs.writeFileSync(outPath, COPYRIGHT_HEADER + content, 'utf-8');
  console.log(`  wrote ${path.relative(REPO_ROOT, outPath)}`);
}

/**
 * The integration packages this build documents. Canary documents every
 * configured integration and asks the CLI to confirm each one is installed.
 * `latest` documents only the configured integrations that are stable
 * releases present in the published content snapshot
 * (src/lib/integrationTargets.mjs); their component docs are read from the
 * snapshot like Core's, so no workspace discovery runs.
 *
 * The admitted list is written to src/generated/integrationPackages.json so
 * generate-scope.mjs and generate-playground-types.mjs document the same
 * packages without resolving the content snapshot again.
 */
function discoverConfiguredComponentPackages() {
  const admitted = integrationPackagesForTarget(
    DOCSITE_TARGET,
    docsiteConfig,
    admittedStableIntegration(CONTENT_ROOT),
  );
  fs.writeFileSync(
    path.join(OUT_DIR, 'integrationPackages.json'),
    JSON.stringify({target: DOCSITE_TARGET, packages: admitted}, null, 2) +
      '\n',
  );
  if (admitted.length === 0) {
    return new Set();
  }
  if (!integrationContentEnabled(DOCSITE_TARGET)) {
    return new Set(admitted);
  }

  const output = execFileSync(
    process.execPath,
    [CLI_BIN, 'discover', '--json'],
    {cwd: DOCSITE_ROOT, encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024},
  );
  const result = JSON.parse(output);
  if (
    result.type !== 'discover.list' ||
    !Array.isArray(result.data) ||
    result.meta?.configured === false
  ) {
    throw new Error('Astryx CLI returned an invalid integration package list.');
  }

  const configured = Array.isArray(docsiteConfig.integrations)
    ? docsiteConfig.integrations
    : [];
  const discovered = new Set(result.data.map(pkg => pkg.name));
  const missing = configured.filter(name => !discovered.has(name));
  if (missing.length > 0) {
    throw new Error(
      `Astryx CLI did not discover configured integration packages: ${missing.join(', ')}`,
    );
  }
  return discovered;
}

const CONFIGURED_COMPONENT_PACKAGES = discoverConfiguredComponentPackages();

/**
 * Validates that a doc file declared an explicit `displayName`. Display
 * names are authored by hand rather than derived at build time so
 * authors stay in control of how each component reads in the gallery
 * and sidebar UI (see PR #2376 review thread). Use the
 * apps/docsite/scripts/backfill-display-name.mjs codemod to backfill
 * the field on any doc file that's missing it.
 */
function requireDisplayName(displayName, where) {
  if (!displayName) {
    throw new Error(
      `Missing \`displayName\` on doc entry: ${where}\n` +
        'Every .doc.mjs file must declare an explicit `displayName` field.\n' +
        'Run `node apps/docsite/scripts/backfill-display-name.mjs` to backfill it.',
    );
  }
  return displayName;
}

/**
 * Parses a single/double/backtick-quoted JS string literal starting at
 * `openIdx` (the index of the opening quote) and returns the decoded
 * string value plus the index just past the closing quote.
 *
 * Unlike a naive `[^'"`]` character class, this correctly handles:
 *   - interior quotes of a different type (e.g. `'Swap the default "/"'`)
 *   - escaped quotes of the same type (e.g. `'won\'t close it'`)
 *   - standard escape sequences (\n, \t, \uXXXX, \xXX, line continuations)
 * and has no length cap, so long descriptions survive intact.
 */
function parseStringLiteral(content, openIdx) {
  const quote = content[openIdx];
  let i = openIdx + 1;
  let out = '';
  while (i < content.length) {
    const ch = content[i];
    if (ch === '\\') {
      const next = content[i + 1];
      switch (next) {
        case 'n':
          out += '\n';
          i += 2;
          continue;
        case 'r':
          out += '\r';
          i += 2;
          continue;
        case 't':
          out += '\t';
          i += 2;
          continue;
        case 'b':
          out += '\b';
          i += 2;
          continue;
        case 'f':
          out += '\f';
          i += 2;
          continue;
        case 'v':
          out += '\v';
          i += 2;
          continue;
        case '0':
          out += '\0';
          i += 2;
          continue;
        case '\n':
          i += 2;
          continue; // line continuation
        case '\r':
          i += content[i + 2] === '\n' ? 3 : 2;
          continue;
        case 'u': {
          if (content[i + 2] === '{') {
            const end = content.indexOf('}', i + 3);
            out += String.fromCodePoint(
              parseInt(content.slice(i + 3, end), 16),
            );
            i = end + 1;
            continue;
          }
          out += String.fromCharCode(parseInt(content.slice(i + 2, i + 6), 16));
          i += 6;
          continue;
        }
        case 'x':
          out += String.fromCharCode(parseInt(content.slice(i + 2, i + 4), 16));
          i += 4;
          continue;
        default:
          out += next; // \', \", \`, \\, and any other escaped char
          i += 2;
          continue;
      }
    }
    if (ch === quote) {
      return {value: out, end: i + 1};
    }
    out += ch;
    i++;
  }
  return {value: out, end: i};
}

/**
 * Extracts a top-level quoted field value (e.g. `description`) from
 * .doc.mjs source, decoding the string literal so interior quotes and
 * escapes survive intact. Returns null when the field is absent.
 */
function extractQuotedField(content, field) {
  const re = new RegExp(`(?:^|\\n) {0,4}${field}:\\s*\\n?\\s*['"\`]`);
  const m = re.exec(content);
  if (!m) return null;
  const openIdx = m.index + m[0].length - 1; // index of the opening quote
  return parseStringLiteral(content, openIdx).value;
}

/** Extract doc metadata from .doc.mjs source without dynamic import. */
const GROUP_RE = /(?:^|\n) {0,4}group:\s*['"]([^'"]+)['"]/;
const HIDDEN_RE = /(?:^|\n) {0,4}hidden:\s*true/;
const KEYWORDS_RE = /keywords:\s*\[([^\]]*)\]/;
const CATEGORY_RE = /(?:^|\n) {0,4}category:\s*['"]([^'"]+)['"]/;
const IS_HIDDEN_FROM_OVERVIEW_RE = /(?:^|\n) {0,4}isHiddenFromOverview:\s*true/;

function readDocMeta(docPath) {
  try {
    const content = fs.readFileSync(docPath, 'utf-8');
    const groupMatch = GROUP_RE.exec(content);
    const description = extractQuotedField(content, 'description');
    const name = extractQuotedField(content, 'name');
    const displayName = extractQuotedField(content, 'displayName');
    const hidden = HIDDEN_RE.test(content);
    const kwMatch = KEYWORDS_RE.exec(content);
    const keywords = kwMatch
      ? [...kwMatch[1].matchAll(/['"]([^'"]+)['"]/g)].map(m => m[1])
      : [];
    const categoryMatch = CATEGORY_RE.exec(content);
    const isHiddenFromOverview = IS_HIDDEN_FROM_OVERVIEW_RE.test(content);
    return {
      group: groupMatch?.[1] ?? null,
      description: description ?? '',
      name: name ?? null,
      displayName: displayName ?? null,
      hidden,
      keywords,
      category: categoryMatch?.[1] ?? null,
      isHiddenFromOverview,
    };
  } catch {
    return {
      group: null,
      description: '',
      name: null,
      displayName: null,
      hidden: false,
      keywords: [],
      category: null,
      isHiddenFromOverview: false,
    };
  }
}

function findDocFilesRecursive(dir, skipDirs = new Set()) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!skipDirs.has(entry.name)) {
        results.push(...findDocFilesRecursive(full, skipDirs));
      }
    } else if (entry.name.endsWith('.doc.mjs')) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Resolve the correct import path for a component given its package directory
 * and the subdirectory it lives in. Checks the package.json "exports" field to
 * find a matching subpath export (e.g. `@astryxdesign/core/Chat`).
 *
 * Falls back to the package name when no explicit export is found.
 */
function resolveImportPathForPkg(pkgDir, directory) {
  const pkgJsonPath = path.join(CONTENT_ROOT, pkgDir, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) return null;
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
  if (pkg.exports && pkg.exports[`./${directory}`]) {
    return `${pkg.name}/${directory}`;
  }
  // No matching export — fall back to package root
  return pkg.name;
}

// ── Package discovery ──────────────────────────────────────────────────

/**
 * Auto-discover packages from the monorepo workspace globs.
 * Reads the `packages:` block of CONTENT_ROOT's pnpm-workspace.yaml — the live
 * workspace on canary, the materialized release snapshot on latest (see
 * resolve-content-root.mjs, which writes a synthetic pnpm-workspace.yaml into
 * the snapshot) — and expands the globs.
 * Skips apps/* and internal/* — only surfaces packages/*.
 */
function discoverPackageDirs() {
  return expandWorkspaceDirs(CONTENT_ROOT)
    .map(abs => path.relative(CONTENT_ROOT, abs))
    .filter(rel => rel.startsWith('packages'))
    .filter(rel => fs.existsSync(path.join(CONTENT_ROOT, rel, 'package.json')))
    .sort();
}

const REGISTRY_EXTERNAL_DEPENDENCIES = [
  '@heroicons/react',
  '@stylexjs/stylex',
  'lucide-react',
  'recharts',
];

function registryExternalDependencySpecs() {
  return Object.fromEntries(
    REGISTRY_EXTERNAL_DEPENDENCIES.map(packageName => {
      const version = require(`${packageName}/package.json`).version;
      return [packageName, `${packageName}@${version}`];
    }),
  );
}

// ── 1. Package Registry ────────────────────────────────────────────────

function generatePackageRegistry() {
  console.log('Generating package registry...');

  const packageDirs = discoverPackageDirs();
  const docsitePkg = JSON.parse(
    fs.readFileSync(path.join(DOCSITE_ROOT, 'package.json'), 'utf-8'),
  );
  const docsiteDeps = {
    ...docsitePkg.dependencies,
    ...docsitePkg.devDependencies,
  };

  const packages = packageDirs
    .map(dir => {
      const pkgPath = path.join(CONTENT_ROOT, dir, 'package.json');
      const raw = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

      const canaryOnly = raw.astryx?.canaryOnly === true;

      // Private packages stay internal unless they are explicitly published on
      // the canary line. The latest content snapshot never contains those
      // packages, so this exception cannot leak them into production docs.
      if (
        raw.private === true &&
        !(DOCSITE_TARGET === 'canary' && canaryOnly)
      ) {
        return null;
      }

      // Skip packages not installed in the docsite
      if (docsiteDeps[raw.name] == null) return null;

      const hasReadme = fs.existsSync(
        path.join(CONTENT_ROOT, dir, 'README.md'),
      );
      const hasChangelog = fs.existsSync(
        path.join(CONTENT_ROOT, dir, 'CHANGELOG.md'),
      );
      const readme = hasReadme
        ? fs.readFileSync(path.join(CONTENT_ROOT, dir, 'README.md'), 'utf-8')
        : null;
      const changelog = hasChangelog
        ? fs.readFileSync(path.join(CONTENT_ROOT, dir, 'CHANGELOG.md'), 'utf-8')
        : null;
      return {
        name: raw.name,
        displayName:
          raw.displayName ||
          raw.name
            .replace('@astryxdesign/', '')
            .replace('theme-', 'Theme: ')
            .replace(/^\w/, c => c.toUpperCase()),
        version: raw.version,
        description: raw.description || '',
        packagePath: dir,
        canaryOnly,
        packageExports: raw.exports ?? null,
        peerDependencies: raw.peerDependencies ?? {},
        hasReadme,
        hasChangelog,
        readme,
        changelog,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));

  const publicPackages = packages.map(
    ({packageExports: _packageExports, ...pkg}) => pkg,
  );
  const content = `// Auto-generated by scripts/generate-data.mjs — do not edit

export interface PackageMeta {
  name: string;
  displayName: string;
  version: string;
  description: string;
  packagePath: string;
  canaryOnly: boolean;
  peerDependencies: Record<string, string>;
  hasReadme: boolean;
  hasChangelog: boolean;
  readme: string | null;
  changelog: string | null;
}

export const packages: PackageMeta[] = ${JSON.stringify(publicPackages, null, 2)};
`;
  writeRegistry('packageRegistry.ts', content);
  return packages;
}

function generatePackageStyles(packages, blocks, allComponents) {
  const sourcePackages = new Set([
    ...blocks.map(block => block.sourcePackage).filter(Boolean),
    ...Object.keys(allComponents).filter(
      packageName => packageName !== '@astryxdesign/core',
    ),
  ]);
  const imports = [];
  for (const pkg of packages.filter(entry => sourcePackages.has(entry.name))) {
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(CONTENT_ROOT, pkg.packagePath, 'package.json'),
        'utf-8',
      ),
    );
    for (const subpath of Object.keys(manifest.exports ?? {})) {
      if (subpath.endsWith('.css')) {
        imports.push(`@import "${pkg.name}/${subpath.slice(2)}";`);
      }
    }
  }
  const outPath = path.join(OUT_DIR, 'package-styles.css');
  fs.writeFileSync(
    outPath,
    '/* Copyright (c) Meta Platforms, Inc. and affiliates. */\n\n' +
      imports.join('\n') +
      '\n',
    'utf-8',
  );
  console.log(`  wrote ${path.relative(REPO_ROOT, outPath)}`);
}

// ── 2. Component Registry ──────────────────────────────────────────────

const COMPONENT_DOC_SKIP_DIRS = new Set(['utils', '__tests__', 'node_modules']);

/** Sanitize a doc object for JSON serialization (strip functions, symbols, etc.) */
function sanitizeForJson(obj) {
  return JSON.parse(
    JSON.stringify(obj, (key, value) => {
      if (typeof value === 'function' || typeof value === 'symbol')
        return undefined;
      return value;
    }),
  );
}

function extractStringArrayField(content, field) {
  const re = new RegExp(`${field}:\\s*\\[([^\\]]*)\\]`);
  const match = re.exec(content);
  if (!match) return [];
  return [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map(m => m[1]);
}

async function generateComponentRegistry() {
  console.log('Generating component registry...');

  const packageDirs = discoverPackageDirs();
  const componentPackages = [];

  for (const dir of packageDirs) {
    const srcDir = path.join(CONTENT_ROOT, dir, 'src');
    if (!fs.existsSync(srcDir)) continue;
    const pkgJson = JSON.parse(
      fs.readFileSync(path.join(CONTENT_ROOT, dir, 'package.json'), 'utf-8'),
    );
    if (
      pkgJson.name !== '@astryxdesign/core' &&
      !CONFIGURED_COMPONENT_PACKAGES.has(pkgJson.name)
    ) {
      continue;
    }
    const allDocFiles = findDocFilesRecursive(srcDir, COMPONENT_DOC_SKIP_DIRS);
    if (allDocFiles.length > 0) {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(CONTENT_ROOT, dir, 'package.json'), 'utf-8'),
      );
      const docDirs = [
        ...new Set(allDocFiles.map(file => path.dirname(file))),
      ].sort();
      componentPackages.push({
        name: pkgJson.name,
        srcDir,
        dir,
        docDirs,
        canaryOnly: manifest.astryx?.canaryOnly === true,
      });
    }
  }

  const allComponents = {};
  let totalCount = 0;

  for (const pkg of componentPackages) {
    if (!fs.existsSync(pkg.srcDir)) continue;
    const components = [];

    const standaloneNames = new Set();
    const pendingSubComponents = [];

    for (const dirPath of pkg.docDirs) {
      const directory = path.relative(pkg.srcDir, dirPath);
      const docFiles = fs
        .readdirSync(dirPath)
        .filter(f => f.endsWith('.doc.mjs'));
      if (docFiles.length === 0) continue;

      // First pass: find the primary component doc for this directory. Used to
      // (a) parent standalone hook docs that share the directory, and
      // (b) let sibling sub-component docs (subComponentOf) inherit family
      //     fields (group, category, keywords, theming, importPath, ...).
      let dirPrimaryDoc = null;
      let dirPrimaryMeta = null;
      for (const df of docFiles) {
        const dfPath = path.join(dirPath, df);
        try {
          const mod = await import(pathToFileURL(dfPath).href);
          const d = mod.docs;
          if (
            d &&
            (d.components || d.props) &&
            !d.params &&
            !d.subComponentOf
          ) {
            dirPrimaryDoc = d.name || null;
            dirPrimaryMeta = {
              name: d.name || null,
              group: d.group || null,
              category: d.category || null,
              keywords: d.keywords || [],
              hidden: d.hidden ?? false,
              isHiddenFromOverview: d.isHiddenFromOverview ?? false,
              topDescription: d.usage?.description || d.description || '',
              usage: d.usage ? sanitizeForJson(d.usage) : null,
              theming: d.theming
                ? projectThemingDoc(sanitizeForJson(d.theming))
                : null,
              playground: d.playground ? sanitizeForJson(d.playground) : null,
            };
            break;
          }
        } catch {
          /* ignore */
        }
      }

      for (const docFileName of docFiles) {
        const docFile = path.join(dirPath, docFileName);

        let doc;
        try {
          const mod = await import(pathToFileURL(docFile).href);
          doc = mod.docs;
          if (!doc) continue;
          recordDocExampleOrder(doc);
        } catch (err) {
          console.warn(
            `  warn: failed to import ${docFileName}: ${err.message}`,
          );
          continue;
        }

        const group = doc.group || null;
        const category = doc.category || null;
        const isHiddenFromOverview = doc.isHiddenFromOverview ?? false;
        const keywords = doc.keywords || [];
        const hidden = doc.hidden ?? false;
        const topDescription = doc.usage?.description || doc.description || '';
        const usage = doc.usage ? sanitizeForJson(doc.usage) : null;
        const theming = doc.theming
          ? projectThemingDoc(sanitizeForJson(doc.theming))
          : null;
        const registry = doc.registry ? sanitizeForJson(doc.registry) : null;
        const playground = doc.playground
          ? sanitizeForJson(doc.playground)
          : null;

        if (doc.subComponentOf) {
          // Extracted sub-component: lives in its parent's directory in its own
          // .doc.mjs file. Inherits family fields (group, category, keywords,
          // theming, playground, importPath) from the directory's primary doc
          // unless the sub-component doc overrides them; owns its name,
          // description, props, and usage. When no usage block is authored,
          // use the sub-component description as the usage summary instead of
          // inheriting parent prose. Produces a registry entry identical to the
          // legacy inline `components[]` expansion.
          const parentMeta = dirPrimaryMeta || {};
          const subName = (doc.name || '').replace(/^XDS/, '');
          if (subName) {
            const isHookEntry =
              subName.startsWith('use') ||
              Array.isArray(doc.params) ||
              Array.isArray(doc.returns);
            pendingSubComponents.push({
              name: subName,
              displayName: requireDisplayName(
                doc.displayName,
                `${pkg.name}: subcomponent ${subName} (parent ${doc.subComponentOf})`,
              ),
              moduleName: subName,
              directory,
              importPath: resolveImportPathForPkg(pkg.dir, directory),
              group: parentMeta.group ?? group,
              category: parentMeta.category ?? category,
              isHiddenFromOverview:
                doc.isHiddenFromOverview ??
                parentMeta.isHiddenFromOverview ??
                false,
              description: doc.description || parentMeta.topDescription || '',
              keywords: parentMeta.keywords ?? keywords,
              hidden: parentMeta.hidden ?? hidden,
              registry,
              parentDoc: doc.subComponentOf,
              props: isHookEntry
                ? []
                : Array.isArray(doc.props)
                  ? sanitizeForJson(doc.props)
                  : [],
              usage: doc.usage
                ? sanitizeForJson(doc.usage)
                : doc.description
                  ? {description: doc.description}
                  : null,
              theming: isHookEntry
                ? null
                : doc.theming
                  ? projectThemingDoc(sanitizeForJson(doc.theming))
                  : (parentMeta.theming ?? null),
              params: isHookEntry
                ? Array.isArray(doc.params)
                  ? sanitizeForJson(doc.params)
                  : Array.isArray(doc.props)
                    ? sanitizeForJson(doc.props)
                    : []
                : null,
              returns: isHookEntry
                ? Array.isArray(doc.returns)
                  ? sanitizeForJson(doc.returns)
                  : []
                : null,
              relatedComponents: isHookEntry
                ? doc.relatedComponents || [doc.subComponentOf]
                : null,
              relatedHooks: isHookEntry ? doc.relatedHooks || null : null,
              playground: isHookEntry
                ? null
                : doc.playground
                  ? sanitizeForJson(doc.playground)
                  : (parentMeta.playground ?? null),
            });
          }
        } else if (doc.components && doc.components.length > 0) {
          // A family parent that also documents its own component surface (it has
          // top-level props) is emitted as its own entry. Abstract families with
          // no top-level props (e.g. Chat) contribute only their sub-components.
          if (Array.isArray(doc.props) && doc.props.length > 0) {
            const name =
              doc.name ||
              docFileName.replace('.doc.mjs', '').replace(/^XDS/, '');
            standaloneNames.add(name);
            components.push({
              name,
              displayName: requireDisplayName(
                doc.displayName,
                `${pkg.name}: component ${name}`,
              ),
              moduleName: name,
              directory,
              importPath: resolveImportPathForPkg(pkg.dir, directory),
              group,
              category,
              isHiddenFromOverview,
              description: doc.description || topDescription,
              keywords,
              hidden,
              registry,
              parentDoc: name,
              props: sanitizeForJson(doc.props),
              usage,
              theming,
              params: null,
              returns: null,
              relatedComponents: null,
              relatedHooks: null,
              playground,
            });
          }
          for (const sub of doc.components) {
            const rawSubName = sub.name || '';
            const subName = rawSubName.replace(/^XDS/, '');
            if (!subName) continue;
            const isHookEntry =
              rawSubName.startsWith('use') ||
              subName.startsWith('use') ||
              Array.isArray(sub.params);
            // Name-only entries are cross-link references to sub-components that
            // have been extracted into their own sibling .doc.mjs files. Their
            // content is emitted from those files (subComponentOf branch); skip
            // here to avoid double emission.
            const isNameOnlyRef =
              Object.keys(sub).length === 1 && sub.name != null;
            if (isNameOnlyRef) continue;
            // Sub-entries whose name differs from the doc name are
            // sub-components — hide them from the overview page.
            const isSubEntry = subName !== doc.name;
            // Each sub-component may have its own usage; fall back to
            // the parent doc's usage only when the sub doesn't define one.
            // Hook entries should read as hook docs, not as the parent component,
            // so use the hook description as the usage summary when no explicit
            // usage block is authored.
            const subUsage = sub.usage
              ? sanitizeForJson(sub.usage)
              : isHookEntry && sub.description
                ? {description: sub.description}
                : usage;
            const params = isHookEntry
              ? Array.isArray(sub.params)
                ? sanitizeForJson(sub.params)
                : Array.isArray(sub.props)
                  ? sanitizeForJson(sub.props)
                  : []
              : null;
            const returns = isHookEntry
              ? Array.isArray(sub.returns)
                ? sanitizeForJson(sub.returns)
                : []
              : null;
            pendingSubComponents.push({
              name: subName,
              displayName: requireDisplayName(
                sub.displayName,
                `${pkg.name}: subcomponent ${sub.name || subName} (parent ${doc.name})`,
              ),
              moduleName: sub.name || subName,
              directory,
              importPath: resolveImportPathForPkg(pkg.dir, directory),
              group,
              category,
              isHiddenFromOverview:
                sub.isHiddenFromOverview ?? isHiddenFromOverview,
              description: sub.description || topDescription,
              keywords,
              hidden,
              registry: sub.registry ? sanitizeForJson(sub.registry) : null,
              parentDoc: doc.name,
              props: isHookEntry
                ? []
                : Array.isArray(sub.props)
                  ? sanitizeForJson(sub.props)
                  : [],
              usage: subUsage,
              theming: isHookEntry ? null : theming,
              params,
              returns,
              relatedComponents: isHookEntry
                ? sub.relatedComponents || (doc.name ? [doc.name] : null)
                : null,
              relatedHooks: isHookEntry ? sub.relatedHooks || null : null,
              // Sub-components may declare their own playground (e.g. an
              // overlay drawer whose sibling toggle must not inherit it);
              // fall back to the parent doc's playground otherwise — same
              // override rule as extracted subComponentOf docs.
              playground: isHookEntry
                ? null
                : sub.playground
                  ? sanitizeForJson(sub.playground)
                  : playground,
            });
          }
        } else if (doc.params) {
          // HookDoc — parent to the component doc in the same directory
          const name = doc.name || docFileName.replace('.doc.mjs', '');
          standaloneNames.add(name);
          components.push({
            name,
            displayName: requireDisplayName(
              doc.displayName,
              `${pkg.name}: hook ${name}`,
            ),
            moduleName: name,
            directory,
            importPath: resolveImportPathForPkg(pkg.dir, directory),
            group,
            category,
            isHiddenFromOverview,
            description: topDescription,
            keywords,
            hidden,
            registry,
            parentDoc: dirPrimaryDoc,
            props: [],
            usage,
            theming: null,
            params: Array.isArray(doc.params)
              ? sanitizeForJson(doc.params)
              : [],
            returns: Array.isArray(doc.returns)
              ? sanitizeForJson(doc.returns)
              : [],
            relatedComponents: doc.relatedComponents || null,
            relatedHooks: doc.relatedHooks || null,
            playground: null,
          });
        } else {
          // Simple/standalone component
          const name =
            doc.name || docFileName.replace('.doc.mjs', '').replace(/^XDS/, '');
          standaloneNames.add(name);
          components.push({
            name,
            displayName: requireDisplayName(
              doc.displayName,
              `${pkg.name}: component ${name}`,
            ),
            moduleName: name,
            directory,
            importPath: resolveImportPathForPkg(pkg.dir, directory),
            group,
            category,
            isHiddenFromOverview,
            description: topDescription,
            keywords,
            hidden,
            registry,
            parentDoc: null,
            props: Array.isArray(doc.props) ? sanitizeForJson(doc.props) : [],
            usage,
            theming,
            params: null,
            returns: null,
            relatedComponents: null,
            relatedHooks: null,
            playground,
          });
        }
      }
    }

    for (const sub of pendingSubComponents) {
      if (!standaloneNames.has(sub.name)) {
        standaloneNames.add(sub.name);
        components.push(sub);
      }
    }

    // Surface the shape of non-primitive types (issue #2682): when a
    // documented prop, hook parameter, or hook return type references a named
    // type exported from this package's source (e.g. `SearchSource<T>`,
    // `ToastOptions`), record the reference on the row and attach the
    // extracted declaration to the entry so the docs table can render it on
    // demand.
    const typeIndex = buildTypeDefinitionIndex(
      pkg.srcDir,
      path.relative(CONTENT_ROOT, pkg.srcDir),
    );
    for (const comp of components) {
      comp.isReady = !pkg.canaryOnly;
      const referenced = new Map();
      const rows = [
        ...comp.props,
        ...(comp.params ?? []),
        ...(comp.returns ?? []),
      ];
      for (const row of rows) {
        const typeRefs = collectPropTypeRefs(row.type, typeIndex);
        if (typeRefs.length > 0) {
          row.typeRefs = typeRefs;
          for (const name of typeRefs) {
            referenced.set(name, typeIndex.get(name));
          }
        }
      }
      comp.typeDefs = [...referenced.values()].sort((a, b) =>
        a.name.localeCompare(b.name),
      );
    }

    components.sort((a, b) => a.name.localeCompare(b.name));
    if (components.length > 0) {
      allComponents[pkg.name] = components;
      totalCount += components.length;
    }
  }

  const componentOwners = new Map();
  for (const [packageName, entries] of Object.entries(allComponents)) {
    for (const entry of entries) {
      const owner = componentOwners.get(entry.name);
      if (owner) {
        throw new Error(
          `Duplicate component name "${entry.name}" in ${owner} and ${packageName}. Component routes must be globally unique.`,
        );
      }
      componentOwners.set(entry.name, packageName);
    }
  }

  const content = `// Auto-generated by scripts/generate-data.mjs — do not edit

import type {
  ComponentPlaygroundConfig,
  ComponentSlotElement,
} from '@astryxdesign/cli/authoring';

export interface PropDoc {
  name: string;
  type: string;
  description: string;
  default?: string;
  required?: boolean;
  slotElements?: ElementDescriptor[];
  /** \`'experimental'\` for a prop outside the stable compatibility promise. */
  stability?: 'experimental';
  /** Names of package-exported types referenced by \`type\`, resolvable
   *  against the owning entry's \`typeDefs\`. */
  typeRefs?: string[];
}

export interface TypeDefinition {
  /** Exported type name, e.g. \`SearchSource\`. */
  name: string;
  /** Extracted TypeScript declaration source, including member JSDoc. */
  definition: string;
  /** Repo-relative source file, e.g. \`packages/core/src/Typeahead/types.ts\`. */
  sourcePath: string;
}
export interface BestPractice {
  guidance: boolean;
  description: string;
}

export interface AccessibilityRequirement {
  name: string;
  description: string;
  category?: 'Color contrast' | 'Keyboard' | 'Semantics' | 'Content';
  criterion?: string;
  requirement?: string;
  states?: string[];
}

export type AccessibilityThemeStatus = 'Pass' | 'Fail' | 'Not tested';

export type AccessibilityThemeApplicability =
  | 'Required'
  | 'Conditional'
  | 'Supplemental'
  | 'Decorative';

export interface AccessibilityThemeMeasurement {
  label: string;
  value: string;
  detail?: string;
  applicability?: AccessibilityThemeApplicability;
  colorPair?: {
    foreground: string;
    background: string;
  };
  breakdown?: Array<{
    label: string;
    value: string;
    detail?: string;
    colorPair: {
      foreground: string;
      background: string;
    };
    status?: 'Pass' | 'Fail';
  }>;
  status?: 'Pass' | 'Fail';
}

export interface AccessibilityThemeResult {
  name: string;
  measurements: AccessibilityThemeMeasurement[];
  status: AccessibilityThemeStatus;
}

export interface AccessibilityThemeMode {
  mode: 'Light' | 'Dark';
  results: AccessibilityThemeResult[];
}

export interface AccessibilityThemeTable {
  title?: string;
  description?: string;
  modes: AccessibilityThemeMode[];
}

export interface AccessibilityThemeCoverage {
  theme: string;
  tables: AccessibilityThemeTable[];
  notMeasured?: string[];
}

export interface AnatomyElement {
  name: string;
  required: boolean;
  description: string;
}

export interface UsageDoc {
  description: string;
  bestPractices?: BestPractice[];
  anatomy?: AnatomyElement[];
  features?: string[];
  accessibility?: AccessibilityRequirement[];
  accessibilityThemeCoverage?: AccessibilityThemeCoverage[];
  keyboard?: string;
  notes?: string[];
}

export interface ThemingTarget {
  className: string;
  visualProps?: string[];
  states?: string[];
}

export interface ComponentVar {
  name: string;
  description: string;
  default: string;
  derived?: boolean;
  formula?: string;
  private?: boolean;
}

export interface DerivedVar {
  property: string;
  vars?: string[];
  expand?: 'container';
  /** Emit only the vars, dropping the source property from the rule. */
  replaces?: boolean;
}

export interface ThemingDoc {
  container?: boolean;
  targets: ThemingTarget[];
  vars?: ComponentVar[];
  derived?: DerivedVar[];
}

export interface HookParamDoc {
  name: string;
  type: string;
  description: string;
  default?: string;
  required?: boolean;
  /** Names of package-exported types referenced by \`type\`, resolvable
   *  against the owning entry's \`typeDefs\`. */
  typeRefs?: string[];
}

export interface HookReturnDoc {
  name: string;
  type: string;
  description: string;
  /** Names of package-exported types referenced by \`type\`, resolvable
   *  against the owning entry's \`typeDefs\`. */
  typeRefs?: string[];
}

export interface ComponentEntry {
  /** Identifier name — matches the React component import name, e.g. \`AppShell\`. */
  name: string;
  /**
   * Human-readable display name with spaces between words, e.g.
   * \`Aspect Ratio\` for the \`AspectRatio\` component. Derived from
   * \`name\` by inserting spaces between PascalCase / camelCase words
   * while preserving capitalization.
   */
  displayName: string;
  moduleName: string;
  directory: string;
  /** Resolved import path, e.g. \`@astryxdesign/core/Chat\`. Derived from package.json exports. */
  importPath: string | null;
  group: string | null;
  /** Functional category for the overview gallery (Actions, Inputs, etc.) */
  category: string | null;
  /** Whether this component is hidden from the overview page. */
  isHiddenFromOverview: boolean;
  description: string;
  keywords: string[];
  hidden: boolean;
  /** Whether this component is ready for the stable documentation line. */
  isReady: boolean;
  registry: {slug?: string; aliases?: string[]} | null;
  parentDoc: string | null;
  props: PropDoc[];
  /** Declarations for every type referenced from \`props[]\`, \`params[]\`, or
   *  \`returns[]\` \`typeRefs\`. */
  typeDefs: TypeDefinition[];
  usage: UsageDoc | null;
  theming: ThemingDoc | null;
  params: HookParamDoc[] | null;
  returns: HookReturnDoc[] | null;
  relatedComponents: string[] | null;
  relatedHooks: string[] | null;
  playground: PlaygroundConfig | null;
}

export type ElementDescriptor = ComponentSlotElement;
export type PlaygroundConfig = ComponentPlaygroundConfig;

export const components: Record<string, ComponentEntry[]> = ${JSON.stringify(allComponents, null, 2)};

export const componentCount = ${totalCount};
`;
  writeRegistry('componentRegistry.ts', content);
  return {allComponents, totalCount};
}

function generateComponentPreviewRegistry(allComponents) {
  const packageNames = Object.keys(allComponents).filter(
    packageName => packageName !== '@astryxdesign/core',
  );
  const entries = packageNames
    .flatMap(packageName =>
      allComponents[packageName].map(
        component =>
          `  ${JSON.stringify(component.name)}: namedLazy(${JSON.stringify(component.name)}, () => import(${JSON.stringify(packageName)}).then(module => module.${component.moduleName} as PreviewComponent)),`,
      ),
    )
    .join('\n');

  const content = `// Auto-generated by scripts/generate-data.mjs — do not edit
import {lazy, type ComponentType} from 'react';

type PreviewComponent = ComponentType<any>;
type NamedLazyComponent = PreviewComponent & {displayName?: string};
type PreviewImport = () => Promise<PreviewComponent>;

function namedLazy(name: string, load: PreviewImport): PreviewComponent {
  const component = lazy(async () => ({default: await load()})) as NamedLazyComponent;
  component.displayName = name;
  return component;
}

export const externalComponentPreviews: Record<string, PreviewComponent> = {
${entries}
};
`;
  writeRegistry('componentPreviewRegistry.ts', content);
}

/**
 * Humanize a raw group label (a PascalCase component/group name) into a
 * spaced display label, e.g. 'TopNav' -> 'Top Nav', 'Chat' -> 'Chat'.
 * Used as the group label when no member's name exactly matches the group
 * (so the label doesn't fall back to an arbitrary member's displayName like
 * 'Chat Composer' for the 'Chat' group).
 */
function humanizeGroupLabel(label) {
  if (/^\d+[A-Z]+$/.test(label)) {
    return label;
  }
  return label
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim();
}

function generateGroupedComponentRegistry(allComponents) {
  console.log('Generating grouped component registry...');

  const results = {};

  for (const [pkgName, entries] of Object.entries(allComponents)) {
    const utilities = [];
    const groups = new Map();
    const ungrouped = [];

    const parentDocsWithComponents = new Set();
    for (const e of entries) {
      if (e.parentDoc && !e.name.startsWith('use') && !e.hidden) {
        parentDocsWithComponents.add(e.parentDoc);
      }
    }

    for (const entry of entries) {
      if (entry.hidden) continue;
      const isHook = entry.name.startsWith('use');
      // entry.displayName is required upstream (see ComponentEntry generation
      // — requireDisplayName throws if missing), so no fallback is needed.
      const {displayName} = entry;

      if (
        entry.group === 'Utilities' ||
        (isHook && !entry.parentDoc && entry.directory === 'hooks')
      ) {
        utilities.push({
          name: entry.name,
          displayName,
          href: `/components/${entry.name}`,
        });
        continue;
      }
      if (entry.group) {
        if (!groups.has(entry.group)) groups.set(entry.group, []);
        groups.get(entry.group).push({
          name: entry.name,
          displayName,
          href: `/components/${entry.name}`,
          description: entry.description,
        });
        continue;
      }
      if (isHook && !entry.parentDoc && entry.directory !== 'hooks') {
        const dir = entry.directory;
        if (!groups.has(dir)) groups.set(dir, []);
        groups.get(dir).push({
          name: entry.name,
          displayName,
          href: `/components/${entry.name}`,
          description: entry.description,
        });
        continue;
      }
      if (
        isHook &&
        entry.parentDoc &&
        parentDocsWithComponents.has(entry.parentDoc)
      ) {
        const parent = entry.parentDoc;
        if (!groups.has(parent)) groups.set(parent, []);
        groups.get(parent).push({
          name: entry.name,
          displayName,
          href: `/components/${entry.name}`,
          description: entry.description,
        });
        continue;
      }
      if (isHook) {
        utilities.push({
          name: entry.name,
          displayName,
          href: `/components/${entry.name}`,
        });
        continue;
      }
      ungrouped.push({
        name: entry.name,
        displayName,
        href: `/components/${entry.name}`,
        description: entry.description,
      });
    }

    const items = [];
    for (const [label, members] of groups) {
      members.sort((a, b) => a.name.localeCompare(b.name));
      if (members.length === 1) {
        items.push({
          sortKey: members[0].name,
          item: {
            type: 'entry',
            name: members[0].name,
            displayName: members[0].displayName,
            href: members[0].href,
            description: members[0].description,
          },
        });
      } else {
        const canonical = members.find(m => m.name === label);
        // Prefer the canonical member's already-required displayName as the
        // group label. When no member's name matches the group label (e.g. the
        // 'Chat' group has no component literally named 'Chat'), humanize the
        // raw label instead of falling back to an arbitrary member's
        // displayName (which produced labels like 'Chat Composer').
        const groupDisplayName = canonical
          ? canonical.displayName
          : humanizeGroupLabel(label);
        items.push({
          sortKey: label,
          item: {
            type: 'group',
            label,
            displayName: groupDisplayName,
            description: (canonical || members[0]).description,
            entries: members.map(m => ({
              name: m.name,
              displayName: m.displayName,
              href: m.href,
            })),
          },
        });
      }
    }
    for (const entry of ungrouped) {
      items.push({
        sortKey: entry.name,
        item: {
          type: 'entry',
          name: entry.name,
          displayName: entry.displayName,
          href: entry.href,
          description: entry.description,
        },
      });
    }
    items.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

    results[pkgName] = {
      items: items.map(i => i.item),
      utilities: utilities.sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  const content = `// Auto-generated by scripts/generate-data.mjs — do not edit

export interface GroupedEntry {
  type: 'entry';
  /** Identifier name — matches the React component import name. */
  name: string;
  /** Human-readable display name with spaces between camelCased words. */
  displayName: string;
  href: string;
  description: string;
}

export interface GroupedGroup {
  type: 'group';
  /** Raw group label (the component name acting as parent). */
  label: string;
  /** Human-readable version of \`label\` with spaces between camelCased words. */
  displayName: string;
  description: string;
  entries: Array<{name: string; displayName: string; href: string}>;
}

export type ComponentItem = GroupedEntry | GroupedGroup;

export interface GroupedComponents {
  items: ComponentItem[];
  utilities: Array<{name: string; displayName: string; href: string}>;
}

export const groupedComponents: Record<string, GroupedComponents> = ${JSON.stringify(results, null, 2)};
`;
  writeRegistry('groupedComponentRegistry.ts', content);
  return Object.keys(results).length;
}

// ── 3. Block Registry ──────────────────────────────────────────────────

async function generateBlockRegistry() {
  console.log('Generating block registry...');

  const BLOCKS_DIR = path.join(CLI_ROOT, 'assets', 'templates', 'blocks');
  const docFiles = findDocFilesRecursive(BLOCKS_DIR);
  const blocks = [];

  for (const docPath of docFiles) {
    const basename = path.basename(docPath, '.doc.mjs');
    const tsxPath = path.join(path.dirname(docPath), basename + '.tsx');
    if (!fs.existsSync(tsxPath)) continue;

    const meta = readDocMeta(docPath);
    const relCategory = path.relative(BLOCKS_DIR, path.dirname(docPath));

    // Read isShowcase, aspectRatio, componentsUsed, exampleFor from the doc file
    let isShowcase = false;
    let aspectRatio = 1;
    let componentsUsed = [];
    let exampleFor = null;
    let alsoExampleFor = [];
    let alsoShowcaseFor = [];
    let registry = null;
    try {
      const content = fs.readFileSync(docPath, 'utf-8');
      isShowcase = /isShowcase:\s*true/.test(content);
      const arMatch = content.match(/aspectRatio:\s*([\d.]+)\s*\/\s*([\d.]+)/);
      const arSingle = content.match(/aspectRatio:\s*([\d.]+)(?!\s*\/)/);
      if (arMatch) {
        aspectRatio = parseFloat(arMatch[1]) / parseFloat(arMatch[2]);
      } else if (arSingle) {
        aspectRatio = parseFloat(arSingle[1]);
      }
      const cuMatch = content.match(/componentsUsed:\s*\[([^\]]*)\]/);
      if (cuMatch) {
        componentsUsed = [...cuMatch[1].matchAll(/['"]([^'"]+)['"]/g)].map(
          m => m[1],
        );
      }
      const efMatch = content.match(/exampleFor:\s*['"]([^'"]+)['"]/);
      if (efMatch) {
        exampleFor = efMatch[1];
      }
      alsoExampleFor = extractStringArrayField(content, 'alsoExampleFor');
      alsoShowcaseFor = extractStringArrayField(content, 'alsoShowcaseFor');
      const module = await import(pathToFileURL(docPath).href);
      registry = module.doc?.registry
        ? sanitizeForJson(module.doc.registry)
        : null;
    } catch {
      /* ignore */
    }

    if (isShowcase && !exampleFor) {
      throw new Error(
        `Block ${path.relative(REPO_ROOT, docPath)} sets isShowcase without exampleFor`,
      );
    }

    let source = '';
    try {
      source = fs.readFileSync(tsxPath, 'utf-8');
    } catch {
      /* ignore */
    }

    const resolvedName = meta.name || basename;
    blocks.push({
      dirName: basename,
      name: resolvedName,
      // Human-readable display name for gallery + sidebar UI. Required —
      // every doc file must declare an explicit `displayName` so authors
      // stay in control of how each component reads in the UI (rather
      // than relying on a build-time regex derivation).
      displayName: requireDisplayName(
        meta.displayName,
        `block ${path.relative(REPO_ROOT, docPath)}`,
      ),
      description: meta.description,
      exampleFor,
      alsoExampleFor,
      alsoShowcaseFor,
      isShowcase,
      registry,
      aspectRatio,
      componentsUsed,
      category: relCategory,
      source,
    });
  }

  // Showcase blocks are executable content: like Core's CLI templates they are
  // live-rendered from the workspace install (see resolve-content-root.mjs),
  // filtered to the integration packages this build documents.
  if (CONFIGURED_COMPONENT_PACKAGES.size > 0) {
    const templateList = await queryTemplates(undefined, {
      list: true,
      type: 'block',
      cwd: DOCSITE_ROOT,
    });
    const integrationBlocks = templateList.data.filter(entry =>
      CONFIGURED_COMPONENT_PACKAGES.has(entry.package),
    );
    for (const entry of integrationBlocks) {
      const shown = await queryTemplates(entry.id, {
        show: true,
        type: 'block',
        package: entry.package,
        cwd: DOCSITE_ROOT,
      });
      blocks.push({
        dirName: `${entry.package}-${entry.id}`.replace(/[^a-zA-Z0-9_-]/g, '-'),
        name: entry.name,
        displayName: entry.displayName || entry.name,
        description: entry.description,
        exampleFor: entry.exampleFor || null,
        alsoExampleFor: entry.alsoExampleFor ?? [],
        alsoShowcaseFor: entry.alsoShowcaseFor ?? [],
        isShowcase: entry.isShowcase ?? false,
        registry: entry.registry ?? null,
        aspectRatio: entry.aspectRatio ?? 1,
        componentsUsed: entry.componentsUsed ?? [],
        category: entry.category || entry.package,
        source: shown.data.source,
        sourcePackage: entry.package,
      });
    }
  }

  blocks.sort((a, b) => a.name.localeCompare(b.name));

  const showcaseCount = blocks.filter(b => b.isShowcase).length;

  const content = `// Auto-generated by scripts/generate-data.mjs — do not edit

export interface BlockEntry {
  dirName: string;
  /** Identifier name — matches the React component import name (PascalCase). */
  name: string;
  /**
   * Human-readable display name with spaces between words, e.g.
   * "Chat Message Metadata" for the "ChatMessageMetadata" component.
   * Falls back to a prettified version of \`name\` when no explicit
   * displayName is declared on the doc file.
   */
  displayName: string;
  description: string;
  /** Optional component ownership. Null means a standalone block. */
  exampleFor: string | null;
  alsoExampleFor: string[];
  alsoShowcaseFor: string[];
  isShowcase: boolean;
  registry: {slug?: string; aliases?: string[]} | null;
  aspectRatio: number;
  componentsUsed: string[];
  /** Category path, e.g. 'components/Button' */
  category: string;
  /** Raw TSX source code for live rendering */
  source: string;
  /** Owning integration package for library-owned blocks. */
  sourcePackage?: string;
}

export const blocks: BlockEntry[] = ${JSON.stringify(blocks, null, 2)};

export const blockCount = ${blocks.length};
export const showcaseCount = ${showcaseCount};
`;
  writeRegistry('blockRegistry.ts', content);
  return {blocks, blockCount: blocks.length, showcaseCount};
}

// ── 4. Template Registry ───────────────────────────────────────────────

async function generateTemplateRegistry() {
  console.log('Generating template registry...');

  const PAGES_DIR = path.join(CLI_ROOT, 'assets', 'templates', 'pages');
  if (!fs.existsSync(PAGES_DIR)) {
    writeRegistry(
      'templateRegistry.ts',
      `// Auto-generated — no templates found\nexport const templates = [];\nexport const templateCount = 0;\n`,
    );
    writeRegistry(
      'templateMetadataRegistry.ts',
      `// Auto-generated — no templates found\nexport const templateMetadata = [];\nexport const templateMetadataCount = 0;\n`,
    );
    return {templates: [], templateCount: 0};
  }

  const templates = [];
  const dirs = fs
    .readdirSync(PAGES_DIR, {withFileTypes: true})
    .filter(e => e.isDirectory());

  for (const dir of dirs) {
    const docPath = path.join(PAGES_DIR, dir.name, 'template.doc.mjs');
    if (!fs.existsSync(docPath)) continue;
    const pagePath = path.join(PAGES_DIR, dir.name, 'page.tsx');
    if (!fs.existsSync(pagePath)) continue;

    let doc;
    try {
      const mod = await import(
        fileURLToPath(new URL(`file://${docPath}`)).replace(/\\/g, '/')
      );
      doc = mod.doc;
    } catch {
      const meta = readDocMeta(docPath);
      doc = {
        name: meta.name || dir.name,
        description: meta.description,
        isReady: true,
      };
    }

    // Skip scaffolds — these are starter templates, not showcases
    if (doc.scaffold) continue;

    let source = '';
    try {
      source = fs.readFileSync(pagePath, 'utf-8');
    } catch {
      /* ignore */
    }

    templates.push({
      slug: dir.name,
      name: doc.name || dir.name,
      description: doc.description || '',
      isReady: doc.isReady ?? true,
      category: doc.category || '',
      isHiddenFromOverview: doc.isHiddenFromOverview ?? false,
      registry: doc.registry ? sanitizeForJson(doc.registry) : null,
      source,
    });
  }

  templates.sort((a, b) => a.name.localeCompare(b.name));

  const content = `// Auto-generated by scripts/generate-data.mjs — do not edit

export interface TemplateEntry {
  slug: string;
  name: string;
  description: string;
  isReady: boolean;
  /** Functional category, e.g. 'Dashboard - Analytics'. Empty when untagged.
   *  The overview groups by the part before ' - '. */
  category: string;
  /** When true, hide from the Templates overview gallery (still CLI-available). */
  isHiddenFromOverview: boolean;
  registry: {slug?: string; aliases?: string[]} | null;
  source: string;
}

export const templates: TemplateEntry[] = ${JSON.stringify(templates, null, 2)};

export const templateCount = ${templates.length};
`;
  writeRegistry('templateRegistry.ts', content);

  const templateMetadata = templates.map(
    ({source: _source, ...metadata}) => metadata,
  );
  const metadataContent = `// Auto-generated by scripts/generate-data.mjs — do not edit

export interface TemplateMetadataEntry {
  slug: string;
  name: string;
  description: string;
  isReady: boolean;
  /** Functional category, e.g. 'Dashboard - Analytics'. Empty when untagged.
   *  The overview groups by the part before ' - '. */
  category: string;
  /** When true, hide from the Templates overview gallery (still CLI-available). */
  isHiddenFromOverview: boolean;
  registry: {slug?: string; aliases?: string[]} | null;
}

export const templateMetadata: TemplateMetadataEntry[] = ${JSON.stringify(templateMetadata, null, 2)};

export const templateMetadataCount = ${templateMetadata.length};
`;
  writeRegistry('templateMetadataRegistry.ts', metadataContent);

  return {templates, templateCount: templates.length};
}

// ── 5. Docs Registry ──────────────────────────────────────────────────

/**
 * The docsite pages of the CLI's docs tree, read through the CLI's public docs
 * API. Every root namespace is one full page at its own slug (docs-pages.mjs),
 * so splitting a flat topic into a namespace keeps its URL, sidebar spot and
 * text; the guides under it redirect to their sections on that page. A root
 * namespace in GUIDE_PAGE_NAMESPACES shows the pages GUIDE_NAMESPACE_PAGES
 * lists, the same way one level down, and its other guides keep a page each.
 */
async function docsTreePages() {
  const pages = [];
  const redirects = {};
  // Every route the tree has. A reference to a route without a page of its
  // own (a command or API doc) still opens it in `astryx docs`.
  const routes = [];
  const list = await readDocs();
  const pending = [];
  // Routes a page of a GUIDE_PAGE_NAMESPACES root holds, so their guides get
  // no page of their own.
  const held = new Set();
  for (const {topic: root} of list.meta?.namespaces ?? []) {
    if (GUIDE_PAGE_NAMESPACES.has(root)) {
      pending.push(root);
      for (const spec of GUIDE_NAMESPACE_PAGES.get(root) ?? []) {
        for (const route of await treeRoutes(spec.route)) held.add(route);
        const full = await namespacePage(readDocs, spec.route, spec);
        if (!full) continue;
        pages.push(full.page);
        Object.assign(redirects, full.redirects);
      }
      continue;
    }
    routes.push(...(await treeRoutes(root)));
    const full = await namespacePage(readDocs, root, {
      aliases: ROOT_PAGE_ALIASES.get(root) ?? [],
    });
    if (!full) continue;
    pages.push(full.page);
    Object.assign(
      redirects,
      full.redirects,
      movedGuideRedirects(root, full.redirects),
    );
  }
  while (pending.length > 0) {
    const route = pending.shift();
    routes.push(route);
    const read = await readDocs(route);
    if (read.type !== 'docs.node') continue;
    for (const slot of read.data.slots) {
      for (const child of slot.children) {
        if (child.kind !== 'namespace') routes.push(child.route);
        if (child.kind === 'namespace') {
          pending.push(child.route);
        } else if (
          child.kind === 'generic' &&
          child.route.includes('/') &&
          !held.has(child.route)
        ) {
          const doc = (await readDocs(child.route)).data;
          pages.push({
            topic: routeSlug(child.route),
            title: doc.title || child.title,
            description: doc.description || '',
            category: doc.category || null,
            sections: doc.sections || [],
          });
        }
      }
    }
  }
  return {pages, redirects, routes};
}

/**
 * Every route at or below a docs-tree node.
 * @param {string} route
 * @returns {Promise<string[]>}
 */
async function treeRoutes(route) {
  const read = await readDocs(route, undefined, {depth: 'all'});
  const routes = [route];
  const walk = slots => {
    for (const slot of slots ?? []) {
      for (const child of slot.children) {
        routes.push(child.route);
        walk(child.slots);
      }
    }
  };
  if (read.type === 'docs.node') walk(read.data.slots);
  return routes;
}

async function generateDocsRegistry() {
  console.log('Generating docs registry...');

  const DOCS_DIR = path.join(CLI_ROOT, 'assets', 'docs');
  if (!fs.existsSync(DOCS_DIR)) {
    writeRegistry(
      'docsRegistry.ts',
      `// Auto-generated — no docs found\nexport const docTopics = [];\nexport const docsCount = 0;\nexport const docsTreeRoutes = [];\nexport const docRedirects = {};\n`,
    );
    fs.writeFileSync(path.join(OUT_DIR, 'docRedirects.json'), '{}\n');
    return {docTopics: [], docsCount: 0};
  }

  const docTopics = [];

  for (const file of fs.readdirSync(DOCS_DIR)) {
    const match = file.match(/^([\w-]+)\.doc\.mjs$/);
    if (!match) continue;
    // Skip translations
    if (file.includes('.doc.zh.') || file.includes('.doc.dense.')) continue;

    const topic = match[1];
    if (DOCSITE_TARGET !== 'canary' && topic === 'shadcn-compatibility') {
      continue;
    }
    const docPath = path.join(DOCS_DIR, file);

    let title = '';
    let description = '';
    let category = '';
    let sections = [];
    try {
      const mod = await import(`file://${docPath}`);
      title = mod.docs?.title || '';
      description = mod.docs?.description || '';
      category = mod.docs?.category || '';
      sections = mod.docs?.sections || [];
    } catch {
      const meta = readDocMeta(docPath);
      description = meta.description;
    }
    if (sections.length > 0) {
      // Read the sections through the CLI's docs API, so each link between
      // docs (`{@link <target>}`) reads as the command that opens its doc, as
      // it does in `astryx docs`. Only the CLI's own topics are read here, so
      // the read runs from the CLI package. The docsite renders token tables
      // itself, so a resolved token reference is not copied into the registry.
      const read = await readDocs(topic, undefined, {cwd: CLI_ROOT});
      sections = withoutResolvedTokens(read.data.sections);
    }

    docTopics.push({
      topic,
      title: title || topic,
      description,
      category: category || null,
      sections,
    });
  }

  // Flat topics shown on another topic's page, or kept only as data.
  const merged = mergeFlatTopics(docTopics);
  docTopics.splice(0, docTopics.length, ...merged.topics);

  // Guides the CLI's docs tree places (spec:AST-046) are not topic files: the
  // CLI reads them only by route. A root namespace is one full page at its
  // slug (a former flat topic keeps its URL), and each guide under it
  // redirects to its section there. Guides under GUIDE_PAGE_NAMESPACES keep a
  // flat page whose slug is the route with "/" as "-", so
  // `cli/component-lookups` is /docs/cli-component-lookups.
  const tree = await docsTreePages();
  for (const page of tree.pages) {
    if (docTopics.some(topic => topic.topic === page.topic)) {
      throw new Error(
        `docs: "${page.topic}" is both a flat topic and a docs-tree page. Remove the flat topic file when its namespace replaces it.`,
      );
    }
    docTopics.push(page);
  }
  const docsTreeRoutes = [...new Set(tree.routes)].sort();
  const docRedirects = Object.fromEntries(
    Object.entries({...merged.redirects, ...tree.redirects}).sort(([a], [b]) =>
      a.localeCompare(b),
    ),
  );
  for (const slug of Object.keys(docRedirects)) {
    if (docTopics.some(topic => topic.topic === slug)) {
      throw new Error(`docs: "${slug}" is both a page and a redirect.`);
    }
  }

  docTopics.sort((a, b) => a.topic.localeCompare(b.topic));
  // Docs write commands as bare `astryx ...`. The site shows them as
  // `npx @astryxdesign/cli ...`, which runs before any install, and as plain
  // `astryx ...` on the global mode page, whose readers installed it. Each is
  // a docsite door name, and goes through the CLI's picker like any other.
  const cliStem = runWithCliDoor(DOCSITE_CLI_COMMAND, () =>
    getCliInvocation(DOCSITE_ROOT),
  );
  const globalStem = runWithCliDoor(GLOBAL_PAGE_CLI_COMMAND, () =>
    getCliInvocation(DOCSITE_ROOT),
  );
  for (const topic of docTopics) {
    const stem = topic.topic === GLOBAL_PAGE ? globalStem : cliStem;
    topic.sections = withCliCommands(
      topic.sections,
      (text, lang = null) =>
        // The CLI rendered the doc tokens as it compiled the doc (for npm,
        // under runWithDocPackageManager below), so only bare commands are
        // prefixed here.
        prefixCliCommands(text, stem, lang),
      stem,
    );
  }

  const content = `// Auto-generated by scripts/generate-data.mjs — do not edit

export interface ContentBlock {
  type: string;
  text?: string;
  code?: string;
  lang?: string;
  label?: string;
  level?: number;
  headers?: string[];
  rows?: string[][];
  items?: string[];
  style?: string;
  topic?: string;
  section?: string;
}

export interface DocSection {
  /** Stable key readers address the section by: astryx docs <topic> <id>. */
  id?: string;
  title: string;
  /** The npm package that wrote the section, as the CLI's docs read names it. */
  package?: string;
  content: ContentBlock[];
  previewType?: string;
  category?: string;
}

export interface DocTopic {
  /** URL-friendly slug derived from filename (e.g. 'getting-started') */
  topic: string;
  /** Display title from docs.title (e.g. 'Getting Started') */
  title: string;
  /** Short description */
  description: string;
  /** Navigation category: 'guide' | 'foundations' | null */
  category: string | null;
  /** Full doc sections with content blocks */
  sections: DocSection[];
}

export const docTopics: DocTopic[] = ${JSON.stringify(docTopics, null, 2)};

export const docsCount = ${docTopics.length};

/** Every route of the CLI's docs tree. A route with no page or redirect here
 *  (a command or API doc) opens only in \`astryx docs\`. */
export const docsTreeRoutes: string[] = ${JSON.stringify(docsTreeRoutes, null, 2)};

/** Slugs that are not pages of their own, each to where its text is shown: a
 *  guide under a namespace page, or a flat topic merged into another page.
 *  next.config.mjs serves them as redirects. */
export const docRedirects: Record<string, string> = ${JSON.stringify(docRedirects, null, 2)};
`;
  writeRegistry('docsRegistry.ts', content);
  fs.writeFileSync(
    path.join(OUT_DIR, 'docRedirects.json'),
    `${JSON.stringify(docRedirects, null, 2)}\n`,
  );
  return {docTopics, docsCount: docTopics.length};
}

/**
 * The tables the search panel opens a CLI search result through
 * (src/lib/searchLinks.mjs): this build's doc pages, redirects, section
 * anchors, component and template pages, and the page each block shows on.
 * The search API (app/api/search/route.ts) reads them.
 */
function generateSearchLinks({
  docTopics,
  allComponents,
  templates,
  blocks,
  packages,
}) {
  const docRedirects = JSON.parse(
    fs.readFileSync(path.join(OUT_DIR, 'docRedirects.json'), 'utf-8'),
  );
  const tables = searchLinkTables({
    docTopics,
    docRedirects,
    components: Object.values(allComponents)
      .flat()
      .map(c => c.name),
    templates: templates.map(t => t.slug),
    blocks,
    // The package pages /docs/[topic] serves; theme packages show on /themes.
    packagePages: packages
      .map(p => p.name)
      .filter(name => !name.startsWith('@astryxdesign/theme-'))
      .map(name => name.replace('@astryxdesign/', '')),
    sectionAnchors,
  });
  fs.writeFileSync(
    path.join(OUT_DIR, 'searchLinks.json'),
    `${JSON.stringify(tables)}\n`,
  );
  console.log(
    `  wrote ${path.relative(REPO_ROOT, path.join(OUT_DIR, 'searchLinks.json'))}`,
  );
}

async function generateThemeRegistry(packages) {
  console.log('Generating theme registry...');
  const themePackages = packages.filter(p =>
    p.name.startsWith('@astryxdesign/theme-'),
  );
  if (!themePackages.length) {
    writeRegistry(
      'themeRegistry.ts',
      `// Auto-generated — no theme packages found
import type {DefinedTheme} from '@astryxdesign/core/theme';
export const themeObjects: Record<string, DefinedTheme> = {};
`,
    );
    // Empty CSS aggregator so the globals.css @import doesn't 404.
    writeThemesCss('');
    return 0;
  }

  const imports = themePackages
    .map(p => {
      const slug = p.name.replace('@astryxdesign/theme-', '');
      const exportName = `${slug}Theme`;
      return `import {${exportName}} from '${p.name}/built';`;
    })
    .join('\n');

  const entries = themePackages
    .map(p => {
      const slug = p.name.replace('@astryxdesign/theme-', '');
      return `  '${p.name}': ${slug}Theme,`;
    })
    .join('\n');

  // The `/built` objects are tokens-only — component overrides are compiled into
  // each theme's CSS file, not the JS object. Extract those overrides here at
  // build time from the package's full (main) export. In Node the `use client`
  // directive on defineTheme is ignored, so this import is safe; the values are
  // plain string maps, so the generated file stays pure data and is safe to
  // import from server components. They're re-attached to the built objects in
  // `themeObjectsFull` for the theme editors/playground, which rebuild the theme
  // at runtime and so need the overrides (e.g. display fonts) on the object.
  const componentOverrides = {};
  for (const p of themePackages) {
    const slug = p.name.replace('@astryxdesign/theme-', '');
    try {
      const mod = await import(p.name);
      const theme = mod[`${slug}Theme`];
      if (theme?.components && Object.keys(theme.components).length > 0) {
        componentOverrides[p.name] = theme.components;
      }
    } catch (err) {
      console.warn(
        `  warn: could not extract components for ${p.name}: ${err.message}`,
      );
    }
  }

  const fullEntries = themePackages
    .map(p => {
      const slug = p.name.replace('@astryxdesign/theme-', '');
      return `  '${p.name}': {...${slug}Theme, components: componentOverrides['${p.name}']},`;
    })
    .join('\n');

  const content = `// Auto-generated by scripts/generate-data.mjs — do not edit

import type {DefinedTheme} from '@astryxdesign/core/theme';
${imports}

export const themeObjects: Record<string, DefinedTheme> = {
${entries}
};

/**
 * Component overrides extracted from each theme's full export (the /built
 * objects above are tokens-only — their component styles live in CSS). Plain
 * data, safe to import from server components.
 */
const componentOverrides: Record<string, DefinedTheme['components']> =
  ${JSON.stringify(componentOverrides, null, 2)
    .split('\n')
    .map((l, i) => (i === 0 ? l : '  ' + l))
    .join('\n')};

/**
 * Built theme objects with their component overrides re-attached. Used by the
 * theme editors/playground, which serialize the theme over postMessage and
 * rebuild it at runtime, so component overrides (e.g. display fonts) must live
 * on the object rather than in a separate CSS file.
 */
export const themeObjectsFull: Record<string, DefinedTheme> = {
${fullEntries}
};
`;
  writeRegistry('themeRegistry.ts', content);

  // CSS aggregator — globals.css imports this single file so adding a
  // new theme package no longer requires hand-editing globals.css.
  const cssImports = themePackages
    .map(p => `@import "${p.name}/theme.css";`)
    .join('\n');
  writeThemesCss(cssImports);

  return themePackages.length;
}

// Writes the aggregated themes.css alongside the TS registries. It's
// imported once from globals.css and re-generated every time the theme
// package list changes.
function writeThemesCss(body) {
  const outPath = path.join(OUT_DIR, 'themes.css');
  const content = `/* Copyright (c) Meta Platforms, Inc. and affiliates. */
/* Auto-generated by scripts/generate-data.mjs — do not edit */

${body}
`;
  fs.writeFileSync(outPath, content, 'utf-8');
  console.log(`  wrote ${path.relative(REPO_ROOT, outPath)}`);
}

// ── 7. Showcase Registry ───────────────────────────────────────────────

// Blocks are copied into the docsite and rendered via a live import, so they
// can only reference packages the docsite actually depends on. A block for a
// component whose package is not a docsite dependency (e.g. anything in
// `@astryxdesign/lab`, which is canary-only and deliberately not installed
// here) is authored and version-controlled in the CLI templates, but must be
// skipped from the docsite's live preview until its package becomes resolvable
// — otherwise `next build` fails on the unresolved import. The block source is
// still shown as code; it just has no rendered preview until, for example, the
// component is promoted to core.
const _docsiteDeps = (() => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(DOCSITE_ROOT, 'package.json'), 'utf-8'),
  );
  return {...pkg.dependencies, ...pkg.devDependencies};
})();

function importsPackageMissingFromDocsite(tsxSource) {
  const imports = [
    ...tsxSource.matchAll(/from\s+['"](@astryxdesign\/[^'"/]+)/g),
  ].map(m => m[1]);
  return imports.some(pkg => _docsiteDeps[pkg] == null);
}

function blockSourcePath(block) {
  if (block.sourcePackage) {
    return null;
  }
  return path.join(
    CLI_ROOT,
    'assets',
    'templates',
    'blocks',
    block.category,
    `${block.dirName}.tsx`,
  );
}

function writeBlockPreview(block, outDir, basename) {
  const destFile = `${basename}.tsx`;
  const destination = path.join(outDir, destFile);
  const sourcePath = blockSourcePath(block);
  if (sourcePath) {
    if (!fs.existsSync(sourcePath)) {
      return null;
    }
    fs.copyFileSync(sourcePath, destination);
  } else {
    fs.writeFileSync(destination, block.source, 'utf8');
  }
  return destFile;
}

function generateShowcaseRegistry(blocks, availableRegistryPaths) {
  console.log('Generating showcase registry...');

  const SHOWCASE_OUT = path.join(OUT_DIR, 'showcases');
  fs.rmSync(SHOWCASE_OUT, {recursive: true, force: true});
  fs.mkdirSync(SHOWCASE_OUT, {recursive: true});

  const entries = [];
  for (const block of blocks) {
    if (importsPackageMissingFromDocsite(block.source)) {
      console.log(
        `  skipping showcase ${block.dirName} — imports a package not installed in the docsite`,
      );
      continue;
    }

    const identity = blockRegistryIdentity(
      block.name,
      block.exampleFor,
      block.isShowcase,
      block.registry,
    );
    const registryItemPath = availableRegistryPaths?.has(identity.path)
      ? identity.path
      : null;

    if (block.isShowcase && block.exampleFor) {
      const basename = block.sourcePackage
        ? `integration-${block.dirName}`
        : block.dirName;
      const destFile = writeBlockPreview(block, SHOWCASE_OUT, basename);
      if (destFile) {
        entries.push({
          exampleFor: block.exampleFor,
          basename,
          destFile,
          registryItemPath,
        });
      }
    }

    for (const target of block.alsoShowcaseFor ?? []) {
      const base = block.sourcePackage
        ? `integration-${block.dirName}`
        : block.dirName;
      const basename = `${base}__${target}`;
      const destFile = writeBlockPreview(block, SHOWCASE_OUT, basename);
      if (destFile) {
        entries.push({
          exampleFor: target,
          basename,
          destFile,
          registryItemPath,
        });
      }
    }
  }

  const seen = new Set();
  const uniqueEntries = entries.filter(entry => {
    if (seen.has(entry.exampleFor)) return false;
    seen.add(entry.exampleFor);
    return true;
  });

  const importLines = uniqueEntries
    .map(
      entry =>
        `  '${entry.exampleFor}': () => import('./showcases/${entry.basename}'),`,
    )
    .join('\n');
  const itemPathLines = uniqueEntries
    .filter(entry => entry.registryItemPath)
    .map(
      entry =>
        `  '${entry.exampleFor}': ${JSON.stringify(entry.registryItemPath)},`,
    )
    .join('\n');

  const registryContent = `// Auto-generated by scripts/generate-data.mjs — do not edit
import type {ComponentType} from 'react';

type ShowcaseLoader = () => Promise<{default: ComponentType}>;

export const showcaseRegistry: Record<string, ShowcaseLoader> = {
${importLines}
};

export const showcaseRegistryItemPaths: Record<string, string> = {
${itemPathLines}
};
`;

  writeRegistry('showcaseRegistry.ts', registryContent);
  console.log(
    `  copied ${entries.length} showcase files (${uniqueEntries.length} unique components)`,
  );
  return uniqueEntries.length;
}

// ── Main

// Example labels in authored order, per documented component or sub-component.
// A component page lists the example blocks named after those labels in the
// same order as its doc's `examples`, so the snippet list and the runnable
// demos read as one set; any other example blocks follow in name order.
const DOC_EXAMPLE_ORDER = new Map();

function recordDocExampleOrder(doc) {
  const entries = [
    doc,
    ...(Array.isArray(doc.components) ? doc.components : []),
  ];
  for (const entry of entries) {
    const name = (entry?.name || '').replace(/^XDS/, '');
    if (!name || !Array.isArray(entry.examples)) continue;
    const labels = entry.examples
      .map(example => example?.label)
      .filter(label => typeof label === 'string');
    if (labels.length > 0) DOC_EXAMPLE_ORDER.set(name, labels);
  }
}

/** Sorts one component's examples by its doc's example order (stable). */
function orderExamplesByDoc(component, examples) {
  const labels = DOC_EXAMPLE_ORDER.get(component);
  if (!labels) return examples;
  const rank = name => {
    const index = labels.indexOf(name);
    return index === -1 ? labels.length : index;
  };
  return [...examples].sort((a, b) => rank(a.name) - rank(b.name));
}

function generateExampleRegistry(blocks, availableRegistryPaths) {
  console.log('Generating example registry...');

  const EXAMPLES_OUT = path.join(OUT_DIR, 'examples');
  fs.rmSync(EXAMPLES_OUT, {recursive: true, force: true});
  fs.mkdirSync(EXAMPLES_OUT, {recursive: true});

  const entries = [];
  for (const block of blocks) {
    if (importsPackageMissingFromDocsite(block.source)) {
      console.log(
        `  skipping example ${block.dirName} — imports a package not installed in the docsite`,
      );
      continue;
    }

    const identity = blockRegistryIdentity(
      block.name,
      block.exampleFor,
      block.isShowcase,
      block.registry,
    );
    const registryItemPath = availableRegistryPaths?.has(identity.path)
      ? identity.path
      : null;
    const base = block.sourcePackage
      ? `integration-${block.dirName}`
      : block.dirName;

    if (!block.isShowcase && block.exampleFor) {
      const destFile = writeBlockPreview(block, EXAMPLES_OUT, base);
      if (destFile) {
        entries.push({
          exampleFor: block.exampleFor,
          basename: base,
          registryItemPath,
          name: block.name || block.dirName,
          description: block.description || '',
          source: block.source,
        });
      }
    }

    for (const target of block.alsoExampleFor ?? []) {
      const basename = `${base}__${target}`;
      const destFile = writeBlockPreview(block, EXAMPLES_OUT, basename);
      if (destFile) {
        entries.push({
          exampleFor: target,
          basename,
          registryItemPath,
          name: block.name || block.dirName,
          description: block.description || `Example using ${target}.`,
          source: block.source,
        });
      }
    }
  }

  const grouped = {};
  for (const entry of entries) {
    if (!grouped[entry.exampleFor]) grouped[entry.exampleFor] = [];
    grouped[entry.exampleFor].push(entry);
  }

  const componentLines = Object.entries(grouped)
    .map(([component, examples]) => {
      const exampleLines = orderExamplesByDoc(component, examples)
        .map(
          entry =>
            `    {name: ${JSON.stringify(entry.name)}, description: ${JSON.stringify(entry.description)}, registryItemPath: ${JSON.stringify(entry.registryItemPath)}, source: ${JSON.stringify(entry.source)}, load: () => import('./examples/${entry.basename}')},`,
        )
        .join('\n');
      return `  '${component}': [\n${exampleLines}\n  ],`;
    })
    .join('\n');

  const registryContent = `// Auto-generated by scripts/generate-data.mjs — do not edit
import type {ComponentType} from 'react';

export interface ExampleEntry {
  name: string;
  description: string;
  registryItemPath: string | null;
  source: string;
  load: () => Promise<{default: ComponentType}>;
}

export const exampleRegistry: Record<string, ExampleEntry[]> = {
${componentLines}
};
`;

  writeRegistry('exampleRegistry.ts', registryContent);
  console.log(
    `  copied ${entries.length} example blocks for ${Object.keys(grouped).length} components`,
  );
  return entries.length;
}

// ── 6. Blog Registry ───────────────────────────────────────────────────

async function generateBlogRegistry() {
  console.log('Generating blog registry...');

  const POSTS_DIR = path.join(DOCSITE_ROOT, 'src', 'content', 'blog', 'posts');

  // Single source of truth for discovery + validation (shared with tests).
  const {discoverPosts, collectTypes, collectTags} = await import(
    pathToFileURL(path.join(DOCSITE_ROOT, 'src', 'lib', 'blog', 'posts.mjs'))
      .href
  );

  // Local development and every draft/preview deployment use the canary target.
  const includeDrafts = DOCSITE_TARGET === 'canary';
  const posts = discoverPosts(POSTS_DIR, {includeDrafts});
  const types = collectTypes(posts);
  const tags = collectTags(posts);

  // Definitive facts about body images, scanned from public/blog/** at build
  // time so ThemedImage never probes at runtime: which images have a
  // "<name>.dark.<ext>" counterpart, and the natural size of every "@2x"
  // image, which renders at half its pixel width. Paths are site-absolute
  // URLs ("/blog/...").
  const {darkImages, imageSizes} = collectBlogImages(
    path.join(DOCSITE_ROOT, 'public'),
  );

  const content = `// Auto-generated by scripts/generate-data.mjs — do not edit
import type {BlogPost, BlogPostType} from '../lib/blog/schema';

export const blogPosts: BlogPost[] = ${JSON.stringify(posts, null, 2)};

export const blogTypes: BlogPostType[] = ${JSON.stringify(types)};

export const blogTags: string[] = ${JSON.stringify(tags)};

export const blogPostCount = ${posts.length};

/**
 * Site-absolute paths of every dark-mode image variant found under
 * public/blog (files named "<name>.dark.<ext>"). ThemedImage consults this to
 * decide whether a body image has a dark counterpart — a definitive,
 * build-time list rather than a runtime existence probe.
 */
export const blogDarkImages: string[] = ${JSON.stringify(darkImages, null, 2)};

/**
 * Natural pixel size of every body image whose file name ends in "@2x"
 * (before the extension and the optional ".dark" marker). ThemedImage renders
 * such an image at half its pixel width, so a Retina screenshot shows the
 * component at the size it really is on screen.
 */
export const blogImageSizes: Record<string, {width: number; height: number}> =
  ${JSON.stringify(imageSizes, null, 2)};
`;
  writeRegistry('blogRegistry.ts', content);
  return {blogPostCount: posts.length, blogTypeCount: types.length};
}

function checkShadcnRouteLock(contracts, {allowSubset = false} = {}) {
  const lockPath = path.join(
    REPO_ROOT,
    'internal',
    'shadcn-registry',
    'routes.lock.json',
  );
  const lock = {version: 1, items: contracts};
  const serialized = `${JSON.stringify(lock, null, 2)}\n`;

  if (process.env.UPDATE_SHADCN_ROUTE_LOCK === '1') {
    if (allowSubset) {
      throw new Error(
        'Refusing to replace the complete ShadCN route lock from a production subset.',
      );
    }
    fs.writeFileSync(lockPath, serialized, 'utf8');
    console.log(`  updated ${path.relative(REPO_ROOT, lockPath)}`);
    return;
  }

  if (!fs.existsSync(lockPath)) {
    throw new Error(
      `Missing ${path.relative(REPO_ROOT, lockPath)}. Run UPDATE_SHADCN_ROUTE_LOCK=1 node apps/docsite/scripts/generate-data.mjs and review the public route contract.`,
    );
  }
  const current = fs.readFileSync(lockPath, 'utf8');
  if (allowSubset) {
    const locked = new Map(
      JSON.parse(current).items.map(contract => [contract.name, contract]),
    );
    for (const contract of contracts) {
      if (
        JSON.stringify(locked.get(contract.name)) !== JSON.stringify(contract)
      ) {
        throw new Error(
          `Production ShadCN route ${contract.path} is absent from or differs from the reviewed route lock.`,
        );
      }
    }
    return;
  }
  if (current !== serialized) {
    throw new Error(
      `Generated ShadCN names or routes changed. Preserve old paths with doc.registry.aliases, or intentionally refresh the reviewed lock with UPDATE_SHADCN_ROUTE_LOCK=1 node apps/docsite/scripts/generate-data.mjs.`,
    );
  }
}

async function main() {
  console.log('Generating docsite data...\n');

  const packages = generatePackageRegistry();
  const themeCount = await generateThemeRegistry(packages);
  const {allComponents, totalCount: componentCount} =
    await generateComponentRegistry();
  generateComponentPreviewRegistry(allComponents);
  generateGroupedComponentRegistry(allComponents);
  const {blocks, blockCount} = await generateBlockRegistry();
  generatePackageStyles(packages, blocks, allComponents);
  const {templates, templateCount} = await generateTemplateRegistry();
  const {docTopics, docsCount} = await generateDocsRegistry();
  generateSearchLinks({docTopics, allComponents, templates, blocks, packages});
  const {blogPostCount} = await generateBlogRegistry();
  const shadcnCounts = generateShadcnRegistryForTarget({
    target: DOCSITE_TARGET,
    outDir: path.join(DOCSITE_ROOT, 'public', 'shadcn'),
    packages,
    allComponents,
    blocks,
    templates,
    cliRoot: CLI_ROOT,
    dependencyTag: DOCSITE_TARGET === 'canary' ? 'canary' : null,
    externalDependencySpecs: registryExternalDependencySpecs(),
  });
  checkShadcnRouteLock(shadcnCounts.contracts, {
    allowSubset: DOCSITE_TARGET === 'latest',
  });
  // `/r` stays unclaimed for a future Astryx-native registry.
  fs.rmSync(path.join(DOCSITE_ROOT, 'public', 'r'), {
    recursive: true,
    force: true,
  });
  const shadcnUiItemPaths =
    DOCSITE_TARGET === 'canary' ? shadcnCounts.itemPaths : undefined;
  const showcaseCopied = generateShowcaseRegistry(blocks, shadcnUiItemPaths);
  const examplesCopied = generateExampleRegistry(blocks, shadcnUiItemPaths);
  const registryOrigin = resolveShadcnRegistryOrigin(process.env);
  const registryIsPreview =
    DOCSITE_TARGET === 'canary' &&
    registryOrigin !== 'https://astryx.atmeta.com/shadcn';
  writeRegistry(
    'shadcnRegistry.ts',
    `// Auto-generated — do not edit
export const shadcnRegistryOrigin = ${JSON.stringify(registryOrigin)};
export const shadcnRegistryIsPreview = ${registryIsPreview};
`,
  );

  console.log(`\nSummary:`);
  console.log(`  ${packages.length} packages`);
  console.log(`  ${componentCount} components`);
  console.log(
    `  ${blockCount} blocks (${showcaseCopied} showcases, ${examplesCopied} examples)`,
  );
  console.log(`  ${templateCount} templates`);
  console.log(`  ${docsCount} doc topics`);
  console.log(`  ${blogPostCount} blog posts`);
  console.log(`  ${themeCount} themes`);
  console.log(
    `  ${shadcnCounts.total} ShadCN registry items ` +
      `(${shadcnCounts.components} components, ${shadcnCounts.hooks} hooks, ` +
      `${shadcnCounts.showcases} showcases, ${shadcnCounts.examples} examples, ` +
      `${shadcnCounts.blocks} standalone blocks, ${shadcnCounts.pages} pages; ` +
      `${shadcnCounts.skippedUnpublishedComponents} unpublished components, ` +
      `${shadcnCounts.skippedUnpublishedBlocks} blocks, and ` +
      `${shadcnCounts.skippedUnpublishedPages} pages skipped)`,
  );
  console.log('Done.');
}

// Every `{@pm}` step on the site reads as npm, whatever this checkout uses.
runWithDocPackageManager(DOCSITE_PACKAGE_MANAGER, main).catch(err => {
  console.error(err);
  process.exit(1);
});
