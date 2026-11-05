// Copyright (c) Meta Platforms, Inc. and affiliates.

/** Storybook fixtures for the accessible name of a scrolling region. */

import type {Meta, StoryObj} from '@storybook/react';
import type {ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  Layout,
  LayoutContent,
  LayoutPanel,
  StackItem,
  VStack,
} from '@astryxdesign/core/Layout';

const styles = stylex.create({
  frame: {
    height: 240,
  },
});

const LINES = Array.from({length: 40}, (_, index) => `Line ${index + 1}`);

/**
 * The lines are buttons, realistic focusable content: a keyboard reaches the
 * scrolling content without a tab stop on the region.
 */
function Lines() {
  return LINES.map(line => (
    <p key={line}>
      <button type="button">{line}</button>
    </p>
  ));
}

function Frame({children}: {children: ReactNode}) {
  return <div {...stylex.props(styles.frame)}>{children}</div>;
}

const meta: Meta = {
  title: 'a11y/Scroll region name',
  tags: ['no-visual'],
  parameters: {layout: 'padded'},
};

export default meta;

export const ContentScrolls: StoryObj = {
  render: () => (
    <Frame>
      <Layout
        content={
          <LayoutContent data-scroll-region>
            <Lines />
          </LayoutContent>
        }
      />
    </Frame>
  ),
};

export const ContentFits: StoryObj = {
  render: () => (
    <Frame>
      <Layout
        content={<LayoutContent data-scroll-region>Line 1</LayoutContent>}
      />
    </Frame>
  ),
};

export const ContentLabelled: StoryObj = {
  render: () => (
    <Frame>
      <Layout
        content={
          <LayoutContent data-scroll-region label="Messages">
            <Lines />
          </LayoutContent>
        }
      />
    </Frame>
  ),
};

export const ContentMain: StoryObj = {
  render: () => (
    <Frame>
      <Layout
        content={
          <LayoutContent data-scroll-region role="main">
            <Lines />
          </LayoutContent>
        }
      />
    </Frame>
  ),
};

export const PanelScrolls: StoryObj = {
  render: () => (
    <Frame>
      <Layout
        start={
          <LayoutPanel data-scroll-region hasDivider>
            <Lines />
          </LayoutPanel>
        }
        content={<LayoutContent>Line 1</LayoutContent>}
      />
    </Frame>
  ),
};

export const StackItemScrolls: StoryObj = {
  render: () => (
    <VStack height={240}>
      <StackItem data-scroll-region isScrollable size="fill">
        <Lines />
      </StackItem>
    </VStack>
  ),
};

export const StackItemListScrolls: StoryObj = {
  render: () => (
    <VStack height={240}>
      <StackItem as="ul" data-scroll-region isScrollable size="fill">
        {LINES.map(line => (
          <li key={line}>
            <button type="button">{line}</button>
          </li>
        ))}
      </StackItem>
    </VStack>
  ),
};

export const StackItemStatic: StoryObj = {
  render: () => (
    <VStack height={240}>
      <StackItem data-scroll-region size="fill">
        <Lines />
      </StackItem>
    </VStack>
  ),
};
