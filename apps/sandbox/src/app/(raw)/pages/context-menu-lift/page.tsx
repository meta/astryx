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
import {useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
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
  // On a phone, fully on screen, it leaves too little room above or below
  // for its whole menu, but room for part of it. `svh` is the visible
  // screen, which `vh` is not where a browser's bars hide.
  tallCard: {minHeight: '60svh'},
  // The trigger fills its table cell.
  cellTrigger: {display: 'block'},
  iconRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  outlined: {
    padding: 12,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'currentColor',
    borderRadius: 12,
  },
  translucent: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(59, 130, 246, 0.3)',
  },
  pseudoFill: {
    position: 'relative',
    isolation: 'isolate',
    padding: 12,
    '::before': {
      content: '""',
      position: 'absolute',
      inset: 0,
      zIndex: -1,
      borderRadius: 12,
      backgroundColor: 'rgba(16, 185, 129, 1)',
    },
  },
});

// The position-try probe: one box at a time against a tall anchor that
// leaves 90 px above and below, as the tall card does. Each box needs one
// `@position-try` fallback to fit, except the control's. The rules copy the
// layer runtime's fit construct, step by step, with plain 16 px gutters.
// P5 is the runtime's own fit rule, as the page receives it. P6 and P7 keep
// the declarations a browser keeps from P5: P6 with values for its
// variables, P7 without `env()`.
const PROBE_CSS = `
.pt-overlay{position:fixed;inset:0;z-index:2147483000;pointer-events:none}
.pt-anchor{position:absolute;inset-inline:16px;top:90px;bottom:90px;anchor-name:--pt-anchor;background:rgba(59,130,246,.25)}
.pt-box{position:absolute;position-anchor:--pt-anchor;position-area:block-end;inline-size:160px;margin-block-start:16px;overflow:auto;background:rgba(16,185,129,.6)}
.pt-content{block-size:160px}
.pt-c0 .pt-content{block-size:40px}
.pt-p1{position-try-fallbacks:--pt-p1}
.pt-p2{position-try-fallbacks:--pt-p2}
.pt-p3{position-try-fallbacks:--pt-p3}
.pt-p4{position-try-fallbacks:--pt-p4}
.pt-p5{position-try-fallbacks:--pt-p5}
.pt-p6{position-try-fallbacks:--pt-p6}
.pt-p7{position-try-fallbacks:--pt-p7}
@position-try --pt-p1{position-area:block-end;margin-block-start:16px;block-size:40px}
@position-try --pt-p2{position-area:self-block-end span-all;margin-block-start:16px;margin-block-end:16px;block-size:calc(100% - 32px)}
@position-try --pt-p3{position-area:self-block-end span-all;margin-block-start:16px;margin-block-end:16px;block-size:max(calc(100% - 32px),calc((100dvb - anchor-size(block)) / 2 - 33px))}
@position-try --pt-p4{position-area:self-block-end span-all;margin-block-start:16px;margin-block-end:16px;block-size:max(calc(100% - 32px),calc((100vh - anchor-size(block)) / 2 - 33px))}
@position-try --pt-p5{position-area:self-block-end span-all;margin-block-start:var(--_astryx-layer-clearance, 0px);margin-block-end:calc(var(--spacing-4) + max(var(--astryx-layer-inset-block-start, 0px), var(--astryx-layer-inset-block-end, 0px)));margin-block-end:calc(max(var(--spacing-4), env(safe-area-inset-top, 0px), env(safe-area-inset-bottom, 0px)) + max(var(--astryx-layer-inset-block-start, 0px), var(--astryx-layer-inset-block-end, 0px)));margin-inline-start:calc(var(--spacing-4) + max(var(--astryx-layer-inset-inline-start, 0px), var(--astryx-layer-inset-inline-end, 0px)));margin-inline-start:calc(max(var(--spacing-4), env(safe-area-inset-left, 0px), env(safe-area-inset-right, 0px)) + max(var(--astryx-layer-inset-inline-start, 0px), var(--astryx-layer-inset-inline-end, 0px)));margin-inline-end:calc(var(--spacing-4) + max(var(--astryx-layer-inset-inline-start, 0px), var(--astryx-layer-inset-inline-end, 0px)));margin-inline-end:calc(max(var(--spacing-4), env(safe-area-inset-left, 0px), env(safe-area-inset-right, 0px)) + max(var(--astryx-layer-inset-inline-start, 0px), var(--astryx-layer-inset-inline-end, 0px)));inset-inline-start:0;inset-inline-end:0;block-size:max(calc(100% - var(--_astryx-layer-clearance, 0px) - calc(var(--spacing-4) + max(var(--astryx-layer-inset-block-start, 0px), var(--astryx-layer-inset-block-end, 0px)))), calc((100vh - anchor-size(block)) / 2 - var(--_astryx-layer-clearance, 0px) - calc(var(--spacing-4) + max(var(--astryx-layer-inset-block-start, 0px), var(--astryx-layer-inset-block-end, 0px))) - 1px));block-size:max(calc(100% - var(--_astryx-layer-clearance, 0px) - calc(max(var(--spacing-4), env(safe-area-inset-top, 0px), env(safe-area-inset-bottom, 0px)) + max(var(--astryx-layer-inset-block-start, 0px), var(--astryx-layer-inset-block-end, 0px)))), calc((100dvb - anchor-size(block)) / 2 - var(--_astryx-layer-clearance, 0px) - calc(max(var(--spacing-4), env(safe-area-inset-top, 0px), env(safe-area-inset-bottom, 0px)) + max(var(--astryx-layer-inset-block-start, 0px), var(--astryx-layer-inset-block-end, 0px))) - 1px));align-self:unsafe self-start;}
@position-try --pt-p6{position-area:self-block-end span-all;margin-block-start:0px;margin-block-end:calc(max(16px, env(safe-area-inset-top, 0px), env(safe-area-inset-bottom, 0px)) + max(0px, 0px));margin-inline-start:calc(max(16px, env(safe-area-inset-left, 0px), env(safe-area-inset-right, 0px)) + max(0px, 0px));margin-inline-end:calc(max(16px, env(safe-area-inset-left, 0px), env(safe-area-inset-right, 0px)) + max(0px, 0px));inset-inline-start:0;inset-inline-end:0;block-size:max(calc(100% - 0px - calc(max(16px, env(safe-area-inset-top, 0px), env(safe-area-inset-bottom, 0px)) + max(0px, 0px))), calc((100dvb - anchor-size(block)) / 2 - 0px - calc(max(16px, env(safe-area-inset-top, 0px), env(safe-area-inset-bottom, 0px)) + max(0px, 0px)) - 1px));align-self:unsafe self-start}
@position-try --pt-p7{position-area:self-block-end span-all;margin-block-start:var(--_astryx-layer-clearance, 0px);margin-block-end:calc(max(var(--spacing-4), 0px, 0px) + max(var(--astryx-layer-inset-block-start, 0px), var(--astryx-layer-inset-block-end, 0px)));margin-inline-start:calc(max(var(--spacing-4), 0px, 0px) + max(var(--astryx-layer-inset-inline-start, 0px), var(--astryx-layer-inset-inline-end, 0px)));margin-inline-end:calc(max(var(--spacing-4), 0px, 0px) + max(var(--astryx-layer-inset-inline-start, 0px), var(--astryx-layer-inset-inline-end, 0px)));inset-inline-start:0;inset-inline-end:0;block-size:max(calc(100% - var(--_astryx-layer-clearance, 0px) - calc(max(var(--spacing-4), 0px, 0px) + max(var(--astryx-layer-inset-block-start, 0px), var(--astryx-layer-inset-block-end, 0px)))), calc((100dvb - anchor-size(block)) / 2 - var(--_astryx-layer-clearance, 0px) - calc(max(var(--spacing-4), 0px, 0px) + max(var(--astryx-layer-inset-block-start, 0px), var(--astryx-layer-inset-block-end, 0px))) - 1px));align-self:unsafe self-start}
.pt-unit{position:fixed;top:0;left:0;inline-size:1px;visibility:hidden}
.pt-env{position:fixed;top:0;left:0;inline-size:1px;visibility:hidden;padding-top:env(safe-area-inset-top, 0px);padding-bottom:env(safe-area-inset-bottom, 0px)}
`;

