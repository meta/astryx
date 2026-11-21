// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The interfaces a Core declares for themes to widen by declaration
 *   merging (`interface ButtonVariantMap`), the prop axes they widen, the
 *   keys a project adds to them, and the kinds of value a Core prop takes.
 * @input  a Core package root; a theme target token or a component name and
 *   a prop name; a project folder and a page
 * @output whether a Core subpath declares an interface; the interface a
 *   theme's styling key on a target's prop enrolls in; every interface whose
 *   keys a component prop's type takes; the keys a project adds to each; the
 *   kinds of value (string, number, object…) a prop's declared type takes
 * @position Read by theme build (api/theme/build/build.mjs), which augments
 *   these interfaces, and by render (api/render/_adapter.mjs), which takes a
 *   widened prop's added keys as values the prop has and warns for a value
 *   of a kind the prop does not take.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {programRootsFor} from '../render/ts-paths.mjs';
import {coreThemeValues} from './core-theme-facts.mjs';
import {readDeclaredDependencies} from '../integrations/declared-dependencies.mjs';
import {resolveInstalledPackageDir} from '../integrations/installed-package.mjs';
import {findManifestPaths} from '../integrations/manifest-paths.mjs';
import {babelParse} from '../runtime/lazy-dependencies.mjs';
import {isCoreModule} from './core-elements.mjs';

/** @type {Map<string, string>} */
const declarationCache = new Map();

/**
 * The type declarations `@astryxdesign/core/<pascalName>` exposes: the shipped
 * `dist/<pascalName>/index.d.ts` (what a consumer's TypeScript sees), else the
 * `src/<pascalName>/index.ts` of a source checkout. With `includeTypes`, the
 * subpath's `types` file is read too. Returns '' when nothing is found.
 * @param {string | null} coreRoot the Core package root
 * @param {string} pascalName
 * @param {{includeTypes?: boolean}} [options]
 * @returns {string}
 */
export function readComponentDeclarations(coreRoot, pascalName, options = {}) {
  const includeTypes = options.includeTypes === true;
  const cacheKey = `${coreRoot}:${pascalName}:${includeTypes ? 'with-types' : 'index-only'}`;
  const cached = declarationCache.get(cacheKey);
  if (cached !== undefined) return cached;
  let contents = '';
  if (coreRoot) {
    const candidateSets = [
      [path.join(coreRoot, 'dist', pascalName, 'index.d.ts')],
      [path.join(coreRoot, 'src', pascalName, 'index.ts')],
    ];
    if (includeTypes) {
      candidateSets[0].push(
        path.join(coreRoot, 'dist', pascalName, 'types.d.ts'),
      );
      candidateSets[1].push(path.join(coreRoot, 'src', pascalName, 'types.ts'));
    }
    for (const files of candidateSets) {
      if (!fs.existsSync(files[0])) continue;
      for (const file of files) {
        try {
          if (fs.existsSync(file))
            contents += fs.readFileSync(file, 'utf-8') + '\n';
        } catch {
          // An unreadable file adds nothing.
        }
      }
      if (contents) break;
    }
  }
  declarationCache.set(cacheKey, contents);
  return contents;
}

/**
 * Whether `@astryxdesign/core/<pascalName>` declares the interface
 * `interfaceName`, which module augmentation can widen. A closed literal union
 * (`ButtonSize`) is not an extension point. A type re-export does not count:
 * augmentation widens only the module that declares the interface, so
 * augmenting a barrel that re-exports it makes a dead sibling interface.
 * @param {string | null} coreRoot the Core package root
 * @param {string} pascalName
 * @param {string} interfaceName
 * @param {{includeTypes?: boolean}} [options]
 * @returns {boolean}
 */
export function componentHasAugmentableInterface(
  coreRoot,
  pascalName,
  interfaceName,
  options,
) {
  const declarations = readComponentDeclarations(coreRoot, pascalName, options);
  if (!declarations) return false;
  return new RegExp(String.raw`\binterface\s+${interfaceName}\b`).test(
    declarations,
  );
}

/**
 * Extension points whose public module and interface do not follow the usual
 * `<Component><Prop>Map` convention, keyed `<Component>.<prop>`. TextType
 * reads CustomTextTypes from the theme module.
 * @type {Record<string, {moduleName: string, interfaceName: string, includeTypes?: boolean}>}
 */
const AUGMENTATION_OVERRIDES = {
  'Text.type': {
    moduleName: 'theme',
    interfaceName: 'CustomTextTypes',
    includeTypes: true,
  },
};

/**
 * The convention-breaking extension point of `<pascalName prop>` when the
 * Core declares it, as `{moduleName, interfaceName}`; null when the prop has
 * no such entry or the Core does not declare it.
 * @param {string | null} coreRoot the Core package root
 * @param {string} pascalName
 * @param {string} prop
 * @returns {{moduleName: string, interfaceName: string} | null}
 */
function overrideAugmentationPoint(coreRoot, pascalName, prop) {
  const override = Object.hasOwn(
    AUGMENTATION_OVERRIDES,
    `${pascalName}.${prop}`,
  )
    ? AUGMENTATION_OVERRIDES[`${pascalName}.${prop}`]
    : null;
  if (!override) return null;
  return componentHasAugmentableInterface(
    coreRoot,
    override.moduleName,
    override.interfaceName,
    {
      includeTypes: override.includeTypes,
    },
  )
    ? {moduleName: override.moduleName, interfaceName: override.interfaceName}
    : null;
}

/**
 * Convert a kebab-case component name to PascalCase.
 * e.g. 'button' → 'Button', 'progress-bar' → 'ProgressBar', 'avatar-status-dot' → 'AvatarStatusDot'
 * @param {string} name
 * @returns {string}
 */
