//! Port of `api/theme/palette/generate/preview.mjs`.

use super::generate::Candidate;

pub const PALETTE_PREVIEW_VERSION: &str = "palette-preview-v1";

fn esc(v: &str) -> String {
    v.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;").replace('\'', "&#039;")
}

fn render_ramp(family_id: &str, family_name: &str, mode: &str, colors: &[(String, String)]) -> String {
    let swatches: String = colors
        .iter()
        .map(|(stop, color)| {
            format!(
                "\n        <li class=\"swatch\" title=\"{}\">\n          <span class=\"color\" style=\"--swatch:{}\"></span>\n          <span class=\"meta\"><strong>{}</strong><code>{}</code></span>\n        </li>",
                esc(&format!("{family_id}.{mode}[{stop}] \u{2014} {color}")),
                esc(color),
                esc(stop),
                esc(color)
            )
        })
        .collect();
    format!(
        "\n      <section class=\"family\">\n        <h3>{}</h3>\n        <ol class=\"ramp\" style=\"--stop-count:{}\">{}\n        </ol>\n      </section>",
        esc(family_name),
        colors.len(),
        swatches
    )
}

fn render_mode(candidate: &Candidate, mode: &str) -> String {
    let families: String = candidate
        .palette
        .iter()
        .map(|f| match f.ramp(mode) {
            Some(colors) => render_ramp(&f.id, &f.name, mode, &f.sorted(colors)),
            None => String::new(),
        })
        .collect();
    if families.is_empty() {
        return String::new();
    }
    format!(
        "\n    <article class=\"mode {mode}\">\n      <header class=\"mode-title\">\n        <h2>{}</h2>\n      </header>{families}\n    </article>",
        if mode == "light" { "Light mode" } else { "Dark mode" }
    )
}

fn render_theme_values(c: &Candidate) -> String {
    format!(
        "\n      <section class=\"theme-values\">\n        <div>\n          <h2>Exact theme values</h2>\n          <p>Always available. Default families repeat these values at stops 0 and 100; custom layouts may omit them.</p>\n        </div>\n        <ol>\n          <li><span class=\"color\" style=\"--swatch:{b}\"></span><span class=\"meta\"><strong>Black</strong><code>{b}</code></span></li>\n          <li><span class=\"color\" style=\"--swatch:{w}\"></span><span class=\"meta\"><strong>White</strong><code>{w}</code></span></li>\n        </ol>\n      </section>",
        b = esc(&c.black),
        w = esc(&c.white)
    )
}

pub fn render_palette_preview(c: &Candidate) -> String {
    let modes: String = ["light", "dark"].iter().map(|m| render_mode(c, m)).collect();
    let v = PALETTE_PREVIEW_VERSION;
    format!(
        r#"<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="generator" content="{v}" />
    <title>Astryx palette candidate</title>
    <style>
      :root {{ color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #111; }}
      * {{ box-sizing: border-box; }}
      body {{ margin: 0; background: #111; color: #f5f5f5; }}
      main {{ max-width: 1600px; margin: 0 auto; padding: 40px; }}
      h1, h2, h3, p {{ margin: 0; }}
      h1 {{ font-size: 30px; letter-spacing: -0.03em; }}
      .intro {{ margin: 8px 0 28px; color: #aaa; font-size: 15px; }}
      .theme-values {{ display: flex; align-items: center; justify-content: space-between; gap: 32px; margin-bottom: 24px; padding: 18px 20px; border-radius: 14px; background: #1b1b1b; }}
      .theme-values h2 {{ font-size: 18px; }}
      .theme-values p {{ margin-top: 4px; color: #999; font-size: 13px; }}
      .theme-values ol {{ display: grid; grid-template-columns: repeat(2, 96px); gap: 8px; margin: 0; padding: 0; list-style: none; }}
      .theme-values .color {{ height: 44px; }}
      .modes {{ display: grid; grid-template-columns: 1fr; gap: 24px; }}
      .mode {{ min-width: 0; border-radius: 20px; padding: 24px; overflow-x: auto; }}
      .mode.light {{ background: #f5f5f5; color: #171717; }}
      .mode.dark {{ background: #232323; color: #f5f5f5; border: 1px solid #393939; }}
      .mode-title {{ display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 24px; }}
      .family + .family {{ margin-top: 28px; }}
      .family h3 {{ margin-bottom: 10px; font-size: 18px; }}
      .ramp {{ display: grid; grid-template-columns: repeat(var(--stop-count), minmax(52px, 1fr)); gap: 8px; margin: 0; padding: 0; list-style: none; }}
      .swatch {{ min-width: 0; }}
      .color {{ display: block; height: 58px; border: 1px solid rgb(127 127 127 / 20%); border-radius: 10px; background: var(--swatch); }}
      .meta {{ display: block; margin-top: 5px; font-size: 11px; line-height: 1.35; }}
      .meta strong, .meta code {{ display: block; overflow: hidden; text-overflow: ellipsis; }}
      .meta code {{ opacity: 0.65; font-family: ui-monospace, monospace; }}
      @media (max-width: 700px) {{ main {{ padding: 20px; }} }}
    </style>
  </head>
  <body data-preview-version="{v}">
    <main>
      <h1>Astryx tonal palette</h1>
      <p class="intro">Generated by <code>{recipe}</code></p>
      {values}
      <div class="modes">{modes}
      </div>
    </main>
  </body>
</html>
"#,
        recipe = esc(&c.recipe),
        values = render_theme_values(c),
    )
}
