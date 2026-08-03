#!/bin/bash
set -e

ENCRYPTION_KEY=$(openssl rand -hex 32)
SESSION_SECRET=$(openssl rand -hex 32)
export ENCRYPTION_KEY
export SESSION_SECRET

# Clean old test DBs
rm -f data.test.*.sqlite

# Run each test file in a separate process
FAIL=0
for f in src/server/services/__tests__/*.test.ts; do
  echo "--- Running $f ---"
  if ! bun test "$f"; then
    FAIL=1
  fi
done

# Clean up test DBs
rm -f data.test.*.sqlite

if [ $FAIL -eq 1 ]; then
  echo "Some tests failed"
  exit 1
fi

echo "All tests passed"
