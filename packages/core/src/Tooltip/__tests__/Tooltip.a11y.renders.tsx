// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Tooltip.a11y.renders.tsx
 * @input One tooltip binding state from Tooltip.a11y.states.ts
 * @output The React tree every lane renders for that state (the jsdom test directly, the story through Storybook): a page button before the trigger, the trigger and its tooltip, and a page button after it
 * @position Shared fixture for the Tooltip and useTooltip binding
 */

import {useRef, type ReactElement} from 'react';
import {Button} from '../../Button/Button';
import {isRenderable} from '../../utils/isRenderable';
import {Tooltip} from '../Tooltip';
import {useTooltip} from '../useTooltip';
import type {TooltipBindingState} from './Tooltip.a11y.states';

const HINT_ID = 'tooltip-a11y-hint';

type TriggerState = Pick<
  TooltipBindingState,
  'attachment' | 'triggerText' | 'content' | 'hint'
>;

/** A caller button the tooltip attaches to through `anchorRef`. */
function AnchorRefTrigger({state}: {state: TriggerState}): ReactElement {
  const anchorRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-describedby={state.hint == null ? undefined : HINT_ID}>
        {state.triggerText}
      </button>
      <Tooltip anchorRef={anchorRef} content={state.content} />
    </>
  );
}

/** A caller button wired by hand through `useTooltip`. */
function HookTrigger({state}: {state: TriggerState}): ReactElement {
  const tooltip = useTooltip();
  return (
    <>
      <button
        ref={tooltip.ref}
        type="button"
        aria-describedby={tooltip.describedBy}>
        {state.triggerText}
      </button>
      {tooltip.renderTooltip(state.content)}
    </>
  );
}

function Trigger({state}: {state: TriggerState}): ReactElement {
  switch (state.attachment) {
    case 'wrapped-element':
      return (
        <Tooltip content={state.content}>
          <Button label={state.triggerText} />
        </Tooltip>
      );
    case 'text':
      return <Tooltip content={state.content}>{state.triggerText}</Tooltip>;
    case 'anchor-ref':
      return <AnchorRefTrigger state={state} />;
    case 'hook':
      return <HookTrigger state={state} />;
  }
}

export function renderTooltipState(state: TriggerState): ReactElement {
  return (
    <div style={{padding: 64}}>
      <button type="button">Before the trigger</button>{' '}
      <Trigger state={state} />
      {isRenderable(state.hint) ? (
        <span id={HINT_ID}> {state.hint}</span>
      ) : null}{' '}
      <button type="button">After the trigger</button>
    </div>
  );
}
