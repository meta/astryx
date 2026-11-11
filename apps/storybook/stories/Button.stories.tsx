// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import * as stylex from '@stylexjs/stylex';
import {Button} from '@astryxdesign/core/Button';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {DateInput} from '@astryxdesign/core/DateInput';
import type {ISODateString} from '@astryxdesign/core/Calendar';
import {Badge} from '@astryxdesign/core/Badge';
import {Card} from '@astryxdesign/core/Card';
import {Heading} from '@astryxdesign/core/Heading';
import {HStack} from '@astryxdesign/core/HStack';
import {Icon} from '@astryxdesign/core/Icon';
import {IconButton} from '@astryxdesign/core/IconButton';
import {InfoTip} from '@astryxdesign/core/InfoTip';
import {Link} from '@astryxdesign/core/Link';
import {StackItem} from '@astryxdesign/core/Stack';
import {Switch} from '@astryxdesign/core/Switch';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {ToggleButton, ToggleButtonGroup} from '@astryxdesign/core/ToggleButton';
import {VStack} from '@astryxdesign/core/VStack';
import {Cog6ToothIcon, TrashIcon} from '@heroicons/react/24/outline';

const buttonStoryStyles = stylex.create({
  fullWidth: {
    width: '100%',
  },
});

const meta: Meta<typeof Button> = {
  title: 'Core/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    label: {
      control: 'text',
      description: 'Accessible label (required)',
    },
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'ghost', 'destructive'],
      description: 'Visual style variant',
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      description: 'Size variant',
    },
    elevation: {
      control: 'inline-radio',
      options: ['none', 'low', 'med', 'high'],
      description: 'Resting shadow depth (for floating buttons / FABs)',
    },
    isLoading: {
      control: 'boolean',
      description: 'Loading state',
    },
    isDisabled: {
      control: 'boolean',
      description: 'Disabled state',
    },
    endContent: {
      control: false,
      description: 'Content rendered after the label (e.g. icon, badge)',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = {
  args: {
    label: 'Primary Button',
    variant: 'primary',
  },
};

export const Secondary: Story = {
  args: {
    label: 'Secondary Button',
    variant: 'secondary',
  },
};

export const Ghost: Story = {
  args: {
    label: 'Ghost Button',
    variant: 'ghost',
  },
};

export const Destructive: Story = {
  args: {
    label: 'Delete',
    variant: 'destructive',
  },
};

export const Loading: Story = {
  args: {
    label: 'Loading...',
    variant: 'primary',
    isLoading: true,
  },
};

export const Disabled: Story = {
  args: {
    label: 'Disabled',
    variant: 'primary',
    isDisabled: true,
  },
};

export const SizeVariants: Story = {
  render: () => (
    <div style={{display: 'flex', gap: '12px', alignItems: 'center'}}>
      <Button label="Small" variant="primary" size="sm" />
      <Button label="Medium" variant="primary" size="md" />
      <Button label="Large" variant="primary" size="lg" />
    </div>
  ),
};

export const IconOnly: Story = {
  render: () => (
    <div style={{display: 'flex', gap: '12px'}}>
      <Button
        label="Settings"
        variant="ghost"
        icon={<Cog6ToothIcon style={{width: 16, height: 16}} />}
        isIconOnly
      />
      <Button
        label="Delete"
        variant="destructive"
        icon={<TrashIcon style={{width: 16, height: 16}} />}
        isIconOnly
      />
    </div>
  ),
};

export const IconWithText: Story = {
  render: () => (
    <div style={{display: 'flex', gap: '12px'}}>
      <Button
        label="Settings"
        variant="secondary"
        icon={
          <Cog6ToothIcon
            data-testid="button-leading-icon"
            style={{width: 16, height: 16}}
          />
        }>
        <span data-testid="button-label">Settings</span>
      </Button>
      <Button
        label="Delete"
        variant="destructive"
        icon={<TrashIcon style={{width: 16, height: 16}} />}
      />
    </div>
  ),
};

export const WithEndSlot: Story = {
  render: () => (
    <div style={{display: 'flex', gap: '12px', alignItems: 'center'}}>
      <Button
        label="Messages"
        variant="primary"
        endContent={<Badge variant="info" label={3} />}
      />
      <Button
        label="Notifications"
        variant="secondary"
        endContent={<Badge variant="neutral" label="New" />}
      />
    </div>
  ),
};

export const IconAndEndSlot: Story = {
  render: () => (
    <div style={{display: 'flex', gap: '12px', alignItems: 'center'}}>
      <Button
        label="Settings"
        variant="secondary"
        icon={<Cog6ToothIcon style={{width: 16, height: 16}} />}
        endContent={<Badge variant="info" label="New" />}
      />
      <Button
        label="Delete"
        variant="destructive"
        icon={<TrashIcon style={{width: 16, height: 16}} />}
        endContent={<Badge variant="error" label={5} />}
      />
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
      <div style={{display: 'flex', gap: '12px'}}>
        <Button label="Primary" variant="primary" />
        <Button label="Secondary" variant="secondary" />
        <Button label="Ghost" variant="ghost" />
        <Button label="Destructive" variant="destructive" />
      </div>
      <div style={{display: 'flex', gap: '12px'}}>
        <Button label="Loading..." variant="primary" isLoading />
        <Button label="Loading..." variant="secondary" isLoading />
        <Button label="Loading..." variant="ghost" isLoading />
        <Button label="Loading..." variant="destructive" isLoading />
      </div>
      <div style={{display: 'flex', gap: '12px'}}>
        <Button label="Disabled" variant="primary" isDisabled />
        <Button label="Disabled" variant="secondary" isDisabled />
        <Button label="Disabled" variant="ghost" isDisabled />
        <Button label="Disabled" variant="destructive" isDisabled />
      </div>
      <div style={{display: 'flex', gap: '12px'}}>
        <Button
          label="Settings"
          variant="ghost"
          icon={<Cog6ToothIcon style={{width: 16, height: 16}} />}
          isIconOnly
        />
        <Button
          label="Settings"
          variant="secondary"
          icon={<Cog6ToothIcon style={{width: 16, height: 16}} />}
        />
        <Button
          label="Delete"
          variant="destructive"
          icon={<TrashIcon style={{width: 16, height: 16}} />}
          isIconOnly
        />
      </div>
      <div style={{display: 'flex', gap: '12px', alignItems: 'center'}}>
        <Button label="Small" variant="primary" size="sm" />
        <Button label="Medium" variant="primary" size="md" />
        <Button label="Large" variant="primary" size="lg" />
      </div>
      <div style={{display: 'flex', gap: '12px'}}>
        <Button
          label="With Badge"
          variant="primary"
          endContent={<Badge variant="info" label={3} />}
        />
        <Button
          label="With Badge"
          variant="secondary"
          endContent={<Badge variant="neutral" label="New" />}
        />
        <Button
          label="Icon + Badge"
          variant="ghost"
          icon={<Cog6ToothIcon style={{width: 16, height: 16}} />}
          endContent={<Badge variant="info" label={5} />}>
          Settings
        </Button>
      </div>
    </div>
  ),
};

/**
 * Demonstrates button rendering as a link when `href` is provided.
 * Right-click to verify native browser link context menu (open in new tab, etc.).
 * Disabled state falls back to `<button>` — disabled links are an a11y anti-pattern.
 */
export const LinkButton: Story = {
  render: () => (
    <div style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
      <div style={{display: 'flex', gap: '12px', alignItems: 'center'}}>
        <Button
          label="Visit Example"
          href="https://example.com"
          variant="primary"
        />
        <Button
          label="Open in new tab"
          href="https://example.com"
          target="_blank"
          rel="noopener noreferrer"
          variant="secondary"
        />
        <Button label="Ghost link" href="https://example.com" variant="ghost" />
      </div>
      <div style={{display: 'flex', gap: '12px', alignItems: 'center'}}>
        <Button
          label="Disabled link"
          href="https://example.com"
          variant="primary"
          isDisabled
        />
        <Button
          label="Loading link"
          href="https://example.com"
          variant="primary"
          isLoading
        />
      </div>
      <div style={{display: 'flex', gap: '12px', alignItems: 'center'}}>
        <Button
          label="Settings"
          href="https://example.com"
          variant="secondary"
          icon={<Cog6ToothIcon style={{width: 16, height: 16}} />}
        />
        <Button
          label="Icon-only link"
          href="https://example.com"
          variant="ghost"
          icon={<Cog6ToothIcon style={{width: 16, height: 16}} />}
          isIconOnly
        />
      </div>
    </div>
  ),
};

/**
 * Demonstrates button text truncation in constrained containers.
 * When a button's container is narrower than the button's natural width,
 * the label truncates with an ellipsis instead of wrapping to multiple lines.
 */
export const Truncation: Story = {
  render: () => (
    <div style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
      <div>
        <p
          style={{
            fontSize: 12,
            color: 'var(--color-text-secondary)',
            marginBottom: 8,
          }}>
          200px container — label truncates with ellipsis
        </p>
        <div style={{width: 200, border: '1px dashed #ccc', padding: 4}}>
          <Button
            label="A very long button label that overflows"
            variant="primary"
            icon={<Cog6ToothIcon style={{width: 16, height: 16}} />}
          />
        </div>
      </div>
      <div>
        <p
          style={{
            fontSize: 12,
            color: 'var(--color-text-secondary)',
            marginBottom: 8,
          }}>
          Flex row with limited space — button shrinks gracefully
        </p>
        <div style={{display: 'flex', gap: 8, maxWidth: 320}}>
          <div style={{flex: 1, minWidth: 0}}>
            <Button
              label="Submit this extremely long form action"
              variant="primary"
              xstyle={buttonStoryStyles.fullWidth}
            />
          </div>
          <Button label="Cancel" variant="secondary" />
        </div>
      </div>
      <div>
        <p
          style={{
            fontSize: 12,
            color: 'var(--color-text-secondary)',
            marginBottom: 8,
          }}>
          Unconstrained — renders at natural width
        </p>
        <Button
          label="A very long button label that shows fully"
          variant="primary"
          icon={<Cog6ToothIcon style={{width: 16, height: 16}} />}
        />
      </div>
    </div>
  ),
};

function ReviewersCard() {
  const [emails, setEmails] = useState('');
  return (
    <Card maxWidth={560}>
      <VStack gap={4}>
        <HStack gap={2} vAlign="center">
          <StackItem size="fill">
            <Heading level={3} maxLines={1}>
              Design review
            </Heading>
          </StackItem>
          <Button label="Request review from the design team" size="sm" />
          <IconButton
            label="More review options"
            icon={<Icon icon="moreHorizontal" />}
            variant="ghost"
            size="sm"
          />
        </HStack>
        <TextInput
          label="Reviewer emails"
          placeholder="name@example.com"
          value={emails}
          onChange={setEmails}
        />
        <HStack gap={2} hAlign="end">
          <StackItem size="static">
            <Button label="Cancel" variant="secondary" />
          </StackItem>
          <Button
            label="Send invitations to all 12 reviewers"
            variant="primary"
          />
        </HStack>
      </VStack>
    </Card>
  );
}

/**
 * The Button.doc.mjs "Actions in narrow rows" example at a 320px form width,
 * a 390px phone width, and a roomy 600px width. In the narrow frames the long
 * labels truncate with an ellipsis inside the card instead of overflowing or
 * being clipped; the icon-only button stays square; the roomy frame renders
 * every button at its natural width.
 */
export const NarrowRows: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        gap: 24,
        flexWrap: 'wrap',
        alignItems: 'flex-start',
      }}>
      {[320, 390, 600].map(width => (
        <div key={width} style={{width}}>
          <p
            style={{
              fontSize: 12,
              color: 'var(--color-text-secondary)',
              marginBottom: 8,
            }}>
            {width}px
          </p>
          <ReviewersCard />
        </div>
      ))}
    </div>
  ),
};

