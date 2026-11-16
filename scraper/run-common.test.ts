import assert from 'node:assert/strict';
import test from 'node:test';
import { selectedSources } from './run-common.ts';

test('no source setting means every source', () => {
  assert.equal(selectedSources(undefined), null);
  assert.equal(selectedSources(''), null);
  assert.equal(selectedSources('   '), null);
});

test('the source setting names the sites to crawl', () => {
  const sources = selectedSources('jiji');
  assert.ok(sources);
  assert.equal(sources.has('jiji'), true);
  assert.equal(sources.has('jumia'), false);

  const several = selectedSources('jiji, JUMIA ,solarshopnigeria');
  assert.ok(several);
  assert.equal(several.size, 3);
  assert.equal(several.has('solarshopnigeria'), true);
});
