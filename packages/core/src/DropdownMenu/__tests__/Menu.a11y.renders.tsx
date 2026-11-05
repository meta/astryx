// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Menu.a11y.renders.tsx
 * @input One menu binding state from Menu.a11y.states.ts
 * @output The React tree every lane renders for that state (the jsdom test directly, the story through Storybook), publishing how many item actions have run as `data-a11y-activations`
 * @position Shared fixture for the DropdownMenu menu-surface binding
 */

import {useState, type ReactElement} from 'react';
import {DropdownMenu} from '../DropdownMenu';
import {DropdownMenuItem} from '../DropdownMenuItem';
import {DropdownMenuCheckboxItem} from '../DropdownMenuCheckboxItem';
import {DropdownMenuRadioGroup} from '../DropdownMenuRadioGroup';
import {DropdownMenuRadioItem} from '../DropdownMenuRadioItem';
import {MENU_ACTION_ITEMS, type MenuBindingState} from './Menu.a11y.states';

function MenuState({
  content,
  label,
}: Pick<MenuBindingState, 'content' | 'label'>): ReactElement {
  // An item's action leaves no trace on the menu, so every handler counts
  // here and the count is rendered for the browser lane to read.
  const [activations, setActivations] = useState(0);
  const activate = () => setActivations(count => count + 1);
  const menu =
    content === 'actions' ? (
      <DropdownMenu
        button={{label}}
        items={MENU_ACTION_ITEMS.map(item => ({...item, onClick: activate}))}
        presentation="popover"
      />
    ) : (
      <DropdownMenu button={{label}} presentation="popover">
        <DropdownMenuItem label="Edit" onClick={activate} />
        {/* No hasCloseOnSelect: the row keeps the menu open by default. */}
        <DropdownMenuCheckboxItem
          label="Show archived"
          value={true}
          onChange={activate}
        />
        <DropdownMenuRadioGroup
          value="newest"
          onChange={activate}
          label="Sort by">
          <DropdownMenuRadioItem value="newest" label="Newest" />
          <DropdownMenuRadioItem value="oldest" label="Oldest" />
        </DropdownMenuRadioGroup>
      </DropdownMenu>
    );
  return (
    <div data-a11y-activations={activations}>
      {menu}
      <button type="button">After the menu</button>
    </div>
  );
}

export function renderMenuState(
  state: Pick<MenuBindingState, 'content' | 'label'>,
): ReactElement {
  return <MenuState content={state.content} label={state.label} />;
}
