// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @input Static header content: title, subtitle, a no-op close handler, and a divider
 * @output The DrawerHeader row at the top of a square-cornered, drawer-width panel, visible without opening an overlay
 * @position DrawerHeader's docsite showcase. Drawer has no inline mode
 *   like Dialog's isInline, so a plain panel stands in for the drawer; in an
 *   app, compose DrawerHeader in a Layout header slot inside a Drawer.
 */

import * as stylex from '@stylexjs/stylex';
import {DrawerHeader} from '@astryxdesign/core/Drawer';
import {
  Layout,
  LayoutContent,
  overlayPaddingReset,
} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {
  borderVars,
  colorVars,
  spacingVars,
} from '@astryxdesign/core/theme/tokens.stylex';

const styles = stylex.create({
  // A card-like panel with square corners, matching the drawer's own corners.
  panel: {
    width: 360,
    maxWidth: '100%',
    boxSizing: 'border-box',
    backgroundColor: colorVars['--color-background-card'],
    borderWidth: borderVars['--border-width'],
    borderStyle: 'solid',
    borderColor: colorVars['--color-border'],
    borderRadius: 0,
  },
  body: {
    padding: spacingVars['--spacing-4'],
    backgroundColor: colorVars['--color-background-muted'],
    borderRadius: 0,
  },
});

export default function DrawerHeaderShowcase() {
  return (
    // Like the Drawer root, the panel is a padding boundary, so the Layout
    // regions inset by their own --spacing-4 default: the drawer's inset.
    <div {...stylex.props(styles.panel, overlayPaddingReset.reset)}>
      <Layout
        height="auto"
        header={
          <DrawerHeader
            title="Host details"
            subtitle="web-prod-04"
            onOpenChange={() => {}}
            hasDivider
          />
        }
        content={
          <LayoutContent>
            <div {...stylex.props(styles.body)}>
              <Text type="body" color="secondary">
                Drawer body content goes here.
              </Text>
            </div>
          </LayoutContent>
        }
      />
    </div>
  );
}
