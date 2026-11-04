// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Resolve importable icon registries, or component icon slot maps, for the
 * selected theme export.
 *
 * @input Loaded theme export identity, the theme field to carry (`icons` or
 *   `componentIcons`), plus the caller's source reader and the theme loader's
 *   resolver (this module performs no environment access).
 * @output Import bindings and an expression preserving inherited values.
 * @position Private theme-build packaging helper; never evaluates authored source.
 */

import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {AstryxError} from '../../error.mjs';
import {ERROR_CODES} from '../../../foundation/response/error-codes.mjs';

/**
 * @typedef {object} IconImports
 * @property {{importPath: string, importedName: string, localName: string}[]} imports
 * @property {string} expression
 * @property {string} exportName
 * @property {string} [iconsSpecifierImportPath]
 * @property {string} [iconsSpecifierLocalName]
 * @property {string} [mergeName] - Set when `expression` calls the slot merge
 *   function, which the module must declare under this name.
 */

/** @typedef {{kind: 'reference', module: any, binding: any, members: string[]}} RegistryReference */
/**
 * `entries` marks a package theme read for its entries: its public field
 * (node-valued `icons`, or the static `componentIcons` view) merged with the
 * `__` field that holds its functions, if any. `object` is an inline
 * `componentIcons` object: each slot is a static value or an imported one.
 * @typedef {{json: unknown} | {ref: RegistryReference} | {object: Array<[string, SlotData]>}} SlotData
 * A `merge` with `theme` set merges a theme's own values over its base's;
 * any other merge is a spread inside one object.
 * @typedef {{kind: 'registry', ref: RegistryReference, preferredName: string, override?: boolean, entries?: boolean} | {kind: 'merge', base: RegistryPlan, own: RegistryPlan, theme?: boolean} | {kind: 'object', entries: Array<[string, SlotData]>}} RegistryPlan
 */

/** Marks a node that is not a static JSON value. */
const NOT_STATIC = Symbol('not static');

/** @param {any} node */
function unwrap(node) {
  while (
    node &&
    [
      'TSAsExpression',
      'TSSatisfiesExpression',
      'TSNonNullExpression',
      'TSTypeAssertion',
      'TypeCastExpression',
      'ParenthesizedExpression',
    ].includes(node.type)
  ) {
    node = node.expression;
  }
  return node;
}

/** @param {any} node */
function propertyName(node) {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  if (typeof node.value === 'string') return node.value;
  return null;
}

/** @param {any} node */
function rootIdentifier(node) {
  node = unwrap(node);
  while (
    node?.type === 'MemberExpression' ||
    node?.type === 'OptionalMemberExpression'
  ) {
    node = unwrap(node.object);
  }
  return node?.type === 'Identifier' ? node.name : null;
}

/** @param {any} pattern @returns {string[]} */
function bindingNames(pattern) {
  if (!pattern) return [];
  if (pattern.type === 'Identifier') return [pattern.name];
  if (pattern.type === 'AssignmentPattern') return bindingNames(pattern.left);
  if (pattern.type === 'RestElement') return bindingNames(pattern.argument);
  if (pattern.type === 'ObjectPattern')
    return pattern.properties.flatMap((/** @type {any} */ item) =>
      bindingNames(item.type === 'RestElement' ? item.argument : item.value),
    );
  if (pattern.type === 'ArrayPattern')
    return pattern.elements.flatMap(bindingNames);
  return [];
}

/** @param {string} [name] @param {string} [reason] @param {string} [field] @returns {never} */
function registryError(name, reason = '', field = 'icons') {
  if (field === 'componentIcons') {
    const value = name ? `\`componentIcons: ${name}\`` : 'componentIcons';
    throw new AstryxError(
      `Theme sets ${value} but the build cannot carry it. ` +
        (reason ? `${reason} ` : '') +
        'A built theme carries names, null, and requests made of static values, ' +
        'constants, or imported bindings, and slot functions imported from their own module.',
      undefined,
      ERROR_CODES.ERR_THEME_INVALID,
    );
  }
  const registry = name ? `\`icons: ${name}\`` : 'an icon registry';
  throw new AstryxError(
    `Theme sets ${registry} but no import for the registry was found. ` +
      'The generated module cannot preserve inline registries because they ' +
      'may contain React elements, which cannot be serialized. ' +
      (reason ? `${reason} ` : '') +
      'Move the registry to its own module and import it into the theme file.',
    undefined,
    ERROR_CODES.ERR_THEME_INVALID,
  );
}

