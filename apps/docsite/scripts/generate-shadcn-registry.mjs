// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Generate a shadcn-compatible registry from the docsite's existing
 * component, block, and page catalogs.
 * @input The generated docsite package, component, block, and page records.
 * @output Static standard-registry JSON under the configured output directory.
 * @position Build-time serializer between Astryx's catalog and shadcn clients.
 *
 * The registry keeps Astryx packages as real dependencies. Component and hook
 * items create public re-exports; blocks and pages copy app-level composition
 * source that already imports published package paths and add adjacent receipts
 * so Astryx can reconcile later releases without taking ownership of user edits.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import babel from '@babel/core';
import presetTypeScript from '@babel/preset-typescript';
import stylexPlugin from '@stylexjs/babel-plugin';
import ts from 'typescript';
import {registryItemSchema, registrySchema} from 'shadcn/schema';
import {stripCopyrightHeader} from '../../../packages/cli/foundation/text/copyright-header.mjs';
import {
  createShadcnPrecompiledDeclaration,
  shadcnJavaScriptTarget,
  shadcnPrecompiledDeclarationTarget,
  transformShadcnJavaScriptSource,
} from '../../../packages/cli/authoring/shadcn/source-variants.mjs';
import {
  createRegistryReceipt,
  registryReceiptTarget,
  serializeRegistryReceipt,
} from '../../../packages/cli/authoring/shadcn/receipt.mjs';
import {
  blockRegistryIdentity,
  componentRegistryIdentity,
  pageRegistryIdentity,
  registryNameForPath,
} from '../src/lib/shadcnRegistry.mjs';

const REGISTRY_SCHEMA = 'https://ui.shadcn.com/schema/registry.json';
const REGISTRY_ITEM_SCHEMA = 'https://ui.shadcn.com/schema/registry-item.json';
const HOMEPAGE = 'https://astryx.atmeta.com';
const ASTRYX_CSS = {
  '@import "@astryxdesign/core/reset.css"': {},
  '@import "@astryxdesign/core/astryx.css"': {},
};

class UnpublishedAstryxDependencyError extends Error {
  constructor(packageName) {
    super(`No published package version found for ${packageName}`);
    this.name = 'UnpublishedAstryxDependencyError';
    this.packageName = packageName;
  }
}

function packageNameFromSpecifier(specifier) {
  if (specifier.startsWith('@')) {
    return specifier.split('/').slice(0, 2).join('/');
  }
  return specifier.split('/')[0];
}

function packageExportsSpecifier(pkg, specifier) {
  const packageExports = pkg.packageExports;
  if (packageExports == null) return true;

  const subpath = specifier.slice(pkg.name.length);
  const exportKey = subpath ? `.${subpath}` : '.';
  if (typeof packageExports === 'string' || Array.isArray(packageExports)) {
    return exportKey === '.';
  }
  if (Object.hasOwn(packageExports, exportKey)) return true;

  return Object.keys(packageExports).some(key => {
    const wildcardIndex = key.indexOf('*');
    if (wildcardIndex === -1) return false;
    return (
      exportKey.startsWith(key.slice(0, wildcardIndex)) &&
      exportKey.endsWith(key.slice(wildcardIndex + 1))
    );
  });
}

