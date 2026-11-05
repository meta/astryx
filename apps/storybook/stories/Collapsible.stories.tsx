// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useEffect, useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import * as stylex from '@stylexjs/stylex';
import {Collapsible, CollapsibleGroup} from '@astryxdesign/core/Collapsible';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {VStack} from '@astryxdesign/core/Layout';
import {
  colorVars,
  spacingVars,
  typographyVars,
} from '@astryxdesign/core/theme/tokens.stylex';

const styles = stylex.create({
  pageWrapper: {
    backgroundColor: colorVars['--color-background-body'],
    padding: spacingVars['--spacing-6'],
  },
  text: {
    fontFamily: typographyVars['--font-family-body'],
    color: colorVars['--color-text-primary'],
    margin: 0,
  },
  textSecondary: {
    color: colorVars['--color-text-secondary'],
    fontSize: 14,
    fontFamily: typographyVars['--font-family-body'],
    margin: 0,
  },
  dividedContainer: {
    maxWidth: 480,
  },
});

const meta: Meta<typeof CollapsibleGroup> = {
  title: 'Core/Collapsible',
  component: CollapsibleGroup,
  tags: ['autodocs'],
  argTypes: {
    hasDividers: {
      control: 'boolean',
      description: "Draw hairline dividers between the group's items",
    },
    density: {
      control: 'select',
      options: ['compact', 'balanced', 'spacious'],
      description: 'Row density for trigger and content padding',
    },
  },
  decorators: [
    Story => (
      <div {...stylex.props(styles.pageWrapper)}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof CollapsibleGroup>;

export const SingleMode: Story = {
  name: 'Single Mode — Leading Chevron',
  render: () => (
    <CollapsibleGroup
      type="single"
      defaultValue="general"
      chevronPosition="start">
      <VStack gap={2}>
        <Card>
          <Collapsible trigger="General Settings" value="general">
            <p {...stylex.props(styles.text)}>
              Configure your general preferences including language, timezone,
              and display options.
            </p>
          </Collapsible>
        </Card>
        <Card>
          <Collapsible trigger="Privacy Settings" value="privacy">
            <p {...stylex.props(styles.text)}>
              Manage who can see your profile, activity, and personal
              information.
            </p>
          </Collapsible>
        </Card>
        <Card>
          <Collapsible trigger="Notification Settings" value="notifications">
            <p {...stylex.props(styles.text)}>
              Choose which notifications you receive and how they are delivered.
            </p>
          </Collapsible>
        </Card>
      </VStack>
    </CollapsibleGroup>
  ),
};

export const MultipleMode: Story = {
  name: 'Multiple Mode',
  render: () => (
    <CollapsibleGroup type="multiple" defaultValue={['faq1', 'faq3']}>
      <VStack gap={2}>
        <Card>
          <Collapsible trigger="What is Astryx?" value="faq1">
            <p {...stylex.props(styles.text)}>
              Astryx is a design system for building internal tools and
              products.
            </p>
          </Collapsible>
        </Card>
        <Card>
          <Collapsible trigger="How do I install it?" value="faq2">
            <p {...stylex.props(styles.text)}>
              Run <code>npm install @astryxdesign/core</code> to get started.
            </p>
          </Collapsible>
        </Card>
        <Card>
          <Collapsible trigger="Is it open source?" value="faq3">
            <p {...stylex.props(styles.text)}>
              Yes! Astryx is open source and available on GitHub.
            </p>
          </Collapsible>
        </Card>
      </VStack>
    </CollapsibleGroup>
  ),
};

export const Controlled: Story = {
  name: 'Controlled',
  render: function ControlledStory() {
    const [open, setOpen] = useState<string | string[]>('section1');
    return (
      <div>
        <p {...stylex.props(styles.textSecondary)}>
          Currently open: <strong>{String(open) || '(none)'}</strong>
        </p>
        <CollapsibleGroup type="single" value={open} onChange={setOpen}>
          <VStack gap={2}>
            <Card>
              <Collapsible trigger="Section 1" value="section1">
                <p {...stylex.props(styles.text)}>Content for section 1.</p>
              </Collapsible>
            </Card>
            <Card>
              <Collapsible trigger="Section 2" value="section2">
                <p {...stylex.props(styles.text)}>Content for section 2.</p>
              </Collapsible>
            </Card>
            <Card>
              <Collapsible trigger="Section 3" value="section3">
                <p {...stylex.props(styles.text)}>Content for section 3.</p>
              </Collapsible>
            </Card>
          </VStack>
        </CollapsibleGroup>
      </div>
    );
  },
};

export const StandaloneCollapsible: Story = {
  name: 'Standalone Collapsible',
  render: () => (
    <VStack gap={2}>
      <Card>
        <Collapsible trigger="Starts open (default)">
          <p {...stylex.props(styles.text)}>
            This collapsible manages its own state. Click the trigger to toggle.
          </p>
        </Collapsible>
      </Card>
      <Card>
        <Collapsible trigger="Starts collapsed" defaultIsOpen={false}>
          <p {...stylex.props(styles.text)}>
            This collapsible starts collapsed. Click to reveal.
          </p>
        </Collapsible>
      </Card>
    </VStack>
  ),
};

export const Disabled: Story = {
  name: 'Disabled item',
  render: () => (
    <VStack gap={2}>
      <Card>
        <Collapsible trigger="Enabled — click to toggle">
          <p {...stylex.props(styles.text)}>This section can be toggled.</p>
        </Collapsible>
      </Card>
      <Card>
        <Collapsible trigger="Disabled — can't be toggled" isDisabled>
          <p {...stylex.props(styles.text)}>
            The trigger is non-interactive and dimmed.
          </p>
        </Collapsible>
      </Card>
      <Card>
        <Collapsible trigger="Disabled but open" isDisabled defaultIsOpen>
          <p {...stylex.props(styles.text)}>
            Disabling doesn't collapse an already-open item; the content stays
            visible.
          </p>
        </Collapsible>
      </Card>
    </VStack>
  ),
};

export const WithoutCard: Story = {
  name: 'Without Card (standalone)',
  render: () => (
    <VStack gap={2}>
      <Collapsible trigger="Show more details">
        <p {...stylex.props(styles.text)}>
          Collapsible works anywhere; it doesn't require a card wrapper.
        </p>
      </Collapsible>
      <Collapsible trigger="Another section" defaultIsOpen={false}>
        <p {...stylex.props(styles.text)}>This section starts collapsed.</p>
      </Collapsible>
    </VStack>
  ),
};

export const Dividers: Story = {
  name: 'Dividers',
  args: {type: 'single', hasDividers: true, defaultValue: 'q1'},
  render: args => (
    <div {...stylex.props(styles.dividedContainer)}>
      <CollapsibleGroup {...args}>
        <Collapsible trigger="How do I reset my password?" value="q1">
          <p {...stylex.props(styles.text)}>
            Go to Settings → Security → Change Password. You'll receive a
            confirmation email.
          </p>
        </Collapsible>
        <Collapsible trigger="Can I change my username?" value="q2">
          <p {...stylex.props(styles.text)}>
            Usernames can be changed once every 30 days from your profile
            settings.
          </p>
        </Collapsible>
        <Collapsible trigger="How do I delete my account?" value="q3">
          <p {...stylex.props(styles.text)}>
            Account deletion is permanent. Your data will be removed within 30
            days.
          </p>
        </Collapsible>
      </CollapsibleGroup>
    </div>
  ),
};

export const DividersMultiple: Story = {
  name: 'Dividers — Multiple',
  args: {type: 'multiple', hasDividers: true, defaultValue: ['a']},
  render: args => (
    <div {...stylex.props(styles.dividedContainer)}>
      <CollapsibleGroup {...args}>
        <Collapsible trigger="Deployment Details" value="a">
          <p {...stylex.props(styles.text)}>
            Deployed 2 hours ago from the main branch.
          </p>
        </Collapsible>
        <Collapsible trigger="Environment Variables" value="b">
          <p {...stylex.props(styles.text)}>
            12 variables configured for this environment.
          </p>
        </Collapsible>
        <Collapsible trigger="Build Logs" value="c">
          <p {...stylex.props(styles.text)}>Build completed in 43 seconds.</p>
        </Collapsible>
      </CollapsibleGroup>
    </div>
  ),
};

export const DividersDensity: Story = {
  name: 'Dividers — Density',
  render: () => (
    <VStack gap={6} xstyle={styles.dividedContainer}>
      {(['compact', 'balanced', 'spacious'] as const).map(density => (
        <CollapsibleGroup
          key={density}
          type="multiple"
          hasDividers
          density={density}
          defaultValue={['one']}>
          <Collapsible trigger={`First section (${density})`} value="one">
            <p {...stylex.props(styles.text)}>
              Row padding scales with density.
            </p>
          </Collapsible>
          <Collapsible trigger="Second section" value="two">
            <p {...stylex.props(styles.text)}>Collapsed by default.</p>
          </Collapsible>
        </CollapsibleGroup>
      ))}
    </VStack>
  ),
};

export const FAQ: Story = {
  name: 'FAQ Page',
  render: () => (
    <CollapsibleGroup type="single">
      <VStack gap={2}>
        <Card>
          <Collapsible trigger="How do I reset my password?" value="q1">
            <p {...stylex.props(styles.text)}>
              Go to Settings → Security → Change Password. You'll receive a
              confirmation email.
            </p>
          </Collapsible>
        </Card>
        <Card>
          <Collapsible trigger="Can I change my username?" value="q2">
            <p {...stylex.props(styles.text)}>
              Usernames can be changed once every 30 days from your profile
              settings.
            </p>
          </Collapsible>
        </Card>
        <Card>
          <Collapsible trigger="How do I delete my account?" value="q3">
            <p {...stylex.props(styles.text)}>
              Account deletion is permanent. Go to Settings → Account → Delete
              Account. Your data will be removed within 30 days.
            </p>
          </Collapsible>
        </Card>
        <Card>
          <Collapsible trigger="What payment methods are accepted?" value="q4">
            <p {...stylex.props(styles.text)}>
              We accept Visa, Mastercard, American Express, and PayPal.
            </p>
          </Collapsible>
        </Card>
      </VStack>
    </CollapsibleGroup>
  ),
};

export const PressedState: Story = {
  name: 'Pressed state',
  parameters: {
    docs: {
      description: {
        story:
          "Press and hold the enabled trigger to paint the system's `--color-overlay-pressed` layer across its row. The disabled trigger remains visually unchanged and cannot expand or collapse.",
      },
    },
  },
  render: () => (
    <VStack gap={2}>
      <Card>
        <Collapsible trigger="Details — press and hold">
          <p {...stylex.props(styles.text)}>
            The pressed overlay covers the trigger row.
          </p>
        </Collapsible>
      </Card>
      <Card>
        <Collapsible trigger="Unavailable — no pressed state" isDisabled>
          <p {...stylex.props(styles.text)}>Never opens.</p>
        </Collapsible>
      </Card>
    </VStack>
  ),
};

// =============================================================================
// Close with focus inside (AR4)
// =============================================================================

/**
 * The app closes the Collapsible from a keyboard shortcut (`[`), which leaves
 * focus where it was. Focus on "Inside" moves to the trigger; focus elsewhere
 * stays put.
 */
function CloseFocusDemo() {
  const [isOpen, setIsOpen] = useState(true);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === '[') {
        setIsOpen(open => !open);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);
  return (
    <VStack gap={2}>
      <Collapsible trigger="Details" isOpen={isOpen} onOpenChange={setIsOpen}>
        <Button label="Inside" variant="secondary" />
      </Collapsible>
      <Button label="Elsewhere" variant="secondary" />
    </VStack>
  );
}

export const CloseFocus: Story = {
  name: 'Close Focus',
  render: () => <CloseFocusDemo />,
};
