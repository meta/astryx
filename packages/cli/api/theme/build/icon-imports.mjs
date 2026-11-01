// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Resolve importable icon registries for the selected theme export.
 *
 * @input Loaded theme export identity, plus the caller's source reader and the
 *   theme loader's resolver (this module performs no environment access).
 * @output Import bindings and an expression preserving inherited icon registries.
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
 */

/** @typedef {{kind: 'reference', module: any, binding: any, members: string[]}} RegistryReference */
/**
 * `entries` marks a package theme read for its icon entries: its node-valued
 * `icons` merged with the `__icons` that hold its function entries, if any.
 * @typedef {{kind: 'registry', ref: RegistryReference, preferredName: string, override?: boolean, entries?: boolean} | {kind: 'merge', base: RegistryPlan, own: RegistryPlan}} RegistryPlan
 */

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

/** @param {string} [name] @param {string} [reason] @returns {never} */
function invalidRegistry(name, reason = '') {
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
 * @param {string} filePath
 * @param {string | undefined} exportName
 * @param {{hasIcons: boolean, functionEntries?: boolean, readSource: (filename: string) => string, resolveModule: (specifier: string, fromFile: string) => string | Promise<string>, reservedNames?: string[], rawInput?: boolean}} options
 * @returns {Promise<IconImports | null>}
 */
export async function resolveIconImports(
  filePath,
  exportName,
  {
    hasIcons,
    functionEntries = false,
    readSource,
    resolveModule,
    reservedNames = [],
    rawInput = false,
  },
) {
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
      ? {kind: 'registry', ref, preferredName: 'themeIcons', entries: true}
      : {
          kind: 'registry',
          ref: {...ref, members: [...ref.members, 'icons']},
          preferredName: 'themeIcons',
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

  /** @param {RegistryReference} ref @param {boolean} [rejectOpaque] @returns {Promise<RegistryPlan | null>} */
  async function themeReference(ref, rejectOpaque = false) {
    const target = await importedExport(ref);
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
          preferredName: preferredName ?? 'themeIcons',
          // A namespace's exported registry can be redirected to an icon module;
          // a named theme's .icons cannot be imported from that sidecar.
          override:
            ref.binding.importedName === '*' && ref.members.length === 1,
        };
    }
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
      return new Map([['icons', {plan: await theme(module, node)}]]);
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
      if (!['icons', '__icons', 'extends'].includes(key)) continue;
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
    // A built module keeps its function entries in `__icons` beside its
    // node-valued `icons`; the entries are the registry to carry.
    const iconField = config.get('__icons') ?? config.get('icons');
    const base = baseField
      ? await theme(baseField.module, baseField.node)
      : null;
    const own = iconField
      ? 'plan' in iconField
        ? iconField.plan
        : await registry(iconField.module, iconField.node)
      : null;
    return base && own ? {kind: 'merge', base, own} : (own ?? base);
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
        : 'themeIcons';
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

  /** @param {RegistryPlan} value @returns {{expression: string, preferredName: string, overridePath?: string, overrideLocalName?: string}} */
  function render(value) {
    if (value.kind === 'merge') {
      const base = render(value.base);
      const own = render(value.own);
      return {
        expression: `{...${base.expression}, ...${own.expression}}`,
        preferredName: 'themeIcons',
        overridePath: own.overridePath,
        overrideLocalName: own.overrideLocalName,
      };
    }
    const {ref} = value;
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
    const target = ref.members.reduce(
      (result, member) => `${result}[${JSON.stringify(member)}]`,
      localName,
    );
    const expression = value.entries
      ? `{...${target}["icons"], ...${target}["__icons"]}`
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
    ...(rendered.overridePath
      ? {
          iconsSpecifierImportPath: rendered.overridePath,
          iconsSpecifierLocalName: rendered.overrideLocalName,
        }
      : {}),
  };
}
