// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file prototypes.tsx
 * @position Registry + demo components for every component in the mobile
 *   migration table. Each entry documents the *change* (what the component
 *   should become on mobile) and the *interaction* (what eng should build),
 *   and renders an interactive prototype inside a PhoneFrame screen.
 * @input none (self-contained demos)
 * @output Prototype[] consumed by page.tsx
 */

'use client';

import {useRef, useState, useEffect, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Text, Heading} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {IconButton} from '@astryxdesign/core/IconButton';
import {Badge} from '@astryxdesign/core/Badge';
import {Token} from '@astryxdesign/core/Token';
import {Avatar} from '@astryxdesign/core/Avatar';
import {Item} from '@astryxdesign/core/Item';
import {ToggleButton} from '@astryxdesign/core/ToggleButton';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {Switch} from '@astryxdesign/core/Switch';
import {RadioList, RadioListItem} from '@astryxdesign/core/RadioList';
import {TextInput} from '@astryxdesign/core/TextInput';
import type {ISODateString, DateRange} from '@astryxdesign/core/Calendar';
import {Pagination} from '@astryxdesign/core/Pagination';
import {Card} from '@astryxdesign/core/Card';
import {Field, inputWrapperStyles} from '@astryxdesign/core/Field';
import {CheckboxList, CheckboxListItem} from '@astryxdesign/core/CheckboxList';
import {List, ListItem} from '@astryxdesign/core/List';
import {MetadataList, MetadataListItem} from '@astryxdesign/core/MetadataList';
import {Skeleton} from '@astryxdesign/core/Skeleton';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Table, pixel} from '@astryxdesign/core/Table';
import type {TableColumn} from '@astryxdesign/core/Table';
import {
  SideNav,
  SideNavItem,
  SideNavHeading,
  SideNavSection,
} from '@astryxdesign/core/SideNav';
import {VStack} from '@astryxdesign/core/Stack';
import {Grid} from '@astryxdesign/core/Grid';

import {
  AppScreen,
  BottomSheet,
  BottomSheetMenu,
  SideDrawer,
  DrawerEdgeGrip,
  TapField,
  AnchoredPopover,
  CheckIcon,
  ChevronDown,
  ChevronRight,
  SearchIcon,
  CalendarIcon,
  DotsIcon,
  FilterIcon,
  PlusIcon,
  MenuIcon,
  InfoIcon,
  BackIcon,
  TrashIcon,
  type SheetHeight,
} from './primitives';

const s = stylex.create({
  fullBtn: {width: '100%'},
  // Selector sheet: spacious ListItems inset their label 12px from the row, so
  // it sits 12px right of the sheet title. Pull the list out 12px (plus the 4px
  // hover inset below) so labels line up with the title...
  flushSheetList: {marginInline: 'calc(-1 * var(--spacing-3) - 4px)'},
  // ...and because a divider list draws its hover/selected fill full-bleed with
  // square corners, round it and keep it off the sheet wall so the highlight
  // doesn't read as clipped once the list is pulled out.
  flushSheetItem: {
    borderRadius: 'var(--radius-element)',
    marginInline: 4,
  },
  // MultiSelector: the checkbox (start content) inset is 8px, so it needs a
  // slightly smaller pull-out to line the checkbox up with the sheet title.
  flushSheetCheckList: {marginInline: 'calc(-1 * var(--spacing-3))'},
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
  },
  // Layout layered over the real XDS input wrapper chrome for the token fields.
  psBox: {flexWrap: 'wrap', minHeight: 44, gap: 6, cursor: 'pointer'},
  tokRow: {gap: 8, overflowX: 'auto'},
  // Token base has overflow:hidden (flex min-width → 0), so without this the
  // tokens shrink and ellipsis-truncate their labels instead of keeping their
  // natural width and letting the row scroll / wrap.
  noShrink: {flexShrink: 0},
  tabletNav: {flexShrink: 0, height: '100%'},
  // Bleed the menu rows toward the popover edges while keeping their labels
  // aligned with the section header: the popover pads 12px and Item pads 8px,
  // so a -8 inline pull lands the labels back at the header's 12px inset.
  popoverMenu: {marginTop: 4, marginInline: -8},
  // Pull each filter row out by the ListItem's 8px inline padding so the
  // checkbox optically lines up with the "Status" field label above it.
  filterItem: {marginInline: 'calc(-1 * var(--spacing-2))'},
  // Time options render as full-cell filled chips so the grid visibly fills the
  // sheet width. Ghost ToggleButtons are otherwise transparent, leaving the row
  // looking like sparse text floating in empty space on either side.
  timeChip: {
    width: '100%',
    minHeight: 40,
    backgroundColor: 'var(--color-background-muted)',
    borderRadius: 'var(--radius-element)',
  },
  timeChipSelected: {
    backgroundColor: 'var(--color-accent-muted)',
    boxShadow: 'var(--shadow-inset-selected)',
  },
});

const TABLET_NAV = ['Home', 'Projects', 'Activity', 'Members', 'Settings'];

const iso = (v: string) => v as ISODateString;

// -----------------------------------------------------------------------------
// Small shared helpers
// -----------------------------------------------------------------------------

function Note({children}: {children: ReactNode}) {
  return (
    <div
      style={{
        background: 'var(--color-background-muted)',
        borderRadius: 'var(--radius-element)',
        padding: '10px 12px',
      }}>
      <Text type="supporting">{children}</Text>
    </div>
  );
}

// A centered modal (used to contrast Dialog-as-sheet with Alert-as-dialog).
function CenterDialog({
  open,
  onClose,
  title,
  children,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  actions: ReactNode;
}) {
  if (!open) {
    return null;
  }
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'var(--color-overlay)',
          zIndex: 10,
        }}
      />
      <div
        style={{
          position: 'absolute',
          zIndex: 11,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          // Fixed comfortable width — an alert dialog shouldn't stretch with the
          // viewport; cap it and only shrink on very narrow phones.
          width: 'min(90%, 320px)',
          background: 'var(--color-background-surface)',
          borderRadius: 'var(--radius-container)',
          boxShadow: 'var(--shadow-high)',
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}>
        <Heading level={3}>{title}</Heading>
        <Text type="body" color="secondary">
          {children}
        </Text>
        <div
          style={{
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end',
            marginTop: 4,
          }}>
          {actions}
        </div>
      </div>
    </>
  );
}

// =============================================================================
// BLOCKS MIGRATION
// =============================================================================

// 1. Bottom Sheet — the primitive itself -------------------------------------
type SheetKind = SheetHeight | 'detents' | 'peek';

function BottomSheetDemo() {
  // A single active sheet — opening one closes any other, so we never stack a
  // sheet on top of a sheet (which is possible once the peek is non-modal).
  const [active, setActive] = useState<SheetKind | null>(null);
  const close = () => setActive(null);
  return (
    <>
      <AppScreen title="Bottom Sheet">
        <Note>
          The base surface for most mobile overlays. Slides up from the bottom
          edge and dismisses by dragging the grabber down. Sheets are modal by
          default (a scrim dims and blocks the page). Non-modal is scenario-
          specific — see the peek below.
        </Note>
        <VStack gap={2}>
          <Text type="body" color="secondary">
            Three fixed height behaviors — the developer picks one per use case:
          </Text>
          <Button
            label="Hug content"
            variant="secondary"
            xstyle={s.fullBtn}
            onClick={() => setActive('hug')}
          />
          <Button
            label="Capped (scrolls)"
            variant="secondary"
            xstyle={s.fullBtn}
            onClick={() => setActive('capped')}
          />
          <Button
            label="Pinned tall"
            variant="secondary"
            xstyle={s.fullBtn}
            onClick={() => setActive('tall')}
          />
        </VStack>
        <VStack gap={2}>
          <Text type="body" color="secondary">
            Opt-in draggable detents — for browse-style content only:
          </Text>
          <Button
            label="Detents (medium ↔ full)"
            variant="secondary"
            xstyle={s.fullBtn}
            onClick={() => setActive('detents')}
          />
        </VStack>
        <VStack gap={2}>
          <Text type="body" color="secondary">
            Min-height peek — the Apple Maps / Music sheet (non-modal):
          </Text>
          <Button
            label="Peek (min-height, non-modal)"
            variant="secondary"
            xstyle={s.fullBtn}
            onClick={() => setActive('peek')}
          />
        </VStack>
      </AppScreen>

      <BottomSheet
        open={active === 'hug'}
        onClose={close}
        height="hug"
        title="Hug content">
        <Text type="body" color="secondary">
          Height fits the content exactly. Use for short, bounded content like a
          confirmation or a handful of options.
        </Text>
      </BottomSheet>

      <BottomSheet
        open={active === 'capped'}
        onClose={close}
        height="capped"
        title="Capped (scrolls)">
        <List hasDividers density="spacious">
          {Array.from({length: 20}).map((_, i) => (
            <ListItem key={i} label={`List row ${i + 1}`} />
          ))}
        </List>
      </BottomSheet>

      <BottomSheet
        open={active === 'tall'}
        onClose={close}
        height="tall"
        title="Pinned tall">
        <Text type="body" color="secondary">
          Fixed tall height (~92%). Use when content streams in or resizes so
          the sheet doesn&apos;t jump — search, typeahead, filter builders.
        </Text>
      </BottomSheet>

      <BottomSheet
        open={active === 'detents'}
        onClose={close}
        snapPoints={[0.5, 0.92]}
        defaultSnap={0}
        title="Detents">
        <VStack gap={2}>
          <Text type="body" color="secondary">
            Opens at the <strong>medium</strong> detent (the default). Drag the
            grabber up to expand to full, drag it down (or flick) to collapse
            and dismiss. Content scrolls once you&apos;re expanded and the
            finger is inside the list.
          </Text>
          <List hasDividers density="spacious">
            {Array.from({length: 18}).map((_, i) => (
              <ListItem key={i} label={`Result ${i + 1}`} />
            ))}
          </List>
        </VStack>
      </BottomSheet>

      <BottomSheet
        open={active === 'peek'}
        onClose={close}
        snapPoints={[0.14, 0.5, 0.92]}
        defaultSnap={1}
        scrim={false}
        title="Nearby">
        <VStack gap={2}>
          <Text type="body" color="secondary">
            Three detents: <strong>peek → medium → full</strong>, like the Maps
            / Music sheet. The peek is the lowest resting height — drag the
            handle down and a casual drag parks there. Keep dragging (or flick)
            past the peek and the handle closes it — no separate close button
            needed. It&apos;s non-modal, so the screen behind stays live.
          </Text>
          <List hasDividers density="spacious">
            {Array.from({length: 16}).map((_, i) => (
              <ListItem key={i} label={`Place ${i + 1}`} />
            ))}
          </List>
        </VStack>
      </BottomSheet>
    </>
  );
}

// 2. Drawer — edge panel ------------------------------------------------------
function DrawerDemo() {
  // Single active drawer — opening one closes the other (never stack).
  const [active, setActive] = useState<'start' | 'end' | null>(null);
  const close = () => setActive(null);
  return (
    <>
      <AppScreen title="Drawer">
        <Note>
          A full-height edge panel over a scrim (it doesn&apos;t push page
          content on mobile). Start-side for navigation, end-side for contextual
          panels like filters. Swipe the panel toward its edge to dismiss.
        </Note>
        <Text type="body" color="secondary">
          Navigation lives on the start edge:
        </Text>
        <Button
          label="Open navigation (start)"
          variant="secondary"
          xstyle={s.fullBtn}
          onClick={() => setActive('start')}
        />
        <Text type="supporting" color="secondary">
          …or swipe in from the left edge (the grip). A navigation drawer has
          <b> no close (×)</b> — it&apos;s paired with the menu button and
          dismissed by swiping the panel, tapping the scrim, or pressing Back.
        </Text>
        <div style={{height: 8}} />
        <Text type="body" color="secondary">
          Contextual panels open from the end edge:
        </Text>
        <Button
          label="Open filters (end)"
          variant="secondary"
          xstyle={s.fullBtn}
          onClick={() => setActive('end')}
        />
        <Text type="supporting" color="secondary">
          A contextual side sheet <b>does</b> get a header close (×) — it
          isn&apos;t tied to one launcher — alongside swipe, scrim-tap, and
          Back.
        </Text>
      </AppScreen>

      <DrawerEdgeGrip side="start" onOpen={() => setActive('start')} />

      <SideDrawer
        open={active === 'start'}
        onClose={close}
        side="start"
        title="Menu">
        <SideNavSection title="Navigation" isHeaderHidden>
          {TABLET_NAV.map((l, i) => (
            <SideNavItem
              key={l}
              label={l}
              isSelected={i === 0}
              onClick={close}
            />
          ))}
        </SideNavSection>
      </SideDrawer>

      <SideDrawer
        open={active === 'end'}
        onClose={close}
        side="end"
        title="Filters">
        <VStack gap={3} height="100%" justify="between">
          <VStack gap={3}>
            {[
              'Open issues',
              'Assigned to me',
              'Recently updated',
              'Has attachments',
            ].map(l => (
              <Switch
                key={l}
                label={l}
                value={false}
                onChange={() => {}}
                labelPosition="start"
                labelSpacing="spread"
              />
            ))}
          </VStack>
          <Button
            label="Apply filters"
            variant="primary"
            xstyle={s.fullBtn}
            onClick={close}
          />
        </VStack>
      </SideDrawer>
    </>
  );
}

