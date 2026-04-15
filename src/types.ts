export type Region = "SE_SS" | "SW" | "North";

export type DeviceCategory = "compressor" | "motor" | "heating" | "electronics" | "internet" | "powerstation";

export interface TimeRange {
  start: number;
  end: number;
}

export interface Device {
  id: string;
  name: string;
  category: DeviceCategory;
  qty: number;
  watts: number;
  ranges: TimeRange[];
}

export type BatteryPreference = "lithium" | "lead-acid" | "any";

export interface Inverter {
  id: string;
  name: string;
  max_ac_w: number;
  cc_max_pv_w: number;
  cc_max_voc: number;
  cc_max_amps: number;
  system_vdc: number;
  max_charge_amps: number;
  cc_type: "pwm" | "mppt";
  max_parallel_units: number;
  price: number;
}

export interface Panel {
  id: string;
  name: string;
  watts: number;
  voc: number;
  isc: number;
  price: number;
}

export interface Battery {
  id: string;
  name: string;
  voltage: number;
  capacity_ah: number;
  type: "lead-acid" | "lithium";
  max_parallel_strings: number;
  min_c_rate: number;
  price: number;
}

export interface Powerstation {
  id: string;
  name: string;
  capacity_wh: number;
  max_output_w: number;
  max_pv_input_w: number;
  price: number;
  tags: string[];
  battery_type?: "lithium" | "lead-acid";
  inverter_type?: "pure-sine" | "modified-sine";
  max_charge_amps?: number;
  system_vdc?: number;
  cc_type?: "pwm" | "mppt";
  cc_max_voc?: number;
  cc_max_amps?: number;
  max_parallel_units?: number;
  battery_voltage?: number;
  capacity_ah?: number;
  min_c_rate?: number;
  description?: string;
}

export interface Hardware {
  inverters: Inverter[];
  panels: Panel[];
  batteries: Battery[];
  powerstations: Powerstation[];
}

export interface LoadAnalysis {
  max_surge: number;
  nighttime_wh: number;
  total_daily_wh: number;
  hourly_consumption: Record<number, number>;
}

export interface SystemCombination {
  inverter: string;
  inverter_price: number;
  battery_config: string;
  battery_price: number;
  panel_config: string;
  panel_price: number;
  array_size_w: number;
  battery_total_wh: number;
  total_price: number;
  daily_yield: number;
  deficit: number;
  status: "Optimal" | "Conditional" | "High Risk";
  advice: string;
  log: string[];
  inverter_data?: Inverter;
  panel_data?: Panel;
  battery_data?: Battery;
  is_preconfigured?: boolean;
  product_id?: string;
  inverter_w?: number;
  battery_wh?: number;
  panel_w?: number;
}

export interface CalculationAttempt {
  timestamp: string;
  location: Region;
  devices: Device[];
  analysis: LoadAnalysis;
  totalCombinationsChecked: number;
  validSystemsCount: number;
  allLogs: string[][];
}

export interface UserProfile {
  id: string;
  name: string;
  timestamp: string;
  region: Region;
  batteryPreference: BatteryPreference;
  devices: Device[];
}

export interface User {
  id: string;
  email: string;
  name: string;
  picture?: string;
  provider: "google";
}

export interface SavedResult {
  id: string;
  profile_name: string;
  created_at: string;
  devices?: Device[];
  // For full analysis saves
  analysis?: LoadAnalysis;
  systems?: SystemCombination[];
  // For individual system saves
  system_data?: SystemCombination;
  // For comparison saves
  is_comparison?: boolean;
  has_generator?: boolean;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  type: 'standalone' | 'combination';
  combination_data?: SystemCombination;
  tags: string[];
  price: number;
}

export interface MasterDevice {
  id: string;
  name: string;
  category: DeviceCategory;
  default_watts: number;
  tags: string[];
}

export interface ProfitMargins {
  inverter: number;
  panel: number;
  battery: number;
  powerstation: number;
  product: number;
}

export interface PDFSettings {
  quoteTitle: string;
  quotePrefix: string;
  footerLine1: string;
  footerLine2: string;
}

export type AppTab = "calculator" | "products" | "internet" | "database" | "logs" | "profiles" | "results";
