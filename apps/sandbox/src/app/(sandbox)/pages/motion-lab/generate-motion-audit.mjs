// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Measures motion in @astryxdesign/core and writes the numbers the Motion Lab
 * renders. The lab is a decision tool, so every count it shows has to come
 * from the installed package rather than from prose that can drift.
 *
 * Core styles are StyleX object literals, so the properties are camelCase JS
 * keys (`transitionDuration`), not CSS declarations. Everything here reads
 * that shape.
 *
 * Usage: node scripts/generate-motion-audit.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

// This script sits inside the lab it feeds, so everything the lab needs is in
// one directory: the pages, the shared modules, the generated data, and the
// generator that produces it.
const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '../../../../..');
const REPO = path.resolve(APP, '../..');
// In the monorepo the audit reads the real package sources, so lab is
// measurable too — it is a published package here, not an absent dependency.
const PACKAGES = [
  {name: 'core', root: path.join(REPO, 'packages/core/src')},
  {name: 'lab', root: path.join(REPO, 'packages/lab/src')},
];
const OUT = path.join(HERE, '__generated__/motionAudit.ts');

for (const pkg of PACKAGES) {
  if (!fs.existsSync(pkg.root)) {
    console.error(`[motion-audit] no ${pkg.name} source at ${pkg.root}`);
    process.exit(1);
  }
}

// --- collect ---------------------------------------------------------------