// Tablet: the same drawer stops being a modal overlay and becomes a standard /
// permanent panel — always visible, no scrim, with content reflowed beside it.
function DrawerTabletDemo() {
  const [nav, setNav] = useState(true);
  const [filters, setFilters] = useState(false);
  return (
    <div style={{flex: 1, minHeight: 0, display: 'flex'}}>
      {/* Standard (permanent) start drawer — always visible, no scrim. On a
          wide screen the navigation drawer IS a SideNav; the menu toggle
          collapses it (reflowing content) rather than dismissing a modal. */}
      {nav && (
        <SideNav
          xstyle={s.tabletNav}
          header={<SideNavHeading heading="Menu" />}>
          <SideNavSection title="Navigation" isHeaderHidden>
            {TABLET_NAV.map((l, i) => (
              <SideNavItem key={l} label={l} isSelected={i === 1} />
            ))}
          </SideNavSection>
        </SideNav>
      )}

      {/* Main content reflows to sit beside the docked drawer(s) */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            padding: '10px 16px',
            borderBottom: '1px solid var(--color-border)',
          }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              minWidth: 0,
            }}>
            <IconButton
              label={nav ? 'Collapse navigation' : 'Expand navigation'}
              variant="ghost"
              size="sm"
              icon={<MenuIcon />}
              onClick={() => setNav(n => !n)}
            />
            <Text type="large" weight="semibold">
              Projects
            </Text>
          </div>
          <Button
            label={filters ? 'Hide filters' : 'Show filters'}
            variant="secondary"
            size="sm"
            icon={<FilterIcon width={16} height={16} />}
            onClick={() => setFilters(f => !f)}
          />
        </div>
        <div
          style={{
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}>
          <Note>
            On a wide screen the drawer stops being a modal overlay. The
            start-side navigation is <b>standard / permanent</b> — always
            visible, no scrim — and the main content reflows to sit beside it.
            There&apos;s no modal close (×): instead the menu toggle{' '}
            <b>collapses</b> the panel (and the end-side panel docks the same
            way), reclaiming space rather than dismissing.
          </Note>
          {['API Gateway', 'Auth Service', 'Billing', 'Search'].map(n => (
            <Card key={n}>
              <Text type="body" weight="semibold">
                {n}
              </Text>
              <div>
                <Text type="supporting">Service · healthy</Text>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Standard (permanent) end drawer — docks and reflows, doesn't overlay */}
      {filters && (
        <div
          style={{
            width: 240,
            flexShrink: 0,
            borderLeft: '1px solid var(--color-border)',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--color-background-surface)',
          }}>
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--color-border)',
            }}>
            <Text type="large" weight="semibold">
              Filters
            </Text>
          </div>
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}>
            {[
              'Open issues',
              'Assigned to me',
              'Recently updated',
              'Has attachments',
            ].map(l => (
              <Switch
                key={l}
                label={l}
                value={false}
                onChange={() => {}}
                labelPosition="start"
                labelSpacing="spread"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// 3. Dialog — bottom sheet; Alert stays a dialog ------------------------------
function DialogDemo() {
  const [sheet, setSheet] = useState(false);
  const [alert, setAlert] = useState(false);
  const [name, setName] = useState('Ada Lovelace');
  return (
    <>
      <AppScreen title="Dialog">
        <Note>
          Standard dialogs become bottom sheets on mobile. Alert dialogs stay
          centered modals — they demand a decision and shouldn&apos;t be
          swipe-dismissible.
        </Note>
        <Button
          label="Edit profile (dialog → sheet)"
          variant="secondary"
          xstyle={s.fullBtn}
          onClick={() => setSheet(true)}
        />
        <Button
          label="Delete account (alert dialog)"
          variant="destructive"
          xstyle={s.fullBtn}
          onClick={() => setAlert(true)}
        />
      </AppScreen>

      <BottomSheet
        open={sheet}
        onClose={() => setSheet(false)}
        height="hug"
        title="Edit profile"
        footer={
          <Button
            label="Save changes"
            variant="primary"
            xstyle={s.fullBtn}
            onClick={() => setSheet(false)}
          />
        }>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            paddingTop: 4,
          }}>
          <TextInput
            label="Display name"
            value={name}
            onChange={v => setName(v)}
          />
          <TextInput
            label="Email"
            type="email"
            value="ada@analytical.co"
            onChange={() => {}}
          />
        </div>
      </BottomSheet>

      <CenterDialog
        open={alert}
        onClose={() => setAlert(false)}
        title="Delete account?"
        actions={
          <>
            <Button
              label="Cancel"
              variant="ghost"
              onClick={() => setAlert(false)}
            />
            <Button
              label="Delete"
              variant="destructive"
              onClick={() => setAlert(false)}
            />
          </>
        }>
        This permanently removes your account and all data. This can&apos;t be
        undone.
      </CenterDialog>
    </>
  );
}

// 4. Layout / LayoutPanel — hideBelow/showBelow -------------------------------
const LAYOUT_ITEMS = [
  {id: '1', name: 'Q3 Launch Plan', meta: 'Updated 2h ago'},
  {id: '2', name: 'Design Review Notes', meta: 'Updated yesterday'},
  {id: '3', name: 'Budget Forecast', meta: 'Updated 3d ago'},
];
function LayoutPanelDemo() {
  const [selected, setSelected] = useState<string | null>(null);
  const item = LAYOUT_ITEMS.find(i => i.id === selected);
  return (
    <>
      <AppScreen title="Layout / Panel">
        <Note>
          A side-by-side list + detail panel can&apos;t fit below the
          breakpoint. The panel is hidden (server-safe <code>hideBelow</code>)
          and detail becomes a pushed full-screen view.
        </Note>
        <div style={{display: 'flex', flexDirection: 'column'}}>
          {LAYOUT_ITEMS.map(i => (
            <Item
              key={i.id}
              label={i.name}
              description={i.meta}
              density="spacious"
              onClick={() => setSelected(i.id)}
              endContent={
                <ChevronRight
                  width={18}
                  height={18}
                  style={{color: 'var(--color-icon-secondary)'}}
                />
              }
              xstyle={s.rowBorder}
            />
          ))}
        </div>
      </AppScreen>

      {/* Pushed detail panel — full-height so it fills edge-to-edge under the
          status bar / home indicator (which float on top), with safe-area
          padding so its header and content clear them. Matches the drawer. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 11,
          background: 'var(--color-background-body)',
          display: 'flex',
          flexDirection: 'column',
          paddingTop: 44,
          paddingBottom: 22,
          transform: item ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
          boxShadow: item ? 'var(--shadow-high)' : 'none',
        }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 16px',
            borderBottom: '1px solid var(--color-border)',
          }}>
          <IconButton
            label="Back"
            variant="ghost"
            size="sm"
            icon={<BackIcon />}
            onClick={() => setSelected(null)}
          />
          <Text type="large" weight="semibold">
            {item?.name ?? ''}
          </Text>
        </div>
        <div
          style={{
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}>
          <Text type="body" color="secondary">
            {item?.meta}
          </Text>
          <Text type="body" color="secondary">
            Detail content lives here. On desktop this renders in a right-hand
            LayoutPanel; below the breakpoint it&apos;s a pushed view with a
            back affordance.
          </Text>
        </div>
      </div>
    </>
  );
}

// Tablet: the panel fits, so list + detail sit side by side (no pushed view).
function LayoutPanelTabletDemo() {
  const [selected, setSelected] = useState('1');
  const item = LAYOUT_ITEMS.find(i => i.id === selected);
  return (
    <div style={{flex: 1, minHeight: 0, display: 'flex'}}>
      <div
        style={{
          width: 300,
          flexShrink: 0,
          borderRight: '1px solid var(--color-border)',
          display: 'flex',
          flexDirection: 'column',
        }}>
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--color-border)',
          }}>
          <Text type="large" weight="semibold">
            Documents
          </Text>
        </div>
        <div style={{flex: 1, overflowY: 'auto'}}>
          {LAYOUT_ITEMS.map(i => (
            <Item
              key={i.id}
              label={i.name}
              description={i.meta}
              density="spacious"
              isSelected={i.id === selected}
              onClick={() => setSelected(i.id)}
              xstyle={s.rowBorder}
            />
          ))}
        </div>
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}>
        <div
          style={{
            padding: '12px 20px',
            borderBottom: '1px solid var(--color-border)',
          }}>
          <Text type="large" weight="semibold">
            {item?.name ?? ''}
          </Text>
        </div>
        <div
          style={{
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}>
          <Note>
            Above the breakpoint the list and detail sit <b>side by side</b> in
            a LayoutPanel — selecting a row updates the right pane in place
            instead of pushing a full-screen view.
          </Note>
          <Text type="body" color="secondary">
            {item?.meta}
          </Text>
          <Text type="body" color="secondary">
            Detail content for {item?.name} renders in the right-hand panel.
          </Text>
        </div>
      </div>
    </div>
  );
}

// 5. Selector — bottom sheet, hug (capped for long lists) ---------------------
const COUNTRIES = [
  'United States',
  'Canada',
  'United Kingdom',
  'Germany',
  'Japan',
  'Australia',
];
const TIMEZONES = Array.from(
  {length: 28},
  (_, i) => `UTC${i - 12 >= 0 ? '+' : ''}${i - 12}:00`,
);
function SelectorDemo() {
  const [openCountry, setOpenCountry] = useState(false);
  const [openTz, setOpenTz] = useState(false);
  const [country, setCountry] = useState<string>();
  const [tz, setTz] = useState<string>();
  return (
    <>
      <AppScreen title="Selector">
        <Note>
          Tapping the field opens a bottom sheet whose height{' '}
          <b>hugs the option list</b>. A <b>long</b> list instead opens at a
          medium detent and can be
          <b> dragged up to full height</b> for easier browsing.
        </Note>
        <TapField
          label="Country"
          placeholder="Select a country"
          value={country}
          onClick={() => setOpenCountry(true)}
        />
        <TapField
          label="Timezone (long list)"
          placeholder="Select a timezone"
          value={tz}
          onClick={() => setOpenTz(true)}
        />
      </AppScreen>

      <BottomSheet
        open={openCountry}
        onClose={() => setOpenCountry(false)}
        height="hug"
        title="Country">
        <List hasDividers density="spacious" xstyle={s.flushSheetList}>
          {COUNTRIES.map(c => (
            <ListItem
              key={c}
              label={c}
              isSelected={c === country}
              xstyle={s.flushSheetItem}
              endContent={
                c === country ? (
                  <CheckIcon
                    width={20}
                    height={20}
                    style={{color: 'var(--color-icon-accent)'}}
                  />
                ) : undefined
              }
              onClick={() => {
                setCountry(c);
                setOpenCountry(false);
              }}
            />
          ))}
        </List>
      </BottomSheet>

      <BottomSheet
        open={openTz}
        onClose={() => setOpenTz(false)}
        snapPoints={[0.5, 0.92]}
        defaultSnap={0}
        title="Timezone">
        <List hasDividers density="spacious" xstyle={s.flushSheetList}>
          {TIMEZONES.map(t => (
            <ListItem
              key={t}
              label={t}
              isSelected={t === tz}
              xstyle={s.flushSheetItem}
              endContent={
                t === tz ? (
                  <CheckIcon
                    width={20}
                    height={20}
                    style={{color: 'var(--color-icon-accent)'}}
                  />
                ) : undefined
              }
              onClick={() => {
                setTz(t);
                setOpenTz(false);
              }}
            />
          ))}
        </List>
      </BottomSheet>
    </>
  );
}

// 6. MultiSelector — bottom sheet, detents (medium ↔ full), checkboxes --------
const LABELS = [
  'Bug',
  'Feature',
  'Documentation',
  'Design',
  'Backend',
  'Frontend',
  'Urgent',
  'Blocked',
  'Good first issue',
  'Help wanted',
  'Duplicate',
  'Wontfix',
  'Question',
  'Enhancement',
  'Performance',
  'Security',
];
function MultiSelectorDemo() {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string[]>(['Bug', 'Urgent']);
  const [draft, setDraft] = useState<string[]>(sel);
  return (
    <>
      <AppScreen title="MultiSelector">
        <Note>
          Checkboxes for multi-select, applied on confirm. Because the option
          list is long and browse-style, it&apos;s an <b>opt-in detent</b>{' '}
          sheet: it opens at a medium height and you can{' '}
          <b>drag the grabber up to go full</b>. Apply stays pinned. (Short
          multi-selects stay hug/capped.)
        </Note>
        <TapField
          label="Labels"
          placeholder="Select labels"
          value={sel.length ? sel.join(', ') : undefined}
          onClick={() => {
            setDraft(sel);
            setOpen(true);
          }}
        />
      </AppScreen>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        snapPoints={[0.5, 0.92]}
        defaultSnap={0}
        title="Labels"
        footer={
          <Button
            label={`Apply${draft.length ? ` (${draft.length})` : ''}`}
            variant="primary"
            xstyle={s.fullBtn}
            onClick={() => {
              setSel(draft);
              setOpen(false);
            }}
          />
        }>
        <CheckboxList
          label="Labels"
          isLabelHidden
          value={draft}
          onChange={setDraft}
          containerXstyle={s.flushSheetCheckList}
          hasDividers>
          {LABELS.map(l => (
            <CheckboxListItem
              key={l}
              label={l}
              value={l}
              xstyle={s.flushSheetItem}
            />
          ))}
        </CheckboxList>
      </BottomSheet>
    </>
  );
}

// 7. Typeahead — pinned tall, results stream in, stable height ----------------
const PEOPLE = [
  'Ada Lovelace',
  'Alan Turing',
  'Grace Hopper',
  'Katherine Johnson',
  'Margaret Hamilton',
  'Barbara Liskov',
  'Radia Perlman',
  'Hedy Lamarr',
  'Annie Easley',
  'Dorothy Vaughan',
];
function TypeaheadDemo() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<string[]>([]);
  const [picked, setPicked] = useState<string>();
  const searchRef = useRef<HTMLInputElement>(null);

  // Focus the search field ourselves with preventScroll instead of native
  // autoFocus — native autofocus scrolls the input into view and jumps the page.
  useEffect(() => {
    if (!open) {
      return;
    }
    const id = window.setTimeout(
      () => searchRef.current?.focus({preventScroll: true}),
      60,
    );
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setLoading(true);
    const id = setTimeout(() => {
      const list = q
        ? PEOPLE.filter(p => p.toLowerCase().includes(q.toLowerCase()))
        : PEOPLE;
      setResults(list);
      setLoading(false);
    }, 320);
    return () => clearTimeout(id);
  }, [q, open]);

  return (
    <>
      <AppScreen title="Typeahead">
        <Note>
          Opens a <b>pinned-tall</b> sheet. Results stream in async; the fixed
          height means the sheet doesn&apos;t resize on every keystroke.
        </Note>
        <TapField
          label="Assignee"
          placeholder="Search people"
          icon={<SearchIcon width={16} height={16} />}
          value={picked}
          chevron={false}
          onClick={() => setOpen(true)}
        />
      </AppScreen>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        height="tall"
        title="Assign to">
        <div
          style={{
            position: 'sticky',
            top: 0,
            background: 'var(--color-background-surface)',
            paddingTop: 4,
            paddingBottom: 8,
            zIndex: 1,
          }}>
          <TextInput
            ref={searchRef}
            label="Search"
            isLabelHidden
            placeholder="Search people"
            startIcon="search"
            value={q}
            onChange={v => setQ(v)}
          />
        </div>
        {loading ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              paddingTop: 8,
            }}>
            {Array.from({length: 6}).map((_, i) => (
              <Skeleton
                key={i}
                index={i}
                height={16}
                width={`${80 - i * 6}%`}
              />
            ))}
          </div>
        ) : results.length ? (
          <List hasDividers density="spacious">
            {results.map(p => (
              <ListItem
                key={p}
                label={p}
                isSelected={p === picked}
                endContent={
                  p === picked ? (
                    <CheckIcon
                      width={20}
                      height={20}
                      style={{color: 'var(--color-icon-accent)'}}
                    />
                  ) : undefined
                }
                onClick={() => {
                  setPicked(p);
                  setOpen(false);
                }}
              />
            ))}
          </List>
        ) : (
          <EmptyState
            icon={<SearchIcon width={24} height={24} />}
            title="No matches"
            description={`No people match “${q}”.`}
            isCompact
          />
        )}
      </BottomSheet>
    </>
  );
}

// 8. PowerSearch — pinned tall, token builder ---------------------------------
const PS_FIELDS = [
  {field: 'status', values: ['Open', 'Closed', 'In review']},
  {field: 'author', values: ['ada', 'grace', 'alan']},
  {field: 'label', values: ['bug', 'feature', 'urgent']},
];
function PowerSearchDemo() {
  const [open, setOpen] = useState(false);
  const [tokens, setTokens] = useState<string[]>(['status:Open']);
  const [active, setActive] = useState<string | null>(null);
  return (
    <>
      <AppScreen title="PowerSearch">
        <Note>
          Structured filter builder opens a <b>pinned-tall</b> sheet — results
          are unstable while composing tokens, so the height stays fixed.
        </Note>
        <Field label="Filters" isLabelHidden inputID="ps-field" width="100%">
          <div
            id="ps-field"
            onClick={() => setOpen(true)}
            {...stylex.props(inputWrapperStyles.base, s.psBox)}>
            <SearchIcon
              width={16}
              height={16}
              style={{color: 'var(--color-icon-secondary)', flexShrink: 0}}
            />
            {tokens.map(t => (
              <Token
                key={t}
                label={t}
                size="sm"
                xstyle={s.noShrink}
                onRemove={() => setTokens(x => x.filter(v => v !== t))}
              />
            ))}
            <span style={{color: 'var(--color-text-secondary)', fontSize: 14}}>
              Add filter…
            </span>
          </div>
        </Field>
      </AppScreen>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        height="tall"
        title="Add filter">
        {active == null ? (
          <List hasDividers density="spacious">
            {PS_FIELDS.map(f => (
              <ListItem
                key={f.field}
                label={f.field}
                description="Choose a value"
                endContent={
                  <ChevronRight
                    width={16}
                    height={16}
                    style={{color: 'var(--color-icon-secondary)'}}
                  />
                }
                onClick={() => setActive(f.field)}
              />
            ))}
          </List>
        ) : (
          <>
            <div style={{alignSelf: 'flex-start', paddingBottom: 4}}>
              <Button
                label={active}
                variant="ghost"
                size="sm"
                icon={<BackIcon width={16} height={16} />}
                onClick={() => setActive(null)}
              />
            </div>
            <List hasDividers density="spacious">
              {PS_FIELDS.find(f => f.field === active)!.values.map(v => (
                <ListItem
                  key={v}
                  label={v}
                  onClick={() => {
                    setTokens(t => [...new Set([...t, `${active}:${v}`])]);
                    setActive(null);
                    setOpen(false);
                  }}
                />
              ))}
            </List>
          </>
        )}
      </BottomSheet>
    </>
  );
}

// 9. DateInput — bottom sheet with a vertical scroll of months ----------------
function DateInputDemo() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<ISODateString>();
  return (
    <>
      <AppScreen title="DateInput">
        <Note>
          Months <b>stack in a vertical scroll</b> under one <b>sticky</b>{' '}
          weekday header — the same mobile pattern as DateRangeInput. It opens
          at a <b>medium detent</b> and can be <b>dragged up to full height</b>{' '}
          to scroll through more months; picking a day commits and closes.
        </Note>
        <TapField
          label="Due date"
          placeholder="Pick a date"
          icon={<CalendarIcon width={16} height={16} />}
          value={value}
          onClick={() => setOpen(true)}
        />
      </AppScreen>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        snapPoints={[392, 0.92]}
        defaultSnap={0}
        title="Due date">
        <ScrollCalendar
          mode="single"
          value={value}
          onChange={(v: ISODateString) => {
            setValue(v);
            setOpen(false);
          }}
          startYear={2026}
          startMonth={6}
          monthCount={4}
        />
      </BottomSheet>
    </>
  );
}

// Tablet: with room to spare, two months sit side by side (desktop date-picker
// pattern) instead of the phone's single vertical scroll.
function DateInputTabletDemo() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<ISODateString>();
  return (
    <>
      <AppScreen title="DateInput">
        <Note>
          With room to spare, two months sit <b>side by side</b> (the desktop
          date-picker pattern) instead of the phone's single vertical scroll.
          Picking a day commits and closes.
        </Note>
        <TapField
          label="Due date"
          placeholder="Pick a date"
          icon={<CalendarIcon width={16} height={16} />}
          value={value}
          onClick={() => setOpen(true)}
        />
      </AppScreen>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        height="hug"
        title="Due date">
        <ScrollCalendar
          mode="single"
          paged
          value={value}
          onChange={(v: ISODateString) => {
            setValue(v);
            setOpen(false);
          }}
          startYear={2026}
          startMonth={6}
          monthCount={6}
        />
      </BottomSheet>
    </>
  );
}

// 10. DateTimeInput — calendar grid + time list -------------------------------
const TIMES = Array.from(
  {length: 24},
  (_, h) => `${String(h).padStart(2, '0')}:00`,
);
function DateTimeInputDemo({beside = false}: {beside?: boolean} = {}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState<ISODateString>();
  const [time, setTime] = useState<string>();
  // Phone: which picker is showing. Like the iOS compact picker, date and time
  // are separate targets and only one is expanded at a time.
  const [segment, setSegment] = useState<'date' | 'time'>('date');

  // Re-open on the Date segment each time the sheet is shown.
  useEffect(() => {
    if (open) {
      setSegment('date');
    }
  }, [open]);

  const timeChips = TIMES.map(t => (
    <ToggleButton
      key={t}
      label={t}
      size="sm"
      isPressed={t === time}
      onPressedChange={() => setTime(t)}
      xstyle={[s.timeChip, t === time && s.timeChipSelected]}>
      {t}
    </ToggleButton>
  ));

  return (
    <>
      <AppScreen title="DateTimeInput">
        <Note>
          Date and time are <b>separate targets</b>, like the iOS compact
          picker: a <b>Date / Time</b> switch beside the title reveals one
          picker at a time. Pick a day, then <b>tap Time</b> to choose an hour;
          Confirm stays pinned and enables once both are set. On a wide sheet
          the same switch stays — the Date view just shows{' '}
          <b>two months side by side</b> and the Time view a wider grid.
        </Note>
        <TapField
          label="Starts at"
          placeholder="Pick date & time"
          icon={<CalendarIcon width={16} height={16} />}
          value={date && time ? `${date} · ${time}` : undefined}
          onClick={() => setOpen(true)}
        />
      </AppScreen>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        // Same mobile solution on both sizes: a Date / Time switch shows one
        // picker at a time. The tablet just gets more room — two months side by
        // side in the Date view and a wider time grid in the Time view.
        snapPoints={beside ? [0.92] : [448, 0.92]}
        defaultSnap={0}
        title="Starts at"
        headerAccessory={
          <SegmentedControl
            value={segment}
            size="sm"
            onChange={v => setSegment(v as 'date' | 'time')}
            label="Choose date or time">
            <SegmentedControlItem value="date" label="Date" />
            <SegmentedControlItem value="time" label="Time" />
          </SegmentedControl>
        }
        footer={
          <Button
            label="Confirm"
            variant="primary"
            xstyle={s.fullBtn}
            isDisabled={!date || !time}
            onClick={() => setOpen(false)}
          />
        }>
        {segment === 'date' ? (
          <ScrollCalendar
            mode="single"
            paged={beside}
            value={date}
            onChange={(v: ISODateString) => setDate(v)}
            startYear={2026}
            startMonth={6}
            monthCount={beside ? 6 : 4}
          />
        ) : (
          <Grid columns={beside ? 6 : 4} gap={2} width="100%">
            {timeChips}
          </Grid>
        )}
      </BottomSheet>
    </>
  );
}

const DateTimeInputTabletDemo = () => <DateTimeInputDemo beside />;

// 11. DateRangeInput — vertical scroll of months (Airbnb / Material mobile) ---
// Single-letter column headers (iOS / Google Calendar mobile pattern). The
// full name rides along for assistive tech so the S/S and T/T pairs stay
// unambiguous to a screen reader even though they look identical.
const WEEKDAYS = [
  {short: 'S', full: 'Sunday'},
  {short: 'M', full: 'Monday'},
  {short: 'T', full: 'Tuesday'},
  {short: 'W', full: 'Wednesday'},
  {short: 'T', full: 'Thursday'},
  {short: 'F', full: 'Friday'},
  {short: 'S', full: 'Saturday'},
];
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const pad2 = (n: number) => String(n).padStart(2, '0');
const isoOf = (y: number, m: number, d: number) =>
  iso(`${y}-${pad2(m + 1)}-${pad2(d)}`);

/**
 * Prototype scrolling calendar following the mobile pattern every major system
 * uses (Airbnb, Google Material, iOS): a single continuously scrolling column
 * of months, each with its own title, under one sticky weekday header.
 * Selection lives in a single component, so in `range` mode a range can span
 * any two months with a highlight that flows across month boundaries, and in
 * `single` mode the same scroll of months backs a one-date field — picking a
 * day commits immediately.
 */
type ScrollCalendarProps = {
  startYear: number;
  startMonth: number;
  monthCount?: number;
  // Tighter rows so a second month peeks in a short side-by-side column
  // (tablet DateTimeInput). Phone/full-width sheets use the roomier default.
  dense?: boolean;
  // Lay months out side by side (classic desktop range picker) instead of a
  // vertical scroll — each month gets its own weekday header. Used on the
  // tablet DateRangeInput where there's horizontal room for two months.
  paged?: boolean;
} & (
  | {
      mode: 'single';
      value?: ISODateString;
      onChange: (v: ISODateString) => void;
    }
  | {
      mode: 'range';
      value?: DateRange;
      onChange: (v: DateRange | undefined) => void;
    }
);

function ScrollCalendar(props: ScrollCalendarProps) {
  const {
    startYear,
    startMonth,
    monthCount = 4,
    dense = false,
    paged = false,
  } = props;
  const cellH = dense ? 32 : 42;
  const dayD = dense ? 30 : 38;
  const monthPadTop = dense ? 4 : 16;
  // Range mode tracks an in-progress start (first tap) and only emits a full
  // DateRange on the second tap; single mode commits on the first tap, so the
  // anchor stays null there.
  const [anchor, setAnchor] = useState<ISODateString | null>(null);
  const selStart =
    props.mode === 'range'
      ? (props.value?.start ?? anchor ?? undefined)
      : props.value;
  const selEnd = props.mode === 'range' ? props.value?.end : undefined;
  const showBar = !!(selStart && selEnd && selStart !== selEnd);

  const pick = (d: ISODateString) => {
    if (props.mode === 'single') {
      props.onChange(d);
      return;
    }
    if (anchor === null) {
      setAnchor(d);
      props.onChange(undefined); // clear any completed range and start over
    } else {
      const start = d < anchor ? d : anchor;
      const end = d < anchor ? anchor : d;
      props.onChange({start, end});
      setAnchor(null);
    }
  };

  const months = Array.from({length: monthCount}, (_, i) => {
    const m = startMonth + i;
    return {year: startYear + Math.floor(m / 12), month: ((m % 12) + 12) % 12};
  });

  // Weekday header row (S M T W ...). Sticky in the scroll layout; repeated
  // per-month (non-sticky) in the paged / side-by-side layout.
  const weekdayHeader = (sticky: boolean) => (
    <div
      style={{
        ...(sticky
          ? {position: 'sticky', top: 0, zIndex: 1}
          : {position: 'relative'}),
        background: 'var(--color-background-surface)',
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        paddingBottom: 6,
        borderBottom: '1px solid var(--color-border)',
      }}>
      {WEEKDAYS.map((w, i) => (
        <div
          key={i}
          aria-label={w.full}
          title={w.full}
          style={{
            textAlign: 'center',
            fontSize: 12,
            color: 'var(--color-text-secondary)',
            padding: '4px 0',
          }}>
          {w.short}
        </div>
      ))}
    </div>
  );

  const renderMonth = (year: number, month: number, withHeader: boolean) => {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const lead = new Date(year, month, 1).getDay();
    const cells: (number | null)[] = [
      ...Array<null>(lead).fill(null),
      ...Array.from({length: daysInMonth}, (_, i) => i + 1),
    ];
    return (
      <div
        key={`${year}-${month}`}
        style={{paddingTop: paged ? 0 : monthPadTop}}>
        <div
          style={{
            padding: dense ? '2px 2px 6px' : '4px 2px 10px',
            fontSize: dense ? 14 : 15,
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            textAlign: paged ? 'center' : 'start',
          }}>
          {MONTH_NAMES[month]} {year}
        </div>
        {withHeader && weekdayHeader(false)}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            rowGap: 2,
            paddingTop: withHeader ? 4 : 0,
          }}>
          {cells.map((d, i) => {
            if (d == null) {
              return <div key={i} />;
            }
            const isoD = isoOf(year, month, d);
            const isStart = isoD === selStart;
            const isEnd = isoD === selEnd;
            const inRange = !!(
              selStart &&
              selEnd &&
              isoD > selStart &&
              isoD < selEnd
            );
            const isEndpoint = isStart || isEnd;
            return (
              <div
                key={i}
                style={{
                  position: 'relative',
                  height: cellH,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                {(inRange || (isEndpoint && showBar)) && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 4,
                      bottom: 4,
                      left: isStart && !isEnd ? '50%' : 0,
                      right: isEnd && !isStart ? '50%' : 0,
                      background: 'var(--color-accent-muted)',
                    }}
                  />
                )}
                <button
                  onClick={() => pick(isoD)}
                  style={{
                    position: 'relative',
                    width: dayD,
                    height: dayD,
                    borderRadius: 999,
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 14,
                    fontFamily: 'inherit',
                    background: isEndpoint
                      ? 'var(--color-accent)'
                      : 'transparent',
                    color: isEndpoint
                      ? 'var(--color-on-accent)'
                      : 'var(--color-text-primary)',
                    fontWeight: isEndpoint ? 600 : 400,
                  }}>
                  {d}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Paged: months sit side by side (classic desktop range picker). Two fixed-
  // width columns fill the visible width and the rest scroll in horizontally
  // (snap per month), so there's always more to reach. The shared `anchor`
  // means a range still spans columns.
  if (paged) {
    return (
      <div
        style={{
          display: 'flex',
          gap: 24,
          overflowX: 'auto',
          overscrollBehavior: 'contain',
          scrollSnapType: 'x mandatory',
          paddingBottom: 8,
          alignItems: 'start',
        }}>
        {months.map(({year, month}) => (
          <div
            key={`${year}-${month}-col`}
            style={{
              flex: '0 0 288px',
              minWidth: 288,
              scrollSnapAlign: 'start',
            }}>
            {renderMonth(year, month, true)}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{width: '100%'}}>
      {weekdayHeader(true)}
      {months.map(({year, month}) => renderMonth(year, month, false))}
    </div>
  );
}

function DateRangeInputDemo() {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange>();
  const label =
    range?.start && range?.end ? `${range.start} → ${range.end}` : undefined;
  return (
    <>
      <AppScreen title="DateRangeInput">
        <Note>
          Months <b>stack in a vertical scroll</b> instead of side by side — the
          mobile pattern from Airbnb / Material / iOS. Each month keeps its own
          title, the weekday row stays <b>sticky</b> at the top, and the range
          highlight flows continuously across month boundaries. It opens at a{' '}
          <b>medium detent</b> and can be <b>dragged up to full height</b> to
          see more months at once; Apply stays pinned.
        </Note>
        <TapField
          label="Trip dates"
          placeholder="Pick a range"
          icon={<CalendarIcon width={16} height={16} />}
          value={label}
          onClick={() => setOpen(true)}
        />
      </AppScreen>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        snapPoints={[448, 0.92]}
        defaultSnap={0}
        title="Trip dates"
        footer={
          <Button
            label="Apply"
            variant="primary"
            xstyle={s.fullBtn}
            isDisabled={!range?.start || !range?.end}
            onClick={() => setOpen(false)}
          />
        }>
        <ScrollCalendar
          mode="range"
          value={range}
          onChange={setRange}
          startYear={2026}
          startMonth={6}
          monthCount={4}
        />
      </BottomSheet>
    </>
  );
}

// Tablet: with room to spare, two months sit side by side (classic desktop
// range picker) instead of the phone's vertical scroll. One calendar instance
// keeps the shared range anchor, so a selection still spans both months.
function DateRangeInputTabletDemo() {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange>();
  const label =
    range?.start && range?.end ? `${range.start} → ${range.end}` : undefined;
  return (
    <>
      <AppScreen title="DateRangeInput">
        <Note>
          With room to spare, two months sit <b>side by side</b> (the desktop
          range-picker pattern) instead of the phone's vertical scroll. The
          range highlight flows continuously from one month into the next.
        </Note>
        <TapField
          label="Trip dates"
          placeholder="Pick a range"
          icon={<CalendarIcon width={16} height={16} />}
          value={label}
          onClick={() => setOpen(true)}
        />
      </AppScreen>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        height="hug"
        title="Trip dates"
        footer={
          <Button
            label="Apply"
            variant="primary"
            xstyle={s.fullBtn}
            isDisabled={!range?.start || !range?.end}
            onClick={() => setOpen(false)}
          />
        }>
        <ScrollCalendar
          mode="range"
          paged
          value={range}
          onChange={setRange}
          startYear={2026}
          startMonth={6}
          monthCount={6}
        />
      </BottomSheet>
    </>
  );
}

// 12. FormLayout — single column, labels above -------------------------------
function FormLayoutDemo() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [plan, setPlan] = useState('pro');
  const [notify, setNotify] = useState(true);
  return (
    <AppScreen title="FormLayout">
      <Note>
        Below the breakpoint, multi-column forms collapse to a{' '}
        <b>single column</b> with <b>labels above</b> each control. Full-width
        controls, comfortable tap targets.
      </Note>
      <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
        <TextInput
          label="Full name"
          placeholder="Jane Doe"
          value={name}
          onChange={v => setName(v)}
          isRequired
        />
        <TextInput
          label="Work email"
          type="email"
          placeholder="jane@acme.com"
          value={email}
          onChange={v => setEmail(v)}
          isRequired
        />
        <RadioList label="Plan" value={plan} onChange={setPlan}>
          <RadioListItem label="Starter" value="starter" />
          <RadioListItem label="Pro" value="pro" />
          <RadioListItem label="Enterprise" value="enterprise" />
        </RadioList>
        <Switch
          label="Email me product updates"
          value={notify}
          onChange={c => setNotify(c)}
          labelPosition="start"
          labelSpacing="spread"
        />
        <Button label="Create account" variant="primary" xstyle={s.fullBtn} />
      </div>
    </AppScreen>
  );
}

// Tablet: the form regains its multi-column layout instead of stacking.
function FormLayoutTabletDemo() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [plan, setPlan] = useState('pro');
  const [notify, setNotify] = useState(true);
  return (
    <AppScreen title="FormLayout">
      <Note>
        Above the breakpoint the form uses a <b>multi-column</b> layout —
        related fields sit side by side instead of stacking, making better use
        of the width.
      </Note>
      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16}}>
        <TextInput
          label="Full name"
          placeholder="Jane Doe"
          value={name}
          onChange={v => setName(v)}
          isRequired
        />
        <TextInput
          label="Work email"
          type="email"
          placeholder="jane@acme.com"
          value={email}
          onChange={v => setEmail(v)}
          isRequired
        />
        <div style={{gridColumn: '1 / -1'}}>
          <RadioList label="Plan" value={plan} onChange={setPlan}>
            <RadioListItem label="Starter" value="starter" />
            <RadioListItem label="Pro" value="pro" />
            <RadioListItem label="Enterprise" value="enterprise" />
          </RadioList>
        </div>
        <div style={{gridColumn: '1 / -1'}}>
          <Switch
            label="Email me product updates"
            value={notify}
            onChange={c => setNotify(c)}
            labelPosition="start"
            labelSpacing="spread"
          />
        </div>
      </div>
      <div style={{display: 'flex', justifyContent: 'flex-end'}}>
        <Button label="Create account" variant="primary" />
      </div>
    </AppScreen>
  );
}

// 13. Tokenizer — h-scroll tag row + pinned-tall suggestions ------------------
const TOKEN_SUGGESTIONS = [
  'React',
  'TypeScript',
  'StyleX',
  'Node',
  'GraphQL',
  'Rust',
  'Go',
  'Python',
  'Swift',
  'Kotlin',
  'Figma',
  'Docker',
];
function TokenizerDemo() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [tokens, setTokens] = useState<string[]>([
    'React',
    'TypeScript',
    'StyleX',
  ]);
  const suggestions = TOKEN_SUGGESTIONS.filter(
    t => !tokens.includes(t) && t.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <>
      <AppScreen title="Tokenizer">
        <Note>
          Existing tokens sit in a <b>horizontally scrolling row</b> (no wrap
          reflow). Adding tokens opens a <b>pinned-tall</b>, search-driven
          sheet.
        </Note>
        <Field label="Skills" inputID="tok-field" width="100%">
          <div
            id="tok-field"
            {...stylex.props(inputWrapperStyles.base, s.tokRow)}>
            {tokens.map(t => (
              <Token
                key={t}
                label={t}
                size="sm"
                xstyle={s.noShrink}
                onRemove={() => setTokens(x => x.filter(v => v !== t))}
              />
            ))}
            <Button
              label="Add"
              variant="ghost"
              size="sm"
              xstyle={s.noShrink}
              icon={<PlusIcon width={14} height={14} />}
              onClick={() => setOpen(true)}
            />
          </div>
        </Field>
      </AppScreen>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        height="tall"
        title="Add skills">
        <div
          style={{
            position: 'sticky',
            top: 0,
            background: 'var(--color-background-surface)',
            paddingTop: 4,
            paddingBottom: 8,
          }}>
          <TextInput
            label="Search"
            isLabelHidden
            placeholder="Search skills"
            startIcon="search"
            value={q}
            onChange={v => setQ(v)}
          />
        </div>
        <List hasDividers density="spacious">
          {suggestions.map(t => (
            <ListItem
              key={t}
              label={t}
              startContent={
                <PlusIcon
                  width={16}
                  height={16}
                  style={{color: 'var(--color-icon-accent)'}}
                />
              }
              onClick={() => {
                setTokens(x => [...x, t]);
                setQ('');
              }}
            />
          ))}
        </List>
      </BottomSheet>
    </>
  );
}

// =============================================================================
// ENHANCEMENTS
// =============================================================================

// 14. Popover — sheet fallback when content is large --------------------------
function PopoverDemo() {
  const smallRef = useRef<HTMLDivElement>(null);
  const [small, setSmall] = useState(false);
  const [rect, setRect] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const [large, setLarge] = useState(false);

  const openSmall = () => {
    const el = smallRef.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (el && parent) {
      setRect({
        top: el.offsetTop,
        left: el.offsetLeft,
        width: el.offsetWidth,
        height: el.offsetHeight,
      });
    }
    setSmall(true);
  };

  return (
    <>
      <AppScreen title="Popover">
        <Note>
          Small popovers stay anchored to their trigger. When content is large,
          the popover <b>falls back to a bottom sheet</b> so it isn&apos;t
          clipped by the viewport. The sheet defaults to <b>hug</b> height —
          only as tall as its content.
        </Note>
        <div ref={smallRef} style={{alignSelf: 'flex-start'}}>
          <Button
            label="Small popover"
            variant="secondary"
            onClick={openSmall}
          />
        </div>
        <Button
          label="Large content → sheet"
          variant="secondary"
          xstyle={s.fullBtn}
          onClick={() => setLarge(true)}
        />
      </AppScreen>

      <AnchoredPopover
        open={small}
        onClose={() => setSmall(false)}
        anchorRect={rect}>
        <Text type="label" color="secondary">
          Quick actions
        </Text>
        <VStack xstyle={s.popoverMenu}>
          <Item label="Copy link" onClick={() => setSmall(false)} />
          <Item label="Share" onClick={() => setSmall(false)} />
        </VStack>
      </AnchoredPopover>

      <BottomSheet
        open={large}
        onClose={() => setLarge(false)}
        height="hug"
        title="Notification preferences">
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            paddingTop: 4,
          }}>
          {[
            'Mentions',
            'Comments',
            'Assignments',
            'Weekly digest',
            'Product news',
            'Security alerts',
          ].map(l => (
            <Switch
              key={l}
              label={l}
              value
              onChange={() => {}}
              labelPosition="start"
              labelSpacing="spread"
            />
          ))}
        </div>
      </BottomSheet>
    </>
  );
}

// 15. DropdownMenu — anchored popover → bottom sheet --------------------------
function DropdownMenuDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <AppScreen title="DropdownMenu">
        <Note>
          An anchored dropdown becomes a <b>bottom sheet</b> (a bottom-anchored
          command list) on mobile. The sheet defaults to <b>hug</b> height —
          only as tall as its commands.
        </Note>
        <Button
          label="Actions"
          variant="secondary"
          icon={<ChevronDown width={16} height={16} />}
          onClick={() => setOpen(true)}
        />
      </AppScreen>
      <BottomSheetMenu
        open={open}
        onClose={() => setOpen(false)}
        actions={[
          {label: 'Duplicate'},
          {label: 'Move to…'},
          {label: 'Rename'},
          {label: 'Delete', variant: 'destructive'},
        ]}
      />
    </>
  );
}

// 17. MoreMenu — bottom sheet -------------------------------------------------
function MoreMenuDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <AppScreen title="MoreMenu">
        <Note>
          The three-dot overflow menu opens a <b>bottom sheet</b>. It defaults
          to <b>hug</b> height — only as tall as its commands.
        </Note>
        <Card>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
            <div>
              <Text type="body" weight="semibold">
                Design Review
              </Text>
              <div>
                <Text type="supporting">Shared folder</Text>
              </div>
            </div>
            <IconButton
              label="More options"
              variant="ghost"
              size="sm"
              icon={<DotsIcon />}
              onClick={() => setOpen(true)}
            />
          </div>
        </Card>
      </AppScreen>
      <BottomSheetMenu
        open={open}
        onClose={() => setOpen(false)}
        title="Design Review"
        actions={[
          {label: 'Open'},
          {label: 'Share'},
          {label: 'Add to favorites'},
          {
            label: 'Remove',
            variant: 'destructive',
            icon: <TrashIcon width={18} height={18} />,
          },
        ]}
      />
    </>
  );
}

