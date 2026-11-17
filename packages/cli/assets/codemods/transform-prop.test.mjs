// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import jscodeshift from 'jscodeshift';
import {
  importedComponents,
  resolveImportedComponent,
  transformProp,
} from './transform-prop.mjs';

const j = jscodeshift.withParser('tsx');
const components = new Map([
  ['Widget', new Set(['tone'])],
  ['Group', new Set(['size'])],
]);

function apply(source) {
  const root = j(source);
  transformProp(
    root,
    j,
    {
      matchesImport: value => /^@example\/core(?:\/|$)/.test(value),
      components,
      normalizeComponentName: name =>
        name.startsWith('XDS') ? name.slice(3) : name,
    },
    propPath => {
      propPath.node.name.name = `migrated${propPath.node.name.name}`;
    },
  );
  return root.toSource({quote: 'single'});
}

describe('transformProp', () => {
  it('maps named import aliases to their JSX usages', () => {
    const output = apply(`import {Widget as Card} from '@example/core';
const view = <Card tone="old" other="old" />;`);

    expect(output).toContain('<Card migratedtone="old" other="old"');
  });

  it('maps default subpath imports', () => {
    const output = apply(`import Card from '@example/core/Widget';
const view = <Card tone="old" />;`);

    expect(output).toContain('<Card migratedtone="old"');
  });

  it('ignores declaration-level type imports', () => {
    const output = apply(`import type {Widget} from '@example/core';
const Widget = props => <div {...props} />;
const view = <Widget tone="old" />;`);

    expect(output).toContain('<Widget tone="old"');
    expect(output).not.toContain('migratedtone');
  });

  it('ignores type specifiers in mixed imports', () => {
    const output = apply(`import {type Widget, Group} from '@example/core';
const Widget = props => <div {...props} />;
const view = <><Widget tone="old" /><Group size="old" /></>;`);

    expect(output).toContain('<Widget tone="old"');
    expect(output).toContain('<Group migratedsize="old"');
    expect(output).not.toContain('<Widget migratedtone');
  });

  it('maps namespace imports', () => {
    const output = apply(`import * as Core from '@example/core';
const view = <Core.Group size="old" />;`);

    expect(output).toContain('<Core.Group migratedsize="old"');
  });

  it('ignores same-named imports from other packages', () => {
    const source = `import {Widget} from '@other/core';
const view = <Widget tone="old" />;`;
    expect(apply(source)).toBe(source);
  });

  it('ignores a local binding that shadows an imported alias', () => {
    const output = apply(`import {Widget as Card} from '@example/core';
const migrated = <Card tone="old" />;
function Local(Card) { return <Card tone="local" />; }`);

    expect(output).toContain('<Card migratedtone="old"');
    expect(output).toContain('<Card tone="local"');
  });

  it('yields only configured props on configured components', () => {
    const output = apply(`import {Widget, Group} from '@example/core';
const a = <Widget size="old" tone="old" />;
const b = <Group tone="old" size="old" />;`);

    expect(output).toContain('<Widget size="old" migratedtone="old"');
    expect(output).toContain('<Group tone="old" migratedsize="old"');
  });

  it('resolves non-JSX references through the same import and shadow rules', () => {
    const root = j(`import {Widget as Card} from '@example/core';
import * as Lib from '@example/core';
const a = Card;
const b = Lib.Group;
function shadow(Card, Lib) {
  return [Card, Lib.Group];
}`);
    const imports = importedComponents(root, j, {
      matchesImport: value => /^@example\/core(?:\/|$)/.test(value),
      components,
    });
    const resolved = root
      .find(j.VariableDeclarator)
      .paths()
      .map(
        path =>
          resolveImportedComponent(path.node.init, path, imports)?.component,
      );
    expect(resolved).toEqual(['Widget', 'Group']);
    const shadowed = root
      .find(j.ArrayExpression)
      .paths()
      .flatMap(path =>
        path.node.elements.map(element =>
          resolveImportedComponent(element, path, imports),
        ),
      );
    expect(shadowed).toEqual([null, null]);
  });
});