function toPascalCase(name) {
  return name
    .split('-')
    .map(
      (/** @type {string} */ part) =>
        part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join('');
}

/** @type {Map<string, Array<{moduleName: string, interfacePrefix: string}>>} */
const augmentationTargetCache = new Map();

/**
 * Resolve a rendered theme class token (the key without `astryx-`) to candidate
 * public core subpaths and interface prefixes that may own its augmentable prop
 * maps. Some tokens are subtargets documented by a parent component
 * (`avatar-status-dot` augments `@astryxdesign/core/Avatar`). Component docs are
 * the source of truth for the target token → owning component relationship.
 *
 * @param {string | null} coreRoot the Core package root
 * @param {string} componentName
 * @returns {Promise<Array<{moduleName: string, interfacePrefix: string}>>}
 */
async function resolveAugmentationTargetCandidates(coreRoot, componentName) {
  const cacheKey = `${coreRoot}:${componentName}`;
  const cached = augmentationTargetCache.get(cacheKey);
  if (cached) return cached;

  const fallback = [
    {
      moduleName: toPascalCase(componentName),
      interfacePrefix: toPascalCase(componentName),
    },
  ];

  const coreSrc = coreRoot ? path.join(coreRoot, 'src') : null;
  if (!coreSrc || !fs.existsSync(coreSrc)) {
    augmentationTargetCache.set(cacheKey, fallback);
    return fallback;
  }

  /** @type {Array<{moduleName: string, interfacePrefix: string}>} */
  const matches = [];
  /** @type {Set<string>} */
  const seen = new Set();

  /**
   * @param {string} moduleName
   * @param {string} interfacePrefix
   */
  function addCandidate(moduleName, interfacePrefix) {
    const key = `${moduleName}:${interfacePrefix}`;
    if (seen.has(key)) return;
    seen.add(key);
    matches.push({moduleName, interfacePrefix});
  }

  const {owners} = await coreThemeValues(coreSrc);
  for (const {moduleName, components} of Object.hasOwn(owners, componentName)
    ? owners[componentName]
    : []) {
    // Try the exact rendered token first for documented subtargets such as
    // avatar-status-dot → AvatarStatusDotVariantMap, then the owning public
    // component name (for example, ProgressBar for progress-bar-fill).
    addCandidate(moduleName, toPascalCase(componentName));
    addCandidate(moduleName, moduleName);
    for (const name of components) addCandidate(moduleName, name);
  }
  // A target documented by a parent component may also have its own public
  // subpath and augmentation interface (Heading is documented under Text but
  // owns @astryxdesign/core/Heading). Keep the direct-name candidate after
  // discovered owners so both shapes are reachable without guessing which one
  // the source tree uses.
  for (const candidate of fallback) {
    addCandidate(candidate.moduleName, candidate.interfacePrefix);
  }
  const resolved = matches;
  augmentationTargetCache.set(cacheKey, resolved);
  return resolved;
}

/**
 * Public augmentable maps whose axis requests artwork instead of styling.
 * `Icon.variant` selects a theme's icon artwork, so it has no component styling
 * map (architecture:component-theming-surface INV14): a `components` key on it
 * never enrolls a value or generates an augmentation of its map.
 */
const ARTWORK_REQUEST_MAPS = new Set(['IconVariantMap']);

/**
 * Whether a theme's component styling keys may enroll values in `interfaceName`
 * on `@astryxdesign/core/<Component>`.
 * @param {string | null} coreRoot the Core package root
 * @param {string} pascalName
 * @param {string} interfaceName
 * @returns {boolean}
 */
function isComponentValueAugmentationPoint(
  coreRoot,
  pascalName,
  interfaceName,
) {
  return (
    !ARTWORK_REQUEST_MAPS.has(interfaceName) &&
    componentHasAugmentableInterface(coreRoot, pascalName, interfaceName)
  );
}

/**
 * The public module/interface a theme's styling key on target `component`'s
 * prop enrolls values in, as theme build generates its augmentation: the
 * convention-breaking entry of {@link AUGMENTATION_OVERRIDES}, else the first
 * `<prefix><Prop>Map` a candidate subpath declares
 * ({@link resolveAugmentationTargetCandidates}). Null when none does.
 * @param {string | null} coreRoot the Core package root
 * @param {string} component a theme target token (`button`, `avatar-status-dot`)
 * @param {string} prop
 * @returns {Promise<{moduleName: string, interfaceName: string}|null>}
 */
export async function resolveAugmentationTarget(coreRoot, component, prop) {
  const pascalName = toPascalCase(component);
  if (Object.hasOwn(AUGMENTATION_OVERRIDES, `${pascalName}.${prop}`)) {
    return overrideAugmentationPoint(coreRoot, pascalName, prop);
  }

  const propPascal = prop.charAt(0).toUpperCase() + prop.slice(1);
  const target = (
    await resolveAugmentationTargetCandidates(coreRoot, component)
  ).find(candidate =>
    isComponentValueAugmentationPoint(
      coreRoot,
      candidate.moduleName,
      `${candidate.interfacePrefix}${propPascal}Map`,
    ),
  );
  return target
    ? {
        moduleName: target.moduleName,
        interfaceName: `${target.interfacePrefix}${propPascal}Map`,
      }
    : null;
}

/**
 * The theme target token of a component name: `ClickableCard` →
 * `clickable-card`.
 * @param {string} pascalName
 * @returns {string}
 */
const tokenOf = pascalName =>
  pascalName.replace(
    /[A-Z]/g,
    (letter, at) => `${at ? '-' : ''}${letter.toLowerCase()}`,
  );

/**
 * Every interface whose keys the type of component `pascalName`'s prop
 * `prop` takes, so every interface whose augmentation widens the prop: the
 * one a theme's styling key enrolls in ({@link resolveAugmentationTarget}),
 * and each `keyof <Interface>` the prop's declared type reaches in Core's
 * source (`color?: TextColor`, `type TextColor = keyof TextColorMap`). An
 * empty set is a prop no augmentation widens; null is a prop whose type this
 * reader cannot follow.
 * @param {string | null} coreRoot the Core package root
 * @param {string} pascalName
 * @param {string} prop
 * @returns {Promise<Set<string> | null>}
 */
export async function propWideningInterfaces(coreRoot, pascalName, prop) {
  /** @type {Set<string>} */
  const names = new Set();
  const target = await resolveAugmentationTarget(
    coreRoot,
    tokenOf(pascalName),
    prop,
  );
  if (target) names.add(target.interfaceName);
  const typed = typeWideningInterfaces(coreRoot, pascalName, prop);
  if (typed === null) return target ? names : null;
  for (const name of typed) names.add(name);
  return names;
}

/** @typedef {{node: any, file: string}} Declaration */

/** @type {Map<string, {mtime: number, ast: any}>} */
const sourceCache = new Map();

/**
 * The parsed TypeScript of `file`, kept while the file is unchanged; null
 * when it cannot be read or parsed.
 * @param {string} file
 * @returns {any}
 */
function parsedSource(file) {
  const stat = statOrNull(file);
  if (!stat?.isFile()) return null;
  const kept = sourceCache.get(file);
  if (kept && kept.mtime === stat.mtimeMs) return kept.ast;
  let ast;
  try {
    ast = babelParse(fs.readFileSync(file, 'utf8'), {
      sourceType: 'module',
      errorRecovery: true,
      plugins: [
        ['typescript', {dts: DECLARATION_FILE.test(file)}],
        ...(file.endsWith('x') ? /** @type {const} */ (['jsx']) : []),
      ],
    });
  } catch {
    ast = null;
  }
  sourceCache.set(file, {mtime: stat.mtimeMs, ast});
  return ast;
}

/** What an extensionless module path may stand for, in Core's source. */
const MODULE_SUFFIXES = [
  '.ts',
  '.tsx',
  '.d.ts',
  '/index.ts',
  '/index.tsx',
  '/index.d.ts',
];

/**
 * The Core source file a module specifier in `fromFile` names: a relative
 * path, or a Core subpath (`@astryxdesign/core/Text` is `src/Text/index`).
 * Null for any other package, or when no file exists.
 * @param {string} coreRoot
 * @param {string} fromFile
 * @param {string} specifier
 * @returns {string | null}
 */
function coreModuleFile(coreRoot, fromFile, specifier) {
  let base;
  if (specifier.startsWith('.')) {
    base = path.resolve(
      path.dirname(fromFile),
      specifier.replace(/\.[cm]?jsx?$/, ''),
    );
  } else if (isCoreModule(specifier)) {
    base = path.join(
      coreRoot,
      'src',
      specifier.slice(CORE_PACKAGE.length + 1) || 'index',
    );
  } else {
    return null;
  }
  if (/\.tsx?$/.test(base) && statOrNull(base)?.isFile()) return base;
  return (
    MODULE_SUFFIXES.map(suffix => base + suffix).find(file =>
      statOrNull(file)?.isFile(),
    ) ?? null
  );
}

/**
 * The name a top-level declaration declares, if it declares one.
 * @param {any} node
 * @returns {string | undefined}
 */
function declaredName(node) {
  if (node.type === 'VariableDeclaration')
    return node.declarations.length === 1
      ? node.declarations[0].id?.name
      : undefined;
  return node.id?.type === 'Identifier' ? node.id.name : undefined;
}

/**
 * @param {any} node an import, export or module name node
 * @returns {string}
 */
const nameOf = node => (node.type === 'Identifier' ? node.name : node.value);

/**
 * Every declaration of `name` that `file` holds or reaches through its
 * imports and re-exports in Core's source (an interface may be declared more
 * than once). Empty when `file` does not have the name; null when the name
 * leads where this reader does not follow (another package, a namespace or
 * default import).
 * @param {string} coreRoot
 * @param {string} file
 * @param {string} name
 * @param {Set<string>} [seen]
 * @returns {Declaration[] | null}
 */
function declarationsOf(coreRoot, file, name, seen = new Set()) {
  const key = `${file}#${name}`;
  if (seen.has(key)) return [];
  seen.add(key);
  const ast = parsedSource(file);
  if (!ast) return null;
  const body = ast.program.body;
  /** @type {Declaration[]} */
  const local = [];
  for (const statement of body) {
    const node =
      statement.type === 'ExportNamedDeclaration' ||
      statement.type === 'ExportDefaultDeclaration'
        ? statement.declaration
        : statement;
    if (node && declaredName(node) === name) local.push({node, file});
  }
  if (local.length > 0) return local;
  /** @param {string} specifier @param {string} imported */
  const follow = (specifier, imported) => {
    const target = coreModuleFile(coreRoot, file, specifier);
    return target ? declarationsOf(coreRoot, target, imported, seen) : null;
  };
  for (const statement of body) {
    if (statement.type === 'ImportDeclaration') {
      const spec = statement.specifiers.find(
        (/** @type {any} */ s) => s.local.name === name,
      );
      if (spec)
        return spec.type === 'ImportSpecifier'
          ? follow(statement.source.value, nameOf(spec.imported))
          : null;
    }
    if (statement.type === 'ExportNamedDeclaration' && statement.source) {
      const spec = statement.specifiers.find(
        (/** @type {any} */ s) => nameOf(s.exported) === name,
      );
      if (spec)
        return spec.type === 'ExportSpecifier'
          ? follow(statement.source.value, nameOf(spec.local))
          : null;
    }
  }
  for (const statement of body) {
    if (statement.type !== 'ExportAllDeclaration' || statement.exported)
      continue;
    const found = follow(statement.source.value, name);
    if (found === null || found.length > 0) return found;
  }
  return [];
}

/** Utility types whose first argument holds the properties or values they keep. */
const PASS_THROUGH_TYPES = new Set([
  'Omit',
  'Pick',
  'Partial',
  'Required',
  'Readonly',
  'NonNullable',
  'Exclude',
  'Extract',
]);

/**
 * Every declared type of property `prop` of an object type node, followed
 * through interfaces, their `extends`, aliases, unions, intersections and the
 * utility types above (a union of prop shapes can declare it more than
 * once). Empty when the type has no such property; null when it leads where
 * this reader does not follow.
 * @param {string} coreRoot
 * @param {any} type
 * @param {string} file
 * @param {string} prop
 * @param {number} depth
 * @returns {{type: any, file: string}[] | null}
 */
function propertyOfType(coreRoot, type, file, prop, depth) {
  if (!type || depth > 24) return null;
  switch (type.type) {
    case 'TSParenthesizedType':
      return propertyOfType(
        coreRoot,
        type.typeAnnotation,
        file,
        prop,
        depth + 1,
      );
    case 'TSTypeLiteral':
      return propertyOfMembers(type.members, file, prop);
    case 'TSUnionType':
      return allOrNull(
        type.types.map((/** @type {any} */ part) =>
          propertyOfType(coreRoot, part, file, prop, depth + 1),
        ),
      );
    case 'TSIntersectionType':
      return anyFound(
        type.types.map((/** @type {any} */ part) =>
          propertyOfType(coreRoot, part, file, prop, depth + 1),
        ),
      );
    case 'TSTypeReference': {
      if (type.typeName.type !== 'Identifier') return null;
      if (PASS_THROUGH_TYPES.has(type.typeName.name)) {
        return propertyOfType(
          coreRoot,
          type.typeParameters?.params?.[0],
          file,
          prop,
          depth + 1,
        );
      }
      return propertyOfDeclarations(
        coreRoot,
        declarationsOf(coreRoot, file, type.typeName.name),
        prop,
        depth + 1,
      );
    }
    default:
      return null;
  }
}

/**
 * The found types of every part, or null when any part leads where this
 * reader does not follow.
 * @param {({type: any, file: string}[] | null)[]} parts
 * @returns {{type: any, file: string}[] | null}
 */
function allOrNull(parts) {
  return parts.some(part => part === null)
    ? null
    : parts.flatMap(part => /** @type {{type: any, file: string}[]} */ (part));
}

/**
 * The found types of the parts of an intersection: a part that cannot be
 * followed only narrows what another part declares, so the found ones
 * suffice. Null when none is found and one cannot be followed.
 * @param {({type: any, file: string}[] | null)[]} parts
 * @returns {{type: any, file: string}[] | null}
 */
function anyFound(parts) {
  const found = parts.flatMap(part => part ?? []);
  return found.length > 0 || !parts.includes(null) ? found : null;
}

/**
 * @param {any[]} members
 * @param {string} file
 * @param {string} prop
 * @returns {{type: any, file: string}[] | null}
 */
function propertyOfMembers(members, file, prop) {
  for (const member of members) {
    if (member.type !== 'TSPropertySignature' || member.computed) continue;
    if (nameOf(member.key) !== prop) continue;
    return member.typeAnnotation
      ? [{type: member.typeAnnotation.typeAnnotation, file}]
      : null;
  }
  return [];
}

/**
 * {@link propertyOfType} over declarations of one name. An interface's own
 * property hides the ones its `extends` declare.
 * @param {string} coreRoot
 * @param {Declaration[] | null} declarations
 * @param {string} prop
 * @param {number} depth
 * @returns {{type: any, file: string}[] | null}
 */
function propertyOfDeclarations(coreRoot, declarations, prop, depth) {
  if (!declarations || declarations.length === 0 || depth > 24) return null;
  return allOrNull(
    declarations.map(({node, file}) => {
      if (node.type === 'TSTypeAliasDeclaration')
        return propertyOfType(
          coreRoot,
          node.typeAnnotation,
          file,
          prop,
          depth + 1,
        );
      if (node.type !== 'TSInterfaceDeclaration') return null;
      const own = propertyOfMembers(node.body.body, file, prop);
      if (own === null || own.length > 0) return own;
      return anyFound(
        (node.extends ?? []).map((/** @type {any} */ heritage) =>
          propertyOfType(
            coreRoot,
            {
              type: 'TSTypeReference',
              typeName: heritage.expression,
              typeParameters: heritage.typeParameters,
            },
            file,
            prop,
            depth + 1,
          ),
        ),
      );
    }),
  );
}

/**
 * The interfaces every found type takes the keys of ({@link keyInterfaces}),
 * or null when one of them cannot be followed or nothing was found.
 * @param {string} coreRoot
 * @param {{type: any, file: string}[] | null} found
 * @param {number} depth
 * @returns {Set<string> | null}
 */
function keyInterfacesOfAll(coreRoot, found, depth) {
  if (!found || found.length === 0) return null;
  /** @type {Set<string>} */
  const names = new Set();
  for (const {type, file} of found) {
    const each = keyInterfaces(coreRoot, type, file, depth);
    if (!each) return null;
    for (const name of each) names.add(name);
  }
  return names;
}

/** Types whose values no augmentation widens. */
const CLOSED_TYPES = new Set([
  'TSLiteralType',
  'TSTemplateLiteralType',
  'TSStringKeyword',
  'TSNumberKeyword',
  'TSBooleanKeyword',
  'TSUndefinedKeyword',
  'TSNullKeyword',
  'TSNeverKeyword',
  'TSTypeLiteral',
  'TSFunctionType',
]);

/**
 * Every interface a type takes the keys of (`keyof TextColorMap`), followed
 * through aliases, unions, intersections, utility types and indexed access
 * (`TextProps['color']`). Null when the type leads where this reader does
 * not follow.
 * @param {string} coreRoot
 * @param {any} type
 * @param {string} file
 * @param {number} depth
 * @returns {Set<string> | null}
 */
function keyInterfaces(coreRoot, type, file, depth) {
  if (!type || depth > 24) return null;
  if (CLOSED_TYPES.has(type.type)) return new Set();
  switch (type.type) {
    case 'TSParenthesizedType':
    case 'TSOptionalType':
      return keyInterfaces(coreRoot, type.typeAnnotation, file, depth + 1);
    case 'TSUnionType':
    case 'TSIntersectionType': {
      /** @type {Set<string>} */
      const names = new Set();
      for (const part of type.types) {
        const found = keyInterfaces(coreRoot, part, file, depth + 1);
        if (!found) return null;
        for (const name of found) names.add(name);
      }
      return names;
    }
    case 'TSTypeOperator': {
      if (type.operator !== 'keyof') return null;
      const target = type.typeAnnotation;
      if (target.type === 'TSTypeQuery') return new Set();
      if (
        target.type !== 'TSTypeReference' ||
        target.typeName.type !== 'Identifier'
      )
        return null;
      const declarations = declarationsOf(coreRoot, file, target.typeName.name);
      if (!declarations || declarations.length === 0) return null;
      return declarations.every(d => d.node.type === 'TSInterfaceDeclaration')
        ? new Set([target.typeName.name])
        : null;
    }
    case 'TSTypeReference': {
      if (type.typeName.type !== 'Identifier') return null;
      if (PASS_THROUGH_TYPES.has(type.typeName.name)) {
        return keyInterfaces(
          coreRoot,
          type.typeParameters?.params?.[0],
          file,
          depth + 1,
        );
      }
      const declarations = declarationsOf(coreRoot, file, type.typeName.name);
      if (!declarations || declarations.length === 0) return null;
      /** @type {Set<string>} */
      const names = new Set();
      for (const {node, file: at} of declarations) {
        if (node.type !== 'TSTypeAliasDeclaration') return null;
        const found = keyInterfaces(
          coreRoot,
          node.typeAnnotation,
          at,
          depth + 1,
        );
        if (!found) return null;
        for (const name of found) names.add(name);
      }
      return names;
    }
    case 'TSIndexedAccessType': {
      const index = type.indexType;
      if (
        index.type !== 'TSLiteralType' ||
        typeof index.literal?.value !== 'string'
      )
        return null;
      return keyInterfacesOfAll(
        coreRoot,
        propertyOfType(
          coreRoot,
          type.objectType,
          file,
          index.literal.value,
          depth + 1,
        ),
        depth + 1,
      );
    }
    default:
      return null;
  }
}

/**
 * The interfaces whose keys the declared type of `<pascalName prop>` takes,
 * read from Core's source: the prop on `<pascalName>Props`, found from the
 * component's subpath, else from Core's root module. Null when Core's source
 * is absent or the type leads where this reader does not follow.
 * @param {string | null} coreRoot
 * @param {string} pascalName
 * @param {string} prop
 * @returns {Set<string> | null}
 */
function typeWideningInterfaces(coreRoot, pascalName, prop) {
  if (!coreRoot) return null;
  return keyInterfacesOfAll(
    coreRoot,
    declaredPropTypes(coreRoot, pascalName, prop),
    0,
  );
}

/**
 * Every declared type of `<pascalName prop>` in Core's source: the prop on
 * `<pascalName>Props`, found from the component's subpath, else from Core's
 * root module. Null when Core's source is absent or the props type leads
 * where this reader does not follow.
 * @param {string | null} coreRoot
 * @param {string} pascalName
 * @param {string} prop
 * @returns {{type: any, file: string}[] | null}
 */
function declaredPropTypes(coreRoot, pascalName, prop) {
  if (!coreRoot) return null;
  const from = path.join(coreRoot, 'src', 'index.ts');
  for (const specifier of [`${CORE_PACKAGE}/${pascalName}`, CORE_PACKAGE]) {
    const entry = coreModuleFile(coreRoot, from, specifier);
    if (!entry) continue;
    const declarations = declarationsOf(coreRoot, entry, `${pascalName}Props`);
    if (!declarations || declarations.length === 0) continue;
    return propertyOfDeclarations(coreRoot, declarations, prop, 0);
  }
  return null;
}

/**
 * @typedef {'string' | 'number' | 'boolean' | 'object' | 'array' | 'Date' | 'function'} ValueKind
 * @typedef {{kinds: Set<ValueKind>, fields?: string[] | null, numbers: Set<number>, anyNumber: boolean}} PropKinds
 */

/**
 * The kinds of value the declared type of `<pascalName prop>` takes, read
 * from Core's source by the same reader as {@link propWideningInterfaces}: a
 * string (a literal, a template, `keyof` a map), a number, a boolean, an
 * object (with the field names of the first object shape it names), an
 * array, a `Date` or a function. `null` and `undefined` add no kind. Null
 * when any part of the type leads where this reader does not follow (a React
 * type, a generic parameter, an enum): such a prop's kinds are not certain.
 * @param {string | null} coreRoot the Core package root
 * @param {string} pascalName
 * @param {string} prop
 * @returns {PropKinds | null}
 */
export function propValueKinds(coreRoot, pascalName, prop) {
  const found = declaredPropTypes(coreRoot, pascalName, prop);
  if (!found || found.length === 0 || !coreRoot) return null;
  /** @type {PropKinds} */
  const out = {kinds: new Set(), numbers: new Set(), anyNumber: false};
  for (const {type, file} of found) {
    if (!kindsOf(coreRoot, type, file, out, 0)) return null;
  }
  out.fields = out.fields?.length ? out.fields : null;
  return out.kinds.size > 0 ? out : null;
}

/**
 * The first written kind a prop's declared kinds do not take, or null when
 * the prop takes every one. An array, a `Date` or a function passes where
 * the type takes an object, since an object shape this reader names may
 * still accept one.
 * @param {ValueKind[]} written
 * @param {PropKinds} declared
 * @returns {ValueKind | null}
 */
export function unacceptedKind(written, declared) {
  const objectLike = /** @type {ValueKind[]} */ (['array', 'Date', 'function']);
  return (
    written.find(
      kind =>
        !declared.kinds.has(kind) &&
        !(objectLike.includes(kind) && declared.kinds.has('object')),
    ) ?? null
  );
}

/** Utility types that keep their argument's keys. */
const KEY_KEEPING_TYPES = new Set([
  'Partial',
  'Required',
  'Readonly',
  'NonNullable',
]);

/** Global types a prop's type may name, by the kind of value they take. */
const GLOBAL_KINDS = /** @type {Record<string, ValueKind>} */ ({
  Date: 'Date',
  Array: 'array',
  ReadonlyArray: 'array',
  Record: 'object',
  Function: 'function',
});

/**
 * Add the kinds a type node takes to `out`; false when it leads where this
 * reader does not follow.
 * @param {string} coreRoot
 * @param {any} type
 * @param {string} file
 * @param {PropKinds} out
 * @param {number} depth
 * @returns {boolean}
 */
function kindsOf(coreRoot, type, file, out, depth) {
  if (!type || depth > 24) return false;
  switch (type.type) {
    case 'TSStringKeyword':
    case 'TSTemplateLiteralType':
      out.kinds.add('string');
      return true;
    case 'TSNumberKeyword':
      out.kinds.add('number');
      out.anyNumber = true;
      return true;
    case 'TSBooleanKeyword':
      out.kinds.add('boolean');
      return true;
    case 'TSUndefinedKeyword':
    case 'TSNullKeyword':
    case 'TSVoidKeyword':
    case 'TSNeverKeyword':
      return true;
    case 'TSLiteralType': {
      const literal = type.literal;
      const kind =
        literal.type === 'StringLiteral' || literal.type === 'TemplateLiteral'
          ? 'string'
          : literal.type === 'NumericLiteral' ||
              literal.type === 'UnaryExpression'
            ? 'number'
            : literal.type === 'BooleanLiteral'
              ? 'boolean'
              : null;
      if (!kind) return false;
      out.kinds.add(kind);
      if (kind === 'number') {
        const n =
          literal.type === 'UnaryExpression'
            ? -literal.argument.value
            : literal.value;
        if (typeof n === 'number') out.numbers.add(n);
        else out.anyNumber = true;
      }
      return true;
    }
    case 'TSTypeLiteral':
      return addObject(out, type.members);
    case 'TSFunctionType':
    case 'TSConstructorType':
      out.kinds.add('function');
      return true;
    case 'TSArrayType':
    case 'TSTupleType':
      out.kinds.add('array');
      return true;
    case 'TSParenthesizedType':
    case 'TSOptionalType':
      return kindsOf(coreRoot, type.typeAnnotation, file, out, depth + 1);
    case 'TSTypeOperator':
      if (type.operator === 'keyof')
        return keyKinds(coreRoot, type.typeAnnotation, file, out);
      return (
        type.operator === 'readonly' &&
        kindsOf(coreRoot, type.typeAnnotation, file, out, depth + 1)
      );
    case 'TSUnionType':
      return type.types.every((/** @type {any} */ part) =>
        kindsOf(coreRoot, part, file, out, depth + 1),
      );
    case 'TSIntersectionType':
      return intersectionKinds(coreRoot, type.types, file, out, depth);
    case 'TSIndexedAccessType': {
      const index = type.indexType;
      if (
        index.type !== 'TSLiteralType' ||
        typeof index.literal?.value !== 'string'
      )
        return false;
      const found = propertyOfType(
        coreRoot,
        type.objectType,
        file,
        index.literal.value,
        depth + 1,
      );
      if (!found || found.length === 0) return false;
      return found.every(f =>
        kindsOf(coreRoot, f.type, f.file, out, depth + 1),
      );
    }
    case 'TSTypeReference': {
      if (type.typeName.type !== 'Identifier') return false;
      const name = type.typeName.name;
      if (PASS_THROUGH_TYPES.has(name)) {
        /** @type {PropKinds} */
        const inner = {kinds: new Set(), numbers: new Set(), anyNumber: false};
        if (
          !kindsOf(
            coreRoot,
            type.typeParameters?.params?.[0],
            file,
            inner,
            depth + 1,
          )
        )
          return false;
        for (const kind of inner.kinds) out.kinds.add(kind);
        for (const n of inner.numbers) out.numbers.add(n);
        out.anyNumber ||= inner.anyNumber;
        // `Omit`, `Pick`, `Exclude` and `Extract` change which keys or members
        // remain, so the first argument's field names are not the prop's.
        if (inner.fields !== undefined)
          addShape(out, KEY_KEEPING_TYPES.has(name) ? inner.fields : null);
        return true;
      }
      const declarations = declarationsOf(coreRoot, file, name);
      if (
        declarations &&
        declarations.length > 0 &&
        declarations.every(d => d.node.type === 'TSInterfaceDeclaration')
      ) {
        // Every declaration of a merged interface is one shape.
        out.kinds.add('object');
        addShape(out, interfaceFields(coreRoot, declarations, depth + 1));
        return true;
      }
      if (declarations && declarations.length > 0) {
        return declarations.every(({node, file: at}) => {
          if (node.type === 'TSTypeAliasDeclaration')
            return kindsOf(coreRoot, node.typeAnnotation, at, out, depth + 1);
          if (node.type === 'TSInterfaceDeclaration') {
            out.kinds.add('object');
            addShape(
              out,
              interfaceFields(coreRoot, [{node, file: at}], depth + 1),
            );
            return true;
          }
          return false;
        });
      }
      if (declarations && Object.hasOwn(GLOBAL_KINDS, name)) {
        out.kinds.add(GLOBAL_KINDS[name]);
        return true;
      }
      return false;
    }
    default:
      return false;
  }
}

/**
 * Add the kinds of the keys of an interface (`keyof ButtonVariantMap`): a
 * string for a named key, a number for a numeric one. False for the keys of
 * anything else (`keyof typeof styles` can hold numbers).
 * @param {string} coreRoot
 * @param {any} target the type `keyof` applies to
 * @param {string} file
 * @param {PropKinds} out
 * @returns {boolean}
 */
function keyKinds(coreRoot, target, file, out) {
  if (
    target.type !== 'TSTypeReference' ||
    target.typeName.type !== 'Identifier'
  )
    return false;
  const declarations = declarationsOf(coreRoot, file, target.typeName.name);
  if (!declarations || declarations.length === 0) return false;
  if (!declarations.every(d => d.node.type === 'TSInterfaceDeclaration'))
    return false;
  for (const {node} of declarations) {
    for (const member of node.body.body) {
      if (member.type !== 'TSPropertySignature' || member.computed)
        return false;
      if (member.key.type === 'NumericLiteral') {
        out.kinds.add('number');
        out.numbers.add(member.key.value);
      } else out.kinds.add('string');
    }
  }
  return true;
}

/**
 * The kinds of an intersection: those every part takes (`keyof Map & string`
 * is a string). False when a part cannot be followed.
 * @param {string} coreRoot
 * @param {any[]} parts
 * @param {string} file
 * @param {PropKinds} out
 * @param {number} depth
 * @returns {boolean}
 */
function intersectionKinds(coreRoot, parts, file, out, depth) {
  /** @type {ValueKind[] | null} */
  let common = null;
  /** @type {(string[] | null)[]} */
  const shapes = [];
  for (const part of parts) {
    // `string & {}` keeps a string open to completion: `{}` adds no kind.
    if (part.type === 'TSTypeLiteral' && part.members.length === 0) continue;
    /** @type {PropKinds} */
    const each = {kinds: new Set(), numbers: new Set(), anyNumber: false};
    if (!kindsOf(coreRoot, part, file, each, depth + 1)) return false;
    common =
      common === null
        ? [...each.kinds]
        : common.filter(kind => each.kinds.has(kind));
    if (each.fields !== undefined) shapes.push(each.fields);
  }
  for (const kind of common ?? []) out.kinds.add(kind);
  // One object part names its fields; several make a shape this reader does
  // not merge.
  if (shapes.length > 0) addShape(out, shapes.length === 1 ? shapes[0] : null);
  // The numbers an intersection keeps are not worked out: it takes any.
  if (common?.includes('number')) out.anyNumber = true;
  return true;
}

/**
 * The names of the fields an object type's members declare. A member typed
 * `never`, or one whose key is not a plain name (Core's brand keys are
 * module paths), is a marker no page writes.
 * @param {any[]} members
 * @returns {string[]}
 */
function plainFields(members) {
  return members.flatMap(m => {
    if (m.type !== 'TSPropertySignature' || m.computed) return [];
    if (m.typeAnnotation?.typeAnnotation?.type === 'TSNeverKeyword') return [];
    const name = nameOf(m.key);
    return /^[A-Za-z_$][\w$]*$/.test(name) ? [name] : [];
  });
}

/**
 * Record one object shape's fields in `out`. The message names fields only
 * when every shape the type allows has the same ones: two different shapes,
 * or a shape whose fields are not all known (null), leave none.
 * @param {PropKinds} out
 * @param {string[] | null} fields
 */
function addShape(out, fields) {
  if (out.fields === undefined) out.fields = fields;
  else if (
    out.fields !== null &&
    (fields === null || out.fields.join() !== fields.join())
  )
    out.fields = null;
}

/**
 * Every field an interface takes: its own, from each of its declarations,
 * and those of the interfaces it extends. Null when a base is generic or
 * cannot be found.
 * @param {string} coreRoot
 * @param {{node: any, file: string}[]} declarations
 * @param {number} depth
 * @returns {string[] | null}
 */
function interfaceFields(coreRoot, declarations, depth) {
  if (depth > 16) return null;
  const fields = [];
  for (const {node, file} of declarations) {
    fields.push(...plainFields(node.body.body));
    for (const base of node.extends ?? []) {
      if (
        base.expression?.type !== 'Identifier' ||
        base.typeParameters ||
        base.typeArguments
      )
        return null;
      const found = declarationsOf(coreRoot, file, base.expression.name);
      if (!found || found.length === 0) return null;
      if (found.every(d => d.node.type === 'TSInterfaceDeclaration')) {
        const inherited = interfaceFields(coreRoot, found, depth + 1);
        if (!inherited) return null;
        fields.push(...inherited);
      } else if (
        found.length === 1 &&
        found[0].node.type === 'TSTypeAliasDeclaration' &&
        found[0].node.typeAnnotation.type === 'TSTypeLiteral'
      ) {
        fields.push(...plainFields(found[0].node.typeAnnotation.members));
      } else return null;
    }
  }
  return [...new Set(fields)];
}

/**
 * Add an object type literal to `out`. A shape with only call signatures is
 * a function.
 * @param {PropKinds} out
 * @param {any[]} members
 * @returns {boolean}
 */
function addObject(out, members) {
  const callable =
    members.length > 0 &&
    members.every(
      (/** @type {any} */ m) => m.type === 'TSCallSignatureDeclaration',
    );
  out.kinds.add(callable ? 'function' : 'object');
  if (!callable) addShape(out, plainFields(members));
  return true;
}

const CORE_PACKAGE = '@astryxdesign/core';

/** A project's own TypeScript file, declarations included. */
const SOURCE_FILE = /\.[cm]?tsx?$/;
/** A declaration file, the only TypeScript an installed package publishes. */
const DECLARATION_FILE = /\.d\.[cm]?ts$/;
/**
 * Files that may augment Core (their text names Core in a `declare module`)
 * a project read parses before it gives up as incomplete.
 */
const CANDIDATE_LIMIT = 2_000;

/**
 * The keys a project adds to Core's interfaces by module augmentation
 * (`declare module '@astryxdesign/core/Button' { interface ButtonVariantMap
 * { 'primary-muted': true } }`), keyed by interface name. It reads the places
 * TypeScript reads for the project's pages: every TypeScript file under the
 * project folder outside `node_modules` and hidden folders (a theme build's
 * `<theme>.variants.d.ts` included), each place inside the project the
 * page's tsconfig (`files`, `include`, `typeRoots`) adds, even a hidden one
 * (`.next/types`), and the declaration files of each package the project
 * declares that depends on Core or has an integration manifest. `complete`
 * is false when the page's tsconfig reaches outside the project folder, the
 * walk meets a linked folder or a folder it cannot list, a
 * file whose text names Core in a `declare module` cannot be read or parsed,
 * or more than {@link CANDIDATE_LIMIT} files name it: the keys may then miss
 * some, and a caller must not take them as the whole set. Only those files
 * are parsed, so a broken page elsewhere changes nothing. `files` are the
 * files that augment Core, for a caller that reads them with TypeScript.
 * @param {string} projectDir the folder of the project's package.json
 * @param {string} file the page, whose tsconfig says what else TypeScript reads
 * @returns {{keys: Map<string, Set<string>>, complete: boolean, files: string[]}}
 */
export function projectAugmentations(projectDir, file) {
  /** @type {Map<string, Set<string>>} */
  const keys = new Map();
  /** @type {{candidates: number, complete: boolean, files: string[]}} */
  const state = {candidates: 0, complete: true, files: []};
  const roots = programRootsFor(file) ?? [];
  if (roots.some(root => placeInWalk(projectDir, root) === 'outside'))
    state.complete = false;
  // A root the walk skips (Next.js includes `.next/types/**/*.ts`) is read on its own.
  for (const root of roots) {
    if (!state.complete) break;
    if (placeInWalk(projectDir, root) !== 'skipped') continue;
    const found = statOrNull(root);
    if (found?.isDirectory()) readTree(root, SOURCE_FILE, keys, state);
    else if (found?.isFile() && SOURCE_FILE.test(root)) {
      const read = readAugmentations(root, keys);
      if (read === 'failed') state.complete = false;
      else if (read === 'read') state.files.push(root);
    }
  }
  if (state.complete) readTree(projectDir, SOURCE_FILE, keys, state);
  for (const dir of astryxDependencyDirs(projectDir)) {
    if (!state.complete) break;
    readTree(dir, DECLARATION_FILE, keys, state);
  }
  return {keys, complete: state.complete, files: state.files};
}

/**
 * The folders of the packages `projectDir`'s package.json declares
 * (readDeclaredDependencies) that depend on Core (or peer on it) or carry an
 * integration manifest: the theme and integration packages whose
 * declarations can augment Core.
 * @param {string} projectDir
 * @returns {string[]}
 */
function astryxDependencyDirs(projectDir) {
  /** @type {string[]} */
  const dirs = [];
  for (const {name} of readDeclaredDependencies(projectDir)) {
    if (name === CORE_PACKAGE) continue;
    const dir = resolveInstalledPackageDir(name, projectDir)?.packageDir;
    if (!dir) continue;
    /** @type {any} */
    let pkg;
    try {
      pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    } catch {
      continue;
    }
    const onCore = Boolean(
      pkg?.dependencies?.[CORE_PACKAGE] ??
      pkg?.peerDependencies?.[CORE_PACKAGE],
    );
    if (onCore || findManifestPaths(dir).length > 0) dirs.push(dir);
  }
  return dirs;
}

/**
 * Read the augmentations of every file under `root` that `pattern` matches,
 * into `keys`. It does not enter `node_modules`, hidden folders, or linked
 * folders.
 * @param {string} root
 * @param {RegExp} pattern
 * @param {Map<string, Set<string>>} keys
 * @param {{candidates: number, complete: boolean, files: string[]}} state
 */
function readTree(root, pattern, keys, state) {
  const folders = [root];
  while (folders.length > 0 && state.complete) {
    const folder = /** @type {string} */ (folders.pop());
    let entries;
    try {
      entries = fs.readdirSync(folder, {withFileTypes: true});
    } catch {
      state.complete = false;
      return;
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const file = path.join(folder, entry.name);
      // A linked folder can hold files from anywhere, the walk does not
      // follow it, and TypeScript does: what it adds is unknown.
      const linked = entry.isSymbolicLink() ? statOrNull(file) : null;
      if (entry.isSymbolicLink() && (!linked || linked.isDirectory())) {
        state.complete = false;
        return;
      }
      if (entry.isDirectory()) folders.push(file);
      else if (
        pattern.test(entry.name) &&
        (entry.isFile() || linked?.isFile())
      ) {
        const read = readAugmentations(file, keys);
        if (read === 'none') continue;
        if (read === 'failed' || ++state.candidates > CANDIDATE_LIMIT) {
          state.complete = false;
          return;
        }
        state.files.push(file);
      }
    }
  }
}

/**
 * @param {string} file
 * @returns {fs.Stats | null}
 */
function statOrNull(file) {
  try {
    return fs.statSync(file);
  } catch {
    return null;
  }
}

/**
 * Where `target` lies for the project walk: 'outside' `projectDir`,
 * 'skipped' inside a `node_modules` or hidden folder the walk does not enter,
 * or 'walked'.
 * @param {string} projectDir
 * @param {string} target absolute
 * @returns {'outside' | 'skipped' | 'walked'}
 */
function placeInWalk(projectDir, target) {
  const relative = path.relative(projectDir, target);
  if (relative === '') return 'walked';
  if (relative.startsWith('..') || path.isAbsolute(relative)) return 'outside';
  return relative
    .split(path.sep)
    .some(part => part === 'node_modules' || part.startsWith('.'))
    ? 'skipped'
    : 'walked';
}

/**
 * Add the keys `file` adds to Core's interfaces to `keys`. A file whose text
 * does not name Core in a `declare module` adds nothing and is not parsed.
 * @param {string} file
 * @param {Map<string, Set<string>>} keys
 * @returns {'none' | 'read' | 'failed'} 'none' for a file that cannot
 *   augment Core, 'failed' when the file cannot be read or parsed
 */
function readAugmentations(file, keys) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return 'failed';
  }
  if (!text.includes(CORE_PACKAGE) || !/\bdeclare\s+module\b/.test(text))
    return 'none';
  /** @type {any} */
  let ast;
  try {
    ast = babelParse(text, {
      sourceType: 'module',
      errorRecovery: true,
      plugins: [
        ['typescript', {dts: DECLARATION_FILE.test(file)}],
        ...(file.endsWith('x') ? /** @type {const} */ (['jsx']) : []),
      ],
    });
  } catch {
    return 'failed';
  }
  for (const statement of ast.program.body) {
    if (
      statement.type !== 'TSModuleDeclaration' ||
      statement.id?.type !== 'StringLiteral'
    )
      continue;
    const target = statement.id.value;
    if (!isCoreModule(target)) continue;
    for (const member of statement.body?.body ?? []) {
      const declaration =
        member.type === 'ExportNamedDeclaration' ? member.declaration : member;
      if (declaration?.type !== 'TSInterfaceDeclaration') continue;
      const added = keys.get(declaration.id.name) ?? new Set();
      for (const property of declaration.body.body) {
        if (property.type !== 'TSPropertySignature' || property.computed)
          continue;
        const key = property.key;
        if (key.type === 'StringLiteral') added.add(key.value);
        else if (key.type === 'Identifier') added.add(key.name);
        else if (key.type === 'NumericLiteral') added.add(String(key.value));
      }
      keys.set(declaration.id.name, added);
    }
  }
  return 'read';
}
