// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The props a module of the app's own source gives Core components.
 * @input One module's source text.
 * @output Each prop a Core component's element names, with the component,
 *   the line and the column; or null when the module does not parse.
 * @position Read by `astryx doctor` (api/doctor/_adapter.mjs), which checks
 *   each prop against the component's docs and Core's own types.
 */

import {isCoreModule} from './core-augmentation-points.mjs';
import {importedName} from './template-icons.mjs';
import {parseTemplateSource, traverseTemplateSource} from './template-source-tree.mjs';

/**
 * Props every component takes or that only styling and React read: none of
 * them names a prop of the component's own.
 */
const NOT_COMPONENT_PROPS = new Set(['key', 'ref', 'children', 'xstyle', 'className', 'style']);

/**
 * @typedef {object} CorePropUse
 * @property {string} component the name Core exports the component by
 * @property {string} prop
 * @property {number} line
 * @property {number} column
 */

/**
 * The Core component an element names: a named import from Core or one of
 * its subpaths, under any local name, or a member of a namespace import of
 * Core (`<Core.Button>`). Null for any other element.
 * @param {any} path a JSXOpeningElement path
 * @returns {string | null}
 */
function coreComponentOf(path) {
  const name = path.node.name;
  /** @type {string} */
  let local;
  /** @type {string | null} */
  let member = null;
  if (name.type === 'JSXIdentifier') local = name.name;
  else if (name.type === 'JSXMemberExpression' && name.object.type === 'JSXIdentifier') {
    local = name.object.name;
    member = name.property.name;
  } else {
    return null;
  }
  const binding = path.scope.getBinding(local);
  const declaration = binding?.path?.parentPath?.node;
  if (declaration?.type !== 'ImportDeclaration' || !isCoreModule(declaration.source.value)) return null;
  if (declaration.importKind === 'type' || binding.path.node.importKind === 'type') return null;
  const imported = importedName(binding.path.node);
  if (member != null) return imported === '*' ? member : null;
  return imported === '*' || imported === 'default' ? null : imported;
}

/**
 * Each prop the module's elements give a Core component by name, leaving out
 * `key`, `ref`, `children`, the styling props, and `data-` and `aria-`
 * attributes. A prop spread in (`{...props}`) names nothing and is left out.
 * @param {string} source
 * @returns {CorePropUse[] | null}
 */
export function scanCoreProps(source) {
  /** @type {any} */
  let file;
  try {
    file = parseTemplateSource(source);
  } catch {
    return null;
  }
  /** @type {CorePropUse[]} */
  const uses = [];
  traverseTemplateSource(file, {
    JSXOpeningElement(/** @type {any} */ path) {
      const component = coreComponentOf(path);
      if (component == null || !/^[A-Z]/.test(component)) return;
      for (const attribute of path.node.attributes) {
        if (attribute.type !== 'JSXAttribute' || attribute.name.type !== 'JSXIdentifier') continue;
        const prop = attribute.name.name;
        if (NOT_COMPONENT_PROPS.has(prop) || prop.startsWith('data-') || prop.startsWith('aria-')) continue;
        const start = attribute.loc?.start;
        uses.push({component, prop, line: start?.line ?? 0, column: (start?.column ?? 0) + 1});
      }
    },
  });
  return uses;
}
