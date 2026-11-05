// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file CodeBlockHeaderPlugin.tsx
 * @input Uses @lexical/react (composer context), @lexical/code (CodeNode),
 *   lexical, and core IconButton, Icon, useClipboard, and useTranslator.
 * @output Exports CodeBlockHeaderPlugin, which draws core CodeBlock's header
 *   over every fenced code block: the language label and a copy button, or
 *   just the copy button in the corner when the block names no language.
 * @position Rendered by RichTextEditor and RichTextView inside the positioned
 *   element that holds the content editable. The headers are siblings of the
 *   editable text, never inside it, so they are not part of the document and
 *   cannot be edited (spec:AST-061 FR8, DEC-4). The code block's theme class
 *   reserves the header's height, so the code sits where core Markdown's does.
 */

import * as stylex from '@stylexjs/stylex';
import {useEffect, useState, type JSX} from 'react';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {$isCodeNode} from '@lexical/code';
import {$getNodeByKey, $getRoot} from 'lexical';
import {Icon} from '@astryxdesign/core/Icon';
import {IconButton} from '@astryxdesign/core/IconButton';
import {useClipboard} from '@astryxdesign/core/hooks';
import {useTranslator} from '@astryxdesign/core/i18n';
import type {CodeLanguage} from '@astryxdesign/core/CodeBlock';
import {listedLanguage} from './codeLanguages';
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
  title: {
    fontSize: typeScaleVars['--text-supporting-size'],
    fontFamily: typographyVars['--font-family-code'],
    fontWeight: fontWeightVars['--font-weight-medium'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    color: 'var(--color-syntax-comment)',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
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
}: {
  readonly placement: HeaderPlacement;
  /** The matched language value's name, when a listed value claims the fence. */
  readonly label?: string;
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
      data-richtext-code-header=""
      {...stylex.props(styles.header, position)}>
      <span {...stylex.props(styles.title)}>{label ?? placement.language}</span>
      {copyButton}
    </div>
  );
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
      setPlacements(current =>
        samePlacements(current, next) ? current : next,
      );
    };
    const schedule = () => {
      if (frame === 0) {
        frame = requestAnimationFrame(measure);
      }
    };
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(schedule);
    const unregisterRoot = editor.registerRootListener(root => {
      observer?.disconnect();
      if (root != null) {
        observer?.observe(root);
      }
      schedule();
    });
    const unregisterUpdate = editor.registerUpdateListener(schedule);
    window.addEventListener('resize', schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
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
