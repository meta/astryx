// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @input Real block DecoratorNode inside RichTextEditor, Popover and Tooltip.
 * @output Browser fixtures for owned popup containment and live editor direction.
 * @position Core Layer integration regression stories.
 */
import {useState, type ReactNode} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {expect, userEvent, waitFor, within} from 'storybook/test';
import {DecoratorNode, type NodeKey} from 'lexical';
import {RichTextEditor} from '@astryxdesign/richtext';
import {Popover} from '@astryxdesign/core/Popover';
import {Tooltip} from '@astryxdesign/core/Tooltip';
import {Button} from '@astryxdesign/core/Button';

class BoundaryControlsNode extends DecoratorNode<ReactNode> {
  static getType() {
    return 'boundary-controls';
  }
  static clone(node: BoundaryControlsNode) {
    return new BoundaryControlsNode(node.__key);
  }
  constructor(key?: NodeKey) {
    super(key);
  }
  static importJSON() {
    return new BoundaryControlsNode();
  }
  isInline() {
    return false;
  }
  createDOM() {
    const element = document.createElement('div');
    element.contentEditable = 'false';
    return element;
  }
  updateDOM() {
    return false;
  }
  decorate() {
    return (
      <>
        <Popover
          label="Outer"
          content={
            <span>
              <Popover
                label="Inner"
                content={
                  <>
                    <Button label="Inner first" />
                    <Button label="Inner second" />
                  </>
                }>
                <Button label="Open inner" />
              </Popover>
            </span>
          }>
          <Button label="Open outer" />
        </Popover>
        <span>
          <Tooltip content="Direction hint" isOpen>
            <Button label="Direction trigger" />
          </Tooltip>
        </span>
      </>
    );
  }
}
const nodes = [BoundaryControlsNode];
const INITIAL_CONTROLS = JSON.stringify({
  root: {
    type: 'root',
    version: 1,
    direction: null,
    format: '',
    indent: 0,
    children: [{type: 'boundary-controls', version: 1}],
  },
});
const meta: Meta = {title: 'Core/Layer', tags: ['no-visual']};
export default meta;
export const BoundaryNestedFocus: StoryObj = {
  render: () => (
    <RichTextEditor
      label="Popup editor"
      nodes={nodes}
      defaultValue={INITIAL_CONTROLS}
    />
  ),
};
function DirectionProbe() {
  const [direction, setDirection] = useState('rtl');
  return (
    <>
      <Button label="Change direction" onClick={() => setDirection('ltr')} />
      <RichTextEditor
        label="Direction editor"
        nodes={nodes}
        defaultValue={INITIAL_CONTROLS}
        dir={direction}
      />
    </>
  );
}
export const BoundaryLiveDirection: StoryObj = {
  render: () => <DirectionProbe />,
};

export const BoundaryNestedFocusGuard: StoryObj = {
  ...BoundaryNestedFocus,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole('button', {name: 'Open outer'}),
    );
    await userEvent.click(
      await canvas.findByRole('button', {name: 'Open inner'}),
    );
    await waitFor(() => {
      const outer = canvas.getByRole('dialog', {name: 'Outer'});
      const inner = canvas.getByRole('dialog', {name: 'Inner'});
      expect(outer).toContainElement(inner);
    });
  },
};

export const BoundaryLiveDirectionGuard: StoryObj = {
  ...BoundaryLiveDirection,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement);
    const tooltip = await canvas.findByRole('tooltip', {
      name: 'Direction hint',
    });
    await waitFor(() =>
      expect(getComputedStyle(tooltip).direction).toBe('rtl'),
    );
    await userEvent.click(
      canvas.getByRole('button', {name: 'Change direction'}),
    );
    await waitFor(() =>
      expect(getComputedStyle(tooltip).direction).toBe('ltr'),
    );
  },
};
