// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @input A host-positioned CommentPin, its lead commenter, and local
 *   selected state
 * @output A document passage with one comment pin in its margin; activating
 *   the pin toggles its selection and aria-pressed state
 * @position Copyable Lab CommentPin placement example
 */

import {useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Card} from '@astryxdesign/core/Card';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/Stack';
import {colorVars, spacingVars} from '@astryxdesign/core/theme/tokens.stylex';
import {CommentPin} from '@astryxdesign/lab';

const styles = stylex.create({
  document: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 64px',
    minHeight: 220,
  },
  content: {
    padding: spacingVars['--spacing-5'],
  },
  margin: {
    position: 'relative',
    borderInlineStartWidth: 1,
    borderInlineStartStyle: 'solid',
    borderInlineStartColor: colorVars['--color-border'],
    backgroundColor: colorVars['--color-background-muted'],
  },
  // Inset far enough from the clipped Card edges that the selected ring and
  // the farther-out keyboard focus outline stay fully visible.
  pin: {
    position: 'absolute',
    insetInlineStart: spacingVars['--spacing-3'],
    insetBlockStart: spacingVars['--spacing-10'],
    transform: 'translateY(-100%)',
  },
});

export default function CommentPinInMargin() {
  const [isSelected, setIsSelected] = useState(false);
  return (
    <Card padding={0} width={520}>
      <div {...stylex.props(styles.document)}>
        <VStack gap={3} xstyle={styles.content}>
          <Text as="h2" type="display-3" weight="bold">
            Review notes
          </Text>
          <Text type="body">
            The host owns the document anchor and margin layout. The pin stays a
            compact action that identifies the lead commenter.
          </Text>
          <Text type="supporting" color="secondary">
            Selecting the pin can open a thread beside this passage or in a
            shared comments panel.
          </Text>
        </VStack>
        <div aria-label="Comment margin" {...stylex.props(styles.margin)}>
          <CommentPin
            label="Open comment from Maya"
            participants={[{id: 'maya', name: 'Maya Chen'}]}
            isSelected={isSelected}
            onClick={() => setIsSelected(current => !current)}
            xstyle={styles.pin}
          />
        </div>
      </div>
    </Card>
  );
}
