// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Migrate root styling on Field-composed inputs to their named parts.
 *
 * Field-composed inputs no longer accept root `xstyle`, `className`, or
 * `style` (family:input-fields FR10). Each rename keeps the element the
 * styling reached before: components whose root styling painted the visual
 * control box move to `controlXstyle`/`controlClassName`/`controlStyle`;
 * components whose root styling reached the Field box move to
 * `containerXstyle`/`containerClassName`/`containerStyle`.
 *
 * Only JSX attributes written directly on an element bound to an Astryx import
 * are renamed (named, aliased, or namespace imports). Spread attributes,
 * wrappers that forward their own props, and unrelated components of the same
 * name are left alone; those callsites fail type-checking and are migrated by
 * hand. When the target attribute is already present, the root attribute gets a
 * TODO instead of a rename so no value is silently dropped.
 */

import {transformProp} from '../../transform-prop.mjs';

export const meta = {
  title: 'Migrate input root styling to container/control parts',
  description:
    'Renames root `xstyle`/`className`/`style` on Field-composed inputs to the `control*` or `container*` part they styled before.',
  fileExtensions: ['.tsx', '.jsx', '.ts', '.js', '.mjs', '.cjs'],
};

/** Components whose root styling painted the visual control box. */
const CONTROL_COMPONENTS = [
  'TextInput',
  'TextArea',
  'NumberInput',
  'FileInput',
  'DateInput',
  'DateRangeInput',
  'DateTimeInput',
  'TimeInput',
  'Selector',
  'MultiSelector',
  'ComplexSelector',
];

/** Components whose root styling reached the Field box. */
const CONTAINER_COMPONENTS = [
  'Typeahead',
  'Tokenizer',
  'CheckboxList',
  'RadioList',
  'Slider',
];

/**
 * Field-root members that also render inside InputGroup. There Field is absent
 * and root styling painted the control surface, so it moves to `control*`.
 */
const GROUPED_CONTROL_COMPONENTS = new Set(['Typeahead']);

/** @type {ReadonlyMap<string, 'control' | 'container'>} */
const PART_BY_COMPONENT = new Map([
  ...CONTROL_COMPONENTS.map(name => /** @type {const} */ ([name, 'control'])),
  ...CONTAINER_COMPONENTS.map(
    name => /** @type {const} */ ([name, 'container']),
  ),
]);

const ROOT_STYLE_PROPS = /** @type {const} */ ({
  xstyle: 'Xstyle',
  className: 'ClassName',
  style: 'Style',
});

const PACKAGE_PATTERN = /^@(astryxdesign|xds)\/core(\/[A-Za-z]+)?$/u;

const TODO =
  ' TODO(astryx upgrade): root styling is no longer accepted here; merge it into ';

/** @type {ReadonlyMap<string, ReadonlySet<string>>} */
const COMPONENT_PROPS = new Map(
  [...PART_BY_COMPONENT.keys()].map(name => [
    name,
    new Set(Object.keys(ROOT_STYLE_PROPS)),
  ]),
);

/**
 * @param {import('../../../../authoring/codemod/type').AstryxCodemodFile} file
 * @param {import('../../../../authoring/codemod/type').CodemodTransformApi} api
 * @returns {string | undefined}
 */
export default function migrateFieldInputStyling(file, api) {
  if (!/xstyle|className|style/u.test(file.source)) return undefined;
  if (![...PART_BY_COMPONENT.keys()].some(name => file.source.includes(name))) {
    return undefined;
  }

  const j = api.jscodeshift;
  const root = j(file.source);
  const matchesImport = (/** @type {string} */ source) =>
    PACKAGE_PATTERN.test(source);

  // Local names that resolve to an Astryx InputGroup (named or namespace).
  /** @type {Set<string>} */
  const inputGroupNames = new Set();
  /** @type {Set<string>} */
  const namespaceNames = new Set();
  root.find(j.ImportDeclaration).forEach((/** @type {any} */ path) => {
    const source = path.node.source.value;
    if (path.node.importKind === 'type') return;
    if (typeof source !== 'string' || !matchesImport(source)) return;
    for (const specifier of path.node.specifiers ?? []) {
      if (specifier.importKind === 'type') continue;
      if (
        specifier.type === 'ImportSpecifier' &&
        specifier.imported?.name === 'InputGroup'
      ) {
        inputGroupNames.add(specifier.local?.name ?? 'InputGroup');
      } else if (specifier.type === 'ImportNamespaceSpecifier') {
        namespaceNames.add(specifier.local.name);
      }
    }
  });

  /** @param {any} elementPath a JSXElement path */
  const isInputGroup = elementPath => {
    const name = elementPath.node.openingElement.name;
    let localName;
    if (name.type === 'JSXIdentifier' && inputGroupNames.has(name.name)) {
      localName = name.name;
    } else if (
      name.type === 'JSXMemberExpression' &&
      name.object?.type === 'JSXIdentifier' &&
      name.property?.type === 'JSXIdentifier' &&
      name.property.name === 'InputGroup' &&
      namespaceNames.has(name.object.name)
    ) {
      localName = name.object.name;
    } else {
      return false;
    }
    const scope = elementPath.scope?.lookup(localName);
    return scope?.path.node.type === 'Program';
  };

  /** @param {any} openingPath a JSXOpeningElement path */
  const isInsideInputGroup = openingPath => {
    for (let p = openingPath.parent?.parent; p; p = p.parent) {
      if (p.node.type === 'JSXElement' && isInputGroup(p)) return true;
    }
    return false;
  };

  let changed = false;
  transformProp(
    root,
    j,
    {matchesImport, components: COMPONENT_PROPS},
    (propPath, {component}) => {
      const attribute = propPath.node;
      const openingPath = propPath.parent;
      let part = PART_BY_COMPONENT.get(component);
      if (!part) return;
      if (
        part === 'container' &&
        GROUPED_CONTROL_COMPONENTS.has(component) &&
        isInsideInputGroup(openingPath)
      ) {
        part = 'control';
      }
      const name = /** @type {keyof typeof ROOT_STYLE_PROPS} */ (
        attribute.name.name
      );
      const next = part + ROOT_STYLE_PROPS[name];
      const present = (openingPath.node.attributes ?? []).some(
        (/** @type {any} */ a) =>
          a.type === 'JSXAttribute' && a.name?.name === next,
      );
      if (present) {
        const comment = `${TODO}\`${next}\`. `;
        attribute.comments ??= [];
        if (
          !attribute.comments.some(
            (/** @type {any} */ c) => c.value === comment,
          )
        ) {
          attribute.comments.push(j.commentBlock(comment, true, false));
          changed = true;
        }
        return;
      }
      attribute.name = j.jsxIdentifier(next);
      changed = true;
    },
  );

  return changed ? root.toSource({quote: 'single'}) : undefined;
}
