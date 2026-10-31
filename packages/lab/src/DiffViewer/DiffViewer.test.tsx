// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, vi} from 'vitest';
import {act, fireEvent, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {createRef} from 'react';
import {DiffViewer} from './DiffViewer';
import {parseUnifiedDiff} from './parseUnifiedDiff';
import type {DiffViewerLineRef} from './diffTypes';
import {createDiffFile} from './createDiffFile';
import {dockerfile} from '@astryxdesign/core/CodeBlock/languages/dockerfile';
import {graphql} from '@astryxdesign/core/CodeBlock/languages/graphql';
import {createCodeLanguage} from '@astryxdesign/core/CodeBlock';

const PATCH = `diff --git a/src/greet.ts b/src/greet.ts
--- a/src/greet.ts
+++ b/src/greet.ts
@@ -1,4 +1,5 @@
 export function greet(name: string) {
-  return 'Hello ' + name;
+  const greeting = 'Hello';
+  return \`\${greeting}, \${name}\`;
 }
 
`;

const [FILE] = parseUnifiedDiff(PATCH);

function codeRows(container: HTMLElement) {
  return Array.from(container.querySelectorAll('tbody tr'));
}

/** A split-view pane's rows, after its column-header row. */
function paneRows(container: HTMLElement, side: 'old' | 'new') {
  return Array.from(
    container.querySelectorAll(
      `[data-diff-pane="${side}"] [role="row"]:not([data-diff-sizer])`,
    ),
  ).slice(1);
}

function patchOf(removed: string, added: string) {
  return `diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1 +1 @@
-${removed}
+${added}
`;
}

function changedText(container: HTMLElement, kind: 'added' | 'removed') {
  return Array.from(
    container.querySelectorAll(`[data-diff="${kind}"] [data-diff-change]`),
  ).map(span => span.textContent);
}

describe('DiffViewer', () => {
  it('renders the path, the change counts, and every line', () => {
    render(<DiffViewer file={FILE} />);
    expect(screen.getByText('src/greet.ts')).toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.getByText('−1')).toBeInTheDocument();
    expect(
      screen.getByText('2 lines added, 1 line removed'),
    ).toBeInTheDocument();
    expect(screen.getByText('@@ -1,4 +1,5 @@')).toBeInTheDocument();
    expect(screen.getByText('const')).toBeInTheDocument();
  });

  it('keeps code text intact through syntax highlighting', () => {
    const {container} = render(<DiffViewer file={FILE} />);
    const removed = container.querySelector('td[data-diff="removed"]');
    expect(removed?.textContent).toBe("  return 'Hello ' + name;");
    // ts inferred from the extension: tokens are painted with span classes.
    expect(container.querySelector('.astryx-token-keyword')).not.toBeNull();
  });

  describe('language values (CodeBlock FR13)', () => {
    const keywords = (root: ParentNode) =>
      Array.from(root.querySelectorAll('.astryx-token-keyword')).map(
        node => node.textContent,
      );
    const schema = createDiffFile({
      oldValue: 'type User {}\n',
      newValue: 'type User { name: String }\n',
      newPath: 'api/schema.graphql',
    });

    it('takes a language value as language', () => {
      const plain = render(<DiffViewer file={schema} language="graphql" />);
      expect(keywords(plain.container)).toEqual([]);
      const {container} = render(
        <DiffViewer file={schema} language={graphql} />,
      );
      expect(keywords(container)).toContain('type');
    });

    it('infers a listed value from the file extension or name', () => {
      const unlisted = render(<DiffViewer file={schema} />);
      expect(keywords(unlisted.container)).toEqual([]);
      const listed = render(
        <DiffViewer file={schema} codeLanguages={[dockerfile, graphql]} />,
      );
      expect(keywords(listed.container)).toContain('type');
      const docker = createDiffFile({
        oldValue: 'FROM node:20\n',
        newValue: 'FROM node:22\n',
        newPath: 'Dockerfile',
      });
      const byName = render(
        <DiffViewer file={docker} codeLanguages={[graphql, dockerfile]} />,
      );
      expect(keywords(byName.container)).toContain('FROM');
    });

    it('infers a custom language from its extension', () => {
      const zig = createCodeLanguage({
        name: 'zig',
        identifiers: ['zig'],
        fileExtensions: ['zig'],
        tokenize: () => [{type: 'keyword', start: 0, end: 3}],
      });
      const file = createDiffFile({
        oldValue: 'pub a\n',
        newValue: 'pub b\n',
        newPath: 'src/main.zig',
      });
      const {container} = render(
        <DiffViewer file={file} codeLanguages={[zig]} />,
      );
      expect(keywords(container)).toContain('pub');
    });

    it('infers the newer built-ins from their extensions', () => {
      const rust = createDiffFile({
        oldValue: 'fn a() {}\n',
        newValue: 'fn b() {}\n',
        newPath: 'src/lib.rs',
      });
      const {container} = render(<DiffViewer file={rust} />);
      expect(keywords(container)).toContain('fn');
    });
  });

  it('marks changed lines for assistive technology', () => {
    const {container} = render(<DiffViewer file={FILE} />);
    const addedCells = container.querySelectorAll('td[data-diff="added"]');
    expect(addedCells).toHaveLength(2);
    expect(screen.getAllByText('Added')).toHaveLength(2);
    expect(screen.getAllByText('Removed')).toHaveLength(1);
  });

  it('renders one row per line plus the hunk header in unified view', () => {
    const {container} = render(<DiffViewer file={FILE} />);
    // 1 hunk header + 6 lines.
    expect(codeRows(container)).toHaveLength(7);
  });

  it('pairs removed and added lines side by side in split view', () => {
    const {container} = render(<DiffViewer file={FILE} viewMode="split" />);
    // Each pane: 1 hunk header + context + 2 paired change rows + 2 context.
    const oldRows = paneRows(container, 'old');
    const newRows = paneRows(container, 'new');
    expect(oldRows).toHaveLength(6);
    expect(newRows).toHaveLength(6);
    expect(oldRows[2].querySelector('[data-diff="removed"]')).not.toBeNull();
    expect(newRows[2].querySelector('[data-diff="added"]')).not.toBeNull();
    // The second added line has no removed counterpart: the old pane's row
    // is spacing, hidden from assistive technology.
    expect(oldRows[3].querySelector('[data-diff]')).toBeNull();
    expect(oldRows[3]).toHaveAttribute('aria-hidden', 'true');
    expect(newRows[3].querySelector('[data-diff="added"]')).not.toBeNull();
  });

  it('gives each split-view side its own labelled, sideways-scrolling table', () => {
    const {container} = render(<DiffViewer file={FILE} viewMode="split" />);
    const oldPane = screen.getByRole('group', {name: 'Original code'});
    const newPane = screen.getByRole('group', {name: 'Changed code'});
    expect(within(oldPane).getByRole('table')).toBeInTheDocument();
    expect(within(newPane).getByRole('table')).toBeInTheDocument();
    expect(oldPane).toHaveAttribute('data-scroll-axis', 'inline');
    // The shared viewport only scrolls vertically in split view.
    expect(
      container.querySelector('[data-scroll-axis="block"]'),
    ).toContainElement(oldPane);
  });

  it('hides the line-number gutters when hasLineNumbers is false', () => {
    const {container} = render(
      <DiffViewer file={FILE} hasLineNumbers={false} />,
    );
    const firstLine = codeRows(container)[1];
    expect(firstLine.querySelectorAll('td')).toHaveLength(2);
  });

  it('collapses and expands from the header', async () => {
    const user = userEvent.setup();
    const onCollapsedChange = vi.fn();
    const {container} = render(
      <DiffViewer file={FILE} onCollapsedChange={onCollapsedChange} />,
    );
    const toggle = screen.getByRole('button', {name: 'src/greet.ts'});
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const regionId = toggle.getAttribute('aria-controls');
    expect(regionId).toBeTruthy();
    expect(container.querySelector(`[id="${regionId}"]`)).not.toBeNull();

    await user.click(toggle);
    expect(onCollapsedChange).toHaveBeenLastCalledWith(true);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(container.querySelector('table')).toBeNull();

    await user.click(toggle);
    expect(onCollapsedChange).toHaveBeenLastCalledWith(false);
    expect(container.querySelector('table')).not.toBeNull();
  });

  it('follows a controlled collapsed state', async () => {
    const user = userEvent.setup();
    const onCollapsedChange = vi.fn();
    const {container} = render(
      <DiffViewer
        file={FILE}
        isCollapsed
        onCollapsedChange={onCollapsedChange}
      />,
    );
    await user.click(screen.getByRole('button', {name: 'src/greet.ts'}));
    expect(onCollapsedChange).toHaveBeenCalledWith(false);
    // Still collapsed: the caller owns the state.
    expect(container.querySelector('table')).toBeNull();
  });

  it('renders the path as plain text when not collapsible', () => {
    render(<DiffViewer file={FILE} isCollapsible={false} />);
    expect(
      screen.queryByRole('button', {name: 'src/greet.ts'}),
    ).not.toBeInTheDocument();
    expect(screen.getByText('src/greet.ts')).toBeInTheDocument();
  });

  it('renders annotation rows under the lines they belong to', () => {
    const seen: DiffViewerLineRef[] = [];
    const {container} = render(
      <DiffViewer
        file={FILE}
        renderLineAnnotation={ref => {
          seen.push(ref);
          return ref.side === 'new' && ref.lineNumber === 2 ? (
            <p>Nice rename</p>
          ) : null;
        }}
      />,
    );
    expect(screen.getByText('Nice rename')).toBeInTheDocument();
    // Called for every line, with the canonical side (deduped: a render may
    // repeat).
    expect([
      ...new Set(seen.map(ref => `${ref.side}${ref.lineNumber}`)),
    ]).toEqual(['new1', 'old2', 'new2', 'new3', 'new4', 'new5']);
    const rows = codeRows(container);
    const noteRow = rows.findIndex(row => row.textContent === 'Nice rename');
    expect(
      rows[noteRow - 1].querySelector('td[data-diff="added"]')?.textContent,
    ).toBe("  const greeting = 'Hello';");
  });

  it('draws no annotation row when the callback returns false', () => {
    for (const viewMode of ['unified', 'split'] as const) {
      const {container, unmount} = render(
        <DiffViewer
          file={FILE}
          viewMode={viewMode}
          renderLineAnnotation={ref =>
            ref.side === 'new' && ref.lineNumber === 2 && <p>Only note</p>
          }
        />,
      );
      expect(screen.getByText('Only note')).toBeInTheDocument();
      // One annotation row on top of the line rows of each view.
      if (viewMode === 'unified') {
        expect(codeRows(container)).toHaveLength(8);
      } else {
        expect(paneRows(container, 'old')).toHaveLength(7);
        expect(paneRows(container, 'new')).toHaveLength(7);
      }
      unmount();
    }
  });

  it('places split-view annotations on their own side', () => {
    const {container} = render(
      <DiffViewer
        file={FILE}
        viewMode="split"
        renderLineAnnotation={ref =>
          ref.side === 'old' && ref.lineNumber === 2 ? <p>Old note</p> : null
        }
      />,
    );
    const note = screen.getByText('Old note');
    const oldRows = paneRows(container, 'old');
    const newRows = paneRows(container, 'new');
    const noteRow = oldRows.findIndex(row => row.contains(note));
    // Right under the removed line, with an empty, hidden row facing it.
    expect(
      oldRows[noteRow - 1].querySelector('[data-diff="removed"]'),
    ).not.toBeNull();
    expect(newRows[noteRow]).toHaveAttribute('aria-hidden', 'true');
    expect(newRows[noteRow].textContent).toBe('');
    expect(oldRows).toHaveLength(7);
    expect(newRows).toHaveLength(7);
  });

  it('makes line numbers buttons that report their line', async () => {
    const user = userEvent.setup();
    const onLineNumberClick = vi.fn();
    render(<DiffViewer file={FILE} onLineNumberClick={onLineNumberClick} />);
    await user.click(screen.getByRole('button', {name: 'Changed line 3'}));
    expect(onLineNumberClick).toHaveBeenCalledTimes(1);
    const [ref] = onLineNumberClick.mock.calls[0] as [DiffViewerLineRef];
    expect(ref).toMatchObject({side: 'new', lineNumber: 3, hunkIndex: 0});
    expect(ref.line.kind).toBe('added');

    await user.click(screen.getByRole('button', {name: 'Original line 2'}));
    expect(onLineNumberClick.mock.calls[1][0]).toMatchObject({
      side: 'old',
      lineNumber: 2,
    });
  });

  it('makes only the anchor side of each line a button, labelled with the line it reports', async () => {
    const user = userEvent.setup();
    for (const viewMode of ['unified', 'split'] as const) {
      const onLineNumberClick = vi.fn();
      const {unmount} = render(
        <DiffViewer
          file={FILE}
          viewMode={viewMode}
          onLineNumberClick={onLineNumberClick}
        />,
      );
      const buttons = screen
        .getAllByRole('button')
        .filter(b => b.hasAttribute('data-diff-line-button'));
      // One per line: 4 context (new side), 1 removed (old), 2 added (new).
      expect(buttons).toHaveLength(6);
      for (const button of buttons) {
        await user.click(button);
        const [ref] = onLineNumberClick.mock.lastCall as [DiffViewerLineRef];
        const side = ref.side === 'old' ? 'Original' : 'Changed';
        expect(button).toHaveAccessibleName(`${side} line ${ref.lineNumber}`);
      }
      // A context line's old number is plain text, not a second button.
      expect(
        screen.queryByRole('button', {name: 'Original line 1'}),
      ).not.toBeInTheDocument();
      unmount();
    }
  });

  it('names every column for assistive technology', () => {
    const {unmount} = render(<DiffViewer file={FILE} />);
    expect(
      screen.getAllByRole('columnheader').map(th => th.textContent),
    ).toEqual([
      'Original line number',
      'Changed line number',
      'Change',
      'Code',
    ]);
    unmount();

    render(<DiffViewer file={FILE} viewMode="split" hasLineNumbers={false} />);
    expect(
      screen.getAllByRole('columnheader').map(th => th.textContent),
    ).toEqual(['Change', 'Original code', 'Change', 'Changed code']);
  });

  it('keeps every line-number button in the Tab order with no arrow-key movement', async () => {
    const user = userEvent.setup();
    render(<DiffViewer file={FILE} onLineNumberClick={() => {}} />);
    const buttons = screen
      .getAllByRole('button')
      .filter(b => b.hasAttribute('data-diff-line-button'));
    expect(buttons.length).toBeGreaterThan(2);
    expect(buttons.every(b => b.tabIndex === 0)).toBe(true);

    buttons[0].focus();
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(buttons[0]);
    await user.tab();
    expect(document.activeElement).toBe(buttons[1]);
  });

  it('scrolls the split panes sideways in lockstep when unwrapped', () => {
    const {container} = render(<DiffViewer file={FILE} viewMode="split" />);
    const oldPane = container.querySelector<HTMLElement>(
      '[data-diff-pane="old"]',
    )!;
    const newPane = container.querySelector<HTMLElement>(
      '[data-diff-pane="new"]',
    )!;
    oldPane.scrollLeft = 120;
    fireEvent.scroll(oldPane);
    expect(newPane.scrollLeft).toBe(120);
    // The echo on the other pane is not mirrored back.
    fireEvent.scroll(newPane);
    expect(oldPane.scrollLeft).toBe(120);

    newPane.scrollLeft = 40;
    fireEvent.scroll(newPane);
    expect(oldPane.scrollLeft).toBe(40);
  });

  it('lays out the hunk header with the same width on both split sides', () => {
    const {container} = render(<DiffViewer file={FILE} viewMode="split" />);
    const [oldHeader, newHeader] = (['old', 'new'] as const).map(
      side => paneRows(container, side)[0],
    );
    expect(oldHeader.textContent).toBe('@@ -1,4 +1,5 @@');
    // The new side holds an invisible copy for width plus one for screen
    // readers.
    expect(newHeader.querySelector('[aria-hidden="true"]')?.textContent).toBe(
      '@@ -1,4 +1,5 @@',
    );
  });

  it('sizes both split panes to the widest line of either side', () => {
    const {container, rerender} = render(
      <DiffViewer file={FILE} viewMode="split" />,
    );
    const widest = 'export function greet(name: string) {';
    for (const side of ['old', 'new']) {
      const sizer = container.querySelector(
        `[data-diff-pane="${side}"] [data-diff-sizer]`,
      );
      expect(sizer?.textContent).toBe(widest);
    }
    // Wrapped panes never scroll sideways: no sizer row.
    rerender(<DiffViewer file={FILE} viewMode="split" isWrapped />);
    expect(container.querySelector('[data-diff-sizer]')).toBeNull();
  });

  it('turns off sideways overscroll only while code overflows sideways', () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => frames.push(callback)),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    // jsdom does not resolve the hook's overflow custom properties: report
    // every scroller as scroll-capable so its geometry alone decides.
    const nativeGetComputedStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation(element => {
      const computed = nativeGetComputedStyle(element);
      return new Proxy(computed, {
        get(target, property) {
          if (property === 'overflowX' || property === 'overflowY') {
            return 'auto';
          }
          return Reflect.get(target, property, target);
        },
      });
    });
    // jsdom lays nothing out: give a scroller its geometry, then let the
    // scrollable-area hook remeasure it.
    function measure(element: HTMLElement, scrollWidth: number) {
      for (const [key, value] of Object.entries({
        clientWidth: 100,
        clientHeight: 100,
        scrollWidth,
        scrollHeight: 100,
        scrollLeft: 0,
        scrollTop: 0,
      })) {
        Object.defineProperty(element, key, {configurable: true, value});
      }
      act(() => {
        element.dispatchEvent(new Event('scroll'));
        frames.splice(0).forEach(callback => callback(performance.now()));
      });
    }
    try {
      const {container, rerender} = render(<DiffViewer file={FILE} />);
      const viewport = container.querySelector<HTMLElement>(
        '[data-scroll-axis="both"]',
      );
      if (viewport == null) {
        throw new Error('missing viewport');
      }
      // Fits: sideways gestures reach the page.
      measure(viewport, 100);
      expect(viewport.style.overscrollBehaviorX).not.toBe('none');
      // Overflows sideways: no bounce, no swipe navigation.
      measure(viewport, 180);
      expect(viewport.style.overscrollBehaviorX).toBe('none');

      rerender(<DiffViewer file={FILE} viewMode="split" maxHeight={100} />);
      // Split view's shared viewport only scrolls vertically.
      const blockViewport = container.querySelector<HTMLElement>(
        '[data-scroll-axis="block"]',
      );
      if (blockViewport == null) {
        throw new Error('missing split viewport');
      }
      measure(blockViewport, 180);
      expect(blockViewport.style.overscrollBehaviorX).not.toBe('none');
      for (const pane of container.querySelectorAll<HTMLElement>(
        '[data-diff-pane]',
      )) {
        measure(pane, 180);
        expect(pane.style.overscrollBehaviorX).toBe('none');
      }
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  });

  it('highlights the changed words of a paired line', () => {
    const [file] = parseUnifiedDiff(
      patchOf('const total = price * qty;', 'const total = price * quantity;'),
    );
    const {container} = render(<DiffViewer file={file} />);
    expect(changedText(container, 'removed')).toEqual(['qty']);
    expect(changedText(container, 'added')).toEqual(['quantity']);
    // Highlighting keeps the line's text and its syntax paint intact.
    expect(container.querySelector('[data-diff="added"]')?.textContent).toBe(
      'const total = price * quantity;',
    );
    expect(container.querySelector('.astryx-token-keyword')).not.toBeNull();
  });

  it('joins changed words separated only by whitespace', () => {
    const [file] = parseUnifiedDiff(
      patchOf('call(alpha beta, x, y, z)', 'call(gamma delta, x, y, z)'),
    );
    const {container} = render(<DiffViewer file={file} />);
    expect(changedText(container, 'removed')).toEqual(['alpha beta']);
    expect(changedText(container, 'added')).toEqual(['gamma delta']);
  });

  it('highlights changed characters with inlineHighlight="char"', () => {
    const [file] = parseUnifiedDiff(
      patchOf('let qty = 1;', 'let quantity = 1;'),
    );
    const {container} = render(
      <DiffViewer file={file} inlineHighlight="char" viewMode="split" />,
    );
    expect(changedText(container, 'removed')).toEqual([]);
    expect(changedText(container, 'added').join('')).toHaveLength(5);
  });

  it('skips the inline highlight for unrelated lines and when turned off', () => {
    const [unrelated] = parseUnifiedDiff(patchOf('foo()', 'return 42;'));
    const {container, unmount} = render(<DiffViewer file={unrelated} />);
    expect(container.querySelector('[data-diff-change]')).toBeNull();
    unmount();

    const [file] = parseUnifiedDiff(patchOf('let a = 1;', 'let a = 2;'));
    const view = render(<DiffViewer file={file} inlineHighlight="none" />);
    expect(view.container.querySelector('[data-diff-change]')).toBeNull();
  });

  it('marks changed lines with bars or no indicator, still named for assistive technology', () => {
    for (const changeIndicator of ['bars', 'none'] as const) {
      const {container, unmount} = render(
        <DiffViewer file={FILE} changeIndicator={changeIndicator} />,
      );
      const glyphs = Array.from(
        container.querySelectorAll('span[aria-hidden="true"]'),
      ).filter(span => span.textContent === '+' || span.textContent === '-');
      expect(glyphs).toHaveLength(0);
      expect(container.querySelectorAll('[data-diff-bar]')).toHaveLength(
        changeIndicator === 'bars' ? 3 : 0,
      );
      expect(screen.getAllByText('Added')).toHaveLength(2);
      expect(screen.getAllByText('Removed')).toHaveLength(1);
      unmount();
    }
  });

  it('drops the row tint when hasChangeBackground is false', () => {
    const {container, rerender} = render(<DiffViewer file={FILE} />);
    const tinted = container.querySelector('[data-diff="added"]')?.className;
    rerender(<DiffViewer file={FILE} hasChangeBackground={false} />);
    const plain = container.querySelector('[data-diff="added"]')?.className;
    expect(plain).not.toBe(tinted);
    // The change is still marked in text.
    expect(screen.getAllByText('Added')).toHaveLength(2);
  });

  it('shows the file status and the rename path', () => {
    const [renamed] = parseUnifiedDiff(
      'diff --git a/a.ts b/b.ts\nrename from a.ts\nrename to b.ts\n',
    );
    render(<DiffViewer file={renamed} />);
    expect(screen.getByText('Renamed')).toBeInTheDocument();
    expect(screen.getByText('a.ts → b.ts')).toBeInTheDocument();
    expect(screen.getByText('No content changes')).toBeInTheDocument();
  });

  it('shows a message for binary files', () => {
    const [binary] = parseUnifiedDiff(
      'diff --git a/x.png b/x.png\nBinary files a/x.png and b/x.png differ\n',
    );
    render(<DiffViewer file={binary} />);
    expect(screen.getByText('Binary file not shown')).toBeInTheDocument();
  });

  it('renders the headerEnd slot', () => {
    render(
      <DiffViewer
        file={FILE}
        headerEnd={<button type="button">Viewed</button>}
      />,
    );
    const header = screen
      .getByText('src/greet.ts')
      .closest('.astryx-diff-viewer-header');
    expect(header).not.toBeNull();
    expect(
      within(header as HTMLElement).getByRole('button', {name: 'Viewed'}),
    ).toBeInTheDocument();
  });

  it('forwards ref, className, and DOM props to the root', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <DiffViewer
        ref={ref}
        file={FILE}
        className="custom"
        data-testid="viewer"
        viewMode="split"
      />,
    );
    const root = screen.getByTestId('viewer');
    expect(ref.current).toBe(root);
    expect(root).toHaveClass('custom');
    expect(root).toHaveClass('astryx-diff-viewer');
    expect(root).toHaveAttribute('data-view-mode', 'split');
  });
});
