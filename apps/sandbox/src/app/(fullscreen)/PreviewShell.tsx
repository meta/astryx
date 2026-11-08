// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState, useCallback, useEffect, useMemo, useRef} from 'react';
import {usePathname, useRouter, basePath} from '../../router';
import {Text} from '@astryxdesign/core/Text';
import {DropdownMenu} from '@astryxdesign/core/DropdownMenu';
import {Button} from '@astryxdesign/core/Button';
import {CodeBlock} from '@astryxdesign/core/CodeBlock';
import {CommandPalette} from '@astryxdesign/core/CommandPalette';
import {createStaticSource} from '@astryxdesign/core/Typeahead';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {TreeList} from '@astryxdesign/core/TreeList';
import type {TreeListItemData} from '@astryxdesign/core/TreeList';
import {categories} from '../sandboxPages';
import {useThemeControls, SANDBOX_THEMES} from '../providers';
import {sourceRegistry} from '../../generated/sourceRegistry';
import {templates} from '../../generated/templateRegistry';
import {blocks} from '../../generated/blockRegistry';

const blocksByHref = new Map(blocks.map(b => [b.href.replace(/\/$/, ''), b]));

function buildNavTree(currentPath: string): TreeListItemData[] {
  const norm = currentPath.replace(/\/$/, '');

  const pageItems: TreeListItemData[] = templates.map(t => ({
    id: t.href,
    label: t.name,
    href: t.href,
    isSelected: t.href.replace(/\/$/, '') === norm,
  }));

  const componentMap = new Map<string, TreeListItemData[]>();
  for (const b of blocks) {
    const group = b.component;
    let items = componentMap.get(group);
    if (items == null) {
      items = [];
      componentMap.set(group, items);
    }
    const shortName = b.name.includes('—')
      ? b.name.split('—').slice(1).join('—').trim()
      : b.name;
    items.push({
      id: b.href,
      label: shortName,
      href: b.href,
      isSelected: b.href.replace(/\/$/, '') === norm,
    });
  }

  const componentItems: TreeListItemData[] = [...componentMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, items]) => ({
      id: `component-${name}`,
      label: name,
      children: items,
      isExpanded: items.some(i => i.isSelected),
    }));

  return [
    {
      id: 'pages',
      label: 'Pages',
      children: pageItems,
      isExpanded: true,
    },
    {
      id: 'components',
      label: 'Components',
      children: componentItems,
      isExpanded: true,
    },
  ];
}

function EyeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function CodeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}>
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

function CopyIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function DesktopIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}>
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

function TabletIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}>
      <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
      <line x1="12" y1="18" x2="12.01" y2="18" />
    </svg>
  );
}

function PhoneIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}>
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
      <line x1="12" y1="18" x2="12.01" y2="18" />
    </svg>
  );
}

function SunIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}>
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function SidebarIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  );
}

function ChevronDownIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

type ViewportSize = 'desktop' | 'tablet' | 'mobile';
const viewportWidths: Record<ViewportSize, string> = {
  desktop: '100%',
  tablet: '768px',
  mobile: '375px',
};

