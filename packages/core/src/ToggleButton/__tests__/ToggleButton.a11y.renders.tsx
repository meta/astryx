// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ToggleButton.a11y.renders.tsx
 * @input Uses ToggleButton, ToggleButtonGroup, and the checked state inventory
 * @output Exhaustive render functions shared by jsdom tests and Storybook stories
 * @position Keeps both evidence lanes on the same public component states.
 */

import {useState, type ReactElement} from 'react';
import {BoldIcon} from '@heroicons/react/24/outline';
import {ToggleButton} from '../ToggleButton';
import {ToggleButtonGroup} from '../ToggleButtonGroup';
import {
  TOGGLE_BUTTON_BINDING_STATES,
  type ToggleButtonBindingRow,
  type ToggleButtonBindingState,
  type ToggleButtonStateId,
} from './ToggleButton.a11y.states';

function StatefulToggle({
  state,
}: {
  state: ToggleButtonBindingRow;
}): ReactElement {
  const [pressed, setPressed] = useState(state.facts.pressed);
  const tooltip = (state as ToggleButtonBindingState).tooltip;
  const common = {
    isPressed: pressed,
    onPressedChange: setPressed,
    isDisabled: state.facts.unavailable,
    tooltip,
  };
  if (state.renderKind === 'icon-only') {
    // A drawn icon, as product callers pass: a text glyph such as "B" would be
    // a visible label the accessible name "Bold" does not contain.
    return (
      <ToggleButton {...common} label="Bold" isIconOnly icon={<BoldIcon />} />
    );
  }
  if (state.renderKind === 'composed-label') {
    return (
      <ToggleButton {...common} label="Bold formatting">
        Bold formatting
      </ToggleButton>
    );
  }
  return <ToggleButton {...common} label="Bold" />;
}

function SingleGroup({state}: {state: ToggleButtonBindingRow}): ReactElement {
  const bindingState = state as ToggleButtonBindingState;
  const [value, setValue] = useState<string | null>(
    state.facts.pressed ? 'list' : null,
  );
  return (
    <ToggleButtonGroup
      label="View"
      value={value}
      isDisabled={bindingState.groupDisabled}
      onChange={setValue}>
      <ToggleButton
        value="list"
        label="List"
        isDisabled={bindingState.memberDisabled}
      />
    </ToggleButtonGroup>
  );
}

function MultipleGroup({pressed}: {pressed: boolean}): ReactElement {
  const [value, setValue] = useState<string[]>(pressed ? ['bold'] : []);
  return (
    <ToggleButtonGroup
      type="multiple"
      label="Formatting"
      value={value}
      onChange={setValue}>
      <ToggleButton value="bold" label="Bold" />
    </ToggleButtonGroup>
  );
}

function renderState(state: ToggleButtonBindingRow): ReactElement {
  switch (state.renderKind) {
    case 'standalone':
    case 'icon-only':
    case 'composed-label':
      return <StatefulToggle state={state} />;
    case 'single-group':
      return <SingleGroup state={state} />;
    case 'multiple-group':
      return <MultipleGroup pressed={state.facts.pressed} />;
  }
}

export const TOGGLE_BUTTON_STATE_RENDERS: Readonly<
  Record<ToggleButtonStateId, () => ReactElement>
> = {
  'standalone-unpressed': () => renderStateById('standalone-unpressed'),
  'standalone-pressed': () => renderStateById('standalone-pressed'),
  'icon-only-unpressed': () => renderStateById('icon-only-unpressed'),
  'composed-label-pressed': () => renderStateById('composed-label-pressed'),
  'disabled-unpressed': () => renderStateById('disabled-unpressed'),
  'disabled-with-tooltip-pressed': () =>
    renderStateById('disabled-with-tooltip-pressed'),
  'single-group-unpressed': () => renderStateById('single-group-unpressed'),
  'single-group-pressed': () => renderStateById('single-group-pressed'),
  'single-group-member-disabled': () =>
    renderStateById('single-group-member-disabled'),
  'single-group-disabled-member-silent': () =>
    renderStateById('single-group-disabled-member-silent'),
  'multiple-group-unpressed': () => renderStateById('multiple-group-unpressed'),
  'multiple-group-pressed': () => renderStateById('multiple-group-pressed'),
};

function renderStateById(id: ToggleButtonStateId): ReactElement {
  // The inventory owns each state; this lookup keeps the render map exhaustive
  // without copying its facts into a second file.
  return renderState(requireState(id));
}

function requireState(id: ToggleButtonStateId): ToggleButtonBindingRow {
  const state = TOGGLE_BUTTON_BINDING_STATES.find(
    candidate => candidate.id === id,
  );
  if (state == null) {
    throw new Error(`unknown ToggleButton state "${id}"`);
  }
  return state;
}
