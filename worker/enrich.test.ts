import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyProductType, enrichCombinationData } from './enrich.ts';

const product = { name: 'Test Kit', description: 'Kit description', price: 1000 };

test('adds the solar component list when a product has none', () => {
  const result = enrichCombinationData(product, {
    inverter: '500W',
    inverter_w: 500,
    battery_config: '600Wh',
    battery_wh: 600,
    panel_config: '1x 350W',
    panel_w: 350,
    inverter_price: 200,
    battery_price: 300,
    panel_price: 400,
  });

  assert.ok(result);
  assert.equal(result.kit_type, 'solar');
  assert.equal(result.product_name, 'Test Kit');
  assert.equal((result.component_specs as unknown[]).length, 3);
  assert.deepEqual((result.component_specs as Array<{ specs: { price: number } }>)[0].specs.price, 200);
});

test('drops zero-quantity solar parts', () => {
  const result = enrichCombinationData(product, {
    inverter: '500W',
    inverter_w: 500,
    battery_wh: 0,
    panel_w: 0,
  });

  assert.ok(result);
  assert.equal(result.kit_type, 'internet');
  assert.equal((result.component_specs as unknown[]).length, 1);
});

test('keeps an existing component list untouched', () => {
  const specs = [{ role: 'inverter', name: '500W', quantity: 1, specs: { watts: 500 } }];
  const result = enrichCombinationData(product, { kit_type: 'solar', component_specs: specs });

  assert.ok(result);
  assert.equal(result.component_specs, specs);
});

test('uses the product price for powerstation and internet kits', () => {
  const powerstation = enrichCombinationData(product, { kit_type: 'powerstation', battery_wh: 600, inverter_w: 500 });
  const internet = enrichCombinationData(product, { kit_type: 'internet', inverter_w: 15 });

  assert.ok(powerstation);
  assert.ok(internet);
  assert.equal((powerstation.component_specs as Array<{ specs: { price: number } }>)[0].specs.price, 1000);
  assert.equal((internet.component_specs as Array<{ specs: { price: number } }>)[0].specs.price, 1000);
});

test('returns null for missing or non-object data', () => {
  assert.equal(enrichCombinationData(product, null), null);
  assert.equal(enrichCombinationData(product, 'not-json'), null);
});

test('classifies every catalog card into one exclusive bucket', () => {
  assert.equal(classifyProductType(['kit', 'solar'], true), 'system');
  assert.equal(classifyProductType(['flagship', 'portable', 'pure-sine'], false), 'powerstation');
  assert.equal(classifyProductType(['panel', 'solar'], false), 'component');
  assert.equal(classifyProductType(['internet', 'tier-a'], false), 'component');
  assert.equal(classifyProductType(['mppt', '12v'], false), 'component');
  assert.equal(classifyProductType(['flagship', 'solar', 'accessory'], false), 'accessory');
});