// 18. ContextMenu — bottom sheet on long-press --------------------------------
function ContextMenuDemo() {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = () => {
    timer.current = setTimeout(() => setOpen(true), 450);
  };
  const cancel = () => {
    if (timer.current) {
      clearTimeout(timer.current);
    }
  };
  return (
    <>
      <AppScreen title="ContextMenu">
        <Note>
          <b>Long-press</b> a row (already supported) to open a{' '}
          <b>bottom sheet</b> of contextual actions.
        </Note>
        <div
          onPointerDown={start}
          onPointerUp={cancel}
          onPointerLeave={cancel}
          style={{touchAction: 'none'}}>
          <Card>
            <Text type="body">Press and hold this card…</Text>
            <div>
              <Text type="supporting">Long-press to reveal actions</Text>
            </div>
          </Card>
        </div>
      </AppScreen>
      <BottomSheetMenu
        open={open}
        onClose={() => setOpen(false)}
        actions={[
          {label: 'Reply'},
          {label: 'Copy'},
          {label: 'Forward'},
          {label: 'Delete', variant: 'destructive'},
        ]}
      />
    </>
  );
}

// 19. HoverCard — explicit touch trigger --------------------------------------
function HoverCardDemo() {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const openCard = () => {
    const el = ref.current;
    if (el) {
      setRect({
        top: el.offsetTop,
        left: el.offsetLeft,
        width: el.offsetWidth,
        height: el.offsetHeight,
      });
    }
    setOpen(true);
  };
  return (
    <>
      <AppScreen title="HoverCard">
        <Note>
          Hover doesn&apos;t exist on touch, so hover cards need an{' '}
          <b>explicit tap trigger</b> (today it&apos;s unguarded).
        </Note>
        <Text type="body" color="secondary">
          Assigned to{' '}
          <button
            ref={ref}
            onClick={openCard}
            style={{
              border: 'none',
              background: 'transparent',
              padding: 0,
              cursor: 'pointer',
              color: 'var(--color-text-accent)',
              font: 'inherit',
              textDecoration: 'underline',
              textDecorationStyle: 'dashed',
            }}>
            @grace
          </button>
        </Text>
      </AppScreen>
      <AnchoredPopover
        open={open}
        onClose={() => setOpen(false)}
        anchorRect={rect}
        width={260}>
        <Item
          align="start"
          startContent={<Avatar name="Grace Hopper" size="xl" />}
          label="Grace Hopper"
          description="Staff Engineer · Compilers"
        />
        <div style={{marginTop: 12}}>
          <Button
            label="View profile"
            variant="secondary"
            size="sm"
            xstyle={s.fullBtn}
            onClick={() => setOpen(false)}
          />
        </div>
      </AnchoredPopover>
    </>
  );
}