export const Elevations: Story = {
  render: () => (
    <div style={{display: 'flex', gap: 24, alignItems: 'center'}}>
      {(['none', 'low', 'med', 'high'] as const).map(elevation => (
        <div key={elevation} style={{textAlign: 'center'}}>
          <p
            style={{
              fontSize: 12,
              color: 'var(--color-text-secondary)',
              marginBottom: 8,
            }}>
            elevation=&quot;{elevation}&quot;
          </p>
          <Button label={elevation} variant="primary" elevation={elevation} />
        </div>
      ))}
    </div>
  ),
};

export const TouchTargets: Story = {
  name: 'Touch targets',
  parameters: {
    docs: {
      description: {
        story:
          'A dense toolbar, 4 px apart, a pair offset 4 px on both axes, and a field with a clear button. Under a coarse pointer each button’s invisible hit area grows toward 44 px, but stops halfway to a neighbor, so a tap lands on the button nearest to it and no box changes size.',
      },
    },
  },
  render: () => {
    const [taps, setTaps] = useState({
      bold: 0,
      italic: 0,
      underline: 0,
      undo: 0,
      redo: 0,
    });
    const [query, setQuery] = useState('quarterly report');
    const count = (key: keyof typeof taps) => () =>
      setTaps(current => ({...current, [key]: current[key] + 1}));
    return (
      <VStack gap={3} hAlign="start">
        <HStack gap={1}>
          <IconButton
            label="Bold"
            size="sm"
            variant="ghost"
            icon={<Icon icon={Cog6ToothIcon} />}
            onClick={count('bold')}
          />
          <IconButton
            label="Italic"
            size="sm"
            variant="ghost"
            icon={<Icon icon={TrashIcon} />}
            onClick={count('italic')}
          />
          <IconButton
            label="Underline"
            size="sm"
            variant="ghost"
            icon={<Icon icon={Cog6ToothIcon} />}
            onClick={count('underline')}
          />
        </HStack>
        <output aria-label="Taps">
          Bold {taps.bold}, Italic {taps.italic}, Underline {taps.underline}
        </output>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto auto',
            gap: 4,
          }}>
          <IconButton
            label="Undo"
            size="sm"
            variant="ghost"
            icon={<Icon icon={Cog6ToothIcon} />}
            onClick={count('undo')}
          />
          <span />
          <span />
          <IconButton
            label="Redo"
            size="sm"
            variant="ghost"
            icon={<Icon icon={TrashIcon} />}
            onClick={count('redo')}
          />
        </div>
        <output aria-label="Offset taps">
          Undo {taps.undo}, Redo {taps.redo}
        </output>
        <TextInput label="Search" value={query} onChange={setQuery} hasClear />
      </VStack>
    );
  },
};

