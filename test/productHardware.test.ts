import assert from 'node:assert/strict';
import test from 'node:test';
import { sizeWiring } from '../src/utils/wiringSizer.ts';
import { productHardware, isAllInOneProduct } from '../src/utils/productHardware.ts';
import type { Panel, Product, WiringItem } from '../src/types.ts';

const item = (over: Partial<WiringItem> & { id: string }): WiringItem => ({
  name: over.id,
  category: 'mc4_connectors',
  type: 'mandatory',
  description: '',
  price: 1000,
  specs: {},
  ...over,
});

const mc4Kit = item({ id: 'mc4', name: 'MC4 Connector Kit (10 pairs)', specs: { pairs: 10 } });
const spanner = item({ id: 'spanner', name: 'MC4 Spanner Tool', specs: { pairs: 2 } });
const pvCable = item({
  id: 'pv',
  name: '6mm² Solar Cable (Panel to Controller)',
  category: 'cables',
  specs: { gauge: '6mm²', length: 10, type: 'PV Wire' },
});
const acCable = item({
  id: 'ac',
  name: '2.5mm² AC Cable (Inverter to Load)',
  category: 'cables',
  specs: { gauge: '2.5mm²', length: 10, type: 'Twin & Earth' },
});

const catalogue: Panel[] = [
  { id: 'p-1', name: 'Kulpower 250W Mono', watts: 250, voc: 30.5, isc: 10.8, price: 50000 },
  { id: 'p-2', name: 'Kulpower 340W Mono', watts: 340, voc: 41.5, isc: 10.5, price: 70000 },
];

const kit: Product = {
  id: 'p1',
  name: 'SolarOne A300 Plug-and-Play Power Box',
  description: '',
  type: 'combination',
  tags: ['solar'],
  price: 185000,
  product_type: 'system',
  combination_data: {
    inverter: '300W Pure Sine Wave',
    inverter_price: 120000,
    inverter_w: 300,
    battery_config: '390Wh Deep Cycle',
    battery_price: 110000,
    battery_wh: 390,
    battery_total_wh: 390,
    panel_config: '1x 250W Mono',
    panel_price: 70000,
    panel_w: 250,
    array_size_w: 250,
    total_price: 300000,
    daily_yield: 0,
    deficit: 0,
    status: 'Optimal',
    advice: '',
    log: [],
  },
};

test('a kit with a panel gets its PV cable and MC4 connectors', () => {
  const hardware = productHardware(kit, kit.combination_data!, catalogue);
  const sizing = sizeWiring({
    items: [pvCable, mc4Kit, spanner, acCable],
    panel: hardware.panel_data,
    arrayWatts: 250,
    batteryWh: 390,
    maxAcW: 300,
  });
  assert.ok(sizing.includeIds.has('pv'));
  assert.ok(sizing.includeIds.has('mc4'));
  assert.ok(sizing.includeIds.has('spanner'));
});

test('a kit whose panel model is unknown lists the PV cable for sizing', () => {
  const hardware = productHardware(kit, kit.combination_data!, []);
  const sizing = sizeWiring({
    items: [pvCable, mc4Kit, spanner, acCable],
    panel: hardware.panel_data,
    arrayWatts: 250,
    batteryWh: 390,
    maxAcW: 300,
  });
  // The panel is there, so the connectors stay, but the cable size is unknown.
  assert.equal(sizing.includeIds.has('pv'), false);
  assert.ok(sizing.unsizedIds.has('pv'));
  assert.ok(sizing.requiredIds.has('pv'));
  assert.ok(sizing.includeIds.has('mc4'));
});

test('a product with no panel gets no PV cable and no connectors', () => {
  const powerstation = {
    ...kit,
    combination_data: { ...kit.combination_data!, panel_config: '', panel_w: 0, array_size_w: 0 },
  };
  const hardware = productHardware(powerstation, powerstation.combination_data!, catalogue);
  const sizing = sizeWiring({
    items: [pvCable, mc4Kit, spanner, acCable],
    panel: hardware.panel_data,
    arrayWatts: 0,
    batteryWh: 390,
    maxAcW: 300,
  });
  assert.equal(sizing.includeIds.has('pv'), false);
  assert.equal(sizing.includeIds.has('mc4'), false);
  assert.equal(sizing.unsizedIds.has('pv'), false);
});

test('a kit keeps its MC4 connectors even when every extra item is optional', () => {
  const hardware = productHardware(kit, kit.combination_data!, catalogue);
  const sizing = sizeWiring({
    items: [pvCable, mc4Kit, spanner, acCable],
    panel: hardware.panel_data,
    arrayWatts: 250,
    batteryWh: 390,
    maxAcW: 300,
    discretionary: true,
  });
  assert.ok(sizing.includeIds.has('mc4'));
  assert.ok(sizing.includeIds.has('spanner'));
  assert.ok(sizing.includeIds.has('pv'));
});

test('a kit built on a powerstation is all in one, so its DC gear is dropped', () => {
  const powerstationKit: Product = { ...kit, tags: ['solar', 'kit', 'powerstation'] };
  const cd = powerstationKit.combination_data!;
  const batteryCable = item({
    id: 'dc',
    category: 'cables',
    specs: { gauge: '10mm²', length: 5, type: 'Copper' },
  });
  const breaker = item({
    id: 'breaker',
    category: 'breakers',
    specs: { amperage: 100, voltage: 150, poles: 2 },
  });
  const enclosure = item({
    id: 'enclosure',
    category: 'breakers',
    specs: { ways: 2, rating: 65, material: 'ABS' },
  });

  assert.equal(isAllInOneProduct(powerstationKit, cd), true);
  assert.equal(isAllInOneProduct(kit, kit.combination_data!), false);

  const hardware = productHardware(powerstationKit, cd, catalogue);
  const sizing = sizeWiring({
    items: [pvCable, mc4Kit, batteryCable, breaker, enclosure],
    panel: hardware.panel_data,
    arrayWatts: 250,
    batteryWh: 390,
    maxAcW: 300,
    all_in_one: isAllInOneProduct(powerstationKit, cd),
  });
  assert.equal(sizing.includeIds.has('dc'), false);
  assert.equal(sizing.includeIds.has('breaker'), false);
  assert.equal(sizing.includeIds.has('enclosure'), false);
  assert.ok(sizing.includeIds.has('pv'));
});

test('a product borrows the catalogue panel of the same size', () => {
  const hardware = productHardware(kit, kit.combination_data!, catalogue);
  assert.equal(hardware.panel_data?.voc, 30.5);
  assert.equal(hardware.panel_data?.isc, 10.8);
});

test('a stored panel model wins over the catalogue', () => {
  const withModel = { ...kit.combination_data!, panel_voc: 45, panel_isc: 12 };
  const hardware = productHardware(kit, withModel, catalogue);
  assert.equal(hardware.panel_data?.voc, 45);
  assert.equal(hardware.panel_data?.isc, 12);
});
