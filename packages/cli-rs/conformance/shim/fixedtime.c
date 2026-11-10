// Pins the wall clock for conformance runs: every realtime read returns the
// same instant, so output and files that carry a timestamp are reproducible.
// Monotonic clocks are left alone, so timers and timeouts still work.
#define _GNU_SOURCE
#include <stdlib.h>
#include <sys/time.h>
#include <time.h>
#include <dlfcn.h>

static long long fixed_sec(void) {
  const char *s = getenv("ASTRYX_CONFORMANCE_EPOCH");
  return s ? atoll(s) : 1794268800LL; /* 2026-11-10T00:00:00Z */
}

static int is_realtime(clockid_t id) {
  return id == CLOCK_REALTIME || id == CLOCK_REALTIME_COARSE
#ifdef CLOCK_TAI
         || id == CLOCK_TAI
#endif
      ;
}

int clock_gettime(clockid_t id, struct timespec *ts) {
  static int (*real)(clockid_t, struct timespec *);
  if (is_realtime(id)) {
    ts->tv_sec = fixed_sec();
    ts->tv_nsec = 0;
    return 0;
  }
  if (!real) real = dlsym(RTLD_NEXT, "clock_gettime");
  return real(id, ts);
}

int gettimeofday(struct timeval *tv, void *tz) {
  (void)tz;
  if (tv) {
    tv->tv_sec = fixed_sec();
    tv->tv_usec = 0;
  }
  return 0;
}

time_t time(time_t *t) {
  time_t v = fixed_sec();
  if (t) *t = v;
  return v;
}
