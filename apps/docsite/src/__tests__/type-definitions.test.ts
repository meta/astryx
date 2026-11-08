// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Prop type definition extraction tests for the docsite.
 *
 * Covers the pipeline that lets the props table surface the shape of
 * non-primitive prop types (issue #2682): lexical extraction of exported
 * `interface` / `type` declarations, the package-wide definition index, and
 * reference resolution from documented prop type strings. The logic lives in
 * src/lib/typeDefinitions.mjs (shared with scripts/generate-data.mjs), so
 * these tests exercise the same code path the build-time generator uses.
 *
 * Run: pnpm -F @astryxdesign/docsite test
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {describe, it, expect} from 'vitest';
import {
  extractTypeDeclarations,
  buildTypeDefinitionIndex,
  collectPropTypeRefs,
} from '../lib/typeDefinitions.mjs';
import {splitTypeRefSegments} from '../components/component-detail/parsePropType';
import {components} from '../generated/componentRegistry';

const CORE_SRC_DIR = path.resolve(__dirname, '../../../../packages/core/src');

describe('extractTypeDeclarations', () => {
  it('extracts an exported interface with generics and member JSDoc', () => {
    const source = [
      "import type {ReactNode} from 'react';",
      '',
      '/** Leading JSDoc is not part of the declaration. */',
      'export interface SearchSource<',
      '  T extends SearchableItem = SearchableItem,',
      '> {',
      '  /** Called on query change. Handles {braces} in comments. */',
      '  search(query: string): Promise<T[]> | T[];',
      '  cancel?(): void;',
      '}',
    ].join('\n');

    const decls = extractTypeDeclarations(source);
    expect(decls).toHaveLength(1);
    expect(decls[0].name).toBe('SearchSource');
    expect(decls[0].kind).toBe('interface');
    expect(
      decls[0].definition.startsWith('export interface SearchSource<'),
    ).toBe(true);
    expect(decls[0].definition.endsWith('}')).toBe(true);
    expect(decls[0].definition).toContain('cancel?(): void;');
    expect(decls[0].definition).not.toContain('Leading JSDoc');
  });

  it('extracts interfaces with nested object members', () => {
    const source = [
      'export interface TableColumn<T> {',
      '  key: string;',
      '  render?: (item: T) => {node: ReactNode; span: number};',
      '}',
      'const after = 1;',
    ].join('\n');

    const [decl] = extractTypeDeclarations(source);
    expect(decl.definition.endsWith('}')).toBe(true);
    expect(decl.definition).not.toContain('const after');
  });

  it('extracts a type alias ending at the first top-level semicolon', () => {
    const source = [
      'export type SpacingStep = 0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10;',
      'export type Handler = (event: {type: string}) => void;',
      "export type Status = {type: 'error' | 'warning'; message: string};",
    ].join('\n');

    const decls = extractTypeDeclarations(source);
    expect(decls.map(d => d.name)).toEqual([
      'SpacingStep',
      'Handler',
      'Status',
    ]);
    expect(decls[1].definition).toBe(
      'export type Handler = (event: {type: string}) => void;',
    );
    expect(decls[2].definition.endsWith('};')).toBe(true);
  });

  it('ignores non-exported declarations', () => {
    const source = [
      'interface Internal {a: string}',
      'type Local = string;',
      'export type Public = number;',
    ].join('\n');

    expect(extractTypeDeclarations(source).map(d => d.name)).toEqual([
      'Public',
    ]);
  });
});

describe('buildTypeDefinitionIndex', () => {
  const index = buildTypeDefinitionIndex(CORE_SRC_DIR, 'packages/core/src');

  it('indexes exported core types with repo-relative source paths', () => {
    const searchSource = index.get('SearchSource');
    expect(searchSource).toBeDefined();
    expect(searchSource!.sourcePath).toBe(
      'packages/core/src/Typeahead/types.ts',
    );
    expect(searchSource!.definition).toContain(
      'export interface SearchSource<',
    );
    expect(searchSource!.definition).toContain('bootstrap()');
  });

  it('skips shape-less compat aliases like `StyleXStyles = any`', () => {
    expect(index.has('StyleXStyles')).toBe(false);
  });
});

describe('collectPropTypeRefs', () => {
  const index = new Map(
    ['SearchSource', 'TableColumn', 'XDSButtonProps'].map(name => [
      name,
      {name, definition: `export interface ${name} {}`, sourcePath: 'x.ts'},
    ]),
  );

  it('resolves referenced names against the index, deduplicated', () => {
    expect(
      collectPropTypeRefs('SearchSource<T> | SearchSource<U>', index),
    ).toEqual(['SearchSource']);
    expect(collectPropTypeRefs('TableColumn<T>[]', index)).toEqual([
      'TableColumn',
    ]);
  });

  it('ignores unknown names and generic parameters', () => {
    expect(collectPropTypeRefs('RefObject<HTMLElement | null>', index)).toEqual(
      [],
    );
    expect(collectPropTypeRefs('T | null', index)).toEqual([]);
  });

  it('excludes *Props interfaces — they are documented on their own pages', () => {
    expect(collectPropTypeRefs('ReactElement<XDSButtonProps>', index)).toEqual(
      [],
    );
  });
});

describe('splitTypeRefSegments', () => {
  it('turns each resolved name into a ref segment, keeping syntax as text', () => {
    expect(
      splitTypeRefSegments('SearchSource<T> | null', ['SearchSource']),
    ).toEqual([
      {text: 'SearchSource', isRef: true},
      {text: '<T> | null', isRef: false},
    ]);
  });

  it('marks every occurrence of every resolved name independently', () => {
    expect(
      splitTypeRefSegments('TableColumn<T>[] | SearchSource<T>', [
        'TableColumn',
        'SearchSource',
      ]),
    ).toEqual([
      {text: 'TableColumn', isRef: true},
      {text: '<T>[] | ', isRef: false},
      {text: 'SearchSource', isRef: true},
      {text: '<T>', isRef: false},
    ]);
  });

  it('matches on word boundaries so longer names are not split', () => {
    expect(splitTypeRefSegments('TableColumnGroup', ['TableColumn'])).toEqual([
      {text: 'TableColumnGroup', isRef: false},
    ]);
  });

  it('returns the whole string as plain text when nothing resolves', () => {
    expect(splitTypeRefSegments('string | number', [])).toEqual([
      {text: 'string | number', isRef: false},
    ]);
  });
});

describe('type definition trigger', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../components/component-detail/TypeRefText.tsx'),
    'utf8',
  );

  it('renders the type name itself as the definition trigger', () => {
    expect(source).toContain('splitTypeRefSegments');
    expect(source).toMatch(/<button\s+type="button"[^>]*>\s*\{def\.name\}/);
  });

  it('no longer renders a separate "View {Type}" button', () => {
    expect(source).not.toContain('View ${def.name}');
  });
});