const SKIP_DIRS = new Set(['__tests__', '__snapshots__', 'node_modules']);
const isSource = f =>
  /\.(ts|tsx|css)$/.test(f) && !/\.(test|stories)\.tsx?$/.test(f);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        walk(path.join(dir, entry.name), out);
      }
    } else if (isSource(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

// A StyleX value ends at the comma that terminates the property — but commas
// also appear inside cubic-bezier(...) and inside a multi-property
// transitionProperty list, and a long value wraps onto its own line. Matching
// quoted strings and parenthesised groups whole, and allowing newlines, is
// what makes `transitionProperty:\n  'a, b, transform',` visible; an earlier
// version stopped at the line break and silently missed Button.
const propRe = name =>
  new RegExp(
    `\\b${name}\\s*:\\s*((?:'[^']*'|"[^"]*"|\\([^)]*\\)|[^,{}'"()])+)`,
    'g',
  );

const DURATION_PROPS = [
  'transitionDuration',
  'animationDuration',
  'transitionDelay',
  'animationDelay',
];
const EASING_PROPS = ['transitionTimingFunction', 'animationTimingFunction'];

const RE = {
  duration: Object.fromEntries(DURATION_PROPS.map(p => [p, propRe(p)])),
  easing: Object.fromEntries(EASING_PROPS.map(p => [p, propRe(p)])),
  transitionProperty: propRe('transitionProperty'),
  transitionShorthand: propRe('transition'),
  animationShorthand: propRe('animation'),
  animationName: propRe('animationName'),
  iterationCount: propRe('animationIterationCount'),
};

const DUR_LITERAL = /^\s*['"]?\s*(\d+(?:\.\d+)?)(ms|s)\b/;
const EASE_LITERAL =
  /cubic-bezier\s*\([^)]*\)|\b(?:ease-in-out|ease-in|ease-out|linear|ease)\b/g;
const REDUCED_MOTION = /prefers-reduced-motion/;
const TOKEN_DURATION = /var\(--duration|durationVars|var\(--stagger/;
const TOKEN_EASE = /var\(--ease|easeVars/;
const SET_TIMEOUT = /setTimeout\s*\(\s*[^,]{0,120}?,\s*(\d+)\s*\)/gs;
const GET_COMPUTED = /getComputedStyle/g;

// Every file is carried with its package so a finding can say which one it is
// in: the same component name can exist in both, and the two have different
// stability promises.
const files = PACKAGES.flatMap(pkg =>
  walk(pkg.root)
    .sort()
    .map(file => ({file, pkg})),
);
const componentDirs = PACKAGES.flatMap(pkg =>
  fs
    .readdirSync(pkg.root, {withFileTypes: true})
    .filter(e => e.isDirectory() && /^[A-Z]/.test(e.name))
    .map(e => ({name: e.name, pkg: pkg.name})),
).sort((a, b) => a.name.localeCompare(b.name));

const componentOf = (file, pkg) => {
  const top = path.relative(pkg.root, file).split(path.sep)[0];
  return /^[A-Z]/.test(top) ? top : '(shared)';
};
const lineOf = (text, index) => text.slice(0, index).split('\n').length;
const squash = s => s.replace(/\s+/g, ' ').trim().slice(0, 110);

const hardcoded = [];
const noopTransitions = [];
const durationWithoutCurve = [];
const transformTransitions = [];
const transitionAll = [];
const noReducedMotion = [];
const withReducedMotion = [];
const loops = [];
const timeoutLiterals = [];
const computedReads = [];
const animatedFiles = [];
const instantSpellings = new Map();
const literalValues = new Map();
const bump = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);

for (const {file, pkg} of files) {
  const text = fs.readFileSync(file, 'utf8');
  const rel = `${pkg.name}/${path.relative(pkg.root, file)}`;
  const component = componentOf(file, pkg);
  const scan = (re, fn) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      fn(m);
    }
  };

  const animates = [
    ...Object.values(RE.duration),
    ...Object.values(RE.easing),
    RE.transitionProperty,
    RE.animationName,
    RE.transitionShorthand,
    RE.animationShorthand,
  ].some(re => {
    re.lastIndex = 0;
    return re.test(text);
  });

  if (animates) {
    animatedFiles.push(rel);
    (REDUCED_MOTION.test(text) ? withReducedMotion : noReducedMotion).push({
      file: rel,
      package: pkg.name,
      component,
    });
  }

  for (const [prop, re] of Object.entries(RE.duration)) {
    scan(re, m => {
      const raw = m[1].trim().replace(/,$/, '').trim();
      if (TOKEN_DURATION.test(raw)) {
        return;
      }
      const lit = DUR_LITERAL.exec(raw);
      if (lit == null) {
        return;
      }
      const ms = Number(lit[1]) * (lit[2] === 'ms' ? 1 : 1000);
      const value = raw.replace(/^['"]|['"]$/g, '');
      bump(literalValues, value);
      if (ms <= 1) {
        bump(instantSpellings, value);
      }
      hardcoded.push({
        file: rel,
        package: pkg.name,
        component,
        line: lineOf(text, m.index),
        kind: 'duration',
        prop,
        value,
        ms,
      });
    });
  }

  for (const [prop, re] of Object.entries(RE.easing)) {
    scan(re, m => {
      const raw = m[1].trim().replace(/,$/, '').trim();
      if (TOKEN_EASE.test(raw)) {
        return;
      }
      EASE_LITERAL.lastIndex = 0;
      const lit = EASE_LITERAL.exec(raw);
      if (lit == null) {
        return;
      }
      bump(literalValues, lit[0]);
      hardcoded.push({
        file: rel,
        package: pkg.name,
        component,
        line: lineOf(text, m.index),
        kind: 'easing',
        prop,
        value: lit[0],
        ms: null,
      });
    });
  }

  // literals also hide inside the `transition:` / `animation:` shorthands
  for (const [re, prop] of [
    [RE.transitionShorthand, 'transition'],
    [RE.animationShorthand, 'animation'],
  ]) {
    scan(re, m => {
      const raw = m[1];
      if (TOKEN_DURATION.test(raw) && TOKEN_EASE.test(raw)) {
        return;
      }
      for (const lit of raw.matchAll(/(?<![\w-])(\d+(?:\.\d+)?)(ms|s)(?![\w-])/g)) {
        const ms = Number(lit[1]) * (lit[2] === 'ms' ? 1 : 1000);
        bump(literalValues, lit[0]);
        if (ms <= 1) {
          bump(instantSpellings, lit[0]);
        }
        hardcoded.push({
          file: rel,
          package: pkg.name,
          component,
          line: lineOf(text, m.index),
          kind: 'duration',
          prop,
          value: lit[0],
          ms,
        });
      }
      for (const lit of raw.matchAll(EASE_LITERAL)) {
        bump(literalValues, lit[0]);
        hardcoded.push({
          file: rel,
          package: pkg.name,
          component,
          line: lineOf(text, m.index),
          kind: 'easing',
          prop,
          value: lit[0],
          ms: null,
        });
      }
    });
  }

  // transform / `all` are read straight off the declaration rather than from a
  // rule block: a StyleX rule commonly nests one object per pseudo-state, and a
  // flat block scan matches those inner objects instead of the rule that holds
  // the transitionProperty. That is how Button's transform transition hid.
  scan(RE.transitionProperty, m => {
    const declared = m[1];
    const line = lineOf(text, m.index);
    if (/\btransform\b/.test(declared)) {
      transformTransitions.push({
        file: rel,
        package: pkg.name,
        component,
        line,
        decl: squash(m[0]),
      });
    }
    if (/['"]all['"]/.test(declared)) {
      transitionAll.push({file: rel, package: pkg.name, component, line, decl: squash(m[0])});
    }
  });

  // Pairing checks still need the enclosing rule. One level of nesting is
  // enough for every StyleX rule in core.
  for (const block of text.matchAll(/\{(?:[^{}]|\{[^{}]*\})*\}/g)) {
    const body = block[0];
    const line = lineOf(text, block.index);
    const reset = re => {
      re.lastIndex = 0;
      return re.exec(body);
    };
    const declaredProperty = reset(RE.transitionProperty);
    const declaredDuration = reset(RE.duration.transitionDuration);
    const shorthand = reset(RE.transitionShorthand);
    const declaredCurve = reset(RE.easing.transitionTimingFunction);

    if (declaredProperty != null && declaredDuration == null && shorthand == null) {
      noopTransitions.push({
        file: rel,
        package: pkg.name,
        component,
        line,
        decl: squash(declaredProperty[0]),
      });
    }
    if (declaredDuration != null && declaredCurve == null && shorthand == null) {
      durationWithoutCurve.push({
        file: rel,
        package: pkg.name,
        component,
        line,
        decl: squash(declaredDuration[0]),
      });
    }
  }

  scan(RE.iterationCount, m => {
    if (/infinite/.test(m[1])) {
      loops.push({file: rel, package: pkg.name, component, line: lineOf(text, m.index)});
    }
  });
  scan(SET_TIMEOUT, m => {
    if (Number(m[1]) > 0) {
      timeoutLiterals.push({
        file: rel,
        package: pkg.name,
        component,
        line: lineOf(text, m.index),
        ms: Number(m[1]),
      });
    }
  });
  scan(GET_COMPUTED, m => {
    computedReads.push({file: rel, package: pkg.name, component, line: lineOf(text, m.index)});
  });
}

// animatedFiles entries are already `<pkg>/<relative>`, so the component is
// the first path segment after the package.
const animating = [
  ...new Set(
    animatedFiles
      .map(f => f.split('/')[1])
      .filter(top => /^[A-Z]/.test(top ?? '')),
  ),
].sort();
const staticComponents = componentDirs
  .filter(c => !animating.includes(c.name))
  .map(c => c.name);

const byComponent = new Map();
for (const site of hardcoded) {
  bump(byComponent, site.component);
}

const counts = {
  componentDirs: componentDirs.length,
  coreComponentDirs: componentDirs.filter(c => c.pkg === 'core').length,
  labComponentDirs: componentDirs.filter(c => c.pkg === 'lab').length,
  hardcodedInLab: hardcoded.filter(s => s.package === 'lab').length,
  filesScanned: files.length,
  animatingComponents: animating.length,
  staticComponents: staticComponents.length,
  animatedFiles: animatedFiles.length,
  filesWithReducedMotion: withReducedMotion.length,
  filesWithoutReducedMotion: noReducedMotion.length,
  hardcodedTotal: hardcoded.length,
  hardcodedDuration: hardcoded.filter(s => s.kind === 'duration').length,
  hardcodedEasing: hardcoded.filter(s => s.kind === 'easing').length,
  noopTransitions: noopTransitions.length,
  durationWithoutCurve: durationWithoutCurve.length,
  transformTransitions: transformTransitions.length,
  transformTransitionComponents: new Set(transformTransitions.map(s => s.component))
    .size,
  transitionAll: transitionAll.length,
  infiniteLoops: loops.length,
  setTimeoutLiterals: timeoutLiterals.length,
  getComputedStyleReads: computedReads.length,
};

// --- emit ------------------------------------------------------------------

const version = JSON.parse(
  fs.readFileSync(path.join(REPO, 'packages/core/package.json'), 'utf8'),
).version;

const rows = (name, list, type) =>
  `export const ${name}: ReadonlyArray<${type}> = [\n${list
    .map(r => `  ${JSON.stringify(r)},`)
    .join('\n')}\n];\n`;

const pairs = (name, map) =>
  `export const ${name}: ReadonlyArray<readonly [string, number]> = [\n${[...map]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `  [${JSON.stringify(k)}, ${v}],`)
    .join('\n')}\n];\n`;

const out = `// Copyright (c) Meta Platforms, Inc. and affiliates.

// @generated by scripts/generate-motion-audit.mjs — do not edit by hand.
// Measured against packages/core + packages/lab at core@${version}.
// Regenerate: pnpm -F @astryxdesign/sandbox generate:motion-audit
//
// The Motion Lab shows these numbers instead of the ones written in the project
// brief, because a brief drifts from the code and a generated file cannot.
// Where the two disagree, the lab says so and cites file:line.

export type HardcodedSite = {
  readonly file: string;
  readonly package: 'core' | 'lab';
  readonly component: string;
  readonly line: number;
  readonly kind: 'duration' | 'easing';
  readonly prop: string;
  readonly value: string;
  readonly ms: number | null;
};

export type SiteRef = {
  readonly file: string;
  readonly package: 'core' | 'lab';
  readonly component: string;
  readonly line: number;
  readonly decl?: string;
};

export const CORE_VERSION = ${JSON.stringify(version)};

export const AUDIT_COUNTS = ${JSON.stringify(counts, null, 2)} as const;

${rows('HARDCODED_SITES', [...hardcoded].sort((a, b) => a.component.localeCompare(b.component) || a.file.localeCompare(b.file) || a.line - b.line), 'HardcodedSite')}
${rows('NOOP_TRANSITIONS', noopTransitions, 'SiteRef')}
${rows('DURATION_WITHOUT_CURVE', durationWithoutCurve, 'SiteRef')}
${rows('TRANSFORM_TRANSITIONS', transformTransitions, 'SiteRef')}
${rows('TRANSITION_ALL', transitionAll, 'SiteRef')}
${rows('INFINITE_LOOPS', loops, 'SiteRef')}
${rows('TIMEOUT_LITERALS', timeoutLiterals, "{readonly file: string; readonly package: 'core' | 'lab'; readonly component: string; readonly line: number; readonly ms: number}")}
${rows('NO_REDUCED_MOTION', noReducedMotion, "{readonly file: string; readonly package: 'core' | 'lab'; readonly component: string}")}
${pairs('INSTANT_SPELLINGS', instantSpellings)}
${pairs('LITERAL_VALUES', literalValues)}
${pairs('HARDCODED_BY_COMPONENT', byComponent)}
export const ANIMATING_COMPONENTS: ReadonlyArray<string> = ${JSON.stringify(animating)};

export const STATIC_COMPONENTS: ReadonlyArray<string> = ${JSON.stringify(staticComponents)};
`;

fs.mkdirSync(path.dirname(OUT), {recursive: true});
fs.writeFileSync(OUT, out);
console.log(
  `[motion-audit] core@${version} (core+lab): ${counts.hardcodedTotal} hardcoded, ` +
    `${counts.filesWithoutReducedMotion} files without reduced motion, ` +
    `${counts.transformTransitions} transform transitions -> ${path.relative(APP, OUT)}`,
);
