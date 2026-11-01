#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file verify-full-catalog.mjs
 * @description Installs every generated Astryx registry item through the pinned
 *   ShadCN client in TypeScript and JavaScript modes, verifies exact written
 *   bytes and dependencies, then compiles every installed source file against
 *   current local exports or the exact published packages named by production.
 *   ShadCN's own scratch directories stay inside each consumer, which is
 *   removed afterwards.
 * @input A generated preview or hidden production registry under
 *   apps/docsite/public/shadcn.
 * @output A clean-consumer proof for every canonical item and alias route.
 * @position Required CI contract for the public ShadCN compatibility surface.
 */

import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import {createRequire} from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';

import {build} from 'esbuild';

import {
  createShadcnPrecompiledDeclaration,
  shadcnJavaScriptTarget,
  shadcnPrecompiledDeclarationTarget,
  transformShadcnJavaScriptSource,
} from '../../packages/cli/authoring/shadcn/source-variants.mjs';
import {
  parseRegistryReceipt,
  registryContentHash,
} from '../../packages/cli/authoring/shadcn/receipt.mjs';
import {expandWorkspaceDirs} from '../../scripts/lib/workspace-globs.mjs';
import {registryNameForPath} from '../../apps/docsite/src/lib/shadcnRegistry.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const REGISTRY_DIR = path.join(
  REPO_ROOT,
  'apps',
  'docsite',
  'public',
  'shadcn',
);
const docsiteRequire = createRequire(
  path.join(REPO_ROOT, 'apps', 'docsite', 'package.json'),
);
const SHADCN_BIN = docsiteRequire.resolve('shadcn');
const TYPESCRIPT_BIN = docsiteRequire.resolve('typescript/bin/tsc');
const KEEP_TEMP = process.env.ASTRYX_KEEP_SHADCN_MATRIX === '1';
const USE_PUBLISHED_PACKAGES =
  process.env.ASTRYX_SHADCN_USE_PUBLISHED_PACKAGES === '1';
const MAX_COMMAND_OUTPUT = 16 * 1024 * 1024;
const COPIED_KINDS = new Set(['showcase', 'example', 'block', 'page']);

function fail(message) {
  throw new Error(`ShadCN registry CI: ${message}`);
}

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function resolveInside(root, relative, label) {
  if (typeof relative !== 'string' || path.isAbsolute(relative)) {
    fail(`${label} is not a safe relative path: ${String(relative)}`);
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relative);
  if (
    resolved !== resolvedRoot &&
    !resolved.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    fail(`${label} escapes its root: ${relative}`);
  }
  return resolved;
}

function packageName(spec) {
  if (spec.startsWith('@')) {
    const slash = spec.indexOf('/');
    const version = spec.indexOf('@', slash);
    return version === -1 ? spec : spec.slice(0, version);
  }
  const version = spec.indexOf('@');
  return version === -1 ? spec : spec.slice(0, version);
}

function localPackageDirs() {
  const result = new Map();
  for (const directory of expandWorkspaceDirs(REPO_ROOT)) {
    const manifestPath = path.join(directory, 'package.json');
    if (!fs.existsSync(manifestPath)) continue;
    const manifest = readJSON(manifestPath);
    if (typeof manifest.name === 'string') {
      result.set(manifest.name, directory);
    }
  }
  return result;
}