// 20. InfoTip — tap-to-open, same contract as Tooltip -------------------------
function InfoTipDemo() {
  const ref = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const openTip = () => {
    const el = ref.current;
    if (el) {
      setRect({
        top: el.offsetTop,
        left: el.offsetLeft,
        width: el.offsetWidth,
        height: el.offsetHeight,
      });
    }
    setOpen(true);
  };
  return (
    <>
      <AppScreen title="InfoTip">
        <Note>
          InfoTip is <b>tap-to-open</b> on touch, sharing the same contract as
          Tooltip.
        </Note>
        <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
          <Text type="label">API rate limit</Text>
          <span ref={ref} style={{display: 'inline-flex'}}>
            <IconButton
              label="More info"
              variant="ghost"
              size="sm"
              icon={<InfoIcon width={16} height={16} />}
              onClick={openTip}
            />
          </span>
        </div>
      </AppScreen>
      <AnchoredPopover
        open={open}
        onClose={() => setOpen(false)}
        anchorRect={rect}
        width={230}>
        <Text type="supporting">
          Requests are capped at 5,000/hour per API key. Contact support to
          raise the limit.
        </Text>
      </AnchoredPopover>
    </>
  );
}

// 21. Pagination — compact / overflow on narrow screens -----------------------
const CAROUSEL_SLIDES = [
  {title: 'Welcome', body: 'A quick tour of what’s new in this release.'},
  {title: 'Faster search', body: 'Results now stream in as you type.'},
  {title: 'Offline mode', body: 'Keep working when the connection drops.'},
  {
    title: 'Shared spaces',
    body: 'Invite your team to collaborate in real time.',
  },
  {title: 'You’re set', body: 'Jump in and start exploring.'},
];
function PaginationDemo() {
  const [page, setPage] = useState(3);
  const [slide, setSlide] = useState(1);
  const current = CAROUSEL_SLIDES[slide - 1];
  return (
    <AppScreen title="Pagination">
      <Note>
        Pagination shows the <b>full page range</b> (numbered pages with
        ellipsis) — the same control on phone and tablet.
      </Note>
      <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
        {Array.from({length: 4}).map((_, i) => (
          <Card key={i}>
            <Text type="body">Result {(page - 1) * 4 + i + 1}</Text>
          </Card>
        ))}
      </div>
      <div style={{display: 'flex', justifyContent: 'center', paddingTop: 4}}>
        <Pagination
          page={page}
          onChange={setPage}
          totalPages={12}
          variant="pages"
          size="sm"
        />
      </div>

      <Text type="label">Carousel · dots</Text>
      <Card>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            minHeight: 96,
            justifyContent: 'center',
          }}>
          <Text type="large" weight="semibold">
            {current.title}
          </Text>
          <Text type="body" color="secondary">
            {current.body}
          </Text>
        </div>
      </Card>
      <div style={{display: 'flex', justifyContent: 'center', paddingTop: 4}}>
        <Pagination
          page={slide}
          onChange={setSlide}
          totalPages={CAROUSEL_SLIDES.length}
          variant="dots"
        />
      </div>
    </AppScreen>
  );
}

