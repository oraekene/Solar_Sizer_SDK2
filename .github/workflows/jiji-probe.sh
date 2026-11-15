#!/usr/bin/env bash
# Prints the result of each Jiji path from the runner. The label, the status
# code, the Cloudflare ray and the first bytes of the body tell us which path
# the runner may use.
set -u

CRAWLER='SolarSizerBot/0.1 (+https://solarsizer.com/bot; contact@solarsizer.com)'
BROWSER='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
PRODUCT='https://jiji.ng/makurdi/power-equipments/20kwh-392ah-51-2v-lvtopsun-solar-lithium-ion-battery-ip65-available-lh90OdVpVAF258wO4eN2aWkQ.html'

echo "RUNNER_IP=$(curl -sS --max-time 20 https://api.ipify.org || echo unknown)"
echo "DNS=$(getent hosts jiji.ng | head -3 | tr '\n' ' ')"

probe() {
  local label="$1" url="$2" agent="$3"
  local body head code
  body="$(mktemp)"
  head="$(mktemp)"
  code="$(curl -sS -o "$body" -D "$head" --max-time 30 -A "$agent" \
    -H 'accept: text/html,application/xhtml+xml' -H 'accept-language: en-NG,en;q=0.9' \
    -w '%{http_code}' "$url" || echo 000)"
  echo "PROBE ${label} status=${code} bytes=$(wc -c < "$body")"
  grep -iE '^(server|cf-ray|cf-cache-status|content-type|location|retry-after|cf-mitigated|cf-chl)' "$head" \
    | head -8 | sed 's/^/  HDR /'
  head -c 220 "$body" | tr -d '\r\n' | sed 's/^/  BODY /'
  echo ""
  rm -f "$body" "$head"
}

probe 'robots-bot'      'https://jiji.ng/robots.txt' "$CRAWLER"
probe 'home-bot'        'https://jiji.ng/' "$CRAWLER"
probe 'home-browser'    'https://jiji.ng/' "$BROWSER"
probe 'category-bot'    'https://jiji.ng/272-solar-batteries' "$CRAWLER"
probe 'category-browser' 'https://jiji.ng/272-solar-batteries' "$BROWSER"
probe 'feed-bot'        'https://jiji.ng/api_web/v1/listing?slug=272-solar-batteries&init_page=true&page=1&webp=false' "$CRAWLER"
probe 'feed-browser'    'https://jiji.ng/api_web/v1/listing?slug=272-solar-batteries&init_page=true&page=1&webp=false' "$BROWSER"
probe 'feed-short-bot'  'https://jiji.ng/api_web/v1/listing?slug=272-solar-batteries' "$CRAWLER"
probe 'product-bot'     "$PRODUCT" "$CRAWLER"
probe 'product-browser' "$PRODUCT" "$BROWSER"
probe 'feed-bot-second' 'https://jiji.ng/api_web/v1/listing?slug=272-solar-batteries&init_page=true&page=2&webp=false' "$CRAWLER"
