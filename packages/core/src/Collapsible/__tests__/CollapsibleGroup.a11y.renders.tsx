// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CollapsibleGroup.a11y.renders.tsx
 * @input One CollapsibleGroup accordion state from CollapsibleGroup.a11y.states.ts
 * @output The React tree every lane renders for that state (the jsdom test directly, the story through Storybook)
 * @position Shared fixture for the CollapsibleGroup accordion binding
 */

import type {ReactElement} from 'react';
import {Collapsible, CollapsibleGroup} from '../index';
import {
  COLLAPSIBLE_GROUP_ITEMS,
  type CollapsibleGroupAccordionState,
} from './CollapsibleGroup.a11y.states';

export function renderAccordionState(
  state: Pick<
    CollapsibleGroupAccordionState,
    'type' | 'defaultValue' | 'disabled'
  >,
): ReactElement {
  return (
    <div>
      <CollapsibleGroup
        type={state.type}
        defaultValue={
          state.type === 'single'
            ? state.defaultValue[0]
            : [...state.defaultValue]
        }>
        {COLLAPSIBLE_GROUP_ITEMS.map(item => (
          <Collapsible
            key={item.value}
            value={item.value}
            trigger={item.label}
            isDisabled={state.disabled?.includes(item.value)}>
            {item.label} content
          </Collapsible>
        ))}
      </CollapsibleGroup>
      <button type="button">After the group</button>
    </div>
  );
}
