# Boa Benchmarks

For each js script in the `bench_scripts` folder, we create three benchmarks:

- Parser => lexing and parsing of the source code
- Compiler => compilation of the parsed statement list into bytecode
- Execution => execution of the bytecode in the vm

The idea is to check the performance of Boa in different scenarios.
Different parts of Boa are benchmarked separately to make the impact of local changes visible.
