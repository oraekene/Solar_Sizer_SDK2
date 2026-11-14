import assert from 'node:assert/strict';
import test from 'node:test';
import {
  configureRequestBudgets,
  fetchText,
  pauseSource,
  requestReport,
  resetRequestState,
} from './http.ts';

test('a source stops before the request when its budget is spent', async () => {
  resetRequestState();
  configureRequestBudgets({ jumia: 0 });
  const result = await fetchText('https://www.jumia.com.ng/solar-panels/');
  assert.equal(result.status, 0);
  assert.match(result.error ?? '', /budget/);
  assert.deepEqual(requestReport().paused_sources, ['jumia']);
  assert.match(requestReport().pause_reasons.jumia, /budget/);
});

test('a paused source stays paused for the rest of the run', async () => {
  resetRequestState();
  pauseSource('jumia');
  const result = await fetchText('https://www.jumia.com.ng/solar-panels/');
  assert.equal(result.status, 0);
  assert.match(result.error ?? '', /paused/);
  assert.deepEqual(requestReport().paused_sources, ['jumia']);
});
