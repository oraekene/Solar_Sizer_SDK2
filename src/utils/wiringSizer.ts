import type { Inverter, Panel, WiringCategory, WiringItem } from "../types";

/**
 * Sizes the mandatory wiring catalogue against one concrete system instead of
 * quoting the same breaker and cable to every build. Items are chosen from the
 * catalogue the admin already maintains, so no part is invented here.
 */

// Copper conductor ampacity in free air, two loaded conductors.
const GAUGE_AMPS: { mm2: number; amps: number }[] = [
  { mm2: 1.5, amps: 14 },
  { mm2: 2.5, amps: 20 },
  { mm2: 4, amps: 27 },
  { mm2: 6, amps: 36 },
  { mm2: 10, amps: 50 },
  { mm2: 16, amps: 68 },
  { mm2: 25, amps: 89 },
  { mm2: 35, amps: 110 },
  { mm2: 50, amps: 134 },
  { mm2: 70, amps: 171 },
  { mm2: 95, amps: 207 },
  { mm2: 120, amps: 239 },
];

/** Smallest catalogue gauge that carries `amps`. */
export const gaugeForAmps = (amps: number): number => {
  const hit = GAUGE_AMPS.find((g) => g.amps >= amps);
  return hit ? hit.mm2 : GAUGE_AMPS[GAUGE_AMPS.length - 1].mm2;
};

/** Reads the first number out of a spec value such as "4mm²", "63A" or 4. */
export const specNumber = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const match = String(value ?? "").match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
};

/** Recursively converts nested objects/arrays into a display string. */
export const flattenSpec = (key: string, value: unknown, indent = 0): string[] => {
  const pad = "  ".repeat(indent);
  if (value === null || value === undefined) return [`${pad}${key}: `];
  const v = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (typeof value === "object" && value !== null) {
    if (Array.isArray(value)) {
      return value.flatMap((item, i) => flattenSpec(`${key}[${i}]`, item, indent + 1));
    }
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v2]) =>
      flattenSpec(`${key}.${k}`, v2, indent + 1)
    );
  }
  return [`${pad}${key}: ${v}`];
};

/** Categories that only exist to connect a PV array to the rest of the system. */
export const PV_ONLY_CATEGORIES: WiringCategory[] = ["mc4_connectors"];

/** Category to the spec key that decides which sibling is the right size. */
const SIZED_SPEC: Partial<Record<WiringCategory, string>> = {
  cables: "gauge",
  breakers: "amperage",
};

export interface WiringSizingInput {
  items: WiringItem[];
  inverter?: Inverter;
  panel?: Panel;
  arrayWatts: number;
  batteryWh: number;
  systemVdc?: number;
  maxAcW?: number;
  /** Skip battery-to-inverter cables and DC breakers (powerstation or coupled kit). */
  all_in_one?: boolean;
  /**
   * Catalog products are sold on their own, so items that were only kept as a
   * habit are listed for the buyer to choose instead of being included.
   */
  discretionary?: boolean;
}

export interface WiringSizing {
  /** Ids of every item that belongs in this system. */
  includeIds: Set<string>;
  /**
   * Mandatory items that still apply but have no size to size them against,
   * for example the battery cable of a lone battery with no inverter yet.
   * They are listed so the buyer can pick the right size.
   */
  unsizedIds: Set<string>;
  /** Ids of the items this system cannot do without. */
  requiredIds: Set<string>;
  /** One line per sized item, used by the quote PDF guide. */
  notes: string[];
  derived: {
    dcAmps: number;
    pvAmps: number;
    acAmps: number;
    pvVoc: number;
    cableGauge: number;
    breakerAmps: number;
  };
}

/**
 * Returns the wiring item ids for one system.
 *
 * A mandatory item is kept when its category has no sizing rule, when it carries
 * no size spec (accessories such as an enclosure), or when it is the right size
 * for its group. Nice-to-have items are only kept when the caller selected them.
 */
