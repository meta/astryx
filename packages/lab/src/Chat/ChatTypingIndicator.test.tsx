// Copyright (c) Meta Platforms, Inc. and affiliates.

import {StrictMode} from 'react';
import {beforeEach, describe, it, expect, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import {ChatTypingIndicator} from './ChatTypingIndicator';
import {InternationalizationProvider} from '@astryxdesign/core/i18n';

const announce = vi.fn();
vi.mock('@astryxdesign/core/hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('@astryxdesign/core/hooks')>()),
  useAnnounce: () => announce,
}));

beforeEach(() => {
  announce.mockClear();
});

describe('ChatTypingIndicator', () => {
  it('renders "X is typing…" for one name', () => {
    render(<ChatTypingIndicator names={['Ana']} />);
    expect(screen.getByText('Ana is typing…')).toBeTruthy();
  });

  it('renders both names for two people', () => {
    render(<ChatTypingIndicator names={['Ana', 'Ben']} />);
    expect(screen.getByText('Ana and Ben are typing…')).toBeTruthy();
  });

  it('collapses three or more names to "and N others"', () => {
    render(<ChatTypingIndicator names={['Ana', 'Ben', 'Casey']} />);
    expect(screen.getByText('Ana and 2 others are typing…')).toBeTruthy();
  });

  it('localizes the one-name sentence through the i18n catalog', () => {
    render(
      <InternationalizationProvider
        locale="fr"
        overrides={{
          fr: {
            '@astryx.chatTypingIndicator.one': '{name} est en train d’écrire…',
          },
        }}>
        <ChatTypingIndicator names={['Ana']} />
      </InternationalizationProvider>,
    );
    expect(screen.getByText('Ana est en train d’écrire…')).toBeTruthy();
  });

  it('joins two names with the locale list format', () => {
    render(
      <InternationalizationProvider
        locale="fr"
        overrides={{
          fr: {'@astryx.chatTypingIndicator.many': '{names} écrivent…'},
        }}>
        <ChatTypingIndicator names={['Ana', 'Ben']} />
      </InternationalizationProvider>,
    );
    // Intl.ListFormat('fr') joins with "et", not the English "and".
    expect(screen.getByText('Ana et Ben écrivent…')).toBeTruthy();
  });

  it('localizes the collapsed overflow sentence', () => {
    render(
      <InternationalizationProvider
        locale="fr"
        overrides={{
          fr: {
            '@astryx.chatTypingIndicator.others': '{count, number} autres',
            '@astryx.chatTypingIndicator.many': '{names} écrivent…',
          },
        }}>
        <ChatTypingIndicator names={['Ana', 'Ben', 'Casey']} />
      </InternationalizationProvider>,
    );
    expect(screen.getByText('Ana et 2 autres écrivent…')).toBeTruthy();
  });

  it('renders dots only when names is empty', () => {
    render(<ChatTypingIndicator names={[]} data-testid="typing" />);
    const root = screen.getByTestId('typing');
    expect(root.textContent).toBe('');
    expect(root.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });

  it('renders dots only when names is omitted', () => {
    render(<ChatTypingIndicator data-testid="typing" />);
    expect(screen.getByTestId('typing').textContent).toBe('');
  });

  it('applies the stable class name', () => {
    render(<ChatTypingIndicator names={['Ana']} data-testid="typing" />);
    expect(screen.getByTestId('typing').className).toContain(
      'astryx-chat-typing-indicator',
    );
  });

  describe('status announcement (spec:AST-086)', () => {
    it('mounts with its label but carries no live role (FR2)', () => {
      const {container} = render(<ChatTypingIndicator names={['Ana']} />);
      const root = container.firstElementChild as HTMLElement;
      expect(root).toHaveTextContent('Ana is typing…');
      expect(root).not.toHaveAttribute('role');
      expect(root).not.toHaveAttribute('aria-live');
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('announces a mounted label once through the polite channel, even under StrictMode (FR2, FR6)', () => {
      const {rerender} = render(
        <StrictMode>
          <ChatTypingIndicator names={['Ana']} />
        </StrictMode>,
      );
      rerender(
        <StrictMode>
          <ChatTypingIndicator names={['Ana']} />
        </StrictMode>,
      );
      expect(announce.mock.calls).toEqual([['Ana is typing…', 'polite']]);
    });

    it('announces each new label, nothing on clear, and the same people again as a new occasion (FR6)', () => {
      const {rerender} = render(<ChatTypingIndicator names={[]} />);
      expect(announce).not.toHaveBeenCalled();
      rerender(<ChatTypingIndicator names={['Ana']} />);
      rerender(<ChatTypingIndicator names={['Ana', 'Ben']} />);
      rerender(<ChatTypingIndicator names={[]} />);
      rerender(<ChatTypingIndicator names={['Ana', 'Ben']} />);
      expect(announce.mock.calls).toEqual([
        ['Ana is typing…', 'polite'],
        ['Ana and Ben are typing…', 'polite'],
        ['Ana and Ben are typing…', 'polite'],
      ]);
    });

    it('leaves delivery to an enclosing chat log (FR4)', () => {
      const {rerender} = render(
        <div role="log">
          <ChatTypingIndicator names={['Ana']} />
        </div>,
      );
      rerender(
        <div role="log">
          <ChatTypingIndicator names={['Ana', 'Ben']} />
        </div>,
      );
      expect(announce).not.toHaveBeenCalled();
      expect(screen.queryByRole('status')).toBeNull();
    });
  });
});
