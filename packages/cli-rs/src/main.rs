fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    astryx_rs::discovery::release::record_run_choice();
    let code = astryx_rs::cli::run(args);
    std::process::exit(code);
}