function verifyItemFileShape(item) {
  const receipts = item.files.filter(
    file =>
      file.type === 'registry:file' &&
      file.target.includes('/.astryx/') &&
      file.target.endsWith('.json'),
  );
  const declarations = item.files.filter(
    file =>
      file.type === 'registry:file' && file.target.endsWith('.astryx.d.mts'),
  );
  const sources = item.files.filter(
    file => !receipts.includes(file) && !declarations.includes(file),
  );
  const kind = item.astryx?.kind;

  if (COPIED_KINDS.has(kind)) {
    const precompiled = item.astryx?.precompiledStylex === true;
    if (
      sources.length !== 1 ||
      receipts.length !== 1 ||
      declarations.length !== (precompiled ? 1 : 0) ||
      item.files.length !== (precompiled ? 3 : 2)
    ) {
      fail(
        `${item.name} must contain one source, one receipt, and a declaration only for precompiled JavaScript`,
      );
    }
    const source = sources[0];
    const receiptFile = receipts[0];
    if (precompiled) {
      if (!/\.jsx?$/.test(source.target)) {
        fail(`${item.name} precompiled source must be JavaScript`);
      }
      const declaration = declarations[0];
      if (
        declaration.target !==
          shadcnPrecompiledDeclarationTarget(source.target) ||
        declaration.content !==
          createShadcnPrecompiledDeclaration(source.target)
      ) {
        fail(`${item.name} has an invalid precompiled-source declaration`);
      }
    } else if (!/\.tsx?$/.test(source.target)) {
      fail(`${item.name} canonical copied source must remain TypeScript`);
    }
    const expectedReceiptTarget = path.posix.join(
      path.posix.dirname(source.target),
      '.astryx',
      `${item.name}.json`,
    );
    if (receiptFile.target !== expectedReceiptTarget) {
      fail(`${item.name} receipt is not adjacent to its source`);
    }

    let receipt;
    try {
      receipt = parseRegistryReceipt(JSON.parse(receiptFile.content));
    } catch (error) {
      fail(`${item.name} has an invalid receipt: ${error.message}`);
    }
    if (
      receipt.item.name !== item.name ||
      receipt.item.path !== item.astryx.path ||
      receipt.item.kind !== kind ||
      receipt.files.length !== (precompiled ? 2 : 1) ||
      receipt.files[0].registryPath !== source.path ||
      receipt.files[0].registryTarget !== source.target ||
      receipt.files[0].content !== source.content
    ) {
      fail(`${item.name} receipt does not describe its installed source`);
    }
    if (precompiled) {
      const declaration = declarations[0];
      const declarationReceipt = receipt.files[1];
      if (
        declarationReceipt.id !== 'types' ||
        declarationReceipt.registryPath !== declaration.path ||
        declarationReceipt.registryTarget !== declaration.target ||
        declarationReceipt.content !== declaration.content ||
        declarationReceipt.variants?.length !== 0
      ) {
        fail(
          `${item.name} receipt does not describe its TypeScript declaration`,
        );
      }
    }
    if (receipt.schemaVersion !== 2) {
      fail(`${item.name} receipt is not schema version 2`);
    }
    const expectedJavaScriptTarget = shadcnJavaScriptTarget(source.target);
    const javascript = receipt.files[0].variants.find(
      variant => variant.format === 'javascript',
    );
    if (expectedJavaScriptTarget === source.target) {
      if (receipt.files[0].variants.length !== 0) {
        fail(
          `${item.name} JavaScript source must not duplicate itself as a variant`,
        );
      }
    } else if (
      receipt.files[0].variants.length !== 1 ||
      javascript?.registryTarget !== expectedJavaScriptTarget ||
      javascript?.content !== transformShadcnJavaScriptSource(source.content) ||
      javascript?.sha256 !== registryContentHash(javascript?.content ?? '')
    ) {
      fail(`${item.name} receipt lacks its exact JavaScript install variant`);
    }
    return;
  }

  if (
    (kind === 'component' || kind === 'hook') &&
    sources.length === 1 &&
    receipts.length === 0 &&
    declarations.length === 0 &&
    item.files.length === 1
  ) {
    return;
  }

  fail(`${item.name} has an unsupported ${String(kind)} file shape`);
}

