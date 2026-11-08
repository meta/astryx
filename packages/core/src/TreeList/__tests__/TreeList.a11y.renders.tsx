// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TreeList.a11y.renders.tsx
 * @input One TreeList tree-view binding state
 * @output The React tree every lane renders for that state (the jsdom test directly, the story through Storybook)
 * @position Shared fixture for the TreeList tree-view binding
 */

import type {ReactElement} from 'react';
import {TreeList} from '../TreeList';
import type {TreeListItemData} from '../TreeListTypes';
import {
  TREE_LIST_LABEL,
  type TreeListBindingState,
} from './TreeList.a11y.states';

export function renderTreeListState(
  state: Pick<TreeListBindingState, 'expanded' | 'disabled' | 'direction'>,
): ReactElement {
  const expanded = (id: string) => state.expanded.includes(id);
  const disabled = (id: string) => state.disabled?.includes(id) ?? false;
  const items: TreeListItemData[] = [
    {
      id: 'docs',
      label: 'Documents',
      isExpanded: expanded('docs'),
      isDisabled: disabled('docs'),
      children: [
        {id: 'annual', label: 'Annual report'},
        {id: 'budget', label: 'Budget'},
      ],
    },
    {id: 'photos', label: 'Photos', isDisabled: disabled('photos')},
    {id: 'trash', label: 'Trash', isDisabled: disabled('trash')},
  ];
  return (
    <div dir={state.direction ?? 'ltr'}>
      <button type="button">Before the tree</button>
      <TreeList aria-label={TREE_LIST_LABEL} items={items} />
      <button type="button">After the tree</button>
    </div>
  );
}
