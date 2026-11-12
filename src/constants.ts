import { Battery, DeviceCategory, Inverter, Panel, Powerstation, ChargeController, Region, WiringItem, WiringCategory } from "./types";

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

export const CHARGE_CONTROLLERS: ChargeController[] = [
  {
    id: "cc-1",
    name: "EPEVER Tracer 40A MPPT",
    type: "mppt",
    max_pv_w: 520,
    max_voc: 100,
    max_amps: 40,
    battery_voltage: 12,
    price: 45000,
    description: "40A MPPT controller for 12V systems. Max 520W PV input."
  },
  {
    id: "cc-2",
    name: "EPEVER Tracer 60A MPPT",
    type: "mppt",
    max_pv_w: 780,
    max_voc: 150,
    max_amps: 60,
    battery_voltage: 24,
    price: 75000,
    description: "60A MPPT controller for 24V systems. Max 780W PV input."
  },
  {
    id: "cc-3",
    name: "Victron SmartSolar MPPT 100/50",
    type: "mppt",
    max_pv_w: 700,
    max_voc: 100,
    max_amps: 50,
    battery_voltage: 12,
    price: 120000,
    description: "50A MPPT with Bluetooth. Max 700W @ 12V, 1400W @ 24V."
  },
  {
    id: "cc-4",
    name: "Victron SmartSolar MPPT 150/70",
    type: "mppt",
    max_pv_w: 1000,
    max_voc: 150,
    max_amps: 70,
    battery_voltage: 48,
    price: 180000,
    description: "70A MPPT for 48V systems. Max 3400W PV input."
  },
  {
    id: "cc-5",
    name: "EPEVER LS2024B 20A PWM",
    type: "pwm",
    max_pv_w: 260,
    max_voc: 50,
    max_amps: 20,
    battery_voltage: 12,
    price: 12000,
    description: "20A PWM controller for small 12V systems."
  }
];

