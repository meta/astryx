// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/** Shared jsdom and Storybook renderings for ChatTypingIndicator status states. */

import {useEffect, useState, type ReactElement} from 'react';
import {useAnnounce} from '@astryxdesign/core/hooks';
import {ChatTypingIndicator} from '../ChatTypingIndicator';
import type {ChatTypingStatusStateId} from './ChatTypingIndicator.a11y.states';

const transitionTestId = (name: string) => `status-transition-${name}`;

function TransitionButton({
  name,
  onClick,
}: {
  name: string;
  onClick: () => void;
}) {
  return (
    <button
      data-testid={transitionTestId(name)}
      type="button"
      onClick={onClick}>
      {name}
    </button>
  );
}

/**
 * Establishes the singleton polite channel the indicator announces through,
 * then clears the seed, so the binding inspects the pre-existing empty region.
 */
function PrimePoliteChannel() {
  const announce = useAnnounce();
  const [isReady, setIsReady] = useState(false);
  useEffect(() => {
    let secondFrame = 0;
    announce('Preparing status channel', 'polite');
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        announce('', 'polite');
        setIsReady(true);
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [announce]);
  return <span data-a11y-ready={String(isReady)} hidden />;
}

function TypingHarness() {
  const [names, setNames] = useState<string[]>([]);
  return (
    <div>
      <PrimePoliteChannel />
      <button data-a11y-relation="focus-anchor" type="button">
        Keep focus
      </button>
      <TransitionButton name="show" onClick={() => setNames(['Ana'])} />
      <TransitionButton
        name="replace"
        onClick={() => setNames(['Ana', 'Ben'])}
      />
      <TransitionButton name="clear" onClick={() => setNames([])} />
      <ChatTypingIndicator names={names} />
    </div>
  );
}

export type ChatTypingStatusStateRender = () => ReactElement;

export const CHAT_TYPING_STATUS_STATE_RENDERS: Record<
  ChatTypingStatusStateId,
  ChatTypingStatusStateRender
> = {
  'chat-typing-empty-to-message': () => <TypingHarness />,
};

export {transitionTestId};
