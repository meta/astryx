// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {useEffect, useRef, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {CommentPin} from '@astryxdesign/lab';
import {Text} from '@astryxdesign/core/Text';
import {HStack, VStack} from '@astryxdesign/core/Stack';
import {
  colorVars,
  radiusVars,
  shadowVars,
  spacingVars,
} from '@astryxdesign/core/theme/tokens.stylex';

const PEOPLE = {
  ada: {
    id: 'ada',
    name: 'Ada Lovelace',
    avatarSrc: 'https://i.pravatar.cc/80?img=47',
  },
  lin: {
    id: 'lin',
    name: 'Lin Chen',
    avatarSrc: 'https://i.pravatar.cc/80?img=32',
  },
  mira: {
    id: 'mira',
    name: 'Mira Patel',
    avatarSrc: 'https://i.pravatar.cc/80?img=5',
  },
  noah: {
    id: 'noah',
    name: 'Noah Williams',
    avatarSrc: 'https://i.pravatar.cc/80?img=12',
  },
  sam: {
    id: 'sam',
    name: 'Sam Rivera',
    avatarSrc: 'https://i.pravatar.cc/80?img=15',
  },
};

const styles = stylex.create({
  story: {
    padding: spacingVars['--spacing-8'],
  },
  row: {
    alignItems: 'center',
    minHeight: 44,
  },
  stateLabel: {
    minWidth: 140,
  },
  sizeColumn: {
    minWidth: 120,
  },
  canvas: {
    position: 'relative',
    width: 520,
    height: 300,
    overflow: 'hidden',
    borderRadius: radiusVars['--radius-container'],
    backgroundColor: colorVars['--color-background-surface'],
    boxShadow: shadowVars['--shadow-med'],
  },
  photo: {
    display: 'block',
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  overMarker: {
    position: 'absolute',
    insetInlineStart: '38%',
    insetBlockStart: '34%',
    transform: 'translateY(-100%)',
  },
  margin: {
    position: 'absolute',
    insetBlock: 0,
    insetInlineEnd: 0,
    width: 72,
    backgroundColor: colorVars['--color-background-muted'],
    borderInlineStartWidth: 1,
    borderInlineStartStyle: 'solid',
    borderInlineStartColor: colorVars['--color-border'],
  },
  marginMarker: {
    position: 'absolute',
    insetInlineStart: '50%',
    insetBlockStart: '66%',
    transform: 'translateY(-100%)',
  },
});

const SIZES = ['sm', 'md', 'lg'] as const;

const EVERYONE = [
  PEOPLE.ada,
  PEOPLE.lin,
  PEOPLE.mira,
  PEOPLE.noah,
  PEOPLE.sam,
] as const;

const SIZE_ROWS = [
  {
    name: 'Single',
    props: {label: 'Open annotation from Ada', participants: [PEOPLE.ada]},
  },
  {
    name: 'Grouped',
    props: {
      label: 'Open 4 grouped annotations from Ada and Lin',
      participants: [PEOPLE.ada, PEOPLE.lin],
      threadCount: 4,
    },
  },
  {
    name: 'Group overflow',
    props: {
      label: 'Open 8 grouped annotations from Ada, Lin, and 3 others',
      participants: EVERYONE,
      threadCount: 8,
    },
  },
  {
    name: 'Unread single',
    props: {
      label: 'Open unread annotation from Mira',
      participants: [PEOPLE.mira],
      unreadCount: 1,
    },
  },
  {
    name: 'Unread group',
    props: {
      label: 'Open 8 grouped annotations from Ada, Lin, and 3 others, 3 unread',
      participants: EVERYONE,
      threadCount: 8,
      unreadCount: 3,
    },
  },
  {
    name: 'Selected group',
    props: {
      label: 'Current group of 12 annotations from Ada, Lin, and 3 others',
      participants: EVERYONE,
      threadCount: 12,
      isSelected: true,
    },
  },
] as const;

function FocusedSelectedPin() {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <CommentPin
      ref={ref}
      label="Focused current annotation from Ada"
      participants={[PEOPLE.ada]}
      isSelected
    />
  );
}