function loadCatalog() {
  const indexPath = path.join(REGISTRY_DIR, 'registry.json');
  if (!fs.existsSync(indexPath)) {
    fail(
      `missing ${path.relative(REPO_ROOT, indexPath)}; generate the canary docsite data first`,
    );
  }

  const index = readJSON(indexPath);
  if (!Array.isArray(index.items) || index.items.length === 0) {
    fail('registry.json contains no items');
  }

  const names = new Map();
  const routes = new Map();
  const targets = new Map();
  const items = [];

  for (const summary of index.items) {
    const name = summary.name;
    const registryPath = summary.astryx?.path;
    if (typeof name !== 'string' || typeof registryPath !== 'string') {
      fail('registry.json contains an item without a stable name and path');
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
      fail(`item name is not safe: ${name}`);
    }
    if (names.has(name)) {
      fail(`duplicate item name ${name}`);
    }
    names.set(name, registryPath);

    const canonicalFile = resolveInside(
      REGISTRY_DIR,
      `${registryPath}.json`,
      `${name} canonical route`,
    );
    if (!fs.existsSync(canonicalFile)) {
      fail(`${name} is missing canonical route ${registryPath}.json`);
    }
    const canonicalBytes = fs.readFileSync(canonicalFile, 'utf8');
    const item = JSON.parse(canonicalBytes);
    if (item.name !== name || item.astryx?.path !== registryPath) {
      fail(`${registryPath}.json does not match its registry.json identity`);
    }

    // Search results and `@namespace/<name>` resolve `<name>.json` in the
    // registry root, and an alias keeps the old name it stood for; each must
    // serve the canonical item's exact bytes.
    const organized = [registryPath, ...(item.astryx?.aliases ?? [])];
    for (const nameRoute of organized.map(registryNameForPath)) {
      const nameFile = resolveInside(
        REGISTRY_DIR,
        `${nameRoute}.json`,
        `${name} name route`,
      );
      if (!fs.existsSync(nameFile)) {
        fail(`${name} is missing its name route ${nameRoute}.json`);
      }
      if (fs.readFileSync(nameFile, 'utf8') !== canonicalBytes) {
        fail(
          `name route ${nameRoute}.json drifted from canonical item ${name}`,
        );
      }
    }

    for (const route of [registryPath, ...(item.astryx?.aliases ?? [])]) {
      const prior = routes.get(route);
      if (prior != null) {
        fail(`route ${route}.json is claimed by both ${prior} and ${name}`);
      }
      routes.set(route, name);
      const routeFile = resolveInside(
        REGISTRY_DIR,
        `${route}.json`,
        `${name} route`,
      );
      if (!fs.existsSync(routeFile)) {
        fail(`${name} is missing route ${route}.json`);
      }
      if (fs.readFileSync(routeFile, 'utf8') !== canonicalBytes) {
        fail(`alias route ${route}.json drifted from canonical item ${name}`);
      }
    }

    if (!Array.isArray(item.files) || item.files.length === 0) {
      fail(`${name} has no installable files`);
    }
    for (const file of item.files) {
      if (typeof file.target !== 'string' || typeof file.content !== 'string') {
        fail(`${name} has a file without a target and content`);
      }
      resolveInside('/registry-source', file.path, `${name} source path`);
      resolveInside('/consumer', file.target, `${name} target`);
      const prior = targets.get(file.target);
      if (prior != null) {
        fail(`target ${file.target} is written by both ${prior} and ${name}`);
      }
      targets.set(file.target, name);
    }
    verifyItemFileShape(item);
    items.push(item);
  }

  return {items, routeCount: routes.size, targetCount: targets.size};
}

