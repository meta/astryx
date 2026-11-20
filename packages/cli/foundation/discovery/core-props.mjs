// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The props a module of the app's own source gives Core components.
 * @input One module's source text.
 * @output Each prop a Core component's element names, with the component,
 *   the line and the column; or null when the module does not parse.
 * @position Read by `astryx doctor` (api/doctor/_adapter.mjs) and, one
 *   element at a time, by the page render worker (render/page-worker.mjs);
 *   unknown-core-props.mjs checks each prop against the component's docs
 *   and Core's own types.
 */

import {coreImportOf} from './core-elements.mjs';
import {parseTemplateSource, traverseTemplateSource} from './template-source-tree.mjs';

/**
 * Props every component takes or that only styling and React read: none of
 * them names a prop of the component's own.
 */
const NOT_COMPONENT_PROPS = new Set(['key', 'ref', 'children', 'xstyle', 'className', 'style']);

/**
 * @typedef {object} CorePropUse
 * @property {string} component the name Core exports the component by
 * @property {string} source the module path the module imports it from
 * @property {string} prop
 * @property {number} line
 * @property {number} column
 */

/**
 * Each prop the module's elements give a Core component by name, leaving out
 * `key`, `ref`, `children`, the styling props, and every name with a hyphen
 * (`data-`, `aria-` and others). A prop spread in (`{...props}`) names nothing
 * and is left out.
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
      uses.push(...corePropUsesOf(path));
    },
  });
  return uses;
}

/**
 * The props one JSX element gives a Core component by name, as
 * `scanCoreProps` reads them. A module's reader that walks its own syntax
 * tree calls this for each opening element, so it reads the same props.
 * @param {any} path the opening element's Babel path
 * @returns {CorePropUse[]}
 */
export function corePropUsesOf(path) {
  const core = coreImportOf(path.node.name, path.scope);
  if (core == null || !/^[A-Z]/.test(core.component)) return [];
  const {component, source} = core;
  /** @type {CorePropUse[]} */
  const uses = [];
  for (const attribute of path.node.attributes) {
    if (attribute.type !== 'JSXAttribute' || attribute.name.type !== 'JSXIdentifier') continue;
    const prop = attribute.name.name;
    // JSX never checks a name with a hyphen against a props type.
    if (NOT_COMPONENT_PROPS.has(prop) || prop.includes('-')) continue;
    const start = attribute.loc?.start;
    uses.push({component, source, prop, line: start?.line ?? 0, column: (start?.column ?? 0) + 1});
  }
  return uses;
}
