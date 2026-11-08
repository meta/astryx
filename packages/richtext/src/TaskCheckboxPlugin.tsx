// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TaskCheckboxPlugin.tsx
 * @input Uses @lexical/react (composer context), @lexical/list, lexical, and
 *   core CheckboxInput.
 * @output Exports TaskCheckboxPlugin, which draws a real checkbox beside every
 *   task list item: toggling it, or Mod+Enter in the item, checks the item in
 *   the editor, and it is read-only in RichTextView.
 * @position Rendered by RichTextEditor and RichTextView inside the positioned
 *   element that holds the content editable, like core Markdown's task lists
 *   (spec:AST-061 FR5). A list item cannot take the checkbox role (Lexical's
 *   own checkbox lists give it one), and nothing can be added inside the
 *   editable text; so the item stays a list item, marked for the theme to
 *   make room, and the checkbox is a sibling of the editable text, positioned
 *   over the space at the start of the item. Plain items in the same list
 *   keep their markers. The item owns its checkbox (`aria-owns`), so
 *   assistive technology finds the checkbox and its state inside the item, in
 *   document order. The checkboxes take no tab stop of their own, which would
 *   come after the whole document: in the editor, Mod+Enter checks the item
 *   holding the caret, and in the view they are read-only.
 */

import * as stylex from '@stylexjs/stylex';
import {useEffect, useId, useState, type JSX} from 'react';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {$isListItemNode, $isListNode, type ListItemNode} from '@lexical/list';
import {$getNodeByKey, $getRoot, type LexicalNode} from 'lexical';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {
  $getTaskState,
  $setTaskState,
  registerTaskListEditing,
  type TaskState,
} from './markdownTaskList';

/** Where one task item's checkbox goes, in the container's coordinates. */
interface TaskPlacement {
  readonly key: string;
  readonly checked: boolean;
  readonly label: string;
  readonly top: number;
  readonly left: number;
}

const styles = stylex.create({
  checkbox: {
    position: 'absolute',
  },
  placement: (top: number, left: number) => ({
    top,
    // eslint-disable-next-line @astryx/no-physical-properties -- intentional: `left` is a measured viewport coordinate, already resolved for direction above (`isRightToLeft ? box.right - CHECKBOX_SIZE : box.left`). `insetInlineStart` would flip the anchor edge again in RTL and double-correct the offset.
    left,
  }),
});

/** The width of core CheckboxInput's small control. */
const CHECKBOX_SIZE = 20;

/** Marks a task item for the theme (editorTheme.ts). */
export const TASK_ATTRIBUTE = 'data-richtext-task';

/**
 * Every bulleted list item with text of its own, in document order, and
 * whether it is a task (markdownTaskList.ts).
 */
function $bulletItems(): Array<{
  readonly item: ListItemNode;
  readonly task: TaskState | null;
}> {
  const items: Array<{item: ListItemNode; task: TaskState | null}> = [];
  const visit = (node: LexicalNode) => {
    if (!$isListNode(node)) {
      return;
    }
    for (const item of node.getChildren()) {
      if (!$isListItemNode(item)) {
        continue;
      }
      const isWrapper =
        item.getChildrenSize() === 1 && $isListNode(item.getFirstChild());
      if (!isWrapper && node.getListType() !== 'number') {
        items.push({item, task: $getTaskState(item)});
      }
      item.getChildren().forEach(visit);
    }
  };
  $getRoot().getChildren().forEach(visit);
  return items;
}

function samePlacements(
  a: ReadonlyArray<TaskPlacement>,
  b: ReadonlyArray<TaskPlacement>,
): boolean {
  return (
    a.length === b.length &&
    a.every(
      (placement, index) =>
        placement.key === b[index].key &&
        placement.checked === b[index].checked &&
        placement.label === b[index].label &&
        placement.top === b[index].top &&
        placement.left === b[index].left,
    )
  );
}

export function TaskCheckboxPlugin({
  isReadOnly,
}: {
  readonly isReadOnly: boolean;
}): JSX.Element {
  const [editor] = useLexicalComposerContext();
  const idPrefix = useId();
  const [placements, setPlacements] = useState<ReadonlyArray<TaskPlacement>>(
    [],
  );

  // Enter and Mod+Enter in task items (markdownTaskList.ts).
  useEffect(
    () => (isReadOnly ? undefined : registerTaskListEditing(editor)),
    [editor, isReadOnly],
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
        $bulletItems().flatMap(({item, task}) => {
          const element = editor.getElementByKey(item.getKey());
          if (element == null) {
            return [];
          }
          if (task == null) {
            // A plain item keeps its marker and owns no checkbox.
            element.removeAttribute(TASK_ATTRIBUTE);
            element.removeAttribute('aria-owns');
            return [];
          }
          // The checkbox below carries the item's state, so the item keeps
          // the list item role Lexical replaces, and owns the checkbox. The
          // attribute lets the theme drop its marker and make room.
          element.setAttribute(TASK_ATTRIBUTE, '');
          element.removeAttribute('role');
          element.removeAttribute('aria-checked');
          element.removeAttribute('tabindex');
          element.setAttribute(
            'aria-owns',
            `${idPrefix}-task-${item.getKey()}`,
          );
          const box = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          const isRightToLeft = style.direction === 'rtl';
          return [
            {
              key: item.getKey(),
              checked: task === 'checked',
              label: item.getTextContent(),
              top: box.top - origin.top + parseFloat(style.paddingTop || '0'),
              left:
                (isRightToLeft ? box.right - CHECKBOX_SIZE : box.left) -
                origin.left,
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
  }, [editor, idPrefix]);

  return (
    <>
      {placements.map(placement => (
        <div
          key={placement.key}
          id={`${idPrefix}-task-${placement.key}`}
          data-richtext-task-checkbox=""
          {...stylex.props(
            styles.checkbox,
            styles.placement(placement.top, placement.left),
          )}>
          <CheckboxInput
            ref={(input: HTMLInputElement | null) => {
              // No tab stop after the document; see the file header.
              if (input != null) {
                input.tabIndex = -1;
              }
            }}
            size="sm"
            label={placement.label}
            isLabelHidden
            value={placement.checked}
            isReadOnly={isReadOnly}
            onChange={(checked: boolean) => {
              editor.update(() => {
                const node = $getNodeByKey(placement.key);
                if ($isListItemNode(node)) {
                  $setTaskState(node, checked ? 'checked' : 'unchecked');
                }
              });
            }}
          />
        </div>
      ))}
    </>
  );
}