export const sizeWiring = (
  input: WiringSizingInput,
  selectedNiceToHave: string[] = []
): WiringSizing => {
  const { items, inverter, panel, arrayWatts } = input;
  const selected = new Set(selectedNiceToHave);

  const systemVdc = input.systemVdc || inverter?.system_vdc || 48;
  const maxAcW = input.maxAcW || inverter?.max_ac_w || arrayWatts;

  // Inverter DC draw with the usual 1.25 continuous headroom.
  const dcAmps = systemVdc > 0 ? (maxAcW / systemVdc) * 1.25 : 0;
  const acAmps = maxAcW > 0 ? (maxAcW / 230) * 1.25 : 0;

  const seriesCount =
    inverter && panel && panel.voc > 0
      ? Math.max(1, Math.floor(inverter.cc_max_voc / panel.voc))
      : 1;
  const parallelStrings =
    panel && panel.watts > 0
      ? Math.max(1, Math.ceil(arrayWatts / (panel.watts * seriesCount)))
      : 1;

  const pvAmps = panel ? panel.isc * parallelStrings * 1.25 : 0;
  const pvVoc = panel ? panel.voc * seriesCount : 0;
  const hasPv = !!panel && arrayWatts > 0;

  // All-in-one (powerstation / coupled kit): no battery-to-inverter cables or DC breakers.
  const isAllInOne = input.all_in_one === true;
  // The DC side only exists when a separate battery feeds the inverter.
  const hasDc = dcAmps > 0 && !isAllInOne;

  // Cable groups are sized against the current they actually carry.
  const cableTarget: Record<string, number> = {
    Copper: isAllInOne ? 0 : dcAmps,
    "PV Wire": pvAmps,
    "Twin & Earth": acAmps,
  };

  // group key -> winning item id
  const winners = new Set<string>();
  // Mandatory items that apply but have no known size, so no size can be picked.
  const unsized = new Set<string>();
  // Items the system cannot do without, even when the size is unknown.
  const required = new Set<string>();

  for (const category of Object.keys(SIZED_SPEC) as WiringCategory[]) {
    const specKey = SIZED_SPEC[category]!;
    const groups = new Map<string, WiringItem[]>();

    for (const item of items) {
      if (item.category !== category || item.type !== "mandatory") continue;
      if (specNumber(item.specs[specKey]) <= 0) continue; // accessory, always kept
      const key = category === "cables" ? String(item.specs.type ?? "") : category;
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }

    for (const [group, candidates] of groups) {
      // No PV array: skip PV cable and any PV-only accessory categories.
      if (!hasPv && (group === "PV Wire" || PV_ONLY_CATEGORIES.includes(category))) continue;
      // All-in-one: skip Copper (battery-to-inverter cables) and breakers entirely.
      if (isAllInOne && (group === "Copper" || group === "breakers")) continue;

      const target =
        group === "Copper" || group === "breakers"
          ? dcAmps
          : group === "PV Wire"
          ? pvAmps
          : group === "Twin & Earth"
          ? acAmps
          : pvAmps;

      // No current to size against, for example a lone battery with no inverter.
      // The item still applies, so list it and let the buyer choose the size.
      if (target <= 0) {
        const groupRequired =
          group === "PV Wire"
            ? hasPv
            : group === "Copper" || group === "breakers"
            ? hasDc
            : group === "Twin & Earth"
            ? maxAcW > 0
            : false;
        for (const item of candidates) {
          unsized.add(item.id);
          if (groupRequired) required.add(item.id);
        }
        continue;
      }

      const sorted = [...candidates].sort(
        (a, b) =>
          specNumber(a.specs[specKey]) - specNumber(b.specs[specKey]) || a.price - b.price
      );
      const pick = sorted.find((i) => specNumber(i.specs[specKey]) >= target) ?? sorted[sorted.length - 1];
      if (pick) winners.add(pick.id);
    }
  }

  const includeIds = new Set<string>();
  const notes: string[] = [];

  for (const item of items) {
    if (item.type === "nice-to-have") {
      if (selected.has(item.id)) includeIds.add(item.id);
      continue;
    }

    const specKey = SIZED_SPEC[item.category];
    if (!hasPv && PV_ONLY_CATEGORIES.includes(item.category)) continue;
    // All-in-one: the DC gear is inside the unit already.
    if (isAllInOne && item.category === "breakers") continue;
    if (!specKey || specNumber(item.specs[specKey]) <= 0) {
      // An accessory with no size of its own, such as a breaker enclosure. It
      // belongs to the side of the system that exists, so it is required when
      // that side is there. Otherwise it is just an extra the buyer can drop.
      const requiredBySystem =
        item.category === "mc4_connectors" ? hasPv : item.category === "breakers" ? hasDc : false;
      if (requiredBySystem) required.add(item.id);
      if (input.discretionary && !requiredBySystem) unsized.add(item.id);
      else includeIds.add(item.id);
      continue;
    }

    if (!winners.has(item.id)) continue;
    if (unsized.has(item.id)) continue;
    includeIds.add(item.id);

    const size = specNumber(item.specs[specKey]);
    if (item.category === "breakers") {
      notes.push(`DC breaker: ${size}A${dcAmps > 0 ? ` for the ${dcAmps.toFixed(0)}A inverter draw` : ""}.`);
    } else if (item.specs.type === "PV Wire") {
      notes.push(
        `PV cable: ${size}mm²${pvAmps > 0 ? ` for ${pvAmps.toFixed(0)}A of string current (${pvVoc.toFixed(0)}V Voc)` : ""}.`
      );
    } else if (item.specs.type === "Twin & Earth") {
      notes.push(`AC cable: ${size}mm²${acAmps > 0 ? ` for the ${acAmps.toFixed(0)}A AC output` : ""}.`);
    } else {
      notes.push(`Battery cable: ${size}mm² copper${dcAmps > 0 ? ` for the ${dcAmps.toFixed(0)}A DC draw at ${systemVdc}V` : ""}.`);
    }
  }

  const cableSizes = items
    .filter((i) => includeIds.has(i.id) && i.category === "cables")
    .map((i) => specNumber(i.specs.gauge));
  const breaker = items.find((i) => includeIds.has(i.id) && i.category === "breakers" && specNumber(i.specs.amperage) > 0);

  return {
    includeIds,
    unsizedIds: unsized,
    requiredIds: required,
    notes,
    derived: {
      dcAmps: Math.round(dcAmps),
      pvAmps: Math.round(pvAmps),
      acAmps: Math.round(acAmps),
      pvVoc: Math.round(pvVoc),
      cableGauge: cableSizes.length ? Math.max(...cableSizes) : gaugeForAmps(Math.max(dcAmps, pvAmps)),
      breakerAmps: breaker ? specNumber(breaker.specs.amperage) : Math.round(dcAmps),
    },
  };
};

