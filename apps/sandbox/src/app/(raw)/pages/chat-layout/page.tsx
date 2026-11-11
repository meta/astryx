// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input `?case=`: long (the default), composer, streaming or docked. cases.ts
 *   names what each shows and what scrolls its transcript.
 * @output A full page ChatLayout with no sandbox chrome, for phone checks of
 *   its keyboard, touch and scroll behavior.
 * @position Raw page. In long, composer and streaming the document scrolls and
 *   the dock is fixed to the viewport. In docked, ChatLayout scrolls itself
 *   inside a fixed-height panel, with the dock at the panel's bottom.
 */

import {Suspense} from 'react';
import {useSearchParams} from 'react-router-dom';
import {ChatLayoutCaseView} from './ChatLayoutCaseView';
import {parseChatLayoutCase} from './cases';

function ChatLayoutCases() {
  const [searchParams] = useSearchParams();
  const chatCase = parseChatLayoutCase(searchParams.get('case'));
  return <ChatLayoutCaseView key={chatCase} chatCase={chatCase} />;
}

export default function ChatLayoutPage() {
  return (
    <Suspense>
      <ChatLayoutCases />
    </Suspense>
  );
}
