#!/usr/bin/env bash
set -euo pipefail

KCGRouter_HOME="${KCGRouter_HOME:-$HOME/.kcgrouter}"
ENV_FILE="$KCGRouter_HOME/.env"

if [ -f "$ENV_FILE" ]; then
  echo "Secrets already exist at: $ENV_FILE"
  echo "Regenerating would break decryption of stored API keys."
  echo "Remove the file first if you really want new keys."
  exit 1
fi

mkdir -p "$KCGRouter_HOME"

ENCRYPTION_KEY=$(openssl rand -hex 32)
SESSION_SECRET=$(openssl rand -hex 32)

cat > "$ENV_FILE" << EOF
ENCRYPTION_KEY=$ENCRYPTION_KEY
SESSION_SECRET=$SESSION_SECRET
EOF

chmod 600 "$ENV_FILE"

echo ".env created with generated secrets: $ENV_FILE"
