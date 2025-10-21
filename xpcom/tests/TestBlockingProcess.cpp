#include <stdio.h>

int main() {
  char tmp;
  (void)fread(&tmp, sizeof(tmp), 1, stdin);
  return 0;
}
