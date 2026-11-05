// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Markdown.rerender.test.tsx
 * @input Uses vitest, @testing-library/react, Markdown, a synthetic long document
 * @output Tests that an unrelated caller re-render reuses the rendered document
 * @position Performance regression evidence for long documents. Counting
 *   renders of a caller-supplied block renderer is deterministic, unlike a
 *   timing budget, and fails when Markdown rebuilds every block element on a
 *   re-render that changed nothing it reads.
 */

import {useState} from 'react';
import {act, cleanup, fireEvent, render} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {Markdown} from './Markdown';
import type {MarkdownComponents} from './Markdown';

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
