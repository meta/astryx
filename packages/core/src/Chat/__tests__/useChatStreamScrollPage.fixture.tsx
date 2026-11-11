// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useChatStreamScrollPage.fixture.tsx
 * @input The actual scroll hook, on a page whose document scrolls
 * @output A deterministic browser fixture for the page-scroll regression
 * @position Test-only entry, excluded from the production package build
 */

import {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {useChatStreamScroll} from '../useChatStreamScroll';

function App() {
  const scrollRef = useRef<HTMLElement>(document.documentElement);
  const {scrollIfLocked, scrollToMessage, isLocked, isScrolledUp} =
    useChatStreamScroll({scrollRef});
  const messageRef = useRef<HTMLDivElement>(null);
  const [extra, setExtra] = useState(0);
  useEffect(() => scrollIfLocked(), [extra, scrollIfLocked]);
  return (
    <main style={{paddingBlockEnd: 64}}>
      <div style={{height: 1200}}>Earlier messages</div>
      <div ref={messageRef} data-message style={{height: 1200}}>
        A message to scroll to
      </div>
      <div>Latest message</div>
      {extra > 0 && <div style={{height: extra}}>New messages</div>}
      <div style={{position: 'fixed', insetInline: 0, bottom: 0}}>
        <button type="button" onClick={() => setExtra(value => value + 400)}>
          Append messages
        </button>
        <button
          type="button"
          onClick={() => {
            if (messageRef.current) {
              scrollToMessage(messageRef.current);
            }
          }}>
          Scroll to the message
        </button>
        <output
          data-locked={String(isLocked)}
          data-scrolled-up={String(isScrolledUp)}
        />
      </div>
    </main>
  );
}

const root = document.getElementById('root');
if (!root) {
  throw new Error('Missing fixture root');
}
createRoot(root).render(<App />);
