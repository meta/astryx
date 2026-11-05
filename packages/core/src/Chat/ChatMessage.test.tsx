// Copyright (c) Meta Platforms, Inc. and affiliates.

import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import * as path from 'node:path';
import {transformSync} from '@babel/core';
import stylexBabelPlugin from '@stylexjs/babel-plugin';
import {createElement, createRef, Fragment, type ReactNode} from 'react';
import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import {ChatMessage} from './ChatMessage';
import {ChatMessageBubble} from './ChatMessageBubble';
import {ChatMessageList} from './ChatMessageList';

// Content that renders nothing but is not a skipped scalar: its wrapper
// renders and collapses through CSS instead of the content being inspected.
const contentThatRendersNothing: [string, () => ReactNode][] = [
  ['an empty array', () => []],
  ['an array of non-rendering values', () => [null, false, '']],
  ['an empty Fragment', () => createElement(Fragment)],
  ['a component that returns null', () => <RendersNothing />],
];

function RendersNothing() {
  return null;
}

function OpaqueName() {
  return <span>Navi</span>;
}

/** The name wrapper the article's aria-labelledby points at. */
function labelTarget(article: HTMLElement): HTMLElement | null {
  const id = article.getAttribute('aria-labelledby');
  return id == null ? null : article.ownerDocument.getElementById(id);
}

