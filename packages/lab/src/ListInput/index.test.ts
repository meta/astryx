// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.test.ts
 * @input The Lab ListInput entry and the Core component
 * @output Tests that the Lab entry re-exports the Core component and its types
 * @position Testing; validates index.ts
 */

import {describe, expect, expectTypeOf, it} from 'vitest';
import {
  ListInput as CoreListInput,
  type ListInputChange as CoreListInputChange,
  type ListInputColumn as CoreListInputColumn,
  type ListInputProps as CoreListInputProps,
  type ListInputRenderContext as CoreListInputRenderContext,
  type ListInputValueContext as CoreListInputValueContext,
} from '@astryxdesign/core/ListInput';
import {
  ListInput,
  type ListInputChange,
  type ListInputColumn,
  type ListInputProps,
  type ListInputRenderContext,
  type ListInputValueContext,
} from './index';

type Guest = {id: string; name: string};

describe('Lab ListInput', () => {
  it('is the Core component', () => {
    expect(ListInput).toBe(CoreListInput);
  });

  it('takes the Core types', () => {
    expectTypeOf<ListInputProps<Guest>>().toEqualTypeOf<
      CoreListInputProps<Guest>
    >();
    expectTypeOf<ListInputChange<Guest>>().toEqualTypeOf<
      CoreListInputChange<Guest>
    >();
    expectTypeOf<ListInputColumn<Guest>>().toEqualTypeOf<
      CoreListInputColumn<Guest>
    >();
    expectTypeOf<ListInputRenderContext<Guest>>().toEqualTypeOf<
      CoreListInputRenderContext<Guest>
    >();
    expectTypeOf<ListInputValueContext<Guest>>().toEqualTypeOf<
      CoreListInputValueContext<Guest>
    >();
  });
});
