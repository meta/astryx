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
 * An install is a copy: it replaces demo content and demo media as `template
 * copy` does. The item description discloses that; the receipt keeps its shape.
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
  missingPublishedImport,
  packageExportsSpecifier,
  packageNameFromSpecifier,
} from './published-exports.mjs';
import {
  MARKED_VIDEO_PLACEHOLDER,
  replaceTemplateDemos,
} from '../../../packages/cli/foundation/discovery/template-adapter.mjs';
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

/**
 * The item description, plus a sentence that discloses the replaced demo
 * content when there is any. The install writes into a project and returns no
 * response, so the description and the marked placeholders are the disclosure.
 * @param {string} description
 * @param {{demoMediaReplaced: number, demoContentReplaced: number}} replaced
 */
export function withReplacementNote(description, replaced) {
  const {demoMediaReplaced, demoContentReplaced} = replaced;
  if (demoMediaReplaced + demoContentReplaced === 0) return description;
  const counts = [
    demoMediaReplaced > 0 &&
      `${demoMediaReplaced} demo media ${demoMediaReplaced === 1 ? 'reference' : 'references'}`,
    demoContentReplaced > 0 &&
      `${demoContentReplaced} demo content ${demoContentReplaced === 1 ? 'element' : 'elements'}`,
  ].filter(Boolean);
  const lead = /[.!?]$/u.test(description.trimEnd())
    ? description.trimEnd()
    : `${description.trimEnd()}.`;
  return `${lead} Astryx replaced ${counts.join(' and ')} with marked placeholders; put your own content there.`;
}

/**
 * The entry with the source a copy starts from. An entry whose `source` is
 * already a copy, such as `template show` output, names its authored file in
 * `authoredSourcePath`; the install applies every copy replacement to that file.
 * @template {{source: string, authoredSourcePath?: string | null}} T
 * @param {T} entry
 * @returns {T}
 */
