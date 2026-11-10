//! build.help: the "how to build a page" playbook (`api/build/help/help.mjs`).

use crate::json::Value;
use serde_json::json;

pub fn build_help() -> Value {
    json!({
        "type": "build.help",
        "data": {
            "playbook": true,
            "title": "How to build a page with Astryx",
            "steps": [
                {
                    "title": "Find the page template to start from",
                    "commands": [{"command": "build \"<what you're building>\""}],
                    "returns": "the [page] template to start from (always one: the closest match, or the app shell when nothing matches), the next two templates, and the [block]s and [component]s for the parts it lacks"
                },
                {
                    "title": "Scaffold that template into your project",
                    "commands": [
                        {"command": "template <name> <path>", "purpose": "write the page template to <path>"}
                    ]
                },
                {
                    "title": "Adapt it: keep its frame and spacing, replace its content",
                    "commands": [
                        {"command": "template <BlockName>", "purpose": "print a block to put inside a section, for a part the template lacks"},
                        {"command": "component <Name>", "purpose": "read props before you change a component"}
                    ]
                }
            ],
            "rules": [
                "Start every page from a page template. Never lay out a page from scratch.",
                "Changing a page you already have? Keep it. Add blocks and components inside its sections.",
                "Keep the template's page frame, gap, and padding values. Replace its data, copy, and sections.",
                "No <div>/raw HTML for layout \u{2014} use VStack/HStack/Grid/Stack/Card etc.",
                "No style={{}} \u{2014} use component props, and design tokens for values.",
                "Wrap the app in <Theme theme={...}> (import {Theme} from '@astryxdesign/core/theme') and import core reset.css + astryx.css."
            ],
            "related": [
                {"command": "template --list --type page", "purpose": "every page template"},
                {"command": "docs tokens", "purpose": "the design tokens"},
                {"command": "search <query>", "purpose": "a neutral lookup of any component, doc, or template"}
            ]
        }
    })
}