describe('generated registry', () => {
  const allEntries = Object.values(components).flat();

  it('attaches typeRefs and matching typeDefs to a hook return field', () => {
    const entry = allEntries.find(e => e.name === 'useToast');
    expect(entry).toBeDefined();
    const showToast = entry!.returns?.find(r => r.name === 'showToast');
    expect(showToast?.typeRefs).toEqual(['ToastOptions']);
    const def = entry!.typeDefs.find(d => d.name === 'ToastOptions');
    expect(def?.definition).toContain('export interface ToastOptions');
  });

  it('attaches typeRefs and matching typeDefs to BaseTypeahead', () => {
    const entry = allEntries.find(e => e.name === 'BaseTypeahead');
    expect(entry).toBeDefined();
    const searchSource = entry!.props.find(p => p.name === 'searchSource');
    expect(searchSource?.typeRefs).toEqual(['SearchSource']);
    const def = entry!.typeDefs.find(d => d.name === 'SearchSource');
    expect(def?.definition).toContain('export interface SearchSource<');
  });

  it('only records typeDefs that some documented row references', () => {
    for (const entry of allEntries) {
      const referenced = new Set(
        [
          ...entry.props,
          ...(entry.params ?? []),
          ...(entry.returns ?? []),
        ].flatMap(row => row.typeRefs ?? []),
      );
      expect(entry.typeDefs.map(d => d.name).sort()).toEqual(
        [...referenced].sort(),
      );
    }
  });
});
