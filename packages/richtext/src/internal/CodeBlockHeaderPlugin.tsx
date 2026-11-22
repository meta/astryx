// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file CodeBlockHeaderPlugin.tsx
 * @input Uses @lexical/react (composer context), @lexical/code (CodeNode),
 *   lexical, core IconButton, Icon, useClipboard, useTranslator and
 *   observeResize, which watches the editor root and each header and only
 *   schedules the measure frame.
 * @output Exports CodeBlockHeaderPlugin, which draws core CodeBlock's header
 *   over every fenced code block: the language label and a copy button, or
 *   just the copy button in the corner when the block names no language.
 * @position Rendered by RichTextEditor and RichTextView inside the positioned
 *   element that holds the content editable. The headers are siblings of the
 *   editable text, never inside it, so they are not part of the document and
 *   cannot be edited (spec:AST-061 FR8, DEC-4). The code block's theme class
 *   reserves the header's drawn height, which this plugin writes on the block,
 *   so the code sits where core Markdown's does.
 */

import * as stylex from '@stylexjs/stylex';
import {useCallback, useEffect, useRef, useState, type JSX} from 'react';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {$isCodeNode} from '@lexical/code';
import {$getNodeByKey, $getRoot} from 'lexical';
import {Icon} from '@astryxdesign/core/Icon';
import {IconButton} from '@astryxdesign/core/IconButton';
import {useClipboard} from '@astryxdesign/core/hooks';
import {useTranslator} from '@astryxdesign/core/i18n';
import {observeResize} from '@astryxdesign/core/utils';
import type {CodeLanguage} from '@astryxdesign/core/CodeBlock';
import {listedLanguage} from '../codeLanguages';
import {
  fontWeightVars,
  spacingVars,
  typeScaleVars,
  typographyVars,
} from '@astryxdesign/core/theme/tokens.stylex';

/** Where one code block's header goes, in the container's coordinates. */
interface HeaderPlacement {
  readonly key: string;
  readonly language: string | null;
  readonly top: number;
  readonly left: number;
  readonly width: number;
}