/**
 * Parse only real module declarations and follow the export chosen by the loader.
 * Local base themes are traced to their registry imports. Package bases remain
 * public theme imports, so their implementation and private files stay private.
 *
 * A theme whose resolved icon entries include a function keeps them: a package
 * base is read for its entries (`__icons`) as well as its node-valued `icons`,
 * and a built base module's `__icons` field is followed instead of `icons`.
 *
 * With `field: 'componentIcons'`, the same tracing carries a theme's slot
 * values: a slot function must come from an import, and an inline object may
 * also hold static values (names, `null`, requests), written as JSON. A built
 * base module is read through its export, like a package theme. A theme's own
 * slots merge over its base's through `mergeName`, which skips an
 * `undefined` slot as `defineTheme` does.
 *
 * @param {string} filePath
 * @param {string | undefined} exportName
 * @param {{hasIcons: boolean, functionEntries?: boolean, field?: 'icons' | 'componentIcons', mergeName?: string, readSource: (filename: string) => string, resolveModule: (specifier: string, fromFile: string) => string | Promise<string>, reservedNames?: string[], rawInput?: boolean}} options
 * @returns {Promise<IconImports | null>}
 */
export async function resolveIconImports(
  filePath,
  exportName,
  {
    hasIcons,
    functionEntries = false,
    field = 'icons',
    mergeName = 'mergeComponentIcons',
    readSource,
    resolveModule,
    reservedNames = [],
    rawInput = false,
  },
) {
  const entriesField = `__${field}`;
  const staticSlots = field === 'componentIcons';
  const defaultName = staticSlots ? 'themeComponentIcons' : 'themeIcons';
  /** @param {string} [name] @param {string} [reason] @returns {never} */
  const invalidRegistry = (name, reason) => registryError(name, reason, field);

  if (exportName === undefined) {
    if (!hasIcons) return null;
    invalidRegistry(
      undefined,
      'The selected theme export could not be identified.',
    );
  }

  const jscodeshift = (await import('jscodeshift')).default;
  const entryDirectory = path.dirname(filePath);
  /** @type {Map<string, any>} */
  const modules = new Map();
  const active = new Set();
  let inspectedRegistry = false;

  /** @param {string} key @param {() => Promise<any>} visit */
  async function guarded(key, visit) {
    if (active.has(key))
      invalidRegistry(undefined, 'The icon reference contains a cycle.');
    active.add(key);
    try {
      return await visit();
    } finally {
      active.delete(key);
    }
  }

  /** @param {any} module @param {any} node @param {Set<string>} [seen] */
  function isDefineTheme(module, node, seen = new Set()) {
    node = unwrap(node);
    if (node?.type === 'Identifier') {
      if (seen.has(node.name)) return false;
      seen.add(node.name);
      const binding = module.bindings.get(node.name);
      if (binding?.kind === 'const')
        return isDefineTheme(module, binding.node, seen);
      return (
        binding?.kind === 'import' &&
        ['@astryxdesign/core', '@astryxdesign/core/theme'].includes(
          binding.source,
        ) &&
        binding.importedName === 'defineTheme'
      );
    }
    if (
      node?.type === 'MemberExpression' &&
      !node.computed &&
      node.property.name === 'defineTheme'
    ) {
      const binding = module.bindings.get(node.object?.name);
      return (
        binding?.kind === 'import' &&
        binding.importedName === '*' &&
        ['@astryxdesign/core', '@astryxdesign/core/theme'].includes(
          binding.source,
        )
      );
    }
    return false;
  }

  /** @param {string} filename */
  function readModule(filename) {
    if (modules.has(filename)) return modules.get(filename);
    const parser = /\.[cm]?ts$/u.test(filename) ? 'ts' : 'tsx';
    const j = jscodeshift.withParser(parser);
    let root;
    try {
      root = j(readSource(filename));
    } catch {
      invalidRegistry(
        undefined,
        'The selected theme module could not be parsed.',
      );
    }
    const first = root.nodes()[0];
    const statements = (first.program ?? first).body;
    /** @type {{filename: string, bindings: Map<string, any>, exports: Map<string, any>, stars: string[], mutated: Set<string>, aliases: Map<string, string>}} */
    const module = {
      filename,
      bindings: new Map(),
      exports: new Map(),
      stars: [],
      mutated: new Set(),
      aliases: new Map(),
    };
    modules.set(filename, module);

    for (const statement of statements) {
      if (
        statement.type === 'ImportDeclaration' &&
        statement.importKind !== 'type'
      ) {
        for (const specifier of statement.specifiers ?? []) {
          if (specifier.importKind === 'type') continue;
          module.bindings.set(specifier.local.name, {
            kind: 'import',
            source: statement.source.value,
            importedName:
              specifier.type === 'ImportDefaultSpecifier'
                ? 'default'
                : specifier.type === 'ImportNamespaceSpecifier'
                  ? '*'
                  : propertyName(specifier.imported),
            localName: specifier.local.name,
          });
        }
      }
      const declaration =
        statement.type === 'ExportNamedDeclaration'
          ? statement.declaration
          : statement;
      if (declaration?.type === 'VariableDeclaration') {
        for (const item of declaration.declarations) {
          const original = rootIdentifier(item.init);
          if (original) {
            for (const name of bindingNames(item.id))
              module.aliases.set(name, original);
          }
          if (item.id.type !== 'Identifier') continue;
          module.bindings.set(item.id.name, {
            kind: declaration.kind === 'const' ? 'const' : 'unsupported',
            node: item.init,
          });
          if (statement.type === 'ExportNamedDeclaration') {
            module.exports.set(item.id.name, {node: item.id});
          }
        }
      }
      if (statement.type === 'ExportDefaultDeclaration') {
        module.exports.set('default', {node: statement.declaration});
      }
      if (
        statement.type === 'ExportNamedDeclaration' &&
        statement.exportKind !== 'type'
      ) {
        for (const specifier of statement.specifiers ?? []) {
          if (specifier.exportKind === 'type') continue;
          const exportedName = propertyName(specifier.exported);
          module.exports.set(
            exportedName,
            statement.source
              ? {
                  binding: {
                    kind: 'import',
                    source: statement.source.value,
                    importedName:
                      specifier.type === 'ExportNamespaceSpecifier'
                        ? '*'
                        : propertyName(specifier.local),
                    localName: propertyName(specifier.local) ?? exportedName,
                  },
                }
              : {node: specifier.local},
          );
        }
      }
      if (
        statement.type === 'ExportAllDeclaration' &&
        statement.exportKind !== 'type'
      ) {
        module.stars.push(statement.source.value);
      }
    }

    /** @param {any} node @param {any} nodePath */
    const markMutation = (node, nodePath) => {
      const name = rootIdentifier(node);
      if (name && nodePath.scope.lookup(name)?.path.node.type === 'Program')
        module.mutated.add(name);
    };
    root
      .find(j.AssignmentExpression)
      .forEach((/** @type {any} */ p) => markMutation(p.node.left, p));
    root
      .find(j.UpdateExpression)
      .forEach((/** @type {any} */ p) => markMutation(p.node.argument, p));
    root
      .find(j.UnaryExpression, {operator: 'delete'})
      .forEach((/** @type {any} */ p) => markMutation(p.node.argument, p));
    root.find(j.CallExpression).forEach((/** @type {any} */ p) => {
      if (isDefineTheme(module, p.node.callee)) return;
      if (p.node.callee.type === 'MemberExpression')
        markMutation(p.node.callee.object, p);
      for (const argument of p.node.arguments) markMutation(argument, p);
    });
    // Mutating an alias also mutates the object that supplied its value.
    for (const name of module.mutated) {
      const original = module.aliases.get(name);
      if (original) module.mutated.add(original);
    }
    return module;
  }

  /** @param {any} module @param {string} name */
  function checkedBinding(module, name) {
    if (module.mutated.has(name))
      invalidRegistry(
        name,
        'The referenced binding is mutated or passed to unsupported code.',
      );
    const binding = module.bindings.get(name);
    if (!binding || binding.kind === 'unsupported') invalidRegistry(name);
    return binding;
  }

  /** @param {any} module @param {any} binding @param {string[]} [members] @returns {RegistryReference} */
  function importedReference(module, binding, members = []) {
    return {kind: 'reference', module, binding, members};
  }

  /** @param {any} module @param {any} node @returns {Promise<RegistryReference | null>} */
  async function reference(module, node) {
    node = unwrap(node);
    if (node?.type === 'Identifier') {
      return guarded(`${module.filename}:reference:${node.name}`, async () => {
        const binding = checkedBinding(module, node.name);
        if (binding.kind === 'import')
          return importedReference(module, binding);
        return reference(module, binding.node);
      });
    }
    if (node?.type === 'MemberExpression' && !node.optional) {
      const name = node.computed
        ? typeof node.property.value === 'string'
          ? node.property.value
          : null
        : propertyName(node.property);
      if (name === null) invalidRegistry();
      const object = await reference(module, node.object);
      if (!object) return null;
      return {...object, members: [...object.members, name]};
    }
    return null;
  }

  /** @param {RegistryReference} ref */
  async function importedExport(ref) {
    if (!ref.binding.source.startsWith('.')) return null;
    let filename;
    try {
      filename = await resolveModule(ref.binding.source, ref.module.filename);
      if (filename.startsWith('file:')) filename = fileURLToPath(filename);
    } catch {
      invalidRegistry(
        ref.binding.localName,
        'The inherited theme module could not be resolved.',
      );
    }
    let name = ref.binding.importedName;
    const members = [...ref.members];
    if (name === '*') name = members.shift();
    if (!name || members.length > 0)
      invalidRegistry(
        ref.binding.localName,
        'The inherited theme must name a module export.',
      );
    return {module: readModule(filename), name};
  }

  /** @param {any} module @param {string} name */
  async function selectedExport(module, name) {
    const selected = module.exports.get(name);
    if (selected) return selected;
    // Follow explicit local barrels without choosing another arbitrary theme.
    for (const source of module.stars) {
      if (name === 'default') continue;
      const binding = {source, importedName: name, localName: name};
      const target = await importedExport(importedReference(module, binding));
      if (
        target &&
        (target.module.exports.has(name) || target.module.stars.length > 0)
      )
        return {binding};
    }
    invalidRegistry(
      undefined,
      `The selected export "${name}" has no statically resolved declaration.`,
    );
  }

  /** @param {RegistryReference} ref @returns {RegistryPlan} */
  function packageTheme(ref) {
    // A theme's `icons` is node-valued; its function entries live in
    // `__icons`. Read both only when the built theme needs its functions, so
    // a theme without them keeps its existing output.
    return functionEntries
      ? {kind: 'registry', ref, preferredName: defaultName, entries: true}
      : {
          kind: 'registry',
          ref: {...ref, members: [...ref.members, field]},
          preferredName: defaultName,
        };
  }

  /** @param {any} module @param {string} name @param {boolean} [rejectOpaque] @returns {Promise<RegistryPlan | null>} */
  async function exportedTheme(module, name, rejectOpaque = false) {
    return guarded(`${module.filename}:theme-export:${name}`, async () => {
      const selected = await selectedExport(module, name);
      return selected.binding
        ? themeReference(
            importedReference(module, selected.binding),
            rejectOpaque,
          )
        : theme(module, selected.node, rejectOpaque);
    });
  }

  /**
   * Whether a node is a built theme module's theme object (`__built: true`).
   * @param {any} module @param {any} node @param {Set<string>} [seen]
   * @returns {boolean}
   */
  function isBuiltTheme(module, node, seen = new Set()) {
    node = unwrap(node);
    if (node?.type === 'Identifier') {
      if (seen.has(node.name)) return false;
      seen.add(node.name);
      const binding = module.bindings.get(node.name);
      return (
        binding?.kind === 'const' && isBuiltTheme(module, binding.node, seen)
      );
    }
    return (
      node?.type === 'ObjectExpression' &&
      node.properties.some(
        (/** @type {any} */ item) =>
          ['ObjectProperty', 'Property'].includes(item.type) &&
          propertyName(item.key) === '__built' &&
          unwrap(item.value)?.value === true,
      )
    );
  }

  /** @param {RegistryReference} ref @param {boolean} [rejectOpaque] @returns {Promise<RegistryPlan | null>} */
  async function themeReference(ref, rejectOpaque = false) {
    const target = await importedExport(ref);
    if (target && staticSlots) {
      // A built module's generated code is not traced: the module is imported
      // and read through its export, like a package theme.
      const selected = await selectedExport(target.module, target.name);
      if (!selected.binding && isBuiltTheme(target.module, selected.node))
        return packageTheme(ref);
    }
    if (target) return exportedTheme(target.module, target.name, rejectOpaque);
    if (rejectOpaque)
      invalidRegistry(
        ref.binding.localName,
        'A raw package configuration cannot supply a resolved theme registry.',
      );
    return packageTheme(ref);
  }

  /** @param {any} module @param {any} node @param {string} [preferredName] @returns {Promise<RegistryPlan | null>} */
  async function registry(module, node, preferredName) {
    inspectedRegistry = true;
    node = unwrap(node);
    if (
      node?.type === 'NullLiteral' ||
      (node?.type === 'Literal' && node.value === null) ||
      (node?.type === 'UnaryExpression' && node.operator === 'void')
    )
      return null;
    if (node?.type === 'Identifier') {
      if (node.name === 'undefined' && !module.bindings.has(node.name))
        return null;
      return guarded(`${module.filename}:registry:${node.name}`, async () => {
        const binding = checkedBinding(module, node.name);
        if (binding.kind === 'const')
          return registry(module, binding.node, preferredName ?? node.name);
        return {
          kind: 'registry',
          ref: importedReference(module, binding),
          preferredName: preferredName ?? node.name,
          override: true,
        };
      });
    }
    if (node?.type === 'MemberExpression') {
      const ref = await reference(module, node);
      if (ref)
        return {
          kind: 'registry',
          ref,
          preferredName: preferredName ?? defaultName,
          // A namespace's exported registry can be redirected to an icon module;
          // a named theme's .icons cannot be imported from that sidecar.
          override:
            ref.binding.importedName === '*' && ref.members.length === 1,
        };
    }
    if (staticSlots && node?.type === 'ObjectExpression')
      return slotObject(module, node);
    // Spreads merge in order. An object adding no entries, such as `{}`, is no
    // local registry: a child keeps its inherited icons and a root emits none.
    if (
      node?.type === 'ObjectExpression' &&
      node.properties.every((/** @type {any} */ item) =>
        ['SpreadElement', 'SpreadProperty'].includes(item.type),
      )
    ) {
      /** @type {RegistryPlan | null} */
      let result = null;
      for (const item of node.properties) {
        const next = await registry(module, item.argument);
        if (next)
          result = result ? {kind: 'merge', base: result, own: next} : next;
      }
      return result;
    }
    invalidRegistry(preferredName ?? rootIdentifier(node) ?? undefined);
  }

  /** @param {any} item @returns {string | null} A plain property's static key. */
  function plainKey(item) {
    if (
      !['ObjectProperty', 'Property'].includes(item.type) ||
      item.method ||
      (item.kind && item.kind !== 'init')
    )
      return null;
    if (!item.computed) return propertyName(item.key);
    return typeof item.key?.value === 'string' ? item.key.value : null;
  }

  /**
   * A slot value as data the module can write: a JSON value, an imported
   * binding (with any member reads), or an object of those. Unmutated `const`
   * bindings and member reads on them are followed. Anything else, a function
   * defined in the theme file included, is NOT_STATIC.
   * @param {any} module @param {any} node @param {Set<string>} [path] - The
   *   `const` names on the current path, which a cycle would revisit.
   * @returns {Promise<SlotData | typeof NOT_STATIC>}
   */
  async function slotData(module, node, path = new Set()) {
    node = unwrap(node);
    if (node?.type === 'NullLiteral') return {json: null};
    if (
      ['StringLiteral', 'NumericLiteral', 'BooleanLiteral', 'Literal'].includes(
        node?.type,
      ) &&
      (node.value === null || typeof node.value !== 'object')
    )
      return {json: node.value};
    if (node?.type === 'TemplateLiteral' && node.expressions.length === 0)
      return {json: node.quasis[0].value.cooked};
    if (
      (node?.type === 'Identifier' &&
        node.name === 'undefined' &&
        !module.bindings.has(node.name)) ||
      (node?.type === 'UnaryExpression' && node.operator === 'void')
    )
      return {json: undefined};
    if (node?.type === 'Identifier') {
      const binding = module.bindings.get(node.name);
      if (!binding || module.mutated.has(node.name) || path.has(node.name))
        return NOT_STATIC;
      if (binding.kind === 'import')
        return {ref: importedReference(module, binding)};
      if (binding.kind !== 'const') return NOT_STATIC;
      return slotData(module, binding.node, new Set([...path, node.name]));
    }
    if (node?.type === 'MemberExpression' && !node.optional) {
      const name = node.computed
        ? typeof node.property.value === 'string'
          ? node.property.value
          : null
        : propertyName(node.property);
      if (name === null) return NOT_STATIC;
      const object = await slotData(module, node.object, path);
      if (object === NOT_STATIC) return NOT_STATIC;
      if ('ref' in object)
        return {ref: {...object.ref, members: [...object.ref.members, name]}};
      if ('object' in object) {
        // The last property with a name wins, as in the object literal.
        const entry = [...object.object]
          .reverse()
          .find(([key]) => key === name);
        return entry ? entry[1] : {json: undefined};
      }
      return NOT_STATIC;
    }
    if (node?.type !== 'ObjectExpression') return NOT_STATIC;
    /** @type {Array<[string, SlotData]>} */
    const entries = [];
    for (const item of node.properties) {
      const key = plainKey(item);
      if (key === null) return NOT_STATIC;
      const value = await slotData(module, item.value, path);
      if (value === NOT_STATIC) return NOT_STATIC;
      entries.push([key, value]);
    }
    return {object: entries};
  }

  /** @param {any} module @param {any} node @param {Set<string>} [seen] @returns {boolean} */
  function isLocalFunction(module, node, seen = new Set()) {
    node = unwrap(node);
    if (node?.type === 'Identifier' && !seen.has(node.name)) {
      seen.add(node.name);
      const binding = module.bindings.get(node.name);
      return (
        binding?.kind === 'const' && isLocalFunction(module, binding.node, seen)
      );
    }
    return ['ArrowFunctionExpression', 'FunctionExpression'].includes(
      node?.type,
    );
  }

  /** @param {any} module @param {any} node @param {string} slot @returns {Promise<SlotData>} */
  async function slotValue(module, node, slot) {
    const data = await slotData(module, node);
    if (data !== NOT_STATIC) return data;
    invalidRegistry(
      undefined,
      isLocalFunction(module, node)
        ? `The slot function for "${slot}" is defined in the theme file.`
        : `The value for "${slot}" is neither a static value nor an imported binding.`,
    );
  }

  /**
   * An inline `componentIcons` object. Spreads and own slots apply in source
   * order, as in the object itself.
   * @param {any} module @param {any} node @returns {Promise<RegistryPlan | null>}
   */
  async function slotObject(module, node) {
    /** @type {RegistryPlan | null} */
    let result = null;
    /** @type {Array<[string, SlotData]> | null} */
    let entries = null;
    /** @param {RegistryPlan | null} next */
    const add = next => {
      if (next)
        result = result ? {kind: 'merge', base: result, own: next} : next;
    };
    for (const item of node.properties) {
      if (item.type === 'SpreadElement' || item.type === 'SpreadProperty') {
        if (entries) add({kind: 'object', entries});
        entries = null;
        add(await registry(module, item.argument));
        continue;
      }
      const key = plainKey(item);
      if (key === null)
        invalidRegistry(
          undefined,
          'A slot must be a plain property with a static name.',
        );
      entries ??= [];
      entries.push([key, await slotValue(module, item.value, key)]);
    }
    if (entries) add({kind: 'object', entries});
    return result;
  }

  /** @param {any} module @param {any} node @returns {Promise<Map<string, any>>} */
  async function fields(module, node) {
    node = unwrap(node);
    if (node?.type === 'Identifier') {
      return guarded(`${module.filename}:fields:${node.name}`, async () => {
        const binding = checkedBinding(module, node.name);
        if (binding.kind === 'const') return fields(module, binding.node);
        return referenceFields(importedReference(module, binding));
      });
    }
    if (node?.type === 'MemberExpression') {
      const ref = await reference(module, node);
      if (ref) return referenceFields(ref);
    }
    if (node?.type === 'CallExpression' && isDefineTheme(module, node.callee)) {
      return new Map([[field, {plan: await theme(module, node)}]]);
    }
    if (node?.type !== 'ObjectExpression') invalidRegistry();
    const result = new Map();
    for (const item of node.properties) {
      if (item.type === 'SpreadElement' || item.type === 'SpreadProperty') {
        for (const [key, value] of await fields(module, item.argument))
          result.set(key, value);
        continue;
      }
      const key = item.computed
        ? typeof item.key?.value === 'string'
          ? item.key.value
          : null
        : propertyName(item.key);
      if (key === null)
        invalidRegistry(undefined, 'Computed theme keys cannot be resolved.');
      if (![field, entriesField, 'extends'].includes(key)) continue;
      if (
        !['ObjectProperty', 'Property'].includes(item.type) ||
        item.method ||
        (item.kind && item.kind !== 'init')
      )
        invalidRegistry();
      result.set(key, {module, node: item.value});
    }
    return result;
  }

  /** @param {RegistryReference} ref @returns {Promise<Map<string, any>>} */
  async function referenceFields(ref) {
    const target = await importedExport(ref);
    if (!target)
      invalidRegistry(
        ref.binding.localName,
        'A package configuration cannot be inspected for inherited registries.',
      );
    return guarded(
      `${target.module.filename}:fields-export:${target.name}`,
      async () => {
        const selected = await selectedExport(target.module, target.name);
        return selected.binding
          ? referenceFields(importedReference(target.module, selected.binding))
          : fields(target.module, selected.node);
      },
    );
  }

  /** @param {any} module @param {any} node @param {boolean} [rejectOpaque] @returns {Promise<RegistryPlan | null>} */
  async function theme(module, node, rejectOpaque = false) {
    node = unwrap(node);
    if (node?.type === 'Identifier') {
      return guarded(`${module.filename}:theme:${node.name}`, async () => {
        const binding = checkedBinding(module, node.name);
        return binding.kind === 'const'
          ? theme(module, binding.node, rejectOpaque)
          : themeReference(importedReference(module, binding), rejectOpaque);
      });
    }
    if (node?.type === 'MemberExpression') {
      const ref = await reference(module, node);
      if (ref) return themeReference(ref, rejectOpaque);
    }
    if (node?.type === 'CallExpression') {
      if (!isDefineTheme(module, node.callee) || node.arguments.length !== 1)
        invalidRegistry();
      node = unwrap(node.arguments[0]);
    }
    const config = await fields(module, node);
    const baseField = config.get('extends');
    // A built module keeps its functions in `__icons` (or `__componentIcons`)
    // beside the public view; those entries are the values to carry.
    const iconField = config.get(entriesField) ?? config.get(field);
    const base = baseField
      ? await theme(baseField.module, baseField.node)
      : null;
    const own = iconField
      ? 'plan' in iconField
        ? iconField.plan
        : await registry(iconField.module, iconField.node)
      : null;
    // A root's own slot values pass through the theme merge too, so an
    // `undefined` slot is dropped as `defineTheme` drops it.
    if (staticSlots && own && !base)
      return {
        kind: 'merge',
        base: {kind: 'object', entries: []},
        own,
        theme: true,
      };
    return base && own
      ? {kind: 'merge', base, own, theme: true}
      : (own ?? base);
  }

  let plan;
  try {
    plan = await exportedTheme(readModule(filePath), exportName, rawInput);
  } catch (error) {
    // No registry needs packaging when the loaded theme has none. This also
    // keeps arbitrary icon-free authoring helpers outside this static resolver.
    if (!hasIcons && !inspectedRegistry && error instanceof AstryxError)
      return null;
    throw error;
  }
  if (!plan) {
    if (hasIcons) invalidRegistry();
    return null;
  }

  const used = new Set(reservedNames);
  /** @type {IconImports['imports']} */
  const imports = [];
  const emitted = new Map();

  /** @param {string} preferred */
  function allocate(preferred) {
    const stem =
      /^[A-Za-z_$][\w$]*$/u.test(preferred) &&
      !['default', 'await', 'yield'].includes(preferred)
        ? preferred
        : defaultName;
    let name = stem;
    let counter = 1;
    while (used.has(name)) name = `${stem}${counter++}`;
    used.add(name);
    return name;
  }

  /** @param {any} ref */
  function importPath(ref) {
    const source = ref.binding.source;
    if (
      !source.startsWith('.') ||
      path.dirname(ref.module.filename) === entryDirectory
    )
      return source;
    const relative = path
      .relative(
        entryDirectory,
        path.resolve(path.dirname(ref.module.filename), source),
      )
      .split(path.sep)
      .join('/');
    return relative.startsWith('.') ? relative : `./${relative}`;
  }

  /** @param {RegistryReference} ref */
  function importedTarget(ref) {
    const source = importPath(ref);
    const identity = `${source}\0${ref.binding.importedName}\0${JSON.stringify(ref.members)}`;
    let localName = emitted.get(identity);
    if (!localName) {
      localName = allocate(ref.binding.localName);
      emitted.set(identity, localName);
      imports.push({
        importPath: source,
        importedName: ref.binding.importedName,
        localName,
      });
    }
    return {
      source,
      localName,
      target: ref.members.reduce(
        (result, member) => `${result}[${JSON.stringify(member)}]`,
        localName,
      ),
    };
  }

  /** @param {SlotData} data @returns {string} */
  function renderData(data) {
    if ('ref' in data) return importedTarget(data.ref).target;
    if ('object' in data)
      return `{${data.object
        .map(([key, entry]) => `${JSON.stringify(key)}: ${renderData(entry)}`)
        .join(', ')}}`;
    return data.json === undefined ? 'void 0' : JSON.stringify(data.json);
  }

  /** @param {RegistryPlan} value @returns {{expression: string, preferredName: string, overridePath?: string, overrideLocalName?: string}} */
  function render(value) {
    if (value.kind === 'merge') {
      const base = render(value.base);
      const own = render(value.own);
      const themeMerge = staticSlots && value.theme === true;
      if (themeMerge) usesMerge = true;
      return {
        expression: themeMerge
          ? `${mergeName}(${base.expression}, ${own.expression})`
          : `{...${base.expression}, ...${own.expression}}`,
        preferredName: defaultName,
        overridePath: own.overridePath,
        overrideLocalName: own.overrideLocalName,
      };
    }
    if (value.kind === 'object') {
      // An `undefined` slot stays in the object, as in the source, so the
      // theme merge leaves the inherited slot in place.
      return {
        expression: renderData({object: value.entries}),
        preferredName: defaultName,
      };
    }
    const {ref} = value;
    const {source, localName, target} = importedTarget(ref);
    const expression = value.entries
      ? `{...${target}[${JSON.stringify(field)}], ...${target}[${JSON.stringify(entriesField)}]}`
      : target;
    return {
      expression,
      preferredName:
        ref.members.length === 0 &&
        value.preferredName === ref.binding.localName
          ? localName
          : value.preferredName,
      overridePath: value.override ? source : undefined,
      overrideLocalName: value.override ? localName : undefined,
    };
  }

  let usesMerge = false;
  const rendered = render(plan);
  const name =
    rendered.preferredName === rendered.expression &&
    imports.some(item => item.localName === rendered.expression)
      ? rendered.expression
      : allocate(rendered.preferredName);
  return {
    imports,
    expression: rendered.expression,
    exportName: name,
    ...(usesMerge ? {mergeName} : {}),
    ...(rendered.overridePath
      ? {
          iconsSpecifierImportPath: rendered.overridePath,
          iconsSpecifierLocalName: rendered.overrideLocalName,
        }
      : {}),
  };
}
