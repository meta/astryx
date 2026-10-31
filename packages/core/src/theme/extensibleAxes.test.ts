// Copyright (c) Meta Platforms, Inc. and affiliates.

/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * @file Guards the STRUCTURAL wiring of extensible prop axes — the `*Map`
 *   interfaces a theme augments — against the theming surface that has to carry
 *   them. Whether an axis may be open, and whether an unavailable custom value
 *   has a safe theme-independent fallback, remain component-contract and review
 *   decisions with focused fallback tests; source syntax cannot prove either.
 * @input Component sources (*.tsx/*.ts) and their `{Name}.doc.mjs` files.
 * @output Vitest failures naming each map whose axis a theme cannot reach.
 * @position Third sibling of derivedVarRegistry.test.ts (`vars`, `derived`) and
 *   themingTargets.test.ts (`targets`). Those two check what a component
 *   RENDERS against what it DOCUMENTS. Neither one looks at the open prop
 *   unions, so nothing did.
 *
 * An extensible axis is a promise made in three places at once, and it is only
 * kept if all three agree:
 *
 *   1. `export interface FooVariantMap` in `Foo/index.ts` — the augmentation
 *      point. A consumer writes `declare module '@astryxdesign/core/Foo'`
 *      against THAT subpath, and `astryx theme build` looks for the literal
 *      interface there when it emits `<theme>.variants.d.ts`. A map declared
 *      in a sibling file and only re-exported is invisible to both.
 *   2. `themeProps('foo', {variant})` — the axis reaching the DOM. Without it
 *      a custom variant renders no selector, so there is nothing to style.
 *   3. `visualProps: ['variant']` on the doc's theming target — discovery, and
 *      the reason `theme build` does not reject `'foo': {'variant:custom': …}`
 *      as an unknown prop.
 *
 * Miss (2) and the type says yes while the CSS says nothing: TreeList shipped
 * `TreeListVariantMap`, with a module-augmentation example in its own JSDoc,
 * while `themeProps('tree-list', {density})` never passed `variant` — so an
 * augmented variant type-checked, rendered, and could not be themed.
 *
 * An artwork-request axis (`ARTWORK_REQUEST_MAPS`) keeps (1) but has no
 * styling wiring: it selects theme-supplied artwork, so its target reflects
 * nothing and documents no visual prop (architecture:component-theming-surface
 * INV6, INV14).
 */

import {describe, it, expect} from 'vitest';
import {readdirSync, readFileSync} from 'node:fs';
import {join, relative} from 'node:path';
import ts from 'typescript';
import {stableClassName} from '../naming';

const SRC_DIR = join(__dirname, '..');

// ---------------------------------------------------------------------------
// Source scanning
// ---------------------------------------------------------------------------

/**
 * An extensible axis, keyed by the map that owns it.
 *
 * The OWNER is the component whose index declares the interface — that is the
 * subpath a consumer augments and the component that has to reflect the prop.
 * Other components may declare a prop of the same type (`AlertDialog`'s
 * `actionVariant: ButtonVariant`, every field's `statusVariant`); they forward
 * the value to the owner and are not separately accountable for it.
 */
interface ExtensibleAxis {
  /** Component directory under src/ whose index declares the map. */
  dir: string;
  /** Interface name, e.g. 'TreeListVariantMap'. */
  mapName: string;
  /** The prop it types, read off the interface name, e.g. 'variant'. */
  prop: string;
}

function sourceFilesUnder(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') {
        continue;
      }
      sourceFilesUnder(full, out);
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) {
      out.push(full);
    }
  }
  return out;
}

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

/**
 * Every `type Alias = keyof SomethingMap` in the tree, as alias -> map name.
 * This is the shape that makes a union OPEN: augmenting the interface widens
 * the alias, which is the whole mechanism a theme package uses.
 */
