// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {Link} from '@astryxdesign/core/Link';
import {Text} from '@astryxdesign/core/Text';

const meta: Meta<typeof Link> = {
  title: 'Core/Link',
  component: Link,
  tags: ['autodocs'],
  argTypes: {
    label: {
      control: 'text',
      description: 'Accessible label (required)',
    },
    href: {
      control: 'text',
      description: 'Link destination URL',
    },
    color: {
      control: 'select',
      options: [
        'accent',
        'primary',
        'secondary',
        'disabled',
        'placeholder',
        'inherit',
      ],
      description: 'Text color',
    },
    hasUnderline: {
      control: 'boolean',
      description: 'Always show underline',
    },
    isDisabled: {
      control: 'boolean',
      description: 'Disabled state',
    },
    isExternalLink: {
      control: 'boolean',
      description: 'Opens in new tab with external icon',
    },
    tooltip: {
      control: 'text',
      description: 'Tooltip text on hover',
    },
    isStandalone: {
      control: 'boolean',
      description: 'Standalone (applies base font sizing)',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Link>;

export const Default: Story = {
  args: {
    label: 'Documentation',
    href: '/docs',
    children: 'Documentation',
  },
};

export const Secondary: Story = {
  args: {
    label: 'Privacy Policy',
    href: '/privacy',
    color: 'secondary',
    children: 'Privacy Policy',
  },
};

export const Primary: Story = {
  args: {
    label: 'Learn more',
    href: '/learn',
    color: 'primary',
    children: 'Learn more',
  },
};

export const WithUnderline: Story = {
  args: {
    label: 'Always underlined',
    href: '/underlined',
    hasUnderline: true,
    children: 'Always underlined',
  },
};

export const Disabled: Story = {
  args: {
    label: 'Disabled link',
    href: '/disabled',
    isDisabled: true,
    children: 'Disabled link',
  },
};

export const ExternalLink: Story = {
  args: {
    label: 'GitHub',
    href: 'https://github.com',
    isExternalLink: true,
    children: 'GitHub',
  },
};

export const WithTooltip: Story = {
  args: {
    label: 'Settings',
    href: '/settings',
    tooltip: 'Configure your preferences',
    children: 'Settings',
  },
};

export const Standalone: Story = {
  args: {
    label: 'Standalone Link',
    href: '/standalone',
    isStandalone: true,
    children: 'Standalone Link',
  },
};

export const InlineWithText: Story = {
  render: () => (
    <Text type="body">
      Read the <Link href="/docs">documentation</Link> for more information
      about using Astryx components.
    </Text>
  ),
};

/**
 * `maxLines={1}` inside a fixed-width line: the link, as an anchor or as a
 * button, stops at the line and draws an ellipsis.
 */
export const TruncatedInConstrainedLine: Story = {
  tags: ['!autodocs'],
  render: () => (
    <div style={{display: 'grid', gap: 12, width: 220}} data-truncation-host="">
      {(['anchor', 'button'] as const).map(form => (
        <p
          key={form}
          data-truncation-line={form}
          style={{
            margin: 0,
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
          }}>
          <Link
            href={form === 'anchor' ? '/meetings/weekly' : undefined}
            onClick={form === 'button' ? () => {} : undefined}
            maxLines={1}>
            Weekly design review with the product and research teams
          </Link>
        </p>
      ))}
    </div>
  ),
};

export const AllVariants: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        maxWidth: '600px',
      }}>
      <div style={{display: 'flex', gap: '16px', alignItems: 'center'}}>
        <Link href="/active" isStandalone>
          Active (default)
        </Link>
        <Link href="/primary" color="primary" isStandalone>
          Primary
        </Link>
        <Link href="/secondary" color="secondary" isStandalone>
          Secondary
        </Link>
        <Link href="/inherit" color="inherit" isStandalone>
          Inherit
        </Link>
      </div>
      <div style={{display: 'flex', gap: '16px', alignItems: 'center'}}>
        <Link href="/underlined" hasUnderline isStandalone>
          With underline
        </Link>
        <Link href="https://example.com" isExternalLink isStandalone>
          External
        </Link>
        <Link href="/tooltip" tooltip="Helpful info" isStandalone>
          With tooltip
        </Link>
      </div>
      <div style={{display: 'flex', gap: '16px', alignItems: 'center'}}>
        <Link href="/disabled" isDisabled isStandalone>
          Disabled active
        </Link>
        <Link href="/disabled" color="secondary" isDisabled isStandalone>
          Disabled secondary
        </Link>
      </div>
    </div>
  ),
};

