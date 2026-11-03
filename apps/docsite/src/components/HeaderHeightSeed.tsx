// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file HeaderHeightSeed.tsx
 * @input The AppShell header it renders in, after the page's stylesheets
 * @output `--appshell-header-height`, measured while the page parses
 * @position Docsite-only first-paint header measurement for the docs and blog
 *   shells
 */

// Seeds the whole header's height, banner included, while the page parses.
// The browser scrolls to a link's fragment and restores a scroll position
// before React runs. The offsets that read this variable must hold by then.
// It measures again once fonts settle. CSSOM leaves React's DOM unchanged;
// SharedTopNav's observer takes over after hydration.
const initialHeaderHeightScript = `(() => {
  const script = document.currentScript;
  const header = script?.closest('.astryx-app-shell-header');
  const style = script?.previousElementSibling;
  const sheet = style?.sheet;
  const publish = () => {
    if (!header?.isConnected || !style?.isConnected || !sheet) return;
    if (sheet.cssRules.length === 0) sheet.insertRule(':root {}');
    sheet.cssRules[0].style.setProperty('--appshell-header-height',
      header.getBoundingClientRect().height + 'px');
  };
  publish();
  document.fonts.ready.then(publish);
})();`;

/** Render inside an AppShell header, after everything that sets its height. */
export function HeaderHeightSeed() {
  return (
    <>
      <style />
      <script dangerouslySetInnerHTML={{__html: initialHeaderHeightScript}} />
    </>
  );
}
