// Copyright (c) Meta Platforms, Inc. and affiliates.

/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * @file Guards `theming.targets` against the real `themeProps()` call sites,
 *   and guards that each prop that selects painted styles reaches
 *   `themeProps()`.
 * @input Core/Lab component sources (*.tsx/*.ts), their `{Name}.doc.mjs`
 *   files, and the Lab promotion-candidate manifest.
 * @output Vitest failures naming each undocumented class / visual prop, and
 *   each painted prop axis that no `themeProps()` call passes, on the stable
 *   Core surface or a capability-participating Lab component.
 * @position Sibling of derivedVarRegistry.test.ts, which already validates the
 *   OTHER fields of the same `theming` block (`vars`, `derived`). `targets` was
 *   the one field with no machine check, so it drifted — twice (#3652, #3680).
 *
 * `theming.targets` is the documented CSS surface of a component: the stable
 * `astryx-*` classes it renders and the visual props it reflects as data
 * attributes. It is hand-authored, while the truth lives in `themeProps()`
 * calls in the source. Nothing kept the two in agreement.
 *
 * Drift is not cosmetic. `targets` is what theme authors and codegen read to
 * learn which selectors exist; an undocumented class is an unthemeable element.
 *
 * Policy is SUBSET, not equality: every class rendered by `themeProps()` must be
 * documented, and every prop key passed to it must appear in that target's
 * `visualProps` or `states`. Docs may list MORE than the source passes —
 * components forward props they don't themselves reflect (Timestamp passes
 * `{format}` but documents `type`/`color`/`format`), and that is intentional.
 *
 * Lab is capability-based: a component participates when it already declares
 * `theming.targets` or enters the existing promotion-candidate manifest. Other
 * Lab components remain free to iterate with runtime hooks that are not yet a
 * documented public theming promise.
 */

import {describe, it, expect} from 'vitest';
import {readdirSync, readFileSync} from 'node:fs';
import {basename, join, relative} from 'node:path';
import ts from 'typescript';
import {stableClassName} from '../naming';

const CORE_SRC_DIR = join(__dirname, '..');
const LAB_SRC_DIR = join(__dirname, '../../../lab/src');
const RICHTEXT_SRC_DIR = join(__dirname, '../../../richtext/src');
const CHARTS_SRC_DIR = join(__dirname, '../../../charts/src');
const LAB_PROMOTION_MANIFEST = join(
  __dirname,
  '../../../../internal/lab-readiness/manifest.mjs',
);

interface LabPromotionCandidate {
  sourceDir: string;
}

const {CANDIDATES: labPromotionCandidates} = require(
  LAB_PROMOTION_MANIFEST,
) as {CANDIDATES: LabPromotionCandidate[]};
const LAB_PROMOTION_DIRS = new Set(
  labPromotionCandidates.map(candidate => candidate.sourceDir),
);

// ---------------------------------------------------------------------------
// Source scanning: find themeProps() call sites via the TypeScript AST
// ---------------------------------------------------------------------------

interface ThemeTargetSite {
  /** Full stable class, e.g. 'astryx-progressbar-fill'. */
  className: string;
  /** Keys of the object literal passed as the 2nd arg (may be empty). */
  propKeys: string[];
  /** True when the 2nd arg exists but its keys can't be read statically. */
  isOpaque: boolean;
}

/**
 * Keys of a spread whose operand is a conditional object literal:
 * `...(cond && {a})`, `...(cond ? {a} : null)`, `...(cond || {a})`.
 * Returns null when the operand is anything else (a bag like `...rest`, or an
 * object with a computed key), which the caller treats as opaque.
 */
function conditionalSpreadKeys(expression: ts.Expression): string[] | null {
  const unwrap = (node: ts.Expression): ts.Expression =>
    ts.isParenthesizedExpression(node) ? unwrap(node.expression) : node;

  const expr = unwrap(expression);
  const branches: ts.Expression[] = [];
  if (
    ts.isBinaryExpression(expr) &&
    (expr.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
      expr.operatorToken.kind === ts.SyntaxKind.BarBarToken)
  ) {
    branches.push(expr.right);
  } else if (ts.isConditionalExpression(expr)) {
    branches.push(expr.whenTrue, expr.whenFalse);
  } else if (ts.isObjectLiteralExpression(expr)) {
    branches.push(expr);
  } else {
    return null;
  }

  const keys: string[] = [];
  for (const branch of branches) {
    const object = unwrap(branch);
    // A falsy filler arm (`null`, `undefined`) contributes no keys; anything
    // else that is not an object literal hides its keys, so give up.
    if (
      object.kind === ts.SyntaxKind.NullKeyword ||
      (ts.isIdentifier(object) && object.text === 'undefined')
    ) {
      continue;
    }
    if (!ts.isObjectLiteralExpression(object)) {
      return null;
    }
    for (const prop of object.properties) {
      const name = prop.name;
      if (
        name != null &&
        (ts.isIdentifier(name) || ts.isStringLiteralLike(name))
      ) {
        keys.push(name.text);
      } else {
        return null;
      }
    }
  }
  return keys;
}

/**
 * The keys of a `themeProps()` props argument, and whether any key cannot be
 * read statically. A bag such as `...rest`, a computed key, or a variable or
 * call passed as the whole argument makes the result opaque.
 */
function themePropsKeys(propsArg: ts.Expression | undefined): {
  keys: string[];
  isOpaque: boolean;
} {
  const result = {keys: [] as string[], isOpaque: false};
  if (propsArg == null) {
    return result;
  }
  if (!ts.isObjectLiteralExpression(propsArg)) {
    result.isOpaque = true;
    return result;
  }
  for (const prop of propsArg.properties) {
    if (ts.isSpreadAssignment(prop)) {
      // A conditional spread of an object literal, such as `...(type &&
      // {type})`, has statically known keys. If it were opaque, the
      // `astryx-heading` `type` key would stay undocumented, which is the
      // drift this file exists to catch.
      const spreadKeys = conditionalSpreadKeys(prop.expression);
      if (spreadKeys == null) {
        result.isOpaque = true;
      } else {
        result.keys.push(...spreadKeys);
      }
      continue;
    }
    const name = prop.name;
    if (
      name != null &&
      (ts.isIdentifier(name) || ts.isStringLiteralLike(name))
    ) {
      result.keys.push(name.text);
    } else {
      result.isOpaque = true;
    }
  }
  return result;
}

/**
 * Extract every `themeProps('name', {...})` call from a source file.
 *
 * Uses the AST rather than a regex because the call sites use every object
 * form: shorthand (`{variant}`), renamed (`{variant: fillVariant}` — the KEY is
 * the prop, not the value), and multi-line. A regex reading identifiers after
 * `:` would record `fillVariant`, a prop that does not exist.
 */
function extractThemeTargets(
  sourceText: string,
  fileName = 'source.tsx',
): ThemeTargetSite[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const sites: ThemeTargetSite[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'themeProps'
    ) {
      const [nameArg, propsArg] = node.arguments;

      // Only string-literal component names are resolvable. A dynamic name
      // can't be checked statically; skip rather than guess.
      if (nameArg != null && ts.isStringLiteralLike(nameArg)) {
        const {keys, isOpaque} = themePropsKeys(propsArg);
        const site: ThemeTargetSite = {
          className: stableClassName(nameArg.text),
          propKeys: keys,
          isOpaque,
        };

        sites.push(site);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return sites;
}

// ---------------------------------------------------------------------------
// The extractor must be right before its verdicts mean anything.
// ---------------------------------------------------------------------------

describe('extractThemeTargets', () => {
  it('reads a bare call with no props', () => {
    expect(extractThemeTargets(`themeProps('progress-bar-track')`)).toEqual([
      {className: 'astryx-progress-bar-track', propKeys: [], isOpaque: false},
    ]);
  });

  it('reads shorthand props', () => {
    expect(
      extractThemeTargets(`themeProps('progress-bar', {variant})`),
    ).toEqual([
      {
        className: 'astryx-progress-bar',
        propKeys: ['variant'],
        isOpaque: false,
      },
    ]);
  });

  it('records the KEY, not the value, when a prop is renamed', () => {
    // The trap a regex falls into: `fillVariant` is a local, not a prop.
    expect(
      extractThemeTargets(
        `themeProps('progress-bar-fill', {variant: fillVariant})`,
      ),
    ).toEqual([
      {
        className: 'astryx-progress-bar-fill',
        propKeys: ['variant'],
        isOpaque: false,
      },
    ]);
  });

  it('reads multi-line object literals', () => {
    const src = `
      const p = themeProps('outline', {
        variant,
        size: resolvedSize,
      });
    `;
    expect(extractThemeTargets(src)).toEqual([
      {
        className: 'astryx-outline',
        propKeys: ['variant', 'size'],
        isOpaque: false,
      },
    ]);
  });

  it('reads a call whose result is immediately accessed', () => {
    // Table does `themeProps('table').className` — still a rendered class.
    expect(extractThemeTargets(`themeProps('table').className`)).toEqual([
      {className: 'astryx-table', propKeys: [], isOpaque: false},
    ]);
  });

  it('finds every call in a file', () => {
    const src = `
      <div {...themeProps('card', {variant})}>
        <span {...themeProps('card-header')} />
      </div>
    `;
    expect(extractThemeTargets(src).map(s => s.className)).toEqual([
      'astryx-card',
      'astryx-card-header',
    ]);
  });

  it('reads the keys of a conditional spread', () => {
    // Heading's reflected visual props, including conditional type/weight.
    const [site] = extractThemeTargets(
      `themeProps('heading', {level, color, ...(type && {type}), ...(weight && {weight})})`,
    );
    expect(site.propKeys).toEqual(['level', 'color', 'type', 'weight']);
    expect(site.isOpaque).toBe(false);
  });

  it('reads both arms of a ternary spread', () => {
    const [site] = extractThemeTargets(
      `themeProps('card', {...(isOpen ? {expanded} : {collapsed})})`,
    );
    expect(site.propKeys).toEqual(['expanded', 'collapsed']);
    expect(site.isOpaque).toBe(false);
  });

  it('marks a spread props bag opaque rather than guessing its keys', () => {
    const [site] = extractThemeTargets(`themeProps('card', {...rest})`);
    expect(site.isOpaque).toBe(true);
    expect(site.propKeys).toEqual([]);
  });

  it('marks a conditional spread of a non-literal opaque', () => {
    const [site] = extractThemeTargets(`themeProps('card', {...(on && rest)})`);
    expect(site.isOpaque).toBe(true);
    expect(site.propKeys).toEqual([]);
  });

  it('marks a non-literal props bag opaque', () => {
    const [site] = extractThemeTargets(`themeProps('card', visualProps)`);
    expect(site.isOpaque).toBe(true);
  });

  it('ignores a dynamic component name it cannot resolve', () => {
    expect(extractThemeTargets(`themeProps(name, {variant})`)).toEqual([]);
  });

  it('ignores an unrelated function of a similar shape', () => {
    expect(extractThemeTargets(`stylex.props('card', {variant})`)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Painted prop axes: a prop that selects painted styles must reach themeProps()
// ---------------------------------------------------------------------------

/**
 * The shared catalog of style keys that a target can guarantee to a theme. The
 * guard counts a style map as painting only when one of its namespaces sets
 * one of these exact keys at the top level, so a prop that selects from that
 * map is a visual axis. A gap scale sets none of them and is out of scope.
 *
 * The guard does not check these shapes:
 * - a key that is not in the list, such as the longhand
 *   `borderInlineStartColor`;
 * - a key inside a nested block, such as a `'::before'` pseudo-element block;
 * - a namespace written as a function, such as `sm: v => ({fontSize: v})`;
 * - a map imported from another file;
 * - a lookup outside a `stylex.props()` call, such as inside
 *   `focusOutlineProps.focusVisible()`;
 * - a lookup keyed by an expression, such as `sizeStyles[size ?? 'sm']`, and
 *   not by a destructured prop name;
 * - a lookup in a nested function that destructures its own props, when the
 *   lookup key is a prop of the function around it.
 */
const GUARANTEED_STYLE_KEYS: ReadonlySet<string> = new Set([
  // Paint
  'color',
  'backgroundColor',
  'opacity',
  'outlineColor',
  'outlineOffset',
  'outlineStyle',
  'outlineWidth',
  'boxShadow',
  'textShadow',
  // Border and shape
  'borderColor',
  'borderStyle',
  'borderWidth',
  'borderRadius',
  // Typography
  'fontFamily',
  'fontSize',
  'fontStyle',
  'fontWeight',
  'letterSpacing',
  'lineHeight',
  'textAlign',
  'textDecorationColor',
  'textDecorationLine',
  'textDecorationStyle',
  'textDecorationThickness',
  'textTransform',
  // Padding
  'padding',
  'paddingBlock',
  'paddingBlockStart',
  'paddingBlockEnd',
  'paddingInline',
  'paddingInlineStart',
  'paddingInlineEnd',
]);

interface UnreflectedStyleAxis {
  /** The function that destructures the prop, e.g. 'ChatComposer'. */
  component: string;
  /** The prop name, not its local binding, e.g. 'elevation'. */
  prop: string;
  /** The `stylex.create()` map the prop indexes, e.g. 'elevationStyles'. */
  styleMap: string;
  line: number;
}

type FunctionNode =
  ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction;

function isFunctionNode(node: ts.Node): node is FunctionNode {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node)
  );
}

function isStylexCall(node: ts.Node, method: string): boolean {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === 'stylex' &&
    node.expression.name.text === method
  );
}

/** Names of the `stylex.create()` maps in a file that set a guaranteed key. */
function paintingStyleMaps(sourceFile: ts.SourceFile): Set<string> {
  const maps = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer != null &&
      isStylexCall(node.initializer, 'create')
    ) {
      const [namespaces] = (node.initializer as ts.CallExpression).arguments;
      const paints =
        namespaces != null &&
        ts.isObjectLiteralExpression(namespaces) &&
        namespaces.properties.some(
          namespace =>
            ts.isPropertyAssignment(namespace) &&
            ts.isObjectLiteralExpression(namespace.initializer) &&
            namespace.initializer.properties.some(
              style =>
                style.name != null &&
                (ts.isIdentifier(style.name) ||
                  ts.isStringLiteralLike(style.name)) &&
                GUARANTEED_STYLE_KEYS.has(style.name.text),
            ),
        );
      if (paints) {
        maps.add(node.name.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return maps;
}

/**
 * Local binding -> prop name for the props a function destructures, from its
 * first parameter or from `const {...} = props` at the top of its body.
 */
function destructuredProps(fn: FunctionNode): Map<string, string> {
  const bindings = new Map<string, string>();
  const read = (pattern: ts.ObjectBindingPattern): void => {
    for (const element of pattern.elements) {
      if (element.dotDotDotToken != null || !ts.isIdentifier(element.name)) {
        continue;
      }
      const propName = element.propertyName ?? element.name;
      if (ts.isIdentifier(propName) || ts.isStringLiteralLike(propName)) {
        bindings.set(element.name.text, propName.text);
      }
    }
  };
  const [first] = fn.parameters;
  if (first == null) {
    return bindings;
  }
  if (ts.isObjectBindingPattern(first.name)) {
    read(first.name);
  } else if (
    ts.isIdentifier(first.name) &&
    fn.body != null &&
    ts.isBlock(fn.body)
  ) {
    const propsName = first.name.text;
    for (const statement of fn.body.statements) {
      if (!ts.isVariableStatement(statement)) {
        continue;
      }
      for (const declaration of statement.declarationList.declarations) {
        if (
          ts.isObjectBindingPattern(declaration.name) &&
          declaration.initializer != null &&
          ts.isIdentifier(declaration.initializer) &&
          declaration.initializer.text === propsName
        ) {
          read(declaration.name);
        }
      }
    }
  }
  return bindings;
}

function functionName(fn: FunctionNode): string {
  if (fn.name != null) {
    return fn.name.text;
  }
  const {parent} = fn;
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.text;
  }
  return '(anonymous)';
}

/**
 * Each prop that indexes a painting style map inside `stylex.props()` while no
 * `themeProps()` call in the same function passes that prop. A theme can then
 * restyle the target but cannot tell the prop's values apart.
 *
 * A function that destructures props is one component. A nested function that
 * destructures its own props is a separate component and is checked by
 * itself; a nested callback that does not, such as a render callback, belongs
 * to the function around it.
 */
function findUnreflectedStyleAxes(
  sourceText: string,
  fileName = 'source.tsx',
): UnreflectedStyleAxis[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const paintingMaps = paintingStyleMaps(sourceFile);
  const findings: UnreflectedStyleAxis[] = [];

  const checkComponent = (fn: FunctionNode, props: Map<string, string>) => {
    const reflected = new Set<string>();
    let reflectsUnknownKeys = false;
    const lookups: Omit<UnreflectedStyleAxis, 'component'>[] = [];

    const visit = (node: ts.Node, isInStyleCall: boolean): void => {
      if (
        node !== fn &&
        isFunctionNode(node) &&
        destructuredProps(node).size > 0
      ) {
        return;
      }
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'themeProps'
      ) {
        const {keys, isOpaque} = themePropsKeys(node.arguments[1]);
        keys.forEach(key => reflected.add(key));
        if (isOpaque) {
          reflectsUnknownKeys = true;
        }
      }
      const isStyleCall = isInStyleCall || isStylexCall(node, 'props');
      if (
        isStyleCall &&
        ts.isElementAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        paintingMaps.has(node.expression.text) &&
        ts.isIdentifier(node.argumentExpression)
      ) {
        const prop = props.get(node.argumentExpression.text);
        if (prop != null) {
          lookups.push({
            prop,
            styleMap: node.expression.text,
            line:
              sourceFile.getLineAndCharacterOfPosition(node.getStart()).line +
              1,
          });
        }
      }
      ts.forEachChild(node, child => visit(child, isStyleCall));
    };
    visit(fn, false);

    // An opaque props bag may carry the prop; reading it would be a guess.
    if (reflectsUnknownKeys) {
      return;
    }
    const component = functionName(fn);
    for (const lookup of lookups) {
      if (!reflected.has(lookup.prop)) {
        findings.push({component, ...lookup});
      }
    }
  };

  const visit = (node: ts.Node): void => {
    if (isFunctionNode(node)) {
      const props = destructuredProps(node);
      if (props.size > 0) {
        checkComponent(node, props);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return findings;
}

describe('findUnreflectedStyleAxes', () => {
  it('flags a painted axis that no themeProps() call passes', () => {
    const source = `
      const elevationStyles = stylex.create({low: {boxShadow: 'x'}});
      export function Banner({container, status, elevation = 'low'}) {
        return (
          <div {...stylex.props(styles.root, elevationStyles[elevation])}>
            <div {...mergeProps(themeProps('banner', {container, status}))} />
          </div>
        );
      }
    `;
    expect(findUnreflectedStyleAxes(source)).toEqual([
      {
        component: 'Banner',
        prop: 'elevation',
        styleMap: 'elevationStyles',
        line: 5,
      },
    ]);
  });

  it('accepts the axis once a themeProps() call passes it', () => {
    const source = `
      const elevationStyles = stylex.create({low: {boxShadow: 'x'}});
      export function Card({elevation}) {
        return <div {...mergeProps(themeProps('card', {elevation}), stylex.props(elevationStyles[elevation]))} />;
      }
    `;
    expect(findUnreflectedStyleAxes(source)).toEqual([]);
  });

  it('matches the prop name, not its local binding', () => {
    const source = `
      const radiusStyles = stylex.create({3: {borderRadius: 'x'}});
      export function Skeleton({radius: radiusProp = 3}) {
        return <div {...mergeProps(themeProps('skeleton', {radius: radiusProp}), stylex.props(radiusStyles[radiusProp]))} />;
      }
      export function Broken({radius: radiusProp = 3}) {
        return <div {...mergeProps(themeProps('broken'), stylex.props(radiusStyles[radiusProp]))} />;
      }
    `;
    expect(
      findUnreflectedStyleAxes(source).map(f => `${f.component}.${f.prop}`),
    ).toEqual(['Broken.radius']);
  });

  it('reads props destructured from a props parameter', () => {
    const source = `
      const sizeStyles = stylex.create({sm: {fontSize: 'x'}});
      export function Code(props) {
        const {size} = props;
        return <code {...mergeProps(themeProps('code'), stylex.props(size && sizeStyles[size]))} />;
      }
    `;
    expect(
      findUnreflectedStyleAxes(source).map(f => `${f.component}.${f.prop}`),
    ).toEqual(['Code.size']);
  });

  it('ignores a map that sets only layout keys', () => {
    const source = `
      const gapStyles = stylex.create({2: {gap: 'x'}});
      export function List({gap}) {
        return <div {...mergeProps(themeProps('list'), stylex.props(gapStyles[gap]))} />;
      }
    `;
    expect(findUnreflectedStyleAxes(source)).toEqual([]);
  });

  it('ignores a lookup keyed by a value that is not a prop', () => {
    const source = `
      const sizeStyles = stylex.create({sm: {fontSize: 'x'}});
      export function Field({label}) {
        const size = useContextSize();
        return <div {...mergeProps(themeProps('field'), stylex.props(sizeStyles[size]))}>{label}</div>;
      }
    `;
    expect(findUnreflectedStyleAxes(source)).toEqual([]);
  });

  it('counts a lookup inside a render callback for the function around it', () => {
    const source = `
      const itemSizeStyles = stylex.create({md: {paddingBlock: 'x'}});
      export function Menu({items, size}) {
        const renderItem = item => <div {...stylex.props(itemSizeStyles[size])}>{item}</div>;
        return <div {...themeProps('menu')}>{items.map(renderItem)}</div>;
      }
    `;
    expect(
      findUnreflectedStyleAxes(source).map(f => `${f.component}.${f.prop}`),
    ).toEqual(['Menu.size']);
  });

  it('skips a function whose themeProps() keys it cannot read', () => {
    const source = `
      const sizeStyles = stylex.create({sm: {fontSize: 'x'}});
      export function Opaque({size, ...rest}) {
        return <div {...mergeProps(themeProps('opaque', rest), stylex.props(sizeStyles[size]))} />;
      }
    `;
    expect(findUnreflectedStyleAxes(source)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Discovery: every component dir's rendered classes vs its documented targets
// ---------------------------------------------------------------------------

interface DocTarget {
  className: string;
  visualProps?: string[];
  states?: string[];
}

type DocBlock = {theming?: {targets?: DocTarget[]}};
type ComponentDocModule = {docs?: DocBlock; docsZh?: DocBlock};

interface ComponentInfo {
  packageName: 'core' | 'lab' | 'richtext' | 'charts';
  dir: string;
  sites: ThemeTargetSite[];
  /** Absolute paths of the source files in `dir`, without tests. */
  sourceFiles: string[];
  /** The doc blocks that carry theming.targets, by the key they live under. */
  docBlocks: {key: 'docs' | 'docsZh'; file: string; targets: DocTarget[]}[];
}

/**
 * Every `*.doc.mjs` under src that declares a theming target for one of
 * `classNames`. Lets a component be checked against the doc that documents it,
 * wherever that file lives.
 *
 * Reads the file as text rather than requiring it: this runs for directories
 * that have no doc of their own, so most candidates are misses.
 */
function docFilesDocumenting(
  srcDir: string,
  classNames: Set<string>,
): string[] {
  const matches: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, {withFileTypes: true})) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(p);
      } else if (entry.name.endsWith('.doc.mjs')) {
        const source = readFileSync(p, 'utf-8');
        for (const className of classNames) {
          if (source.includes(`'${className}'`)) {
            matches.push(p);
            break;
          }
        }
      }
    }
  };
  walk(srcDir);
  return matches;
}

/**
 * Every directory under `srcDir`, at any depth, relative to `srcDir`.
 *
 * Not just the top level: a component's sources are not always its own direct
 * children — Table's plugins render from `Table/plugins/<name>/`. Scanning only
 * the top level exempted every one of those from this guard, which is the same
 * silent-exemption shape #3741 was filed about.
 *
 * Takes `srcDir` rather than closing over a module constant so it serves both
 * packages, which is what the Lab enrollment above needs.
 */
function sourceDirs(srcDir: string): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    for (const entry of readdirSync(join(srcDir, rel), {
      withFileTypes: true,
    })) {
      if (entry.isDirectory()) {
        const child = rel === '' ? entry.name : join(rel, entry.name);
        out.push(child);
        walk(child);
      }
    }
  };
  walk('');
  // The package root itself. A package that keeps its components as flat
  // files rather than one directory each (richtext) has no subdirectory to
  // find, so without this it is silently discovered as zero components.
  out.push('');
  return out;
}

function discoverComponents(
  srcDir: string,
  packageName: ComponentInfo['packageName'],
  requiredDirs: ReadonlySet<string> = new Set(),
): ComponentInfo[] {
  const results: ComponentInfo[] = [];

  for (const dir of sourceDirs(srcDir)) {
    const dirPath = join(srcDir, dir);
    const dirEntries = readdirSync(dirPath);

    const sourceFiles = dirEntries.filter(
      f =>
        (f.endsWith('.tsx') || f.endsWith('.ts')) &&
        !f.includes('.test.') &&
        !f.endsWith('.d.ts'),
    );

    const sites: ThemeTargetSite[] = [];
    for (const f of sourceFiles) {
      const filePath = join(dirPath, f);
      sites.push(
        ...extractThemeTargets(readFileSync(filePath, 'utf-8'), filePath),
      );
    }
    if (sites.length === 0) {
      continue;
    }

    // A component's doc file usually sits beside its source, but not always:
    // `Heading/Heading.tsx` is documented by `Text/Text.doc.mjs`. Requiring a
    // same-directory doc silently exempted every such component — Heading
    // among them. Fall back to whichever doc file documents the classes this
    // directory renders.
    //
    // Both paths match the on-disk listing rather than existsSync: on
    // case-insensitive filesystems existsSync would match a differently-cased
    // doc file that CI never checks. (Same guard as derivedVarRegistry.test.ts.)
    // `basename`, not `dir`: a nested source dir is a path
    // (`Table/plugins/foo`), and its own doc file is named for the last
    // segment.
    const ownDoc = `${basename(dir)}.doc.mjs`;
    const docFiles = dirEntries.includes(ownDoc)
      ? [join(dirPath, ownDoc)]
      : docFilesDocumenting(srcDir, new Set(sites.map(s => s.className)));
    if (docFiles.length === 0) {
      continue;
    }

    const docBlocks: ComponentInfo['docBlocks'] = [];
    for (const docFile of docFiles) {
      let mod: ComponentDocModule;
      try {
        mod = require(docFile) as ComponentDocModule;
      } catch {
        continue;
      }
      for (const key of ['docs', 'docsZh'] as const) {
        const targets = mod[key]?.theming?.targets;
        // A normal Core or Lab component enrolls by declaring a theming
        // surface. Promotion candidates are also enrolled here so a missing
        // block is a failure rather than a silently skipped readiness gap.
        if (targets != null) {
          docBlocks.push({key, file: relative(srcDir, docFile), targets});
        }
      }
    }
    const participates =
      packageName === 'core' || packageName === 'charts'
        ? docBlocks.length > 0
        : requiredDirs.has(dir) || docBlocks.length > 0;
    if (!participates) {
      continue;
    }

    results.push({
      packageName,
      dir,
      sites,
      sourceFiles: sourceFiles.map(f => join(dirPath, f)),
      docBlocks,
    });
  }
  return results;
}

// ---------------------------------------------------------------------------
// The guard
// ---------------------------------------------------------------------------

const participatingComponents = [
  ...discoverComponents(CORE_SRC_DIR, 'core'),
  ...discoverComponents(LAB_SRC_DIR, 'lab', LAB_PROMOTION_DIRS),
  ...discoverComponents(RICHTEXT_SRC_DIR, 'richtext'),
  ...discoverComponents(CHARTS_SRC_DIR, 'charts'),
];

describe('theming.targets matches the themeProps() call sites', () => {
  const components = participatingComponents;

  it('finds participating Core, Lab, richtext, and charts components', () => {
    // A refactor that renames themeProps or drops the Lab package from this
    // inventory must not silently disable either side of the guard.
    expect(components.some(component => component.packageName === 'core')).toBe(
      true,
    );
    expect(components.some(component => component.packageName === 'lab')).toBe(
      true,
    );
    // richtext keeps its components as flat files, so a regression in
    // directory discovery would enroll zero of them and the guard would pass
    // on an unchecked package rather than fail.
    expect(
      components.some(component => component.packageName === 'richtext'),
    ).toBe(true);
    // charts enrolls the same way: a package that starts participating must
    // stay discovered, or the guard passes on an unchecked package.
    expect(
      components.some(component => component.packageName === 'charts'),
    ).toBe(true);
  });

  it('enrolls every Lab promotion candidate and explicit theming capability', () => {
    const labDirs = new Set(
      components
        .filter(component => component.packageName === 'lab')
        .map(component => component.dir),
    );
    expect([...LAB_PROMOTION_DIRS].filter(dir => !labDirs.has(dir))).toEqual(
      [],
    );
    expect(LAB_PROMOTION_DIRS.has('CircularProgress')).toBe(false);
    expect(labDirs.has('CircularProgress')).toBe(true);
    expect(labDirs.has('Schedule')).toBe(false);
  });

  for (const {packageName, dir, sites, docBlocks} of components) {
    const componentLabel = `${packageName}/${dir}`;
    const renderedClasses = [...new Set(sites.map(s => s.className))].sort();

    it(`${componentLabel}: participating components declare theming metadata`, () => {
      expect(
        docBlocks,
        `${componentLabel} participates in the public theming contract but has ` +
          `no loadable .doc.mjs theming.targets. Lab components participate ` +
          `when they declare theming.targets or enter the promotion manifest.`,
      ).not.toHaveLength(0);
    });

    for (const {key, file, targets} of docBlocks) {
      const documented = new Set(targets.map(t => t.className));

      it(`${componentLabel} (${file} ${key}): every rendered class is documented`, () => {
        const undocumented = renderedClasses.filter(c => !documented.has(c));
        expect(
          undocumented,
          `${componentLabel} renders ${undocumented.length} astryx-* class(es) that ` +
            `${file} ${key}.theming.targets does not document: ` +
            `${undocumented.join(', ')}. An undocumented class is an ` +
            `unthemeable element — theme authors and codegen read targets[] ` +
            `to learn which selectors exist. Add {className: '...'} entries.`,
        ).toEqual([]);
      });

      it(`${componentLabel} (${file} ${key}): every visual prop passed to themeProps is documented`, () => {
        const missing: string[] = [];
        for (const site of sites) {
          const target = targets.find(t => t.className === site.className);
          if (target == null) {
            continue; // Reported by the class test above.
          }
          const known = new Set([
            ...(target.visualProps || []),
            ...(target.states || []),
          ]);
          for (const propKey of site.propKeys) {
            if (!known.has(propKey)) {
              missing.push(`${site.className}: ${propKey}`);
            }
          }
        }
        expect(
          [...new Set(missing)],
          `${dir} passes prop keys to themeProps() that ${file} ` +
            `${key}.theming.targets does not list under visualProps/states. ` +
            `Each one is a [data-*] selector consumers cannot discover.`,
        ).toEqual([]);
      });
    }
  }
});

/**
 * Painted axes that do not reach themeProps(). Each key is `Component.prop`.
 * Each value says why: the record claim that keeps the axis unreflected, or
 * the gap that blocks a target. Remove a gap entry when the axis reaches
 * themeProps(). A stale entry fails the guard.
 */
const UNREFLECTED_STYLE_AXIS_EXCEPTIONS: ReadonlyMap<string, string> = new Map([
  [
    'BaseTypeahead.size',
    'The size pads the result row, and the result row has no target. The ' +
      'missing row target is a recorded reachability gap.',
  ],
  [
    'ChatComposer.elevation',
    'The composer body paints the elevation but has no target. How to expose ' +
      'the body to themes is an open owner decision.',
  ],
  [
    'ChartSwatchImpl.variant',
    'ChartSwatch has no theming target. It paints the variant shape only. ' +
      'Whether the swatch becomes a target is an open owner decision.',
  ],
  [
    'Skeleton.radius',
    'component:Skeleton FR2: radius is callsite geometry, like width and ' +
      'height, and is not reflected.',
  ],
]);

describe('every painted prop axis reaches themeProps()', () => {
  const findings = participatingComponents.flatMap(
    ({packageName, dir, sourceFiles}) =>
      sourceFiles
        .filter(file => !file.includes('.stories.'))
        .flatMap(file =>
          findUnreflectedStyleAxes(readFileSync(file, 'utf-8'), file).map(
            finding => ({
              ...finding,
              key: `${finding.component}.${finding.prop}`,
              where: `${packageName}/${dir}/${basename(file)}:${finding.line}`,
            }),
          ),
        ),
  );

  it('reflects every painted axis or lists it as an exception', () => {
    const unexplained = findings
      .filter(finding => !UNREFLECTED_STYLE_AXIS_EXCEPTIONS.has(finding.key))
      .map(
        finding =>
          `${finding.where}: ${finding.component} selects painted styles ` +
          `with \`${finding.styleMap}[${finding.prop}]\`, but no themeProps() ` +
          `call passes \`${finding.prop}\`. A theme cannot select the ` +
          `\`${finding.prop}\` values. Add \`${finding.prop}\` to the ` +
          `themeProps() call on the target that paints it. If a record ` +
          `keeps the axis unreflected, or no target paints it, add an ` +
          `UNREFLECTED_STYLE_AXIS_EXCEPTIONS entry that says why.`,
      );
    expect(unexplained).toEqual([]);
  });

  it('has no stale exceptions', () => {
    const found = new Set(findings.map(finding => finding.key));
    const stale = [...UNREFLECTED_STYLE_AXIS_EXCEPTIONS.keys()].filter(
      key => !found.has(key),
    );
    expect(
      stale,
      'These exceptions no longer match an unreflected painted axis. ' +
        'Remove them.',
    ).toEqual([]);
  });
});