function writeConsumer(project, items, packageDirs, {tsx}) {
  const rootManifest = readJSON(path.join(REPO_ROOT, 'package.json'));
  const itemDirectory = path.join(project, 'items');
  fs.mkdirSync(path.join(project, 'src'), {recursive: true});
  fs.mkdirSync(itemDirectory, {recursive: true});

  fs.writeFileSync(
    path.join(project, 'package.json'),
    `${JSON.stringify(
      {
        name: 'astryx-shadcn-registry-ci',
        private: true,
        version: '0.0.0',
        packageManager: rootManifest.packageManager,
        dependencies: {
          '@types/react': rootManifest.devDependencies['@types/react'],
          '@types/react-dom': rootManifest.devDependencies['@types/react-dom'],
          react: rootManifest.devDependencies.react,
          'react-dom': rootManifest.devDependencies['react-dom'],
        },
      },
      null,
      2,
    )}\n`,
  );
  // Every dependency is pinned by generated registry data. The consumer is
  // ephemeral, and local Astryx packages need their checked-in install hooks.
  fs.writeFileSync(
    path.join(project, 'pnpm-workspace.yaml'),
    'packages: []\ndangerouslyAllowAllBuilds: true\n',
  );
  fs.writeFileSync(
    path.join(project, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          jsx: 'react-jsx',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          paths: {'@/*': ['./src/*']},
          target: 'ES2022',
        },
        include: ['src'],
      },
      null,
      2,
    )}\n`,
  );
  fs.writeFileSync(
    path.join(project, 'components.json'),
    `${JSON.stringify(
      {
        $schema: 'https://ui.shadcn.com/schema.json',
        style: 'nova',
        rsc: false,
        tsx,
        tailwind: {
          config: '',
          css: 'src/index.css',
          baseColor: '',
          cssVariables: true,
          prefix: '',
        },
        aliases: {
          components: '@/components',
          hooks: '@/hooks',
          lib: '@/lib',
          ui: '@/components/ui',
          utils: '@/lib/utils',
        },
        iconLibrary: 'lucide',
      },
      null,
      2,
    )}\n`,
  );
  fs.writeFileSync(path.join(project, 'src', 'index.css'), '');

  const itemPaths = [];
  const dependencyNames = new Set();
  for (const item of items) {
    const installItem = structuredClone(item);
    installItem.dependencies = (installItem.dependencies ?? []).map(spec => {
      const name = packageName(spec);
      dependencyNames.add(name);
      if (!name.startsWith('@astryxdesign/')) return spec;
      if (USE_PUBLISHED_PACKAGES) {
        const version = spec.slice(name.length + 1);
        if (!/^\d+\.\d+\.\d+$/.test(version)) {
          fail(
            `${item.name} production dependency ${spec} is not an exact release`,
          );
        }
        return spec;
      }
      const directory = packageDirs.get(name);
      if (directory == null) {
        fail(`${item.name} depends on unresolved workspace package ${name}`);
      }
      return `${name}@file:${directory}`;
    });
    const itemPath = resolveInside(
      itemDirectory,
      `${item.name}.json`,
      `${item.name} temporary item`,
    );
    fs.writeFileSync(itemPath, JSON.stringify(installItem));
    itemPaths.push(itemPath);
  }

  return {dependencyNames, itemPaths};
}

function runShadcn(project, itemPaths) {
  if (!fs.existsSync(SHADCN_BIN)) {
    fail('the pinned ShadCN binary is not installed');
  }
  // ShadCN leaves an empty temporary directory behind for every file it
  // transforms: keep them inside the consumer, which main() removes.
  const scratch = path.join(project, '.tmp');
  fs.mkdirSync(scratch, {recursive: true});
  const result = spawnSync(
    SHADCN_BIN,
    ['add', ...itemPaths, '--yes', '--overwrite', '--silent'],
    {
      cwd: project,
      encoding: 'utf8',
      env: {...process.env, CI: 'true', TMPDIR: scratch},
      maxBuffer: MAX_COMMAND_OUTPUT,
      timeout: 10 * 60_000,
    },
  );
  if (result.error != null) {
    fail(`could not run the pinned ShadCN client: ${result.error.message}`);
  }
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    fail(`pinned ShadCN exited ${result.status}`);
  }
}

function expectedInstalledFile(file, tsx) {
  if (tsx) return {target: file.target, content: file.content};
  const target = shadcnJavaScriptTarget(file.target);
  return {
    target,
    content:
      target === file.target
        ? file.content
        : transformShadcnJavaScriptSource(file.content),
  };
}

function verifyInstall(project, items, dependencyNames, {tsx}) {
  const sources = [];
  let installedFiles = 0;

  for (const item of items) {
    for (const file of item.files) {
      const expected = expectedInstalledFile(file, tsx);
      const installed = resolveInside(
        path.join(project, 'src'),
        expected.target,
        `${item.name} installed target`,
      );
      if (!fs.existsSync(installed)) {
        fail(`${item.name} did not install ${expected.target}`);
      }
      const actual = fs.readFileSync(installed, 'utf8');
      if (actual !== expected.content) {
        fail(
          `${item.name} installed different ${tsx ? 'TypeScript' : 'JavaScript'} bytes at ${expected.target}`,
        );
      }
      installedFiles += 1;
      if (
        /\.[cm]?[jt]sx?$/.test(expected.target) &&
        !/\.d\.[cm]?ts$/.test(expected.target)
      ) {
        sources.push(installed);
      }
    }
  }

  const manifest = readJSON(path.join(project, 'package.json'));
  const installedDependencies = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ]);
  for (const dependency of dependencyNames) {
    if (!installedDependencies.has(dependency)) {
      fail(`pinned ShadCN did not install declared dependency ${dependency}`);
    }
  }

  const css = fs.readFileSync(path.join(project, 'src', 'index.css'), 'utf8');
  for (const specifier of [
    '@astryxdesign/core/reset.css',
    '@astryxdesign/core/astryx.css',
  ]) {
    if (!css.includes(specifier)) {
      fail(`pinned ShadCN did not install required CSS import ${specifier}`);
    }
  }

  return {installedFiles, sources};
}

function verifyPrecompiledTypeDeclarations(project, items) {
  const precompiled = items.filter(
    item => item.astryx?.precompiledStylex === true,
  );
  if (precompiled.length === 0) return;

  const imports = [];
  const identifiers = [];
  const declarationFiles = [];
  for (const [index, item] of precompiled.entries()) {
    const source = item.files.find(file => /\.jsx?$/.test(file.target));
    const declaration = item.files.find(file =>
      file.target.endsWith('.astryx.d.mts'),
    );
    if (source == null || declaration == null) {
      fail(`${item.name} is missing its precompiled source or declaration`);
    }
    const identifier = `Composition${index}`;
    const specifier = `./${source.target.replace(/\.jsx?$/, '')}`;
    imports.push(`import ${identifier} from ${JSON.stringify(specifier)};`);
    identifiers.push(identifier);
    declarationFiles.push(`src/${declaration.target}`);
  }

  const harness = 'src/__astryx-precompiled-typecheck.ts';
  fs.writeFileSync(
    path.join(project, harness),
    `${imports.join('\n')}\n\nconst compositions: Array<import('react').ComponentType> = [${identifiers.join(', ')}];\nvoid compositions;\n`,
  );
  const configPath = path.join(project, 'tsconfig.precompiled.json');
  fs.writeFileSync(
    configPath,
    `${JSON.stringify(
      {
        compilerOptions: {
          strict: true,
          noEmit: true,
          module: 'ESNext',
          moduleResolution: 'Bundler',
          skipLibCheck: true,
          target: 'ES2022',
        },
        files: [harness, ...declarationFiles],
      },
      null,
      2,
    )}\n`,
  );
  const result = spawnSync(
    process.execPath,
    [TYPESCRIPT_BIN, '--project', configPath],
    {
      cwd: project,
      encoding: 'utf8',
      maxBuffer: MAX_COMMAND_OUTPUT,
      timeout: 2 * 60_000,
    },
  );
  if (result.error != null) {
    fail(
      `could not type-check precompiled declarations: ${result.error.message}`,
    );
  }
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    fail(`precompiled declaration type-check exited ${result.status}`);
  }
}

async function compileSources(project, sources) {
  await build({
    absWorkingDir: project,
    bundle: true,
    entryPoints: sources,
    format: 'esm',
    jsx: 'automatic',
    logLevel: 'warning',
    outdir: path.join(project, 'dist'),
    platform: 'browser',
    splitting: true,
    target: 'es2022',
  });
}

async function main() {
  const startedAt = Date.now();
  const catalog = loadCatalog();
  const packageDirs = USE_PUBLISHED_PACKAGES ? null : localPackageDirs();
  const results = [];

  for (const tsx of [true, false]) {
    const mode = tsx ? 'TypeScript' : 'JavaScript';
    const project = fs.mkdtempSync(
      path.join(os.tmpdir(), `astryx-shadcn-registry-${tsx ? 'tsx' : 'jsx'}-`),
    );
    try {
      const {dependencyNames, itemPaths} = writeConsumer(
        project,
        catalog.items,
        packageDirs,
        {tsx},
      );
      runShadcn(project, itemPaths);
      const {installedFiles, sources} = verifyInstall(
        project,
        catalog.items,
        dependencyNames,
        {tsx},
      );
      if (tsx) verifyPrecompiledTypeDeclarations(project, catalog.items);
      await compileSources(project, sources);
      results.push({mode, installedFiles, sources: sources.length});
    } finally {
      if (KEEP_TEMP) {
        console.log(`Kept ${mode} consumer at ${project}`);
      } else {
        fs.rmSync(project, {recursive: true, force: true});
      }
    }
  }

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `Verified ${catalog.items.length} items and ${catalog.routeCount} routes in ` +
      `${results.map(result => `${result.mode}: ${result.installedFiles} files, ${result.sources} compiled sources`).join('; ')} (${seconds}s).`,
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