export const WIRING: WiringItem[] = [
  // Cables - Mandatory. Gauge ladder drives per-system selection in wiringSizer.ts.
  {
    id: "w-1",
    name: "4mm² Copper Cable (Battery to Inverter)",
    category: "cables",
    type: "mandatory",
    description: "Flexible copper cable for small inverter battery runs.",
    tooltip: "Carries DC power from battery to inverter. Sized for small 12V/24V systems up to ~1kVA.",
    price: 8500,
    specs: { gauge: "4mm²", length: 5, type: "Copper" }
  },
  {
    id: "w-11",
    name: "10mm² Copper Cable (Battery to Inverter)",
    category: "cables",
    type: "mandatory",
    description: "Heavier copper cable for 1kVA to 3kVA inverter battery connections.",
    tooltip: "Standard battery cable for 1kVA–3kVA inverters on 24V/48V banks. Handles ~60–80A.",
    price: 16500,
    specs: { gauge: "10mm²", length: 5, type: "Copper" }
  },
  {
    id: "w-33",
    name: "16mm² Copper Cable (Battery to Inverter)",
    category: "cables",
    type: "mandatory",
    description: "Battery cable for 3kVA to 5kVA inverters on 48V banks.",
    tooltip: "For 3kVA–5kVA inverters. Thicker copper reduces voltage drop on high-current 48V banks.",
    price: 24000,
    specs: { gauge: "16mm²", length: 5, type: "Copper" }
  },
  {
    id: "w-34",
    name: "25mm² Copper Cable (Battery to Inverter)",
    category: "cables",
    type: "mandatory",
    description: "Battery cable for 5kVA inverters drawing over 100A.",
    tooltip: "Required for 5kVA+ inverters pulling >100A. Minimizes loss and heat on battery cables.",
    price: 33000,
    specs: { gauge: "25mm²", length: 5, type: "Copper" }
  },
  {
    id: "w-35",
    name: "35mm² Copper Cable (Battery to Inverter)",
    category: "cables",
    type: "mandatory",
    description: "Heavy battery cable for 5kVA to 8kVA inverter banks.",
    tooltip: "Heavy-duty cable for 5–8kVA systems. Keeps voltage drop under 2% at full load.",
    price: 45000,
    specs: { gauge: "35mm²", length: 5, type: "Copper" }
  },
  {
    id: "w-36",
    name: "50mm² Copper Cable (Battery to Inverter)",
    category: "cables",
    type: "mandatory",
    description: "Heavy battery cable for 8kVA to 10kVA inverter banks.",
    tooltip: "For 8–10kVA parallel inverter banks. Thick copper for 150A+ continuous current.",
    price: 62000,
    specs: { gauge: "50mm²", length: 5, type: "Copper" }
  },
  {
    id: "w-37",
    name: "70mm² Copper Cable (Battery to Inverter)",
    category: "cables",
    type: "mandatory",
    description: "Largest battery cable for parallel inverter banks above 10kVA.",
    tooltip: "Maximum gauge for large commercial banks >10kVA. Handles 200A+ with minimal drop.",
    price: 84000,
    specs: { gauge: "70mm²", length: 5, type: "Copper" }
  },
  {
    id: "w-2",
    name: "6mm² Solar Cable (Panel to Controller)",
    category: "cables",
    type: "mandatory",
    description: "UV-resistant solar cable for PV connections. Rated for outdoor installation.",
    tooltip: "Connects solar panels to charge controller. UV-rated for rooftop exposure. Good for <15A strings.",
    price: 12000,
    specs: { gauge: "6mm²", length: 10, type: "PV Wire" }
  },
  {
    id: "w-38",
    name: "10mm² Solar Cable (Panel to Controller)",
    category: "cables",
    type: "mandatory",
    description: "Larger PV cable for multi-string arrays feeding one controller.",
    tooltip: "Thicker PV cable for parallel panel strings or longer runs. Handles up to ~25A.",
    price: 19000,
    specs: { gauge: "10mm²", length: 10, type: "PV Wire" }
  },
  {
    id: "w-39",
    name: "16mm² Solar Cable (Panel to Controller)",
    category: "cables",
    type: "mandatory",
    description: "PV cable for long high-current array runs to the charge controller.",
    tooltip: "For large arrays or long distances (>20m) from panels to controller. Reduces voltage drop.",
    price: 27000,
    specs: { gauge: "16mm²", length: 10, type: "PV Wire" }
  },
  {
    id: "w-12",
    name: "2.5mm² AC Cable (Inverter to Load)",
    category: "cables",
    type: "mandatory",
    description: "Twin and earth cable for AC distribution from the inverter to wall sockets.",
    tooltip: "Standard house wiring cable for inverter output circuits. Good for loads up to ~15A.",
    price: 7500,
    specs: { gauge: "2.5mm²", length: 10, type: "Twin & Earth" }
  },
  {
    id: "w-40",
    name: "4mm² AC Cable (Inverter to Load)",
    category: "cables",
    type: "mandatory",
    description: "AC cable for 3kVA inverter output feeding a small distribution board.",
    tooltip: "For 3kVA inverter feeding a DB. Handles up to ~20A continuous AC load.",
    price: 11500,
    specs: { gauge: "4mm²", length: 10, type: "Twin & Earth" }
  },
  {
    id: "w-41",
    name: "6mm² AC Cable (Inverter to Load)",
    category: "cables",
    type: "mandatory",
    description: "AC cable for 5kVA inverter output feeding a distribution board.",
    tooltip: "Required for 5kVA inverter output. Carries up to ~25A to the distribution board.",
    price: 15500,
    specs: { gauge: "6mm²", length: 10, type: "Twin & Earth" }
  },
  {
    id: "w-42",
    name: "10mm² AC Cable (Inverter to Load)",
    category: "cables",
    type: "mandatory",
    description: "AC cable for 8kVA to 10kVA inverter output.",
    tooltip: "Heavy AC cable for 8–10kVA inverter output. Feeds main distribution board at ~35–45A.",
    price: 24000,
    specs: { gauge: "10mm²", length: 10, type: "Twin & Earth" }
  },
  // Breakers - Mandatory. Amperage ladder drives per-system selection.
  {
    id: "w-43",
    name: "DC Breaker (63A)",
    category: "breakers",
    type: "mandatory",
    description: "Battery isolation breaker for 1kVA to 3kVA inverters on 24V or 48V banks.",
    tooltip: "Isolates battery from inverter for safety/maintenance. 63A for small 24V/48V systems.",
    price: 18000,
    specs: { amperage: 63, voltage: 150, poles: "2" }
  },
  {
    id: "w-3",
    name: "DC Breakers (100A)",
    category: "breakers",
    type: "mandatory",
    description: "Required for disconnecting battery banks and PV arrays. Install at battery terminal.",
    tooltip: "Main DC disconnect at battery bank. 100A for typical 3–5kVA systems. Code required.",
    price: 25000,
    specs: { amperage: 100, voltage: 150, poles: "2" }
  },
  {
    id: "w-13",
    name: "Battery Fuse (200A ANL)",
    category: "breakers",
    type: "mandatory",
    description: "Fast-acting fuse for the battery positive cable. Protects against short circuit fires.",
    tooltip: "ANL fuse on battery positive cable. Blows instantly on dead-short to prevent fire.",
    price: 9000,
    specs: { amperage: 200, type: "ANL", voltage: 32 }
  },
  {
    id: "w-14",
    name: "DC Breaker Enclosure (2-Way)",
    category: "breakers",
    type: "mandatory",
    description: "Surface enclosure that holds the DC breakers and fuses near the battery bank.",
    tooltip: "Weatherproof box mounting DC breakers/fuses near batteries. Keeps wiring neat and safe.",
    price: 7500,
    specs: { ways: 2, rating: "IP65", material: "ABS" }
  },
  // DC Bus - Optional
  {
    id: "w-4",
    name: "DC Bus Bar (48V System)",
    category: "dc_bus",
    type: "nice-to-have",
    description: "Tinned copper bus bar for clean battery bank connections. Keep all battery cables equal length.",
    tooltip: "Central connection point for multiple battery strings. Ensures equal cable lengths for balanced current.",
    price: 35000,
    specs: { voltage: 48, current: 200, material: "Tinned Copper" }
  },
  {
    id: "w-15",
    name: "DC Bus Bar (24V System)",
    category: "dc_bus",
    type: "nice-to-have",
    description: "Smaller bus bar for 24V battery banks and compact inverter setups.",
    tooltip: "Compact bus bar for 24V banks with fewer parallel strings. Simplifies wiring.",
    price: 24000,
    specs: { voltage: 24, current: 150, material: "Aluminium" }
  },
  {
    id: "w-16",
    name: "Bus Bar Insulator Cover",
    category: "dc_bus",
    type: "nice-to-have",
    description: "Insulating cover that shields exposed bus bar terminals from accidental contact.",
    tooltip: "Safety cover preventing accidental shorts on live bus bar terminals.",
    price: 4500,
    specs: { material: "PVC", length: 0.3, rating: "IP20" }
  },
  // Surge Protectors - Nice-to-have
  {
    id: "w-5",
    name: "DC Surge Protector (150V)",
    category: "surge_protectors",
    type: "nice-to-have",
    description: "Protects system from voltage spikes during lightning storms. Recommended for all installations.",
    tooltip: "Diverts lightning-induced surges on DC side (battery/PV) to ground. Install at controller/battery.",
    price: 18000,
    specs: { voltage: 150, joules: 1200, response_time: "<1ns" }
  },
  {
    id: "w-17",
    name: "AC Surge Protector (Type 2)",
    category: "surge_protectors",
    type: "nice-to-have",
    description: "Clamps grid spikes before they reach the inverter AC input.",
    tooltip: "Protects inverter AC input from grid surges. Mount in DB before inverter feed.",
    price: 22000,
    specs: { voltage: 230, joules: 2000, response_time: "<25ns" }
  },
  {
    id: "w-18",
    name: "PV Surge Protection Device (1000V)",
    category: "surge_protectors",
    type: "nice-to-have",
    description: "Protects the PV strings and charge controller from induced surges.",
    tooltip: "Surge arrestor on PV array side. Critical for rooftop arrays in lightning-prone areas.",
    price: 19000,
    specs: { voltage: 1000, joules: 4000, response_time: "<25ns" }
  },
  // Casings - Optional
  {
    id: "w-6",
    name: "Cable Lug Casings",
    category: "casings",
    type: "nice-to-have",
    description: "Protective enclosures for cable connections. Prevents corrosion and short circuits.",
    tooltip: "Covers for battery lug connections. Prevents accidental shorts and corrosion.",
    price: 5000,
    specs: { material: "PVC", count: 4, rating: "IP65" }
  },
  {
    id: "w-19",
    name: "MC4 Connector Casing",
    category: "casings",
    type: "nice-to-have",
    description: "Weatherproof box for MC4 joints on outdoor PV runs.",
    tooltip: "IP65 box protecting MC4 splices on roof from rain and UV.",
    price: 3500,
    specs: { material: "PVC", count: 1, rating: "IP65" }
  },
  {
    id: "w-20",
    name: "Breaker Box Casing (IP65)",
    category: "casings",
    type: "nice-to-have",
    description: "Dust and water resistant enclosure for AC and DC breakers.",
    tooltip: "Outdoor-rated enclosure for mounting breakers near array or battery bank.",
    price: 7500,
    specs: { material: "ABS", count: 1, rating: "IP65" }
  },
  // Mounting Racks - Optional
  {
    id: "w-7",
    name: "Mounting Rack (12U)",
    category: "mounting_racks",
    type: "nice-to-have",
    description: "Equipment rack for organizing inverter, controller, and distribution components.",
    tooltip: "Floor-standing 12U server rack for neat equipment layout. Good for large installs.",
    price: 45000,
    specs: { height: 12, width: 600, load: 120, material: "Steel" }
  },
  {
    id: "w-21",
    name: "Wall Mount Bracket Kit",
    category: "mounting_racks",
    type: "nice-to-have",
    description: "Heavy duty brackets to hang the inverter and charge controller on a wall.",
    tooltip: "Space-saving wall brackets for inverter + controller. Keeps equipment off floor.",
    price: 18000,
    specs: { height: 1, width: 400, load: 80, material: "Powder-coated steel" }
  },
  {
    id: "w-22",
    name: "Panel Mounting Rails (4m Pair)",
    category: "mounting_racks",
    type: "nice-to-have",
    description: "Aluminium rails for roof or ground mounting of solar panels.",
    tooltip: "Aluminium rails to clamp panels onto roof or ground frame. 4m pair fits ~4 panels.",
    price: 26000,
    specs: { height: 1, width: 4000, load: 200, material: "Aluminium" }
  },
  // MC4 Connectors - Mandatory
  {
    id: "w-8",
    name: "MC4 Connector Kit (10 pairs)",
    category: "mc4_connectors",
    type: "mandatory",
    description: "Standard MC4 connectors for PV panel connections. Includes male and female pairs.",
    tooltip: "Crimp-on connectors for panel cables. 10 pairs = 20 connectors for up to 10 panels.",
    price: 15000,
    specs: { current: 30, voltage: 1000, pairs: 10 }
  },
  {
    id: "w-23",
    name: "MC4 Y-Branch Connectors (Pair)",
    category: "mc4_connectors",
    type: "mandatory",
    description: "Parallel Y connectors for joining two PV strings into one controller input.",
    tooltip: "Combines 2 panel strings into 1 controller input. Reduces cable runs.",
    price: 6000,
    specs: { current: 30, voltage: 1000, pairs: 1 }
  },
  {
    id: "w-24",
    name: "MC4 Spanner Tool",
    category: "mc4_connectors",
    type: "mandatory",
    description: "Assembly and release spanner for MC4 connector locking nuts.",
    tooltip: "Special wrench to properly tighten/loosen MC4 locking nuts. Prevents water ingress.",
    price: 2500,
    specs: { pairs: 2 }
  },
  // Circuit Breakers - Nice-to-have
  {
    id: "w-9",
    name: "AC Circuit Breaker (15A)",
    category: "circuit_breakers",
    type: "nice-to-have",
    description: "Overcurrent protection for AC output circuits. Install on main distribution panel.",
    tooltip: "Single-pole breaker for individual AC circuits (lights, sockets). 15A for lighting.",
    price: 8000,
    specs: { amperage: 15, trip_type: "Thermal-Magnetic", poles: "1", rating: 230 }
  },
  {
    id: "w-25",
    name: "AC Circuit Breaker (32A)",
    category: "circuit_breakers",
    type: "nice-to-have",
    description: "Main AC breaker for inverter output feeding a small distribution board.",
    tooltip: "Double-pole main breaker for inverter output. 32A covers up to ~7kVA single-phase.",
    price: 9500,
    specs: { amperage: 32, trip_type: "Thermal-Magnetic", poles: "2", rating: 230 }
  },
  {
    id: "w-26",
    name: "Distribution Board (6-Way)",
    category: "circuit_breakers",
    type: "nice-to-have",
    description: "Consumer unit that holds the AC breakers for separate house circuits.",
    tooltip: "6-slot DB box to mount breakers for separate circuits (lights, sockets, heavy loads).",
    price: 16000,
    specs: { trip_type: "Miniature", poles: "2", rating: 230 }
  },
  // Earthing Systems - Optional
  {
    id: "w-10",
    name: "Earthing Rod Kit",
    category: "earthing_systems",
    type: "nice-to-have",
    description: "Grounding system for safety. Required by electrical codes for all renewable energy installations.",
    tooltip: "Copper rod driven into ground. Bonds system to earth for shock protection and lightning safety.",
    price: 12000,
    specs: { length: 2.5, material: "Copper", resistance: 10, rod_size: 16 }
  },
  {
    id: "w-27",
    name: "Earth Cable (16mm², 10m)",
    category: "earthing_systems",
    type: "nice-to-have",
    description: "Green and yellow earth cable tying the inverter, panel frames and rod together.",
    tooltip: "Connects all metal parts (inverter, panel frames, rack) to the earth rod.",
    price: 8500,
    specs: { length: 10, material: "Copper", resistance: 10, rod_size: 16 }
  },
  {
    id: "w-28",
    name: "Earth Clamp / Grounding Lug",
    category: "earthing_systems",
    type: "nice-to-have",
    description: "Clamp that bonds the earth cable to the rod and equipment chassis.",
    tooltip: "Mechanical clamp securing earth cable to rod and equipment grounding points.",
    price: 3000,
    specs: { length: 0.1, material: "Copper", resistance: 10, rod_size: 16 }
  },
  // Smart Controls - Optional
  {
    id: "w-29",
    name: "Smart Energy Meter (Wi-Fi, 100A)",
    category: "smart_controls",
    type: "nice-to-have",
    description: "Whole-home energy meter that logs solar, battery and grid usage from your phone.",
    tooltip: "Measures total home consumption, solar generation, and grid import/export. Data via app.",
    price: 45000,
    specs: { current: 100, connectivity: "Wi-Fi", type: "Smart Meter" }
  },
  {
    id: "w-30",
    name: "Smart Wall Outlet (16A, Wi-Fi)",
    category: "smart_controls",
    type: "nice-to-have",
    description: "In-wall socket with app scheduling and live watt readings for one circuit.",
    tooltip: "Replaces standard socket. Schedules on/off and shows real-time power use per outlet.",
    price: 18000,
    specs: { current: 16, connectivity: "Wi-Fi", type: "Smart Outlet" }
  },
  {
    id: "w-31",
    name: "Smart Plug Adapter (UK 13A)",
    category: "smart_controls",
    type: "nice-to-have",
    description: "Plug-in smart adapter that meters and switches any UK 13A appliance.",
    tooltip: "Plugs into any UK socket. Measures and remotely controls one appliance (fridge, pump, etc).",
    price: 12000,
    specs: { current: 13, connectivity: "Wi-Fi", type: "Smart Plug" }
  },
  {
    id: "w-32",
    name: "Energy Monitor Display (CT Clamp)",
    category: "smart_controls",
    type: "nice-to-have",
    description: "Desk display with a clamp sensor for real-time watts and daily kWh totals.",
    tooltip: "Clamp-on sensor on main feed + desk display. No wiring inside DB. Shows live watts & kWh.",
    price: 22000,
    specs: { current: 100, connectivity: "Wi-Fi", type: "Energy Monitor" }
  }
];

