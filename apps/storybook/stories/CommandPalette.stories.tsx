// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * CommandPalette stories
 *
 * Progressive disclosure:
 * 1. No props beyond searchSource — default input, footer, rendering
 * 2. renderItem — custom item content, grouping still automatic
 */
import {useEffect, useMemo, useRef, useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {
  CommandPalette,
  CommandPaletteInput,
  CommandPaletteFooter,
  CommandPaletteGroup,
} from '@astryxdesign/core/CommandPalette';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {Theme, defineTheme} from '@astryxdesign/core/theme';
import {createStaticSource} from '@astryxdesign/core/Typeahead';
import type {SearchSource, SearchableItem} from '@astryxdesign/core/Typeahead';
import type {IconName} from '@astryxdesign/core/Icon';

const meta: Meta<typeof CommandPalette> = {
  title: 'Core/CommandPalette',
  component: CommandPalette,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof CommandPalette>;

// ─── Default ─────────────────────────────────────────────────────────────────

/** Simplest case — no input/footer/renderItem needed. */
export const Default: Story = {
  render: function Render() {
    const [isOpen, setIsOpen] = useState(false);
    const source = useMemo(
      () =>
        createStaticSource([
          {id: 'home', label: 'Home'},
          {id: 'settings', label: 'Settings'},
          {id: 'profile', label: 'Profile'},
          {id: 'dashboard', label: 'Dashboard'},
          {id: 'help', label: 'Help'},
        ]),
      [],
    );
    return (
      <>
        <Button label="Open Command Palette" onClick={() => setIsOpen(true)} />
        <CommandPalette
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          searchSource={source}
        />
      </>
    );
  },
};

// ─── Auto-grouping ────────────────────────────────────────────────────────────

/** Groups detected automatically from auxiliaryData.group. No custom rendering needed. */
export const AutoGrouped: Story = {
  render: function Render() {
    const [isOpen, setIsOpen] = useState(false);
    const source = useMemo(
      () =>
        createStaticSource([
          {id: 'home', label: 'Home', auxiliaryData: {group: 'Navigation'}},
          {
            id: 'settings',
            label: 'Settings',
            auxiliaryData: {group: 'Navigation'},
          },
          {
            id: 'profile',
            label: 'Profile',
            auxiliaryData: {group: 'Navigation'},
          },
          {
            id: 'new-file',
            label: 'New File',
            auxiliaryData: {group: 'Actions'},
          },
          {id: 'save', label: 'Save', auxiliaryData: {group: 'Actions'}},
          {id: 'export', label: 'Export', auxiliaryData: {group: 'Actions'}},
        ]),
      [],
    );
    return (
      <>
        <Button label="Open Grouped" onClick={() => setIsOpen(true)} />
        <CommandPalette
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          searchSource={source}
        />
      </>
    );
  },
};

// ─── Custom rendering via renderItem ─────────────────────────────────────────

type RichCommand = SearchableItem<{
  icon?: IconName;
  group?: string;
  shortcut?: string;
  keywords?: string[];
}>;

/**
 * Custom item content via renderItem — icons and shortcuts.
 * Grouping remains automatic via auxiliaryData.group.
 */
export const WithRenderItem: Story = {
  render: function Render() {
    const [isOpen, setIsOpen] = useState(false);
    const commands: RichCommand[] = [
      {
        id: 'dashboard',
        label: 'Go to Dashboard',
        auxiliaryData: {icon: 'menu', group: 'Navigation'},
      },
      {
        id: 'settings',
        label: 'Open Settings',
        auxiliaryData: {icon: 'wrench', group: 'Navigation', shortcut: '⌘,'},
      },
      {
        id: 'profile',
        label: 'View Profile',
        auxiliaryData: {icon: 'info', group: 'Navigation'},
      },
      {
        id: 'dark-mode',
        label: 'Toggle Dark Mode',
        auxiliaryData: {group: 'Actions', keywords: ['theme', 'appearance']},
      },
      {
        id: 'new-file',
        label: 'Create New File',
        auxiliaryData: {group: 'Actions', shortcut: '⌘N'},
      },
      {
        id: 'search',
        label: 'Search Files',
        auxiliaryData: {icon: 'search', group: 'Actions', shortcut: '⌘P'},
      },
    ];
    const source = useMemo(
      () =>
        createStaticSource(commands, {
          keywords: item => item.auxiliaryData?.keywords ?? [],
        }),
      [],
    );
    return (
      <>
        <Button label="Open Rich Palette" onClick={() => setIsOpen(true)} />
        <CommandPalette
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          searchSource={source}
          renderItem={(item: RichCommand) => (
            <span
              style={{display: 'flex', alignItems: 'center', gap: 8, flex: 1}}>
              {item.auxiliaryData?.icon && (
                <Icon icon={item.auxiliaryData.icon} size="sm" />
              )}
              <span style={{flex: 1}}>{item.label}</span>
              {item.auxiliaryData?.shortcut && (
                <span style={{fontSize: 12, opacity: 0.5}}>
                  {item.auxiliaryData.shortcut}
                </span>
              )}
            </span>
          )}
        />
      </>
    );
  },
};

// ─── Picker mode ─────────────────────────────────────────────────────────────

/** Selection persists across opens. isSelected passed to renderItem. */
export const Picker: Story = {
  render: function Render() {
    const [isOpen, setIsOpen] = useState(false);
    const [theme, setTheme] = useState('light');
    const source = useMemo(
      () =>
        createStaticSource([
          {id: 'light', label: 'Light'},
          {id: 'dark', label: 'Dark'},
          {id: 'system', label: 'System'},
        ]),
      [],
    );
    return (
      <>
        <Button label={`Theme: ${theme}`} onClick={() => setIsOpen(true)} />
        <CommandPalette
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          searchSource={source}
          value={theme}
          onValueChange={v => {
            setTheme(v);
            setIsOpen(false);
          }}
          renderItem={(item, isSelected) => (
            <span
              style={{display: 'flex', alignItems: 'center', gap: 8, flex: 1}}>
              <span style={{flex: 1}}>{item.label}</span>
              {isSelected && <Icon icon="check" size="sm" />}
            </span>
          )}
        />
      </>
    );
  },
};

// ─── Async search ─────────────────────────────────────────────────────────────

/** Server-side search. Spinner shown while pending. Empty state on no results. */
export const AsyncSearch: Story = {
  render: function Render() {
    const [isOpen, setIsOpen] = useState(false);
    const source = useMemo<SearchSource>(() => {
      let controller: AbortController | null = null;
      return {
        cancel() {
          controller?.abort();
        },
        async search(query: string) {
          controller?.abort();
          controller = new AbortController();
          await new Promise(r => setTimeout(r, 400));
          const all = [
            {id: 'readme', label: 'README.md'},
            {id: 'package', label: 'package.json'},
            {id: 'tsconfig', label: 'tsconfig.json'},
            {id: 'index', label: 'src/index.ts'},
            {id: 'app', label: 'src/App.tsx'},
          ];
          return all.filter(f =>
            f.label.toLowerCase().includes(query.toLowerCase()),
          );
        },
        bootstrap() {
          return [];
        },
      };
    }, []);
    return (
      <>
        <Button label="Open File Search" onClick={() => setIsOpen(true)} />
        <CommandPalette
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          searchSource={source}
          input={
            <CommandPaletteInput
              label="Search files"
              placeholder="Search files..."
            />
          }
          emptyBootstrapText="Type a filename to search"
          emptySearchText="No files found"
        />
      </>
    );
  },
};

// ─── Built-in strings ────────────────────────────────────────────────────────

/**
 * Nothing overridden, so every built-in string renders. `bootstrap()` returns
 * nothing so first open shows the bootstrap empty state, and the async
 * `search()` keeps the pending state observable.
 */
export const BuiltInStrings: Story = {
  render: function Render() {
    const [isOpen, setIsOpen] = useState(false);
    const source = useMemo<SearchSource>(() => {
      let controller: AbortController | null = null;
      return {
        cancel() {
          controller?.abort();
        },
        async search(query: string) {
          controller?.abort();
          controller = new AbortController();
          await new Promise(r => setTimeout(r, 600));
          const all = [
            {id: 'home', label: 'Home'},
            {id: 'settings', label: 'Settings'},
            {id: 'profile', label: 'Profile'},
          ];
          return all.filter(c =>
            c.label.toLowerCase().includes(query.toLowerCase()),
          );
        },
        bootstrap() {
          return [];
        },
      };
    }, []);
    return (
      <>
        <Button label="Open" onClick={() => setIsOpen(true)} />
        <CommandPalette
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          searchSource={source}
        />
      </>
    );
  },
};

// ─── Keywords ────────────────────────────────────────────────────────────────

/** Type "theme" or "appearance" to find "Toggle Dark Mode". */
export const WithKeywords: Story = {
  render: function Render() {
    const [isOpen, setIsOpen] = useState(false);
    const commands: SearchableItem<{aliases?: string[]}>[] = [
      {id: 'home', label: 'Home'},
      {
        id: 'dark-mode',
        label: 'Toggle Dark Mode',
        auxiliaryData: {aliases: ['theme', 'appearance']},
      },
      {
        id: 'font-size',
        label: 'Change Font Size',
        auxiliaryData: {aliases: ['text', 'zoom']},
      },
    ];
    const source = useMemo(
      () =>
        createStaticSource(commands, {
          keywords: item => item.auxiliaryData?.aliases ?? [],
        }),
      [],
    );
    return (
      <>
        <Button label="Open (try 'theme')" onClick={() => setIsOpen(true)} />
        <CommandPalette
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          searchSource={source}
        />
      </>
    );
  },
};

// ─── Many items (overflow / scroll test) ─────────────────────────────────────

/**
 * 50 items across 5 groups. Verifies the list scrolls within the dialog
 * rather than expanding it past maxHeight.
 */
export const ManyItems: Story = {
  render: function Render() {
    const [isOpen, setIsOpen] = useState(false);
    const groups = ['Files', 'Actions', 'Navigation', 'Settings', 'Recent'];
    const items = Array.from({length: 50}, (_, i) => ({
      id: `item-${i}`,
      label: `Item ${i + 1}`,
      auxiliaryData: {group: groups[i % groups.length]},
    }));
    const source = useMemo(() => createStaticSource(items), []);
    return (
      <>
        <Button label="Open (50 items)" onClick={() => setIsOpen(true)} />
        <CommandPalette
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          searchSource={source}
        />
      </>
    );
  },
};

// ─── Custom footer ────────────────────────────────────────────────────────────

/** Replacing the footer with custom content. */
export const CustomFooter: Story = {
  render: function Render() {
    const [isOpen, setIsOpen] = useState(false);
    const source = useMemo(
      () =>
        createStaticSource([
          {id: 'home', label: 'Home'},
          {id: 'settings', label: 'Settings'},
        ]),
      [],
    );
    return (
      <>
        <Button label="Open" onClick={() => setIsOpen(true)} />
        <CommandPalette
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          searchSource={source}
          footer={
            <CommandPaletteFooter>
              <span>Pro tip: use ⌘K to open anywhere</span>
            </CommandPaletteFooter>
          }
        />
      </>
    );
  },
};

// ─── Themed group heading ─────────────────────────────────────────────────────

/**
 * Theme the group heading precisely via `defineTheme`.
 *
 * `components['command-palette-group-heading'].base` scopes overrides to the
 * heading text only (via the `astryx-command-palette-group-heading` target),
 * instead of a fragile structural selector. The group root keeps its own
 * `astryx-command-palette-group` target.
 *
 * Defaults are unchanged; this story only demonstrates the override channel.
 */
const groupHeadingTheme = defineTheme({
  name: 'command-palette-group-heading-demo',
  components: {
    'command-palette-group-heading': {
      base: {
        fontWeight: 'var(--font-weight-bold)',
        color: 'var(--color-accent)',
        textTransform: 'uppercase',
      },
    },
  },
});

export const ThemedGroupHeading: Story = {
  render: () => (
    <Theme theme={groupHeadingTheme} mode="light">
      <CommandPaletteGroup heading="Suggestions">
        <div>Home</div>
        <div>Settings</div>
        <div>Profile</div>
      </CommandPaletteGroup>
    </Theme>
  ),
};

// ─── Audit matrix ─────────────────────────────────────────────────────────────

/**
 * Stable, always-rendered states for visual, accessibility, RTL, and responsive
 * verification. Inline mode keeps each palette in normal document flow while
 * preserving the same owned input, result, empty, pending, and footer anatomy.
 */
export const AuditMatrix: Story = {
  tags: ['visual-theme-matrix'],
  render: function Render() {
    // React entangles async transitions that are in flight together, so a
    // never-settling bootstrap started beside the other palettes' would keep
    // them busy too. Mount the pending palette only after the grouped and
    // empty results have rendered without a spinner, so only it is busy.
    const matrixRef = useRef<HTMLDivElement>(null);
    const [isPendingMountable, setIsPendingMountable] = useState(false);
    useEffect(() => {
      const matrix = matrixRef.current;
      if (matrix == null) {
        return;
      }
      const hasSettled = () =>
        matrix.querySelector('[role="option"]') != null &&
        matrix.querySelector('.astryx-spinner') == null;
      if (hasSettled()) {
        setIsPendingMountable(true);
        return;
      }
      const observer = new MutationObserver(() => {
        if (hasSettled()) {
          observer.disconnect();
          setIsPendingMountable(true);
        }
      });
      observer.observe(matrix, {childList: true, subtree: true});
      return () => observer.disconnect();
    }, []);
    const groupedSource = useMemo(
      () =>
        createStaticSource([
          {id: 'home', label: 'Home', auxiliaryData: {group: 'Navigation'}},
          {
            id: 'settings',
            label: 'Settings',
            auxiliaryData: {group: 'Navigation'},
          },
          {id: 'save', label: 'Save', auxiliaryData: {group: 'Actions'}},
          {id: 'export', label: 'Export', auxiliaryData: {group: 'Actions'}},
        ]),
      [],
    );
    const emptySource = useMemo(() => createStaticSource([]), []);
    const pendingSource = useMemo<SearchSource>(
      () => ({
        bootstrap: () => new Promise<SearchableItem[]>(() => {}),
        search: () => new Promise<SearchableItem[]>(() => {}),
      }),
      [],
    );
    const panelStyle = {
      flex: '1 1 280px',
      minWidth: 0,
    } as const;
    const headingStyle = {
      marginBlock: '0 8px',
      font: 'inherit',
      fontWeight: 600,
    } as const;

    return (
      <div
        ref={matrixRef}
        data-command-palette-audit-matrix
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          gap: 16,
          width: '100%',
          padding: 16,
          boxSizing: 'border-box',
        }}>
        <section style={panelStyle}>
          <h2 style={headingStyle}>Grouped results</h2>
          <CommandPalette
            isOpen
            isInline
            role="region"
            label="Grouped command palette"
            onOpenChange={() => {}}
            searchSource={groupedSource}
            value="settings"
            width="100%"
            maxHeight={420}
          />
        </section>
        <section style={panelStyle}>
          <h2 style={headingStyle}>Empty bootstrap</h2>
          <CommandPalette
            isOpen
            isInline
            role="region"
            label="Empty command palette"
            onOpenChange={() => {}}
            searchSource={emptySource}
            emptyBootstrapText={
              <span>
                No commands yet. <a href="#new-command">Create a command</a>
              </span>
            }
            emptySearchText={
              <span>
                No matching commands.{' '}
                <a href="#new-command">Create a command</a>
              </span>
            }
            width="100%"
            maxHeight={420}
          />
        </section>
        <section style={panelStyle}>
          <h2 style={headingStyle}>Pending bootstrap</h2>
          {isPendingMountable && (
            <CommandPalette
              isOpen
              isInline
              role="region"
              label="Pending command palette"
              onOpenChange={() => {}}
              searchSource={pendingSource}
              width="100%"
              maxHeight={420}
            />
          )}
        </section>
      </div>
    );
  },
};