// 22. Tooltip — tap-to-toggle if no interactive content -----------------------
function TooltipDemo() {
  const ref = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const toggle = () => {
    const el = ref.current;
    if (el) {
      setRect({
        top: el.offsetTop,
        left: el.offsetLeft,
        width: el.offsetWidth,
        height: el.offsetHeight,
      });
    }
    setOpen(o => !o);
  };
  return (
    <>
      <AppScreen title="Tooltip">
        <Note>
          Tooltips are fully suppressed on touch today. Expectation: a text-only
          tooltip becomes <b>tap-to-toggle</b> so the hint stays reachable.
        </Note>
        <span
          ref={ref}
          style={{alignSelf: 'flex-start', display: 'inline-flex'}}>
          <IconButton
            label="Sync now"
            variant="secondary"
            icon={<PlusIcon />}
            onClick={toggle}
          />
        </span>
      </AppScreen>
      <AnchoredPopover
        open={open}
        onClose={() => setOpen(false)}
        anchorRect={rect}
        width={160}>
        <Text type="supporting">Sync now</Text>
      </AnchoredPopover>
    </>
  );
}

// 23. Table — reflow: priority columns + card stack ---------------------------
const ROWS = [
  {
    name: 'API Gateway',
    owner: 'Grace H.',
    status: 'Healthy',
    variant: 'success' as const,
    latency: '42ms',
  },
  {
    name: 'Auth Service',
    owner: 'Alan T.',
    status: 'Degraded',
    variant: 'warning' as const,
    latency: '310ms',
  },
  {
    name: 'Billing',
    owner: 'Ada L.',
    status: 'Down',
    variant: 'error' as const,
    latency: '—',
  },
  {
    name: 'Search',
    owner: 'Radia P.',
    status: 'Healthy',
    variant: 'success' as const,
    latency: '88ms',
  },
];
// Wider dataset used to demonstrate the horizontal-scroll alternative: more
// columns than a phone can show, each with an explicit pixel width so the table
// overflows and scrolls sideways instead of squishing.
type WideRow = ServiceRow & {
  region: string;
  requests: string;
  errorRate: string;
};
const WIDE_ROWS: WideRow[] = ROWS.map((r, i) => ({
  ...r,
  region: ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-south-1'][i],
  requests: ['1.2M', '840K', '12K', '640K'][i],
  errorRate: ['0.01%', '2.4%', '100%', '0.3%'][i],
}));
const WIDE_COLUMNS: TableColumn<WideRow>[] = [
  {key: 'name', header: 'Service', width: pixel(150)},
  {key: 'region', header: 'Region', width: pixel(110)},
  {key: 'owner', header: 'Owner', width: pixel(110)},
  {
    key: 'status',
    header: 'Status',
    width: pixel(120),
    renderCell: r => <Badge label={r.status} variant={r.variant} />,
  },
  {key: 'requests', header: 'Requests', width: pixel(110), align: 'end'},
  {key: 'latency', header: 'Latency', width: pixel(100), align: 'end'},
  {key: 'errorRate', header: 'Errors', width: pixel(90), align: 'end'},
];
function TableDemo() {
  return (
    <AppScreen title="Table">
      <Note>
        Wide tables don&apos;t fit. The default reflow is a <b>card stack</b>{' '}
        that keeps <b>priority columns</b> (name + status) prominent and demotes
        the rest to labelled fields.
      </Note>
      <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
        {ROWS.map(r => (
          <Card key={r.name}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
              }}>
              <Text type="body" weight="semibold">
                {r.name}
              </Text>
              <Badge label={r.status} variant={r.variant} />
            </div>
            <div style={{display: 'flex', gap: 20, marginTop: 8}}>
              <div>
                <Text type="supporting">Owner</Text>
                <div>
                  <Text type="body">{r.owner}</Text>
                </div>
              </div>
              <div>
                <Text type="supporting">Latency</Text>
                <div>
                  <Text type="body">{r.latency}</Text>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Text type="label">Alternative · horizontal scroll</Text>
      <Note>
        When every column matters (dense, comparison-heavy data) the table can
        instead <b>keep its shape and scroll sideways</b> — columns get fixed
        widths so they never squish. Swipe the table left / right.
      </Note>
      <Table data={WIDE_ROWS} columns={WIDE_COLUMNS} idKey="name" />
    </AppScreen>
  );
}

// Tablet: the table fits, so it stays a real table with every column visible.
type ServiceRow = (typeof ROWS)[number];
const TABLE_COLUMNS: TableColumn<ServiceRow>[] = [
  {key: 'name', header: 'Service'},
  {key: 'owner', header: 'Owner'},
  {
    key: 'status',
    header: 'Status',
    renderCell: r => <Badge label={r.status} variant={r.variant} />,
  },
  {key: 'latency', header: 'Latency', align: 'end'},
];
function TableTabletDemo() {
  return (
    <AppScreen title="Table">
      <Note>
        Above the breakpoint the full table fits, so it stays a{' '}
        <b>real table</b>
        with every column visible — the card-stack reflow only kicks in on
        narrow screens.
      </Note>
      <Table data={ROWS} columns={TABLE_COLUMNS} idKey="name" hasHover />
    </AppScreen>
  );
}

// 24. Table filter — bottom sheet (filtering plugin) --------------------------
const STATUSES = ['Healthy', 'Degraded', 'Down'];
// Compact 2-column table for the filtered results (Service + Status) — enough to
// read clearly on a phone while still being a real XDS Table, not card rows.
const TABLE_FILTER_COLUMNS: TableColumn<ServiceRow>[] = [
  {key: 'name', header: 'Service'},
  {
    key: 'status',
    header: 'Status',
    align: 'end',
    renderCell: r => <Badge label={r.status} variant={r.variant} />,
  },
];
function TableFilterDemo() {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string[]>(['Degraded', 'Down']);
  return (
    <>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
        }}>
        <div style={{padding: '4px 20px 12px'}}>
          <Heading level={2}>Table filter</Heading>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '0 20px 12px',
          }}>
          <div style={{flex: 1}}>
            <TextInput
              label="Search"
              isLabelHidden
              placeholder="Search services"
              startIcon="search"
              value=""
              onChange={() => {}}
            />
          </div>
          <Button
            label="Filter"
            variant="secondary"
            icon={<FilterIcon width={16} height={16} />}
            endContent={
              sel.length ? (
                <Badge label={String(sel.length)} variant="info" />
              ) : undefined
            }
            onClick={() => setOpen(true)}
          />
        </div>
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '0 20px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}>
          <Note>
            The filtering plugin&apos;s controls move into a{' '}
            <b>non-modal bottom sheet</b> (no scrim) triggered by a Filter
            button. The list behind stays <b>live and scrollable</b>, and
            toggles apply immediately so you can watch results update while the
            sheet is open.
          </Note>
          <Table
            data={ROWS.filter(r => sel.includes(r.status))}
            columns={TABLE_FILTER_COLUMNS}
            idKey="name"
          />
        </div>
      </div>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        height="hug"
        scrim={false}
        title="Filters"
        headerAccessory={
          <Button
            label="Reset"
            variant="ghost"
            size="sm"
            onClick={() => setSel([])}
          />
        }
        footer={
          <Button
            label="Done"
            variant="primary"
            xstyle={s.fullBtn}
            onClick={() => setOpen(false)}
          />
        }>
        <CheckboxList label="Status" value={sel} onChange={setSel} hasDividers>
          {STATUSES.map(v => (
            <CheckboxListItem
              key={v}
              label={v}
              value={v}
              xstyle={s.filterItem}
            />
          ))}
        </CheckboxList>
      </BottomSheet>
    </>
  );
}

// Tablet: the filtered results are a real XDS Table; the filter opens a
// non-modal sheet so the table stays live and updates as statuses are toggled.
function TableFilterTabletDemo() {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string[]>(['Degraded', 'Down']);
  const filtered = ROWS.filter(r => sel.includes(r.status));
  return (
    <>
      <AppScreen title="Table filter">
        <Note>
          On a wide screen the filter controls open a <b>non-modal sheet</b> (no
          scrim) so the real <b>Table</b> behind stays live — toggling a status
          updates the rows immediately.
        </Note>
        <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
          <div style={{flex: 1}}>
            <TextInput
              label="Search"
              isLabelHidden
              placeholder="Search services"
              startIcon="search"
              value=""
              onChange={() => {}}
            />
          </div>
          <Button
            label="Filter"
            variant="secondary"
            icon={<FilterIcon width={16} height={16} />}
            endContent={
              sel.length ? (
                <Badge label={String(sel.length)} variant="info" />
              ) : undefined
            }
            onClick={() => setOpen(true)}
          />
        </div>
        <Table data={filtered} columns={TABLE_COLUMNS} idKey="name" hasHover />
      </AppScreen>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        height="hug"
        scrim={false}
        title="Filters"
        headerAccessory={
          <Button
            label="Reset"
            variant="ghost"
            size="sm"
            onClick={() => setSel([])}
          />
        }
        footer={
          <Button
            label="Done"
            variant="primary"
            xstyle={s.fullBtn}
            onClick={() => setOpen(false)}
          />
        }>
        <CheckboxList label="Status" value={sel} onChange={setSel} hasDividers>
          {STATUSES.map(v => (
            <CheckboxListItem
              key={v}
              label={v}
              value={v}
              xstyle={s.filterItem}
            />
          ))}
        </CheckboxList>
      </BottomSheet>
    </>
  );
}