// Category labels for UI display
export const WIRING_CATEGORY_LABELS: Record<WiringCategory, { label: string; description: string }> = {
  cables: { label: "Cables", description: "Wiring and conductors for DC and AC connections" },
  breakers: { label: "Breakers", description: "Circuit protection devices" },
  dc_bus: { label: "DC Bus", description: "Distribution and busbar components" },
  surge_protectors: { label: "Surge Protectors", description: "Lightning and surge protection" },
  casings: { label: "Casings", description: "Protective enclosures and housings" },
  mounting_racks: { label: "Mounting Racks", description: "Equipment mounting and cabinets" },
  mc4_connectors: { label: "MC4 Connectors", description: "PV panel and connector interfaces" },
  circuit_breakers: { label: "Circuit Breakers", description: "AC circuit protection" },
  earthing_systems: { label: "Earthing Systems", description: "Grounding and safety equipment" },
  smart_controls: { label: "Smart Meters & Outlets", description: "Wattmeters, smart wall outlets and adapters" }
};

// Categories whose new items default to Optional in the add form.
export const WIRING_OPTIONAL_BY_DEFAULT: WiringCategory[] = [
  "dc_bus",
  "casings",
  "mounting_racks",
  "earthing_systems",
  "smart_controls",
];

// Category-specific spec fields for wiring item forms
export const WIRING_SPEC_FIELDS: Record<WiringCategory, { key: string; label: string; type: 'number' | 'select' | 'text'; options?: string[] }[]> = {
  cables: [
    { key: "gauge", label: "Gauge", type: "text", options: [] },
    { key: "length", label: "Length", type: "number" },
    { key: "type", label: "Cable Type", type: "select", options: ["Copper", "PV Wire", "Twin & Earth", "Aluminium"] }
  ],
  breakers: [
    { key: "amperage", label: "Amperage (A)", type: "number" },
    { key: "voltage", label: "Voltage (V)", type: "number" },
    { key: "poles", label: "Number of Poles", type: "select", options: ["1", "2", "3"] }
  ],
  dc_bus: [
    { key: "voltage", label: "Voltage (V)", type: "number" },
    { key: "current", label: "Current (A)", type: "number" },
    { key: "material", label: "Material", type: "select", options: ["Aluminium", "Copper", "Tinned Copper"] }
  ],
  surge_protectors: [
    { key: "voltage", label: "Voltage (V)", type: "number" },
    { key: "joules", label: "Protection (J)", type: "number" },
    { key: "response_time", label: "Response Time", type: "text" }
  ],
  casings: [
    { key: "material", label: "Material", type: "text", options: [] },
    { key: "count", label: "Number of Casings", type: "number" },
    { key: "rating", label: "IP Rating", type: "text", options: [] }
  ],
  mounting_racks: [
    { key: "height", label: "Height (U)", type: "number" },
    { key: "width", label: "Width (mm)", type: "number" },
    { key: "load", label: "Load Capacity (kg)", type: "number" },
    { key: "material", label: "Material", type: "select", options: ["Steel", "Aluminium", "Powder-coated steel"] }
  ],
  mc4_connectors: [
    { key: "current", label: "Current Rating (A)", type: "number" },
    { key: "voltage", label: "Voltage (V)", type: "number" },
    { key: "pairs", label: "Number of Pairs", type: "number" }
  ],
  circuit_breakers: [
    { key: "amperage", label: "Amperage (A)", type: "number" },
    { key: "trip_type", label: "Trip Type", type: "select", options: ["Thermal-Magnetic", "Magnetic Trip", "Miniature"] },
    { key: "poles", label: "Number of Poles", type: "select", options: ["1", "2", "3"] },
    { key: "rating", label: "Voltage Rating (V)", type: "number" }
  ],
  earthing_systems: [
    { key: "length", label: "Length (m)", type: "number" },
    { key: "material", label: "Material", type: "select", options: ["Copper", "Galvanised Steel"] },
    { key: "resistance", label: "Resistance (Ω)", type: "number" },
    { key: "rod_size", label: "Rod Size (mm)", type: "number" }
  ],
  smart_controls: [
    { key: "current", label: "Current (A)", type: "number" },
    { key: "connectivity", label: "Connectivity", type: "select", options: ["Wi-Fi", "Ethernet", "Zigbee", "Z-Wave"] },
    { key: "type", label: "Device Type", type: "select", options: ["Smart Meter", "Smart Outlet", "Smart Plug", "Energy Monitor"] }
  ]
};

