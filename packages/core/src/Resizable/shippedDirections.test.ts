// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Guards shipped useResizable/ResizeHandle axis pairings.
 * @input Storybook, docsite, and CLI template source that composes Resizable,
 *   pairing a handle with its region by its ref (`useResizable(handleRef,
 *   options)`) or by the deprecated `resizable={region.props}`
 * @output Every statically paired hook and handle uses the same axis
 * @position Static regression for shipped Resizable examples
 */

import {readdirSync, readFileSync} from 'node:fs';
import {join, relative} from 'node:path';
import ts from 'typescript';
import {describe, expect, it} from 'vitest';

const ROOT = join(__dirname, '../../../..');
const SHIPPED_ROOTS = [
  join(ROOT, 'apps/docsite/src'),
  join(ROOT, 'apps/storybook/stories'),
  join(ROOT, 'packages/cli/assets/templates'),
];
const EMBEDDED_DOC_ROOTS = [
  join(ROOT, 'packages/core/src'),
  join(ROOT, 'packages/cli/assets/docs'),
  join(ROOT, 'packages/cli/assets/templates'),
];

type Direction = 'horizontal' | 'vertical';
type Result<T> = {value: T} | {error: string};
type Binding = {
  path: string;
  direction: Result<Direction>;
  scope: ts.Node;
};
type Pairing = {
  file: string;
  line: number;
  region: string | null;
  hookDirection: Direction | null;
  handleDirection: Direction | null;
  error: string | null;
};

function filesUnder(
  dir: string,
  suffixes: string[],
  files: string[] = [],
): string[] {
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      filesUnder(path, suffixes, files);
    } else if (suffixes.some(suffix => entry.name.endsWith(suffix))) {
      files.push(path);
    }
  }
  return files;
}

function enclosingFunction(node: ts.Node): ts.Node {
  for (let parent = node.parent; parent != null; parent = parent.parent) {
    if (ts.isFunctionLike(parent)) {
      return parent;
    }
  }
  return node.getSourceFile();
}

function contains(scope: ts.Node, node: ts.Node): boolean {
  return scope.pos <= node.pos && scope.end >= node.end;
}

function unwrap(expression: ts.Expression): ts.Expression {
  if (
    ts.isAsExpression(expression) ||
    ts.isTypeAssertionExpression(expression) ||
    ts.isParenthesizedExpression(expression) ||
    ts.isSatisfiesExpression(expression)
  ) {
    return unwrap(expression.expression);
  }
  return expression;
}

