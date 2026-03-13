/**
 * This hook just accepts any transaction coming through it
 */
#include "hookapi.h"

int64_t hook(uint32_t reserved) {

  TRACESTR("index.c: Called.");
  accept(SBUF("accept"), __LINE__);

  // unreachable
  return 0;
}
