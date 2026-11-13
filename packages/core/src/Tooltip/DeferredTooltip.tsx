// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file DeferredTooltip.tsx
 * @input The held intent, a connector to the trigger element, the options and
 *   the text
 * @output Exports `DeferredTooltip`: the tooltip surface that
 *   `useDeferredTooltip` mounts, attached to the trigger element
 * @position Loaded with `import()` by `useDeferredTooltip` on the first
 *   intent, so a component that uses that hook carries no tooltip layer code
 *   until then.
 */

import type {ReactNode, RefCallback, RefObject} from 'react';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {useTooltip, type TooltipOptions} from './useTooltip';
import {
  TooltipPresentInterestContext,
  type TooltipPresentInterestState,
} from './tooltipPresentInterest';

/** The options a deferred tooltip takes. Each one reaches `useTooltip`. */
export type DeferredTooltipOptions = Pick<
  TooltipOptions,
  | 'placement'
  | 'alignment'
  | 'delay'
  | 'hideDelay'
  | 'focusTrigger'
  | 'touchTrigger'
>;

/** Attaches the tooltip to the trigger element and returns its detach. */
export type DeferredTooltipConnect = (
  attach: RefCallback<HTMLElement>,
) => () => void;

export interface DeferredTooltipProps {
  readonly content: ReactNode;
  readonly options: DeferredTooltipOptions;
  readonly connect: DeferredTooltipConnect;
  /** The intent made before this module loaded, until the tooltip reads it. */
  readonly interestRef: RefObject<TooltipPresentInterestState>;
}

export function DeferredTooltip({
  content,
  options,
  connect,
  interestRef,
}: DeferredTooltipProps): ReactNode {
  return (
    <TooltipPresentInterestContext value={interestRef}>
      <DeferredTooltipLayer
        content={content}
        options={options}
        connect={connect}
      />
    </TooltipPresentInterestContext>
  );
}

function DeferredTooltipLayer({
  content,
  options,
  connect,
}: {
  readonly content: ReactNode;
  readonly options: DeferredTooltipOptions;
  readonly connect: DeferredTooltipConnect;
}): ReactNode {
  const tooltip = useTooltip(options);
  // Syncs with the trigger element: the tooltip's anchor and listeners follow
  // the element that the component renders, also when that element is
  // replaced (a link Button that becomes a `<button>`).
  useIsomorphicLayoutEffect(() => connect(tooltip.ref), [connect, tooltip.ref]);
  return tooltip.renderTooltip(content);
}
