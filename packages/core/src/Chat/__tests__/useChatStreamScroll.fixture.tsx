// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useChatStreamScroll.fixture.tsx
 * @input The actual scroll hook and native browser layout/input
 * @output A deterministic browser fixture for the scroll regression
 * @position Test-only entry, excluded from the production package build
 */

import {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {useChatStreamScroll} from '../useChatStreamScroll';

function App() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const {scrollIfLocked, scrollToBottom, isLocked} = useChatStreamScroll({
    scrollRef,
  });
  const [extra, setExtra] = useState(0);
  const [height, setHeight] = useState(384);
  useEffect(() => scrollIfLocked(), [extra, height, scrollIfLocked]);
  return (
    <>
      <div
        ref={scrollRef}
        role="region"
        aria-label="Conversation"
        tabIndex={0}
        style={{height, width: 414, overflow: 'auto', border: '1px solid'}}>
        <div style={{height: 1800}}>Earlier messages</div>
        <div style={{marginBlock: '1em'}}>Latest message</div>
        {extra > 0 && <div style={{height: extra}}>New messages</div>}
      </div>
      <button type="button" onClick={() => scrollToBottom()}>
        Scroll to bottom
      </button>
      <button
        type="button"
        onClick={() => scrollToBottom({behavior: 'instant'})}>
        Jump instantly
      </button>
      <button type="button" onClick={() => setExtra(value => value + 400)}>
        Append messages
      </button>
      <button
        type="button"
        onClick={() => setHeight(value => (value === 384 ? 160 : 384))}>
        Resize viewport
      </button>
      <output data-locked={String(isLocked)} />
    </>
  );
}

const root = document.getElementById('root');
if (!root) {
  throw new Error('Missing fixture root');
}
createRoot(root).render(<App />);
