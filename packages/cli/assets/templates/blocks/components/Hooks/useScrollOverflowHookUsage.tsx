// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Button} from '@astryxdesign/core/Button';
import {useScrollOverflow} from '@astryxdesign/core/hooks';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Switch} from '@astryxdesign/core/Switch';
import {Token} from '@astryxdesign/core/Token';
import {spacingVars} from '@astryxdesign/core/theme/tokens.stylex';

const FADE = spacingVars['--spacing-8'];
const FADE_FROM_LEFT = `linear-gradient(to right, transparent, black ${FADE})`;
const FADE_FROM_RIGHT = `linear-gradient(to left, transparent, black ${FADE})`;

const styles = stylex.create({
  strip: {
    display: 'flex',
    gap: spacingVars['--spacing-2'],
    overflowX: 'auto',
  },
  filter: {
    flexShrink: 0,
  },
  fadeLeft: {
    maskImage: FADE_FROM_LEFT,
  },
  fadeRight: {
    maskImage: FADE_FROM_RIGHT,
  },
  fadeBoth: {
    maskImage: `linear-gradient(to right, transparent, black ${FADE}, black calc(100% - ${FADE}), transparent)`,
  },
});

const FILTERS = [
  'Open now',
  'Free delivery',
  'Vegetarian',
  'Under $15',
  'Top rated',
  'Outdoor seating',
  'Pet friendly',
];

export default function UseScrollOverflowHookUsage() {
  const [filters, setFilters] = useState(FILTERS.slice(0, 2));
  const [isRtl, setIsRtl] = useState(false);
  const {scrollRef, overflowStart, overflowEnd} = useScrollOverflow();
  const nextFilter = FILTERS.find(filter => !filters.includes(filter));
  const fadeStart = isRtl ? styles.fadeRight : styles.fadeLeft;
  const fadeEnd = isRtl ? styles.fadeLeft : styles.fadeRight;

  return (
    <VStack gap={3} width={320}>
      <div dir={isRtl ? 'rtl' : 'ltr'}>
        <div
          ref={scrollRef}
          role="group"
          aria-label="Active filters"
          {...stylex.props(
            styles.strip,
            overflowStart && overflowEnd
              ? styles.fadeBoth
              : overflowStart
                ? fadeStart
                : overflowEnd && fadeEnd,
          )}>
          {filters.map(filter => (
            <Token
              key={filter}
              label={filter}
              xstyle={styles.filter}
              onRemove={() =>
                setFilters(current => current.filter(item => item !== filter))
              }
            />
          ))}
        </div>
      </div>
      <HStack gap={3} vAlign="center">
        <Button
          label="Add filter"
          variant="secondary"
          isDisabled={nextFilter == null}
          onClick={() => nextFilter && setFilters([...filters, nextFilter])}
        />
        <Switch label="Right to left" value={isRtl} onChange={setIsRtl} />
      </HStack>
    </VStack>
  );
}
