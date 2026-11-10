// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file page.tsx
 * @input ContextMenu and the components a page wraps in one
 * @output A phone page of ContextMenus in place: list rows, cards, table
 *   cells, thumbnails, the page's edges, a scroller and a clipping box
 * @position A raw Sandbox page (/pages/context-menu-lift/) with no sandbox
 *   frame. The document scrolls, so a held finger lifts each trigger where a
 *   page puts it, with the page's own scroll.
 */

'use client';

import * as stylex from '@stylexjs/stylex';
import {Card} from '@astryxdesign/core/Card';
import {ContextMenu} from '@astryxdesign/core/ContextMenu';
import {Divider} from '@astryxdesign/core/Divider';
import {Grid} from '@astryxdesign/core/Grid';
import {Item} from '@astryxdesign/core/Item';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Switch} from '@astryxdesign/core/Switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from '@astryxdesign/core/Table';
import {Heading, Text} from '@astryxdesign/core/Text';
import {Thumbnail} from '@astryxdesign/core/Thumbnail';
import {useThemeControls} from '../../../providers';

const MENU = [
  {label: 'Copy', onClick: () => {}},
  {label: 'Share', onClick: () => {}},
  {label: 'Rename', onClick: () => {}},
  {label: 'Delete', onClick: () => {}},
];

const ROWS = Array.from({length: 24}, (_, i) => ({
  id: i + 1,
  name: `Message ${i + 1}`,
  preview: 'Hold the row to lift it. Tap the dimmed page to close.',
}));

const FILES = [
  {name: 'Budget.xlsx', owner: 'Ana', size: '24 KB'},
  {name: 'Roadmap.pdf', owner: 'Ben', size: '1.2 MB'},
  {name: 'Logo.svg', owner: 'Chris', size: '8 KB'},
  {name: 'Notes.txt', owner: 'Dana', size: '2 KB'},
];

const HUES = [210, 20, 140, 280, 50, 330];

// A flat swatch as an image, so the page needs no network for its pictures.
function swatch(hue: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="hsl(${hue} 70% 55%)"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const styles = stylex.create({
  // The rows at the page's very top and bottom touch its edges.
  edgeRow: {paddingInline: 0},
  scroller: {
    overflowX: 'auto',
    paddingBlock: 8,
  },
  scrollerCard: {flexShrink: 0},
  clip: {
    overflow: 'hidden',
    height: 120,
  },
  // The trigger fills its table cell.
  cellTrigger: {display: 'block'},
});

export default function ContextMenuLiftPage() {
  const {mode, setMode} = useThemeControls();
  return (
    <VStack gap={0}>
      <ContextMenu items={MENU} label="Top row">
        <Item
          label="Top edge"
          description="The page's first row, against the top of the screen"
          xstyle={styles.edgeRow}
        />
      </ContextMenu>
      <VStack gap={6} padding={4}>
        <VStack gap={2}>
          <Heading level={1}>ContextMenu in place</Heading>
          <Text>
            Hold any row, card, cell or picture until its menu shows. The page
            scrolls on its own; tap the dimmed page to close a menu.
          </Text>
          <Switch
            label="Dark mode"
            value={mode === 'dark'}
            onChange={isOn => setMode(isOn ? 'dark' : 'light')}
          />
        </VStack>

        <VStack gap={2}>
          <Heading level={2}>Rows in a long list</Heading>
          <VStack gap={0}>
            {ROWS.map((row, i) => (
              <VStack key={row.id} gap={0}>
                {i > 0 ? <Divider /> : null}
                <ContextMenu items={MENU} label={row.name}>
                  <Item label={row.name} description={row.preview} />
                </ContextMenu>
              </VStack>
            ))}
          </VStack>
        </VStack>

        <VStack gap={2}>
          <Heading level={2}>Cards in a grid</Heading>
          <Grid columns={2} gap={3}>
            {HUES.map((hue, i) => (
              <ContextMenu key={hue} items={MENU} label={`Card ${i + 1}`}>
                <Card>
                  <VStack gap={1}>
                    <Thumbnail src={swatch(hue)} alt="" />
                    <Text weight="semibold">{`Card ${i + 1}`}</Text>
                    <Text type="supporting">A card in a two-column grid</Text>
                  </VStack>
                </Card>
              </ContextMenu>
            ))}
          </Grid>
        </VStack>

        <VStack gap={2}>
          <Heading level={2}>Table cells</Heading>
          <Text type="supporting">
            A row has no wrapper, so each name cell holds the trigger.
          </Text>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Owner</TableHeaderCell>
                <TableHeaderCell>Size</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {FILES.map(file => (
                <TableRow key={file.name}>
                  <TableCell>
                    <ContextMenu
                      items={MENU}
                      label={file.name}
                      triggerXstyle={styles.cellTrigger}>
                      <Text>{file.name}</Text>
                    </ContextMenu>
                  </TableCell>
                  <TableCell>{file.owner}</TableCell>
                  <TableCell>{file.size}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </VStack>

        <VStack gap={2}>
          <Heading level={2}>Thumbnails</Heading>
          <HStack gap={2}>
            {HUES.slice(0, 4).map((hue, i) => (
              <ContextMenu key={hue} items={MENU} label={`Picture ${i + 1}`}>
                <Thumbnail src={swatch(hue)} alt={`Picture ${i + 1}`} />
              </ContextMenu>
            ))}
          </HStack>
        </VStack>

        <VStack gap={2}>
          <Heading level={2}>The side edges</Heading>
          <HStack gap={2} justify="space-between">
            <ContextMenu items={MENU} label="Left edge">
              <Card padding={2}>
                <Text>Left edge</Text>
              </Card>
            </ContextMenu>
            <ContextMenu items={MENU} label="Right edge">
              <Card padding={2}>
                <Text>Right edge</Text>
              </Card>
            </ContextMenu>
          </HStack>
        </VStack>

        <VStack gap={2}>
          <Heading level={2}>Inside a scroller</Heading>
          <HStack gap={3} xstyle={styles.scroller}>
            {HUES.map((hue, i) => (
              <ContextMenu
                key={hue}
                items={MENU}
                label={`Scrolled card ${i + 1}`}>
                <Card width={160} xstyle={styles.scrollerCard}>
                  <VStack gap={1}>
                    <Thumbnail src={swatch(hue)} alt="" />
                    <Text>{`Scrolled card ${i + 1}`}</Text>
                  </VStack>
                </Card>
              </ContextMenu>
            ))}
          </HStack>
        </VStack>

        <VStack gap={2}>
          <Heading level={2}>Inside a clipping box</Heading>
          <Card padding={0} xstyle={styles.clip}>
            <VStack gap={0}>
              {ROWS.slice(0, 4).map(row => (
                <ContextMenu key={row.id} items={MENU} label={row.name}>
                  <Item
                    label={`Clipped ${row.name}`}
                    description="Its box hides what overflows"
                  />
                </ContextMenu>
              ))}
            </VStack>
          </Card>
        </VStack>
      </VStack>
      <ContextMenu items={MENU} label="Bottom row">
        <Item
          label="Bottom edge"
          description="The page's last row, against the bottom of the screen"
          xstyle={styles.edgeRow}
        />
      </ContextMenu>
    </VStack>
  );
}