// One exclusive bucket per catalog card. Filtering reads product_type from the
// API, which classifies stored products and hardware rows with the same rule.
export const PRODUCT_TYPE_FILTERS: { id: "all" | "system" | "powerstation" | "component" | "accessory"; label: string; desc: string }[] = [
  { id: "all", label: "All", desc: "Everything in the catalog." },
  { id: "system", label: "Complete Systems", desc: "Inverter, battery and panel bundles, including internet kits." },
  { id: "powerstation", label: "Powerstations", desc: "Standalone all-in-one power units." },
  { id: "component", label: "Components", desc: "Panels, batteries, charge controllers and internet hardware." },
  { id: "accessory", label: "Accessories", desc: "Cables and installation extras." },
];

export const INTERNET_DEVICE_CLASSES: { id: string; label: string }[] = [
  { id: "cpe", label: "4G / 5G CPE" },
  { id: "router", label: "Wi-Fi Router" },
  { id: "mesh", label: "Mesh Node" },
  { id: "satellite", label: "Satellite Terminal" },
  { id: "poe_radio", label: "Outdoor PoE Radio" },
  { id: "ont", label: "Fibre ONT" },
  { id: "switch", label: "Network Switch" },
  { id: "enterprise_router", label: "Enterprise Router" },
  { id: "other", label: "Other" },
];

export const INTERNET_DEVICE_CLASS_LABELS: Record<string, string> = Object.fromEntries(
  INTERNET_DEVICE_CLASSES.map((item) => [item.id, item.label]),
);