function collectKeyofAliases(files: string[]): Map<string, string> {
  const aliases = new Map<string, string>();

  /** `keyof FooMap`, and the `keyof FooMap & string` narrowing form. */
  const mapBehind = (type: ts.TypeNode): string | null => {
    if (ts.isIntersectionTypeNode(type)) {
      for (const member of type.types) {
        const found = mapBehind(member);
        if (found != null) {
          return found;
        }
      }
      return null;
    }
    if (
      ts.isTypeOperatorNode(type) &&
      type.operator === ts.SyntaxKind.KeyOfKeyword &&
      ts.isTypeReferenceNode(type.type) &&
      ts.isIdentifier(type.type.typeName) &&
      type.type.typeName.text.endsWith('Map')
    ) {
      return type.type.typeName.text;
    }
    return null;
  };

  for (const file of files) {
    const visit = (node: ts.Node): void => {
      if (ts.isTypeAliasDeclaration(node)) {
        const map = mapBehind(node.type);
        if (map != null) {
          aliases.set(node.name.text, map);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(parse(file));
  }
  return aliases;
}

/**
 * Maps whose alias types a prop on some `*Props` interface — i.e. the open
 * union is a COMPONENT PROP, which is what makes it a theming axis.
 *
 * This is the line between the two kinds of augmentable map in the tree.
 * `ButtonVariantMap` widens `<Button variant>`, a visual prop that reaches the
 * DOM and gets styled. `IndicatorMap` widens the set of registered indicator
 * NAMES — a different extension mechanism (the theme's `indicators` field,
 * swapping a React component), with no selector and no visual prop. Holding
 * the second to the theming contract below would be a category error.
 */
function mapsTypingAProp(
  files: string[],
  aliases: Map<string, string>,
): Set<string> {
  const used = new Set<string>();
  for (const file of files) {
    const visit = (node: ts.Node): void => {
      if (ts.isInterfaceDeclaration(node) && node.name.text.endsWith('Props')) {
        for (const member of node.members) {
          if (!ts.isPropertySignature(member) || member.type == null) {
            continue;
          }
          const typeNode = ts.isArrayTypeNode(member.type)
            ? member.type.elementType
            : member.type;
          if (
            ts.isTypeReferenceNode(typeNode) &&
            ts.isIdentifier(typeNode.typeName)
          ) {
            const map = aliases.get(typeNode.typeName.text);
            if (map != null) {
              used.add(map);
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(parse(file));
  }
  return used;
}

/**
 * Every map that is (a) an open union — some `type X = keyof <Map>` exists, so
 * augmenting it widens a real type — and (b) declared in a component index.
 *
 * The prop name is read off the interface, which is the same convention
 * `astryx theme build` uses to find an augmentation point:
 * `<Prefix><Prop>Map`. `TextColorMap` -> Text, `color`.
 * `AvatarStatusDotVariantMap` -> Avatar, `variant`.
 */
function collectExtensibleAxes(
  files: string[],
  aliases: Map<string, string>,
  propMaps: Set<string>,
): ExtensibleAxis[] {
  const open = propMaps;
  const axes: ExtensibleAxis[] = [];
  for (const file of files) {
    if (!/\/index\.tsx?$/.test(file)) {
      continue;
    }
    const dir = relative(SRC_DIR, file).split('/')[0];
    const visit = (node: ts.Node): void => {
      if (
        ts.isInterfaceDeclaration(node) &&
        node.name.text.endsWith('Map') &&
        open.has(node.name.text)
      ) {
        const bare = node.name.text.slice(0, -'Map'.length);
        // The trailing PascalCase word is the prop.
        const match = /([A-Z][a-z0-9]*)$/.exec(bare);
        if (match == null) {
          return;
        }
        const prop = match[1].charAt(0).toLowerCase() + match[1].slice(1);
        axes.push({dir, mapName: node.name.text, prop});
      }
      ts.forEachChild(node, visit);
    };
    visit(parse(file));
  }
  return axes;
}

/** Every `themeProps('name', {...})` site, as class -> the prop keys it passes. */
function collectThemePropsSites(files: string[]): Map<string, Set<string>> {
  const sites = new Map<string, Set<string>>();
  for (const file of files) {
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'themeProps'
      ) {
        const [nameArg, propsArg] = node.arguments;
        if (nameArg != null && ts.isStringLiteralLike(nameArg)) {
          const cls = stableClassName(nameArg.text);
          const keys = sites.get(cls) ?? new Set<string>();
          if (propsArg != null && ts.isObjectLiteralExpression(propsArg)) {
            for (const prop of propsArg.properties) {
              const name = prop.name;
              if (
                name != null &&
                (ts.isIdentifier(name) || ts.isStringLiteralLike(name))
              ) {
                keys.add(name.text);
              }
            }
          }
          sites.set(cls, keys);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(parse(file));
  }
  return sites;
}

// ---------------------------------------------------------------------------
// Docs
// ---------------------------------------------------------------------------

interface DocTarget {
  className: string;
  visualProps: string[];
}

function collectDocTargets(dir: string): Map<string, DocTarget[]> {
  const byDir = new Map<string, DocTarget[]>();
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, {withFileTypes: true})) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '__tests__') {
          continue;
        }
        walk(full);
      } else if (entry.name.endsWith('.doc.mjs')) {
        const fallbackDir = relative(SRC_DIR, full).split('/')[0];
        let doc;
        try {
          doc = require(full).docs;
        } catch {
          continue;
        }
        // Subcomponent docs can live in their parent's directory (for example,
        // Text/Heading.doc.mjs). Attribute them to the component they document,
        // not merely the first path segment.
        const componentDir =
          typeof doc?.name === 'string' ? doc.name : fallbackDir;
        const targets = (doc?.theming?.targets ?? [])
          .filter(
            (t: unknown): t is {className: string} =>
              typeof (t as {className?: unknown})?.className === 'string',
          )
          .map((t: {className: string; visualProps?: string[]}) => ({
            className: t.className,
            visualProps: t.visualProps ?? [],
          }));
        byDir.set(componentDir, [
          ...(byDir.get(componentDir) ?? []),
          ...targets,
        ]);
      }
    }
  };
  walk(dir);
  return byDir;
}

// ---------------------------------------------------------------------------

const files = sourceFilesUnder(SRC_DIR);
const aliases = collectKeyofAliases(files);
const propMaps = mapsTypingAProp(files, aliases);
const axes = collectExtensibleAxes(files, aliases, propMaps);
const themePropsSites = collectThemePropsSites(files);
const docTargets = collectDocTargets(SRC_DIR);

/**
 * Maps whose axis is an artwork request, not a styling selector. Each keeps the
 * public-map check above and is exempt from the themeProps() reflection and
 * visualProps checks only — and must stay unreflected and undocumented as a
 * visual prop. `Icon.variant` selects a theme's artwork; an unlisted name
 * renders the request without a variant. `astryx theme build` keeps the same
 * list out of component-value enrollment
 * (packages/cli/api/theme/build/build.mjs).
 */
const ARTWORK_REQUEST_MAPS: ReadonlySet<string> = new Set(['IconVariantMap']);

const stylingAxes = axes.filter(a => !ARTWORK_REQUEST_MAPS.has(a.mapName));
const artworkAxes = axes.filter(a => ARTWORK_REQUEST_MAPS.has(a.mapName));

/** The target a component's own name maps to, e.g. TreeList -> astryx-tree-list. */
function ownTargets(axis: ExtensibleAxis): DocTarget[] {
  return docTargets.get(axis.dir) ?? [];
}

describe('extensible prop axes are reachable by a theme', () => {
  it('finds the axes at all (guards the guard)', () => {
    // If the AST walk silently stopped matching, every assertion below would
    // pass on an empty list.
    expect(axes.length).toBeGreaterThan(10);
    expect(axes.map(a => a.mapName)).toContain('ButtonVariantMap');
  });

  it('every open prop union is declared in an index a consumer can augment', () => {
    // Module augmentation only widens the module where the interface is
    // DECLARED, and the CLI greps the public subpath for that literal
    // declaration. A map in a sibling file, re-exported, satisfies neither:
    // `declare module '@astryxdesign/core/<Component>'` would create a new,
    // unrelated interface and `theme build` would emit no augmentation.
    // `collectExtensibleAxes` only reads indexes, so anything open and
    // declared elsewhere is missing from `axes` entirely — compare against
    // every open map in the tree to catch that.
    const declaredInAnIndex = new Set(axes.map(a => a.mapName));
    const notAugmentable = [...propMaps].filter(m => !declaredInAnIndex.has(m));
    expect(
      notAugmentable,
      'these maps type an open union but are not declared in a component index, ' +
        'so no consumer can augment them at @astryxdesign/core/<Component>',
    ).toEqual([]);
  });

  it.each(
    stylingAxes.map(a => [`${a.dir}.${a.prop} (${a.mapName})`, a] as const),
  )('%s reaches the DOM through themeProps', (_label, axis) => {
    // The axis is extensible, so a consumer can add a value we have never
    // seen. The only way their CSS can select it is if the component
    // reflects the prop.
    const targets = ownTargets(axis);
    const reflected = targets.some(t =>
      themePropsSites.get(t.className)?.has(axis.prop),
    );
    expect(
      reflected,
      `${axis.dir} lets a theme add \`${axis.prop}\` values via ${axis.mapName}, but no ` +
        `themeProps() call passes \`${axis.prop}\` — a custom value renders no selector, ` +
        `so it cannot be styled. Pass it: themeProps('<target>', {${axis.prop}}).`,
    ).toBe(true);
  });

  it.each(
    stylingAxes.map(a => [`${a.dir}.${a.prop} (${a.mapName})`, a] as const),
  )('%s is documented as a visual prop', (_label, axis) => {
    // Undocumented, it is undiscoverable — and `theme build` rejects
    // `'<target>': {'<prop>:custom': …}` as an unknown prop, because its
    // known-prop set is built from exactly this field.
    const targets = ownTargets(axis);
    const documented = targets.some(t => t.visualProps.includes(axis.prop));
    expect(
      documented,
      `${axis.dir} lets a theme add \`${axis.prop}\` values via ${axis.mapName}, but no ` +
        `theming target documents \`${axis.prop}\` in visualProps — a theme author cannot ` +
        `discover the axis, and \`astryx theme build\` warns "Unknown prop" on it.`,
    ).toBe(true);
  });
});

describe('artwork-request axes are exempt from styling wiring only', () => {
  it('lists only maps that are extensible axes', () => {
    // A stale entry would silently exempt nothing; a renamed map would leave
    // its axis held to styling wiring it must not have.
    expect(artworkAxes.map(a => a.mapName).sort()).toEqual(
      [...ARTWORK_REQUEST_MAPS].sort(),
    );
  });

  it.each(
    artworkAxes.map(a => [`${a.dir}.${a.prop} (${a.mapName})`, a] as const),
  )(
    '%s is neither reflected nor documented as a visual prop',
    (_label, axis) => {
      // The axis selects artwork, so it has no styling selector.
      const targets = ownTargets(axis);
      expect(
        targets.some(t => themePropsSites.get(t.className)?.has(axis.prop)),
        `${axis.dir}.${axis.prop} selects artwork; no themeProps() call may reflect it.`,
      ).toBe(false);
      expect(
        targets.some(t => t.visualProps.includes(axis.prop)),
        `${axis.dir}.${axis.prop} selects artwork; no theming target may list it in visualProps.`,
      ).toBe(false);
    },
  );
});