const PROBES = [
  {id: 'c0', label: 'Control: fits with no fallback', fits: 'below, 40 px'},
  {id: 'p1', label: 'P1: a fallback with a fixed size', fits: 'below, 40 px'},
  {
    id: 'p2',
    label: 'P2: a fallback sized by a percentage',
    fits: 'below, capped',
  },
  {
    id: 'p3',
    label: 'P3: the layer’s fit rule (100dvb, anchor-size)',
    fits: 'below, capped',
  },
  {id: 'p4', label: 'P4: the same with 100vh', fits: 'below, capped'},
  {
    id: 'p5',
    label: 'P5: the layer’s own fit rule, as it ships',
    fits: 'below, capped',
  },
  {
    id: 'p6',
    label: 'P6: P5 with values for its variables',
    fits: 'below, capped',
  },
  {id: 'p7', label: 'P7: P5 without env()', fits: 'below, capped'},
] as const;

type ProbeResult = {id: string; verdict: string; box: string};

const nextFrame = () =>
  new Promise<void>(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );

function PositionTryProbe() {
  const [current, setCurrent] = useState<string | null>(null);
  const [results, setResults] = useState<ProbeResult[] | null>(null);
  const [units, setUnits] = useState<string>('');
  const run = async () => {
    const out: ProbeResult[] = [];
    for (const probe of PROBES) {
      setCurrent(probe.id);
      await nextFrame();
      const anchor = document.querySelector('.pt-anchor');
      const box = document.querySelector('.pt-box');
      if (anchor == null || box == null) {
        out.push({id: probe.id, verdict: 'not rendered', box: ''});
        continue;
      }
      const a = anchor.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      const inView = b.bottom <= innerHeight + 0.5 && b.top >= -0.5;
      const below = b.top >= a.bottom - 0.5;
      const verdict = !inView
        ? 'off screen: its own place, no fallback applied'
        : !below
          ? 'misplaced'
          : probe.id === 'c0'
            ? 'fits at its own place'
            : b.height < 159.5
              ? 'fallback applied'
              : 'misplaced';
      out.push({
        id: probe.id,
        verdict,
        box: `top ${Math.round(b.top)}, height ${Math.round(b.height)}, bottom ${Math.round(b.bottom)}`,
      });
    }
    setCurrent('units');
    await nextFrame();
    const read = (unit: string) => {
      const el = document.querySelector<HTMLElement>(
        `[data-pt-unit="${unit}"]`,
      );
      return el == null
        ? '?'
        : `${Math.round(el.getBoundingClientRect().height)}`;
    };
    const env = document.querySelector<HTMLElement>('.pt-env');
    const envStyle = env == null ? null : getComputedStyle(env);
    const spacing =
      env == null
        ? ''
        : getComputedStyle(env).getPropertyValue('--spacing-4').trim();
    setUnits(
      `innerHeight ${innerHeight}, visualViewport ${Math.round(window.visualViewport?.height ?? 0)}, ` +
        `safe-area top ${envStyle?.paddingTop ?? '?'}, bottom ${envStyle?.paddingBottom ?? '?'}, --spacing-4 ${spacing === '' ? 'unset' : spacing}; ` +
        `100vh ${read('vh')}, 100svh ${read('svh')}, 100lvh ${read('lvh')}, 100dvh ${read('dvh')}; ` +
        `anchor-size supported: ${CSS.supports('block-size', 'anchor-size(block)')}; ` +
        `${navigator.userAgent}`,
    );
    setCurrent(null);
    setResults(out);
  };
  return (
    <VStack gap={2}>
      <Heading level={2}>Position-try probe</Heading>
      <Text type="supporting">
        Tap Run. Each box in turn is placed against a tall anchor that leaves 90
        px above and below it. The control fits with no fallback. P1 to P7 fit
        only if the browser applies their fallback. P5 is the layer’s own rule.
        Results show below.
      </Text>
      <Button label="Run the position-try probe" onClick={() => void run()} />
      <style>{PROBE_CSS}</style>
      {current != null ? (
        <div className="pt-overlay" aria-hidden>
          {current === 'units' ? (
            <>
              {['vh', 'svh', 'lvh', 'dvh'].map(unit => (
                <div
                  key={unit}
                  className="pt-unit"
                  data-pt-unit={unit}
                  style={{blockSize: `100${unit}`}}
                />
              ))}
              <div className="pt-env" />
            </>
          ) : (
            <>
              <div className="pt-anchor" />
              <div className={`pt-box pt-${current}`}>
                <div className="pt-content" />
              </div>
            </>
          )}
        </div>
      ) : null}
      {results != null ? (
        <VStack gap={1}>
          {results.map(result => {
            const probe = PROBES.find(item => item.id === result.id);
            return (
              <Text key={result.id} type="supporting">
                {`${probe?.label ?? result.id} — expected ${probe?.fits ?? ''}: ${result.verdict} (${result.box})`}
              </Text>
            );
          })}
          <Text type="supporting">{units}</Text>
        </VStack>
      ) : null}
    </VStack>
  );
}

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
          <VStack gap={1}>
            <Text weight="semibold">What to look for</Text>
            <Text type="supporting">
              1. A held finger lifts and zooms the trigger where it is, over a
              tint in the theme’s overlay color, with no blur.
            </Text>
            <Text type="supporting">
              2. The lifted trigger casts no shadow.
            </Text>
            <Text type="supporting">
              3. The menu opens above or below the trigger where it fits, and
              never covers it.
            </Text>
            <Text type="supporting">4. A tap on the tint closes the menu.</Text>
            <Text type="supporting">
              5. The trigger never moves, at the screen’s edges too.
            </Text>
          </VStack>
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
          <Heading level={2}>Other shapes</Heading>
          <Text>
            A trigger with no surface of its own lifts on a plate. One with a
            fill of its own lifts as it is.
          </Text>
          <Grid columns={2} gap={3}>
            <ContextMenu items={MENU} label="Row with an icon">
              <div {...stylex.props(styles.iconRow)}>
                <svg width={20} height={20} viewBox="0 0 20 20" aria-hidden>
                  <circle cx={10} cy={10} r={8} fill="currentColor" />
                </svg>
                <Text>A row with an icon</Text>
              </div>
            </ContextMenu>
            <ContextMenu items={MENU} label="Outlined box">
              <div {...stylex.props(styles.outlined)}>
                <Text>An outlined box</Text>
              </div>
            </ContextMenu>
            <ContextMenu items={MENU} label="Translucent box">
              <div {...stylex.props(styles.translucent)}>
                <Text>A translucent fill</Text>
              </div>
            </ContextMenu>
            <ContextMenu items={MENU} label="Filled box">
              <div {...stylex.props(styles.pseudoFill)}>
                <Text>A fill from a pseudo-element</Text>
              </div>
            </ContextMenu>
            <ContextMenu items={MENU} label="Inline image">
              <img
                src={swatch(HUES[3])}
                alt="Purple swatch"
                width={64}
                height={64}
              />
            </ContextMenu>
          </Grid>
        </VStack>

        <VStack gap={2}>
          <Heading level={2}>Taller than the room for its menu</Heading>
          <Text type="supporting">
            On a phone, with the card fully on screen, its menu fits neither
            above nor below it. The menu opens on the roomier side, capped to
            fit, and scrolls. It never covers the card.
          </Text>
          <ContextMenu items={MENU} label="Tall card">
            <Card xstyle={styles.tallCard}>
              <Text>A card taller than the room for its menu</Text>
            </Card>
          </ContextMenu>
        </VStack>

        <VStack gap={2}>
          <Heading level={2}>The side edges</Heading>
          <Text type="supporting">
            At an edge the card lifts where it is and grows past the page’s
            margin. Its menu keeps the margin.
          </Text>
          <HStack gap={2} justify="between">
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
      <VStack gap={2} padding={4}>
        <PositionTryProbe />
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