const meta: Meta<typeof CommentPin> = {
  title: 'Lab/CommentPin',
  component: CommentPin,
  tags: ['autodocs'],
  parameters: {layout: 'centered'},
  args: {
    label: 'Open annotation from Ada',
    participants: [PEOPLE.ada],
    onClick: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof CommentPin>;

export const Default: Story = {};

export const Grouped: Story = {
  args: {
    label: 'Open 4 grouped annotations from Ada and Lin',
    participants: [PEOPLE.ada, PEOPLE.lin],
    threadCount: 4,
  },
};

export const Sizes: Story = {
  render: () => (
    <VStack gap={3} xstyle={styles.story}>
      <HStack gap={4} xstyle={styles.row}>
        <Text type="supporting" xstyle={styles.stateLabel}>
          Size
        </Text>
        {SIZES.map(size => (
          <Text key={size} type="supporting" xstyle={styles.sizeColumn}>
            {size}
          </Text>
        ))}
      </HStack>
      {SIZE_ROWS.map(row => (
        <HStack key={row.name} gap={4} xstyle={styles.row}>
          <Text type="supporting" xstyle={styles.stateLabel}>
            {row.name}
          </Text>
          {SIZES.map(size => (
            <HStack key={size} xstyle={styles.sizeColumn}>
              <CommentPin {...row.props} size={size} onClick={() => {}} />
            </HStack>
          ))}
        </HStack>
      ))}
    </VStack>
  ),
};

export const StateMatrix: Story = {
  render: () => (
    <VStack gap={3} xstyle={styles.story}>
      <HStack gap={4} xstyle={styles.row}>
        <Text type="supporting" xstyle={styles.stateLabel}>
          Single
        </Text>
        <CommentPin
          label="Open annotation from Ada"
          participants={[PEOPLE.ada]}
        />
      </HStack>
      <HStack gap={4} xstyle={styles.row}>
        <Text type="supporting" xstyle={styles.stateLabel}>
          Selected
        </Text>
        <CommentPin
          label="Current annotation from Ada"
          participants={[PEOPLE.ada]}
          isSelected
        />
      </HStack>
      <HStack gap={4} xstyle={styles.row}>
        <Text type="supporting" xstyle={styles.stateLabel}>
          Selected + focus
        </Text>
        <FocusedSelectedPin />
      </HStack>
      <HStack gap={4} xstyle={styles.row}>
        <Text type="supporting" xstyle={styles.stateLabel}>
          Other pin dimmed
        </Text>
        <CommentPin
          label="Open another annotation from Mira"
          participants={[PEOPLE.mira]}
          isDimmed
        />
      </HStack>
      <HStack gap={4} xstyle={styles.row}>
        <Text type="supporting" xstyle={styles.stateLabel}>
          Grouped
        </Text>
        <CommentPin
          label="Open 4 grouped annotations from Ada and Lin"
          participants={[PEOPLE.ada, PEOPLE.lin]}
          threadCount={4}
        />
      </HStack>
      <HStack gap={4} xstyle={styles.row}>
        <Text type="supporting" xstyle={styles.stateLabel}>
          Selected group
        </Text>
        <CommentPin
          label="Current group of 12 annotations from Ada, Lin, and Mira"
          participants={[PEOPLE.ada, PEOPLE.lin, PEOPLE.mira]}
          threadCount={12}
          isSelected
        />
      </HStack>
      <HStack gap={4} xstyle={styles.row}>
        <Text type="supporting" xstyle={styles.stateLabel}>
          Group overflow
        </Text>
        <CommentPin
          label="Open 8 grouped annotations from Ada, Lin, and 3 others"
          participants={[
            PEOPLE.ada,
            PEOPLE.lin,
            PEOPLE.mira,
            PEOPLE.noah,
            PEOPLE.sam,
          ]}
          threadCount={8}
        />
      </HStack>
      <HStack gap={4} xstyle={styles.row}>
        <Text type="supporting" xstyle={styles.stateLabel}>
          Unread single
        </Text>
        <CommentPin
          label="Open unread annotation from Mira"
          participants={[PEOPLE.mira]}
          unreadCount={1}
        />
      </HStack>
      <HStack gap={4} xstyle={styles.row}>
        <Text type="supporting" xstyle={styles.stateLabel}>
          Unread group
        </Text>
        <CommentPin
          label="Open 8 grouped annotations from Ada, Lin, and 3 others, 3 unread"
          participants={[
            PEOPLE.ada,
            PEOPLE.lin,
            PEOPLE.mira,
            PEOPLE.noah,
            PEOPLE.sam,
          ]}
          threadCount={8}
          unreadCount={3}
        />
      </HStack>
      <HStack gap={4} xstyle={styles.row}>
        <Text type="supporting" xstyle={styles.stateLabel}>
          Resolved, selected
        </Text>
        {/* An unselected resolved pin renders nothing. */}
        <CommentPin
          label="Current resolved annotation from Mira"
          participants={[PEOPLE.mira]}
          isResolved
          isSelected
        />
      </HStack>
      <HStack gap={4} xstyle={styles.row}>
        <Text type="supporting" xstyle={styles.stateLabel}>
          Disabled / pending
        </Text>
        <CommentPin
          label="Pending annotation from Ada"
          participants={[PEOPLE.ada]}
          isSelected
          isDisabled
        />
      </HStack>
    </VStack>
  ),
};

export const OverContentAndInMargin: Story = {
  render: function PlacementStory() {
    const [selected, setSelected] = useState<'content' | 'margin' | null>(
      'content',
    );
    // aria-pressed toggle semantics: activating the selected pin clears it.
    const toggle = (id: 'content' | 'margin') =>
      setSelected(current => (current === id ? null : id));
    return (
      <div {...stylex.props(styles.canvas)}>
        <img
          src="https://images.unsplash.com/photo-1558655146-d09347e92766?w=1040&h=600&fit=crop&auto=format"
          alt="Design materials arranged on a desk"
          {...stylex.props(styles.photo)}
        />
        <CommentPin
          label="Open 4 grouped annotations over the image"
          participants={[PEOPLE.ada, PEOPLE.lin]}
          threadCount={4}
          isSelected={selected === 'content'}
          isDimmed={selected != null && selected !== 'content'}
          onClick={() => toggle('content')}
          xstyle={styles.overMarker}
        />
        <div {...stylex.props(styles.margin)}>
          <CommentPin
            label="Open margin annotation from Mira"
            participants={[PEOPLE.mira]}
            isSelected={selected === 'margin'}
            isDimmed={selected != null && selected !== 'margin'}
            onClick={() => toggle('margin')}
            xstyle={styles.marginMarker}
          />
        </div>
      </div>
    );
  },
};
