// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file TableCellMenuLoad.client.tsx
 * @input The fixture's Root and the server-rendered markup in #root
 * @output Hydrates the markup and records recoverable hydration errors
 * @position Browser entry of the TableCellMenuLoad fixture
 */
import {hydrateRoot} from 'react-dom/client';
import {Root} from './TableCellMenuLoad.fixture';

const state = window as unknown as {__recoverable: string[]};
state.__recoverable = [];
hydrateRoot(document.getElementById('root') as HTMLElement, <Root />, {
  onRecoverableError: error => state.__recoverable.push(String(error)),
});