describe('ChatMessage', () => {
  it('renders children', () => {
    render(
      <ChatMessage sender="assistant">
        <ChatMessageBubble>Hello world</ChatMessageBubble>
      </ChatMessage>,
    );
    expect(screen.getByText('Hello world')).toBeTruthy();
  });

  it('renders sender name', () => {
    render(
      <ChatMessage sender="assistant" name="Navi">
        <ChatMessageBubble>Hi</ChatMessageBubble>
      </ChatMessage>,
    );
    expect(screen.getByText('Navi')).toBeTruthy();
  });

  it('hides name for system sender', () => {
    render(
      <ChatMessage sender="system" name="System">
        <span>Notice</span>
      </ChatMessage>,
    );
    expect(screen.queryByText('System')).toBeNull();
  });

  it.each([false, true, ''])('does not render a name wrapper for %j', name => {
    render(
      <ChatMessage sender="assistant" name={name}>
        <span>Summary</span>
      </ChatMessage>,
    );
    const article = screen.getByRole('article');
    expect(article).toHaveAccessibleName('Message from assistant');
    expect(article).not.toHaveAttribute('aria-labelledby');
    expect(article.querySelector('div:empty')).toBeNull();
  });

  it('preserves a numeric name', () => {
    render(
      <ChatMessage sender="assistant" name={0}>
        <span>Summary</span>
      </ChatMessage>,
    );
    expect(screen.getByRole('article')).toHaveAccessibleName('0');
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it.each(contentThatRendersNothing)(
    'collapses the name wrapper and keeps the fallback label for %s',
    (_label, createName) => {
      render(
        <ChatMessage sender="assistant" name={createName()}>
          <span>Summary</span>
        </ChatMessage>,
      );
      const article = screen.getByRole('article');
      const target = labelTarget(article);
      // The label reference resolves to no text, so the accessible name falls
      // back to aria-label; real Chromium computes "Message from assistant".
      expect(target).not.toBeNull();
      expect(target).toBeEmptyDOMElement();
      expect(getComputedStyle(target as HTMLElement).display).toBe('none');
      expect(article).toHaveAttribute('aria-label', 'Message from assistant');
    },
  );

  it('labels the article by a name that renders text', () => {
    render(
      <ChatMessage sender="assistant" name={<OpaqueName />}>
        <span>Summary</span>
      </ChatMessage>,
    );
    const article = screen.getByRole('article');
    expect(article).toHaveAccessibleName('Navi');
    expect(
      getComputedStyle(labelTarget(article) as HTMLElement).display,
    ).not.toBe('none');
  });

  it('renders avatar for assistant', () => {
    render(
      <ChatMessage
        sender="assistant"
        avatar={<div data-testid="avatar">A</div>}>
        <ChatMessageBubble>Hi</ChatMessageBubble>
      </ChatMessage>,
    );
    expect(screen.getByTestId('avatar')).toBeTruthy();
  });

  it('hides avatar for system', () => {
    render(
      <ChatMessage sender="system" avatar={<div data-testid="avatar">S</div>}>
        <span>Notice</span>
      </ChatMessage>,
    );
    expect(screen.queryByTestId('avatar')).toBeNull();
  });

  it.each([false, true, ''])(
    'does not render an avatar wrapper for %j',
    avatar => {
      render(
        <ChatMessage sender="assistant" avatar={avatar}>
          <span>Summary</span>
        </ChatMessage>,
      );
      expect(screen.getByRole('article').querySelector('div:empty')).toBeNull();
    },
  );

  it('preserves a numeric avatar', () => {
    render(
      <ChatMessage sender="assistant" avatar={0}>
        <span>Summary</span>
      </ChatMessage>,
    );
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it.each(contentThatRendersNothing)(
    'collapses the avatar wrapper for %s',
    (_label, createAvatar) => {
      render(
        <ChatMessage sender="assistant" avatar={createAvatar()}>
          <span>Summary</span>
        </ChatMessage>,
      );
      const wrapper = screen.getByRole('article').firstElementChild;
      expect(wrapper).toBeEmptyDOMElement();
      expect(getComputedStyle(wrapper as HTMLElement).display).toBe('none');
    },
  );

  it('keeps an avatar wrapper that renders content visible', () => {
    render(
      <ChatMessage
        sender="assistant"
        avatar={<span data-testid="avatar">N</span>}>
        <span>Summary</span>
      </ChatMessage>,
    );
    const wrapper = screen.getByTestId('avatar').parentElement;
    expect(getComputedStyle(wrapper as HTMLElement).display).not.toBe('none');
  });

  it('applies sender class', () => {
    render(
      <ChatMessage sender="user" data-testid="msg">
        <ChatMessageBubble>Hi</ChatMessageBubble>
      </ChatMessage>,
    );
    const el = screen.getByTestId('msg');
    expect(el).toHaveAttribute('data-sender', 'user');
  });

  it('sets accessible aria-labelledby with name', () => {
    render(
      <ChatMessage sender="assistant" name="Navi" data-testid="msg">
        <ChatMessageBubble>Hi</ChatMessageBubble>
      </ChatMessage>,
    );
    const el = screen.getByTestId('msg');
    const labelId = el.getAttribute('aria-labelledby');
    expect(labelId).toBeTruthy();
    expect(el.querySelector(`#${CSS.escape(labelId!)}`)?.textContent).toBe(
      'Navi',
    );
  });

  it('sets accessible aria-label without name', () => {
    render(
      <ChatMessage sender="user" data-testid="msg">
        <ChatMessageBubble>Hi</ChatMessageBubble>
      </ChatMessage>,
    );
    const el = screen.getByTestId('msg');
    expect(el.getAttribute('aria-label')).toBe('Message from user');
  });

  it('renders non-bubble children', () => {
    render(
      <ChatMessage sender="assistant">
        <div data-testid="custom-content">Custom widget</div>
      </ChatMessage>,
    );
    expect(screen.getByTestId('custom-content')).toBeTruthy();
  });

  it('renders metadata for a non-system sender', () => {
    render(
      <ChatMessage sender="assistant" metadata={<span>Updated just now</span>}>
        <span>Summary</span>
      </ChatMessage>,
    );
    expect(screen.getByText('Updated just now')).toBeInTheDocument();
  });

  it('hides metadata for a system sender', () => {
    render(
      <ChatMessage sender="system" metadata={<span>Hidden metadata</span>}>
        <span>Maintenance complete</span>
      </ChatMessage>,
    );
    expect(screen.queryByText('Hidden metadata')).not.toBeInTheDocument();
  });

  it.each([false, true, ''])(
    'does not render an empty metadata wrapper for %j',
    metadata => {
      render(
        <ChatMessage sender="assistant" metadata={metadata}>
          <span>Summary</span>
        </ChatMessage>,
      );
      expect(screen.getByRole('article').querySelector('div:empty')).toBeNull();
    },
  );

  it('preserves numeric metadata', () => {
    render(
      <ChatMessage sender="assistant" metadata={0}>
        <span>Summary</span>
      </ChatMessage>,
    );
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it.each(contentThatRendersNothing)(
    'collapses the metadata wrapper for %s',
    (_label, createMetadata) => {
      render(
        <ChatMessage sender="assistant" metadata={createMetadata()}>
          <span>Summary</span>
        </ChatMessage>,
      );
      const column = screen.getByText('Summary').parentElement?.parentElement;
      const wrapper = column?.lastElementChild;
      expect(wrapper).toBeEmptyDOMElement();
      expect(getComputedStyle(wrapper as HTMLElement).display).toBe('none');
    },
  );

  it('keeps metadata that renders content visible', () => {
    render(
      <ChatMessage sender="assistant" metadata={<span>Updated</span>}>
        <span>Summary</span>
      </ChatMessage>,
    );
    const wrapper = screen.getByText('Updated').parentElement;
    expect(getComputedStyle(wrapper as HTMLElement).display).not.toBe('none');
  });

  it('uses balanced density without list context', () => {
    render(
      <ChatMessage sender="assistant" data-testid="message">
        <span>Summary</span>
      </ChatMessage>,
    );
    expect(screen.getByTestId('message')).toHaveAttribute(
      'data-density',
      'balanced',
    );
  });

  it('inherits list density and lets an explicit prop override it', () => {
    render(
      <ChatMessageList density="spacious">
        <ChatMessage sender="assistant" data-testid="inherited">
          <span>Inherited</span>
        </ChatMessage>
        <ChatMessage
          sender="assistant"
          density="compact"
          data-testid="explicit">
          <span>Explicit</span>
        </ChatMessage>
      </ChatMessageList>,
    );
    expect(screen.getByTestId('inherited')).toHaveAttribute(
      'data-density',
      'spacious',
    );
    expect(screen.getByTestId('explicit')).toHaveAttribute(
      'data-density',
      'compact',
    );
  });

  it('forwards root props and ref while preserving the theme target', () => {
    const ref = createRef<HTMLElement>();
    render(
      <ChatMessage
        ref={ref}
        sender="assistant"
        data-testid="message"
        data-purpose="summary"
        className="consumer-message"
        style={{order: 2}}>
        <span>Summary</span>
      </ChatMessage>,
    );
    const message = screen.getByTestId('message');
    expect(ref.current).toBe(message);
    expect(message).toHaveAttribute('data-purpose', 'summary');
    expect(message).toHaveClass('astryx-chat-message', 'consumer-message');
    expect(message.style.order).toBe('2');
  });
});

// A sibling-relative :has(~ …) in Core's global stylesheet makes WebKit
// re-check every earlier sibling on each insertion into any container. The
// avatar's top spacing is judged from the message article instead.
describe('ChatMessage compiled avatar rule', () => {
  function compiledSelectors(): {selector: string; declaration: string}[] {
    const repoRoot = path.resolve(__dirname, '../../../..');
    const source = path.resolve(__dirname, 'ChatMessage.tsx');
    const require = createRequire(__filename);
    const result = transformSync(readFileSync(source, 'utf8'), {
      babelrc: false,
      configFile: false,
      filename: source,
      presets: [
        [
          require.resolve('@babel/preset-typescript'),
          {isTSX: true, allExtensions: true},
        ],
        [require.resolve('@babel/preset-react'), {runtime: 'automatic'}],
      ],
      plugins: [
        [
          stylexBabelPlugin,
          {
            dev: false,
            runtimeInjection: false,
            genConditionalClasses: true,
            treeshakeCompensation: true,
            unstable_moduleResolution: {type: 'commonJS', rootDir: repoRoot},
          },
        ],
      ],
    });
    const rules =
      (result?.metadata as {stylex?: [string, {ltr: string}, number][]})
        ?.stylex ?? [];
    return rules.map(([, {ltr}]) => {
      const brace = ltr.indexOf('{');
      return {selector: ltr.slice(0, brace), declaration: ltr.slice(brace)};
    });
  }

  it('compiles no sibling-relative :has() and judges the name from the article', () => {
    const rules = compiledSelectors();
    expect(rules.filter(rule => rule.selector.includes(':has(~'))).toEqual([]);
    // The article sets the avatar offset from its own :has(), and the
    // avatar wrapper reads it.
    const offset = rules.filter(
      rule =>
        rule.selector.includes(':has([data-chat-name])') &&
        rule.declaration.includes('var(--spacing-5)'),
    );
    expect(offset).toHaveLength(1);
    expect(offset[0].selector).not.toContain(' ');
  });
});
