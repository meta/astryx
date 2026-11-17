// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Markdown.rerender.test.tsx
 * @input Uses vitest, @testing-library/react, Markdown, a synthetic long document
 * @output Tests that an unrelated caller re-render reuses the rendered document.
 *   Also tests that a render React discards keeps streamed text exact and only
 *   shifts the fade spans
 * @position Performance regression evidence for long documents. Counting
 *   renders of a caller-supplied block renderer is deterministic, unlike a
 *   timing budget, and fails when Markdown rebuilds every block element on a
 *   re-render that changed nothing it reads.
 */

import {Suspense, startTransition, use, useState} from 'react';
import type {ReactNode} from 'react';
import {act, cleanup, fireEvent, render} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {Markdown} from './Markdown';
import type {MarkdownComponents} from './Markdown';
import {stubMatchMedia} from '../__tests__/stubMatchMedia';

afterEach(() => {
  cleanup();
});

/** A long, review-style document: headings, prose, lists, a table, code. */
function longDocument(sections: number): string {
  return Array.from({length: sections}, (_, i) =>
    [
      `## Section ${i}`,
      '',
      `Paragraph ${i} with **bold**, *emphasis*, \`code\` and a [link](/docs/${i}).`,
      '',
      `- Point ${i}`,
      `  - Nested point ${i}`,
      `- [x] Done ${i}`,
      '',
      '| Name | Count |',
      '| --- | ---: |',
      `| row ${i} | ${i * 3} |`,
      '',
      '```ts',
      `const value${i} = ${i};`,
      '```',
    ].join('\n'),
  ).join('\n\n');
}

const SECTIONS = 40;

function createCountingComponents(): {
  components: Partial<MarkdownComponents>;
  renders: () => number;
} {
  let count = 0;
  function CountingCode({code}: {code: string; language?: string}) {
    count++;
    return <pre data-testid="code">{code}</pre>;
  }
  return {components: {code: CountingCode}, renders: () => count};
}

