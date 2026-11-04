#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Generates a JSON bundle of @astryxdesign/core, React, StyleX, icon,
 * Recharts, and integration-package declarations for the playground's
 * Monaco editor.
 * Output: public/playground-types.json
 *
 * Structure: { "@astryxdesign/core": { "Button/index.d.ts": "...", ... } }
 *
 * Run: node scripts/generate-playground-types.mjs
 * Also runs as part of the prebuild/predev scripts.
 */

import {
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  existsSync,
  mkdirSync,
} from 'node:fs';
import {createRequire} from 'node:module';
import {join, dirname, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {getTarget} from './resolve-content-root.mjs';
import {readAdmittedIntegrationPackages} from '../src/lib/integrationTargets.mjs';

// Resolves from this script, so docsite's own dependencies are found wherever
// the installer put them. Throws if one is missing, rather than emitting a
// bundle that is quietly short a package.
const resolveFromDocsite = createRequire(import.meta.url).resolve;

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const distDir = join(root, '..', '..', 'packages', 'core', 'dist');
const outDir = join(root, 'public');

if (!existsSync(outDir)) mkdirSync(outDir, {recursive: true});

function collectDts(dir, base = dir) {
  const result = {};
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      Object.assign(result, collectDts(full, base));
    } else if (entry.endsWith('.d.ts') && !entry.endsWith('.d.ts.map')) {
      const relPath = relative(base, full);
      result[relPath] = readFileSync(full, 'utf-8');
    }
  }
  return result;
}

console.log(`Scanning ${distDir} for .d.ts files...`);

if (!existsSync(distDir)) {
  console.log(
    'dist/ not found — skipping playground types generation (run pnpm build first)',
  );
  // Write an empty placeholder so the app doesn't 404
  writeFileSync(join(outDir, 'playground-types.json'), '{}');
  process.exit(0);
}

const astryxTypes = collectDts(distDir);
const fileCount = Object.keys(astryxTypes).length;

// Also generate a minimal React types stub
const reactJsxRuntimeTypes = `
declare module 'react/jsx-runtime' {
  export namespace JSX {
    type Element = any;
    interface IntrinsicElements {
      [elemName: string]: any;
    }
    interface ElementChildrenAttribute {
      children: {};
    }
  }
  export function jsx(type: any, props: any, key?: string): JSX.Element;
  export function jsxs(type: any, props: any, key?: string): JSX.Element;
  export const Fragment: any;
}
`;

const reactTypes = `
declare module 'react' {
  export type ReactNode = any;
  export type ReactElement = any;
  export type ComponentType<P = {}> = (props: P) => ReactElement | null;
  export type FC<P = {}> = ComponentType<P>;
  export type PropsWithChildren<P = {}> = P & { children?: ReactNode };
  export type CSSProperties = Record<string, string | number>;
  export type MouseEvent<T = Element> = { target: T; currentTarget: T; preventDefault(): void; stopPropagation(): void };
  export type ChangeEvent<T = Element> = { target: T & { value: string }; currentTarget: T };
  export type FormEvent<T = Element> = { target: T; currentTarget: T; preventDefault(): void };
  export type KeyboardEvent<T = Element> = { key: string; code: string; target: T };
  export type Ref<T> = { current: T | null } | ((instance: T | null) => void) | null;
  export type RefObject<T> = { current: T | null };
  export type Dispatch<A> = (value: A) => void;
  export type SetStateAction<S> = S | ((prevState: S) => S);
  export function useState<S>(initialState: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
  export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useCallback<T extends Function>(callback: T, deps: readonly unknown[]): T;
  export function useMemo<T>(factory: () => T, deps: readonly unknown[]): T;
  export function useRef<T>(initialValue: T): RefObject<T>;
  export function useReducer<S, A>(reducer: (state: S, action: A) => S, initialState: S): [S, Dispatch<A>];
  export function useContext<T>(context: any): T;
  export function useId(): string;
  export function useTransition(): [boolean, (callback: () => void) => void];
  export function useDeferredValue<T>(value: T): T;
  export function forwardRef<T, P = {}>(render: (props: P, ref: Ref<T>) => ReactElement | null): ComponentType<P & { ref?: Ref<T> }>;
  export function memo<P>(component: ComponentType<P>): ComponentType<P>;
  export function createContext<T>(defaultValue: T): { Provider: ComponentType<{ value: T; children?: ReactNode }>; Consumer: ComponentType<{ children: (value: T) => ReactNode }> };
  export function createElement(type: any, props?: any, ...children: any[]): ReactElement;
  export function cloneElement(element: ReactElement, props?: any, ...children: any[]): ReactElement;
  export function isValidElement(object: any): boolean;
  export const Fragment: any;
  export const Suspense: ComponentType<{ fallback?: ReactNode; children?: ReactNode }>;
  export const StrictMode: ComponentType<{ children?: ReactNode }>;
  export default { createElement, Fragment, useState, useEffect, useCallback, useMemo, useRef, useReducer, useContext, useId, useTransition, useDeferredValue, forwardRef, memo, createContext, cloneElement, isValidElement, Suspense, StrictMode };
}
`;

