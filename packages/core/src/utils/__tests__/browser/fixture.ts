// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file fixture.ts
 * @input Nothing: bundled by esbuild and injected into a blank page
 * @output The resolver's answers on `window.__answers` (hooks after
 *   hydration, the one-moment read, the engine facts), and two styled probes:
 *   one under the touch query, one under the iOS gate written as core writes
 *   it (the media query outside, the supports query inside)
 * @position Browser fixture of touchPresentation.browser.spec.ts; test-only
 */

import {createElement, useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {
  IOS_SUPPORTS_QUERY,
  IOS_TOUCH_STYLE_KEYS,
  TOUCH_QUERY,
  readTouchPresentation,
  useTouchPresentation,
} from '../../touchPresentation';

declare global {
  interface Window {
    __answers: Record<string, unknown> | null;
  }
}

window.__answers = null;

const style = document.createElement('style');
style.textContent = `
  #touch, #gate { color: rgb(0, 0, 255); }
  ${IOS_TOUCH_STYLE_KEYS[0]} { #touch { color: rgb(255, 0, 0); } }
  ${IOS_TOUCH_STYLE_KEYS[0]} { ${IOS_TOUCH_STYLE_KEYS[1]} { #gate { color: rgb(255, 0, 0); } } }
`;
document.head.append(style);

function Probe() {
  const presentation = useTouchPresentation();
  useEffect(() => {
    window.__answers = {
      presentation,
      read: readTouchPresentation(),
      touchCallout: CSS.supports(IOS_SUPPORTS_QUERY),
      coarse: matchMedia(TOUCH_QUERY).matches,
    };
  });
  return createElement(
    'div',
    null,
    createElement('p', {id: 'touch'}, 'touch'),
    createElement('p', {id: 'gate'}, 'iOS gate'),
  );
}

const root = document.createElement('div');
document.body.append(root);
createRoot(root).render(createElement(Probe));
