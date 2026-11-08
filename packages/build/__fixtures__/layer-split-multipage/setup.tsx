// Copyright (c) Meta Platforms, Inc. and affiliates.

import {createRoot} from 'react-dom/client';
import './setup.css';
import {Theme} from '@astryxdesign/core/theme';
import {App} from '../layer-split/App';
import {fixtureTheme} from '../layer-split/theme';

createRoot(document.getElementById('root')!).render(
  <Theme theme={fixtureTheme} mode="light">
    <App />
  </Theme>,
);