function readImportSpecifiers(source, fileName) {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TSX,
  );
  const specifiers = new Set();

  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.add(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      specifiers.add(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return [...specifiers].sort();
}

function dependencySpec(
  packageName,
  packageDependencies,
  fallbackRange = null,
) {
  const spec = packageDependencies.get(packageName);
  if (spec) {
    return spec;
  }
  if (packageName.startsWith('@astryxdesign/')) {
    throw new UnpublishedAstryxDependencyError(packageName);
  }
  return fallbackRange ? `${packageName}@${fallbackRange}` : packageName;
}

function precompileStylexSource(source, fileName) {
  if (!source.includes('stylex.create')) {
    return {source, extension: 'tsx', precompiledStylex: false};
  }

  const result = babel.transformSync(source, {
    filename: fileName,
    babelrc: false,
    configFile: false,
    // Imported, not named: Babel resolves a string preset from `cwd`, and CI
    // runs this script from the repo root, where only a hoisted node_modules
    // would carry docsite's own Babel presets.
    presets: [[presetTypeScript, {allExtensions: true, isTSX: true}]],
    plugins: [
      [
        stylexPlugin,
        {
          dev: false,
          runtimeInjection: true,
          classNamePrefix: 'p',
          treeshakeCompensation: true,
          unstable_moduleResolution: {type: 'commonJS'},
        },
      ],
    ],
    parserOpts: {plugins: ['typescript', 'jsx']},
  });
  if (!result?.code) {
    throw new Error(`StyleX precompile produced no code for ${fileName}`);
  }
  if (result.code.includes('stylex.create')) {
    throw new Error(`Uncompiled stylex.create remains in ${fileName}`);
  }
  const precompiled = `${result.code}\n`;
  return {
    // Normalize once through the pinned client's JavaScript printer. That
    // transform is idempotent, so tsx=true and tsx=false write identical JSX.
    source: transformShadcnJavaScriptSource(precompiled),
    // Babel strips the source's types while precompiling StyleX, so publish the
    // result honestly as JSX and add a narrow declaration beside the catalog.
    extension: 'jsx',
    precompiledStylex: true,
  };
}

function dependenciesForPackages(
  packageNames,
  packageDependencies,
  packagePeerDependencies,
) {
  const dependencies = new Set();
  const visited = new Set();
  const queue = [
    ...packageNames.map(name => ({name, range: null})),
    {name: '@astryxdesign/core', range: null},
    {name: '@stylexjs/stylex', range: null},
  ];

  while (queue.length > 0) {
    const {name, range} = queue.shift();
    if (
      visited.has(name) ||
      name === 'react' ||
      name.startsWith('react/') ||
      name === 'react-dom' ||
      name.startsWith('react-dom/')
    ) {
      continue;
    }
    visited.add(name);
    dependencies.add(dependencySpec(name, packageDependencies, range));

    for (const [peerName, peerRange] of Object.entries(
      packagePeerDependencies.get(name) ?? {},
    )) {
      queue.push({name: peerName, range: peerRange});
    }
  }

  return [...dependencies].sort();
}

function dependenciesForSource(
  source,
  fileName,
  packageDependencies,
  packagePeerDependencies,
) {
  const packages = new Set();
  for (const specifier of readImportSpecifiers(source, fileName)) {
    if (specifier.startsWith('.')) {
      throw new Error(
        `${fileName} has a relative import (${specifier}); registry compositions ` +
          'must use published package paths',
      );
    }
    if (
      specifier.startsWith('node:') ||
      specifier === 'react' ||
      specifier.startsWith('react/') ||
      specifier === 'react-dom' ||
      specifier.startsWith('react-dom/')
    ) {
      continue;
    }
    packages.add(packageNameFromSpecifier(specifier));
  }
  return dependenciesForPackages(
    [...packages],
    packageDependencies,
    packagePeerDependencies,
  );
}

function componentItem(
  packageName,
  component,
  packageDependencies,
  packagePeerDependencies,
) {
  if (!component.importPath) {
    throw new Error(
      `${packageName}/${component.name} has no public import path`,
    );
  }
  const isHook = component.name.startsWith('use') || component.params != null;
  const type = isHook ? 'registry:hook' : 'registry:component';
  const targetRoot = isHook ? 'hooks/astryx' : 'components/astryx';
  const identity = componentRegistryIdentity(
    packageName,
    component.name,
    isHook,
    component.registry,
  );
  const itemName = identity.name;
  const content = `export * from '${component.importPath}';\n`;

  return {
    $schema: REGISTRY_ITEM_SCHEMA,
    name: itemName,
    type,
    title: component.displayName || component.name,
    description:
      component.description ||
      `Public ${isHook ? 'hook' : 'component'} entry for ${component.name}.`,
    author: 'Astryx',
    dependencies: dependenciesForPackages(
      [packageName],
      packageDependencies,
      packagePeerDependencies,
    ),
    css: ASTRYX_CSS,
    files: [
      {
        path: `registry/${itemName}/${component.name}.ts`,
        type,
        target: `${targetRoot}/${component.name}.ts`,
        content,
      },
    ],
    astryx: {
      kind: isHook ? 'hook' : 'component',
      path: identity.path,
      aliases: identity.aliases,
      packageName,
      importPath: component.importPath,
      hidden: component.hidden === true,
    },
  };
}

function precompiledDeclarationFile(itemName, sourceTarget) {
  const target = shadcnPrecompiledDeclarationTarget(sourceTarget);
  return {
    path: `registry/${itemName}/astryx-types.d.mts`,
    type: 'registry:file',
    target,
    content: createShadcnPrecompiledDeclaration(sourceTarget),
  };
}

function withCompositionReceipt(item, identity, sourceVersion) {
  const [sourceFile, ...supportFiles] = item.files;
  const receiptTarget = registryReceiptTarget(sourceFile.target, item.name);
  const javascriptTarget = shadcnJavaScriptTarget(sourceFile.target);
  const variants =
    javascriptTarget === sourceFile.target
      ? []
      : [
          {
            format: 'javascript',
            target: javascriptTarget,
            content: transformShadcnJavaScriptSource(sourceFile.content),
          },
        ];
  const receipt = createRegistryReceipt({
    item: {
      name: item.name,
      path: identity.path,
      aliases: identity.aliases,
      kind: identity.kind,
    },
    sourceVersion,
    receiptTarget,
    files: [
      {
        id: 'primary',
        target: sourceFile.target,
        registryPath: sourceFile.path,
        content: sourceFile.content,
        variants,
      },
      ...supportFiles.map(file => ({
        id: 'types',
        target: file.target,
        registryPath: file.path,
        content: file.content,
        variants: [],
      })),
    ],
  });

  return {
    ...item,
    files: [
      sourceFile,
      ...supportFiles,
      {
        path: `registry/${item.name}/astryx-receipt.json`,
        type: 'registry:file',
        target: receiptTarget,
        content: serializeRegistryReceipt(receipt),
      },
    ],
    astryx: {
      ...item.astryx,
      receipt: {
        schemaVersion: receipt.schemaVersion,
        target: receiptTarget,
      },
    },
  };
}

function blockItem(
  block,
  packageDependencies,
  packagePeerDependencies,
  cliRoot,
  sourceVersion,
) {
  const identity = blockRegistryIdentity(
    block.name,
    block.exampleFor,
    block.isShowcase,
    block.registry,
  );
  const itemName = identity.name;
  const kind = identity.kind;
  const fileName = path.join(
    cliRoot,
    'assets',
    'templates',
    'blocks',
    block.category,
    `${block.dirName}.tsx`,
  );
  const compiled = precompileStylexSource(
    stripCopyrightHeader(block.source),
    fileName,
  );
  const sourceTarget = `components/astryx/${kind === 'block' ? 'blocks' : `${kind}s`}/${block.dirName}.${compiled.extension}`;
  return withCompositionReceipt(
    {
      $schema: REGISTRY_ITEM_SCHEMA,
      name: itemName,
      type: 'registry:block',
      title: block.displayName || block.name,
      description: block.description || `Astryx ${kind}: ${block.name}.`,
      author: 'Astryx',
      dependencies: dependenciesForSource(
        compiled.source,
        fileName,
        packageDependencies,
        packagePeerDependencies,
      ),
      css: ASTRYX_CSS,
      files: [
        {
          path: `registry/${itemName}/${block.dirName}.${compiled.extension}`,
          type: 'registry:block',
          target: sourceTarget,
          content: compiled.source,
        },
        ...(compiled.precompiledStylex
          ? [precompiledDeclarationFile(itemName, sourceTarget)]
          : []),
      ],
      astryx: {
        kind,
        path: identity.path,
        aliases: identity.aliases,
        exampleFor: block.exampleFor || null,
        category: block.category,
        componentsUsed: block.componentsUsed,
        precompiledStylex: compiled.precompiledStylex,
      },
    },
    identity,
    sourceVersion,
  );
}

function pageItem(
  template,
  packageDependencies,
  packagePeerDependencies,
  cliRoot,
  sourceVersion,
) {
  const identity = pageRegistryIdentity(template.slug, template.registry);
  const itemName = identity.name;
  const fileName = path.join(
    cliRoot,
    'assets',
    'templates',
    'pages',
    template.slug,
    'page.tsx',
  );
  const compiled = precompileStylexSource(
    stripCopyrightHeader(template.source),
    fileName,
  );
  const sourceTarget = `app/astryx/${template.slug}/page.${compiled.extension}`;
  return withCompositionReceipt(
    {
      $schema: REGISTRY_ITEM_SCHEMA,
      name: itemName,
      type: 'registry:page',
      title: template.name,
      description: template.description || `Astryx page: ${template.name}.`,
      author: 'Astryx',
      dependencies: dependenciesForSource(
        compiled.source,
        fileName,
        packageDependencies,
        packagePeerDependencies,
      ),
      css: ASTRYX_CSS,
      files: [
        {
          path: `registry/${itemName}/page.${compiled.extension}`,
          // shadcn 4.19.0 silently skips files typed registry:page. The item
          // remains registry:page while its source file uses the working type.
          type: 'registry:block',
          target: sourceTarget,
          content: compiled.source,
        },
        ...(compiled.precompiledStylex
          ? [precompiledDeclarationFile(itemName, sourceTarget)]
          : []),
      ],
      astryx: {
        kind: 'page',
        path: identity.path,
        aliases: identity.aliases,
        category: template.category,
        isReady: template.isReady,
        isHiddenFromOverview: template.isHiddenFromOverview,
        precompiledStylex: compiled.precompiledStylex,
      },
    },
    identity,
    sourceVersion,
  );
}

function assertUniqueItemNames(items) {
  const names = new Set();
  for (const item of items) {
    if (names.has(item.name)) {
      throw new Error(`Duplicate shadcn registry item name: ${item.name}`);
    }
    names.add(item.name);
  }
}

/**
 * Every file an item is written to, without `.json`: its organized path and
 * aliases, plus the root name route standard clients derive from an index
 * name (`shadcn search`, `@namespace/<name>`). An alias path also keeps the
 * name it stood for, so a renamed item still answers at its old name.
 */
export function itemRoutes(item) {
  if (registryNameForPath(item.astryx.path) !== item.name) {
    throw new Error(
      `${item.name} does not match the name of its path ${item.astryx.path}`,
    );
  }
  const organized = [item.astryx.path, ...item.astryx.aliases];
  return [...organized, ...organized.map(registryNameForPath)];
}

function assertUniqueItemPaths(items) {
  // Names are kind-prefixed slugs with no slash and every organized path
  // starts with a kind folder, so a name route can meet neither a path route
  // nor the `registry.json` index; checking every route in one set still
  // fails generation if any two items would write the same file.
  const paths = new Map();
  for (const item of items) {
    for (const itemPath of itemRoutes(item)) {
      const existing = paths.get(itemPath);
      if (existing) {
        throw new Error(
          `Duplicate shadcn registry path ${itemPath}: ${existing} and ${item.name}`,
        );
      }
      paths.set(itemPath, item.name);
    }
  }
}

function validateItem(item) {
  const result = registryItemSchema.safeParse(item);
  if (!result.success) {
    throw new Error(
      `${item.name} does not match the shadcn registry item schema:\n${result.error}`,
    );
  }
}

export function buildShadcnRegistry({
  packages,
  allComponents,
  blocks,
  templates,
  cliRoot = process.cwd(),
  dependencyTag = null,
  externalDependencySpecs = {},
  skipBlocksWithUnavailableComponents = false,
}) {
  const cliPackage = packages.find(pkg => pkg.name === '@astryxdesign/cli');
  const sourceVersion = dependencyTag ?? cliPackage?.version;
  if (!sourceVersion && (blocks.length > 0 || templates.length > 0)) {
    throw new Error(
      'Cannot generate copied composition receipts without an @astryxdesign/cli version',
    );
  }

  const packageDependencies = new Map([
    ...packages.map(pkg => [
      pkg.name,
      dependencyTag
        ? `${pkg.name}@${dependencyTag}`
        : `${pkg.name}@${pkg.version}`,
    ]),
    ...Object.entries(externalDependencySpecs),
  ]);
  const packagePeerDependencies = new Map(
    packages.map(pkg => [pkg.name, pkg.peerDependencies ?? {}]),
  );
  const componentEntries = Object.entries(allComponents);
  const skippedComponents = componentEntries
    .filter(([packageName]) => !packageDependencies.has(packageName))
    .reduce((count, [, components]) => count + components.length, 0);
  const componentItems = componentEntries
    .filter(([packageName]) => packageDependencies.has(packageName))
    .flatMap(([packageName, components]) =>
      components.map(component =>
        componentItem(
          packageName,
          component,
          packageDependencies,
          packagePeerDependencies,
        ),
      ),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  const availableComponentNames = new Set(
    componentEntries
      .filter(([packageName]) => packageDependencies.has(packageName))
      .flatMap(([, components]) => components.map(component => component.name)),
  );
  const packageCatalog = new Map(packages.map(pkg => [pkg.name, pkg]));
  const blockItems = [];
  let skippedUnpublishedBlocks = 0;
  for (const block of blocks) {
    // A released subpath can still lack a named component added after the last
    // package release. Production blocks must satisfy both contracts: the
    // imported subpath below and the published component snapshot here.
    if (
      skipBlocksWithUnavailableComponents &&
      block.componentsUsed?.some(
        componentName => !availableComponentNames.has(componentName),
      )
    ) {
      skippedUnpublishedBlocks++;
      continue;
    }
    const unpublishedComponentImport = readImportSpecifiers(
      block.source,
      `${block.dirName}.tsx`,
    ).find(specifier => {
      const pkg = packageCatalog.get(packageNameFromSpecifier(specifier));
      return pkg != null && !packageExportsSpecifier(pkg, specifier);
    });
    if (unpublishedComponentImport) {
      skippedUnpublishedBlocks++;
      continue;
    }
    try {
      blockItems.push(
        blockItem(
          block,
          packageDependencies,
          packagePeerDependencies,
          cliRoot,
          sourceVersion,
        ),
      );
    } catch (error) {
      if (error instanceof UnpublishedAstryxDependencyError) {
        skippedUnpublishedBlocks++;
        continue;
      }
      throw error;
    }
  }
  blockItems.sort((a, b) => a.name.localeCompare(b.name));

  const pageItems = [];
  let skippedUnpublishedPages = 0;
  for (const template of templates) {
    try {
      pageItems.push(
        pageItem(
          template,
          packageDependencies,
          packagePeerDependencies,
          cliRoot,
          sourceVersion,
        ),
      );
    } catch (error) {
      if (error instanceof UnpublishedAstryxDependencyError) {
        skippedUnpublishedPages++;
        continue;
      }
      throw error;
    }
  }
  pageItems.sort((a, b) => a.name.localeCompare(b.name));
  const items = [...componentItems, ...blockItems, ...pageItems];

  assertUniqueItemNames(items);
  assertUniqueItemPaths(items);
  for (const item of items) validateItem(item);

  const registry = {
    $schema: REGISTRY_SCHEMA,
    name: 'astryx',
    homepage: HOMEPAGE,
    items: items.map(item => ({
      ...item,
      files: item.files.map(({content: _content, ...file}) => file),
    })),
  };
  const registryResult = registrySchema.safeParse(registry);
  if (!registryResult.success) {
    throw new Error(
      `Generated registry does not match the shadcn registry schema:\n${registryResult.error}`,
    );
  }

  return {
    registry,
    items,
    counts: {
      components: componentItems.filter(
        item => item.astryx.kind === 'component',
      ).length,
      hooks: componentItems.filter(item => item.astryx.kind === 'hook').length,
      showcases: blockItems.filter(item => item.astryx.kind === 'showcase')
        .length,
      examples: blockItems.filter(item => item.astryx.kind === 'example')
        .length,
      blocks: blockItems.filter(item => item.astryx.kind === 'block').length,
      skippedUnpublishedComponents: skippedComponents,
      skippedUnpublishedBlocks,
      pages: pageItems.length,
      skippedUnpublishedPages,
      total: items.length,
    },
  };
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function generateShadcnRegistryForTarget({target, outDir, ...options}) {
  if (target !== 'canary' && target !== 'latest') {
    fs.rmSync(outDir, {recursive: true, force: true});
    throw new Error(`Unsupported ShadCN registry target: ${String(target)}`);
  }
  return generateShadcnRegistry({
    outDir,
    ...options,
    skipBlocksWithUnavailableComponents: target === 'latest',
  });
}

export function generateShadcnRegistry({
  outDir,
  packages,
  allComponents,
  blocks,
  templates,
  cliRoot,
  dependencyTag,
  externalDependencySpecs,
  skipBlocksWithUnavailableComponents,
}) {
  const result = buildShadcnRegistry({
    packages,
    allComponents,
    blocks,
    templates,
    cliRoot,
    dependencyTag,
    externalDependencySpecs,
    skipBlocksWithUnavailableComponents,
  });
  fs.rmSync(outDir, {recursive: true, force: true});
  fs.mkdirSync(outDir, {recursive: true});
  writeJson(path.join(outDir, 'registry.json'), result.registry);
  for (const item of result.items) {
    for (const itemPath of itemRoutes(item)) {
      writeJson(path.join(outDir, `${itemPath}.json`), item);
    }
  }
  return {
    ...result.counts,
    itemNames: new Set(result.items.map(item => item.name)),
    itemPaths: new Set(result.items.map(item => item.astryx.path)),
    routes: result.items.flatMap(item => [
      item.astryx.path,
      ...item.astryx.aliases,
    ]),
    contracts: result.items
      .map(item => ({
        name: item.name,
        path: item.astryx.path,
        aliases: item.astryx.aliases,
      }))
      .sort((a, b) => a.path.localeCompare(b.path)),
  };
}