export const TouchReach: Story = {
  name: 'Touch reach',
  parameters: {
    docs: {
      description: {
        story:
          'Under a coarse pointer: a lone 24 px button takes taps 10 px past each edge, 44 px in all; the 4 px gap of a ToggleButtonGroup splits at its middle; two loose 24 px buttons 4 px apart each keep every tap on their own box, since a visible box under the finger wins over a band, and a tap in their gap goes to the nearer box; a button 4 px after a small Switch keeps a tap 1 px before its edge, since the grown input of the Switch is not its visible box; and an InfoTip right after a link takes no tap on the link, since it grows no room sideways.',
      },
    },
  },
  render: () => {
    const [taps, setTaps] = useState({
      lone: 0,
      link: 0,
      cut: 0,
      copy: 0,
      next: 0,
      pin: 0,
      mark: 0,
      go: 0,
      clear: 0,
      apply: 0,
      check: 0,
    });
    const [email, setEmail] = useState('');
    const [day, setDay] = useState<ISODateString | undefined>(undefined);
    const [query, setQuery] = useState('');
    const [agree, setAgree] = useState(false);
    const [sync, setSync] = useState(false);
    const count = (key: keyof typeof taps) => () =>
      setTaps(current => ({...current, [key]: current[key] + 1}));
    const [formats, setFormats] = useState<string[]>([]);
    return (
      <VStack gap={6} hAlign="start">
        <div style={{padding: 40}}>
          <Button
            label="Lone"
            data-testid="lone"
            isIconOnly
            variant="ghost"
            icon={<Icon icon={Cog6ToothIcon} />}
            style={{width: 24, height: 24, minWidth: 24, padding: 0}}
            onClick={count('lone')}
          />
        </div>
        <div style={{display: 'flex', gap: 4}}>
          <Button
            label="Cut"
            data-testid="cut"
            isIconOnly
            variant="ghost"
            icon={<Icon icon={TrashIcon} />}
            style={{width: 24, height: 24, minWidth: 24, padding: 0}}
            onClick={count('cut')}
          />
          <Button
            label="Copy"
            data-testid="copy"
            isIconOnly
            variant="ghost"
            icon={<Icon icon={Cog6ToothIcon} />}
            style={{width: 24, height: 24, minWidth: 24, padding: 0}}
            onClick={count('copy')}
          />
        </div>
        <div style={{display: 'flex', gap: 4, alignItems: 'center'}}>
          <Switch
            label="Sync"
            isLabelHidden
            size="sm"
            value={sync}
            onChange={setSync}
          />
          <Button
            label="Next"
            data-testid="next"
            isIconOnly
            variant="ghost"
            icon={<Icon icon={Cog6ToothIcon} />}
            style={{width: 24, height: 24, minWidth: 24, padding: 0}}
            onClick={count('next')}
          />
        </div>
        <div style={{display: 'flex', gap: 24, alignItems: 'center'}}>
          <div style={{position: 'relative', width: 24, height: 24}}>
            <Button
              label="Pin"
              data-testid="pin"
              isIconOnly
              variant="secondary"
              icon={<Icon icon={Cog6ToothIcon} />}
              style={{
                position: 'absolute',
                left: 20,
                top: 0,
                width: 24,
                height: 24,
                minWidth: 24,
                padding: 0,
              }}
              onClick={count('pin')}
            />
          </div>
          <Button
            label="Mark"
            data-testid="mark"
            isIconOnly
            variant="ghost"
            icon={<Icon icon={TrashIcon} />}
            // Mark paints over Pin, so its band lies over Pin's overhang.
            style={{width: 24, height: 24, minWidth: 24, padding: 0, zIndex: 1}}
            onClick={count('mark')}
          />
        </div>
        <div style={{display: 'flex', gap: 4, alignItems: 'center'}}>
          <TextInput
            label="Search"
            isLabelHidden
            value={query}
            onChange={setQuery}
            data-testid="search"
          />
          <Button
            label="Go"
            data-testid="go"
            isIconOnly
            variant="ghost"
            icon={<Icon icon={Cog6ToothIcon} />}
            style={{width: 24, height: 24, minWidth: 24, padding: 0}}
            onClick={count('go')}
          />
        </div>
        <div style={{display: 'flex', gap: 4, alignItems: 'flex-end'}}>
          <TextInput
            label="Email"
            value={email}
            onChange={setEmail}
            status={{type: 'error', message: 'Enter an email'}}
          />
          <Button
            label="Check"
            data-testid="check"
            isIconOnly
            variant="ghost"
            icon={<Icon icon={Cog6ToothIcon} />}
            style={{width: 24, height: 24, minWidth: 24, padding: 0}}
            onClick={count('check')}
          />
        </div>
        <div style={{display: 'flex', gap: 4, alignItems: 'center'}}>
          <DateInput
            label="Pick"
            isLabelHidden
            presentation="native"
            value={day}
            onChange={setDay}
          />
          <Button
            label="Apply"
            data-testid="apply"
            isIconOnly
            variant="ghost"
            icon={<Icon icon={Cog6ToothIcon} />}
            style={{width: 24, height: 24, minWidth: 24, padding: 0}}
            onClick={count('apply')}
          />
        </div>
        <div style={{display: 'flex', gap: 4, alignItems: 'center'}}>
          <CheckboxInput
            label="Agree"
            isLabelHidden
            value={agree}
            onChange={setAgree}
          />
          <Button
            label="Clear"
            data-testid="clear"
            isIconOnly
            variant="ghost"
            icon={<Icon icon={TrashIcon} />}
            style={{width: 24, height: 24, minWidth: 24, padding: 0}}
            onClick={count('clear')}
          />
        </div>
        <ToggleButtonGroup
          type="multiple"
          label="Format"
          value={formats}
          onChange={setFormats}>
          <ToggleButton
            label="Bold"
            value="bold"
            size="sm"
            isIconOnly
            icon={<Icon icon={Cog6ToothIcon} />}
            data-testid="bold"
          />
          <ToggleButton
            label="Italic"
            value="italic"
            size="sm"
            isIconOnly
            icon={<Icon icon={TrashIcon} />}
            data-testid="italic"
          />
        </ToggleButtonGroup>
        <Text>
          See the{' '}
          <Link
            href="#pricing"
            onClick={event => {
              event.preventDefault();
              count('link')();
            }}>
            pricing
          </Link>
          <InfoTip content="Billed monthly per seat." label="Pricing help" />{' '}
          for teams.
        </Text>
        <output aria-label="Reach taps">
          Lone {taps.lone}, Link {taps.link}, Cut {taps.cut}, Copy {taps.copy}
        </output>
        <output aria-label="Field taps">
          Go {taps.go}, Clear {taps.clear}, Agree {agree ? 'on' : 'off'}, Apply{' '}
          {taps.apply}, Pick {day ?? 'none'}
        </output>
        <output aria-label="Status taps">Check {taps.check}</output>
        <output aria-label="Overhang taps">
          Pin {taps.pin}, Mark {taps.mark}
        </output>
        <output aria-label="Sync taps">
          Next {taps.next}, Sync {sync ? 'on' : 'off'}
        </output>
      </VStack>
    );
  },
};