function variableInitializer(
  sourceFile: ts.SourceFile,
  name: string,
  at: ts.Node,
): ts.Expression | null {
  const candidates: {initializer: ts.Expression; scope: ts.Node}[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer != null &&
      node.pos < at.pos
    ) {
      const scope = enclosingFunction(node);
      if (contains(scope, at)) {
        candidates.push({initializer: node.initializer, scope});
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  candidates.sort(
    (left, right) =>
      left.scope.end - left.scope.pos - (right.scope.end - right.scope.pos),
  );
  return candidates[0]?.initializer ?? null;
}

function resolveExpression(
  expression: ts.Expression,
  sourceFile: ts.SourceFile,
  at: ts.Node,
  seen = new Set<string>(),
): ts.Expression | null {
  const value = unwrap(expression);
  if (!ts.isIdentifier(value)) {
    return value;
  }
  if (seen.has(value.text)) {
    return null;
  }
  const initializer = variableInitializer(sourceFile, value.text, at);
  if (initializer == null) {
    return null;
  }
  return resolveExpression(
    initializer,
    sourceFile,
    at,
    new Set([...seen, value.text]),
  );
}

function propertyName(node: ts.ObjectLiteralElementLike): string | null {
  if (!('name' in node) || node.name == null) {
    return null;
  }
  return ts.isIdentifier(node.name) || ts.isStringLiteralLike(node.name)
    ? node.name.text
    : null;
}

type ObjectDirection = {value: Direction | undefined} | {error: string};

function directionFromObject(
  expression: ts.Expression,
  sourceFile: ts.SourceFile,
  at: ts.Node,
): ObjectDirection {
  const resolved = resolveExpression(expression, sourceFile, at);
  if (resolved == null || !ts.isObjectLiteralExpression(resolved)) {
    return {error: 'useResizable config is not statically resolvable'};
  }
  let direction: ObjectDirection = {value: undefined};
  for (const property of resolved.properties) {
    if (ts.isSpreadAssignment(property)) {
      const spreadDirection = directionFromObject(
        property.expression,
        sourceFile,
        at,
      );
      if ('error' in spreadDirection || spreadDirection.value !== undefined) {
        direction = spreadDirection;
      }
      continue;
    }
    if (propertyName(property) === 'direction') {
      const initializer = ts.isPropertyAssignment(property)
        ? property.initializer
        : ts.isShorthandPropertyAssignment(property)
          ? property.name
          : null;
      if (initializer == null) {
        direction = {error: 'hook direction is not statically resolvable'};
        continue;
      }
      const value = resolveExpression(initializer, sourceFile, at);
      direction =
        value != null &&
        ts.isStringLiteralLike(value) &&
        (value.text === 'horizontal' || value.text === 'vertical')
          ? {value: value.text}
          : {error: 'hook direction is not statically resolvable'};
    }
  }
  return direction;
}

function pathOf(expression: ts.Expression): string | null {
  const value = unwrap(expression);
  if (ts.isIdentifier(value)) {
    return value.text;
  }
  if (ts.isPropertyAccessExpression(value)) {
    const parent = pathOf(value.expression);
    return parent == null ? null : `${parent}.${value.name.text}`;
  }
  return null;
}

/**
 * The name of the ref a `useResizable(handleRef, options)` call takes: an
 * identifier bound to `useRef(…)` or `createRef(…)`; null for the
 * configuration-object form.
 */
function refBindingPath(
  expression: ts.Expression,
  sourceFile: ts.SourceFile,
  at: ts.Node,
): string | null {
  const value = unwrap(expression);
  if (!ts.isIdentifier(value)) {
    return null;
  }
  const initializer = variableInitializer(sourceFile, value.text, at);
  if (initializer == null) {
    return null;
  }
  const call = unwrap(initializer);
  if (!ts.isCallExpression(call)) {
    return null;
  }
  const callee = call.expression.getText(sourceFile);
  return callee === 'useRef' ||
    callee === 'React.useRef' ||
    callee === 'createRef' ||
    callee === 'React.createRef'
    ? value.text
    : null;
}

function hookBindings(sourceFile: ts.SourceFile): Binding[] {
  const bindings: Binding[] = [];
  const visit = (node: ts.Node): void => {
    // A ref-form call whose result goes unused (the panes split the space by
    // flex) still pairs its region with the handle holding the ref.
    if (
      ts.isExpressionStatement(node) &&
      ts.isCallExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'useResizable'
    ) {
      const [first, second] = node.expression.arguments;
      const refName =
        first == null ? null : refBindingPath(first, sourceFile, node);
      if (refName != null) {
        const objectDirection =
          second == null
            ? {value: undefined as Direction | undefined}
            : directionFromObject(second, sourceFile, node);
        bindings.push({
          path: refName,
          direction:
            'error' in objectDirection
              ? objectDirection
              : {value: objectDirection.value ?? 'horizontal'},
          scope: enclosingFunction(node),
        });
      }
    }
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer != null &&
      ts.isCallExpression(node.initializer) &&
      ts.isIdentifier(node.initializer.expression) &&
      node.initializer.expression.text === 'useResizable'
    ) {
      const [first, second] = node.initializer.arguments;
      // The ref form pairs a handle with its region by the ref it holds.
      const refPath =
        first == null ? null : refBindingPath(first, sourceFile, node);
      const config = refPath != null ? second : first;
      const objectDirection =
        config == null
          ? {value: undefined as Direction | undefined}
          : directionFromObject(config, sourceFile, node);
      const direction: Result<Direction> =
        'error' in objectDirection
          ? objectDirection
          : {value: objectDirection.value ?? 'horizontal'};
      const scope = enclosingFunction(node);
      if (refPath != null) {
        bindings.push({path: refPath, direction, scope});
      } else if (ts.isIdentifier(node.name)) {
        bindings.push({path: node.name.text, direction, scope});
      } else if (ts.isObjectBindingPattern(node.name)) {
        for (const element of node.name.elements) {
          if (ts.isIdentifier(element.name)) {
            const exported =
              element.propertyName?.getText(sourceFile) ?? element.name.text;
            if (exported === 'props') {
              bindings.push({path: element.name.text, direction, scope});
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return bindings;
}

function attribute(
  node: ts.JsxAttributes,
  name: string,
): ts.JsxAttribute | undefined {
  return node.properties.find(
    property => ts.isJsxAttribute(property) && property.name.getText() === name,
  ) as ts.JsxAttribute | undefined;
}

function directionFromAttribute(
  node: ts.JsxAttribute | undefined,
  sourceFile: ts.SourceFile,
  at: ts.Node,
): Result<Direction> {
  if (node?.initializer == null) {
    return {value: 'horizontal'};
  }
  const value = ts.isStringLiteral(node.initializer)
    ? node.initializer
    : ts.isJsxExpression(node.initializer) &&
        node.initializer.expression != null
      ? resolveExpression(node.initializer.expression, sourceFile, at)
      : null;
  return value != null &&
    ts.isStringLiteralLike(value) &&
    (value.text === 'horizontal' || value.text === 'vertical')
    ? {value: value.text}
    : {error: 'handle direction is not statically resolvable'};
}

function resizablePath(node: ts.JsxAttribute | undefined): string | null {
  if (
    node?.initializer == null ||
    !ts.isJsxExpression(node.initializer) ||
    node.initializer.expression == null
  ) {
    return null;
  }
  const path = pathOf(node.initializer.expression);
  return path?.endsWith('.props') ? path.slice(0, -'.props'.length) : path;
}

/** The ref a handle holds, which names its region in the ref form. */
function refPath(node: ts.JsxAttribute | undefined): string | null {
  if (
    node?.initializer == null ||
    !ts.isJsxExpression(node.initializer) ||
    node.initializer.expression == null
  ) {
    return null;
  }
  return pathOf(node.initializer.expression);
}

function inspectSource(source: string, file: string): Pairing[] {
  if (!source.includes('ResizeHandle') || !source.includes('useResizable')) {
    return [];
  }
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const bindings = hookBindings(sourceFile);
  const pairings: Pairing[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
      node.tagName.getText(sourceFile) === 'ResizeHandle'
    ) {
      const region =
        resizablePath(attribute(node.attributes, 'resizable')) ??
        refPath(attribute(node.attributes, 'ref'));
      const matches = bindings
        .filter(
          binding =>
            (binding.path === region ||
              region?.startsWith(`${binding.path}.`)) &&
            contains(binding.scope, node),
        )
        .sort(
          (left, right) =>
            left.scope.end -
            left.scope.pos -
            (right.scope.end - right.scope.pos),
        );
      const hook = matches[0];
      const handle = directionFromAttribute(
        attribute(node.attributes, 'direction'),
        sourceFile,
        node,
      );
      const {line} = sourceFile.getLineAndCharacterOfPosition(node.getStart());
      pairings.push({
        file,
        line: line + 1,
        region,
        hookDirection:
          hook != null && 'value' in hook.direction
            ? hook.direction.value
            : null,
        handleDirection: 'value' in handle ? handle.value : null,
        error:
          region == null
            ? 'the handle names no region it resizes, by ref or resizable prop'
            : hook == null
              ? 'matching useResizable binding was not found'
              : 'error' in hook.direction
                ? hook.direction.error
                : 'error' in handle
                  ? handle.error
                  : hook.direction.value === handle.value
                    ? null
                    : `hook is ${hook.direction.value}; handle is ${handle.value}`,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return pairings;
}

function embeddedExamples(source: string): string[] {
  return [...source.matchAll(/`([\s\S]*?)`/g)]
    .map(match => match[1])
    .filter(
      example =>
        example.includes('useResizable') && example.includes('ResizeHandle'),
    );
}

function sourcePairings(transform?: (source: string) => string): Pairing[] {
  return SHIPPED_ROOTS.flatMap(root => filesUnder(root, ['.tsx'])).flatMap(
    file => {
      const source = readFileSync(file, 'utf8');
      return inspectSource(transform?.(source) ?? source, relative(ROOT, file));
    },
  );
}

function documentedPairings(): Pairing[] {
  return EMBEDDED_DOC_ROOTS.flatMap(root =>
    filesUnder(root, ['.doc.mjs', '.doc.dense.mjs']),
  ).flatMap(file =>
    embeddedExamples(readFileSync(file, 'utf8')).flatMap((source, index) =>
      inspectSource(source, `${relative(ROOT, file)}#example-${index + 1}`),
    ),
  );
}

describe('shipped Resizable examples', () => {
  it('pairs every directly composed hook and handle on the same axis', () => {
    const sources = sourcePairings();
    const documented = documentedPairings();
    const pairings = [...sources, ...documented];

    expect(sources.length).toBeGreaterThanOrEqual(30);
    expect(
      sources.filter(pairing => pairing.handleDirection === 'vertical').length,
    ).toBeGreaterThanOrEqual(6);
    expect(documented.length).toBeGreaterThanOrEqual(1);
    expect(pairings.filter(pairing => pairing.error != null)).toEqual([]);
  });

  it('detects all six shipped vertical mismatches against the unfixed source shape', () => {
    const pairings = sourcePairings(source =>
      source.replace(/^\s*direction: 'vertical',\n/gm, ''),
    );
    const mismatches = pairings.filter(
      pairing => pairing.handleDirection === 'vertical',
    );

    expect(mismatches).toHaveLength(6);
    expect(mismatches.every(pairing => pairing.error != null)).toBe(true);
  });

  it('detects either mismatch direction and unverifiable expressions', () => {
    const inspect = (hookDirection: string, handleDirection: string) =>
      inspectSource(
        `function Example() {
          const direction = 'vertical';
          const base = {direction};
          const region = useResizable(${hookDirection});
          return <ResizeHandle ${handleDirection} resizable={region.props} />;
        }`,
        'fixture.tsx',
      )[0];

    expect(inspect('{}', 'direction="vertical"')?.error).toBe(
      'hook is horizontal; handle is vertical',
    );
    expect(inspect("{direction: 'vertical'}", '')?.error).toBe(
      'hook is vertical; handle is horizontal',
    );
    expect(inspect('{...base}', 'direction={direction}')?.error).toBeNull();
    expect(
      inspect(
        "{direction: 'vertical', ...{defaultSize: 10}}",
        'direction="vertical"',
      )?.error,
    ).toBeNull();
    expect(
      inspectSource(
        `function Example() {
          const {props} = useResizable({direction: 'vertical'});
          return <ResizeHandle direction="vertical" resizable={props} />;
        }`,
        'fixture.tsx',
      )[0]?.error,
    ).toBeNull();
    expect(
      inspectSource(
        `function Example() {
          const regions = useResizable({direction: 'vertical', regions: {top: {defaultSize: 100}}});
          return <ResizeHandle direction="vertical" resizable={regions.top.props} />;
        }`,
        'fixture.tsx',
      )[0]?.error,
    ).toBeNull();
    expect(
      inspect("{direction: 'vertical'}", 'direction="horizontal"')?.error,
    ).toBe('hook is vertical; handle is horizontal');
    const inspectRef = (options: string, handleDirection: string) =>
      inspectSource(
        `function Example() {
          const handleRef = useRef(null);
          const region = useResizable(handleRef, ${options});
          return <ResizeHandle ref={handleRef} ${handleDirection} />;
        }`,
        'fixture.tsx',
      )[0];
    expect(inspectRef('{}', 'direction="vertical"')?.error).toBe(
      'hook is horizontal; handle is vertical',
    );
    expect(inspectRef("{direction: 'vertical'}", '')?.error).toBe(
      'hook is vertical; handle is horizontal',
    );
    expect(
      inspectRef("{direction: 'vertical'}", 'direction="vertical"')?.error,
    ).toBeNull();
    expect(
      inspectSource(
        `function Example() {
          const handleRef = useRef(null);
          useResizable(handleRef, {direction: 'vertical'});
          return <ResizeHandle ref={handleRef} />;
        }`,
        'fixture.tsx',
      )[0]?.error,
    ).toBe('hook is vertical; handle is horizontal');
    expect(
      inspectSource(
        `function Example() {
          return <ResizeHandle direction="vertical" />;
        }
        const region = useResizable({});`,
        'fixture.tsx',
      )[0]?.error,
    ).toBe('the handle names no region it resizes, by ref or resizable prop');
    expect(
      inspect("{direction: 'vertical'}", 'direction={getDirection()}')?.error,
    ).toBe('handle direction is not statically resolvable');
    expect(
      inspect('{direction: getDirection()}', 'direction={direction}')?.error,
    ).toBe('hook direction is not statically resolvable');
  });
});
