// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/(MobileNav|SideNav|TopNav|AppShell)/|apps/storybook/stories/(MobileNav|AppShell)\.stories)

/**
 * @file MobileNavLandmark.a11y.chromium.spec.ts
 * @input Built MobileNav and AppShell stories, real Chromium, and its
 *   accessibility tree (CDP)
 * @output Evidence that the open drawer exposes exactly one navigation
 *   landmark, named like its dialog, holding the drawer's links, for SideNav
 *   items and for a TopNav's drawer content
 * @position Real-engine proof for component:MobileNav FR14; computed role and
 *   name need accessibility-tree evidence
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

interface AXNode {
  readonly nodeId: string;
  readonly parentId?: string;
  readonly role?: {readonly value?: string};
  readonly name?: {readonly value?: string};
  readonly ignored?: boolean;
}

/** The open dialog's navigation landmarks, from Chromium's own tree. */
async function drawerLandmarks(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  const {nodes} = (await cdp.send('Accessibility.getFullAXTree')) as {
    nodes: AXNode[];
  };
  const byId = new Map(nodes.map(node => [node.nodeId, node]));
  const dialog = nodes.find(
    node => !node.ignored && node.role?.value === 'dialog',
  );
  if (dialog == null) {
    throw new Error('No open dialog in the accessibility tree');
  }
  const insideDialog = (node: AXNode) => {
    for (
      let parent = node.parentId != null ? byId.get(node.parentId) : undefined;
      parent != null;
      parent = parent.parentId != null ? byId.get(parent.parentId) : undefined
    ) {
      if (parent.nodeId === dialog.nodeId) {
        return true;
      }
    }
    return false;
  };
  const landmarks = nodes.filter(
    node =>
      !node.ignored && node.role?.value === 'navigation' && insideDialog(node),
  );
  const linksIn = (landmark: AXNode) =>
    nodes.filter(node => {
      if (node.ignored || node.role?.value !== 'link') {
        return false;
      }
      for (
        let parent =
          node.parentId != null ? byId.get(node.parentId) : undefined;
        parent != null;
        parent = parent.parentId != null ? byId.get(parent.parentId) : undefined
      ) {
        if (parent.nodeId === landmark.nodeId) {
          return true;
        }
      }
      return false;
    }).length;
  return {
    dialogName: dialog.name?.value ?? '',
    landmarks: landmarks.map(node => ({
      name: node.name?.value ?? '',
      links: linksIn(node),
    })),
  };
}

test.describe('MobileNav navigation landmark (Chromium)', () => {
  test('a drawer of SideNav items exposes one navigation landmark named like the dialog', async ({
    page,
  }) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-mobilenav--with-side-nav-children&viewMode=story`,
    );
    await page.getByRole('button', {name: 'Open Drawer'}).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const {dialogName, landmarks} = await drawerLandmarks(page);
    expect(dialogName).toBe('My App');
    expect(landmarks).toHaveLength(1);
    expect(landmarks[0].name).toBe(dialogName);
    expect(landmarks[0].links).toBeGreaterThan(0);
  });

  test("SideNav's drawer mode in an AppShell on a phone exposes one navigation landmark named like the dialog", async ({
    page,
  }) => {
    await page.setViewportSize({width: 390, height: 844});
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-appshell--side-nav-only&viewMode=story`,
    );
    await page
      .getByRole('button', {name: /navigation|menu/i})
      .first()
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const {dialogName, landmarks} = await drawerLandmarks(page);
    expect(landmarks).toHaveLength(1);
    expect(landmarks[0].name).toBe(dialogName);
    expect(landmarks[0].links).toBeGreaterThan(0);
  });

  test("a TopNav's drawer content on a phone sits inside one navigation landmark named like the dialog", async ({
    page,
  }) => {
    await page.setViewportSize({width: 390, height: 844});
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-appshell--top-nav-with-side-nav&viewMode=story`,
    );
    await page
      .getByRole('button', {name: /navigation|menu/i})
      .first()
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const {dialogName, landmarks} = await drawerLandmarks(page);
    expect(landmarks).toHaveLength(1);
    expect(landmarks[0].name).toBe(dialogName);
    expect(landmarks[0].links).toBeGreaterThan(0);
  });
});
