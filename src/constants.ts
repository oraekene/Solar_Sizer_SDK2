import { Battery, DeviceCategory, Inverter, Panel, Powerstation, Region, WiringItem, WiringCategory } from "./types";

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

export const WIRING: WiringItem[] = [
  // Cables - Mandatory
  {
    id: "w-1",
    name: "4mm² Copper Cable (Battery to Inverter)",
    category: "cables",
    type: "mandatory",
    description: "Flexible copper cable for small inverter battery runs. Use 10mm² or larger for high current systems.",
    price: 8500,
    specs: { "Gauge": "4mm²", "Length": "5m", "Type": "Copper" }
  },
  {
    id: "w-2",
    name: "6mm² Solar Cable (Panel to Controller)",
    category: "cables",
    type: "mandatory",
    description: "UV-resistant solar cable for PV connections. Rated for outdoor installation.",
    price: 12000,
    specs: { "Gauge": "6mm²", "Length": "10m", "Type": "PV Wire" }
  },
  {
    id: "w-11",
    name: "10mm² Copper Cable (Battery to Inverter)",
    category: "cables",
    type: "mandatory",
    description: "Heavier copper cable for 1kVA to 3kVA inverter battery connections.",
    price: 16500,
    specs: { "Gauge": "10mm²", "Length": "5m", "Type": "Copper" }
  },
  {
    id: "w-12",
    name: "2.5mm² AC Cable (Inverter to Load)",
    category: "cables",
    type: "mandatory",
    description: "Twin and earth cable for AC distribution from the inverter to wall sockets.",
    price: 7500,
    specs: { "Gauge": "2.5mm²", "Length": "10m", "Type": "Twin & Earth" }
  },
  // Breakers - Mandatory
  {
    id: "w-3",
    name: "DC Breakers (100A)",
    category: "breakers",
    type: "mandatory",
    description: "Required for disconnecting battery banks and PV arrays. Install at battery terminal.",
    price: 25000,
    specs: { "Amperage": 100, "Voltage": 150, "Poles": 2 }
  },
  {
    id: "w-13",
    name: "Battery Fuse (200A ANL)",
    category: "breakers",
    type: "mandatory",
    description: "Fast-acting fuse for the battery positive cable. Protects against short circuit fires.",
    price: 9000,
    specs: { "Amperage": 200, "Type": "ANL", "Voltage": 32 }
  },
  {
    id: "w-14",
    name: "DC Breaker Enclosure (2-Way)",
    category: "breakers",
    type: "mandatory",
    description: "Surface enclosure that holds the DC breakers and fuses near the battery bank.",
    price: 7500,
    specs: { "Ways": 2, "Rating": "IP65", "Material": "ABS" }
  },
  // DC Bus - Optional
  {
    id: "w-4",
    name: "DC Bus Bar (48V System)",
    category: "dc_bus",
    type: "nice-to-have",
    description: "Tinned copper bus bar for clean battery bank connections. Keep all battery cables equal length.",
    price: 35000,
    specs: { "Voltage": 48, "Current": 200, "Material": "Aluminum" }
  },
  {
    id: "w-15",
    name: "DC Bus Bar (24V System)",
    category: "dc_bus",
    type: "nice-to-have",
    description: "Smaller bus bar for 24V battery banks and compact inverter setups.",
    price: 24000,
    specs: { "Voltage": 24, "Current": 150, "Material": "Aluminum" }
  },
  {
    id: "w-16",
    name: "Bus Bar Insulator Cover",
    category: "dc_bus",
    type: "nice-to-have",
    description: "Insulating cover that shields exposed bus bar terminals from accidental contact.",
    price: 4500,
    specs: { "Material": "PVC", "Length": "300mm", "Rating": "IP20" }
  },
  // Surge Protectors - Nice-to-have
  {
    id: "w-5",
    name: "DC Surge Protector (150V)",
    category: "surge_protectors",
    type: "nice-to-have",
    description: "Protects system from voltage spikes during lightning storms. Recommended for all installations.",
    price: 18000,
    specs: { "Voltage": 150, "Joules": 1200, "Response": "<1ns" }
  },
  {
    id: "w-17",
    name: "AC Surge Protector (Type 2)",
    category: "surge_protectors",
    type: "nice-to-have",
    description: "Clamps grid spikes before they reach the inverter AC input.",
    price: 22000,
    specs: { "Type": "Type 2", "Voltage": 230, "Rating": "20kA" }
  },
  {
    id: "w-18",
    name: "PV Surge Protection Device (1000V)",
    category: "surge_protectors",
    type: "nice-to-have",
    description: "Protects the PV strings and charge controller from induced surges.",
    price: 19000,
    specs: { "Voltage": 1000, "Type": "DC SPD", "Rating": "40kA" }
  },
  // Casings - Optional
  {
    id: "w-6",
    name: "Cable Lug Casings",
    category: "casings",
    type: "nice-to-have",
    description: "Protective enclosures for cable connections. Prevents corrosion and short circuits.",
    price: 5000,
    specs: { "Material": "PVC", "Count": 4, "Rating": "IP65" }
  },
  {
    id: "w-19",
    name: "MC4 Connector Casing",
    category: "casings",
    type: "nice-to-have",
    description: "Weatherproof box for MC4 joints on outdoor PV runs.",
    price: 3500,
    specs: { "Material": "PVC", "Count": 1, "Rating": "IP65" }
  },
  {
    id: "w-20",
    name: "Breaker Box Casing (IP65)",
    category: "casings",
    type: "nice-to-have",
    description: "Dust and water resistant enclosure for AC and DC breakers.",
    price: 7500,
    specs: { "Ways": 6, "Material": "ABS", "Rating": "IP65" }
  },
  // Mounting Racks - Optional
  {
    id: "w-7",
    name: "Mounting Rack (12U)",
    category: "mounting_racks",
    type: "nice-to-have",
    description: "Equipment rack for organizing inverter, controller, and distribution components.",
    price: 45000,
    specs: { "Height": "12U", "Width": "600mm", "Depth": "500mm" }
  },
  {
    id: "w-21",
    name: "Wall Mount Bracket Kit",
    category: "mounting_racks",
    type: "nice-to-have",
    description: "Heavy duty brackets to hang the inverter and charge controller on a wall.",
    price: 18000,
    specs: { "Load": "80kg", "Material": "Powder-coated steel", "Pieces": 2 }
  },
  {
    id: "w-22",
    name: "Panel Mounting Rails (4m Pair)",
    category: "mounting_racks",
    type: "nice-to-have",
    description: "Aluminium rails for roof or ground mounting of solar panels.",
    price: 26000,
    specs: { "Length": "4m", "Material": "Aluminium", "Pieces": 2 }
  },
  // MC4 Connectors - Mandatory
  {
    id: "w-8",
    name: "MC4 Connector Kit (10 pairs)",
    category: "mc4_connectors",
    type: "mandatory",
    description: "Standard MC4 connectors for PV panel connections. Includes male and female pairs.",
    price: 15000,
    specs: { "Current": "30A", "Voltage": "1000V", "Pairs": 10 }
  },
  {
    id: "w-23",
    name: "MC4 Y-Branch Connectors (Pair)",
    category: "mc4_connectors",
    type: "mandatory",
    description: "Parallel Y connectors for joining two PV strings into one controller input.",
    price: 6000,
    specs: { "Current": "30A", "Voltage": "1000V", "Pairs": 1 }
  },
  {
    id: "w-24",
    name: "MC4 Spanner Tool",
    category: "mc4_connectors",
    type: "mandatory",
    description: "Assembly and release spanner for MC4 connector locking nuts.",
    price: 2500,
    specs: { "Type": "MC4 Spanner", "Material": "ABS", "Pieces": 2 }
  },
  // Circuit Breakers - Nice-to-have
  {
    id: "w-9",
    name: "AC Circuit Breaker (15A)",
    category: "circuit_breakers",
    type: "nice-to-have",
    description: "Overcurrent protection for AC output circuits. Install on main distribution panel.",
    price: 8000,
    specs: { "Amperage": 15, "Trip": "Thermal-Magnetic", "Poles": 1 }
  },
  {
    id: "w-25",
    name: "AC Circuit Breaker (32A)",
    category: "circuit_breakers",
    type: "nice-to-have",
    description: "Main AC breaker for inverter output feeding a small distribution board.",
    price: 9500,
    specs: { "Amperage": 32, "Trip": "Thermal-Magnetic", "Poles": 2 }
  },
  {
    id: "w-26",
    name: "Distribution Board (6-Way)",
    category: "circuit_breakers",
    type: "nice-to-have",
    description: "Consumer unit that holds the AC breakers for separate house circuits.",
    price: 16000,
    specs: { "Ways": 6, "Voltage": 230, "Mounting": "Surface" }
  },
  // Earthing Systems - Optional
  {
    id: "w-10",
    name: "Earthing Rod Kit",
    category: "earthing_systems",
    type: "nice-to-have",
    description: "Grounding system for safety. Required by electrical codes for all renewable energy installations.",
    price: 12000,
    specs: { "Length": "2.5m", "Material": "Copper", "Resistance": "<10Ω" }
  },
  {
    id: "w-27",
    name: "Earth Cable (16mm², 10m)",
    category: "earthing_systems",
    type: "nice-to-have",
    description: "Green and yellow earth cable tying the inverter, panel frames and rod together.",
    price: 8500,
    specs: { "Gauge": "16mm²", "Length": "10m", "Colour": "Green/Yellow" }
  },
  {
    id: "w-28",
    name: "Earth Clamp / Grounding Lug",
    category: "earthing_systems",
    type: "nice-to-have",
    description: "Clamp that bonds the earth cable to the rod and equipment chassis.",
    price: 3000,
    specs: { "Material": "Brass", "Rod Size": "16mm", "Pieces": 2 }
  },
  // Smart Controls - Optional
  {
    id: "w-29",
    name: "Smart Energy Meter (Wi-Fi, 100A)",
    category: "smart_controls",
    type: "nice-to-have",
    description: "Whole-home energy meter that logs solar, battery and grid usage from your phone.",
    price: 45000,
    specs: { "Current": "100A", "Connectivity": "Wi-Fi", "Display": "LCD" }
  },
  {
    id: "w-30",
    name: "Smart Wall Outlet (16A, Wi-Fi)",
    category: "smart_controls",
    type: "nice-to-have",
    description: "In-wall socket with app scheduling and live watt readings for one circuit.",
    price: 18000,
    specs: { "Current": "16A", "Connectivity": "Wi-Fi", "Sockets": 1 }
  },
  {
    id: "w-31",
    name: "Smart Plug Adapter (UK 13A)",
    category: "smart_controls",
    type: "nice-to-have",
    description: "Plug-in smart adapter that meters and switches any UK 13A appliance.",
    price: 12000,
    specs: { "Rating": "13A", "Connectivity": "Wi-Fi", "Type": "UK" }
  },
  {
    id: "w-32",
    name: "Energy Monitor Display (CT Clamp)",
    category: "smart_controls",
    type: "nice-to-have",
    description: "Desk display with a clamp sensor for real-time watts and daily kWh totals.",
    price: 22000,
    specs: { "Sensor": "CT Clamp", "Range": "Up to 100A", "Connectivity": "Wi-Fi" }
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
