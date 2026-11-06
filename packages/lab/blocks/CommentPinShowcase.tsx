// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @input Three caller-positioned comment pins, logical bottom-start anchors,
 *   participant/thread/unread counts, and controlled selected/dimmed state
 *   that may be empty
 * @output A grouped pin with a three-circle participant cap and an unread
 *   dot, a single pin, and an unread margin pin; activating the selected
 *   pin clears the selection, and non-selected pins dim only while another pin
 *   is selected
 * @position CommentPin docsite showcase and copyable Lab block
 */

import {useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {CommentPin} from '@astryxdesign/lab';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/Stack';
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
  root: {
    width: '100%',
    maxWidth: 720,
  },
  canvas: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 72px',
    minHeight: 360,
    overflow: 'hidden',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colorVars['--color-border'],
    borderRadius: radiusVars['--radius-container'],
    backgroundColor: colorVars['--color-background-surface'],
    boxShadow: shadowVars['--shadow-med'],
  },
  media: {
    position: 'relative',
    minWidth: 0,
    minHeight: 360,
  },
  image: {
    display: 'block',
    width: '100%',
    height: 360,
    objectFit: 'cover',
  },
  groupedMarker: {
    position: 'absolute',
    insetInlineStart: '38%',
    insetBlockStart: '30%',
    transform: 'translateY(-100%)',
  },
  resolvedMarker: {
    position: 'absolute',
    insetInlineStart: '66%',
    insetBlockStart: '69%',
    transform: 'translateY(-100%)',
  },
  margin: {
    position: 'relative',
    minHeight: 360,
    borderInlineStartWidth: 1,
    borderInlineStartStyle: 'solid',
    borderInlineStartColor: colorVars['--color-border'],
    backgroundColor: colorVars['--color-background-muted'],
  },
  marginRule: {
    position: 'absolute',
    insetInlineStart: '50%',
    insetBlock: spacingVars['--spacing-5'],
    width: 1,
    backgroundColor: colorVars['--color-border'],
  },
  marginMarker: {
    position: 'absolute',
    insetInlineStart: '50%',
    insetBlockStart: '48%',
    transform: 'translateY(-100%)',
  },
});

type PinId = 'grouped' | 'margin' | 'resolved';

export default function CommentPinShowcase() {
  const [selected, setSelected] = useState<PinId | null>('grouped');
  // aria-pressed toggle semantics: activating the selected pin clears it.
  const toggle = (id: PinId) =>
    setSelected(current => (current === id ? null : id));

  return (
    <VStack gap={4} xstyle={styles.root}>
      <VStack gap={1}>
        <Text as="h3" type="display-3" weight="bold">
          Annotations keep identity at the anchor
        </Text>
        <Text type="supporting" color="secondary">
          The host positions and groups markers; each marker owns only its
          compact interactive surface.
        </Text>
      </VStack>

      <div {...stylex.props(styles.canvas)}>
        <div {...stylex.props(styles.media)}>
          <img
            src="https://images.unsplash.com/photo-1558655146-d09347e92766?w=1296&h=720&fit=crop&auto=format"
            alt="Design materials arranged on a desk"
            {...stylex.props(styles.image)}
          />
          <CommentPin
            label="Open 6 grouped annotations from Ada, Lin, and 3 others, 2 unread"
            participants={[
              PEOPLE.ada,
              PEOPLE.lin,
              PEOPLE.mira,
              PEOPLE.noah,
              PEOPLE.sam,
            ]}
            threadCount={6}
            unreadCount={2}
            isSelected={selected === 'grouped'}
            isDimmed={selected != null && selected !== 'grouped'}
            onClick={() => toggle('grouped')}
            xstyle={styles.groupedMarker}
          />
          <CommentPin
            label="Open annotation from Mira"
            participants={[PEOPLE.mira]}
            isSelected={selected === 'resolved'}
            isDimmed={selected != null && selected !== 'resolved'}
            onClick={() => toggle('resolved')}
            xstyle={styles.resolvedMarker}
          />
        </div>

        <div aria-label="Annotation margin" {...stylex.props(styles.margin)}>
          <span aria-hidden="true" {...stylex.props(styles.marginRule)} />
          <CommentPin
            label="Open unread margin annotation from Mira"
            participants={[PEOPLE.mira]}
            unreadCount={1}
            isSelected={selected === 'margin'}
            isDimmed={selected != null && selected !== 'margin'}
            onClick={() => toggle('margin')}
            xstyle={styles.marginMarker}
          />
        </div>
      </div>
    </VStack>
  );
}
