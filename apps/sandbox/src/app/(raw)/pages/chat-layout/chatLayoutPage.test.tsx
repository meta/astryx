// Copyright (c) Meta Platforms, Inc. and affiliates.

import {renderToString} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';
import {describe, expect, it} from 'vitest';
import ChatLayoutPage from './page';
import {
  CHAT_LAYOUT_CASES,
  CHAT_LAYOUT_CASE_INFO,
  parseChatLayoutCase,
} from './cases';

function renderPage(search: string): string {
  return renderToString(
    <MemoryRouter initialEntries={[`/pages/chat-layout/${search}`]}>
      <ChatLayoutPage />
    </MemoryRouter>,
  );
}

describe('Chat Layout page', () => {
  it('reads each case from ?case=, and opens on the long case otherwise', () => {
    for (const chatCase of CHAT_LAYOUT_CASES) {
      expect(parseChatLayoutCase(chatCase)).toBe(chatCase);
    }
    expect(parseChatLayoutCase(null)).toBe('long');
    expect(parseChatLayoutCase('unknown')).toBe('long');
  });

  it.each(CHAT_LAYOUT_CASES)(
    'renders the %s case: its label, the transcript and the composer',
    chatCase => {
      const html = renderPage(`?case=${chatCase}`);

      expect(html).toContain(CHAT_LAYOUT_CASE_INFO[chatCase].label);
      expect(html).toContain(
        'Can you help me plan a weekend trip to the coast?',
      );
      expect(html).toContain('aria-label="Message input"');
      expect(html).toContain('aria-label="Send"');
    },
  );

  it('renders the long case when the URL names no case', () => {
    expect(renderPage('')).toContain(CHAT_LAYOUT_CASE_INFO.long.label);
  });

  it('shows the composer actions in the composer case only', () => {
    expect(renderPage('?case=composer')).toContain('aria-label="Attach"');
    expect(renderPage('?case=long')).not.toContain('aria-label="Attach"');
  });

  it('renders the docked case inside a fixed-height panel, and the others as the page itself', () => {
    // A document-scroll case renders ChatLayout's root as the page's first
    // element. The docked case renders the panel's stack around a Card.
    for (const chatCase of CHAT_LAYOUT_CASES) {
      const html = renderPage(`?case=${chatCase}`);
      const isPanel = CHAT_LAYOUT_CASE_INFO[chatCase].scroll === 'panel';

      expect(/^<!--\$--><div class="(astryx-[\w-]+)/.exec(html)?.[1]).toBe(
        isPanel ? 'astryx-stack' : 'astryx-chat-layout',
      );
      expect(html.includes('astryx-card')).toBe(isPanel);
    }
  });
});