function withAuthoredSource(entry) {
  return entry.authoredSourcePath
    ? {...entry, source: fs.readFileSync(entry.authoredSourcePath, 'utf-8')}
    : entry;
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
  const {source: copiedSource, ...replaced} = replaceTemplateDemos(
    block.source,
    {videoPlaceholder: MARKED_VIDEO_PLACEHOLDER},
  );
  const compiled = precompileStylexSource(
    stripCopyrightHeader(copiedSource),
    fileName,
  );
  const sourceTarget = `components/astryx/${kind === 'block' ? 'blocks' : `${kind}s`}/${block.dirName}.${compiled.extension}`;
  return withCompositionReceipt(
    {
      $schema: REGISTRY_ITEM_SCHEMA,
      name: itemName,
      type: 'registry:block',
      title: block.displayName || block.name,
      description: withReplacementNote(
        block.description || `Astryx ${kind}: ${block.name}.`,
        replaced,
      ),
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
  const {source: copiedSource, ...replaced} = replaceTemplateDemos(
    template.source,
    {videoPlaceholder: MARKED_VIDEO_PLACEHOLDER},
  );
  const compiled = precompileStylexSource(
    stripCopyrightHeader(copiedSource),
    fileName,
  );
  const sourceTarget = `app/astryx/${template.slug}/page.${compiled.extension}`;
  return withCompositionReceipt(
    {
      $schema: REGISTRY_ITEM_SCHEMA,
      name: itemName,
      type: 'registry:page',
      title: template.name,
      description: withReplacementNote(
        template.description || `Astryx page: ${template.name}.`,
        replaced,
      ),
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
  publishedImports = null,
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
  // Every item left out, with why, and every one kept unchecked, so a "not
  // run" never reads as a pass.
  const skippedItems = [];
  const unreadImports = [];
  function releaseOf(specifier) {
    const pkg = packageCatalog.get(packageNameFromSpecifier(specifier));
    return pkg == null
      ? null
      : {packageName: pkg.name, version: pkg.version ?? null};
  }
  // Whether every name an item imports from its own packages is published.
  // A published subpath can lack a name a later release adds there, such as a
  // new function; the item returns once a release exports it. An item whose
  // own packages' declarations cannot be read stays, and the build names it.
  function exportsPublished(kind, name, source) {
    if (publishedImports == null) return true;
    const {missing, unread} = missingPublishedImport(source, publishedImports);
    if (missing != null) {
      skippedItems.push({
        kind,
        name,
        reason: 'export',
        ...missing,
        ...releaseOf(missing.specifier),
      });
      return false;
    }
    for (const specifier of unread) {
      const release = releaseOf(specifier);
      if (release != null) {
        unreadImports.push({kind, name, specifier, ...release});
      }
    }
    return true;
  }
  for (const block of blocks.map(withAuthoredSource)) {
    // A released subpath can still lack a named component added after the last
    // package release. Production blocks must satisfy both contracts: the
    // imported subpath below and the published component snapshot here.
    const unavailable = skipBlocksWithUnavailableComponents
      ? (block.componentsUsed ?? []).filter(
          component => !availableComponentNames.has(component),
        )
      : [];
    if (unavailable.length > 0) {
      skippedItems.push({
        kind: 'block',
        name: block.dirName,
        reason: 'component',
        names: unavailable,
      });
      skippedUnpublishedBlocks++;
      continue;
    }
    const undeclared = readImportSpecifiers(
      block.source,
      `${block.dirName}.tsx`,
    ).find(specifier => {
      const pkg = packageCatalog.get(packageNameFromSpecifier(specifier));
      return pkg != null && !packageExportsSpecifier(pkg, specifier);
    });
    if (undeclared != null) {
      skippedItems.push({
        kind: 'block',
        name: block.dirName,
        reason: 'subpath',
        specifier: undeclared,
        ...releaseOf(undeclared),
      });
      skippedUnpublishedBlocks++;
      continue;
    }
    if (!exportsPublished('block', block.dirName, block.source)) {
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
        skippedItems.push({
          kind: 'block',
          name: block.dirName,
          reason: 'package',
          packageName: error.packageName,
        });
        skippedUnpublishedBlocks++;
        continue;
      }
      throw error;
    }
  }
  blockItems.sort((a, b) => a.name.localeCompare(b.name));

  const pageItems = [];
  let skippedUnpublishedPages = 0;
  for (const template of templates.map(withAuthoredSource)) {
    if (!exportsPublished('page', template.slug, template.source)) {
      skippedUnpublishedPages++;
      continue;
    }
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
        skippedItems.push({
          kind: 'page',
          name: template.slug,
          reason: 'package',
          packageName: error.packageName,
        });
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
    skippedItems,
    unreadImports,
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

function releaseText({packageName, version}) {
  return version ? `${packageName} ${version}` : packageName;
}

const SKIP_NOTICES = {
  component: skip =>
    `uses ${skip.names.join(', ')}, which the published components do not include`,
  subpath: skip =>
    `imports ${skip.specifier}, a subpath ${releaseText(skip)} does not export`,
  package: skip => `needs ${skip.packageName}, which has no published release`,
  export: skip =>
    `imports ${skip.names.join(', ')} from ${skip.specifier}, which ` +
    `${releaseText(skip)} does not export`,
};

/** The order notices print in: GitHub's run page shows only the first ten. */
const NOTICE_ORDER = ['export', 'unread', 'subpath', 'package', 'component'];

/** One line per item the registry leaves out or keeps unchecked. */
export function registrySkipNotices({skippedItems, unreadImports}) {
  const lines = [
    ...skippedItems.map(skip => ({
      reason: skip.reason,
      line:
        `not run until a release has it: ${skip.kind} ${skip.name} ` +
        SKIP_NOTICES[skip.reason](skip),
    })),
    ...unreadImports.map(kept => ({
      reason: 'unread',
      line:
        `could not read what ${kept.specifier} exports in ` +
        `${releaseText(kept)}; kept ${kept.kind} ${kept.name}`,
    })),
  ];
  return lines
    .sort(
      (a, b) => NOTICE_ORDER.indexOf(a.reason) - NOTICE_ORDER.indexOf(b.reason),
    )
    .map(({line}) => line);
}

function workflowCommandText(text) {
  return text
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A');
}

/**
 * Prints each notice, and in GitHub Actions also as an annotation and a job
 * summary list, so a "not run" never reads as a pass.
 */
export function reportRegistrySkips(
  notices,
  {env = process.env, log = console.log, appendFile = fs.appendFileSync} = {},
) {
  const heading = `${notices.length} not run or unchecked`;
  if (notices.length > 0 && env.GITHUB_ACTIONS === 'true') {
    log(
      `::notice title=ShadCN registry::${heading}; the job summary lists them all`,
    );
  }
  for (const notice of notices) {
    log(`  ShadCN registry: ${notice}`);
    if (env.GITHUB_ACTIONS === 'true') {
      log(`::notice title=ShadCN registry::${workflowCommandText(notice)}`);
    }
  }
  if (notices.length > 0 && env.GITHUB_STEP_SUMMARY) {
    appendFile(
      env.GITHUB_STEP_SUMMARY,
      `### ShadCN registry: ${heading}\n\n` +
        notices.map(notice => `- ${notice}`).join('\n') +
        '\n',
    );
  }
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
    publishedImports:
      target === 'latest' ? (options.publishedImports ?? null) : null,
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
  publishedImports,
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
    publishedImports,
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
    skippedItems: result.skippedItems,
    unreadImports: result.unreadImports,
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
