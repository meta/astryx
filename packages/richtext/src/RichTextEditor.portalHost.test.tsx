// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file RichTextEditor.portalHost.test.tsx
 * @input Real Lexical decorator nodes and the RichTextEditor ref API.
 * @output Decorator tooltips survive editor reconciliation and clean up on unmount.
 * @position Regression for the RichText integration's declared portal host.
 */

import {describe, expect, it} from 'vitest';
import {act, render, screen, waitFor} from '@testing-library/react';
import {createRef, StrictMode, type ReactNode} from 'react';
import {
  DecoratorNode,
  $getRoot,
  $createParagraphNode,
  type NodeKey,
} from 'lexical';
import {Button} from '@astryxdesign/core/Button';
import {RichTextEditor, type RichTextEditorRef} from './RichTextEditor';

class TooltipNode extends DecoratorNode<ReactNode> {
  static getType() {
    return 'tooltip-control';
  }
  static clone(node: TooltipNode) {
    return new TooltipNode(node.__key);
  }
  constructor(key?: NodeKey) {
    super(key);
  }
  static importJSON() {
    return new TooltipNode();
  }
  createDOM() {
    const element = document.createElement('span');
    element.contentEditable = 'false';
    return element;
  }
  updateDOM() {
    return false;
  }
  decorate() {
    return <Button label="Decorator action" tooltip="Decorator hint" />;
  }
}

const nodes = [TooltipNode];

describe('RichTextEditor portal ownership', () => {
  it.each([false, true])(
    'keeps decorator tooltips outside its managed root (read-only=%s)',
    async isReadOnly => {
      const ref = createRef<RichTextEditorRef>();
      const view = render(
        <StrictMode>
          <RichTextEditor
            ref={ref}
            label="Editor"
            nodes={nodes}
            isReadOnly={isReadOnly}
          />
        </StrictMode>,
      );
      const editor = ref.current?.getEditor();
      expect(editor).toBeDefined();
      if (!editor) {
        throw new Error('Editor did not mount');
      }
      await act(async () => {
        editor.update(
          () => {
            $getRoot()
              .clear()
              .append($createParagraphNode().append(new TooltipNode()));
          },
          {discrete: true},
        );
      });
      const trigger = await screen.findByRole('button', {
        name: 'Decorator action',
      });
      const id = trigger.getAttribute('aria-describedby');
      await waitFor(() => {
        const tooltip = id ? document.getElementById(id) : null;
        expect(tooltip).not.toBeNull();
        expect(
          screen.getByRole('textbox', {name: 'Editor'}),
        ).not.toContainElement(tooltip);
      });
      view.unmount();
      expect(id && document.getElementById(id)).toBeNull();
    },
  );
});
