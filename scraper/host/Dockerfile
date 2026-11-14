# The always-on host runs the FreeLLMAPI gateway with the enrichment drainer
# beside it. The gateway answers on the loopback interface only, so the
# Machine never needs public traffic. See docs/scraper-runbook.md.

FROM ghcr.io/tashfeenahmed/freellmapi:latest

ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=127.0.0.1

COPY scraper/host/start.mjs /app/start.mjs
COPY scraper/host/drainer.mjs /app/drainer.mjs
COPY scraper/host/unified-key.mjs /app/unified-key.mjs
COPY scraper/host/print-unified-key.mjs /app/print-unified-key.mjs

CMD ["node", "/app/start.mjs"]
