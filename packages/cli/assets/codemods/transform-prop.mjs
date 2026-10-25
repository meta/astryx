// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Find imported components, resolve their local names (including aliases and
 * namespace members) at a use site, and yield matching JSX prop paths to a
 * visitor.
 *
 * `transformProp` intentionally stops at the JSX boundary. It does not follow
 * variables, helper calls, object spreads, wrapper components, or types. The
 * resolver it is built on (`importedComponents`, `resolveImportedComponent`,
 * `isModuleBinding`) is exported for transforms that prove other use sites.
 */

/**
 * @typedef {{
 *   matchesImport: (source: string) => boolean,
 *   components: ReadonlyMap<string, ReadonlySet<string>>,
 *   normalizeComponentName?: (name: string) => string,
 * }} ImportOptions
 */

/**
 * @typedef {{
 *   direct: Map<string, {component: string, props: ReadonlySet<string>}>,
 *   namespaces: Set<string>,
 *   normalize: (name: string) => string,
 *   components: ReadonlyMap<string, ReadonlySet<string>>,
 * }} ImportedComponents
 */

/**
 * Local names bound by accepted runtime imports: named, aliased and default
 * component imports, and namespace imports.
 * @param {any} root jscodeshift collection for one source file
 * @param {any} j configured jscodeshift instance
 * @param {ImportOptions} options
 * @returns {ImportedComponents}
 */
export function importedComponents(root, j, options) {
  const normalize = options.normalizeComponentName ?? (name => name);
  /** @type {ImportedComponents['direct']} */
  const direct = new Map();
  /** @type {Set<string>} */
  const namespaces = new Set();

  root.find(j.ImportDeclaration).forEach((/** @type {any} */ importPath) => {
    const source = importPath.node.source.value;
    if (
      importPath.node.importKind === 'type' ||
      typeof source !== 'string' ||
      !options.matchesImport(source)
    ) {
      return;
    }

    const subpathName = normalize(source.split('/').at(-1) ?? '');
    const subpathProps = options.components.get(subpathName);

    for (const specifier of importPath.node.specifiers ?? []) {
      if (specifier.importKind === 'type') continue;

      if (specifier.type === 'ImportSpecifier') {
        const importedName =
          specifier.imported?.name ?? specifier.imported?.value;
        if (typeof importedName !== 'string') continue;
        const component = normalize(importedName);
        const props = options.components.get(component);
        if (!props) continue;
        direct.set(specifier.local?.name ?? importedName, {component, props});
      } else if (specifier.type === 'ImportDefaultSpecifier' && subpathProps) {
        direct.set(specifier.local.name, {
          component: subpathName,
          props: subpathProps,
        });
      } else if (specifier.type === 'ImportNamespaceSpecifier') {
        namespaces.add(specifier.local.name);
      }
    }
  });

  return {direct, namespaces, normalize, components: options.components};
}

/**
 * True when `localName` at `path` resolves to a module-scope binding. A
 * parameter or local declaration with the same name shadows the import.
 * @param {any} path any node path inside the file
 * @param {string} localName
 */
export function isModuleBinding(path, localName) {
  return path.scope?.lookup(localName)?.path.node.type === 'Program';
}

/**
 * Resolve a component reference (`Card`, `Lib.Card`, or their JSX forms) to
 * the imported component it names at `scopePath`, or null.
 * @param {any} nameNode Identifier, JSXIdentifier, MemberExpression, or JSXMemberExpression
 * @param {any} scopePath the path whose scope the reference is evaluated in
 * @param {ImportedComponents} imports
 * @returns {{component: string, props: ReadonlySet<string>, localName: string} | null}
 */
export function resolveImportedComponent(nameNode, scopePath, imports) {
  let localName;
  let binding;
  if (nameNode?.type === 'JSXIdentifier' || nameNode?.type === 'Identifier') {
    localName = nameNode.name;
    binding = imports.direct.get(localName);
  } else if (
    (nameNode?.type === 'JSXMemberExpression' ||
      (nameNode?.type === 'MemberExpression' && !nameNode.computed)) &&
    (nameNode.object?.type === 'JSXIdentifier' ||
      nameNode.object?.type === 'Identifier') &&
    (nameNode.property?.type === 'JSXIdentifier' ||
      nameNode.property?.type === 'Identifier') &&
    imports.namespaces.has(nameNode.object.name)
  ) {
    localName = nameNode.object.name;
    const component = imports.normalize(nameNode.property.name);
    const props = imports.components.get(component);
    if (props) binding = {component, props};
  }
  if (!binding || !isModuleBinding(scopePath, localName)) return null;
  return {...binding, localName};
}

/**
 * @param {any} root jscodeshift collection for one source file
 * @param {any} j configured jscodeshift instance
 * @param {ImportOptions} options
 * @param {(propPath: any, context: {component: string, localName: string}) => void} visit
 */
export function transformProp(root, j, options, visit) {
  const imports = importedComponents(root, j, options);
  if (imports.direct.size === 0 && imports.namespaces.size === 0) return;

  root.find(j.JSXOpeningElement).forEach((/** @type {any} */ jsxPath) => {
    // Only JSX tags whose root binding resolves to Program are usages of the
    // import discovered above.
    const resolved = resolveImportedComponent(
      jsxPath.node.name,
      jsxPath,
      imports,
    );
    if (!resolved) return;
    const {component, props, localName} = resolved;

    for (let index = 0; index < jsxPath.node.attributes.length; index++) {
      const attribute = jsxPath.node.attributes[index];
      if (
        attribute.type !== 'JSXAttribute' ||
        attribute.name?.type !== 'JSXIdentifier' ||
        !props.has(attribute.name.name)
      ) {
        continue;
      }
      visit(jsxPath.get('attributes', index), {component, localName});
    }
  });
}
