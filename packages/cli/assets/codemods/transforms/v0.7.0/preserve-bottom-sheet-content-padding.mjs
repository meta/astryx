// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Codemod: preserve BottomSheet content geometry after it became a container
 *
 * BottomSheet now pads its content box like Dialog (theme `bottom-sheet`
 * padding, else `--spacing-4`). Before, the content box had no padding, so
 * callers supplied their own inset. This codemod keeps every existing sheet's
 * geometry by adding `padding={0}` to imported BottomSheet elements that do not
 * set `padding`.
 *
 * Sheets whose only child is a core `Section` or `Layout` are left alone: both
 * escape the inset their container publishes, so they already render exactly
 * as they did in the unpadded box.
 *
 * `padding={0}` goes before the first spread attribute, so a spread that
 * carries `padding` still wins.
 *
 * `padding={0}` also zeroes the inset a nested `Layout` puts between its
 * regions: a Layout's own `padding` restores only its outer edges, and the
 * inner inset comes from the sheet's container chain. Such a sheet still gets
 * `padding={0}`, plus a TODO comment on its statement (api.report is a stub;
 * comments are the only warning channel).
 */

export const meta = {
  title: 'Preserve BottomSheet content padding',
  description:
    'BottomSheet now pads its content like Dialog. Adds `padding={0}` to ' +
    'BottomSheet elements that do not set `padding`, keeping their previous ' +
    'unpadded content box. Sheets whose only child is a Section ' +
    'or Layout are left unchanged; they render identically. A sheet with a ' +
    'nested Layout anywhere in its content also gets a TODO comment, because ' +
    "padding={0} removes the inset between that Layout's regions and the " +
    "Layout's own padding restores only its outer edges. Remove " +
    '`padding={0}` and your own inset to adopt the theme padding. An app ' +
    'whose theme already sets `bottom-sheet` padding on every edge is not ' +
    'affected by the new default; the transform cannot see the theme, so ' +
    'remove the added `padding={0}` there to keep the theme inset.',
};

const CORE_IMPORT_RE = /^@(astryxdesign|xds)\/core(?:\/|$)/;

const TODO_COMMENT =
  ' TODO(astryx upgrade): BottomSheet now pads its content like Dialog. ' +
  'padding={0} keeps the unpadded content box, but it also removes the inset ' +
  "between a nested Layout's regions, which the Layout's own padding does " +
  "not restore. Drop padding={0} and the sheet content's own inset, or give " +
  'the Layout its inset another way. ';

/**
 * Local JSX names bound to core components, by imported name.
 * @param {any} root
 * @param {any} j
 * @param {string} component
 * @returns {{direct: Set<string>, namespaces: Set<string>}}
 */
function findBindings(root, j, component) {
  const direct = new Set();
  const namespaces = new Set();
  root.find(j.ImportDeclaration).forEach((/** @type {any} */ importPath) => {
    const source = importPath.node.source.value;
    if (
      importPath.node.importKind === 'type' ||
      typeof source !== 'string' ||
      !CORE_IMPORT_RE.test(source)
    ) {
      return;
    }
    const subpath = source.split('/').at(-1);
    for (const specifier of importPath.node.specifiers ?? []) {
      if (specifier.importKind === 'type') continue;
      if (specifier.type === 'ImportSpecifier') {
        const imported = specifier.imported?.name ?? specifier.imported?.value;
        if (imported === component) {
          direct.add(specifier.local?.name ?? imported);
        }
      } else if (
        specifier.type === 'ImportDefaultSpecifier' &&
        subpath === component
      ) {
        direct.add(specifier.local.name);
      } else if (specifier.type === 'ImportNamespaceSpecifier') {
        namespaces.add(specifier.local.name);
      }
    }
  });
  return {direct, namespaces};
}

/**
 * @param {any} name JSX element name node
 * @param {{direct: Set<string>, namespaces: Set<string>}} bindings
 * @param {string} component
 */
function nameMatches(name, bindings, component) {
  if (name?.type === 'JSXIdentifier') {
    return bindings.direct.has(name.name);
  }
  return (
    name?.type === 'JSXMemberExpression' &&
    name.object?.type === 'JSXIdentifier' &&
    bindings.namespaces.has(name.object.name) &&
    name.property?.name === component
  );
}