export const ExternalLinks: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}>
      <Link href="https://github.com" isExternalLink isStandalone>
        GitHub
      </Link>
      <Link href="https://developer.mozilla.org" isExternalLink isStandalone>
        MDN Web Docs
      </Link>
      <Link href="https://react.dev" isExternalLink hasUnderline isStandalone>
        React Documentation
      </Link>
    </div>
  ),
};

export const LinksWithTooltips: Story = {
  render: () => (
    <div style={{display: 'flex', gap: '16px', alignItems: 'center'}}>
      <Link
        href="/settings"
        tooltip="Configure your account settings"
        isStandalone>
        Settings
      </Link>
      <Link href="/profile" tooltip="View and edit your profile" isStandalone>
        Profile
      </Link>
      <Link
        href="/help"
        tooltip="Get help and support"
        color="secondary"
        isStandalone>
        Help
      </Link>
    </div>
  ),
};

export const ButtonFallback: Story = {
  args: {
    children: 'Click me (no href)',
    onClick: () => alert('Clicked!'),
  },
  parameters: {
    docs: {
      description: {
        story:
          'When `href` is undefined, Link renders a `<button>` with reset styles. ' +
          'Visually identical to a link, but semantically correct for actions that do not navigate.',
      },
    },
  },
};

export const ButtonFallbackDisabled: Story = {
  args: {
    children: 'Disabled action',
    isDisabled: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          'The button fallback supports the `isDisabled` prop: it stays focusable with `aria-disabled` and ignores clicks, Enter and Space.',
      },
    },
  },
};

export const ButtonFallbackVariants: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        maxWidth: '600px',
      }}>
      <div style={{display: 'flex', gap: '16px', alignItems: 'center'}}>
        <Link onClick={() => {}} isStandalone>
          Active (default)
        </Link>
        <Link onClick={() => {}} color="primary" isStandalone>
          Primary
        </Link>
        <Link onClick={() => {}} color="secondary" isStandalone>
          Secondary
        </Link>
        <Link onClick={() => {}} color="inherit" isStandalone>
          Inherit
        </Link>
      </div>
      <div style={{display: 'flex', gap: '16px', alignItems: 'center'}}>
        <Link onClick={() => {}} hasUnderline isStandalone>
          With underline
        </Link>
        <Link onClick={() => {}} tooltip="Action tooltip" isStandalone>
          With tooltip
        </Link>
        <Link onClick={() => {}} isDisabled isStandalone>
          Disabled
        </Link>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Button fallback supports all visual variants (color, underline, tooltip, disabled), ' +
          'visually indistinguishable from a regular link.',
      },
    },
  },
};

export const ButtonFallbackInline: Story = {
  render: () => (
    <Text type="body">
      You can <Link onClick={() => alert('Undo!')}>undo this action</Link> if
      you change your mind.
    </Text>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Button fallback works inline within text, just like a regular link. ' +
          'Inspect the DOM; it renders a `<button>` not an `<a>`.',
      },
    },
  },
};

export const LinkVsButtonComparison: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        maxWidth: '600px',
      }}>
      <Text type="large" size="sm">
        Link (with href) vs Button (without href)
      </Text>
      <div style={{display: 'flex', gap: '24px', alignItems: 'center'}}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            alignItems: 'center',
          }}>
          <Link href="/destination" isStandalone>
            I navigate
          </Link>
          <Text type="body" size="sm" color="secondary">
            {'<a href="/destination">'}
          </Text>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            alignItems: 'center',
          }}>
          <Link onClick={() => alert('Action!')} isStandalone>
            I act
          </Link>
          <Text type="body" size="sm" color="secondary">
            {'<button type="button">'}
          </Text>
        </div>
      </div>
      <Text type="body" size="sm" color="secondary">
        Both look the same, but inspect the DOM to see the semantic difference.
      </Text>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Side-by-side comparison showing that links and button fallbacks are visually identical. ' +
          'The only difference is in the rendered DOM element.',
      },
    },
  },
};

export const PressedState: Story = {
  name: 'Pressed state',
  parameters: {
    docs: {
      description: {
        story:
          "Press and hold to see the system's `--color-overlay-pressed` layer behind the link text. The disabled example remains visually unchanged and cannot navigate.",
      },
    },
  },
  render: () => (
    <Text>
      Read the{' '}
      <Link href="/docs" onClick={e => e.preventDefault()}>
        documentation — press and hold
      </Link>{' '}
      or <Link onClick={() => {}}>open the panel (button form)</Link>.{' '}
      <Link href="/unavailable" isDisabled>
        Unavailable — no pressed state
      </Link>
    </Text>
  ),
};