// Legacy title-case spec keys from the first seed data, mapped to the current
// lowercase keys. Applied on load so existing ss_wiring_v2 data keeps its values.
const LEGACY_SPEC_KEYS: Record<string, string> = {
  Gauge: "gauge",
  Length: "length",
  Type: "type",
  Amperage: "amperage",
  Voltage: "voltage",
  Poles: "poles",
  Current: "current",
  Material: "material",
  Ways: "ways",
  Rating: "rating",
  Joules: "joules",
  Response: "response_time",
  "Rod Size": "rod_size",
  Resistance: "resistance",
  Pairs: "pairs",
  Count: "count",
  Height: "height",
  Width: "width",
  Depth: "depth",
  Load: "load",
  Pieces: "pieces",
  Colour: "colour",
  Connectivity: "connectivity",
  Display: "display",
  Sockets: "sockets",
  Sensor: "sensor",
  Range: "range",
  Trip: "trip_type",
  Mounting: "mounting",
};

const NUMERIC_SPEC_KEYS = new Set([
  "length",
  "amperage",
  "voltage",
  "current",
  "joules",
  "resistance",
  "rod_size",
  "pairs",
  "count",
  "height",
  "width",
  "depth",
  "load",
  "pieces",
  "sockets",
  "ways",
  "rating",
]);

/** Rewrites legacy spec keys in place and drops duplicate rows. */
export const normalizeWiringSpecs = (specs: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [rawKey, rawValue] of Object.entries(specs)) {
    const key = LEGACY_SPEC_KEYS[rawKey] ?? rawKey;
    if (key in out && rawValue === "") continue;
    if (NUMERIC_SPEC_KEYS.has(key)) {
      const n = specNumber(rawValue);
      out[key] = typeof rawValue === "number" || n !== 0 ? n : rawValue;
    } else {
      out[key] = rawValue;
    }
  }
  return out;
};
