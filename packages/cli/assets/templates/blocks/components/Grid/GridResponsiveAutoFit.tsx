// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Grid} from '@astryxdesign/core/Grid';
import {Card} from '@astryxdesign/core/Card';
import {Layout, LayoutContent, LayoutPanel} from '@astryxdesign/core/Layout';
import {useResizable, ResizeHandle} from '@astryxdesign/core/Resizable';
import {VStack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';

const teams = [
  {name: 'Design Systems', members: 8},
  {name: 'Frontend Platform', members: 12},
  {name: 'Developer Experience', members: 6},
  {name: 'Accessibility', members: 4},
  {name: 'Performance', members: 7},
  {name: 'Mobile Infrastructure', members: 9},
];

export default function GridResponsiveAutoFit() {
  const gridPanel = useResizable({
    defaultSize: 480,
    minSize: 100,
    maxSize: 480,
  });

  return (
    <Card
      variant="muted"
      padding={0}
      height={400}
      width="100%"
      style={{maxWidth: 500}}>
      <Layout
        height="fill"
        start={
          <>
            <LayoutPanel
              width={gridPanel.size}
              hasDivider={false}
              style={{padding: 'var(--spacing-4)'}}>
              <Grid
                columns={{minWidth: 180, repeat: 'fit'}}
                gap={4}
                width="100%">
                {teams.map(team => (
                  <Card key={team.name}>
                    <VStack gap={1}>
                      <Text type="label" display="block">
                        {team.name}
                      </Text>
                      <Text type="supporting" display="block">
                        {team.members} members
                      </Text>
                    </VStack>
                  </Card>
                ))}
              </Grid>
            </LayoutPanel>
            <ResizeHandle
              direction="horizontal"
              hasDivider
              isAlwaysVisible
              resizable={gridPanel.props}
              label="Resize grid"
            />
          </>
        }
        content={<LayoutContent />}
      />
    </Card>
  );
}
