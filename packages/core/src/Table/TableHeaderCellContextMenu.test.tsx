// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TableHeaderCellContextMenu.test.tsx
 * @output Tests that loading a header cell's context menu leaves the cell's
 *   content in place
 * @position Validates the lazy boundary in TableCellContextMenu for
 *   TableHeaderCell; its own file so the menu starts unloaded
 */

import {describe, it, beforeEach} from 'vitest';
import {Table} from './Table';
import {TableHeader} from './TableHeader';
import {TableRow} from './TableRow';
import {TableHeaderCell} from './TableHeaderCell';
import {
  StatefulContent,
  expectContentSurvivesMenuLoad,
  mockPopover,
  scenarioActions,
} from './__tests__/menuLoadScenario';

beforeEach(mockPopover);

describe('TableHeaderCell context menu loading', () => {
  it('holds a Shift+F10 sent before the menu loads, opens the menu, and keeps the focused header control’s node and state', async () => {
    await expectContentSurvivesMenuLoad(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHeaderCell contextMenuActions={scenarioActions}>
              <StatefulContent />
            </TableHeaderCell>
          </TableRow>
        </TableHeader>
      </Table>,
      'button',
      'before-load',
    );
  });
});