// Alternative presentation: the same live-filter idea, but the controls live in
// a non-modal SIDE DRAWER instead of a bottom sheet. Same contract — no scrim,
// the table stays live and updates as statuses toggle — just anchored to the
// edge, which suits a filter you keep open while scanning a wide table.
function TableFilterDrawerDemo({beside = false}: {beside?: boolean} = {}) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string[]>(['Degraded', 'Down']);
  const filtered = ROWS.filter(r => sel.includes(r.status));
  return (
    <>
      <AppScreen title="Table filter">
        <Note>
          Same live filter, but the controls open in a{' '}
          <b>non-modal side drawer</b> instead of a bottom sheet. It stays
          anchored to the edge while you scan the table, which suits a filter
          you keep open — the list behind stays <b>live</b> and toggles apply
          immediately.
        </Note>
        <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
          <div style={{flex: 1}}>
            <TextInput
              label="Search"
              isLabelHidden
              placeholder="Search services"
              startIcon="search"
              value=""
              onChange={() => {}}
            />
          </div>
          <Button
            label="Filter"
            variant="secondary"
            icon={<FilterIcon width={16} height={16} />}
            endContent={
              sel.length ? (
                <Badge label={String(sel.length)} variant="info" />
              ) : undefined
            }
            onClick={() => setOpen(true)}
          />
        </div>
        <Table
          data={filtered}
          columns={beside ? TABLE_COLUMNS : TABLE_FILTER_COLUMNS}
          idKey="name"
          hasHover={beside}
        />
      </AppScreen>
      <SideDrawer
        open={open}
        onClose={() => setOpen(false)}
        side="end"
        title="Filters"
        scrim={false}>
        <VStack gap={4} height="100%" justify="between">
          <CheckboxList
            label="Status"
            value={sel}
            onChange={setSel}
            hasDividers>
            {STATUSES.map(v => (
              <CheckboxListItem
                key={v}
                label={v}
                value={v}
                xstyle={s.filterItem}
              />
            ))}
          </CheckboxList>
          <VStack gap={2}>
            <Button
              label="Reset"
              variant="ghost"
              xstyle={s.fullBtn}
              onClick={() => setSel([])}
            />
            <Button
              label="Done"
              variant="primary"
              xstyle={s.fullBtn}
              onClick={() => setOpen(false)}
            />
          </VStack>
        </VStack>
      </SideDrawer>
    </>
  );
}

const TableFilterDrawerTabletDemo = () => <TableFilterDrawerDemo beside />;

// =============================================================================
// Analysis — the interaction spec rendered below a prototype's preview
// =============================================================================

function ASection({title, children}: {title: string; children: ReactNode}) {
  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
      <Text type="large" weight="semibold">
        {title}
      </Text>
      {children}
    </div>
  );
}

function NumberDot({n}: {n: number}) {
  return (
    <span
      style={{
        flexShrink: 0,
        width: 22,
        height: 22,
        borderRadius: 999,
        background: 'var(--color-background-muted)',
        color: 'var(--color-text-secondary)',
        fontSize: 12,
        fontWeight: 600,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {n}
    </span>
  );
}

function Principle({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <div style={{display: 'flex', gap: 12, alignItems: 'flex-start'}}>
      <NumberDot n={n} />
      <div style={{display: 'flex', flexDirection: 'column', gap: 2}}>
        <Text type="body" weight="semibold">
          {title}
        </Text>
        <Text type="supporting" color="secondary">
          {children}
        </Text>
      </div>
    </div>
  );
}

function SystemCard({
  name,
  ships,
  points,
  steal,
}: {
  name: string;
  ships: string;
  points: string[];
  steal: string;
}) {
  return (
    <Card>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          flexWrap: 'wrap',
        }}>
        <Text type="body" weight="semibold">
          {name}
        </Text>
        <Token label={ships} size="sm" />
      </div>
      <div style={{marginTop: 8}}>
        <List listStyle="disc" density="compact">
          {points.map(p => (
            <ListItem key={p} label={p} />
          ))}
        </List>
      </div>
      <div style={{marginTop: 8}}>
        <Text type="supporting">
          <b>Steal:</b> {steal}
        </Text>
      </div>
    </Card>
  );
}

function SpecList({rows}: {rows: [string, string][]}) {
  return (
    <Card>
      <MetadataList label={{position: 'start'}}>
        {rows.map(([k, v]) => (
          <MetadataListItem key={k} label={k}>
            {v}
          </MetadataListItem>
        ))}
      </MetadataList>
    </Card>
  );
}

function BottomSheetAnalysis() {
  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 28}}>
      <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
        <Heading level={3}>Designing the bottom sheet</Heading>
        <Text type="body" color="secondary">
          The interaction spec behind this prototype, distilled from the
          most-used bottom-sheet systems — Apple iOS, Google Material 3, Vaul
          (shadcn), Radix, and Ionic.
        </Text>
        <Note>
          A great bottom sheet is a <b>gesture system, not an animation</b>. The
          parts that matter: velocity-aware (flick) dismissal, a clean hand-off
          between inner scroll and sheet drag, reusing a real modal for
          focus/inert, and respecting the keyboard + safe areas. Detents and
          easing are the easy part.
        </Note>
      </div>

      <ASection title="What we shipped in this prototype">
        <Note>
          The decisions below are what this prototype actually implements — a
          record of where we landed, not just the aspiration. Anything not yet
          built is called out as an eng-handoff item.
        </Note>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 12,
          }}>
          <Card>
            <Text type="label">Built &amp; interactive</Text>
            <div
              style={{
                marginTop: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}>
              <Text type="supporting" color="secondary">
                · Single-detent by default (hug · capped · tall). Multi-detent
                is opt-in via snapPoints + defaultSnap.
              </Text>
              <Text type="supporting" color="secondary">
                · Detents animate the sheet&apos;s height (not a translated
                oversized sheet), so the scroll viewport and safe-area always
                fit on screen.
              </Text>
              <Text type="supporting" color="secondary">
                · Release is velocity-projected: multi-detent snaps to the
                nearest detent; single-detent flicks to dismiss or springs back.
              </Text>
              <Text type="supporting" color="secondary">
                · Upward drag on a single-detent sheet is clamped at rest (no
                rubber-band).
              </Text>
              <Text type="supporting" color="secondary">
                · Scroll ↔ drag hand-off: grabber always drags; body drags only
                at scrollTop 0 moving down.
              </Text>
              <Text type="supporting" color="secondary">
                · Min-height peek = the lowest detent; the grabber closes it by
                dragging/flicking past the peek — no close button.
              </Text>
              <Text type="supporting" color="secondary">
                · Modal by default (scrim dims + blocks). Non-modal is
                scenario-specific, not a per-sheet toggle; a peek is always
                non-modal.
              </Text>
              <Text type="supporting" color="secondary">
                · One sheet at a time — never a sheet on a sheet. Opening one
                closes any other; a surface that leads somewhere swaps content
                in place or opens a different surface type.
              </Text>
              <Text type="supporting" color="secondary">
                · Back-to-dismiss: Android / browser Back closes the sheet first
                via the History API.
              </Text>
              <Text type="supporting" color="secondary">
                · Safe-area bottom inset so footers and rows clear the home
                indicator; max-width 640px, centered for tablets.
              </Text>
            </div>
          </Card>
          <Card>
            <Text type="label">Deferred to eng handoff</Text>
            <div
              style={{
                marginTop: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}>
              <Text type="supporting" color="secondary">
                · Reuse XDS <b>Dialog</b> as the a11y substrate (focus trap ·
                inert · Escape) instead of this hand-rolled role=dialog overlay.
              </Text>
              <Text type="supporting" color="secondary">
                · Keyboard handling — visualViewport lift and 100dvh sizing.
              </Text>
              <Text type="supporting" color="secondary">
                · prefers-reduced-motion fade fallback.
              </Text>
              <Text type="supporting" color="secondary">
                · Flourishes we intentionally skipped: background scaling,
                nested sheets.
              </Text>
            </div>
          </Card>
        </div>
      </ASection>

      <ASection title="How the most-used systems behave">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 12,
          }}>
          <SystemCard
            name="Apple — iOS Sheets"
            ships="UIKit / SwiftUI"
            points={[
              'medium / large detents + grabber',
              'rubber-band, velocity settle',
            ]}
            steal="Scroll at the top grows the sheet, then scrolls."
          />
          <SystemCard
            name="Google — Material 3"
            ships="Android / Compose"
            points={['half / full expansion', 'drag handle + scrim tap']}
            steal="Cap max-width so it doesn't stretch on tablets."
          />
          <SystemCard
            name="Vaul"
            ships="React · shadcn Drawer"
            points={[
              'arbitrary snap points',
              'velocity + momentum',
              'drags only at scrollTop 0',
            ]}
            steal="The whole gesture model — the web reference bar."
          />
          <SystemCard
            name="Radix UI — Dialog"
            ships="React web"
            points={['no drag', 'native focus trap + inert']}
            steal="Use it as the accessibility substrate."
          />
          <SystemCard
            name="Ionic — ion-modal sheet"
            ships="Hybrid mobile"
            points={['breakpoints[] + initialBreakpoint', 'canDismiss guard']}
            steal="Breakpoints as a simple detents API."
          />
        </div>
      </ASection>

      <ASection title="What a great sheet gets right">
        <Principle n={1} title="Presentation & detents">
          Rest at discrete snap points, not one fixed height: hug · ½ · full
          plus a defaultSnap. Cap width (~640px) so it doesn&apos;t stretch on
          large viewports.
        </Principle>
        <Principle n={2} title="Gesture physics — project, then snap">
          On release, project position forward by velocity (~0.3s of momentum)
          and snap to the nearest point; dismiss only when projected past the
          lowest. For a single-detent sheet this is simply: flick down →
          dismiss, else spring back.
        </Principle>
        <Principle n={3} title="Scroll ↔ drag hand-off">
          The grabber always drags; the body drags only when scrolled to the top
          and moving down. Use overscroll-behavior: contain so it never leaks to
          the page.
        </Principle>
        <Principle n={4} title="Focus, ARIA & Back">
          role=dialog + aria-modal, focus moves in on open and restores to the
          trigger on close, Escape dismisses, background goes inert. The Android
          Back gesture / button closes the sheet first (History API) rather than
          navigating away.
        </Principle>
        <Principle n={5} title="Keyboard & viewport">
          Track visualViewport and keep the focused field above the keyboard;
          size in 100dvh and lock body scroll while open.
        </Principle>
        <Principle n={6} title="Motion & reduced motion">
          iOS-style spring (cubic-bezier(.32,.72,0,1)); disable the transition
          while dragging so it tracks 1:1; drop to a fade under
          prefers-reduced-motion.
        </Principle>
        <Principle n={7} title="Safe areas">
          Pad the bottom by env(safe-area-inset-bottom) so footers clear the
          home indicator, and respect the top inset at the full detent.
        </Principle>
        <Principle n={8} title="Background & stacking">
          Scrim fades with drag progress; support a required (non-dismissible)
          mode — which is why Alert stays a centered dialog. Never stack a sheet
          on a sheet: only one is open at a time, and a surface that leads
          elsewhere swaps its content or opens a different surface type (dialog
          / menu).
        </Principle>
      </ASection>

      <ASection title="Second look — what to cut and sharpen">
        <Note>
          <b>Biggest miss:</b> don&apos;t rebuild the a11y substrate. XDS
          already ships <b>Dialog</b> (a native <code>&lt;dialog&gt;</code> with
          backdrop, focus-on-open, inert, Escape). The sheet should be the{' '}
          <b>mobile presentation of Dialog</b> with gestures on top — not a
          hand-rolled overlay.
        </Note>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 12,
          }}>
          <Card>
            <Text type="label">De-scope</Text>
            <div
              style={{
                marginTop: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}>
              <Text type="supporting" color="secondary">
                · Multi-detent snapping — our demos are single-detent; make
                medium/large opt-in.
              </Text>
              <Text type="supporting" color="secondary">
                · Background scaling + nested sheets — flourishes; skip.
              </Text>
              <Text type="supporting" color="secondary">
                · Greenfield focus trap — free from native dialog.
              </Text>
            </div>
          </Card>
          <Card>
            <Text type="label">Sharpen</Text>
            <div
              style={{
                marginTop: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}>
              <Text type="supporting" color="secondary">
                · Split prototype-now vs eng-handoff scope.
              </Text>
              <Text type="supporting" color="secondary">
                · Treat tuning numbers as starting points, not measured.
              </Text>
              <Text type="supporting" color="secondary">
                · “hug” is intrinsic height, not a fraction — special-case it.
              </Text>
            </div>
          </Card>
        </div>
      </ASection>

      <ASection title="Recommended spec">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 12,
          }}>
          <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
            <Text type="label">Gesture</Text>
            <SpecList
              rows={[
                ['Release logic', 'project velocity → nearest'],
                ['Projection window', '~0.3s momentum'],
                [
                  'Dismiss when',
                  '1-detent: projected > 25%; multi: below lowest',
                ],
                ['Upward drag', 'clamped at rest (1-detent)'],
                ['Drag source', 'grabber · body@scrollTop0'],
                ['Settle', 'cubic-bezier(.32,.72,0,1) · 320ms'],
              ]}
            />
          </div>
          <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
            <Text type="label">Presentation</Text>
            <SpecList
              rows={[
                ['Snap points', 'hug · ½ · full(92%)'],
                ['Initial snap', 'per usage (defaultSnap)'],
                ['Max width', '640px, centered'],
                ['Radius · height', '18px top · 100dvh'],
                ['Scrim', 'opacity tracks drag'],
                ['Bottom inset', 'env(safe-area-inset-bottom)'],
              ]}
            />
          </div>
        </div>
      </ASection>

      <ASection title="Build plan">
        <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
          <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
            <Token label="Live in this prototype" size="sm" color="green" />
            <Text type="supporting" color="secondary">
              Velocity-projected dismissal · scroll ↔ drag hand-off · opt-in
              height-based detents · min-height peek · modal / non-modal ·
              Back-to-dismiss · safe-area inset
            </Text>
          </div>
          <Principle n={3} title="Reuse Dialog substrate">
            Present as the mobile form of XDS Dialog (inherits focus / inert /
            Escape).
          </Principle>
          <Principle n={4} title="Keyboard + safe area">
            visualViewport lift, env() insets, 100dvh.
          </Principle>
          <Principle n={5} title="Motion polish">
            Reduced-motion fade, optional background scaling, nested sheets.
          </Principle>
        </div>
      </ASection>
    </div>
  );
}

