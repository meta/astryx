// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {expect} from 'storybook/test';
import {Code} from '@astryxdesign/core/Code';
import {Text} from '@astryxdesign/core/Text';
import {Stack} from '@astryxdesign/core/Stack';
import {Link} from '@astryxdesign/core/Link';

const meta: Meta<typeof Code> = {
  title: 'Core/Code',
  component: Code,
  tags: ['autodocs'],
  argTypes: {
    children: {
      control: 'text',
      description: 'Code content',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Code>;

export const Default: Story = {
  tags: ['visual-baseline'],
  args: {
    children: 'const x = 1',
  },
};

export const Colors: Story = {
  render: () => (
    <Stack gap={2}>
      <Text type="body">
        Primary:{' '}
        <Code color="primary" data-testid="code-primary">
          const primary = true
        </Code>
      </Text>
      <Text type="body">
        Secondary:{' '}
        <Code color="secondary" data-testid="code-secondary">
          const secondary = true
        </Code>
      </Text>
      <Text type="body" color="accent" data-testid="inherited-color-parent">
        Inherited:{' '}
        <Code color="inherit" data-testid="code-inherit">
          const inherited = true
        </Code>
      </Text>
    </Stack>
  ),
  play: async ({canvasElement}) => {
    await document.fonts.ready;
    const primary = canvasElement.querySelector<HTMLElement>(
      '[data-testid="code-primary"]',
    );
    const secondary = canvasElement.querySelector<HTMLElement>(
      '[data-testid="code-secondary"]',
    );
    const inherited = canvasElement.querySelector<HTMLElement>(
      '[data-testid="code-inherit"]',
    );
    const inheritedParent = canvasElement.querySelector<HTMLElement>(
      '[data-testid="inherited-color-parent"]',
    );
    if (!primary || !secondary || !inherited || !inheritedParent) {
      throw new Error('Code color fixture did not render every state');
    }

    const primaryColor = getComputedStyle(primary).color;
    const secondaryColor = getComputedStyle(secondary).color;
    const inheritedColor = getComputedStyle(inherited).color;
    expect(secondaryColor).not.toBe(primaryColor);
    expect(inheritedColor).toBe(getComputedStyle(inheritedParent).color);
    expect(inheritedColor).not.toBe(primaryColor);
    expect(inheritedColor).not.toBe(secondaryColor);
  },
};

export const InParagraph: Story = {
  name: 'Inline in paragraph',
  render: () => (
    <Text type="body">
      Use <Code>useState</Code> for local state and <Code>useEffect</Code> for
      side effects. If you need shared state across components, consider{' '}
      <Code>useContext</Code> or a state management library.
    </Text>
  ),
};

export const InstructionalParagraph: Story = {
  name: 'Instructional text',
  render: () => (
    <Stack gap={3}>
      <Text type="body">
        Install the package with <Code>npm install @astryxdesign/core</Code>,
        then import the component:
      </Text>
      <Text type="body">
        Add <Code>{'<Button label="Save">Save</Button>'}</Code> to your JSX. The{' '}
        <Code>label</Code> prop is required for accessibility.
      </Text>
    </Stack>
  ),
};

export const MixedInline: Story = {
  name: 'Mixed with links and emphasis',
  render: () => (
    <Text type="body">
      The <Code>ThemeProvider</Code> component wraps your app and supplies
      design tokens. See the{' '}
      <Link href="/docs/theme" isExternalLink={false}>
        theme docs
      </Link>{' '}
      for setup. Set <Code>colorScheme=&quot;dark&quot;</Code> to enable dark
      mode.
    </Text>
  ),
};

export const VariousContent: Story = {
  name: 'Various code content',
  render: () => (
    <Stack gap={2}>
      <Text type="body">
        Variable: <Code>const count = 0</Code>
      </Text>
      <Text type="body">
        Terminal: <Code>pnpm build --watch</Code>
      </Text>
      <Text type="body">
        CSS property: <Code>border-radius: 8px</Code>
      </Text>
      <Text type="body">
        File path: <Code>packages/core/src/CodeBlock/Code.tsx</Code>
      </Text>
      <Text type="body">
        Keyboard shortcut: <Code>Ctrl+Shift+P</Code>
      </Text>
    </Stack>
  ),
};

export const LongInlineContent: Story = {
  render: () => (
    <div data-testid="long-inline-container" style={{maxWidth: 240}}>
      <Text type="body">
        Long token:{' '}
        <Code data-testid="long-inline-code">
          aVeryLongUnbrokenIdentifierThatMustWrapInsideItsProseContainer
        </Code>
      </Text>
    </div>
  ),
  play: async ({canvasElement}) => {
    await document.fonts.ready;
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const container = canvasElement.querySelector<HTMLElement>(
      '[data-testid="long-inline-container"]',
    );
    const code = canvasElement.querySelector<HTMLElement>(
      '[data-testid="long-inline-code"]',
    );
    if (!container || !code) {
      throw new Error('Code wrapping fixture did not render');
    }

    expect(code.getClientRects().length).toBeGreaterThan(1);
    expect(container.scrollWidth).toBeLessThanOrEqual(container.clientWidth);
  },
};

export const TextSizes: Story = {
  name: 'Across text sizes',
  render: () => (
    <Stack gap={2}>
      <Text type="large" data-testid="text-large">
        Heading with{' '}
        <Code size="inherit" data-testid="code-large">
          inline code
        </Code>
      </Text>
      <Text type="body" data-testid="text-body">
        Body text with{' '}
        <Code size="inherit" data-testid="code-body">
          inline code
        </Code>
      </Text>
      <Text type="supporting" data-testid="text-supporting">
        Detail text with{' '}
        <Code size="inherit" data-testid="code-supporting">
          inline code
        </Code>
      </Text>
      <Text type="label" data-testid="text-label">
        Label text with{' '}
        <Code size="inherit" data-testid="code-label">
          inline code
        </Code>
      </Text>
    </Stack>
  ),
  play: async ({canvasElement}) => {
    await document.fonts.ready;
    const sizes = ['large', 'body', 'supporting', 'label'];
    const fontSizes: string[] = [];
    for (const size of sizes) {
      const parent = canvasElement.querySelector<HTMLElement>(
        `[data-testid="text-${size}"]`,
      );
      const code = canvasElement.querySelector<HTMLElement>(
        `[data-testid="code-${size}"]`,
      );
      if (!parent || !code) {
        throw new Error(`Code inherited-size fixture did not render ${size}`);
      }

      const parentStyle = getComputedStyle(parent);
      const codeStyle = getComputedStyle(code);
      expect(codeStyle.fontSize).toBe(parentStyle.fontSize);
      expect(codeStyle.lineHeight).toBe(parentStyle.lineHeight);
      fontSizes.push(codeStyle.fontSize);
    }
    expect(new Set(fontSizes).size).toBeGreaterThan(1);
  },
};