const styles = stylex.create({
  // Core CodeBlock's compact header row: 8px above and below a small control,
  // 16px at the sides.
  header: {
    position: 'absolute',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBlock: spacingVars['--spacing-2'],
    paddingInline: spacingVars['--spacing-4'],
    boxSizing: 'border-box',
  },
  // No language: the copy button alone, 8px from the top end corner.
  corner: {
    position: 'absolute',
    display: 'flex',
    justifyContent: 'flex-end',
    padding: spacingVars['--spacing-2'],
    boxSizing: 'border-box',
    pointerEvents: 'none',
  },
  cornerButton: {
    pointerEvents: 'auto',
  },
  // A long label wraps and keeps its own spacing, as core CodeBlock's title
  // does. The header grows with it.
  title: {
    fontSize: typeScaleVars['--text-supporting-size'],
    fontFamily: typographyVars['--font-family-code'],
    fontWeight: fontWeightVars['--font-weight-medium'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    color: 'var(--color-syntax-comment)',
    minWidth: 0,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    '--_astryx-text-overflow-wrap': 'anywhere',
  },
  copyButton: {
    color: 'var(--color-syntax-comment)',
  },
  placement: (top: number, left: number, width: number) => ({
    top,
    // eslint-disable-next-line @astryx/no-physical-properties -- intentional: `left` is a measured viewport coordinate (`box.left - origin.left + element.clientLeft`), not an authored edge. `insetInlineStart` would resolve to the right edge in RTL and place the header off the block.
    left,
    width,
  }),
});

/**
 * The language a header names, as core CodeBlock decides it: none for a fence
 * without one, and none for exactly `plaintext`, which core Markdown gives a
 * fence with no info string.
 */
function displayLanguageOf(language: string | null | undefined): string | null {
  return language == null || language === '' || language === PLAIN_TEXT
    ? null
    : language;
}

const PLAIN_TEXT = 'plaintext';

function samePlacements(
  a: ReadonlyArray<HeaderPlacement>,
  b: ReadonlyArray<HeaderPlacement>,
): boolean {
  return (
    a.length === b.length &&
    a.every(
      (placement, index) =>
        placement.key === b[index].key &&
        placement.language === b[index].language &&
        placement.top === b[index].top &&
        placement.left === b[index].left &&
        placement.width === b[index].width,
    )
  );
}

function CodeBlockHeader({
  placement,
  label,
  registerHeader,
}: {
  readonly placement: HeaderPlacement;
  /** The matched language value's name, when a listed value claims the fence. */
  readonly label?: string;
  /** Hands the plugin the drawn header, which its block reserves room for. */
  readonly registerHeader: (key: string, parts: HeaderParts) => () => void;
}): JSX.Element {
  const [editor] = useLexicalComposerContext();
  const t = useTranslator();
  const {copy, isCopied} = useClipboard({
    announce: t('@astryx.codeBlock.copied'),
  });
  const copyButton = (
    <IconButton
      variant="ghost"
      size="sm"
      icon={
        <Icon icon={isCopied ? 'check' : 'copy'} size="sm" color="inherit" />
      }
      tooltip={t('@astryx.codeBlock.copyCode')}
      label={
        isCopied
          ? t('@astryx.codeBlock.copied')
          : t('@astryx.codeBlock.copyCode')
      }
      onClick={() => {
        const code = editor
          .getEditorState()
          .read(() => $getNodeByKey(placement.key)?.getTextContent() ?? '');
        void copy(code);
      }}
      xstyle={[
        styles.copyButton,
        placement.language == null && styles.cornerButton,
      ]}
    />
  );
  const position = styles.placement(
    placement.top,
    placement.left,
    placement.width,
  );
  const titleRef = useRef<HTMLSpanElement>(null);
  // React attaches a child's ref before its parent's, so the label is set
  // when the header's ref runs.
  const headerRef = useCallback(
    (header: HTMLDivElement | null) => {
      const title = titleRef.current;
      return header == null || title == null
        ? undefined
        : registerHeader(placement.key, {header, title});
    },
    [registerHeader, placement.key],
  );
  if (placement.language == null) {
    return (
      <div
        data-richtext-code-header=""
        {...stylex.props(styles.corner, position)}>
        {copyButton}
      </div>
    );
  }
  return (
    <div
      ref={headerRef}
      data-richtext-code-header=""
      {...stylex.props(styles.header, position)}>
      <span ref={titleRef} {...stylex.props(styles.title)}>
        {label ?? placement.language}
      </span>
      {copyButton}
    </div>
  );
}

/** The variable the code block's theme class reserves the header with. */
const HEADER_BLOCK_SIZE = '--_richtext-code-header-block-size';
/** The variable the code block's theme class takes its least width from. */
const HEADER_INLINE_SIZE = '--_richtext-code-header-inline-size';

/** A drawn language header and its label. */
interface HeaderParts {
  header: HTMLDivElement;
  title: HTMLSpanElement;
}

/**
 * The header's width with its label on one line: its padding, the gaps, the
 * controls beside the label, and the label's one-line width.
 */
function naturalWidth({header, title}: HeaderParts, label: number): number {
  const style = getComputedStyle(header);
  // A control's tooltip layer, its marker or a dialog sits beside it in the
  // header but takes no room in the row.
  const others = [...header.children].filter(
    child => child !== title && !child.matches('[popover], template, dialog'),
  );
  const gap = parseFloat(style.columnGap) || 0;
  return (
    parseFloat(style.paddingInlineStart) +
    parseFloat(style.paddingInlineEnd) +
    others.reduce((sum, child) => sum + (child as HTMLElement).offsetWidth, 0) +
    gap * others.length +
    label
  );
}

/**
 * The width of `title`'s text on one line, in its own font, or null where no
 * canvas measures text (a DOM without layout). Chromium returns an empty
 * `font` shorthand when the text inherits a font-variant, feature-settings or
 * kerning value. So the font is built from its longhands. Letter spacing is
 * added per character. Core's table measure works the same way. Core's
 * internal entries are for Core and Lab only, so RichText keeps this copy.
 */
function oneLineWidth(
  title: HTMLSpanElement,
  canvas: {current: CanvasRenderingContext2D | null | undefined},
): number | null {
  if (canvas.current === undefined) {
    canvas.current = document.createElement('canvas').getContext('2d');
  }
  const context = canvas.current;
  if (context == null) {
    return null;
  }
  const style = getComputedStyle(title);
  if (style.fontSize === '' || style.fontFamily === '') {
    return null;
  }
  context.font = [style.fontStyle, style.fontWeight, style.fontSize]
    .filter(part => part !== '')
    .concat(style.fontFamily)
    .join(' ');
  const text = title.textContent ?? '';
  const spacing =
    style.letterSpacing === 'normal' ? 0 : parseFloat(style.letterSpacing) || 0;
  return context.measureText(text).width + spacing * text.length;
}

/**
 * Draws a header over each top-level code block and keeps it there as the
 * document, the editor's size, or the window changes.
 */
export function CodeBlockHeaderPlugin({
  codeLanguages,
}: {
  /** Language values a fence may name; a matched fence shows the value's name. */
  codeLanguages?: ReadonlyArray<CodeLanguage>;
} = {}): JSX.Element {
  const [editor] = useLexicalComposerContext();
  const [placements, setPlacements] = useState<ReadonlyArray<HeaderPlacement>>(
    [],
  );
  // The drawn language headers, by code block key. The measure frame reads
  // their sizes with the blocks' boxes. Then it writes each size on its block.
  // The block's top padding reserves the height, and its least width is the
  // header's own.
  const headersRef = useRef(new Map<string, HeaderParts>());
  const canvasRef = useRef<CanvasRenderingContext2D | null | undefined>(
    undefined,
  );
  const scheduleRef = useRef<(() => void) | null>(null);
  const registerHeader = useCallback(
    (key: string, parts: HeaderParts) => {
      headersRef.current.set(key, parts);
      // A header that wraps to a new line count measures again; the shared
      // observer only schedules the frame.
      const unobserve = observeResize(parts.header, () =>
        scheduleRef.current?.(),
      );
      return () => {
        unobserve();
        if (headersRef.current.get(key) === parts) {
          headersRef.current.delete(key);
        }
        const block = editor.getElementByKey(key);
        block?.style.removeProperty(HEADER_BLOCK_SIZE);
        block?.style.removeProperty(HEADER_INLINE_SIZE);
      };
    },
    [editor],
  );

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const root = editor.getRootElement();
      const container = root?.parentElement;
      if (root == null || container == null) {
        setPlacements(current => (current.length === 0 ? current : []));
        return;
      }
      const origin = container.getBoundingClientRect();
      // Each header's drawn height, and the width it takes with its label
      // on one line, border included, as core's frame grows to fit it.
      const sizes = [...headersRef.current].map(([key, parts]) => {
        const block = editor.getElementByKey(key);
        const border =
          block == null ? 0 : block.offsetWidth - block.clientWidth;
        const label = oneLineWidth(parts.title, canvasRef);
        return {
          key,
          block,
          height: `${parts.header.offsetHeight}px`,
          width:
            label == null
              ? null
              : `${Math.ceil(naturalWidth(parts, label) + border)}px`,
        };
      });
      const next = editor.getEditorState().read(() =>
        $getRoot()
          .getChildren()
          .filter($isCodeNode)
          .flatMap(node => {
            const element = editor.getElementByKey(node.getKey());
            if (element == null) {
              return [];
            }
            const box = element.getBoundingClientRect();
            // Inside the block's border, so the header lines up with the
            // padding the theme reserves for it.
            return [
              {
                key: node.getKey(),
                language: displayLanguageOf(node.getLanguage()),
                top: box.top - origin.top + element.clientTop,
                left: box.left - origin.left + element.clientLeft,
                width: element.clientWidth,
              },
            ];
          }),
      );
      // Writes after every read in this frame. A block that grows moves the
      // blocks below it; the root's resize measures them again next frame.
      for (const {block, height, width} of sizes) {
        if (block == null) {
          continue;
        }
        if (block.style.getPropertyValue(HEADER_BLOCK_SIZE) !== height) {
          block.style.setProperty(HEADER_BLOCK_SIZE, height);
        }
        if (
          width != null &&
          block.style.getPropertyValue(HEADER_INLINE_SIZE) !== width
        ) {
          block.style.setProperty(HEADER_INLINE_SIZE, width);
        }
      }
      setPlacements(current =>
        samePlacements(current, next) ? current : next,
      );
    };
    const schedule = () => {
      if (frame === 0) {
        frame = requestAnimationFrame(measure);
      }
    };
    scheduleRef.current = schedule;
    let unobserveRoot: (() => void) | null = null;
    const unregisterRoot = editor.registerRootListener(root => {
      unobserveRoot?.();
      unobserveRoot = root == null ? null : observeResize(root, schedule);
      schedule();
    });
    const unregisterUpdate = editor.registerUpdateListener(schedule);
    window.addEventListener('resize', schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      unobserveRoot?.();
      scheduleRef.current = null;
      unregisterRoot();
      unregisterUpdate();
      window.removeEventListener('resize', schedule);
    };
  }, [editor]);

  return (
    <>
      {placements.map(placement => (
        <CodeBlockHeader
          key={placement.key}
          placement={placement}
          registerHeader={registerHeader}
          // A fence matched in `codeLanguages` shows the value's name, as
          // Markdown does (spec:AST-061).
          label={
            placement.language == null
              ? undefined
              : listedLanguage(codeLanguages, placement.language)?.name
          }
        />
      ))}
    </>
  );
}
