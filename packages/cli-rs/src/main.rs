fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let code = astryx_rs::cli::run(args);
    std::process::exit(code);
}