// A parameter or local declaration with the imported name shadows the module
// binding (same rule as transform-prop.mjs): only a tag whose root binding
// resolves to the Program scope is the imported component.
/** @param {any} elementPath @param {any} name */
function isModuleBinding(elementPath, name) {
  const localName =
    name?.type === 'JSXIdentifier'
      ? name.name
      : name?.type === 'JSXMemberExpression' &&
          name.object?.type === 'JSXIdentifier'
        ? name.object.name
        : null;
  if (localName == null) return false;
  const scope = elementPath.scope?.lookup(localName);
  return scope?.path?.node?.type === 'Program';
}

/**
 * Children that render something: drops whitespace-only text and empty
 * `{}` / `{/* comment *\/}` containers.
 * @param {any[]} children
 */
function meaningfulChildren(children) {
  return children.filter((/** @type {any} */ child) => {
    if (child.type === 'JSXText') {
      return child.value.trim() !== '';
    }
    if (child.type === 'JSXExpressionContainer') {
      return child.expression?.type !== 'JSXEmptyExpression';
    }
    return true;
  });
}

/**
 * Attach the TODO to the nearest enclosing statement: a comment on a JSX node
 * inside JSX children would print as text.
 * @param {any} j
 * @param {any} elementPath
 */
function addTodo(j, elementPath) {
  let path = elementPath;
  while (path && !j.Statement.check(path.node)) {
    path = path.parent;
  }
  if (!path) return;
  const host = path.node;
  host.comments = host.comments ?? [];
  if (host.comments.some((/** @type {any} */ c) => c.value === TODO_COMMENT)) {
    return;
  }
  host.comments.push(j.commentBlock(TODO_COMMENT, true, false));
}

/**
 * @param {import('../../../../authoring/codemod/type').AstryxCodemodFile} file
 * @param {import('../../../../authoring/codemod/type').CodemodTransformApi} api
 * @returns {string | null | undefined}
 */
export default function transformer(file, api) {
  if (!file.source.includes('BottomSheet')) return undefined;
  const j = api.jscodeshift;
  const root = j(file.source);
  const sheets = findBindings(root, j, 'BottomSheet');
  if (sheets.direct.size === 0 && sheets.namespaces.size === 0) {
    return undefined;
  }
  const sections = findBindings(root, j, 'Section');
  const layouts = findBindings(root, j, 'Layout');
  let hasChanges = false;

  root.find(j.JSXElement).forEach((/** @type {any} */ elementPath) => {
    const opening = elementPath.node.openingElement;
    if (!nameMatches(opening.name, sheets, 'BottomSheet')) return;
    if (!isModuleBinding(elementPath, opening.name)) return;

    const attributes = opening.attributes ?? [];
    const setsPadding = attributes.some(
      (/** @type {any} */ attribute) =>
        attribute.type === 'JSXAttribute' && attribute.name?.name === 'padding',
    );
    if (setsPadding) return;

    const children = meaningfulChildren(elementPath.node.children ?? []);
    const hasChildrenAttribute = attributes.some(
      (/** @type {any} */ attribute) =>
        attribute.type === 'JSXAttribute' &&
        attribute.name?.name === 'children',
    );
    if (
      !hasChildrenAttribute &&
      children.length === 1 &&
      children[0].type === 'JSXElement' &&
      (nameMatches(children[0].openingElement.name, sections, 'Section') ||
        nameMatches(children[0].openingElement.name, layouts, 'Layout')) &&
      isModuleBinding(
        elementPath.get('children', 0),
        children[0].openingElement.name,
      )
    ) {
      return;
    }

    const padding = j.jsxAttribute(
      j.jsxIdentifier('padding'),
      j.jsxExpressionContainer(j.numericLiteral(0)),
    );
    const firstSpread = attributes.findIndex(
      (/** @type {any} */ attribute) => attribute.type === 'JSXSpreadAttribute',
    );
    if (firstSpread === -1) {
      attributes.push(padding);
    } else {
      attributes.splice(firstSpread, 0, padding);
    }
    opening.attributes = attributes;
    hasChanges = true;

    // Any nested core Layout loses the inset between its regions, with or
    // without its own padding, so every one gets the TODO.
    const hasNestedLayout =
      j(elementPath)
        .find(j.JSXOpeningElement)
        .filter(
          (/** @type {any} */ openingPath) =>
            nameMatches(openingPath.node.name, layouts, 'Layout') &&
            isModuleBinding(openingPath, openingPath.node.name),
        ).length > 0;
    if (hasNestedLayout) {
      addTodo(j, elementPath);
    }
  });

  return hasChanges ? root.toSource() : undefined;
}
