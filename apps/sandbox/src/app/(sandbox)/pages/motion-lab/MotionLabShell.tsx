// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file MotionLabShell.tsx
 * @input Motion Lab store, control rail, section registry
 * @output The scope element, the lab's own nav panel, and the control rail
 * @position Motion Lab chrome; used by the section layout
 *
 * Two jobs.
 *
 * The scope element is where the tuned custom properties land. Keeping them
 * here rather than on `:root` means the lab can retune `--ease-standard` to
 * argue about it without the sandbox's own chrome starting to move differently.
 *
 * The nav panel is here because the sandbox frames a tool as one entry in its
 * catalog — there is no per-tool rail to hang fifteen pages off, so without one
 * every page is a dead end. A start panel is the house pattern for it
 * (`LayoutPanelNavigation`), and it groups the pages the way the registry does,
 * which is the order they are meant to be read in.
 */

import {usePathname} from '../../../../router';
import {useEffect, useRef, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  Layout,
  LayoutContent,
  LayoutPanel,
  VStack,
} from '@astryxdesign/core/Layout';
import {Collapsible} from '@astryxdesign/core/Collapsible';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {List, ListItem} from '@astryxdesign/core/List';
import {Text} from '@astryxdesign/core/Text';
import {useMotionLab} from './MotionLabStore';
import {MotionControlRail} from './MotionControlRail';
import {MOTION_SECTIONS} from './sections';
import styles from './MotionLab.module.css';

const sx = stylex.create({
  scope: {width: '100%'},
  panel: {
    // The panel scrolls independently: fifteen items plus their group headings
    // outrun a short viewport, and the page beside it is long.
    height: '100%',
    overflowY: 'auto',
  },
  groupLabel: {
    paddingInlineStart: '10px',
    paddingBlockStart: '10px',
    paddingBlockEnd: '2px',
  },
  firstGroupLabel: {
    paddingBlockStart: '2px',
  },
  narrowNav: {
    paddingInline: '12px',
    borderBlockEndWidth: '1px',
    borderBlockEndStyle: 'solid',
    borderBlockEndColor: 'var(--color-border)',
  },
});

/**
 * Below this width the 228px page panel would leave the lab's cards a
 * column too narrow to read, so the pages fold into a collapsible list above
 * the content instead.
 */
const NARROW_QUERY = '(max-width: 719px)';

/**
 * Hrefs stay unprefixed: SandboxLink applies the Vite base path once in the
 * LinkProvider, and usePathname() returns the path within that base path.
 * A second prefix here would break navigation on the staged /sandbox/ build.
 */

/** The export sets `trailingSlash: true`, so normalise before comparing. */
function isCurrent(pathname: string, href: string): boolean {
  const a = pathname.endsWith('/') ? pathname : `${pathname}/`;
  const b = href.endsWith('/') ? href : `${href}/`;
  return a === b;
}

function LabNav() {
  const pathname = usePathname();
  const groups = [...new Set(MOTION_SECTIONS.map(s => s.group))];

  return (
    <nav aria-label="Motion Lab pages" {...stylex.props(sx.panel)}>
      {groups.map((group, i) => (
        <div key={group}>
          <Text
            type="supporting"
            color="secondary"
            weight="semibold"
            {...stylex.props(sx.groupLabel, i === 0 && sx.firstGroupLabel)}>
            {group}
          </Text>
          <List density="compact">
            {MOTION_SECTIONS.filter(s => s.group === group).map(section => (
              <ListItem
                key={section.href}
                label={section.title}
                href={section.href}
                isSelected={isCurrent(pathname, section.href)}
              />
            ))}
          </List>
        </div>
      ))}
    </nav>
  );
}

export function MotionLabShell({children}: {children: ReactNode}) {
  const {registerScope, reducedMotion} = useMotionLab();
  const ref = useRef<HTMLDivElement | null>(null);
  const isNarrow = useMediaQuery(NARROW_QUERY);
  // The shell outlives a page change; keying the folded list by page closes
  // it after a pick, so the chosen page starts on screen.
  const pathname = usePathname();

  useEffect(() => {
    registerScope(ref.current);
    return () => registerScope(null);
  }, [registerScope]);

  return (
    <div
      ref={ref}
      className={styles.scope}
      data-reduced-motion={reducedMotion}
      {...stylex.props(sx.scope)}>
      <Layout
        height="fill"
        start={
          isNarrow ? undefined : (
            <LayoutPanel hasDivider width={228} padding={0} role="navigation">
              <LabNav />
            </LayoutPanel>
          )
        }
        content={
          <LayoutContent padding={0}>
            <VStack gap={0}>
              {isNarrow && (
                <div {...stylex.props(sx.narrowNav)}>
                  <Collapsible
                    key={pathname}
                    trigger="Motion Lab pages"
                    defaultIsOpen={false}>
                    <LabNav />
                  </Collapsible>
                </div>
              )}
              <MotionControlRail />
              {children}
            </VStack>
          </LayoutContent>
        }
      />
    </div>
  );
}
