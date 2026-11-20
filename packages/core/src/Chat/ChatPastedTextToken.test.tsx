// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChatPastedTextToken.test.tsx
 * @input Uses React Testing Library, ChatPastedTextToken, InternationalizationProvider
 * @output Verifies catalog-backed pasted-text counts, deterministic English
 *   fallback, and that a tap by finger or pen opens the preview and stops at
 *   the token while a mouse press goes on to the composer
 */

import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {InternationalizationProvider} from '../i18n';
import en from '../../locales/en.json';
import {__resetInteractionModalityForTest} from '../utils/interactionModality';
import {ChatPastedTextToken} from './ChatPastedTextToken';

describe('ChatPastedTextToken', () => {
  it.each([
    {text: '', label: '0 chars'},
    {text: 'a', label: '1 chars'},
    {text: 'hello', label: '5 chars'},
    {text: 'a\nb', label: '2 lines, 3 chars'},
  ])(
    'preserves the English count label for $text without a provider',
    ({text, label}) => {
      render(<ChatPastedTextToken text={text} />);
      expect(screen.getByText(label)).toBeInTheDocument();
    },
  );

  it('keeps 21 lines distinct from exactly one line in a Slavic locale', () => {
    render(
      <InternationalizationProvider
        locale="ru"
        messages={{
          ru: {
            '@astryx.chat.pastedText.label':
              en['@astryx.chat.pastedText.label'],
          },
        }}>
        <ChatPastedTextToken text={'a\n'.repeat(20) + 'a'} />
      </InternationalizationProvider>,
    );
    expect(screen.getByText('21 lines, 41 chars')).toBeInTheDocument();
  });

  it('updates both count branches when the provider changes', () => {
    const overrides = {
      fr: {
        '@astryx.chat.pastedText.label':
          '{lines, plural, =1 {{chars, plural, one {un caractère} other {{chars} caractères}}} other {{chars, plural, one {un caractère} other {{chars} caractères}} sur {lines} lignes}}',
      },
    };
    const {rerender} = render(
      <InternationalizationProvider locale="fr" overrides={overrides}>
        <ChatPastedTextToken text="hello" />
      </InternationalizationProvider>,
    );
    expect(screen.getByText('5 caractères')).toBeInTheDocument();
    rerender(
      <InternationalizationProvider locale="fr" overrides={overrides}>
        <ChatPastedTextToken text={'a\nb'} />
      </InternationalizationProvider>,
    );
    expect(screen.getByText('3 caractères sur 2 lignes')).toBeInTheDocument();
    rerender(
      <InternationalizationProvider locale="en" overrides={overrides}>
        <ChatPastedTextToken text={'a\nb'} />
      </InternationalizationProvider>,
    );
    expect(screen.getByText('2 lines, 3 chars')).toBeInTheDocument();
  });

  describe('under each pointer', () => {
    const originalShowPopover = HTMLElement.prototype.showPopover;
    const originalHidePopover = HTMLElement.prototype.hidePopover;
    const originalMatches = HTMLElement.prototype.matches;
    beforeEach(() => {
      __resetInteractionModalityForTest();
      // jsdom has no Popover API: keep the open state where the test reads it.
      HTMLElement.prototype.showPopover = function (this: HTMLElement) {
        this.setAttribute('popover-open', '');
      };
      HTMLElement.prototype.hidePopover = function (this: HTMLElement) {
        this.removeAttribute('popover-open');
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (HTMLElement.prototype as any).matches = function (
        this: HTMLElement,
        selector: string,
      ): boolean {
        return selector === ':popover-open'
          ? this.hasAttribute('popover-open')
          : originalMatches.call(this, selector);
      };
    });
    afterEach(() => {
      HTMLElement.prototype.showPopover = originalShowPopover;
      HTMLElement.prototype.hidePopover = originalHidePopover;
      HTMLElement.prototype.matches = originalMatches;
    });

    const TEXT = 'first pasted line\nsecond pasted line';

    /** The token inside an editable composer, as ChatComposerInput mounts it. */
    const renderInComposer = () =>
      render(
        <div contentEditable suppressContentEditableWarning>
          <span contentEditable={false}>
            <ChatPastedTextToken text={TEXT} />
          </span>
        </div>,
      );

    /**
     * A finger's (or a pen's) tap, in the order a browser dispatches it, with
     * the mouse press it makes of the tap. Returns whether that press kept its
     * default (moving focus and the caret into the composer).
     */
    const tap = (element: HTMLElement, pointerType = 'touch') => {
      fireEvent.pointerEnter(element, {pointerType});
      fireEvent.pointerDown(element, {pointerType});
      fireEvent.pointerUp(element, {pointerType});
      fireEvent.mouseEnter(element);
      const kept = fireEvent.mouseDown(element);
      fireEvent.mouseUp(element);
      fireEvent.click(element);
      return kept;
    };

    it.each(['touch', 'pen'])(
      'a %s tap opens the preview and keeps its press from the composer',
      async pointerType => {
        renderInComposer();
        const token = screen.getByText('2 lines, 36 chars');

        // A cancelled mouse press: the composer takes neither focus nor the
        // caret.
        expect(tap(token, pointerType)).toBe(false);
        await waitFor(() => {
          expect(
            screen.getByText('first pasted line', {exact: false}),
          ).toBeInTheDocument();
        });
      },
    );

    it('lets a mouse press go on to the composer', () => {
      renderInComposer();
      const token = screen.getByText('2 lines, 36 chars');

      fireEvent.pointerDown(token, {pointerType: 'mouse'});
      expect(fireEvent.mouseDown(token)).toBe(true);
    });
  });
});