const stylexTypes = `
declare module '@stylexjs/stylex' {
  type StyleValue = string | number | null | undefined | false;
  type NestedStyle = { [key: string]: StyleValue | NestedStyle };
  type StyleMap<T extends Record<string, NestedStyle>> = { [K in keyof T]: unknown };
  interface StyleX {
    create<T extends Record<string, NestedStyle>>(styles: T): StyleMap<T>;
    props(...styles: Array<unknown | false | null | undefined>): { className?: string; style?: Record<string, string> };
    defineVars<T extends Record<string, string>>(vars: T): T;
    keyframes(kf: Record<string, NestedStyle>): string;
    firstThatWorks<T>(...values: T[]): T;
    types: {
      angle: <T extends string>(v: T) => T;
      color: <T extends string>(v: T) => T;
      image: <T extends string>(v: T) => T;
      integer: <T extends string>(v: T) => T;
      length: <T extends string>(v: T) => T;
      lengthPercentage: <T extends string>(v: T) => T;
      number: <T extends string>(v: T) => T;
      percentage: <T extends string>(v: T) => T;
      resolution: <T extends string>(v: T) => T;
      time: <T extends string>(v: T) => T;
      url: <T extends string>(v: T) => T;
    };
  }
  const stylex: StyleX;
  export default stylex;
  export const create: StyleX['create'];
  export const props: StyleX['props'];
  export const defineVars: StyleX['defineVars'];
  export const keyframes: StyleX['keyframes'];
  export const firstThatWorks: StyleX['firstThatWorks'];
  export const types: StyleX['types'];
}
`;

// Heroicons ambient module declarations. Template and example code still
// imports icons from '@heroicons/react/{16,20,24}/{outline,solid}'. Bundling
// the package's ~10k individual .d.ts files would bloat the payload, so we
// synthesize one ambient module per variant exposing each icon as a named
// export. Icon names are read from the installed package's per-variant
// index.d.ts so the set stays accurate (e.g. 16/solid ships fewer icons).
function buildHeroiconTypes() {
  const variants = ['16/solid', '20/solid', '24/outline', '24/solid'];
  const heroRoot = dirname(resolveFromDocsite('@heroicons/react/package.json'));
  const iconType =
    'React.ComponentType<React.SVGProps<SVGSVGElement> & ' +
    '{title?: string; titleId?: string}>';
  const files = {};

  for (const variant of variants) {
    const indexPath = join(heroRoot, variant, 'index.d.ts');
    if (!existsSync(indexPath)) continue;

    const src = readFileSync(indexPath, 'utf-8');
    const names = [...src.matchAll(/export \{ default as (\w+) \}/g)].map(
      m => m[1],
    );
    if (names.length === 0) continue;

    const exports = names.map(n => `  export const ${n}: HeroIcon;`).join('\n');
    files[`${variant}.d.ts`] =
      `declare module '@heroicons/react/${variant}' {\n` +
      `  type HeroIcon = ${iconType};\n` +
      `${exports}\n}`;
  }

  return files;
}

function buildRechartsTypes() {
  const rechartsRoot = dirname(resolveFromDocsite('recharts/package.json'));
  const indexPath = join(rechartsRoot, 'types', 'index.d.ts');
  if (!existsSync(indexPath)) return {};

  const source = readFileSync(indexPath, 'utf-8');
  const names = new Set();
  for (const match of source.matchAll(/^export \{([^}]+)\} from/gm)) {
    for (const binding of match[1].split(',')) {
      const name = binding
        .trim()
        .split(/\s+as\s+/)
        .pop();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    }
  }

  return {
    'index.d.ts':
      `declare module 'recharts' {\n` +
      [...names]
        .sort()
        .map(name => `  export const ${name}: any;`)
        .join('\n') +
      '\n}',
  };
}

// Lucide ambient module. The installed package's single .d.ts is ~26k lines
// with an SVG preview per icon; bundling it whole would dwarf the rest of the
// payload. Synthesize one declaration from its export list instead, so every
// icon (and every `*Icon` alias) is a named export the editor can resolve —
// an index-signature stub does not give TypeScript any named members, which
// is how `import {Smartphone} from 'lucide-react'` came to be flagged.
function buildLucideTypes() {
  const pkgPath = resolveFromDocsite('lucide-react/package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  const source = readFileSync(
    join(dirname(pkgPath), pkg.types ?? pkg.typings),
    'utf-8',
  );

  const icons = new Set(
    [
      ...source.matchAll(
        /^declare const (\w+): react\.ForwardRefExoticComponent/gm,
      ),
    ].map(m => m[1]),
  );
  const types = new Set(
    [...source.matchAll(/^(?:type|interface) (\w+)\b/gm)].map(m => m[1]),
  );
  const exportList = source.match(/^export \{([^}]+)\}/m);
  if (!exportList) throw new Error('lucide-react: export list not found');

  const lines = [
    "declare module 'lucide-react' {",
    '  export interface LucideProps {',
    '    size?: string | number;',
    '    color?: string;',
    '    strokeWidth?: string | number;',
    '    absoluteStrokeWidth?: boolean;',
    '    className?: string;',
    '    style?: Record<string, string | number>;',
    '    [attribute: string]: unknown;',
    '  }',
    '  export type LucideIcon = (props: LucideProps) => any;',
  ];
  for (const binding of exportList[1].split(',')) {
    const [local, exported = local] = binding.trim().split(/\s+as\s+/);
    if (!exported || exported === 'LucideProps' || exported === 'LucideIcon') {
      continue;
    }
    if (icons.has(local)) {
      lines.push(`  export const ${exported}: LucideIcon;`);
    } else if (types.has(local)) {
      lines.push(`  export type ${exported} = any;`);
    } else {
      lines.push(`  export const ${exported}: any;`);
    }
  }
  lines.push('}');
  return {'index.d.ts': lines.join('\n')};
}

