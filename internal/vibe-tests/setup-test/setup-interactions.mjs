// Copyright (c) Meta Platforms, Inc. and affiliates.

/** Open a declared interaction without relying on text, position, or pointer-only focus. */

export const markerSelector = marker =>
  `[data-vibe-${marker.source === 'result' ? 'result' : 'probe'}="${marker.marker ?? marker.name}"]`;
export const probeSelector = name => markerSelector({name, source: 'probe'});

async function requireUnique(page, marker) {
  const locator = page.locator(markerSelector(marker));
  const count = await locator.count();
  if (count !== 1) {
    throw new Error(
      `interaction marker ${marker.name} matched ${count} elements; expected exactly one`,
    );
  }
  return locator;
}

async function reachByKeyboard(page, marker, maxTabs = 50) {
  const locator = await requireUnique(page, marker);
  for (let index = 0; index <= maxTabs; index += 1) {
    const reached = await locator.evaluate(element => {
      const active = element.ownerDocument.activeElement;
      return active === element || (active != null && element.contains(active));
    });
    if (reached) return true;
    await page.keyboard.press('Tab');
  }
  return false;
}

export async function openInteractionState(page, interaction) {
  if (!interaction) {
    return {opened: false, keyboardReached: {}};
  }

  const keyboardReached = {};
  for (const rawStep of interaction.open) {
    const step =
      typeof rawStep === 'string'
        ? {name: rawStep, source: 'probe', method: 'click'}
        : rawStep;
    const locator = await requireUnique(page, step);
    if (step.method === 'click') {
      await locator.click();
      continue;
    }
    if (
      step.method !== 'keyboard-focus' &&
      step.method !== 'keyboard-activate'
    ) {
      throw new Error(`unknown interaction method ${step.method}`);
    }
    const reached = await reachByKeyboard(page, step);
    keyboardReached[step.name] = reached;
    if (!reached) {
      throw new Error(
        `interaction marker ${step.name} is not keyboard reachable`,
      );
    }
    if (step.method === 'keyboard-activate') {
      await page.keyboard.press(step.key ?? 'Enter');
    }
  }

  for (const surface of interaction.surfaces) {
    const locator = await requireUnique(page, surface);
    await locator.waitFor({state: 'visible', timeout: 3000});
    await locator.evaluate(async element => {
      let topLayer = element;
      try {
        topLayer = element.closest(':modal, :popover-open') ?? element;
      } catch {}
      const finiteAnimations = topLayer.getAnimations().filter(animation => {
        const endTime = animation.effect?.getComputedTiming().endTime;
        return typeof endTime === 'number' && Number.isFinite(endTime);
      });
      await Promise.allSettled(
        finiteAnimations.map(animation => animation.finished),
      );
    });
  }
  return {opened: true, keyboardReached};
}
