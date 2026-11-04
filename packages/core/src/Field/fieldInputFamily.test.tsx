// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, vi, afterEach} from 'vitest';
import {readdirSync, readFileSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {renderHook} from '@testing-library/react';
import type {ReactNode} from 'react';
import {useFieldInputStyling, type FieldInputBaseProps} from './fieldParts';
import {expectFieldInputProps} from './fieldInputFamily.testing';
import {FormLayoutContext} from '../FormLayout/FormLayoutContext';
import {InputGroupContext} from '../InputGroup/InputGroupContext';

const SRC = join(__dirname, '..');

// Directories that render <Field> without being a Field-composed input.
const NOT_FIELD_INPUTS = new Set(['Field', 'InputGroup', 'FormLayout']);

// Field-composed inputs not yet converted to FR10. Every member is converted;
// typed explicitly so the empty set still accepts string lookups.
const PENDING_FR10: ReadonlySet<string> = new Set<string>();

function fieldComposedComponents(): string[] {
  return readdirSync(SRC)
    .filter(name => statSync(join(SRC, name)).isDirectory())
    .filter(name => !NOT_FIELD_INPUTS.has(name))
    .filter(dir =>
      readdirSync(join(SRC, dir)).some(
        file =>
          file.endsWith('.tsx') &&
          !/\.(test|stories)\.tsx$/.test(file) &&
          /<Field[\s>]/.test(readFileSync(join(SRC, dir, file), 'utf8')),
      ),
    )
    .sort();
}

function hasFamilyTypeCheck(dir: string): boolean {
  return readdirSync(join(SRC, dir)).some(
    file =>
      /\.test\.tsx?$/.test(file) &&
      readFileSync(join(SRC, dir, file), 'utf8').includes(
        'expectFieldInputProps<',
      ),
  );
}

describe('family:input-fields FR10 coverage', () => {
  it('every Field-composed component type-checks its props, or is pending', () => {
    const unchecked = fieldComposedComponents().filter(
      dir => !PENDING_FR10.has(dir) && !hasFamilyTypeCheck(dir),
    );
    expect(unchecked).toEqual([]);
  });

  it('no pending component already carries the check', () => {
    const stale = [...PENDING_FR10].filter(hasFamilyTypeCheck);
    expect(stale).toEqual([]);
  });

  it('rejects root styling at the type level', () => {
    expectFieldInputProps<FieldInputBaseProps>();
    // @ts-expect-error -- BaseProps accepts root xstyle/className/style
    expectFieldInputProps<{xstyle?: unknown} & FieldInputBaseProps>();
  });
});

describe('useFieldInputStyling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const GROUP_CONTEXT = {isInGroup: true as const, labelID: 'group-label'};
  const HORIZONTAL_LABELS_CONTEXT = {direction: 'horizontal-labels' as const};

  function wrapper(kind: 'plain' | 'group' | 'horizontal-labels') {
    return function Wrapper({children}: {children: ReactNode}) {
      if (kind === 'group') {
        return (
          <InputGroupContext value={GROUP_CONTEXT}>
            {children}
          </InputGroupContext>
        );
      }
      if (kind === 'horizontal-labels') {
        return (
          <FormLayoutContext value={HORIZONTAL_LABELS_CONTEXT}>
            {children}
          </FormLayoutContext>
        );
      }
      return <>{children}</>;
    };
  }

  it('forwards container styling to Field when a Field box renders', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const {result} = renderHook(
      () =>
        useFieldInputStyling(
          'TextInput',
          {'data-testid': 'x'},
          {
            containerClassName: 'outer',
            containerStyle: {margin: 4},
          },
        ),
      {wrapper: wrapper('plain')},
    );
    expect(result.current.hasFieldBox).toBe(true);
    expect(result.current.container).toEqual({
      xstyle: undefined,
      className: 'outer',
      style: {margin: 4},
    });
    expect(result.current.rest).toEqual({'data-testid': 'x'});
    expect(warn).not.toHaveBeenCalled();
  });

  it.each(['group', 'horizontal-labels'] as const)(
    'drops container styling and warns when no Field box renders (%s)',
    kind => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const {result} = renderHook(
        () =>
          useFieldInputStyling('TextInput', {}, {containerClassName: 'outer'}),
        {wrapper: wrapper(kind)},
      );
      expect(result.current.hasFieldBox).toBe(false);
      expect(result.current.container).toEqual({});
      expect(warn).toHaveBeenCalledOnce();
      expect(String(warn.mock.calls[0][0])).toContain('no Field box renders');
    },
  );

  it('does not warn when no container styling is passed outside a Field box', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderHook(() => useFieldInputStyling('TextInput', {}, {}), {
      wrapper: wrapper('group'),
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('strips untyped root styling and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const untyped = {
      className: 'legacy',
      style: {color: 'red'},
      'aria-label': 'Name',
    };
    const {result, rerender} = renderHook(
      () => useFieldInputStyling('TextInput', untyped, {}),
      {wrapper: wrapper('plain')},
    );
    rerender();
    expect(result.current.rest).toEqual({'aria-label': 'Name'});
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0][0])).toContain('TextInput:');
    expect(String(warn.mock.calls[0][0])).toContain('controlXstyle');
  });
});
