import assert from 'node:assert/strict';
import test from 'node:test';
import { sizeWiring } from '../src/utils/wiringSizer.ts';
import type { Panel, WiringItem } from '../src/types.ts';

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
const yBranch = item({ id: 'y-branch', name: 'MC4 Y-Branch Connectors (Pair)', specs: { pairs: 1 } });
const spanner = item({ id: 'spanner', name: 'MC4 Spanner Tool', specs: { pairs: 2 } });
const pvItems = [mc4Kit, yBranch, spanner];

const batteryCable = item({
  id: 'copper',
  name: 'Copper Cable 6mm²',
  category: 'cables',
  specs: { type: 'Copper', gauge: '6mm²' },
});

const panel = { watts: 400, voc: 38, isc: 11 } as Panel;

test('a system without a panel gets no PV connectors', () => {
  const sizing = sizeWiring({ items: pvItems, arrayWatts: 0, batteryWh: 0 });
  assert.equal(sizing.includeIds.size, 0);
});

test('a system with a panel gets the MC4 kit, the Y-branch and the spanner', () => {
  const sizing = sizeWiring({ items: pvItems, arrayWatts: 1000, batteryWh: 0, panel });
  assert.deepEqual([...sizing.includeIds].sort(), ['mc4', 'spanner', 'y-branch']);
});

test('a powerstation gets no battery-to-inverter cable', () => {
  const sizing = sizeWiring({
    items: [batteryCable, ...pvItems],
    arrayWatts: 0,
    batteryWh: 0,
    all_in_one: true,
  });
  assert.equal(sizing.includeIds.size, 0);
});

test('a panel-less system still keeps its battery cable', () => {
  const sizing = sizeWiring({ items: [batteryCable], arrayWatts: 0, batteryWh: 5000 });
  assert.ok(sizing.includeIds.has('copper'));
});