function DrawerAnalysis() {
  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 28}}>
      <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
        <Heading level={3}>Designing the drawer</Heading>
        <Text type="body" color="secondary">
          The interaction spec behind this prototype, distilled from the
          most-used side-drawer systems — Google Material 3, Android
          DrawerLayout, Apple iOS conventions, Vaul (shadcn), and Radix.
        </Text>
        <Note>
          A drawer is a <b>navigation surface with a gesture on both ends</b>:
          an edge-swipe to open and a swipe-to-dismiss to close, with the scrim
          tracking the drag. The harder product question is <b>when</b> to use
          one — on mobile a drawer hides navigation behind a gesture, so
          it&apos;s for secondary or contextual content, not primary
          destinations (that&apos;s a tab bar&apos;s job).
        </Note>
      </div>

      <ASection title="What we shipped in this prototype">
        <Note>
          The decisions below are what this prototype actually implements — a
          record of where we landed, not just the aspiration. Anything not yet
          built is called out as an eng-handoff item.
        </Note>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 12,
          }}>
          <Card>
            <Text type="label">Built &amp; interactive</Text>
            <div
              style={{
                marginTop: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}>
              <Text type="supporting" color="secondary">
                · Close (×) follows the Material split: the start-side nav
                drawer omits it (paired with the menu button; swipe / scrim-tap
                / Back dismiss), while the end-side contextual side sheet
                includes it. All dismiss paths still work on both.
              </Text>
              <Text type="supporting" color="secondary">
                · Swipe-to-dismiss: drag the panel toward its edge; on release
                we velocity-project (~0.3s momentum) and dismiss past ~40% of
                the width, else spring back.
              </Text>
              <Text type="supporting" color="secondary">
                · Edge-swipe-to-open: an edge grip on the start side opens the
                drawer on an inward swipe (the prototype stand-in for a full
                edge-drag hand-off).
              </Text>
              <Text type="supporting" color="secondary">
                · Scrim opacity tracks the drag — fully dim at rest, transparent
                as the panel slides off.
              </Text>
              <Text type="supporting" color="secondary">
                · Single-axis gesture: only horizontal moves drag the panel;
                vertical moves fall through to native content scroll
                (touch-action: pan-y + axis detection).
              </Text>
              <Text type="supporting" color="secondary">
                · Start side for navigation, end side for contextual panels
                (filters). One drawer at a time — opening one closes the other;
                never a drawer on a drawer.
              </Text>
              <Text type="supporting" color="secondary">
                · Back-to-dismiss: Android / browser Back closes the drawer
                first via the History API.
              </Text>
              <Text type="supporting" color="secondary">
                · Width capped (≤320px, max 85%) with a trailing gap so it reads
                as a temporary overlay, not a new screen.
              </Text>
              <Text type="supporting" color="secondary">
                · Safe-area top + bottom insets so nav rows clear the status bar
                and home indicator.
              </Text>
            </div>
          </Card>
          <Card>
            <Text type="label">Deferred to eng handoff</Text>
            <div
              style={{
                marginTop: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}>
              <Text type="supporting" color="secondary">
                · Reuse XDS <b>Dialog</b> as the a11y substrate (focus trap ·
                inert · Escape) instead of this hand-rolled role=dialog overlay.
              </Text>
              <Text type="supporting" color="secondary">
                · Responsive <b>modal ↔ standard</b>: the tablet frame
                demonstrates the standard/permanent drawer (no scrim, content
                reflows, menu toggle <b>collapses</b> rather than a modal
                close). The automatic breakpoint switch between the two is the
                handoff.
              </Text>
              <Text type="supporting" color="secondary">
                · Production edge-drag hand-off — the panel follows the finger
                from x=0 rather than opening then animating.
              </Text>
              <Text type="supporting" color="secondary">
                · Side (leading/trailing) safe-area inset for the notch in
                landscape; prefers-reduced-motion fade.
              </Text>
            </div>
          </Card>
        </div>
      </ASection>

      <ASection title="How the most-used systems behave">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 12,
          }}>
          <SystemCard
            name="Google — Material 3"
            ships="Android / Compose"
            points={[
              'menu icon + edge swipe to open',
              'swipe / scrim tap / Back to close',
            ]}
            steal="Same component switches modal ↔ standard by breakpoint."
          />
          <SystemCard
            name="Android — DrawerLayout"
            ships="View system"
            points={[
              'left-edge drag follows the finger in',
              'scrim opacity tracks drag',
            ]}
            steal="Edge-drag to open + scrim tied to drag progress."
          />
          <SystemCard
            name="Apple — iOS conventions"
            ships="HIG · no system drawer"
            points={[
              'apps roll their own side menu',
              'prefers tab bars for primary nav',
            ]}
            steal="Use a tab bar for primary nav; drawers are secondary."
          />
          <SystemCard
            name="Vaul"
            ships="React · shadcn Drawer"
            points={['direction prop — any edge', 'velocity + momentum drag']}
            steal="One directional gesture model for every edge."
          />
          <SystemCard
            name="Radix UI — Dialog"
            ships="React web"
            points={['no drag', 'native focus trap + inert']}
            steal="Use it as the accessibility substrate."
          />
        </div>
      </ASection>

      <ASection title="What a great drawer gets right">
        <Principle n={1} title="Presentation & placement">
          A full-height panel over a scrim that doesn&apos;t push page content
          on mobile. Start edge = navigation; end edge = contextual panels. Cap
          the width (~320px) and leave a trailing gap so it reads as a temporary
          overlay.
        </Principle>
        <Principle n={2} title="Gesture on both ends">
          Edge-swipe to open (Android tracks the finger in); swipe the panel
          back toward its edge to close, projecting by velocity and dismissing
          past a threshold, else spring back. Single-axis, so there&apos;s no
          scroll↔drag fight — detect the axis and leave vertical moves to native
          scroll.
        </Principle>
        <Principle n={3} title="Modal vs standard — responsive">
          The same drawer is modal on a phone (scrim, swipe-dismiss) and
          standard/permanent on a wide screen (no scrim, content reflows beside
          it). Drive it off a breakpoint, not a separate component. Our mobile
          prototype is modal-only.
        </Principle>
        <Principle n={4} title="Focus, ARIA & Back">
          Modal drawer: role=dialog + aria-modal, focus moves in on open and
          restores to the trigger on close, Escape / scrim-tap close, background
          goes inert. Android Back closes the drawer first. A standard drawer is
          part of the page, not a dialog.
        </Principle>
        <Principle n={5} title="Safe areas (all four edges)">
          Pad the top for the status bar, the bottom for the home indicator, and
          the leading/trailing side for the notch in landscape
          (env(safe-area-inset-*)).
        </Principle>
        <Principle n={6} title="When NOT to use a drawer">
          A drawer hides navigation behind a gesture, costing discoverability.
          Reach for one for secondary / less-frequent destinations or an
          end-side contextual panel; keep the app&apos;s primary sections in a
          tab bar.
        </Principle>
        <Principle n={7} title="Motion & reduced motion">
          Slide on the same spring as the sheet (cubic-bezier(.32,.72,0,1));
          disable the transition during an active drag so it tracks 1:1; drop to
          a fade under prefers-reduced-motion.
        </Principle>
        <Principle n={8} title="Background & stacking">
          Scrim opacity tracks the drag so it reads as connected to the gesture.
          Never stack a drawer over a drawer, and don&apos;t combine a drawer
          and a sheet at once — one temporary surface at a time.
        </Principle>
      </ASection>

      <ASection title="Second look — what to cut and sharpen">
        <Note>
          <b>Biggest miss:</b> same lesson as the sheet — the modal drawer is
          the <b>edge presentation of XDS Dialog</b> (native{' '}
          <code>&lt;dialog&gt;</code> with backdrop, focus-on-open, inert,
          Escape). Add the slide + drag on top; don&apos;t hand-roll the overlay
          again.
        </Note>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 12,
          }}>
          <Card>
            <Text type="label">De-scope (for the prototype)</Text>
            <div
              style={{
                marginTop: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}>
              <Text type="supporting" color="secondary">
                · Standard / permanent drawer — a wide-screen concern; keep as a
                documented responsive handoff.
              </Text>
              <Text type="supporting" color="secondary">
                · Push / reflow content — that&apos;s standard-drawer behavior;
                on mobile the drawer overlays.
              </Text>
              <Text type="supporting" color="secondary">
                · Focus trap / inert — free from the native dialog; don&apos;t
                reimplement.
              </Text>
            </div>
          </Card>
          <Card>
            <Text type="label">Sharpen</Text>
            <div
              style={{
                marginTop: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}>
              <Text type="supporting" color="secondary">
                · Edge-swipe-to-open is faked — production hands the edge drag
                straight into the open translation.
              </Text>
              <Text type="supporting" color="secondary">
                · The 40%-width dismiss threshold and projection window are
                feel-tuning starting points, not measured.
              </Text>
              <Text type="supporting" color="secondary">
                · Lead with the “when” — the biggest risk is teams putting
                primary nav in a drawer.
              </Text>
            </div>
          </Card>
        </div>
      </ASection>

      <ASection title="Recommended spec">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 12,
          }}>
          <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
            <Text type="label">Gesture</Text>
            <SpecList
              rows={[
                ['Open', 'menu tap · edge swipe-in'],
                ['Close release', 'project velocity → dismiss / spring'],
                ['Projection window', '~0.3s momentum'],
                ['Dismiss threshold', 'projected > 40% width'],
                ['Drag axis', 'horizontal · vertical → scroll'],
                ['Settle', 'cubic-bezier(.32,.72,0,1) · 300ms'],
              ]}
            />
          </div>
          <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
            <Text type="label">Presentation</Text>
            <SpecList
              rows={[
                ['Width', '≤320px · max 85%, trailing gap'],
                ['Sides', 'start (nav) · end (contextual)'],
                ['Modality', 'modal (mobile) · standard (wide)'],
                ['Scrim', 'opacity tracks drag'],
                ['Insets', 'top · bottom · side (env)'],
                ['Back', 'closes drawer first (History API)'],
              ]}
            />
          </div>
        </div>
      </ASection>

      <ASection title="Build plan">
        <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
          <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
            <Token label="Live in this prototype" size="sm" color="green" />
            <Text type="supporting" color="secondary">
              Swipe-to-dismiss + velocity · edge-swipe-to-open · scrim tracks
              drag · start / end sides · Back-to-dismiss · width cap · safe-area
              insets
            </Text>
          </div>
          <Principle n={3} title="Reuse Dialog substrate">
            Present the modal drawer as the edge form of XDS Dialog (inherits
            focus / inert / Escape).
          </Principle>
          <Principle n={4} title="Responsive + safe area">
            Modal ↔ standard breakpoint switch; env() insets including the side
            notch.
          </Principle>
          <Principle n={5} title="Motion polish">
            Reduced-motion fade; production edge-drag hand-off from x=0.
          </Principle>
        </div>
      </ASection>
    </div>
  );
}

// =============================================================================
// Registry
// =============================================================================

export type PrototypeCategory = 'Blocks migration' | 'Enhancement';

export interface PrototypeFeature {
  title: string;
  description: string;
}

export interface Prototype {
  id: string;
  name: string;
  category: PrototypeCategory;
  /** What the component should become on mobile (from the migration table). */
  change: string;
  /** What eng should build — the interaction to implement. */
  interaction: string;
  /** Optional feature list shown in the info panel in place of change/interaction. */
  features?: PrototypeFeature[];
  /** Also render a wide tablet preview beside the phone (e.g. to show width caps). */
  showTablet?: boolean;
  /** Caption shown under the tablet frame. */
  tabletCaption?: string;
  /** Give the tablet frame a taller aspect ratio (more vertical room for the
      sheet — e.g. DateTimeInput fitting two months beside the time grid). */
  tabletTall?: boolean;
  /** Distinct demo for the tablet frame; falls back to Demo when omitted. */
  TabletDemo?: () => ReactNode;
  Demo: () => ReactNode;
  /**
   * Optional alternative presentation shown in its own labeled row *below* the
   * main previews — for documenting a second viable pattern (e.g. a side drawer
   * instead of a bottom sheet). Rendered in phone + tablet frames like the main
   * demo.
   */
  AltDemo?: () => ReactNode;
  /** Distinct alternative demo for the tablet frame; falls back to AltDemo. */
  AltTabletDemo?: () => ReactNode;
  /** Heading for the alternative row (e.g. "Alternative · side drawer"). */
  altLabel?: string;
  /** Caption under the alternative phone frame. */
  altCaption?: string;
  /** Caption under the alternative tablet frame. */
  altTabletCaption?: string;
  /** Optional long-form interaction analysis shown below the preview. */
  Analysis?: () => ReactNode;
}

