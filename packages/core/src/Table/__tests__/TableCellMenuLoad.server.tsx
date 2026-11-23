// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file TableCellMenuLoad.server.tsx
 * @input The fixture's Root
 * @output renderHtml, the fixture's server markup
 * @position Server entry of the TableCellMenuLoad fixture
 */
import {renderToString} from 'react-dom/server';
import {Root} from './TableCellMenuLoad.fixture';

export function renderHtml(): string {
  return renderToString(<Root />);
}
