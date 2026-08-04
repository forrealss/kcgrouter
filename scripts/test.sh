#!/bin/bash
set -e

ENCRYPTION_KEY=$(openssl rand -hex 32)
SESSION_SECRET=$(openssl rand -hex 32)
export ENCRYPTION_KEY
export SESSION_SECRET

# Clean old test DBs. src/db/client.ts creates them under db/, not the repo
# root, so both locations are cleared (including WAL/shm sidecars).
clean_test_dbs() {
  rm -f db/data.test.*.sqlite db/data.test.*.sqlite-wal db/data.test.*.sqlite-shm
  rm -f data.test.*.sqlite data.test.*.sqlite-wal data.test.*.sqlite-shm
}

clean_test_dbs

# Run each test file in a separate process.
# Discover tests anywhere under src/ so suites outside services/ are included.
FAIL=0
while IFS= read -r f; do
  echo "--- Running $f ---"
  if ! bun test "$f"; then
    FAIL=1
  fi
done < <(find src -name '*.test.ts' -o -name '*.test.tsx' | sort)

# Clean up test DBs
clean_test_dbs

if [ $FAIL -eq 1 ]; then
  echo "Some tests failed"
  exit 1
fi

echo "All tests passed"