export const PROTOTYPES: Prototype[] = [
  {
    id: 'bottom-sheet',
    name: 'Bottom Sheet',
    category: 'Blocks migration',
    change: 'The base primitive for mobile overlays.',
    interaction:
      'Slides up from the bottom over a scrim. Dismiss by tapping the scrim or dragging the grabber down. Supports hug, capped-scroll, and pinned-tall heights.',
    features: [
      {
        title: 'Velocity-projected dismissal',
        description:
          'A fast flick down dismisses from any position; a slow, short drag springs back.',
      },
      {
        title: 'Scroll ↔ drag hand-off',
        description:
          'The grabber always drags; the scrollable body only drags the sheet when it is scrolled to the top.',
      },
      {
        title: 'Drag the grabber to dismiss',
        description:
          'Pull the handle down past ~25% of the sheet height to close. Upward drag is clamped at rest on a single-detent sheet.',
      },
      {
        title: 'Modal by default; non-modal is scenario-specific',
        description:
          'Almost every sheet is modal — a scrim dims and blocks the page. Non-modal (no scrim) is not a per-sheet toggle; it is reserved for sheets that must coexist with live background content, primarily the persistent peek. See the peek demo.',
      },
      {
        title: 'Tap-scrim to dismiss',
        description:
          'On modal sheets the dimmed backdrop closes on tap and its opacity fades as the sheet is dragged down. Non-modal sheets dismiss via the grabber only.',
      },
      {
        title: 'Back-to-dismiss (Android)',
        description:
          'The system Back gesture / button closes the sheet first (via the History API) instead of navigating away. Try the browser Back button here.',
      },
      {
        title: 'Three heights',
        description:
          'Hug content, capped (scrolls internally), or pinned tall for streaming content — the developer picks one per use case.',
      },
      {
        title: 'Opt-in draggable detents',
        description:
          'Browse-style sheets can define snap points (e.g. medium ↔ full) and open at a default detent. Release velocity-projects to the nearest detent; dismiss only from the lowest.',
      },
      {
        title: 'Min-height peek detent',
        description:
          'The lowest detent can be a small peek (Apple Maps / Music). A casual drag parks at the peek; dragging or flicking the handle past it closes the sheet — the grabber is the only close affordance. Paired with non-modal so the background stays interactive while it is parked.',
      },
      {
        title: 'Safe-area aware',
        description:
          'Bottom inset keeps footers and rows clear of the iOS home indicator.',
      },
    ],
    showTablet: true,
    tabletCaption: 'Tablet · sheet caps at 640px, centered',
    Demo: BottomSheetDemo,
    Analysis: BottomSheetAnalysis,
  },
  {
    id: 'drawer',
    name: 'Drawer',
    category: 'Blocks migration',
    change: 'Edge panel.',
    interaction:
      'Slides in from a screen edge as a full-height overlay (capped ~85% width) with a scrim, rather than pushing page content.',
    features: [
      {
        title: 'Close (×) on contextual panels, not nav',
        description:
          'Canonical Material: a start-side navigation drawer has no × (it’s paired with the menu button; dismiss via swipe, scrim-tap, or Back). A contextual end-side side sheet does get a header × since it isn’t tied to one launcher.',
      },
      {
        title: 'Standard drawer collapses, not closes (tablet)',
        description:
          'On a wide screen the drawer is standard/permanent — part of the page, not a modal. It has no close (×); a menu toggle collapses it and content reflows to full width. See the tablet preview.',
      },
      {
        title: 'Swipe-to-dismiss with velocity',
        description:
          'Drag the panel toward its edge; on release we project by velocity and dismiss past ~40% of the width, otherwise it springs back open.',
      },
      {
        title: 'Edge-swipe-to-open',
        description:
          'Swipe inward from the start edge (the grip) to open the navigation drawer — the prototype stand-in for a production edge-drag hand-off.',
      },
      {
        title: 'Scrim tracks the drag',
        description:
          'The dimmed backdrop is fully opaque at rest and fades toward transparent as the panel is dragged off-screen, so it reads as connected to the gesture.',
      },
      {
        title: 'Single-axis gesture',
        description:
          'Only horizontal moves drag the panel; vertical moves fall through to native content scroll (touch-action: pan-y plus axis detection), so there is no scroll↔drag fight.',
      },
      {
        title: 'Start & end sides',
        description:
          'Start edge for navigation, end edge for contextual panels like filters. One drawer at a time — opening one closes the other; never a drawer on a drawer.',
      },
      {
        title: 'Back-to-dismiss (Android)',
        description:
          'The system Back gesture / button closes the drawer first (via the History API) instead of navigating away. Try the browser Back button here.',
      },
      {
        title: 'Width cap with trailing gap',
        description:
          'Capped at ≤320px (max 85%) so a sliver of the scrim stays visible — it reads as a temporary overlay, not a new screen.',
      },
      {
        title: 'Safe-area aware',
        description:
          'Top and bottom insets keep nav rows clear of the status bar and home indicator.',
      },
    ],
    showTablet: true,
    tabletCaption: 'Tablet · standard drawer, always visible beside content',
    Demo: DrawerDemo,
    TabletDemo: DrawerTabletDemo,
    Analysis: DrawerAnalysis,
  },
  {
    id: 'dialog',
    name: 'Dialog',
    category: 'Blocks migration',
    change: 'Bottom sheet. Alert dialogs still use dialogs.',
    interaction:
      'Regular dialogs present as a bottom sheet. Alert dialogs stay centered modals and are not swipe-dismissible — a decision is required.',
    showTablet: true,
    tabletCaption: 'Tablet · dialog sheet caps at 640px, centered',
    Demo: DialogDemo,
  },
  {
    id: 'layout-panel',
    name: 'Layout / LayoutPanel',
    category: 'Blocks migration',
    change: 'Server-safe hideBelow / showBelow.',
    interaction:
      'A side-by-side panel is hidden below the breakpoint (server-safe, no hydration flash). Detail becomes a pushed full-screen view with a back affordance.',
    showTablet: true,
    tabletCaption: 'Tablet · list + detail side by side',
    Demo: LayoutPanelDemo,
    TabletDemo: LayoutPanelTabletDemo,
  },
  {
    id: 'selector',
    name: 'Selector',
    category: 'Blocks migration',
    change:
      'Bottom sheet, height hugs the option list; long lists open at a medium detent and drag up to full.',
    interaction:
      'Tapping the field opens a bottom sheet. A short list hugs its options; a long list opens at a medium detent and can be dragged up to full height for browsing.',
    showTablet: true,
    tabletCaption: 'Tablet · sheet caps at 640px, centered',
    Demo: SelectorDemo,
  },
  {
    id: 'multiselector',
    name: 'MultiSelector',
    category: 'Blocks migration',
    change:
      'Bottom sheet with checkboxes; hug/capped for short lists, opt-in medium↔full detents for long ones.',
    interaction:
      'Checkboxes for multi-select, applied on confirm via a pinned footer. Long, browse-style lists open at a medium detent and drag up to full; short lists stay hug/capped.',
    showTablet: true,
    tabletCaption: 'Tablet · sheet caps at 640px; detents drag to full',
    Demo: MultiSelectorDemo,
  },
  {
    id: 'typeahead',
    name: 'Typeahead',
    category: 'Blocks migration',
    change:
      'Bottom sheet, pinned tall (search results stream in — stable height avoids resize-on-keystroke).',
    interaction:
      'Pinned-tall sheet with a sticky search field. Results stream in async; a skeleton holds the space so the sheet never resizes mid-type.',
    showTablet: true,
    tabletCaption: 'Tablet · pinned-tall sheet caps at 640px',
    Demo: TypeaheadDemo,
  },
  {
    id: 'powersearch',
    name: 'PowerSearch',
    category: 'Blocks migration',
    change: 'Bottom sheet, pinned tall (search results are unstable).',
    interaction:
      'Pinned-tall sheet for building structured filter tokens (field → value). Height is fixed because results are unstable while composing.',
    showTablet: true,
    tabletCaption: 'Tablet · pinned-tall sheet caps at 640px',
    Demo: PowerSearchDemo,
  },
  {
    id: 'dateinput',
    name: 'DateInput',
    category: 'Blocks migration',
    change:
      'Bottom sheet with a vertical month scroll; opens at a medium detent and drags up to full.',
    interaction:
      'Tapping the field opens a bottom sheet with months stacked in a vertical scroll under a sticky weekday header. It opens at a medium detent and can be dragged up to full height to scroll through more months; picking a day confirms and closes.',
    showTablet: true,
    tabletCaption: 'Tablet · two months side by side',
    Demo: DateInputDemo,
    TabletDemo: DateInputTabletDemo,
  },
  {
    id: 'datetimeinput',
    name: 'DateTimeInput',
    category: 'Blocks migration',
    change:
      'Bottom sheet with a Date / Time switch (iOS compact-picker pattern); one picker at a time on both phone and tablet.',
    interaction:
      'Date and time are separate targets: a Date / Time switch beside the title reveals one picker at a time. Pick a day, then tap Time to choose an hour; Confirm stays pinned and enables once both are chosen. The tablet keeps the same switch — the Date view shows two months side by side and the Time view a wider grid.',
    showTablet: true,
    tabletCaption: 'Tablet · same switch, two months + wider time grid',
    Demo: DateTimeInputDemo,
    TabletDemo: DateTimeInputTabletDemo,
  },
  {
    id: 'daterangeinput',
    name: 'DateRangeInput',
    category: 'Blocks migration',
    change:
      'Bottom sheet with a vertical month scroll (Airbnb / Material mobile pattern); opens at a medium detent and drags up to full.',
    interaction:
      'Months stack in a vertical scroll, each with its own title and a sticky weekday header; the range highlight flows across months. One selection spans any two months. It opens at a medium detent and can be dragged up to full height to see more months at once; Apply stays pinned and enables once a full range is selected. On a wide sheet two months sit side by side (desktop range-picker pattern).',
    showTablet: true,
    tabletCaption: 'Tablet · two months side by side',
    Demo: DateRangeInputDemo,
    TabletDemo: DateRangeInputTabletDemo,
  },
  {
    id: 'formlayout',
    name: 'FormLayout',
    category: 'Blocks migration',
    change: 'Single-column, labels above, below breakpoint.',
    interaction:
      'Multi-column forms collapse to a single column with labels above every control and full-width, comfortably-sized inputs.',
    showTablet: true,
    tabletCaption: 'Tablet · multi-column form',
    Demo: FormLayoutDemo,
    TabletDemo: FormLayoutTabletDemo,
  },
  {
    id: 'tokenizer',
    name: 'Tokenizer',
    category: 'Blocks migration',
    change:
      'H-scroll tag row + pinned-tall sheet for suggestions (search-driven).',
    interaction:
      'Existing tokens sit in a horizontally scrolling row (no wrap reflow). Adding opens a pinned-tall, search-driven suggestions sheet.',
    showTablet: true,
    tabletCaption: 'Tablet · pinned-tall sheet caps at 640px',
    Demo: TokenizerDemo,
  },
  {
    id: 'popover',
    name: 'Popover',
    category: 'Enhancement',
    change: 'Sheet fallback when content is large (defaults to hug height).',
    interaction:
      'Small popovers stay anchored to the trigger. When content is large it falls back to a bottom sheet so nothing is clipped by the viewport; the sheet defaults to hug height, sized to its content.',
    showTablet: true,
    tabletCaption:
      'Tablet · small popover stays anchored; large content still a sheet',
    Demo: PopoverDemo,
  },
  {
    id: 'dropdownmenu',
    name: 'DropdownMenu',
    category: 'Enhancement',
    change: 'Anchored popover → bottom sheet (defaults to hug height).',
    interaction:
      'The anchored menu becomes a bottom sheet of the same items; it defaults to hug height, sized to its commands.',
    showTablet: true,
    tabletCaption: 'Tablet · sheet caps at 640px, centered',
    Demo: DropdownMenuDemo,
  },
  {
    id: 'moremenu',
    name: 'MoreMenu',
    category: 'Enhancement',
    change: 'Bottom sheet (defaults to hug height).',
    interaction:
      'The three-dot overflow trigger opens a bottom sheet; it defaults to hug height, sized to its commands.',
    showTablet: true,
    tabletCaption: 'Tablet · sheet caps at 640px, centered',
    Demo: MoreMenuDemo,
  },
  {
    id: 'contextmenu',
    name: 'ContextMenu',
    category: 'Enhancement',
    change: 'Bottom sheet (long-press already supported).',
    interaction:
      'Long-press a target to open a bottom sheet of contextual actions.',
    showTablet: true,
    tabletCaption: 'Tablet · sheet caps at 640px, centered',
    Demo: ContextMenuDemo,
  },
  {
    id: 'hovercard',
    name: 'HoverCard',
    category: 'Enhancement',
    change: 'Explicit touch trigger (today unguarded).',
    interaction:
      'Because hover doesn’t exist on touch, the card needs an explicit tap trigger to open, anchored to the trigger.',
    showTablet: true,
    tabletCaption: 'Tablet · card stays anchored to its trigger',
    Demo: HoverCardDemo,
  },
  {
    id: 'infotip',
    name: 'InfoTip',
    category: 'Enhancement',
    change: 'Tap-to-open, same contract as Tooltip.',
    interaction:
      'Tap the info icon to open the tip; it shares the Tooltip contract for dismissal.',
    showTablet: true,
    tabletCaption: 'Tablet · tip stays anchored to its trigger',
    Demo: InfoTipDemo,
  },
  {
    id: 'pagination',
    name: 'Pagination',
    category: 'Enhancement',
    change: 'Full page range — the same control on phone and tablet.',
    interaction:
      'Pagination shows the full page range (numbered pages with ellipsis) on both phone and tablet.',
    showTablet: true,
    tabletCaption: 'Tablet · full page range',
    Demo: PaginationDemo,
  },
  {
    id: 'tooltip',
    name: 'Tooltip',
    category: 'Enhancement',
    change:
      'Tap-to-toggle if no interactive content (today fully suppressed on touch).',
    interaction:
      'A text-only tooltip becomes tap-to-toggle so the hint stays reachable on touch devices.',
    showTablet: true,
    tabletCaption: 'Tablet · tip stays anchored to its trigger',
    Demo: TooltipDemo,
  },
  {
    id: 'table',
    name: 'Table',
    category: 'Enhancement',
    change: 'Reflow: priority columns + card-stack (not just h-scroll).',
    interaction:
      'Wide tables reflow into a card stack that keeps priority columns (name + status) prominent and demotes the rest to labelled fields.',
    showTablet: true,
    tabletCaption: 'Tablet · full table, all columns',
    Demo: TableDemo,
    TabletDemo: TableTabletDemo,
  },
  {
    id: 'tablefilter',
    name: 'Table filter',
    category: 'Enhancement',
    change: 'Bottom sheet (filtering plugin).',
    interaction:
      'A Filter button (with active-count badge) opens the filtering plugin controls in a bottom sheet with Reset and Show-results actions.',
    showTablet: true,
    tabletCaption: 'Tablet · real Table, non-modal live filter',
    Demo: TableFilterDemo,
    TabletDemo: TableFilterTabletDemo,
    AltDemo: TableFilterDrawerDemo,
    AltTabletDemo: TableFilterDrawerTabletDemo,
    altLabel: 'Alternative · side drawer',
    altCaption: 'Phone · 390px',
    altTabletCaption: 'Tablet · non-modal side drawer',
  },
];
