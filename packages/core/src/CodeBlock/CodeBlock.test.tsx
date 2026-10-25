// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CodeBlock.test.tsx
 * @input Uses vitest, @testing-library/react, CodeBlock component
 * @output Unit tests for CodeBlock (copy button, collapse, scroll region a11y, syntaxTheme)
 * @position Testing; validates CodeBlock implementation
 *
 * SYNC: When CodeBlock.tsx changes, update tests to match new behavior
 */

import {createRef} from 'react';
import * as stylex from '@stylexjs/stylex';
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {act, render, screen, fireEvent, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {CodeBlock} from './CodeBlock';
import {__resetLiveRegionsForTest} from '../hooks/useAnnounce';
import {dracula} from '../theme/syntax';
import {InternationalizationProvider} from '../i18n';
import {defineTheme} from '../theme/defineTheme';
import {generateThemeCSS} from '../theme/generateThemeRules';

function generateThemeTestCSS(theme: Parameters<typeof generateThemeCSS>[0]) {
  const {prose, component} = generateThemeCSS(theme);
  return [prose, component].filter(Boolean).join('\n\n');
}

function politeRegion(): HTMLElement | null {
  return document.querySelector('[data-astryx-live-region="polite"]');
}

// A code sample long enough to exceed the default collapsible threshold (10).
const LONG_CODE = Array.from(
  {length: 15},
  (_, i) => `const line${i} = ${i};`,
).join('\n');

const rootContractStyles = stylex.create({
  root: {marginBlockStart: '1px'},
});

describe('CodeBlock', () => {
  beforeEach(() => {
    // jsdom does not implement the async Clipboard API.
    Object.assign(navigator, {
      clipboard: {writeText: vi.fn().mockResolvedValue(undefined)},
    });
  });

  afterEach(() => {
    __resetLiveRegionsForTest();
  });

  it('renders the code', () => {
    render(<CodeBlock code="const x = 1;" language="javascript" />);
    expect(screen.getByText(/const/)).toBeInTheDocument();
  });

  it('forwards the public ref and composes supported root props', () => {
    const ref = createRef<HTMLPreElement>();
    render(
      <CodeBlock
        ref={ref}
        code="const x = 1;"
        data-testid="code-block-root"
        aria-describedby="code-help"
        className="consumer-code-block"
        style={{opacity: 0.75}}
        xstyle={rootContractStyles.root}
      />,
    );

    const root = screen.getByTestId('code-block-root');
    const xstyleClass = stylex.props(rootContractStyles.root).className;
    expect(ref.current).toBe(root);
    expect(root.tagName).toBe('PRE');
    expect(root).toHaveAttribute('aria-describedby', 'code-help');
    expect(xstyleClass).toBeTruthy();
    expect(root).toHaveClass('consumer-code-block', xstyleClass!);
    expect(root).toHaveStyle({opacity: '0.75'});
  });

  it('names the code viewport and gives it a tab stop only while it overflows', () => {
    // jsdom has no layout, so the viewport fits: a fitting viewport is not a
    // tab stop (AST-025 FR12); the overflowing states are browser evidence.
    render(<CodeBlock code="const x = 1;" language="javascript" />);
    const region = screen.getByRole('group');
    expect(region).not.toHaveAttribute('tabindex');
    expect(region).toHaveAttribute('aria-label', 'javascript');
    expect(region).toHaveAttribute('data-scroll-axis', 'both');
  });

  it('labels the scroll region "Code" when no language label is shown', () => {
    render(<CodeBlock code="hello" hasLanguageLabel={false} />);
    const region = screen.getByRole('group');
    expect(region).toHaveAttribute('aria-label', 'Code');
  });

  it.each(['', '   '])(
    'names a collapsible header when the visible title is %p',
    title => {
      render(
        <CodeBlock
          code={LONG_CODE}
          language="plaintext"
          title={title}
          isCollapsible
        />,
      );

      const header = screen
        .getAllByRole('button')
        .find(element => element.hasAttribute('aria-expanded'));
      expect(header).toHaveAccessibleName('Code');
    },
  );

  it('applies a zero-pixel max height', () => {
    render(<CodeBlock code="hello" maxHeight={0} />);
    expect(screen.getByRole('group')).toHaveStyle({maxHeight: '0px'});
  });

  describe('diff layer', () => {
    const diff =
      '@@ -1,2 +1,2 @@\n-  const a = 1;\n+  const a = 2;\n   const b = 3;';

    it('marks added, removed and header rows and leaves context unmarked', () => {
      const {container} = render(
        <CodeBlock code={diff} language="typescript" isDiff />,
      );
      const rows = container.querySelectorAll('[data-line]');
      expect(rows).toHaveLength(4);
      expect(rows[0].getAttribute('data-diff')).toBe('header');
      expect(rows[1].getAttribute('data-diff')).toBe('removed');
      expect(rows[2].getAttribute('data-diff')).toBe('added');
      expect(rows[3].getAttribute('data-diff')).toBeNull();
    });

    it('puts the glyph in its own marker column and keeps base-language tokens past it', () => {
      const {container} = render(
        <CodeBlock code={diff} language="typescript" isDiff />,
      );
      const rows = container.querySelectorAll('[data-line]');
      const marker = (row: Element) =>
        row.querySelector('[data-diff-marker]')?.textContent;
      expect(marker(rows[1])).toBe('-');
      expect(marker(rows[2])).toBe('+');
      // The glyph is the source's own text, so assistive technology reads it.
      expect(rows[1].querySelector('[data-diff-marker]')).not.toHaveAttribute(
        'aria-hidden',
      );
      expect(marker(rows[3])).toBe(' ');
      // The code column starts after the glyph on every line: the removed and
      // context lines' content keeps its own two-space indentation.
      const content = (row: Element) =>
        row.querySelectorAll('span')[1]?.textContent;
      expect(content(rows[1])).toBe('  const a = 1;');
      expect(content(rows[3])).toBe('  const b = 3;');
      // `const` is a keyword on changed and context lines alike.
      expect(rows[1].querySelector('.astryx-token-keyword')).not.toBeNull();
      expect(rows[3].querySelector('.astryx-token-keyword')).not.toBeNull();
    });

    it('keeps the header and names the viewport diff / tsx diff', () => {
      const {rerender} = render(<CodeBlock code={diff} isDiff />);
      expect(screen.getByRole('group', {name: 'diff'})).toBeInTheDocument();
      expect(screen.getByText('diff')).toBeInTheDocument();
      rerender(<CodeBlock code={diff} language="tsx" isDiff />);
      expect(screen.getByRole('group', {name: 'tsx diff'})).toBeInTheDocument();
      expect(screen.getByText('tsx diff')).toBeInTheDocument();
    });

    it('copies the exact source, glyphs included', () => {
      render(<CodeBlock code={diff} language="typescript" isDiff />);
      fireEvent.click(screen.getByRole('button', {name: 'Copy code'}));
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(diff);
    });

    it('composes with highlightLines and does nothing without isDiff', () => {
      const {container, rerender} = render(
        <CodeBlock
          code={diff}
          language="typescript"
          isDiff
          highlightLines={[2]}
        />,
      );
      expect(
        container
          .querySelector('[data-diff="removed"]')
          ?.getAttribute('data-line'),
      ).toBe('2');
      rerender(<CodeBlock code={diff} language="typescript" />);
      expect(container.querySelector('[data-diff]')).toBeNull();
      expect(
        container.querySelector('[data-line] [aria-hidden="true"]'),
      ).toBeNull();
    });
  });

  it('copies code when the copy button is clicked', () => {
    render(<CodeBlock code="const x = 1;" language="javascript" />);
    const copyButton = screen.getByRole('button', {name: 'Copy code'});
    fireEvent.click(copyButton);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('const x = 1;');
  });

  it('renders the copy button as a themeable target with a "Copy code" tooltip', () => {
    render(<CodeBlock code="const x = 1;" language="javascript" />);
    const copyButton = screen.getByRole('button', {name: 'Copy code'});
    // Theme seam: a design system can restyle the copy control via this class
    // without turning the button off and re-implementing it.
    expect(copyButton).toHaveClass('astryx-code-block-copy-button');
    // The button carries a visible "Copy code" hover/focus hint (tooltip),
    // wired through aria-describedby — a bare <button> could not.
    expect(copyButton).toHaveAttribute('aria-describedby');
  });

  it('keeps the copy button tooltip as "Copy code" after copying', async () => {
    render(<CodeBlock code="const x = 1;" language="javascript" />);
    fireEvent.click(screen.getByRole('button', {name: 'Copy code'}));
    await act(async () => {});
    // The icon flip (copy → check) is the confirmation; the tooltip text does
    // not change. The accessible name still swaps to "Copied" for AT.
    const copyButton = screen.getByRole('button', {name: 'Copied'});
    const tooltipId = copyButton.getAttribute('aria-describedby');
    expect(tooltipId).toBeTruthy();
    const tooltip = document.getElementById(tooltipId as string);
    expect(tooltip).toHaveTextContent('Copy code');
  });

  it('announces "Copied" to a polite live region after copying', async () => {
    render(<CodeBlock code="const x = 1;" language="javascript" />);
    const copyButton = screen.getByRole('button', {name: 'Copy code'});
    fireEvent.click(copyButton);
    await waitFor(() => {
      expect(politeRegion()).toHaveTextContent('Copied');
    });
  });

  it('localizes the copy announcement through the i18n catalog', async () => {
    render(
      <InternationalizationProvider
        locale="fr"
        overrides={{fr: {'@astryx.codeBlock.copied': 'Copié'}}}>
        <CodeBlock code="const x = 1;" language="javascript" />
      </InternationalizationProvider>,
    );
    // The button label and the live-region announcement share the same key.
    fireEvent.click(screen.getByRole('button', {name: 'Copy code'}));
    await waitFor(() => {
      expect(politeRegion()).toHaveTextContent('Copié');
    });
    expect(screen.getByRole('button', {name: 'Copié'})).toBeInTheDocument();
  });

  it('keeps the copied indicator a full 2s after a rapid re-copy', async () => {
    vi.useFakeTimers();
    try {
      render(<CodeBlock code="const x = 1;" language="javascript" />);
      fireEvent.click(screen.getByRole('button', {name: 'Copy code'}));
      // Flush the async clipboard write.
      await act(async () => {});
      expect(screen.getByRole('button', {name: 'Copied'})).toBeInTheDocument();

      // 1.5s later the user copies again.
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      fireEvent.click(screen.getByRole('button', {name: 'Copied'}));
      await act(async () => {});

      // 600ms after the second copy (2.1s after the first): the first
      // click's timer must not have reverted the indicator early.
      act(() => {
        vi.advanceTimersByTime(600);
      });
      expect(screen.getByRole('button', {name: 'Copied'})).toBeInTheDocument();

      // It resets 2s after the most recent copy.
      act(() => {
        vi.advanceTimersByTime(1400);
      });
      expect(
        screen.getByRole('button', {name: 'Copy code'}),
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does NOT collapse the block when the copy button is clicked', () => {
    render(
      <CodeBlock
        code={LONG_CODE}
        language="javascript"
        title="example"
        isCollapsible
      />,
    );
    // The collapsible header exposes aria-expanded.
    const header = screen
      .getAllByRole('button')
      .find(el => el.hasAttribute('aria-expanded'));
    expect(header).toBeTruthy();
    expect(header).toHaveAttribute('aria-expanded', 'true');

    const copyButton = screen.getByRole('button', {name: 'Copy code'});
    fireEvent.click(copyButton);

    // Clicking Copy must not toggle the collapsible header.
    expect(header).toHaveAttribute('aria-expanded', 'true');
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
  });

  describe('endContent', () => {
    const run = () => (
      <button type="button" onClick={onRun}>
        Run in terminal
      </button>
    );
    let onRun: ReturnType<typeof vi.fn<() => void>>;
    beforeEach(() => {
      onRun = vi.fn<() => void>();
    });

    it('renders caller controls before Copy in the header', () => {
      render(<CodeBlock code="npm test" language="bash" endContent={run()} />);
      const action = screen.getByRole('button', {name: 'Run in terminal'});
      const copy = screen.getByRole('button', {name: 'Copy code'});
      expect(action.parentElement).toBe(copy.parentElement);
      expect(
        action.compareDocumentPosition(copy) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(screen.getByText('bash')).toBeInTheDocument();
    });

    it('never creates a header: with no title or label the controls sit in the corner', () => {
      const {container} = render(
        <CodeBlock
          code="npm test"
          language="bash"
          hasLanguageLabel={false}
          endContent={run()}
        />,
      );
      expect(container.querySelector('.astryx-code-block-header')).toBeNull();
      const action = screen.getByRole('button', {name: 'Run in terminal'});
      const copy = screen.getByRole('button', {name: 'Copy code'});
      const cluster = action.parentElement;
      expect(cluster).toBe(copy.parentElement);
      expect(cluster?.parentElement).toBe(container.querySelector('pre'));
      expect(
        action.compareDocumentPosition(copy) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('keeps its place when Copy is hidden', () => {
      const {container} = render(
        <CodeBlock code="npm test" hasCopyButton={false} endContent={run()} />,
      );
      expect(screen.queryByRole('button', {name: 'Copy code'})).toBeNull();
      const action = screen.getByRole('button', {name: 'Run in terminal'});
      expect(action.parentElement?.parentElement).toBe(
        container.querySelector('pre'),
      );
    });

    it('sits outside the disclosure and never toggles it, by pointer or keyboard', () => {
      render(
        <CodeBlock
          code={LONG_CODE}
          language="javascript"
          title="example"
          isCollapsible
          endContent={run()}
        />,
      );
      const header = screen
        .getAllByRole('button')
        .find(el => el.hasAttribute('aria-expanded'));
      const action = screen.getByRole('button', {name: 'Run in terminal'});
      expect(header!.contains(action)).toBe(false);
      fireEvent.click(action);
      fireEvent.keyDown(action, {key: 'Enter'});
      fireEvent.keyDown(action, {key: ' '});
      expect(onRun).toHaveBeenCalledTimes(1);
      expect(header).toHaveAttribute('aria-expanded', 'true');
    });

    it('treats a falsy endContent as absent: no corner column without Copy', () => {
      const {container} = render(
        <CodeBlock code="npm test" hasCopyButton={false} endContent={false} />,
      );
      const root = container.querySelector('pre');
      // Only the code viewport: no empty cluster beside it.
      expect(root?.children).toHaveLength(1);
      expect(screen.queryAllByRole('button')).toHaveLength(0);
    });

    it('leaves caller controls unnamed and unstyled by CodeBlock', () => {
      render(<CodeBlock code="npm test" language="bash" endContent={run()} />);
      const action = screen.getByRole('button', {name: 'Run in terminal'});
      expect(action.getAttribute('class')).toBeNull();
      expect(action).not.toHaveAttribute('aria-label');
    });
  });

  it('does not nest the copy button inside the collapsible header role="button"', () => {
    render(
      <CodeBlock
        code={LONG_CODE}
        language="javascript"
        title="example"
        isCollapsible
      />,
    );
    const header = screen
      .getAllByRole('button')
      .find(el => el.hasAttribute('aria-expanded'));
    const copyButton = screen.getByRole('button', {name: 'Copy code'});
    expect(header).toBeTruthy();
    // The copy button must be a sibling, not a descendant of the interactive
    // header — nested interactive controls are invalid ARIA.
    expect(header!.contains(copyButton)).toBe(false);
  });

  it('still toggles collapse when the header itself is clicked', () => {
    render(
      <CodeBlock
        code={LONG_CODE}
        language="javascript"
        title="example"
        isCollapsible
      />,
    );
    const header = screen
      .getAllByRole('button')
      .find(el => el.hasAttribute('aria-expanded'))!;
    expect(header).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'false');
  });

  it('expands when rerendering removes the collapse control', () => {
    const {rerender} = render(
      <CodeBlock
        code={LONG_CODE}
        language="javascript"
        title="example"
        isCollapsible
      />,
    );
    const header = screen
      .getAllByRole('button')
      .find(el => el.hasAttribute('aria-expanded'))!;
    fireEvent.click(header);
    expect(screen.getByRole('group').closest('[inert]')).not.toBeNull();

    rerender(<CodeBlock code={LONG_CODE} language="plaintext" isCollapsible />);
    expect(
      screen
        .queryAllByRole('button')
        .find(el => el.hasAttribute('aria-expanded')),
    ).toBeUndefined();
    expect(screen.getByRole('group').closest('[inert]')).toBeNull();

    rerender(
      <CodeBlock
        code={LONG_CODE}
        language="javascript"
        title="example"
        isCollapsible
      />,
    );
    expect(
      screen
        .getAllByRole('button')
        .find(el => el.hasAttribute('aria-expanded')),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('links the collapsible header to its code region via aria-controls', () => {
    render(
      <CodeBlock
        code={LONG_CODE}
        language="javascript"
        title="example"
        isCollapsible
      />,
    );
    const header = screen
      .getAllByRole('button')
      .find(el => el.hasAttribute('aria-expanded'))!;
    const controlsId = header.getAttribute('aria-controls');
    // aria-controls must be present and point at the real code region.
    expect(controlsId).toBeTruthy();
    const region = document.getElementById(controlsId as string);
    expect(region).not.toBeNull();
    // The region contains the scrollable code body (role="group").
    expect(region).toContainElement(screen.getByRole('group'));
  });

  it('keeps aria-controls resolvable when collapsed (region stays mounted)', () => {
    render(
      <CodeBlock
        code={LONG_CODE}
        language="javascript"
        title="example"
        isCollapsible
      />,
    );
    const header = screen
      .getAllByRole('button')
      .find(el => el.hasAttribute('aria-expanded'))!;
    fireEvent.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'false');
    // The code region uses a CSS grid animation to collapse, so it stays in
    // the DOM — aria-controls stays a valid, resolvable reference (unlike a
    // conditionally-mounted region, which would need a conditional attribute).
    const controlsId = header.getAttribute('aria-controls');
    expect(controlsId).toBeTruthy();
    expect(document.getElementById(controlsId as string)).not.toBeNull();
  });

  it('makes the collapsed region inert so the scroll container is unreachable', () => {
    render(
      <CodeBlock
        code={LONG_CODE}
        language="javascript"
        title="example"
        isCollapsible
      />,
    );
    const header = screen
      .getAllByRole('button')
      .find(el => el.hasAttribute('aria-expanded'))!;
    const region = document.getElementById(
      header.getAttribute('aria-controls') as string,
    )!;
    // Expanded: the region is not inert and the scroll container is reachable.
    expect(region).not.toHaveAttribute('inert');

    fireEvent.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'false');
    // Collapsed: the wrapper is inert, so the scroll container inside it
    // drops out of the tab order and the accessibility tree instead of
    // remaining an invisible tab stop while it overflows.
    expect(region).toHaveAttribute('inert');
    const scrollContainer = screen.getByRole('group');
    expect(scrollContainer.closest('[inert]')).toBe(region);
  });

  it('restores focusability of the scroll container after expanding again', () => {
    render(
      <CodeBlock
        code={LONG_CODE}
        language="javascript"
        title="example"
        isCollapsible
      />,
    );
    const header = screen
      .getAllByRole('button')
      .find(el => el.hasAttribute('aria-expanded'))!;
    const region = document.getElementById(
      header.getAttribute('aria-controls') as string,
    )!;
    // Collapse, then expand again.
    fireEvent.click(header);
    expect(region).toHaveAttribute('inert');
    fireEvent.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'true');
    // Expanded again: inert is removed and the scroll container is a named
    // group once more (its tab stop follows overflow, see the browser spec).
    expect(region).not.toHaveAttribute('inert');
    const scrollContainer = screen.getByRole('group');
    expect(scrollContainer.closest('[inert]')).toBeNull();
    expect(scrollContainer).toHaveAttribute('data-scroll-axis', 'both');
  });

  it('applies a per-instance syntax theme via the syntaxTheme prop', () => {
    const {container} = render(
      <CodeBlock
        code="const x = 1;"
        language="javascript"
        syntaxTheme={dracula}
      />,
    );
    const wrapper = container.querySelector('[data-astryx-syntax-theme]');
    expect(wrapper).not.toBeNull();
    expect(wrapper).toHaveAttribute('data-astryx-syntax-theme', 'dracula');
    expect(wrapper!.querySelector('pre')).not.toBeNull();
  });

  it('renders no syntax theme wrapper when syntaxTheme is not set', () => {
    const {container} = render(
      <CodeBlock code="const x = 1;" language="javascript" />,
    );
    expect(container.querySelector('[data-astryx-syntax-theme]')).toBeNull();
    expect(container.firstElementChild?.tagName).toBe('PRE');
  });

  describe('header theming targets', () => {
    it('puts astryx-code-block-header on the header row when a header shows', () => {
      const {container} = render(
        <CodeBlock
          code="const x = 1;"
          language="javascript"
          title="example.js"
        />,
      );
      expect(
        container.querySelector('.astryx-code-block-header'),
      ).not.toBeNull();
    });

    it('puts astryx-code-block-title on the header title element', () => {
      const {container} = render(
        <CodeBlock
          code="const x = 1;"
          language="javascript"
          title="example.js"
        />,
      );
      const titleEl = container.querySelector('.astryx-code-block-title');
      expect(titleEl).not.toBeNull();
      // The language label + title text live in this element.
      expect(titleEl).toHaveTextContent('example.js');
    });

    it('renders no header targets when there is no header', () => {
      // plaintext hides the language label and no title is given, so the
      // header row is not rendered at all.
      const {container} = render(
        <CodeBlock code="const x = 1;" language="plaintext" />,
      );
      expect(container.querySelector('.astryx-code-block-header')).toBeNull();
      expect(container.querySelector('.astryx-code-block-title')).toBeNull();
    });

    it('keeps copy available when a known language label is hidden', async () => {
      const {container} = render(
        <CodeBlock
          code="const x = 1;"
          language="javascript"
          hasLanguageLabel={false}
        />,
      );

      expect(container.querySelector('.astryx-codeblock-header')).toBeNull();
      expect(container.querySelector('.astryx-codeblock-title')).toBeNull();
      expect(screen.getByRole('group')).toHaveAttribute('aria-label', 'Code');

      const copyButton = screen.getByRole('button', {name: 'Copy code'});
      // Headerless: Copy sits in the corner cluster, a direct child of the root.
      expect(copyButton.parentElement?.parentElement).toBe(
        container.querySelector('pre'),
      );
      await act(async () => {
        fireEvent.click(copyButton);
      });
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'const x = 1;',
      );
    });

    it('exposes the header and title as themeable defineTheme targets', () => {
      // jsdom can't resolve the @layer cascade, so this asserts the targets are
      // reachable by a theme via the sanctioned defineTheme channel — replacing
      // the structural `> div:first-child > div > span` header/title selectors a
      // consumer would otherwise need to restyle the header padding and title.
      const theme = defineTheme({
        name: 'codeblock-header-target-test',
        components: {
          'code-block-header': {
            base: {paddingBlock: 'var(--spacing-1)'},
          },
          'code-block-title': {
            base: {fontSize: 'var(--text-body-size)'},
          },
        },
      });
      const css = generateThemeTestCSS(theme);
      expect(css).toContain('.astryx-code-block-header');
      expect(css).toContain('.astryx-code-block-title');
    });
  });

  it('toggles collapse with Enter and Space', async () => {
    const user = userEvent.setup();
    render(
      <CodeBlock
        code={LONG_CODE}
        language="javascript"
        title="example"
        isCollapsible
      />,
    );
    const header = screen
      .getAllByRole('button')
      .find(el => el.hasAttribute('aria-expanded'))!;

    header.focus();
    await user.keyboard('{Enter}');
    expect(header).toHaveAttribute('aria-expanded', 'false');
    await user.keyboard(' ');
    expect(header).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('CodeBlock theme target names', () => {
  it('renders only the canonical target classes', () => {
    const {container} = render(
      <CodeBlock
        code="const x = 1;"
        language="javascript"
        title="example.js"
      />,
    );
    expect(container.querySelector('.astryx-code-block')).toHaveClass(
      'astryx-code-block',
    );
    expect(container.querySelector('.astryx-code-block-header')).toHaveClass(
      'astryx-code-block-header',
    );
    expect(container.querySelector('.astryx-code-block-title')).toHaveClass(
      'astryx-code-block-title',
    );
    expect(screen.getByRole('button', {name: 'Copy code'})).toHaveClass(
      'astryx-code-block-copy-button',
    );
    expect(container.querySelector('.astryx-codeblock')).toBeNull();
    expect(container.querySelector('.astryx-codeblock-header')).toBeNull();
    expect(container.querySelector('.astryx-codeblock-title')).toBeNull();
    expect(container.querySelector('.astryx-codeblock-copy-button')).toBeNull();
  });

  it('reaches the header and title through the current defineTheme keys', () => {
    const theme = defineTheme({
      name: 'code-block-header-target-test',
      components: {
        'code-block-header': {base: {paddingBlock: 'var(--spacing-1)'}},
        'code-block-title': {base: {fontSize: 'var(--text-body-size)'}},
      },
    });
    const css = generateThemeTestCSS(theme);
    expect(css).toContain('.astryx-code-block-header');
    expect(css).toContain('.astryx-code-block-title');
  });
});
