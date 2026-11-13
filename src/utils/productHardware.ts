import type { Panel, Product, SystemCombination } from "../types";

/**
 * A powerstation carries its inverter and battery inside the unit, even when it
 * is sold with a panel. Its DC side is factory-wired, so there is no separate
 * battery cable or breaker to quote.
 */
export const isAllInOneProduct = (product: Product, cd: SystemCombination): boolean =>
  cd.kit_type === "powerstation" ||
  cd.all_in_one === true ||
  product.tags.includes("powerstation");

/** The catalogue panel whose size is closest to the given wattage. */
const closestPanel = (catalogue: Panel[], watts: number): Panel | undefined => {
  if (!catalogue.length || watts <= 0) return undefined;
  return catalogue.reduce((best, panel) =>
    Math.abs(panel.watts - watts) < Math.abs(best.watts - watts) ? panel : best
  );
};

/**
 * Turn a product's stored specs into the hardware objects the sizer needs, so a
 * lone panel, battery or inverter gets its wiring sized like a full system.
 *
 * A product that names a panel but stores no panel model borrows the catalogue
 * panel of the same size, so its PV cable and connectors can be sized.
 */
export const productHardware = (
  product: Product,
  cd: SystemCombination,
  panelCatalogue: Panel[] = []
) => {
  const panelW = cd.panel_w ?? 0;
  const inverterW = cd.inverter_w ?? 0;
  const batteryWh = cd.battery_wh ?? cd.battery_total_wh ?? 0;
  const voltage = cd.battery_voltage ?? 48;
  const ampHours = cd.battery_ah ?? (voltage > 0 && batteryWh > 0 ? batteryWh / voltage : 0);

  const model = cd.panel_voc
    ? { voc: cd.panel_voc, isc: cd.panel_isc ?? 0 }
    : closestPanel(panelCatalogue, panelW);

  return {
    panel_data: panelW > 0
      ? {
          id: product.id,
          name: cd.panel_config || product.name,
          watts: panelW,
          voc: model?.voc ?? 0,
          isc: model?.isc ?? 0,
          price: cd.panel_price ?? 0,
        }
      : undefined,
    inverter_data: inverterW > 0
      ? {
          id: product.id,
          name: cd.inverter || product.name,
          max_ac_w: inverterW,
          cc_max_pv_w: panelW,
          cc_max_voc: model?.voc ?? 0,
          cc_max_amps: 0,
          system_vdc: cd.inverter_system_vdc ?? voltage,
          max_charge_amps: 0,
          cc_type: cd.cc_type ?? "mppt",
          max_parallel_units: 1,
          price: cd.inverter_price ?? 0,
        }
      : undefined,
    battery_data: batteryWh > 0
      ? {
          id: product.id,
          name: cd.battery_config || product.name,
          voltage,
          capacity_ah: ampHours,
          type: cd.battery_type ?? "lithium",
          max_parallel_strings: 1,
          min_c_rate: 0.5,
          price: cd.battery_price ?? 0,
        }
      : undefined,
  };
};
