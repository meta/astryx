// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Toolbar.a11y.renders.tsx
 * @input One toolbar binding state from Toolbar.a11y.states.ts
 * @output The React tree every lane renders for that state (the jsdom test directly, the story through Storybook): a page button before the Toolbar, the Toolbar, and a page button after it
 * @position Shared fixture for the Toolbar binding
 */

import type {ReactElement} from 'react';
import {Button} from '../../Button/Button';
import {VStack} from '../../VStack/VStack';
import {Toolbar} from '../Toolbar';
import type {ToolbarBindingState, ToolbarControl} from './Toolbar.a11y.states';

/**
 * One slot's controls. A slot lays its children out in a row, so a vertical
 * toolbar's caller stacks them, as a product toolbar would, to arrange the
 * controls on the axis the state declares.
 */
function controls(
  list: ReadonlyArray<ToolbarControl>,
  orientation: ToolbarBindingState['facts']['orientation'],
): ReactElement | undefined {
  if (list.length === 0) {
    return undefined;
  }
  const buttons = list.map(control => (
    <Button
      key={control.label}
      label={control.label}
      variant="ghost"
      isDisabled={control.isDisabled}
    />
  ));
  return orientation === 'vertical' ? (
    <VStack gap={1}>{buttons}</VStack>
  ) : (
    <>{buttons}</>
  );
}

export function renderToolbarState(
  state: Pick<
    ToolbarBindingState,
    'label' | 'startControls' | 'endControls' | 'facts'
  >,
): ReactElement {
  return (
    <div dir={state.facts.direction} style={{padding: 24, maxWidth: 640}}>
      <button type="button">Before the toolbar</button>
      <Toolbar
        label={state.label}
        orientation={state.facts.orientation}
        startContent={controls(state.startControls, state.facts.orientation)}
        endContent={controls(state.endControls, state.facts.orientation)}
      />
      <button type="button">After the toolbar</button>
    </div>
  );
}