describe('Markdown re-render reuse', () => {
  it('does not re-render any block when a caller re-render changes nothing Markdown reads', () => {
    const {components, renders} = createCountingComponents();
    const source = longDocument(SECTIONS);
    let bump: () => void = () => {};
    function Page() {
      const [tick, setTick] = useState(0);
      bump = () => setTick(t => t + 1);
      return (
        <section data-tick={tick}>
          {/* A new link handler each render, as inline callers write it. */}
          <Markdown components={components} onLinkClick={() => {}}>
            {source}
          </Markdown>
        </section>
      );
    }
    const {container} = render(<Page />);
    const document = container.querySelector('[role="document"]');
    const html = document?.innerHTML;
    expect(renders()).toBe(SECTIONS);

    act(() => bump());
    act(() => bump());

    expect(renders()).toBe(SECTIONS);
    expect(container.querySelector('[role="document"]')).toBe(document);
    expect(document?.innerHTML).toBe(html);
  });

  it('re-renders when the text changes', () => {
    const {components, renders} = createCountingComponents();
    const {rerender, getAllByTestId} = render(
      <Markdown components={components}>{longDocument(2)}</Markdown>,
    );
    expect(renders()).toBe(2);
    rerender(
      <Markdown components={components}>
        {`${longDocument(2)}\n\n\`\`\`ts\nconst added = true;\n\`\`\``}
      </Markdown>,
    );
    expect(getAllByTestId('code')).toHaveLength(3);
    expect(getAllByTestId('code')[2].textContent).toBe('const added = true;');
  });

  it('re-renders when a rendering prop changes', () => {
    const {container, rerender} = render(
      <Markdown headingLevelStart={1}>{'# Title'}</Markdown>,
    );
    expect(container.querySelector('h1')).not.toBeNull();
    rerender(<Markdown headingLevelStart={3}>{'# Title'}</Markdown>);
    expect(container.querySelector('h1')).toBeNull();
    expect(container.querySelector('h3')?.textContent).toBe('Title');
  });

  it('calls the latest link handler after a re-render that reused the document', () => {
    const first = vi.fn();
    const latest = vi.fn(() => false as const);
    const {container, rerender} = render(
      <Markdown onLinkClick={first}>{'[go](/next)'}</Markdown>,
    );
    rerender(<Markdown onLinkClick={latest}>{'[go](/next)'}</Markdown>);
    const link = container.querySelector('a');
    expect(link).not.toBeNull();
    const event = new MouseEvent('click', {bubbles: true, cancelable: true});
    act(() => {
      link?.dispatchEvent(event);
    });
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledWith('/next', expect.anything());
    expect(event.defaultPrevented).toBe(true);
  });

  it('starts and stops handling link clicks when the handler is added or removed', () => {
    const handler = vi.fn();
    const {container, rerender} = render(<Markdown>{'[go](/next)'}</Markdown>);
    rerender(<Markdown onLinkClick={handler}>{'[go](/next)'}</Markdown>);
    fireEvent.click(container.querySelector('a') as HTMLAnchorElement);
    expect(handler).toHaveBeenCalledTimes(1);
    rerender(<Markdown>{'[go](/next)'}</Markdown>);
    fireEvent.click(container.querySelector('a') as HTMLAnchorElement);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

// Render writes the fade-in refs on purpose, an accepted exception to the
// runtime's ref rule. This pins why it is harmless: the text always matches the
// committed children, and a render React discards only shifts the fade spans.
describe('streamed text after a render React discards', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const forever = new Promise<never>(() => {});
  function Forever(): null {
    use(forever);
    return null;
  }
  function Stream({
    text,
    isPending = false,
  }: {
    text: string;
    isPending?: boolean;
  }): ReactNode {
    return (
      <Suspense fallback={null}>
        <Markdown isStreaming>{text}</Markdown>
        {isPending ? <Forever /> : null}
      </Suspense>
    );
  }
  /** The text of each span the stream splits the paragraph into. */
  function spanTexts(container: HTMLElement): string[] {
    const wrapper = container.querySelector('[role="paragraph"] > span');
    return Array.from(wrapper?.children ?? []).map(
      span => span.textContent ?? '',
    );
  }

  it('keeps the text exact and moves the newest fade start by at most one letter', async () => {
    // Reduced motion reveals each prefix at once, one render per prefix.
    stubMatchMedia({reduceMotion: true});
    const {container, rerender} = render(<Stream text="Hello" />);
    rerender(<Stream text="Hello w" />);
    // A transition renders one more letter, then never commits.
    await act(async () => {
      startTransition(() => {
        rerender(<Stream text="Hello wo" isPending />);
      });
    });

    rerender(<Stream text="Hello wor" />);

    expect(container.querySelector('[role="paragraph"]')?.textContent).toBe(
      'Hello wor',
    );
    // Without the discarded render the newest fade covers "or". With it, the
    // fade starts one letter later.
    expect(spanTexts(container)).toEqual(['Hello', ' w', 'o', 'r']);
  });

  it('settles the oldest fading text one step early when every fade span is in use', async () => {
    stubMatchMedia({reduceMotion: true});
    // One letter per render, past the most fade spans Markdown keeps.
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    const stream = () => {
      const view = render(<Stream text={letters.slice(0, 1)} />);
      for (let i = 2; i <= 20; i++) {
        view.rerender(<Stream text={letters.slice(0, i)} />);
      }
      return view;
    };
    const control = stream();
    control.rerender(<Stream text={letters.slice(0, 22)} />);
    const controlSpans = spanTexts(control.container);
    control.unmount();

    const view = stream();
    await act(async () => {
      startTransition(() => {
        view.rerender(<Stream text={letters.slice(0, 21)} isPending />);
      });
    });
    view.rerender(<Stream text={letters.slice(0, 22)} />);
    const spans = spanTexts(view.container);

    // The text is exact, and the same number of spans fade.
    expect(spans.join('')).toBe(letters.slice(0, 22));
    expect(controlSpans.join('')).toBe(letters.slice(0, 22));
    expect(spans).toHaveLength(controlSpans.length);
    // The settled text holds one more letter than the control's.
    expect(spans[0]).toBe(letters.slice(0, controlSpans[0].length + 1));
  });

  it('splits the same stream with the newest fade at the last committed text when nothing is discarded', () => {
    stubMatchMedia({reduceMotion: true});
    const {container, rerender} = render(<Stream text="Hello" />);
    rerender(<Stream text="Hello w" />);

    rerender(<Stream text="Hello wor" />);

    expect(container.querySelector('[role="paragraph"]')?.textContent).toBe(
      'Hello wor',
    );
    expect(spanTexts(container)).toEqual(['Hello', ' w', 'or']);
  });
});
