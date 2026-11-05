// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MenuButton.a11y.renders.tsx
 * @input One menu-button binding state from MenuButton.a11y.states.ts
 * @output The React tree every lane renders for that state (the jsdom test directly, the story through Storybook)
 * @position Shared fixture for the DropdownMenu and MoreMenu menu-button binding
 */

import type {ReactElement} from 'react';
import {DropdownMenu} from '../DropdownMenu';
import {MoreMenu} from '../../MoreMenu';
import {
  MENU_BUTTON_ITEMS,
  type MenuButtonBindingState,
} from './MenuButton.a11y.states';

const items = MENU_BUTTON_ITEMS.map(item => ({...item}));

export function renderMenuButtonState(
  state: Pick<
    MenuButtonBindingState,
    'component' | 'label' | 'open' | 'disabled'
  >,
): ReactElement {
  let menu: ReactElement;
  switch (state.component) {
    case 'MoreMenu':
      menu = (
        <MoreMenu
          label={state.label}
          items={items}
          presentation="popover"
          isDisabled={state.disabled}
        />
      );
      break;
    case 'DropdownMenu.renderTrigger':
      menu = (
        <DropdownMenu
          items={items}
          presentation="popover"
          renderTrigger={({ref, ...props}) => (
            <button type="button" ref={ref} {...props}>
              {state.label}
            </button>
          )}
        />
      );
      break;
    case 'DropdownMenu':
      menu = (
        <DropdownMenu
          button={{label: state.label, isDisabled: state.disabled}}
          items={items}
          presentation="popover"
          {...(state.open ? {isMenuOpen: true, onOpenChange: () => {}} : {})}
        />
      );
  }
  return (
    <div>
      {menu}
      <button type="button">After the menu</button>
    </div>
  );
}
