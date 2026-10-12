FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
COPY scripts/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && mkdir -p /data && chown -R node:node /data /app
USER node
ENV NODE_ENV=production DB_PATH=/data/couriermesh.db HTTP_PORT=8080 SMTP_PORT=2525 SMTP_CERT=/data/tls/smtp.crt SMTP_KEY=/data/tls/smtp.key SMTP_REQUIRE_TLS=true
EXPOSE 8080 2525
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/entrypoint.sh"]