export function PreviewShell({
  children,
  forceEmbed = false,
}: {
  children: React.ReactNode;
  forceEmbed?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = new URLSearchParams(
    typeof window !== 'undefined' ? window.location.search : '',
  );
  const isEmbed = forceEmbed || searchParams.get('embed') === '1';
  if (isEmbed) {
    // Embedded template previews need a full-height chain so page roots sized
    // with min-height:100% (e.g. centered login pages) fill the frame instead of
    // collapsing to content height. The chain is html → body → Theme wrapper
    // ([data-astryx-theme]) → template root. Rendered inline (not in the layout
    // <head>) so it applies reliably in the embed context.
    return (
      <>
        <style>{`html,body,#root,#root>[data-astryx-theme]{height:100%}`}</style>
        {children}
      </>
    );
  }
  const [view, setView] = useState<'preview' | 'code'>('preview');
  const [viewport, setViewport] = useState<ViewportSize>('desktop');
  const [copied, setCopied] = useState(false);
  const {themeName, setThemeName, mode, setMode} = useThemeControls();
  const [toolbarHidden, setToolbarHidden] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Iframe src includes current theme/mode so the embedded page renders correctly
  // on initial load. Only recomputes when pathname changes — theme/mode changes
  // are synced to the iframe via postMessage to avoid triggering a reload.
  const iframeSrc = useMemo(
    () =>
      `${basePath}${pathname.endsWith('/') ? pathname : `${pathname}/`}embed.html?embed=1&theme=${themeName}&mode=${mode}`,
    [pathname], // intentionally excludes themeName/mode — live updates use postMessage
  );

  // Broadcast theme/mode changes to the embedded iframe via postMessage
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) {
      return;
    }
    // The iframe is loaded from a relative src, so its origin is our own —
    // address it explicitly (and the receiver checks the sender's origin too).
    iframe.contentWindow.postMessage(
      {type: 'astryx-theme-sync', theme: themeName, mode},
      window.location.origin,
    );
  }, [themeName, mode]);

  const navTree = useMemo(() => buildNavTree(pathname), [pathname]);

  const blockEntry = useMemo(
    () => blocksByHref.get(pathname.replace(/\/$/, '')) ?? null,
    [pathname],
  );
  const isBlock = blockEntry != null;

  useEffect(() => {
    const saved = localStorage.getItem('sandbox-toolbar-hidden');
    if (saved === 'true') {
      setToolbarHidden(true);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('sandbox-toolbar-hidden', String(toolbarHidden));
  }, [toolbarHidden]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === '\\') {
        e.preventDefault();
        setToolbarHidden(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Find current page name from the registry
  const currentPage = useMemo(() => {
    for (const cat of categories) {
      for (const page of cat.pages) {
        const normalizedHref = page.href.replace(/\/$/, '');
        const normalizedPath = pathname.replace(/\/$/, '');
        if (normalizedHref === normalizedPath) {
          return {page, category: cat.label};
        }
      }
    }
    return null;
  }, [pathname]);

  const pageName =
    currentPage?.page.name ??
    (() => {
      const segments = pathname.replace(/\/$/, '').split('/');
      return (
        segments[segments.length - 1]
          ?.replace(/-/g, ' ')
          .replace(/\b\w/g, c => c.toUpperCase()) ?? 'Preview'
      );
    })();

  const [paletteOpen, setPaletteOpen] = useState(false);

  // Build searchable items for the command palette
  const searchSource = useMemo(() => {
    const items = categories.flatMap(cat =>
      cat.pages.map(page => ({
        id: page.href,
        label: page.name,
        auxiliaryData: {group: cat.label, description: page.description},
      })),
    );
    return createStaticSource(items);
  }, []);

  const resolvedSource =
    sourceRegistry[pathname] ??
    sourceRegistry[pathname.replace(/\/$/, '') + '/'] ??
    null;

  const handleViewChange = useCallback((v: string) => {
    setView(v as 'preview' | 'code');
  }, []);

  const handleCopy = useCallback(async () => {
    if (!resolvedSource) {
      return;
    }
    await navigator.clipboard.writeText(resolvedSource);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [resolvedSource]);

  return (
    <div
      data-preview-shell
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'visible',
      }}>
      {/* Toolbar */}
      <div
        style={{
          display: toolbarHidden ? 'none' : 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 12px',
          borderBottom: '1px solid var(--color-border-emphasized)',
          backgroundColor: 'var(--color-background-surface)',
          flexShrink: 0,
          zIndex: 1000,
          position: 'relative',
          overflow: 'visible',
        }}>
        <Button
          variant="ghost"
          size="sm"
          label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          icon={<SidebarIcon width={14} height={14} />}
          onClick={() => setSidebarOpen(prev => !prev)}
          isIconOnly
        />
        <div style={{flex: 1, minWidth: 0}}>
          <button
            onClick={() => setPaletteOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 8px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              color: 'inherit',
            }}>
            {pageName}
            <ChevronDownIcon width={14} height={14} style={{opacity: 0.5}} />
          </button>
        </div>

        <CommandPalette
          isOpen={paletteOpen}
          onOpenChange={setPaletteOpen}
          searchSource={searchSource}
          label="Navigate to page"
          onValueChange={value => {
            router.push(value);
            setPaletteOpen(false);
          }}
          width={480}
          renderItem={(item, isSelected) => (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                padding: '2px 0',
                fontWeight: isSelected ? 600 : 400,
              }}>
              <span>{item.label}</span>
              {(item.auxiliaryData as {description?: string})?.description && (
                <span style={{fontSize: 12, opacity: 0.6}}>
                  {(item.auxiliaryData as {description?: string}).description}
                </span>
              )}
            </div>
          )}
        />

        <SegmentedControl
          value={view}
          onChange={handleViewChange}
          label="Toggle preview or code view"
          size="sm">
          <SegmentedControlItem
            value="preview"
            label="Preview"
            isLabelHidden
            icon={<EyeIcon width={14} height={14} />}
          />
          <SegmentedControlItem
            value="code"
            label="Code"
            isLabelHidden
            icon={<CodeIcon width={14} height={14} />}
          />
        </SegmentedControl>

        {view === 'preview' && !isBlock && (
          <SegmentedControl
            value={viewport}
            onChange={v => setViewport(v as ViewportSize)}
            label="Viewport size"
            size="sm">
            <SegmentedControlItem
              value="desktop"
              label="Desktop"
              isLabelHidden
              icon={<DesktopIcon width={14} height={14} />}
            />
            <SegmentedControlItem
              value="tablet"
              label="Tablet"
              isLabelHidden
              icon={<TabletIcon width={14} height={14} />}
            />
            <SegmentedControlItem
              value="mobile"
              label="Mobile"
              isLabelHidden
              icon={<PhoneIcon width={14} height={14} />}
            />
          </SegmentedControl>
        )}

        <DropdownMenu
          button={{
            label:
              SANDBOX_THEMES.find(t => t.id === themeName)?.label ?? themeName,
            variant: 'ghost',
            size: 'sm',
          }}
          hasChevron
          items={SANDBOX_THEMES.map(({id, label}) => ({
            label,
            onClick: () => setThemeName(id),
          }))}
        />
        <Button
          variant="ghost"
          size="sm"
          label={mode === 'light' ? 'Light mode' : 'Dark mode'}
          icon={
            mode === 'light' ? (
              <SunIcon width={14} height={14} />
            ) : (
              <MoonIcon width={14} height={14} />
            )
          }
          onClick={() => setMode(mode === 'light' ? 'dark' : 'light')}
          isIconOnly
        />
        <Button
          variant="ghost"
          size="sm"
          label={copied ? 'Copied' : 'Copy source'}
          icon={
            copied ? (
              <CheckIcon width={14} height={14} />
            ) : (
              <CopyIcon width={14} height={14} />
            )
          }
          onClick={handleCopy}
          isIconOnly
        />
      </div>
      {/* Body: sidebar + content */}
      <div style={{display: 'flex', flex: 1, overflow: 'hidden'}}>
        {/* Sidebar */}
        {sidebarOpen && (
          <div
            style={{
              width: 260,
              flexShrink: 0,
              borderRight: '1px solid var(--color-border-emphasized)',
              backgroundColor: 'var(--color-background-surface)',
              overflowY: 'auto',
              padding: '8px 0',
            }}>
            <TreeList items={navTree} density="compact" />
          </div>
        )}

        {/* Content */}
        {view === 'preview' ? (
          isBlock ? (
            children
          ) : viewport === 'desktop' ? (
            <div
              style={{
                flex: 1,
                overflow: 'hidden',
              }}>
              <iframe
                ref={iframeRef}
                src={iframeSrc}
                sandbox="allow-scripts allow-same-origin"
                title={`${pageName} — ${viewport}`}
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                }}
              />
            </div>
          ) : (
            <div
              style={{
                flex: 1,
                overflow: 'auto',
                display: 'flex',
                justifyContent: 'center',
                padding: '24px 16px',
                backgroundColor: '#f0f0f0',
              }}>
              <iframe
                ref={iframeRef}
                src={iframeSrc}
                sandbox="allow-scripts allow-same-origin"
                title={`${pageName} — ${viewport}`}
                style={{
                  width: viewportWidths[viewport],
                  maxWidth: '100%',
                  height: '100%',
                  border: '1px solid var(--color-border-emphasized)',
                  borderRadius: 8,
                  backgroundColor: '#fff',
                }}
              />
            </div>
          )
        ) : (
          <div style={{flex: 1, overflow: 'auto'}}>
            {resolvedSource ? (
              <CodeBlock
                code={resolvedSource}
                language="tsx"
                hasLineNumbers
                hasCopyButton
              />
            ) : (
              <div
                style={{
                  padding: 24,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <Text type="body" color="secondary">
                  Source not available
                </Text>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
