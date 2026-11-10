// Times one command for bench.mjs: runs argv, waits for it, and writes the
// elapsed monotonic nanoseconds to fd 3. The exit status passes through.
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

static long long now_ns(void) {
  struct timespec ts;
  clock_gettime(CLOCK_MONOTONIC, &ts);
  return (long long)ts.tv_sec * 1000000000LL + ts.tv_nsec;
}

int main(int argc, char **argv) {
  if (argc < 2) return 2;
  long long start = now_ns();
  pid_t pid = fork();
  if (pid == 0) {
    close(3);
    execvp(argv[1], argv + 1);
    _exit(127);
  }
  int status = 0;
  waitpid(pid, &status, 0);
  long long elapsed = now_ns() - start;
  dprintf(3, "%lld\n", elapsed);
  if (WIFEXITED(status)) return WEXITSTATUS(status);
  return 128 + WTERMSIG(status);
}
