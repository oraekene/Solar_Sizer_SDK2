import assert from 'node:assert/strict';
import test from 'node:test';
import { allDiscoveryPaths, isBlocked } from './watchlist.ts';
import type { Watchlist } from './watchlist.ts';

const watchlist: Watchlist = {
  discovery_paths: [{ site: 'jumia', type: 'panel', url: 'https://www.jumia.com.ng/solar-panels/' }],
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
