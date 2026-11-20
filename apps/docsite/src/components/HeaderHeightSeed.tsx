// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file HeaderHeightSeed.tsx
 * @input The AppShell header that contains it, banner included
 * @output --appshell-header-height set to that header's height while the page
 *   parses, before the first paint
 * @position Docsite shells; render it in AppShell's topNav slot, after the nav
 */

// The browser can scroll before hydration: to a restored position, or to the
// fragment of an opened link. Each offset that reads the variable must then
// already include the banner. The script measures again when the fonts are
// ready. CSSOM leaves React's DOM unchanged. After hydration, the header
// observer's inline value takes over.
const seedScript = `(() => {
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

export function HeaderHeightSeed() {
  return (
    <>
      {/* Parser-blocking measurement precedes the page content, including
          when the response is streamed. Stylesheets above it are loaded. */}
      <style />
      <script dangerouslySetInnerHTML={{__html: seedScript}} />
    </>
  );
}
