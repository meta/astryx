// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import type {ComponentPropsWithoutRef} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Avatar} from '@astryxdesign/core/Avatar';
import {AvatarStatusDot} from '@astryxdesign/core/Avatar';
import {Theme, defineTheme} from '@astryxdesign/core/theme';
import {
  spacingVars,
  typographyVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {CheckIcon, ClockIcon, XMarkIcon} from '@heroicons/react/24/solid';

const styles = stylex.create({
  storyWrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-6'],
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-4'],
  },
  heading: {
    margin: `0 0 ${spacingVars['--spacing-2']} 0`,
    fontFamily: typographyVars['--font-family-body'],
  },
  narrow: {
    maxWidth: '320px',
    width: '100%',
    borderWidth: '1px',
    borderStyle: 'dashed',
    borderColor: 'currentColor',
    padding: spacingVars['--spacing-2'],
  },
  wrapRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacingVars['--spacing-4'],
  },
});

function RouterLink({href, children, ...rest}: ComponentPropsWithoutRef<'a'>) {
  return (
    <a href={href} data-router-link="" {...rest}>
      {children}
    </a>
  );
}

const meta: Meta<typeof Avatar> = {
  title: 'Core/Avatar',
  component: Avatar,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: [
        'xsm',
        'sm',
        'md',
        'lg',
        'xl',
        16,
        20,
        24,
        32,
        36,
        40,
        48,
        60,
        64,
        72,
        96,
        128,
        144,
        180,
      ],
      description: 'Size of the avatar',
    },
    src: {
      control: 'text',
      description: 'Primary image source URL',
    },
    fallbackSrc: {
      control: 'text',
      description: 'Fallback image when primary fails',
    },
    name: {
      control: 'text',
      description: 'User name for initials and alt text',
    },
    alt: {
      control: 'text',
      description: 'Alt text (falls back to name)',
    },
    tooltip: {
      control: 'text',
      description:
        'Hover/focus tooltip. Omitted or true shows the name; a string shows that text; false disables it. Set false when wrapping in your own Tooltip/HoverCard.',
    },
    status: {
      control: 'boolean',
      description: 'Show status indicator dot',
      mapping: {
        true: <AvatarStatusDot label="Online" />,
        false: undefined,
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof Avatar>;

export const Default: Story = {
  args: {
    name: 'John Doe',
    size: 'lg',
  },
};

export const WithImage: Story = {
  args: {
    src: 'https://i.pravatar.cc/150?img=1',
    name: 'Jane Smith',
    size: 'lg',
  },
};

export const AllSizes: Story = {
  render: () => (
    <div {...stylex.props(styles.storyWrapper)}>
      <h4 {...stylex.props(styles.heading)}>Named Sizes</h4>
      <div {...stylex.props(styles.row)}>
        <Avatar name="TY" size="xsm" />
        <Avatar name="XS" size="sm" />
        <Avatar name="SM" size="md" />
        <Avatar name="MD" size="lg" />
        <Avatar name="LG" size="xl" />
      </div>
    </div>
  ),
};

export const WithImages: Story = {
  render: () => (
    <div {...stylex.props(styles.storyWrapper)}>
      <h4 {...stylex.props(styles.heading)}>With Images (Different Sizes)</h4>
      <div {...stylex.props(styles.row)}>
        <Avatar
          src="https://i.pravatar.cc/150?img=1"
          name="User 1"
          size="xsm"
        />
        <Avatar src="https://i.pravatar.cc/150?img=2" name="User 2" size="sm" />
        <Avatar src="https://i.pravatar.cc/150?img=3" name="User 3" size="md" />
        <Avatar src="https://i.pravatar.cc/150?img=4" name="User 4" size="lg" />
        <Avatar src="https://i.pravatar.cc/150?img=5" name="User 5" size="xl" />
      </div>
    </div>
  ),
};

export const InitialsFallback: Story = {
  render: () => (
    <div {...stylex.props(styles.storyWrapper)}>
      <h4 {...stylex.props(styles.heading)}>Initials Fallback</h4>
      <div {...stylex.props(styles.row)}>
        <Avatar name="John Doe" size="lg" />
        <Avatar name="Alice" size="lg" />
        <Avatar name="Bob Smith Johnson" size="lg" />
        <Avatar name="Dr. Sarah Connor" size="lg" />
      </div>
    </div>
  ),
};

export const NoImageNoName: Story = {
  render: () => (
    <div {...stylex.props(styles.storyWrapper)}>
      <h4 {...stylex.props(styles.heading)}>Default Icon (No Image or Name)</h4>
      <div {...stylex.props(styles.row)}>
        <Avatar size="xsm" />
        <Avatar size="sm" />
        <Avatar size="md" />
        <Avatar size="lg" />
        <Avatar size="xl" />
      </div>
    </div>
  ),
};

export const FallbackChain: Story = {
  render: () => (
    <div {...stylex.props(styles.storyWrapper)}>
      <h4 {...stylex.props(styles.heading)}>Fallback Chain Demo</h4>
      <div {...stylex.props(styles.row)}>
        <div>
          <p {...stylex.props(styles.heading)}>Valid src</p>
          <Avatar
            src="https://i.pravatar.cc/150?img=10"
            name="Test User"
            size="xl"
          />
        </div>
        <div>
          <p {...stylex.props(styles.heading)}>
            Invalid src, valid fallbackSrc
          </p>
          <Avatar
            src="https://invalid-url.example/broken.jpg"
            fallbackSrc="https://i.pravatar.cc/150?img=11"
            name="Test User"
            size="xl"
          />
        </div>
        <div>
          <p {...stylex.props(styles.heading)}>Both invalid, has name</p>
          <Avatar
            src="https://invalid-url.example/broken.jpg"
            fallbackSrc="https://also-invalid.example/broken.jpg"
            name="Test User"
            size="xl"
          />
        </div>
        <div>
          <p {...stylex.props(styles.heading)}>All invalid, no name</p>
          <Avatar src="https://invalid-url.example/broken.jpg" size="xl" />
        </div>
      </div>
    </div>
  ),
};

export const WithStatus: Story = {
  render: () => (
    <div {...stylex.props(styles.storyWrapper)}>
      <h4 {...stylex.props(styles.heading)}>With Status Indicators</h4>
      <div {...stylex.props(styles.row)}>
        <Avatar
          src="https://i.pravatar.cc/150?img=20"
          name="Online User"
          size="xl"
          status={<AvatarStatusDot variant="success" label="Online" />}
        />
        <Avatar
          src="https://i.pravatar.cc/150?img=21"
          name="Offline User"
          size="xl"
          status={<AvatarStatusDot variant="neutral" label="Offline" />}
        />
        <Avatar
          src="https://i.pravatar.cc/150?img=22"
          name="Busy User"
          size="xl"
          status={<AvatarStatusDot variant="error" label="Busy" />}
        />
      </div>
    </div>
  ),
};

export const StatusLabelSources: Story = {
  render: () => {
    // A consumer's own wrapper. AvatarStatusDot reports its label to the
    // avatar through context, so the status still reaches the accessible name.
    function PresenceDot({presence}: {presence: string}) {
      return <AvatarStatusDot variant="success" label={presence} />;
    }

    return (
      <div {...stylex.props(styles.storyWrapper)}>
        <h4 {...stylex.props(styles.heading)}>
          Every route to a status in the accessible name
        </h4>
        <div {...stylex.props(styles.row)}>
          <Avatar
            name="Ada Lovelace"
            size="xl"
            status={<AvatarStatusDot variant="success" label="Online" />}
          />
          <Avatar
            name="Grace Hopper"
            size="xl"
            status={<PresenceDot presence="Online" />}
          />
          <Avatar
            name="Katherine Johnson"
            size="xl"
            status={<AvatarStatusDot variant="neutral" label="On leave" />}
          />
        </div>
      </div>
    );
  },
};

export const StatusAcrossAllSizes: Story = {
  name: 'Status Dot Across All Sizes',
  render: () => (
    <div {...stylex.props(styles.storyWrapper)}>
      <h4 {...stylex.props(styles.heading)}>
        Status dot scales proportionally with avatar size
      </h4>

      <h4 {...stylex.props(styles.heading)}>Named Sizes</h4>
      <div {...stylex.props(styles.row)}>
        <Avatar
          name="TY"
          size="xsm"
          status={<AvatarStatusDot variant="success" label="Online" />}
        />
        <Avatar
          name="XS"
          size="sm"
          status={<AvatarStatusDot variant="success" label="Online" />}
        />
        <Avatar
          name="SM"
          size="md"
          status={<AvatarStatusDot variant="success" label="Online" />}
        />
        <Avatar
          name="MD"
          size="lg"
          status={<AvatarStatusDot variant="success" label="Online" />}
        />
        <Avatar
          name="LG"
          size="xl"
          status={<AvatarStatusDot variant="success" label="Online" />}
        />
      </div>

      <h4 {...stylex.props(styles.heading)}>Numeric Sizes with Images</h4>
      <div {...stylex.props(styles.row)}>
        <Avatar
          src="https://i.pravatar.cc/150?img=30"
          name="U1"
          size={20}
          status={<AvatarStatusDot variant="success" label="Online" />}
        />
        <Avatar
          src="https://i.pravatar.cc/150?img=31"
          name="U2"
          size={32}
          status={<AvatarStatusDot variant="success" label="Online" />}
        />
        <Avatar
          src="https://i.pravatar.cc/150?img=32"
          name="U3"
          size={48}
          status={<AvatarStatusDot variant="error" label="Busy" />}
        />
        <Avatar
          src="https://i.pravatar.cc/150?img=33"
          name="U4"
          size={72}
          status={<AvatarStatusDot variant="neutral" label="Offline" />}
        />
        <Avatar
          src="https://i.pravatar.cc/150?img=34"
          name="U5"
          size={96}
          status={<AvatarStatusDot variant="success" label="Online" />}
        />
        <Avatar
          src="https://i.pravatar.cc/150?img=35"
          name="U6"
          size={128}
          status={<AvatarStatusDot variant="success" label="Online" />}
        />
      </div>

      <h4 {...stylex.props(styles.heading)}>All Colors at Medium</h4>
      <div {...stylex.props(styles.row)}>
        <Avatar
          src="https://i.pravatar.cc/150?img=40"
          name="Positive"
          size="lg"
          status={<AvatarStatusDot variant="success" label="Online" />}
        />
        <Avatar
          src="https://i.pravatar.cc/150?img=41"
          name="Neutral"
          size="lg"
          status={<AvatarStatusDot variant="neutral" label="Offline" />}
        />
        <Avatar
          src="https://i.pravatar.cc/150?img=42"
          name="Negative"
          size="lg"
          status={<AvatarStatusDot variant="error" label="Busy" />}
        />
      </div>
    </div>
  ),
};

export const StatusWithSizes: Story = {
  render: () => (
    <div {...stylex.props(styles.storyWrapper)}>
      <h4 {...stylex.props(styles.heading)}>Status with Different Sizes</h4>
      <div {...stylex.props(styles.row)}>
        <Avatar
          name="AB"
          size="md"
          status={<AvatarStatusDot label="Online" />}
        />
        <Avatar
          name="CD"
          size="lg"
          status={<AvatarStatusDot label="Online" />}
        />
        <Avatar
          name="EF"
          size="xl"
          status={<AvatarStatusDot label="Online" />}
        />
        <Avatar
          name="GH"
          size={72}
          status={<AvatarStatusDot label="Online" />}
        />
      </div>
    </div>
  ),
};

export const StatusShapesAtSmallSizes: Story = {
  name: 'Status Shapes at Small Sizes',
  render: () => (
    <div {...stylex.props(styles.storyWrapper)}>
      <h4 {...stylex.props(styles.heading)}>
        Each variant pairs colour with a distinct shape (filled, ring, minus) so
        status never relies on colour alone — including the smallest sizes,
        where icons cannot render
      </h4>
      <div {...stylex.props(styles.row)}>
        <Avatar
          name="ON"
          size="xsm"
          status={<AvatarStatusDot variant="success" label="Online" />}
        />
        <Avatar
          name="OF"
          size="xsm"
          status={<AvatarStatusDot variant="neutral" label="Offline" />}
        />
        <Avatar
          name="BU"
          size="xsm"
          status={<AvatarStatusDot variant="error" label="Busy" />}
        />
        <Avatar
          name="ON"
          size="md"
          status={<AvatarStatusDot variant="success" label="Online" />}
        />
        <Avatar
          name="OF"
          size="md"
          status={<AvatarStatusDot variant="neutral" label="Offline" />}
        />
        <Avatar
          name="BU"
          size="md"
          status={<AvatarStatusDot variant="error" label="Busy" />}
        />
      </div>
    </div>
  ),
};

export const StatusWithIcon: Story = {
  name: 'Status Dot with Icon',
  render: () => (
    <div {...stylex.props(styles.storyWrapper)}>
      <h4 {...stylex.props(styles.heading)}>
        Icon inside status dot (hidden at tiny sizes where there isn't room)
      </h4>

      <h4 {...stylex.props(styles.heading)}>Named Sizes</h4>
      <div {...stylex.props(styles.row)}>
        <Avatar
          name="TY"
          size="xsm"
          status={
            <AvatarStatusDot
              variant="success"
              label="Verified"
              icon={<CheckIcon />}
            />
          }
        />
        <Avatar
          name="XS"
          size="sm"
          status={
            <AvatarStatusDot
              variant="success"
              label="Verified"
              icon={<CheckIcon />}
            />
          }
        />
        <Avatar
          name="SM"
          size="md"
          status={
            <AvatarStatusDot
              variant="success"
              label="Verified"
              icon={<CheckIcon />}
            />
          }
        />
        <Avatar
          src="https://i.pravatar.cc/150?img=50"
          name="MD"
          size="lg"
          status={
            <AvatarStatusDot
              variant="success"
              label="Verified"
              icon={<CheckIcon />}
            />
          }
        />
        <Avatar
          src="https://i.pravatar.cc/150?img=51"
          name="LG"
          size="xl"
          status={
            <AvatarStatusDot
              variant="success"
              label="Verified"
              icon={<CheckIcon />}
            />
          }
        />
      </div>

      <h4 {...stylex.props(styles.heading)}>Numeric Sizes with Images</h4>
      <div {...stylex.props(styles.row)}>
        <Avatar
          src="https://i.pravatar.cc/150?img=30"
          name="U1"
          size={20}
          status={
            <AvatarStatusDot
              variant="success"
              label="Verified"
              icon={<CheckIcon />}
            />
          }
        />
        <Avatar
          src="https://i.pravatar.cc/150?img=31"
          name="U2"
          size={32}
          status={
            <AvatarStatusDot
              variant="success"
              label="Verified"
              icon={<CheckIcon />}
            />
          }
        />
        <Avatar
          src="https://i.pravatar.cc/150?img=32"
          name="U3"
          size={48}
          status={
            <AvatarStatusDot
              variant="success"
              label="Verified"
              icon={<CheckIcon />}
            />
          }
        />
        <Avatar
          src="https://i.pravatar.cc/150?img=33"
          name="U4"
          size={72}
          status={
            <AvatarStatusDot
              variant="success"
              label="Verified"
              icon={<CheckIcon />}
            />
          }
        />
        <Avatar
          src="https://i.pravatar.cc/150?img=34"
          name="U5"
          size={96}
          status={
            <AvatarStatusDot
              variant="success"
              label="Verified"
              icon={<CheckIcon />}
            />
          }
        />
        <Avatar
          src="https://i.pravatar.cc/150?img=35"
          name="U6"
          size={128}
          status={
            <AvatarStatusDot
              variant="success"
              label="Verified"
              icon={<CheckIcon />}
            />
          }
        />
      </div>

      <h4 {...stylex.props(styles.heading)}>All Variants with Icons</h4>
      <div {...stylex.props(styles.row)}>
        <Avatar
          src="https://i.pravatar.cc/150?img=52"
          name="Positive"
          size="xl"
          status={
            <AvatarStatusDot
              variant="success"
              label="Verified"
              icon={<CheckIcon />}
            />
          }
        />
        <Avatar
          src="https://i.pravatar.cc/150?img=53"
          name="Neutral"
          size="xl"
          status={
            <AvatarStatusDot
              variant="neutral"
              label="Pending"
              icon={<ClockIcon />}
            />
          }
        />
        <Avatar
          src="https://i.pravatar.cc/150?img=54"
          name="Negative"
          size="xl"
          status={
            <AvatarStatusDot
              variant="error"
              label="Rejected"
              icon={<XMarkIcon />}
            />
          }
        />
      </div>
    </div>
  ),
};

export const NumericSizes: Story = {
  render: () => (
    <div {...stylex.props(styles.storyWrapper)}>
      <h4 {...stylex.props(styles.heading)}>Numeric Pixel Sizes</h4>
      <div {...stylex.props(styles.row)}>
        <Avatar name="16" size={16} />
        <Avatar name="24" size={24} />
        <Avatar name="36" size={36} />
        <Avatar name="48" size={48} />
        <Avatar name="72" size={72} />
        <Avatar name="96" size={96} />
        <Avatar name="128" size={128} />
      </div>
    </div>
  ),
};

// A theme can re-scope the fallback initials' typography without forking the
// component: weight, text color, the wash background, and the per-size
// font-size scale are all set on the `avatar-fallback` child target (font size
// through its size tiers). The default row is unchanged (size × 0.4, medium
// weight, neutral fill); only the themed row opts in.
//
// The themed colors deliberately use a hued token pair (blue) rather than
// `--color-accent-muted`/`--color-text-secondary`: in the monochrome neutral
// theme those resolve to the same grey as the default fallback, so the demo
// would look unthemed even though the theme rule is applying.
const fallbackScaleTheme = defineTheme({
  name: 'avatar-fallback-scale',
  components: {
    'avatar-fallback': {
      base: {
        fontWeight: 'var(--font-weight-normal)',
        color: 'var(--color-text-blue)',
        backgroundColor: 'var(--color-background-blue)',
      },
      'size:xsm': {fontSize: '8px'},
      'size:sm': {fontSize: '9px'},
      'size:md': {fontSize: '13px'},
      'size:lg': {fontSize: '16px'},
      'size:xl': {fontSize: '40px'},
    },
  },
});

export const ThemedFallbackScale: Story = {
  name: 'Themed Fallback Type Scale',
  render: () => (
    <div {...stylex.props(styles.storyWrapper)}>
      <h4 {...stylex.props(styles.heading)}>Default fallback (size × 0.4)</h4>
      <div {...stylex.props(styles.row)}>
        <Avatar name="TY" size="xsm" />
        <Avatar name="XS" size="sm" />
        <Avatar name="SM" size="md" />
        <Avatar name="MD" size="lg" />
        <Avatar name="LG" size="xl" />
      </div>

      <h4 {...stylex.props(styles.heading)}>
        Themed fallback (per-size scale, regular weight, blue wash)
      </h4>
      <Theme theme={fallbackScaleTheme} mode="light">
        <div {...stylex.props(styles.row)}>
          <Avatar name="TY" size="xsm" />
          <Avatar name="XS" size="sm" />
          <Avatar name="SM" size="md" />
          <Avatar name="MD" size="lg" />
          <Avatar name="LG" size="xl" />
        </div>
      </Theme>
    </div>
  ),
};

// The fallback surface (initials AND the default person icon) is a direct theme
// target via the stable `astryx-avatar-fallback` class. Setting a background on
// the `avatar-fallback` component key paints the fill on the element that
// actually renders it — no per-component override needed. Both fallback kinds
// pick up the same themed background.
//
// `--color-accent` / `--color-on-accent` gives a full-contrast flip against the
// default grey wash in every shipped theme, so the themed row reads as themed
// at a glance (a muted token would land within a shade of the default here).
const fallbackBackgroundTheme = defineTheme({
  name: 'avatar-fallback-background',
  components: {
    'avatar-fallback': {
      base: {
        backgroundColor: 'var(--color-accent)',
        color: 'var(--color-on-accent)',
      },
    },
  },
});

export const ThemedFallbackBackground: Story = {
  name: 'Themed Fallback Background',
  render: () => (
    <div {...stylex.props(styles.storyWrapper)}>
      <h4 {...stylex.props(styles.heading)}>Default fallback background</h4>
      <div {...stylex.props(styles.row)}>
        <Avatar name="Ada Lovelace" size="lg" />
        <Avatar name="Grace Hopper" size="lg" />
        <Avatar size="lg" />
      </div>

      <h4 {...stylex.props(styles.heading)}>
        Themed fallback background (solid accent on initials and icon)
      </h4>
      <Theme theme={fallbackBackgroundTheme} mode="light">
        <div {...stylex.props(styles.row)}>
          <Avatar name="Ada Lovelace" size="lg" />
          <Avatar name="Grace Hopper" size="lg" />
          <Avatar size="lg" />
        </div>
      </Theme>
    </div>
  ),
};

export const Interactive: Story = {
  name: 'Interactive (link and button)',
  render: () => (
    <div {...stylex.props(styles.storyWrapper)}>
      <h4 {...stylex.props(styles.heading)}>
        Link avatars (href) — Tab to reach, focus ring on the avatar
      </h4>
      <div {...stylex.props(styles.row)}>
        <Avatar
          src="https://i.pravatar.cc/150?img=30"
          name="Ada Lovelace"
          href="https://example.com/users/ada"
          size="lg"
        />
        <Avatar
          name="Grace Hopper"
          href="https://example.com/users/grace"
          target="_blank"
          rel="noopener noreferrer"
          size="lg"
        />
        <Avatar
          name="Katherine Johnson"
          href="https://example.com/users/katherine"
          as={RouterLink}
          size="lg"
        />
      </div>

      <h4 {...stylex.props(styles.heading)}>Button avatars (onClick)</h4>
      <div {...stylex.props(styles.row)}>
        <Avatar
          src="https://i.pravatar.cc/150?img=31"
          name="Mary Jackson"
          onClick={() => {}}
          size="lg"
        />
        <Avatar
          name="Dorothy Vaughan"
          onClick={() => {}}
          size="lg"
          status={<AvatarStatusDot variant="success" label="Online" />}
        />
      </div>

      <h4 {...stylex.props(styles.heading)}>
        Interactive at every size — the smallest tiers are the touch-target case
      </h4>
      <div {...stylex.props(styles.row)}>
        <Avatar name="Ada Lovelace" href="https://example.com" size="xsm" />
        <Avatar name="Ada Lovelace" href="https://example.com" size="sm" />
        <Avatar name="Ada Lovelace" href="https://example.com" size="md" />
        <Avatar name="Ada Lovelace" href="https://example.com" size="lg" />
        <Avatar name="Ada Lovelace" onClick={() => {}} size={16} />
      </div>
    </div>
  ),
};

export const LongAndNonLatinNames: Story = {
  name: 'Long and Non-Latin Names',
  render: () => (
    <div {...stylex.props(styles.storyWrapper)}>
      <h4 {...stylex.props(styles.heading)}>
        Initials are one grapheme from the first and last word, in any script
      </h4>
      <div {...stylex.props(styles.row)}>
        <Avatar name="Bartholomew" size="lg" tooltip={false} />
        <Avatar
          name="Maria Fernanda de la Cruz y Villalobos"
          size="lg"
          tooltip={false}
        />
        <Avatar name="محمد علي" size="lg" tooltip={false} />
        <Avatar name="李小龍" size="lg" tooltip={false} />
        <Avatar name="Ἀριστοτέλης Σταγειρίτης" size="lg" tooltip={false} />
        <Avatar name="🇬🇧 Ada" size="lg" tooltip={false} />
      </div>

      <h4 {...stylex.props(styles.heading)}>
        A long name in the tooltip, and as the accessible name
      </h4>
      <div {...stylex.props(styles.row)}>
        <Avatar
          name="Maria Fernanda de la Cruz y Villalobos"
          size="lg"
          tooltip="Maria Fernanda de la Cruz y Villalobos, Principal Engineer, Platform Infrastructure"
        />
      </div>
    </div>
  ),
};

export const NarrowContainer: Story = {
  render: () => (
    <div {...stylex.props(styles.narrow)}>
      <h4 {...stylex.props(styles.heading)}>320px container</h4>
      <div {...stylex.props(styles.wrapRow)}>
        <Avatar name="Ada Lovelace" size="lg" />
        <Avatar name="Grace Hopper" size="lg" />
        <Avatar
          name="Katherine Johnson"
          size="lg"
          status={<AvatarStatusDot variant="success" label="Online" />}
        />
        <Avatar name="Mary Jackson" size="xl" />
      </div>
    </div>
  ),
};
