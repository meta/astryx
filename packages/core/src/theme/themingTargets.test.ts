// Copyright (c) Meta Platforms, Inc. and affiliates.

/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * @file Guards `theming.targets` against the real `themeProps()` call sites (#3741).
 * @input Core/Lab component sources (*.tsx/*.ts), their `{Name}.doc.mjs`
 *   files, and the Lab promotion-candidate manifest.
 * @output Vitest failures naming each undocumented class / visual prop on the
 *   stable Core surface or a capability-participating Lab component.
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
        const site: ThemeTargetSite = {
          className: stableClassName(nameArg.text),
          propKeys: [],
          isOpaque: false,
        };

        if (propsArg != null) {
          if (ts.isObjectLiteralExpression(propsArg)) {
            for (const prop of propsArg.properties) {
              if (ts.isSpreadAssignment(prop)) {
                // A conditional spread of an object literal — `...(type &&
                // {type})` — has statically known keys. Treating it as opaque
                // is how `astryx-heading`'s `type` stayed undocumented: the
                // same drift this file exists to catch (#3652, #3680).
                const spreadKeys = conditionalSpreadKeys(prop.expression);
                if (spreadKeys == null) {
                  site.isOpaque = true;
                } else {
                  site.propKeys.push(...spreadKeys);
                }
                continue;
              }
              const name = prop.name;
              if (name == null) {
                site.isOpaque = true;
                continue;
              }
              if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) {
                site.propKeys.push(name.text);
              } else {
                // Computed key: themeProps('x', {[k]: v})
                site.isOpaque = true;
              }
            }
          } else {
            // A variable or call passed as the props bag.
            site.isOpaque = true;
          }
        }

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
  packageName: 'core' | 'lab' | 'richtext';
  dir: string;
  sites: ThemeTargetSite[];
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
      packageName === 'core'
        ? docBlocks.length > 0
        : requiredDirs.has(dir) || docBlocks.length > 0;
    if (!participates) {
      continue;
    }

    results.push({packageName, dir, sites, docBlocks});
  }
  return results;
}

// ---------------------------------------------------------------------------
// The guard
// ---------------------------------------------------------------------------

describe('theming.targets matches the themeProps() call sites', () => {
  const components = [
    ...discoverComponents(CORE_SRC_DIR, 'core'),
    ...discoverComponents(LAB_SRC_DIR, 'lab', LAB_PROMOTION_DIRS),
    ...discoverComponents(RICHTEXT_SRC_DIR, 'richtext'),
  ];

  it('finds participating Core and Lab components', () => {
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