// Theme packages the preview scope exposes (mirrors SCOPE_THEMES in
// generate-scope.mjs). `astryx theme build` always emits exactly two exports
// from `/built`, typed against @astryxdesign/core, which the editor already
// has. Synthesize the declaration from the table rather than reading the
// package's dist: CI's docsite-test job builds core but not the theme
// packages, so their dist does not exist when this script runs there.
const SCOPE_THEMES = [
  {pkg: '@astryxdesign/theme-neutral', name: 'neutralTheme'},
  {pkg: '@astryxdesign/theme-matcha', name: 'matchaTheme'},
];

function buildThemeTypes() {
  const files = {};
  for (const {pkg, name} of SCOPE_THEMES) {
    const registry = name.replace(/Theme$/, 'IconRegistry');
    files[pkg] = {
      'index.d.ts':
        `declare module '${pkg}/built' {\n` +
        `  import type {DefinedTheme} from '@astryxdesign/core/theme';\n` +
        `  import type {IconRegistry} from '@astryxdesign/core/Icon';\n` +
        `  export const ${name}: DefinedTheme;\n` +
        `  export const ${registry}: IconRegistry;\n` +
        `}\n` +
        `declare module '${pkg}' {\n  export * from '${pkg}/built';\n}`,
    };
  }
  return files;
}

// Integration packages the preview scope exposes: the list generate-data.mjs
// admitted for this target (every configured integration on canary; on latest
// the ones that are stable releases), the same list generate-scope.mjs maps.
// Declared as shorthand ambient modules: imports resolve, typed as `any`, so
// the editor shows no unresolved-module error on code that renders. Like the
// theme packages, their dist is not built in CI's docsite-test job, so real
// declarations are left for a follow-up.
function buildIntegrationTypes() {
  const files = {};
  for (const pkg of readAdmittedIntegrationPackages(
    join(root, 'src/generated'),
    getTarget(),
  )) {
    files[pkg] = {'index.d.ts': `declare module '${pkg}';\n`};
  }
  return files;
}

// Runtime-only aliases the scope also serves: `next/image` renders a plain
// <img>, and bare `stylex` is the same object as `@stylexjs/stylex`.
const nextImageTypes = `
declare module 'next/image' {
  const Image: (props: Record<string, unknown>) => any;
  export default Image;
}
`;

const stylexAliasTypes = `
declare module 'stylex' {
  export * from '@stylexjs/stylex';
  export {default} from '@stylexjs/stylex';
}
`;

const heroiconTypes = buildHeroiconTypes();
const rechartsTypes = buildRechartsTypes();
const lucideTypes = buildLucideTypes();
const themeTypes = buildThemeTypes();
const integrationTypes = buildIntegrationTypes();
console.log(
  `Generated Lucide types: ${(lucideTypes['index.d.ts'].match(/: LucideIcon;/g) ?? []).length} icon exports`,
);
console.log(
  `Generated theme types: ${Object.keys(themeTypes).length} packages`,
);
console.log(
  `Generated integration types: ${Object.keys(integrationTypes).length} packages`,
);
console.log(
  `Generated heroicon types: ${Object.keys(heroiconTypes).length} variants`,
);
console.log(
  `Generated Recharts types: ${Object.keys(rechartsTypes).length} declaration file`,
);

const output = {
  '@astryxdesign/core': astryxTypes,
  react: {'index.d.ts': reactTypes, 'jsx-runtime.d.ts': reactJsxRuntimeTypes},
  '@stylexjs/stylex': {'index.d.ts': stylexTypes},
  stylex: {'index.d.ts': stylexAliasTypes},
  '@heroicons/react': heroiconTypes,
  recharts: rechartsTypes,
  'lucide-react': lucideTypes,
  'next/image': {'index.d.ts': nextImageTypes},
  ...themeTypes,
  ...integrationTypes,
};

const json = JSON.stringify(output);
writeFileSync(join(outDir, 'playground-types.json'), json);
console.log(
  `Generated playground-types.json: ${fileCount} Astryx type files, ${(json.length / 1024).toFixed(0)}KB`,
);
