// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {SelectableCard} from '@astryxdesign/core/SelectableCard';
import {Grid} from '@astryxdesign/core/Grid';
import {Text} from '@astryxdesign/core/Text';

const tags = [
  {id: 'react', name: 'React', variant: 'blue' as const},
  {id: 'typescript', name: 'TypeScript', variant: 'cyan' as const},
  {id: 'node', name: 'Node.js', variant: 'green' as const},
  {id: 'python', name: 'Python', variant: 'yellow' as const},
  {id: 'rust', name: 'Rust', variant: 'orange' as const},
  {id: 'go', name: 'Go', variant: 'teal' as const},
];

export default function SelectableCardMulti() {
  const [selected, setSelected] = useState(new Set(['react', 'typescript']));

  return (
    <Grid columns={3} gap={2} width={400} maxWidth="100%">
      {tags.map(tag => (
        <SelectableCard
          key={tag.id}
          label={tag.name}
          isSelected={selected.has(tag.id)}
          variant={tag.variant}
          onChange={isNow => {
            setSelected(prev => {
              const next = new Set(prev);
              if (isNow) {
                next.add(tag.id);
              } else {
                next.delete(tag.id);
              }
              return next;
            });
          }}>
          <Text type="body" weight="bold">
            {tag.name}
          </Text>
        </SelectableCard>
      ))}
    </Grid>
  );
}
