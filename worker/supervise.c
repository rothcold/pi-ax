// Linux-only, per-worker child subreaper. Never enumerates/kills other process trees.
#include <errno.h>
#include <fcntl.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/prctl.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

static volatile sig_atomic_t interrupted;
static void interrupt(int signal_number) { (void)signal_number; interrupted = 1; }
static long long monotonic_ms(void) {
  struct timespec now;
  if (clock_gettime(CLOCK_MONOTONIC, &now) != 0) _exit(125);
  return (long long)now.tv_sec * 1000 + now.tv_nsec / 1000000;
}
static int safe_label(const char *value, int hash) {
  size_t length = strlen(value);
  if (!length || length > 64 || (hash && length != 64)) return 0;
  for (size_t i = 0; i < length; i++) {
    char c = value[i];
    if (hash ? !((c >= 'a' && c <= 'f') || (c >= '0' && c <= '9'))
             : !((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-')) return 0;
  }
  return 1;
}
// These PIDs remain our children (possibly zombies) until this single thread reaps
// them, so they cannot be reused between reading the list and sending the signal.
static int signal_children(int signal_number) {
  char file[96];
  snprintf(file, sizeof(file), "/proc/self/task/%ld/children", (long)getpid());
  FILE *children = fopen(file, "r");
  if (!children) return -1;
  long pid;
  while (fscanf(children, "%ld", &pid) == 1) {
    if (pid <= 0 || (kill((pid_t)pid, signal_number) != 0 && errno != ESRCH)) {
      fclose(children); return -1;
    }
  }
  int failed = ferror(children);
  fclose(children);
  return failed ? -1 : 0;
}
static int proof(const char *file, const char *task, const char *hash, int status, int has_status) {
  char temporary[4096], text[512], timestamp[40];
  if (snprintf(temporary, sizeof(temporary), "%s.tmp", file) >= (int)sizeof(temporary)) return -1;
  time_t now = time(NULL);
  struct tm utc;
  if (!gmtime_r(&now, &utc) || !strftime(timestamp, sizeof(timestamp), "%Y-%m-%dT%H:%M:%SZ", &utc)) return -1;
  char code[24] = "null", signal_number[24] = "null";
  if (has_status && WIFEXITED(status)) snprintf(code, sizeof(code), "%d", WEXITSTATUS(status));
  if (has_status && WIFSIGNALED(status)) snprintf(signal_number, sizeof(signal_number), "%d", WTERMSIG(status));
  int size = snprintf(text, sizeof(text), "{\"version\":1,\"taskId\":\"%s\",\"snapshotSha256\":\"%s\",\"finishedAt\":\"%s\",\"piExitCode\":%s,\"piSignal\":%s,\"interrupted\":%s}\n", task, hash, timestamp, code, signal_number, interrupted ? "true" : "false");
  if (size < 0 || size >= (int)sizeof(text)) return -1;
  int fd = open(temporary, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, 384 /* owner read/write */);
  if (fd < 0) return -1;
  int written = 0;
  while (written < size) {
    ssize_t count = write(fd, text + written, (size_t)(size - written));
    if (count < 0 && errno == EINTR) continue;
    if (count <= 0) { close(fd); return -1; }
    written += (int)count;
  }
  int synced = fsync(fd);
  if (close(fd) != 0 || synced != 0) return -1;
  return rename(temporary, file);
}
int main(int argc, char **argv) {
  // parent-pid, proof-path, task-id, snapshot-hash, budget-ms, executable, args...
  if (argc < 7 || !safe_label(argv[3], 0) || !safe_label(argv[4], 1)) return 125;
  char *end;
  long parent = strtol(argv[1], &end, 10);
  if (*end || parent <= 1) return 125;
  long budget = strtol(argv[5], &end, 10);
  if (*end || budget < 1 || budget > 890000) return 125;
  struct sigaction action = {0};
  action.sa_handler = interrupt;
  action.sa_flags = SA_RESTART; // A second termination request must not abort /proc reads.
  sigemptyset(&action.sa_mask);
  if (sigaction(SIGTERM, &action, NULL) || sigaction(SIGINT, &action, NULL)
      || prctl(PR_SET_CHILD_SUBREAPER, 1) || prctl(PR_SET_PDEATHSIG, SIGTERM)) {
    fputs("pi-ax supervision unavailable\n", stderr); return 125;
  }
  // The wrapper may have died before PDEATHSIG registration. Do not launch then.
  if (getppid() != (pid_t)parent) interrupted = 1;
  pid_t main_child = -1;
  int main_status = 0, has_status = 0;
  long long deadline = monotonic_ms() + budget, stopping = 0;
  if (!interrupted) {
    pid_t supervisor = getpid();
    main_child = fork();
    if (main_child < 0) return 125;
    if (main_child == 0) {
      signal(SIGTERM, SIG_DFL); signal(SIGINT, SIG_DFL);
      if (prctl(PR_SET_PDEATHSIG, SIGKILL) || getppid() != supervisor) _exit(125);
      execvp(argv[6], &argv[6]);
      _exit(127);
    }
  }
  for (;;) {
    int status;
    pid_t child;
    while ((child = waitpid(-1, &status, WNOHANG)) > 0) {
      if (child == main_child) { main_status = status; has_status = 1; }
    }
    // Subreaper ECHILD is the proof boundary, not merely Pi/wrapper exit.
    if (child < 0 && errno == ECHILD) break;
    if (child < 0 && errno != EINTR) return 125;
    long long now = monotonic_ms();
    if (now >= deadline) interrupted = 1;
    if ((interrupted || has_status) && !stopping) stopping = now;
    if (stopping && signal_children(now - stopping >= 1000 ? SIGKILL : SIGTERM) != 0) {
      fputs("pi-ax descendant termination unconfirmed\n", stderr); return 125;
    }
    struct timespec pause = {.tv_sec = 0, .tv_nsec = 10000000};
    nanosleep(&pause, NULL);
  }
  if (proof(argv[2], argv[3], argv[4], main_status, has_status) != 0) {
    fputs("pi-ax termination evidence unavailable\n", stderr); return 125;
  }
  return has_status && WIFEXITED(main_status) && WEXITSTATUS(main_status) == 0 && !interrupted ? 0 : 1;
}
