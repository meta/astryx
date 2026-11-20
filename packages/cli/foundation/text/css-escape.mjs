// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CSS escapes read as the characters they stand for.
 * @input text from a stylesheet or a CSS value, such as a font family name
 * @output the same text with every escape replaced
 * @position shared by the font checks of the theme build and the editor
 */

/**
 * Text with its CSS escapes read as CSS reads them: `\` and one to six hex
 * digits (and one white space after them) is that code point, `\` before a
 * line break joins the lines, and `\` before any other character is that
 * character (`Gill\ Sans` is `Gill Sans`, `\5FAE\8F6F` is `微软`).
 * @param {string} text
 * @returns {string}
 */
export function cssUnescape(text) {
  return String(text).replace(
    /\\(?:([0-9a-fA-F]{1,6})(?:\r\n|[ \t\n\r\f])?|(\r\n|[\n\r\f])|([\s\S])|$)/g,
    (_, hex, lineBreak, char) => {
      if (hex) {
        const code = parseInt(hex, 16);
        return code === 0 ||
          code > 0x10ffff ||
          (code >= 0xd800 && code <= 0xdfff)
          ? '\uFFFD'
          : String.fromCodePoint(code);
      }
      if (lineBreak) return '';
      if (char !== undefined) return char;
      return '\uFFFD';
    },
  );
}
