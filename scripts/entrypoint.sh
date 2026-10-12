#!/bin/sh
set -eu
umask 077
if [ "${SMTP_ENABLED:-true}" != "false" ] && [ "${SMTP_REQUIRE_TLS:-true}" = "true" ]; then
  CERT="${SMTP_CERT:-/data/tls/smtp.crt}"
  KEY="${SMTP_KEY:-/data/tls/smtp.key}"
  if [ ! -f "$CERT" ] || [ ! -f "$KEY" ]; then
    mkdir -p "$(dirname "$CERT")" "$(dirname "$KEY")"
    echo "Generating internal-only SMTP self-signed certificate; configure client trust explicitly."
    openssl req -x509 -newkey rsa:3072 -nodes -sha256 -days 365 -keyout "$KEY" -out "$CERT" -subj '/CN=couriermesh' -addext 'subjectAltName=DNS:couriermesh,DNS:localhost' >/dev/null 2>&1
  fi
fi
exec node --disable-warning=ExperimentalWarning /app/src/main.js
