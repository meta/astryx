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
  const {scrollIfLocked, isLocked, isScrolledUp} = useChatStreamScroll({
    scrollRef,
  });
  const [extra, setExtra] = useState(0);
  useEffect(() => scrollIfLocked(), [extra, scrollIfLocked]);
  return (
    <main style={{paddingBlockEnd: 64}}>
      <div style={{height: 2400}}>Earlier messages</div>
      <div>Latest message</div>
      {extra > 0 && <div style={{height: extra}}>New messages</div>}
      <div style={{position: 'fixed', insetInline: 0, bottom: 0}}>
        <button type="button" onClick={() => setExtra(value => value + 400)}>
          Append messages
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
