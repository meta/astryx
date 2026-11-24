// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.test.ts
 * @input The Lab SelectableCardGroup entry and the Core component
 * @output Tests that the Lab entry re-exports the Core component and its props
 * @position Testing; validates index.ts
 */

import {describe, expect, expectTypeOf, it} from 'vitest';
import {
  SelectableCardGroup as CoreSelectableCardGroup,
  type SelectableCardGroupProps as CoreSelectableCardGroupProps,
} from '@astryxdesign/core/SelectableCardGroup';
import {SelectableCardGroup, type SelectableCardGroupProps} from './index';

describe('Lab SelectableCardGroup', () => {
  it('is the Core component', () => {
    expect(SelectableCardGroup).toBe(CoreSelectableCardGroup);
  });

  it('takes the Core props', () => {
    expectTypeOf<SelectableCardGroupProps>().toEqualTypeOf<CoreSelectableCardGroupProps>();
  });
});
