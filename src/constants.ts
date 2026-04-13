import { Battery, DeviceCategory, Inverter, Panel, Powerstation, Region } from "./types";

export const LOCATION_PSH: Record<Region, number> = {
  SE_SS: 2.2,
  SW: 2.6,
  North: 3.8,
};

export const IRRADIANCE_PROFILES: Record<Region, Record<number, number>> = {
  SE_SS: { 8: 0.03, 9: 0.09, 10: 0.15, 11: 0.20, 12: 0.23, 13: 0.18, 14: 0.09, 15: 0.03 },
  SW: { 8: 0.03, 9: 0.09, 10: 0.15, 11: 0.20, 12: 0.23, 13: 0.18, 14: 0.09, 15: 0.03 },
  North: { 7: 0.02, 8: 0.05, 9: 0.10, 10: 0.15, 11: 0.18, 12: 0.20, 13: 0.15, 14: 0.10, 15: 0.05 },
};

export const SURGE_MULTIPLIERS: Record<DeviceCategory, number> = {
  compressor: 3.0,
  motor: 2.0,
  heating: 1.2,
  electronics: 1.0,
  internet: 1.0,
  powerstation: 1.0,
};

export const INVERTERS: Inverter[] = [
  {
    id: "inv-1",
    name: "Firman 1kVA Hybrid",
    max_ac_w: 800,
    cc_max_pv_w: 600,
    cc_max_voc: 102,
    cc_max_amps: 50,
    system_vdc: 12,
    max_charge_amps: 50,
    cc_type: "pwm",
    max_parallel_units: 1,
    price: 150000,
  },
  {
    id: "inv-2",
    name: "Felicity 3kVA",
    max_ac_w: 2400,
    cc_max_pv_w: 1500,
    cc_max_voc: 145,
    cc_max_amps: 60,
    system_vdc: 24,
    max_charge_amps: 60,
    cc_type: "mppt",
    max_parallel_units: 6,
    price: 400000,
  },
  {
    id: "inv-3",
    name: "Deye 5kVA Hybrid",
    max_ac_w: 4000,
    cc_max_pv_w: 5000,
    cc_max_voc: 500,
    cc_max_amps: 100,
    system_vdc: 48,
    max_charge_amps: 120,
    cc_type: "mppt",
    max_parallel_units: 16,
    price: 850000,
  },
];

export const PANELS: Panel[] = [
  { id: "p-1", name: "Kulpower 100W Mono", watts: 100, voc: 22.5, isc: 5.8, price: 32000 },
  { id: "p-2", name: "9Solar 190W Mono", watts: 190, voc: 24.2, isc: 10.1, price: 45000 },
  { id: "p-3", name: "Kulpower 200W Mono", watts: 200, voc: 24.5, isc: 10.5, price: 43000 },
  { id: "p-4", name: "Kulpower 250W Mono", watts: 250, voc: 30.5, isc: 10.8, price: 50000 },
  { id: "p-5", name: "Kulpower 340W Mono", watts: 340, voc: 41.5, isc: 10.5, price: 70000 },
  { id: "p-6", name: "Kulpower 450W Mono", watts: 450, voc: 49.5, isc: 11.5, price: 85000 },
  { id: "p-7", name: "9Solar 330W Mono", watts: 330, voc: 40.5, isc: 10.2, price: 73000 },
  { id: "p-8", name: "9Solar 430W Mono", watts: 430, voc: 48.5, isc: 11.2, price: 95000 },
  { id: "p-9", name: "9Solar 550W Mono", watts: 550, voc: 49.9, isc: 14.0, price: 103000 },
  { id: "p-10", name: "9Solar 600W Mono", watts: 600, voc: 52.5, isc: 14.5, price: 105000 },
];

export const BATTERIES: Battery[] = [
  { id: "b-1", name: "PowMr 50A LiFePO4", voltage: 12.8, capacity_ah: 50, type: "lithium", max_parallel_strings: 10, min_c_rate: 0.1, price: 110000 },
  { id: "b-2", name: "Taico 12V 100Ah LiFePO4", voltage: 12.8, capacity_ah: 100, type: "lithium", max_parallel_strings: 10, min_c_rate: 0.1, price: 210000 },
  { id: "b-3", name: "Taico 12V 200Ah LiFePO4", voltage: 12.8, capacity_ah: 200, type: "lithium", max_parallel_strings: 10, min_c_rate: 0.1, price: 375000 },
  { id: "b-4", name: "Cworth 12V 100Ah LiFePO4", voltage: 12.8, capacity_ah: 100, type: "lithium", max_parallel_strings: 10, min_c_rate: 0.1, price: 230000 },
  { id: "b-5", name: "Cworth 12V 200Ah LiFePO4", voltage: 12.8, capacity_ah: 200, type: "lithium", max_parallel_strings: 10, min_c_rate: 0.1, price: 390000 },
];

export const POWERSTATIONS: Powerstation[] = [
  {
    id: "ps-1",
    name: "SolarOne A300",
    capacity_wh: 390,
    max_output_w: 300,
    max_pv_input_w: 250,
    price: 185000,
    tags: ["flagship", "portable", "pure-sine"],
    battery_type: "lithium",
    inverter_type: "pure-sine",
    description: "True plug-and-play Setup in a Box."
  },
  {
    id: "ps-2",
    name: "SolarOne A500 Pro",
    capacity_wh: 600,
    max_output_w: 500,
    max_pv_input_w: 350,
    price: 300000,
    tags: ["flagship", "pro", "pure-sine"],
    battery_type: "lithium",
    inverter_type: "pure-sine",
    description: "Whole-house power without the installation."
  },
  {
    id: "ps-3",
    name: "Itel Energy iESS 320T",
    capacity_wh: 320,
    max_output_w: 130,
    max_pv_input_w: 200,
    price: 140000,
    tags: ["budget", "student", "pure-sine"],
    battery_type: "lithium",
    inverter_type: "pure-sine"
  },
  {
    id: "ps-4",
    name: "500W Powerstation",
    capacity_wh: 600,
    max_output_w: 500,
    max_pv_input_w: 350,
    price: 265000,
    tags: ["mid-range", "modified-sine"],
    battery_type: "lithium",
    inverter_type: "modified-sine"
  },
  {
    id: "ps-5",
    name: "Itel 1000W Powerstation",
    capacity_wh: 1000,
    max_output_w: 500,
    max_pv_input_w: 450,
    price: 340000,
    tags: ["pro", "high-capacity"],
    battery_type: "lithium",
    inverter_type: "pure-sine"
  }
];
