# astryx-rs (experiment)

An experimental Rust clone of the Astryx CLI. It is not published and not
supported. Its only goal is to show whether a Rust binary can match the
JavaScript CLI exactly, command by command, and how much faster it is.

- `CONTRACT.md`: what "match" means and how the work is split.
- `conformance/`: the suite that runs both CLIs on the same cases and compares
  stdout, stderr, exit code and written files.

Build: `cargo build --release`. Run: `target/release/astryx <command> ...`.
