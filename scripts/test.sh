#!/bin/bash
set -e

ENCRYPTION_KEY=$(openssl rand -hex 32)
SESSION_SECRET=$(openssl rand -hex 32)
export ENCRYPTION_KEY
export SESSION_SECRET

# Use a temp directory for test DBs
TEST_DB_DIR=$(mktemp -d)
export DB_PATH="$TEST_DB_DIR/data.test.sqlite"

# Clean up on exit
cleanup() {
  rm -rf "$TEST_DB_DIR"
}
trap cleanup EXIT

# Run each test file in a separate process.
# Discover tests anywhere under src/ so suites outside services/ are included.
FAIL=0
while IFS= read -r f; do
  echo "--- Running $f ---"
  if ! bun test "$f"; then
    FAIL=1
  fi
done < <(find src -name '*.test.ts' -o -name '*.test.tsx' | sort)

if [ $FAIL -eq 1 ]; then
  echo "Some tests failed"
  exit 1
fi

echo "All tests passed"
