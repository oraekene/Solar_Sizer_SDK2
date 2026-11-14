// Turns a manufacturer specification table into the numeric fields the
// calculator needs. Every value keeps its label so the review screen can show
// where the number came from.

export type SpecMap = Record<string, unknown>;

type Reader = (value: string) => unknown;

const NUMBER = '([0-9]+(?:\\.[0-9]+)?';

const readWith = (unit: string): Reader => {
  const pattern = new RegExp(`${NUMBER})\\s*${unit}`, 'i');
  return (value) => {
    const match = value.match(pattern);
    return match ? Number(match[1]) : null;
  };
};

const readPlain: Reader = (value) => {
  const match = value.match(new RegExp(`${NUMBER})`));
  return match ? Number(match[1]) : null;
};

const readText: Reader = (value) => value.trim() || null;

const readBatteryType: Reader = (value) => {
  if (/lithium|lfp|lifepo4/i.test(value)) return 'lithium';
  if (/lead.?acid|\bgel\b|\bagm\b|opzv/i.test(value)) return 'lead-acid';
  return null;
};

const readCRate: Reader = (value) => {
  const match = value.match(/([0-9]+(?:\.[0-9]+)?)C(?![A-Za-z])/);
  return match ? Number(match[1]) : null;
};

// The unit must not be part of a longer word. "48V" matches, "1500 VDC" does
// not, and "Vmp" does not.
const VOLTS = readWith('(?<![A-Za-z])V(?![A-Za-z])');
const AMPS = readWith('(?<![A-Za-z])A(?![A-Za-z])');
const WATTS = readWith('(?:Wp|W)(?![A-Za-z])');
const PERCENT = readWith('%');
const KWH = readWith('kWh');
const AH = readWith('Ah(?![A-Za-z])');
const KG = readWith('kg');

type Rule = { field: string; label: RegExp; read: Reader };

const RULES: Rule[] = [
  { field: 'watts', label: /maximum power \(pmax\)|^rated power|^nominal power|^power output/i, read: WATTS },
  { field: 'voc', label: /open.?circuit voltage|\bvoc\b/i, read: VOLTS },
  { field: 'isc', label: /short.?circuit current|\bisc\b/i, read: AMPS },
  { field: 'vmp', label: /maximum power voltage|\bvmp\b/i, read: VOLTS },
  { field: 'imp', label: /maximum power current|\bimp\b/i, read: AMPS },
  { field: 'efficiency_pct', label: /efficiency/i, read: PERCENT },
  { field: 'capacity_kwh', label: /capacity|energy/i, read: KWH },
  { field: 'capacity_ah', label: /capacity/i, read: AH },
  { field: 'voltage_v', label: /nominal voltage|rated voltage/i, read: VOLTS },
  { field: 'chemistry', label: /cell technology|chemistry|electrolyte/i, read: readText },
  { field: 'battery_type', label: /cell technology|chemistry|electrolyte/i, read: readBatteryType },
  { field: 'cell_type', label: /cell type/i, read: readText },
  { field: 'max_parallel_strings', label: /max parallel quantity/i, read: readPlain },
  { field: 'min_c_rate', label: /charge\/discharge current|charge current|discharge current/i, read: readCRate },
  { field: 'life_cycles', label: /life cycles/i, read: readPlain },
  { field: 'warranty_years', label: /warranty/i, read: readPlain },
  { field: 'weight_kg', label: /^weight$/i, read: KG },
  { field: 'pack_count', label: /packaging/i, read: readPlain },
];

export function normalizeSpecs(pairs: Record<string, string>): SpecMap {
  const specs: SpecMap = {};

  for (const rule of RULES) {
    if (specs[rule.field] !== undefined) continue;
    for (const [label, value] of Object.entries(pairs)) {
      if (!rule.label.test(label)) continue;
      const read = rule.read(value);
      if (read !== null && read !== '') specs[rule.field] = read;
      break;
    }
  }

  // A chemistry value is sometimes a phrase such as "Valve regulated lead-acid
  // (gel), tubular plate" rather than a cell technology label.
  if (specs.chemistry === undefined) {
    for (const value of Object.values(pairs)) {
      if (/lithium iron phosphate|lifepo4|\blfp\b|lead.?acid|\bgel\b|\bagm\b|opzv|nimh/i.test(value)) {
        specs.chemistry = value.trim();
        break;
      }
    }
  }

  if (specs.battery_type === undefined && typeof specs.chemistry === 'string') {
    specs.battery_type = readBatteryType(specs.chemistry);
  }

  // A lithium battery states its energy in kWh. The amp-hour rating follows
  // from the energy and the voltage, so the number is arithmetic on two stated
  // values and not a guess.
  if (specs.capacity_ah === undefined && typeof specs.capacity_kwh === 'number' && typeof specs.voltage_v === 'number') {
    specs.capacity_ah = Math.round((specs.capacity_kwh * 1000) / specs.voltage_v);
  }

  return specs;
}

// The listing card carries a short line such as "Jinko Solar - 535 Wp - 20.75%".
export function parseSpecLine(line: string): SpecMap {
  const specs: SpecMap = {};
  const parts = line
    .split('·')
    .map((part) => part.trim())
    .filter(Boolean);

  for (const part of parts) {
    const watts = part.match(new RegExp(`${NUMBER})\\s*(?:Wp|W)(?![A-Za-z])`, 'i'));
    if (watts && specs.watts === undefined) {
      specs.watts = Number(watts[1]);
      continue;
    }
    const volts = part.match(new RegExp(`${NUMBER})\\s*(?<![A-Za-z])V(?![A-Za-z])`, 'i'));
    if (volts && specs.voc === undefined) {
      specs.voc = Number(volts[1]);
      continue;
    }
    const percent = part.match(new RegExp(`${NUMBER})\\s*%`));
    if (percent && specs.efficiency_pct === undefined) {
      specs.efficiency_pct = Number(percent[1]);
      continue;
    }
  }

  return specs;
}
