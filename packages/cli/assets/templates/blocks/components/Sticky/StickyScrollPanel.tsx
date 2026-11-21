// Copyright (c) Meta Platforms, Inc. and affiliates.

import * as stylex from '@stylexjs/stylex';
import {Card} from '@astryxdesign/core/Card';
import {ScrollableArea} from '@astryxdesign/core/ScrollableArea';
import {Sticky} from '@astryxdesign/core/Sticky';
import {Heading, Text} from '@astryxdesign/core/Text';
import {colorVars, spacingVars} from '@astryxdesign/core/theme/tokens.stylex';

const styles = stylex.create({
  heading: {
    backgroundColor: colorVars['--color-background-card'],
    paddingBlock: spacingVars['--spacing-2'],
  },
  item: {
    paddingBlock: spacingVars['--spacing-3'],
    borderBlockEndWidth: 1,
    borderBlockEndStyle: 'solid',
    borderBlockEndColor: colorVars['--color-border'],
  },
});

const ITEMS = [
  'Review the design proposal',
  'Share implementation notes',
  'Confirm the launch checklist',
  'Publish the release summary',
  'Archive the project notes',
];

export default function StickyScrollPanel() {
  return (
    <Card width={360} padding={3}>
      <ScrollableArea
        axis="block"
        height={280}
        padding={2}
        role="region"
        label="Project tasks">
        <Sticky xstyle={styles.heading}>
          <Heading level={3}>Project tasks</Heading>
        </Sticky>
        {ITEMS.map((item, index) => (
          <div key={item} {...stylex.props(styles.item)}>
            <Text>
              {index + 1}. {item}
            </Text>
          </div>
        ))}
      </ScrollableArea>
    </Card>
  );
}
