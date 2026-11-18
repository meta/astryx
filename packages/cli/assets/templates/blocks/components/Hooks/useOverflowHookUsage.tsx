// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import * as stylex from '@stylexjs/stylex';
import {useOverflow} from '@astryxdesign/core/hooks';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {DropdownMenu} from '@astryxdesign/core/DropdownMenu';

const actions = [
  'Bold',
  'Italic',
  'Underline',
  'Strikethrough',
  'Link',
  'Quote',
  'Code',
  'Clear formatting',
];

const GAP = 4;

const styles = stylex.create({
  box: {
    resize: 'horizontal',
    overflow: 'hidden',
    width: 480,
    minWidth: 120,
    maxWidth: '100%',
  },
  row: {
    display: 'flex',
    gap: GAP,
  },
  // Takes no space and paints nothing, so the hook measures every item
  // without a flicker. Do not use display: none, which stops measurement.
  measure: {
    position: 'absolute',
    visibility: 'hidden',
    height: 0,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
  },
});

function MoreMenu({items}: {items: string[]}) {
  return (
    <DropdownMenu
      button={{label: 'More', variant: 'ghost', size: 'sm'}}
      items={items.map(label => ({label}))}
    />
  );
}

export default function UseOverflowHookUsage() {
  const {containerRef, measureRef, visibleCount, hasOverflow} = useOverflow(
    actions.length,
    {gap: GAP},
  );

  return (
    <Card padding={2} xstyle={styles.box}>
      <div
        ref={measureRef}
        aria-hidden="true"
        inert
        {...stylex.props(styles.row, styles.measure)}>
        {actions.map(label => (
          <Button key={label} label={label} variant="ghost" size="sm" />
        ))}
        <div data-overflow-indicator>
          <MoreMenu items={actions} />
        </div>
      </div>
      <div
        ref={containerRef}
        role="group"
        aria-label="Text formatting"
        {...stylex.props(styles.row)}>
        {actions.slice(0, visibleCount).map(label => (
          <Button key={label} label={label} variant="ghost" size="sm" />
        ))}
        {hasOverflow && <MoreMenu items={actions.slice(visibleCount)} />}
      </div>
    </Card>
  );
}
