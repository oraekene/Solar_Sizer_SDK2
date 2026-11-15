import assert from 'node:assert/strict';
import test from 'node:test';
import { allDiscoveryPaths, isBlocked, loadWatchlist } from './watchlist.ts';
import type { Watchlist } from './watchlist.ts';

const watchlist: Watchlist = {
  discovery_paths: [
    { site: 'jumia', type: 'panel', url: 'https://www.jumia.com.ng/solar-panels/' },
    { site: 'jiji', type: 'panel', url: 'https://jiji.ng/solar-energy-products' },
  ],
  brand_paths: {
    jumia_panels: [{ brand: 'Jinko', path: '/solar-panels/jinko/', priority: true }],
    solarshopnigeria: {
      path_template: '/products?brand={slug}',
      confirmed_slugs: ['jinko-solar'],
    },
  },
  excluded_paths: {
    jumia: [
      { path: '/solar-panels/generic/' },
      { path_pattern: '/*price=' },
    ],
  },
  aliases: {},
  manual_rows: [],
};

test('a blocked exact path and a blocked facet path are refused', () => {
  assert.equal(isBlocked(watchlist, 'jumia', 'https://www.jumia.com.ng/solar-panels/generic/'), true);
  assert.equal(isBlocked(watchlist, 'jumia', 'https://www.jumia.com.ng/solar-panels/?price=100'), true);
  assert.equal(isBlocked(watchlist, 'jumia', 'https://www.jumia.com.ng/solar-panels/jinko/'), false);
});

test('the confirmed brand paths join the discovery list', () => {
  const urls = allDiscoveryPaths(watchlist).map((path) => path.url);
  assert.ok(urls.includes('https://www.jumia.com.ng/solar-panels/jinko/'));
  assert.ok(urls.includes('https://solarshopnigeria.com/products?brand=jinko-solar'));
});

test('a brand path is reached before the second category page', () => {
  const urls = allDiscoveryPaths(watchlist).map((path) => path.url);
  assert.ok(
    urls.indexOf('https://www.jumia.com.ng/solar-panels/jinko/') <
      urls.indexOf('https://jiji.ng/solar-energy-products'),
  );
});

test('the shipped watchlist refuses every path in the robots rules', async () => {
  const shipped = await loadWatchlist();
  const site = (url: string) => (new URL(url).hostname === "www.jumia.com.ng" ? "jumia" : "jiji");

  const blocked = [
    "https://www.jumia.com.ng/solar-panels/?power=500",
    "https://www.jumia.com.ng/solar-panels/?tag=deals",
    "https://www.jumia.com.ng/solar-panels/brands/jinko/",
    "https://www.jumia.com.ng/seller/nossolar/",
    "https://www.jumia.com.ng/top-sellers/",
    "https://www.jumia.com.ng/new-products/",
    "https://www.jumia.com.ng/special-price/",
    "https://www.jumia.com.ng/solar-panels/jinko/extra/",
    "https://jiji.ng/test/foo",
    "https://jiji.ng/admin/users",
    "https://jiji.ng/crm/leads",
    "https://jiji.ng/auth/facebook",
  ];
  for (const url of blocked) {
    assert.equal(isBlocked(shipped, site(url), url), true, url);
  }

  const allowed = [
    "https://www.jumia.com.ng/solar-panels/",
    "https://www.jumia.com.ng/solar-panels/jinko/",
    "https://www.jumia.com.ng/solar-battery-chargers-charging-kits/",
    "https://jiji.ng/272-solar-batteries",
  ];
  for (const url of allowed) {
    assert.equal(isBlocked(shipped, site(url), url), false, url);
  }
});
