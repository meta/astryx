//! Experimental Rust clone of the Astryx CLI.
//!
//! Every command must print what the JavaScript CLI prints, byte for byte, and
//! accept and reject the same input. The conformance suite under
//! `conformance/` proves it. See `CONTRACT.md` for how the code is split.

pub mod cli;
pub mod commands;
pub mod discovery;
pub mod js;
pub mod json;
pub mod route;
pub mod text;
