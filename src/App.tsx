// Merged App.tsx (best of v1 + v2)
import { useState, useMemo, useEffect, useRef, ChangeEvent, ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { 
  Sun, 
  Battery as BatteryIcon, 
  Zap, 
  MapPin, 
  Plus, 
  Trash2, 
  Calculator, 
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Info,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ListIcon,
  X,
  Database,
  Terminal,
  ArrowLeft,
  LayoutGrid,
  Settings,
  ShieldCheck,
  ExternalLink,
  Cpu,
  Layers,
  Activity,
  Wifi,
  Percent,
  UserCircle,
  PlusCircle,
  Save,
  FolderOpen,
  Copy,
  Download,
  Upload,
  Scale,
  Columns,
  FileJson,
  FileText,
  ShoppingCart
} from "lucide-react";
import { 
  Device, 
  Region, 
  SystemCombination, 
  LoadAnalysis, 
  DeviceCategory, 
  AppTab, 
  CalculationAttempt, 
  Inverter, 
  Panel, 
  Battery, 
  BatteryPreference, 
  UserProfile, 
  User, 
  SavedResult,
  MasterDevice,
  Product,
  ProductType,
  Powerstation,
  ProfitMargins,
  PDFSettings,
  WiringItem,
  WiringCategory,
  TimeRange,
  ChargeController,
  DeviceSpecs
} from "./types";
import { buildCombinations, calculateUserNeeds, estimateBundleSplit } from "./utils/solarCalculator";
import { productHardware } from "./utils/productHardware";
import { INVERTERS as DEFAULT_INVERTERS, PANELS as DEFAULT_PANELS, BATTERIES as DEFAULT_BATTERIES, POWERSTATIONS, CHARGE_CONTROLLERS, WIRING as DEFAULT_WIRING, WIRING_CATEGORY_LABELS, WIRING_SPEC_FIELDS, WIRING_OPTIONAL_BY_DEFAULT, PRODUCT_TYPE_FILTERS, INTERNET_DEVICE_CLASSES, INTERNET_DEVICE_CLASS_LABELS } from "./constants";
import { sizeWiring, normalizeWiringSpecs, specNumber, PV_ONLY_CATEGORIES } from "./utils/wiringSizer";
import InteractiveBridge from "./components/InteractiveBridge";
import { sdk } from "./sdk";
import { storeGet, storeSet, storeRemove, KEY } from "./store/sqlite";

const CATEGORIES: { value: DeviceCategory; label: string }[] = [
  { value: "compressor", label: "Compressor (Fridge/AC)" },
  { value: "motor", label: "Motor (Fan/Pump)" },
  { value: "heating", label: "Heating (Iron/Heater)" },
  { value: "electronics", label: "Electronics (TV/Laptop)" },
  { value: "internet", label: "Internet (Starlink/Router)" },
];

const REGIONS: { value: Region; label: string }[] = [
  { value: "SE_SS", label: "South East / South South" },
  { value: "SW", label: "South West" },
  { value: "North", label: "North" },
];

const getSystemRecommendations = (sys: SystemCombination, allSystems: SystemCombination[]) => {
  const recommendations = [];
  const prices = allSystems.map(s => s.total_price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
  
  const maxBattery = Math.max(...allSystems.map(s => s.battery_total_wh));
  const maxPanels = Math.max(...allSystems.map(s => s.array_size_w));

  // Budget / Entry Level
  if (sys.total_price === minPrice) {
    recommendations.push("Student & Entry-Level: Most affordable entry into solar energy.");
  } else if (sys.total_price < avgPrice * 0.8) {
    recommendations.push("Budget Conscious: Great for small shops and provision stores.");
  }

  // Mid-Range / Professional
  if (sys.total_price >= avgPrice * 0.9 && sys.total_price <= avgPrice * 1.1 && sys.status === 'Optimal') {
    recommendations.push("Mid-Level Professional: Balanced reliability for home offices and managers.");
  }

  // High-End / Executive
  if (sys.total_price > avgPrice * 1.3 || sys.total_price === maxPrice) {
    recommendations.push("Executive & Senior Level: Premium capacity for large homes and high-load electronics.");
  }

  // Heavy Duty / Commercial
  if (sys.battery_total_wh === maxBattery && sys.array_size_w === maxPanels) {
    recommendations.push("Coldroom & Frozen Food: Maximum storage and generation for 24/7 commercial cooling.");
  } else if (sys.battery_total_wh > maxBattery * 0.75) {
    recommendations.push("Food Vendor & Home Cooling: High battery autonomy specifically for freezers and fridges.");
  } else if (sys.array_size_w === maxPanels) {
    recommendations.push("Daytime Business: Ideal for restaurants, bukkas, and busy offices.");
  }

  // Critical Infrastructure
  if (sys.inverter.includes('Parallel') || (sys.battery_total_wh > maxBattery * 0.8 && sys.status === 'Optimal')) {
    recommendations.push("Critical Infrastructure: Suitable for clinics, hospitals, and small data hubs.");
  }

  // Default
  if (recommendations.length === 0) {
    recommendations.push("Standard Residential: Reliable power for typical household needs.");
  }
  
  return recommendations;
};

interface GeneratorProfile {
  name: string;
  capacity_va: number;
  fuel_type: "Petrol" | "Diesel";
  fuel_consumption_l_hr: number;
  price: number;
  maintenance_mo: number;
  lifespan_mo: number;
}

interface GridProfile {
  per_kwh_cost: number;
  daily_kwh: number;
}

const GENERATOR_PROFILES: GeneratorProfile[] = [
  {
    name: "Small Petrol (I Better Pass My Neighbor)",
    capacity_va: 950,
    fuel_type: "Petrol",
    fuel_consumption_l_hr: 0.4,
    price: 150000,
    maintenance_mo: 4000,
    lifespan_mo: 60, // 5 years
  },
  {
    name: "Standard Petrol (Medium)",
    capacity_va: 2500,
    fuel_type: "Petrol",
    fuel_consumption_l_hr: 0.8,
    price: 550000,
    maintenance_mo: 8500,
    lifespan_mo: 96, // 8 years
  },
  {
    name: "Large Petrol",
    capacity_va: 5000,
    fuel_type: "Petrol",
    fuel_consumption_l_hr: 1.5,
    price: 1000000,
    maintenance_mo: 16500,
    lifespan_mo: 120, // 10 years
  },
  {
    name: "Small Diesel",
    capacity_va: 10000,
    fuel_type: "Diesel",
    fuel_consumption_l_hr: 2.0,
    price: 5500000,
    maintenance_mo: 45000,
    lifespan_mo: 180, // 15 years
  },
  {
    name: "Large Diesel",
    capacity_va: 25000,
    fuel_type: "Diesel",
    fuel_consumption_l_hr: 4.5,
    price: 15000000,
    maintenance_mo: 85000,
    lifespan_mo: 240, // 20 years
  }
];

const FUEL_PRICES = {
  Petrol: 1100,
  Diesel: 1400,
};

type HardwareType = "inverter" | "panel" | "battery" | "powerstation" | "chargeController" | "wiring";

/** What the admin is building in the product editor. */
type ProductDraft = {
  mode: "promote" | "manual";
  id: string;
  name: string;
  description: string;
  price: string;
  product_type: ProductType;
  kit_type: "solar" | "internet" | "powerstation";
  tags: string;
  shape: "single" | "setup" | "kit";
  single_role: "inverter" | "battery" | "panel" | "chargeController" | "accessory";
  inverter: string;
  inverter_w: string;
  inverter_vdc: string;
  inverter_price: string;
  battery: string;
  battery_voltage: string;
  battery_ah: string;
  battery_price: string;
  panel: string;
  panel_w: string;
  panel_voc: string;
  panel_isc: string;
  panel_price: string;
  cc: string;
  cc_pv: string;
  cc_voc: string;
  cc_amps: string;
  cc_price: string;
  ps_capacity: string;
  ps_output: string;
  ps_pv: string;
  net_devices: string[];
  net_router: string;
  sourceSystem?: SystemCombination;
};

/** The component fields a shape asks for. */
const PRODUCT_SHAPE_ROLES: Record<ProductDraft["shape"], ProductDraft["single_role"][]> = {
  single: ["inverter", "battery", "panel", "chargeController", "accessory"],
  setup: ["inverter", "battery"],
  kit: ["inverter", "battery", "panel"],
};

/** A blank product draft. */
const emptyProductDraft = (): ProductDraft => ({
  mode: "manual",
  id: Math.random().toString(36).substr(2, 9),
  name: "",
  description: "",
  price: "",
  product_type: "system",
  kit_type: "solar",
  tags: "",
  shape: "kit",
  single_role: "inverter",
  inverter: "",
  inverter_w: "",
  inverter_vdc: "48",
  inverter_price: "",
  battery: "",
  battery_voltage: "12",
  battery_ah: "",
  battery_price: "",
  panel: "",
  panel_w: "",
  panel_voc: "",
  panel_isc: "",
  panel_price: "",
  cc: "",
  cc_pv: "",
  cc_voc: "",
  cc_amps: "",
  cc_price: "",
  ps_capacity: "",
  ps_output: "",
  ps_pv: "",
  net_devices: [],
  net_router: "",
});

const itemData = (item: any, fallbackType?: HardwareType) => {
  if (!item) return null;

  const nestedData = item?.data && typeof item.data === "object" && !Array.isArray(item.data)
    ? item.data
    : null;

  const normalized = nestedData ? { ...item, ...nestedData } : { ...item };

  return {
    ...normalized,
    id: normalized.id ?? item.id,
    type: normalized.type ?? fallbackType ?? item.type,
    description: normalized.description ?? item.description ?? "",
    tags: Array.isArray(normalized.tags)
      ? normalized.tags
      : Array.isArray(item.tags)
        ? item.tags
        : [],
  };
};

// One horizontal, scrolling strip per hardware category.
const HardwareRow = ({ title, icon, action, children }: { title: string; icon: ReactNode; action?: ReactNode; children: ReactNode }) => (
  <section className="space-y-3">
    <div className="flex items-center justify-between gap-3">
      <h3 className="font-bold flex items-center gap-2 text-stone-700">
        {icon} {title}
      </h3>
      {action}
    </div>
    <div className="flex flex-nowrap overflow-x-auto gap-4 pb-3">{children}</div>
  </section>
);

const HardwareCard = ({
  name,
  isDeveloper,
  onEdit,
  onDuplicate,
  onDelete,
  children,
}: {
  name: string;
  isDeveloper: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  children: ReactNode;
}) => (
  <div className="w-[260px] shrink-0 bg-white p-4 rounded-xl border border-stone-200 shadow-sm group relative">
    <div className="flex justify-between items-start gap-2 mb-2">
      <p className="font-bold text-sm">{name}</p>
      <div className={`flex gap-0.5 shrink-0 transition-opacity ${isDeveloper ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
        <button onClick={onDuplicate} className="p-1.5 text-stone-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Duplicate"><Copy className="w-3.5 h-3.5" /></button>
        <button onClick={onEdit} className="p-1.5 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg" title="Edit"><Settings className="w-3.5 h-3.5" /></button>
        <button onClick={onDelete} className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
    </div>
    {children}
  </div>
);

/**
 * One product card. The catalog and the internet tab both group their items
 * into category sections, so the card is shared.
 */
const CatalogCard = ({
  product,
  isDeveloper,
  onDelete,
  onEdit,
  onView,
  onBuy,
  badge,
  children,
}: {
  product: Product;
  isDeveloper: boolean;
  onDelete?: () => void;
  onEdit?: () => void;
  onView: () => void;
  onBuy: () => void;
  badge?: ReactNode;
  children?: ReactNode;
}) => (
  <motion.div
    layout
    initial={{ opacity: 0, y: 14 }}
    animate={{ opacity: 1, y: 0 }}
    className="group relative flex flex-col bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 hover:border-stone-300 transition-all duration-300"
  >
    <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-600 via-emerald-400 to-amber-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
    <div className="p-6 flex-1">
      <div className="flex justify-between items-start gap-3 mb-4">
        {badge ?? (
          <div className="flex gap-1 flex-wrap">
            {product.tags.map((tag) => (
              <span key={`${product.id}-${tag}`} className="px-2 py-0.5 bg-stone-100 text-stone-500 text-[9px] font-black uppercase rounded-md">
                {tag}
              </span>
            ))}
          </div>
        )}
        {isDeveloper && (
          <div className="flex items-center gap-1 shrink-0">
            {onEdit && (
              <button
                onClick={onEdit}
                className="p-1.5 text-stone-300 hover:text-emerald-600 transition-colors"
                title="Edit product"
              >
                <Settings className="w-4 h-4" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                className="p-1.5 text-stone-300 hover:text-red-600 transition-colors"
                title="Delete product"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>
      <h3 className="text-lg font-black text-stone-900 leading-snug mb-2 break-words">{product.name}</h3>
      <p className="text-sm text-stone-500 leading-relaxed line-clamp-2">{product.description}</p>
      {children}
    </div>
    <div className="p-5 bg-stone-50 border-t border-stone-100 flex items-center justify-between gap-3">
      <div>
        <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Starting From</p>
        <p className="text-xl font-black text-stone-900">₦{product.price.toLocaleString()}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onView}
          className="px-3 py-2 bg-white text-stone-700 border border-stone-200 text-xs font-bold rounded-xl hover:bg-stone-100 transition-all"
        >
          View Specs
        </button>
        <button
          onClick={onBuy}
          className="px-3 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-all flex items-center gap-1.5"
        >
          <ShoppingCart className="w-3.5 h-3.5" /> Buy
        </button>
      </div>
    </div>
  </motion.div>
);

/** A category section header with a thin rule under it. */
const SectionHeading = ({ label, count, desc }: { label: string; count: number; desc?: string }) => (
  <div className="flex items-baseline gap-3 mb-6 pb-4 border-b border-stone-200">
    <h3 className="text-xl font-black tracking-tight text-stone-900">{label}</h3>
    <span className="text-xs font-bold text-stone-400">{count} item{count === 1 ? "" : "s"}</span>
    {desc && <p className="text-sm text-stone-500 ml-auto hidden lg:block text-right">{desc}</p>}
  </div>
);

/** One internet device card. Shares the catalog card look. */
const InternetDeviceCard = ({
  device,
  onView,
  onBuy,
}: {
  device: MasterDevice;
  onView: () => void;
  onBuy: () => void;
}) => {
  const deviceClass = device.specs?.device_class;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className="group relative flex flex-col bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 hover:border-stone-300 transition-all duration-300"
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-600 via-sky-400 to-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      <div className="p-6 flex-1">
        <div className="flex items-start justify-between gap-3 mb-4">
          <span className="px-3 py-1 bg-blue-50 text-blue-600 text-[10px] font-black uppercase rounded-full border border-blue-100">
            {deviceClass ? INTERNET_DEVICE_CLASS_LABELS[deviceClass] ?? deviceClass : "Internet Device"}
          </span>
          <div className="text-right shrink-0">
            <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Starting From</p>
            <p className="text-xl font-black text-stone-900">
              {device.price ? `₦${device.price.toLocaleString()}` : "On request"}
            </p>
          </div>
        </div>
        <h3 className="text-lg font-black text-stone-900 leading-snug mb-2 break-words">{device.name}</h3>
        <p className="text-sm text-stone-500 leading-relaxed">
          Standard {device.name} for high-speed connectivity.
        </p>
        <div className="flex items-center gap-2 text-xs font-bold text-stone-400 mt-4">
          <Zap className="w-4 h-4" /> {device.default_watts}W Consumption
        </div>
      </div>
      <div className="p-5 bg-stone-50 border-t border-stone-100 flex items-center gap-2">
        <button
          onClick={onView}
          className="flex-1 bg-white text-stone-700 border border-stone-200 py-2.5 rounded-2xl text-xs font-bold hover:bg-stone-100 transition-all"
        >
          View Specs
        </button>
        <button
          onClick={onBuy}
          className="flex-1 bg-emerald-600 text-white py-2.5 rounded-2xl text-xs font-bold hover:bg-emerald-700 transition-all flex items-center justify-center gap-1.5"
        >
          <ShoppingCart className="w-3.5 h-3.5" /> Buy
        </button>
      </div>
    </motion.div>
  );
};

/** A group of labelled inputs inside the product editor. */
const DraftGroup = ({
  title,
  fields,
}: {
  title: string;
  fields: {
    label: string;
    value: string;
    type?: string;
    step?: string;
    required?: boolean;
    placeholder?: string;
    span?: boolean;
    onChange: (value: string) => void;
  }[];
}) => (
  <div className="space-y-2">
    <p className="text-[10px] font-black uppercase tracking-wider text-stone-400">{title}</p>
    <div className="grid grid-cols-2 gap-3">
      {fields.map((field) => (
        <div key={field.label} className={field.span ? "col-span-2" : ""}>
          <label className="block text-xs font-bold uppercase text-stone-500 mb-1">{field.label}</label>
          <input
            type={field.type ?? "text"}
            step={field.step}
            required={field.required}
            placeholder={field.placeholder}
            value={field.value}
            onChange={(e) => field.onChange(e.target.value)}
            className="w-full px-4 py-2 bg-white border border-stone-200 rounded-xl"
          />
        </div>
      ))}
    </div>
  </div>
);

/** The internet device traits the admin can fill in. */
const INTERNET_SPEC_FIELDS: { key: string; label: string; type?: string; placeholder?: string }[] = [
  { key: "peak_watts", label: "Peak Watts", type: "number" },
  { key: "duty_cycle", label: "Duty Cycle (%)", type: "number" },
  { key: "input_voltage", label: "Input Voltage", placeholder: "e.g. 12V DC" },
  { key: "connector", label: "Connector", placeholder: "e.g. DC barrel / PoE" },
  { key: "ports", label: "Ports", type: "number" },
  { key: "poe_budget_w", label: "PoE Budget (W)", type: "number" },
  { key: "uplink", label: "Uplink", placeholder: "e.g. 5G / fibre / satellite" },
  { key: "bands", label: "Bands", placeholder: "e.g. LTE B1/B3/B7/B20" },
  { key: "operating_temp_c", label: "Operating Temp", placeholder: "e.g. -20 to 55°C" },
  { key: "dish_power_w", label: "Dish Power (W)", type: "number" },
  { key: "mast_height_m", label: "Mast Height (m)", type: "number" },
];

/** Each device class only needs the traits that describe it. */
const INTERNET_CLASS_FIELDS: Record<string, string[]> = {
  cpe: ["peak_watts", "duty_cycle", "input_voltage", "connector", "ports", "uplink", "bands", "operating_temp_c"],
  router: ["peak_watts", "duty_cycle", "ports", "uplink", "bands", "operating_temp_c"],
  mesh: ["peak_watts", "duty_cycle", "ports", "uplink", "bands"],
  satellite: ["peak_watts", "duty_cycle", "dish_power_w", "mast_height_m", "uplink", "bands", "operating_temp_c"],
  poe_radio: ["peak_watts", "duty_cycle", "poe_budget_w", "mast_height_m", "uplink", "bands", "operating_temp_c"],
  ont: ["peak_watts", "duty_cycle", "connector", "ports", "uplink", "operating_temp_c"],
  switch: ["peak_watts", "duty_cycle", "poe_budget_w", "ports", "connector"],
  enterprise_router: ["peak_watts", "duty_cycle", "poe_budget_w", "ports", "uplink", "bands", "operating_temp_c"],
};

const DEFAULT_PDF_SETTINGS: PDFSettings = {
  quoteTitle: "SOLARSIZER PRO QUOTE",
  quotePrefix: "QT",
  footerLine1: "Thank you for choosing SolarSizer Pro!",
  footerLine2: "This quote is valid for 14 days.",
  vatPercent: 7.5,
};

/** Older saved settings and server rows have no vatPercent, so fill the gap. */
const normalizePdfSettings = (saved: Partial<PDFSettings> | null | undefined): PDFSettings => {
  const merged = { ...DEFAULT_PDF_SETTINGS, ...(saved ?? {}) };
  const vat = Number(merged.vatPercent);
  return { ...merged, vatPercent: Number.isFinite(vat) ? vat : DEFAULT_PDF_SETTINGS.vatPercent };
};

/** Marketing suffixes differ between the powerstation seed and its catalog product. */
const sourceKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/plug[\s-]*and[\s-]*play/g, "")
    .replace(/power\s*(box|station)/g, "")
    .replace(/\b(portable|solar generator|combo|kit)\b/g, "")
    .replace(/[^a-z0-9]/g, "");

const powerstationAsProduct = (ps: Powerstation, price = ps.price, name = ps.name): Product => ({
  id: ps.id,
  name,
  description: ps.description ?? `${ps.capacity_wh}Wh powerstation with ${ps.max_output_w}W output.`,
  type: "standalone",
  tags: [...(ps.tags ?? []), "powerstation"],
  price,
  product_type: "powerstation",
  combination_data: {
    inverter: name,
    inverter_price: price,
    inverter_w: ps.max_output_w,
    battery_config: `${ps.capacity_wh}Wh integrated`,
    battery_price: 0,
    battery_wh: ps.capacity_wh,
    battery_total_wh: ps.capacity_wh,
    panel_config: "",
    panel_price: 0,
    panel_w: 0,
    array_size_w: 0,
    total_price: price,
    daily_yield: 0,
    deficit: 0,
    status: "Optimal",
    advice: ps.description ?? "",
    log: [ps.description ?? ""],
    kit_type: "powerstation",
    all_in_one: true,
    component_specs: [
      {
        role: "powerstation",
        name,
        quantity: 1,
        specs: {
          capacity_wh: ps.capacity_wh,
          max_output_w: ps.max_output_w,
          pv_input_w: ps.max_pv_input_w,
          price,
        },
      },
    ],
  },
});

const buildProductDetails = (product: Product, panelCatalogue: Panel[] = []): SystemCombination => {
    if (product.combination_data) {
      const cd = product.combination_data;
      // A kit tagged as a powerstation still has its own battery and panel, so
      // it is only one unit when nothing is separate.
      const isAllInOne =
        cd.kit_type === "powerstation" ||
        cd.all_in_one === true ||
        (product.tags.includes("powerstation") && !cd.battery_config && !cd.panel_config);
      return {
        ...cd,
        // DB-enriched products often omit these; the details modal calls toFixed on them.
        array_size_w: cd.array_size_w ?? cd.panel_w ?? 0,
        battery_total_wh: cd.battery_total_wh ?? cd.battery_wh ?? 0,
        daily_yield: cd.daily_yield ?? 0,
        deficit: cd.deficit ?? 0,
        total_price: cd.total_price ?? product.price ?? 0,
        product_id: product.id,
        product_name: product.name,
        product_description: product.description,
        component_specs: cd.component_specs ?? [],
        all_in_one: isAllInOne,
        ...productHardware(product, cd, panelCatalogue),
      };
    }

    const isInternet = product.tags?.includes("internet") ?? false;

    if (!isInternet) {
      // Hardware-catalog powerstations arrive as flat products with no combination
      // data. Reuse the seeded specs so the modal shows one unit, not fake parts.
      const matched = POWERSTATIONS.find(
        (ps) => ps.id === product.id || sourceKey(ps.name) === sourceKey(product.name)
      );
      if (matched) {
        const psData = powerstationAsProduct(matched, product.price, product.name).combination_data!;
        return {
          ...psData,
          product_id: product.id,
          product_name: product.name,
          product_description: product.description,
          is_preconfigured: true,
          ...productHardware(product, psData, panelCatalogue),
        };
      }
    }

    // Standalone non-internet items (a single panel, battery, accessory) display
    // only their own card; empty labels keep the modal from inventing the rest.
    const isPanel = product.tags?.includes("panel") ?? false;
    const isBattery = product.tags?.includes("battery") ?? false;
    const isPowerstation = product.tags?.includes("powerstation") ?? false;
    const role = isInternet
      ? "network"
      : isPowerstation
      ? "powerstation"
      : isPanel
      ? "panel"
      : isBattery
      ? "battery"
      : "inverter";

    return {
      inverter: role === "inverter" || role === "powerstation" ? product.name : "",
      inverter_price: role === "inverter" || role === "powerstation" ? product.price : 0,
      battery_config: role === "battery" ? product.name : "",
      battery_price: role === "battery" ? product.price : 0,
      panel_config: role === "panel" ? product.name : "",
      panel_price: role === "panel" ? product.price : 0,
      array_size_w: 0,
      battery_total_wh: 0,
      total_price: product.price,
      daily_yield: 0,
      deficit: 0,
      status: "Optimal",
      advice: product.description,
      log: [product.description],
      is_preconfigured: true,
      product_id: product.id,
      product_name: product.name,
      product_description: product.description,
      kit_type: isInternet ? "internet" : isPowerstation ? "powerstation" : "solar",
      // A powerstation carries its own battery and charge control inside.
      all_in_one: isPowerstation,
      component_specs: [
        {
          role,
          name: product.name,
          quantity: 1,
          specs: {
            price: product.price,
          },
        },
      ],
    };
  };

/** Classes that need a router or CPE to reach the internet. */
const INTERNET_SUPPORT_CLASSES = ["mesh", "satellite", "poe_radio", "ont", "switch"];
/** Classes that can reach the internet on their own. */
const INTERNET_ROUTER_CLASSES = ["cpe", "router", "enterprise_router"];

/**
 * Internet hardware has no solar sizing role, so its details modal shows the
 * traits that matter for connectivity plus the solar sources that can carry it.
 */
const InternetDeviceModal = ({
  device,
  product,
  powerstations,
  products,
  routers,
  onBuy,
  onBuyDevice,
  onClose,
}: {
  device: MasterDevice;
  product?: Product;
  powerstations: Powerstation[];
  products: Product[];
  routers: MasterDevice[];
  onBuy: (product: Product) => void;
  onBuyDevice: (device: MasterDevice) => void;
  onClose: () => void;
}) => {
  const specs = device.specs ?? {};
  const watts = Math.max(0, device.default_watts);
  const duty = Math.min(100, Math.max(1, specs.duty_cycle ?? 100));
  const peakW = Math.max(watts, specs.peak_watts ?? 0, Math.round(watts * 1.3));
  const peakIsEstimate = !specs.peak_watts;
  const dailyWh = Math.round((watts * 24 * duty) / 100);
  // 12 hours of overnight autonomy on a lithium bank at 80% usable depth.
  const nightWh = Math.round((watts * 12 * duty) / 100 / 0.8);
  const solarW = Math.ceil(dailyWh / (4.5 * 0.8));
  const batteryFor = (hours: number) => Math.round((watts * hours * duty) / 100 / 0.8);
  const deviceClass = specs.device_class
    ? INTERNET_DEVICE_CLASS_LABELS[specs.device_class] ?? specs.device_class
    : "Internet Hardware";

  // Support devices need a router or CPE to reach the internet.
  const needsRouter = INTERNET_SUPPORT_CLASSES.includes(specs.device_class ?? "");
  const pairableRouters = routers.filter((r) =>
    INTERNET_ROUTER_CLASSES.includes(r.specs?.device_class ?? "")
  );

  const traits = [
    { label: "Device class", value: specs.device_class ? deviceClass : "Not set" },    { label: "Rated load", value: `${watts}W` },
    { label: "Peak draw", value: `${peakW}W` },
    specs.input_voltage ? { label: "Input voltage", value: specs.input_voltage } : null,
    specs.connector ? { label: "Connector", value: specs.connector } : null,
    { label: "Duty cycle", value: `${duty}%` },
    specs.ports ? { label: "Ports", value: String(specs.ports) } : null,
    specs.poe_budget_w ? { label: "PoE budget", value: `${specs.poe_budget_w}W` } : null,
    specs.uplink ? { label: "Uplink", value: specs.uplink } : null,
    specs.bands ? { label: "Bands", value: specs.bands } : null,
    specs.operating_temp_c ? { label: "Operating temp", value: specs.operating_temp_c } : null,
    specs.dish_power_w ? { label: "Dish power", value: `${specs.dish_power_w}W` } : null,
    specs.mast_height_m ? { label: "Mast height", value: `${specs.mast_height_m}m` } : null,
    { label: "Tags", value: device.tags.join(", ") || "—" },
    { label: "Listed price", value: device.price ? `₦${device.price.toLocaleString()}` : "On request" },
  ].filter((trait): trait is { label: string; value: string } => trait !== null);

  const outputPowerstations = Array.from(
    new Map(
      powerstations
        .filter((ps) => ps.max_output_w >= peakW)
        .map((ps) => [sourceKey(ps.name), ps]),
    ).values(),
  ).sort((a, b) => a.price - b.price);
  const fullPowerstations = outputPowerstations.filter((ps) => ps.capacity_wh >= nightWh);

  const outputProducts = Array.from(
    new Map(
      products
        .filter((p) => {
          const cd = p.combination_data;
          // Internet kits are not solar sources, so they never lead this list.
          return !!cd && !p.tags.includes("internet") && (cd.inverter_w ?? cd.array_size_w ?? 0) >= peakW;
        })
        .map((p) => [sourceKey(p.name), p]),
    ).values(),
  ).sort((a, b) => a.price - b.price);
  const fullProducts = outputProducts.filter((p) => {
    const cd = p.combination_data;
    return (cd?.battery_wh ?? cd?.battery_total_wh ?? 0) >= nightWh;
  });

  const usingOutputOnly = fullPowerstations.length === 0 && fullProducts.length === 0;
  const chosenPowerstations = usingOutputOnly ? outputPowerstations : fullPowerstations;
  const chosenPowerstationsKeys = new Set(chosenPowerstations.map((ps) => sourceKey(ps.name)));
  // The A300 exists both as a powerstation and as a catalog product. Keep the
  // cheaper first entry and let the next product fill the row instead.
  const matchedPowerstations = chosenPowerstations.slice(0, 3);
  const matchedProducts = (usingOutputOnly ? outputProducts : fullProducts)
    .filter((p) => !chosenPowerstationsKeys.has(sourceKey(p.name)))
    .slice(0, 3);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full max-w-2xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="p-6 border-b border-stone-100 flex items-start justify-between gap-4 shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-1 bg-blue-50 text-blue-600 text-[10px] font-black uppercase rounded-full border border-blue-100">
                {deviceClass}
              </span>
              {device.tags.map((tag) => (
                <span key={tag} className="px-2 py-0.5 bg-stone-100 text-stone-500 text-[9px] font-black uppercase rounded-md">
                  {tag}
                </span>
              ))}
            </div>
            <h2 className="text-2xl font-black text-stone-900">{device.name}</h2>
            <p className="text-sm text-stone-500 mt-1">
              {device.price ? `Starting from ₦${device.price.toLocaleString()}` : "Price on request"}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-stone-100 rounded-full shrink-0" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto">
          <section>
            <h3 className="text-xs font-black uppercase tracking-wider text-stone-400 mb-3">Power Profile</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Continuous draw", value: `${watts}W`, note: "Rated load" },
                { label: "Peak draw", value: `${peakW}W`, note: peakIsEstimate ? "30% surge margin" : "Configured peak" },
                { label: "Daily energy", value: `${dailyWh}Wh`, note: `${duty}% duty cycle` },
                { label: "Solar input", value: `${solarW}W`, note: "PV to refill daily use" },
              ].map((stat) => (
                <div key={stat.label} className="p-3 bg-stone-50 rounded-2xl border border-stone-100">
                  <p className="text-[9px] font-black uppercase tracking-wider text-stone-400">{stat.label}</p>
                  <p className="text-lg font-black text-stone-900">{stat.value}</p>
                  <p className="text-[10px] text-stone-400">{stat.note}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {[6, 12, 24].map((hours) => (
                <div key={hours} className="p-2 bg-stone-50 rounded-xl border border-stone-100 text-center">
                  <p className="text-[9px] font-black uppercase tracking-wider text-stone-400">{hours}h runtime</p>
                  <p className="text-sm font-black text-stone-900">{batteryFor(hours)}Wh</p>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-stone-400 mt-2">Battery sizes assume 80% usable depth on a lithium bank.</p>
          </section>

          {product?.combination_data?.component_specs?.length ? (
            <section>
              <h3 className="text-xs font-black uppercase tracking-wider text-stone-400 mb-3">Included Hardware</h3>
              <div className="space-y-2">
                {product.combination_data.component_specs.map((spec, index) => (
                  <div key={`${spec.role}-${index}`} className="flex items-center justify-between gap-3 p-3 bg-stone-50 rounded-2xl border border-stone-100">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-stone-900 break-words">{spec.name}</p>
                      <p className="text-[10px] font-black uppercase tracking-wider text-stone-400">{spec.role} · qty {spec.quantity}</p>
                    </div>
                    <div className="text-right text-[11px] text-stone-500 shrink-0">
                      {Object.entries(spec.specs ?? {}).slice(0, 2).map(([key, value]) => (
                        <p key={key}>{key}: {String(value)}</p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <h3 className="text-xs font-black uppercase tracking-wider text-stone-400 mb-3">Device Traits</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-stone-600">
              {traits.map((trait) => (
                <div key={trait.label} className="flex justify-between gap-4 p-2 bg-stone-50 rounded-lg">
                  <span>{trait.label}</span>
                  <span className="font-bold text-right">{trait.value}</span>
                </div>
              ))}
            </div>
          </section>

          {needsRouter && pairableRouters.length > 0 && (
            <section>
              <h3 className="text-xs font-black uppercase tracking-wider text-stone-400 mb-1">Pairs With</h3>
              <p className="text-xs text-stone-500 mb-3">
                A {deviceClass.toLowerCase()} has no internet link of its own. Add one of these routers to complete the setup.
              </p>
              <div className="space-y-2">
                {pairableRouters.map((router) => (
                  <div key={router.id} className="flex items-center justify-between gap-3 p-3 rounded-2xl border border-stone-200">
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-stone-900 break-words">{router.name}</p>
                      <p className="text-xs text-stone-500">
                        {router.specs?.device_class
                          ? INTERNET_DEVICE_CLASS_LABELS[router.specs.device_class] ?? router.specs.device_class
                          : "Router"}
                        {" · "}
                        {router.default_watts}W
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-bold text-emerald-600">
                        {router.price ? `₦${router.price.toLocaleString()}` : "On request"}
                      </span>
                      <button
                        onClick={() => onBuyDevice(router)}
                        className="px-3 py-1.5 bg-emerald-600 text-white text-[11px] font-bold rounded-lg hover:bg-emerald-700 transition-all flex items-center gap-1"
                      >
                        <ShoppingCart className="w-3 h-3" /> Buy
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <h3 className="text-xs font-black uppercase tracking-wider text-stone-400 mb-1">Recommended Solar Power Source</h3>
            <p className="text-xs text-stone-500 mb-3">
              Sized for at least {peakW}W peak output, {nightWh}Wh of overnight storage and {solarW}W of solar input. Pure sine wave output protects radio and router components.
            </p>
            {usingOutputOnly && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-3 mb-3">
                No catalog source covers the full overnight bank. The units below meet the {peakW}W peak output, so add external battery capacity or use the calculator for a custom system.
              </p>
            )}
            {matchedPowerstations.length === 0 && matchedProducts.length === 0 ? (
              <p className="text-sm text-stone-500 p-4 bg-stone-50 rounded-2xl border border-stone-100">
                No power source in the catalog meets this device's startup and overnight needs. Use the calculator to size a custom system.
              </p>
            ) : (
              <div className="space-y-2">
                {matchedPowerstations.map((ps) => (
                  <div key={ps.id} className="flex items-center justify-between gap-3 p-3 rounded-2xl border border-stone-200">
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-stone-900 break-words">{ps.name}</p>
                      <p className="text-xs text-stone-500">{ps.capacity_wh}Wh · {ps.max_output_w}W out · {ps.max_pv_input_w}W PV in</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-bold text-emerald-600">₦{ps.price.toLocaleString()}</span>
                      <button
                        onClick={() => onBuy(powerstationAsProduct(ps))}
                        className="px-3 py-1.5 bg-emerald-600 text-white text-[11px] font-bold rounded-lg hover:bg-emerald-700 transition-all flex items-center gap-1"
                      >
                        <ShoppingCart className="w-3 h-3" /> Buy
                      </button>
                    </div>
                  </div>
                ))}
                {matchedProducts.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 p-3 rounded-2xl border border-stone-200">
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-stone-900 break-words">{p.name}</p>
                      <p className="text-xs text-stone-500">{p.description}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-bold text-emerald-600">₦{p.price.toLocaleString()}</span>
                      <button
                        onClick={() => onBuy(p)}
                        className="px-3 py-1.5 bg-emerald-600 text-white text-[11px] font-bold rounded-lg hover:bg-emerald-700 transition-all flex items-center gap-1"
                      >
                        <ShoppingCart className="w-3 h-3" /> Buy
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </motion.div>
    </motion.div>
  );
};

const safeNumber = (value: unknown, fallback = 0) => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * Internet catalog products carry their load in component_specs or in
 * inverter_w, so adapt them to the device shape instead of duplicating the
 * internet modal. A matching master device supplies the richer traits.
 */
const internetProductAsDevice = (product: Product, masterDevices: MasterDevice[]): MasterDevice => {
  const networkWatts = (product.combination_data?.component_specs ?? [])
    .filter((spec) => spec.role === "network")
    .reduce((total, spec) => total + safeNumber(spec.specs?.watts), 0);
  const matched = masterDevices
    .filter((device) => product.name.toLowerCase().includes(device.name.toLowerCase()))
    .sort((a, b) => b.name.length - a.name.length)[0];

  return {
    id: product.id,
    name: product.name,
    category: "internet",
    default_watts: safeNumber(product.combination_data?.inverter_w) || networkWatts || matched?.default_watts || 0,
    price: product.price,
    specs: matched?.specs ?? {},
    tags: product.tags,
  };
};

const getSystemKey = (sys: SystemCombination, index: number) =>
  [sys.inverter, sys.battery_config, sys.panel_config, safeNumber(sys.total_price), index].join("::");

const getLogKey = (prefix: string, value: string, index: number) =>
  `${prefix}::${index}::${value}`;

/**
 * Shared generator cost maths used by both the ComparisonModal display and
 * the exportComparisonToPDF function. Keeping one source of truth prevents
 * the two from drifting when fuel prices or amortisation rules change.
 */
const computeGeneratorCosts = (
  selectedGen: GeneratorProfile,
  hasGen: boolean,
  genHours: number,
  fuelPriceOverride: number | null,
  defaultFuelPrice: number
) => {
  const fuelPrice = fuelPriceOverride ?? defaultFuelPrice;
  const initialCost = hasGen ? 0 : selectedGen.price;
  const monthlyFuel = fuelPrice * selectedGen.fuel_consumption_l_hr * genHours * 30;
  const monthlyTotal = monthlyFuel + selectedGen.maintenance_mo;
  const fiveYearTotal = initialCost + (monthlyTotal * 12 * 5);
  return { initialCost, monthlyFuel, monthlyTotal, fiveYearTotal, fuelPrice };
};

function ComparisonModal({
  systems,
  analysis,
  hasGenerator: initialHasGenerator,
  setHasGenerator: onHasGeneratorChange,
  hasGrid: initialHasGrid,
  setHasGrid: onHasGridChange,
  gridPerKwh: initialGridPerKwh,
  setGridPerKwh: onGridPerKwhChange,
  gridKwhOverride: initialGridKwhOverride,
  setGridKwhOverride: onGridKwhOverrideChange,
  exportComparisonToPDF,
  onSave,
  onClose
}: {
  systems: SystemCombination[];
  analysis: LoadAnalysis;
  hasGenerator: boolean;
  setHasGenerator: (val: boolean) => void;
  hasGrid: boolean;
  setHasGrid: (val: boolean) => void;
  gridPerKwh: number;
  setGridPerKwh: (val: number) => void;
  gridKwhOverride: number | null;
  setGridKwhOverride: (val: number | null) => void;
  exportComparisonToPDF: (profileName: string, systems: SystemCombination[], hasGen: boolean, genHours: number, fuelPriceOverride: number | null, hasGridFlag: boolean, gridPerKwh: number, gridKwhOverride: number | null, savedAnalysis?: LoadAnalysis) => void;
  onSave?: () => void;
  onClose: () => void
}) {
  const [hasGenerator, setHasGenerator] = useState(initialHasGenerator);
  const [genHours, setGenHours] = useState(6);
  const [fuelPriceOverride, setFuelPriceOverride] = useState<number | null>(null);
  const [hasGrid, setHasGrid] = useState(initialHasGrid);
  const [gridPerKwh, setGridPerKwh] = useState(initialGridPerKwh);
  const [gridKwhOverride, setGridKwhOverride] = useState(initialGridKwhOverride);

  // Sync with parent if needed (for live comparisons)
  useEffect(() => {
    onHasGeneratorChange(hasGenerator);
  }, [hasGenerator, onHasGeneratorChange]);
  useEffect(() => {
    onHasGridChange(hasGrid);
  }, [hasGrid, onHasGridChange]);
  useEffect(() => {
    onGridPerKwhChange(gridPerKwh);
  }, [gridPerKwh, onGridPerKwhChange]);
  useEffect(() => {
    onGridKwhOverrideChange(gridKwhOverride);
  }, [gridKwhOverride, onGridKwhOverrideChange]);

  // Generator Selection Logic
  const peakWatts = analysis.max_surge;
  const requiredVA = peakWatts / 0.8; // Assuming 0.8 power factor for generators
  
  // Find the smallest generator that can handle the load
  const selectedGen = GENERATOR_PROFILES.find(g => g.capacity_va >= requiredVA) || GENERATOR_PROFILES[GENERATOR_PROFILES.length - 1];
  
  const defaultFuelPrice = FUEL_PRICES[selectedGen.fuel_type];
  const { initialCost, monthlyFuel, monthlyTotal, fiveYearTotal, fuelPrice } =
    computeGeneratorCosts(selectedGen, hasGenerator, genHours, fuelPriceOverride, defaultFuelPrice);
  const maintenance = selectedGen.maintenance_mo;

  // Grid power cost maths
  const gridDailyKwh = gridKwhOverride ?? (analysis.total_daily_wh / 1000);
  const gridMonthlyKwh = gridDailyKwh * 30;
  const gridMonthlyCost = gridDailyKwh * gridPerKwh * 30;
  const gridFiveYearCost = gridMonthlyCost * 60;
  const gridAmortizedMonthly = gridMonthlyCost;

  const exportToPDF = () => {
    exportComparisonToPDF(`Solar vs. Generator Comparison`, systems, hasGenerator, genHours, fuelPriceOverride, hasGrid, gridPerKwh, gridKwhOverride, analysis);
  };

  return (
    <div className="fixed inset-0 bg-stone-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white w-full max-w-6xl max-h-[90vh] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="p-8 border-b border-stone-100 flex items-center justify-between bg-stone-50">
          <div>
            <h2 className="text-3xl font-black text-stone-900 flex items-center gap-3">
              <Scale className="w-8 h-8 text-emerald-600" /> System Comparison
            </h2>
            <p className="text-stone-500 font-medium">Comparing {systems.length} Solar Setups vs. {selectedGen.name}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3 px-4 py-2 bg-white rounded-2xl border border-stone-200 shadow-sm">
                <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">I already own this generator</span>
                <button
                  onClick={() => setHasGenerator(!hasGenerator)}
                  className={`w-12 h-6 rounded-full transition-all relative ${hasGenerator ? 'bg-emerald-600' : 'bg-stone-200'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${hasGenerator ? 'left-7' : 'left-1'}`} />
                </button>
              </div>
              <div className="flex items-center gap-3 px-4 py-2 bg-white rounded-2xl border border-stone-200 shadow-sm">
                <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">Show Grid Power column</span>
                <button
                  onClick={() => setHasGrid(!hasGrid)}
                  className={`w-12 h-6 rounded-full transition-all relative ${hasGrid ? 'bg-emerald-600' : 'bg-stone-200'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${hasGrid ? 'left-7' : 'left-1'}`} />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-stone-200 shadow-sm">
                  <span className="text-[10px] font-bold text-stone-400 uppercase">Hrs/Day</span>
                  <input
                    type="number"
                    min="1"
                    max="24"
                    value={genHours}
                    onChange={(e) => setGenHours(Number(e.target.value))}
                    className="w-12 text-xs font-bold text-stone-700 outline-none"
                  />
                </div>
                <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-stone-200 shadow-sm">
                  <span className="text-[10px] font-bold text-stone-400 uppercase">₦/L</span>
                  <input
                    type="number"
                    value={fuelPrice}
                    onChange={(e) => setFuelPriceOverride(Number(e.target.value))}
                    className="w-20 text-xs font-bold text-stone-700 outline-none"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-stone-200 shadow-sm">
                  <span className="text-[10px] font-bold text-stone-400 uppercase">₦/kWh</span>
                  <input
                    type="number"
                    min="0"
                    value={gridPerKwh}
                    onChange={(e) => setGridPerKwh(Number(e.target.value))}
                    className="w-20 text-xs font-bold text-stone-700 outline-none"
                  />
                </div>
                <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-stone-200 shadow-sm">
                  <span className="text-[10px] font-bold text-stone-400 uppercase">kWh/Day</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={gridKwhOverride ?? gridDailyKwh}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setGridKwhOverride(v === gridDailyKwh ? null : v);
                    }}
                    className="w-20 text-xs font-bold text-stone-700 outline-none"
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={exportToPDF}
                className="flex items-center gap-2 px-4 py-2.5 bg-stone-100 text-stone-600 rounded-2xl font-bold hover:bg-stone-200 transition-all border border-stone-200"
              >
                <Download className="w-5 h-5" /> PDF
              </button>
              {onSave && (
                <button 
                  onClick={onSave}
                  className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20"
                >
                  <Save className="w-5 h-5" /> Save
                </button>
              )}
              <button onClick={onClose} className="p-3 bg-white hover:bg-stone-100 rounded-2xl transition-all shadow-sm border border-stone-200">
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-8">
          <div className="min-w-[800px]">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="text-left p-4 bg-stone-50 rounded-tl-2xl border-b border-stone-200 text-xs font-bold uppercase tracking-widest text-stone-400">Feature</th>
                  {systems.map((s, i) => (
                    <th key={getSystemKey(s, i)} className="text-center p-4 bg-stone-50 border-b border-stone-200 text-sm font-black text-stone-900">
                      Option {i + 1}
                      <div className="text-[10px] font-bold text-emerald-600 uppercase mt-1">{s.inverter.split(' ')[0]}</div>
                    </th>
                  ))}
                  <th className="text-center p-4 bg-red-50 border-b border-red-100 text-sm font-black text-red-900 rounded-tr-2xl">
                    Generator
                    <div className="text-[10px] font-bold text-red-600 uppercase mt-1">{selectedGen.capacity_va >= 1000 ? (selectedGen.capacity_va/1000).toFixed(1) + 'kVA' : selectedGen.capacity_va + 'VA'}</div>
                  </th>
                  {hasGrid && (
                    <th className="text-center p-4 bg-amber-50 border-b border-amber-100 text-sm font-black text-amber-900 rounded-tr-2xl">
                      Grid Power
                      <div className="text-[10px] font-bold text-amber-600 uppercase mt-1">{gridPerKwh} ₦/kWh</div>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-stone-50">
                  <td className="p-4 font-bold text-stone-600 text-sm">Initial Cost</td>
                  {systems.map((s, i) => (
                    <td key={getSystemKey(s, i)} className="p-4 text-center font-black text-stone-900">₦{s.total_price.toLocaleString()}</td>
                  ))}
                  <td className="p-4 text-center font-black text-red-600">
                    {initialCost === 0 ? (
                      <span className="text-emerald-600">Owned</span>
                    ) : (
                      `₦${initialCost.toLocaleString()}`
                    )}
                  </td>
                  {hasGrid && (
                    <td className="p-4 text-center font-black text-amber-600">N/A <span className="text-[10px] opacity-60">(Grid Tie)</span></td>
                  )}
                </tr>
                <tr className="border-b border-stone-50 bg-stone-50/30">
                  <td className="p-4 font-bold text-stone-600 text-sm">Monthly Running Cost</td>
                  {systems.map((s, i) => (
                    <td key={getSystemKey(s, i)} className="p-4 text-center font-medium text-emerald-600">₦0 <span className="text-[10px] opacity-60">(Free Sun)</span></td>
                  ))}
                  <td className="p-4 text-center font-black text-red-600">₦{monthlyTotal.toLocaleString()}</td>
                  {hasGrid && (
                    <td className="p-4 text-center font-black text-amber-600">₦{gridMonthlyCost.toLocaleString()}</td>
                  )}
                </tr>
                <tr className="border-b border-stone-50">
                  <td className="p-4 font-bold text-stone-600 text-sm">5-Year Total Cost</td>
                  {systems.map((s, i) => (
                    <td key={getSystemKey(s, i)} className="p-4 text-center font-black text-stone-900">₦{s.total_price.toLocaleString()}</td>
                  ))}
                  <td className="p-4 text-center font-black text-red-600">₦{fiveYearTotal.toLocaleString()}</td>
                  {hasGrid && (
                    <td className="p-4 text-center font-black text-amber-600">₦{gridFiveYearCost.toLocaleString()}</td>
                  )}
                </tr>
                <tr className="border-b border-stone-50 bg-stone-50/30">
                  <td className="p-4 font-bold text-stone-600 text-sm">Amortized Monthly Cost</td>
                  {systems.map((s, i) => {
                    const amortized25yr = s.total_price / 300; // 25 years
                    const amortized10yr = s.total_price / 120; // 10 years (conservative)
                    return (
                      <td key={getSystemKey(s, i)} className="p-4 text-center">
                        <div className="font-black text-emerald-600 text-sm">₦{amortized25yr.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                        <div className="text-[10px] text-emerald-500 font-bold uppercase">25yr Standard</div>
                        <div className="mt-1 font-bold text-stone-900 text-xs">₦{amortized10yr.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                        <div className="text-[9px] text-stone-400 font-bold uppercase">10yr Conservative</div>
                      </td>
                    );
                  })}
                  <td className="p-4 text-center">
                    <div className="font-black text-red-600 text-sm">₦{((initialCost / selectedGen.lifespan_mo) + monthlyTotal).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                    <div className="text-[10px] text-red-400 font-bold uppercase">{selectedGen.lifespan_mo / 12}yr Lifespan</div>
                  </td>
                  {hasGrid && (
                    <td className="p-4 text-center">
                      <div className="font-black text-amber-600 text-sm">₦{gridAmortizedMonthly.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                      <div className="text-[10px] text-amber-400 font-bold uppercase">Per Month</div>
                    </td>
                  )}
                </tr>
                <tr className="border-b border-stone-50 bg-stone-50/30">
                  <td className="p-4 font-bold text-stone-600 text-sm">Fuel Type</td>
                  {systems.map((s, i) => (
                    <td key={getSystemKey(s, i)} className="p-4 text-center text-sm font-medium text-stone-400">N/A</td>
                  ))}
                  <td className="p-4 text-center text-sm font-bold text-red-600">{selectedGen.fuel_type}</td>
                  {hasGrid && (
                    <td className="p-4 text-center text-sm font-bold text-amber-600">Grid Tie</td>
                  )}
                </tr>
                <tr className="border-b border-stone-50">
                  <td className="p-4 font-bold text-stone-600 text-sm">Fuel Consumption</td>
                  {systems.map((s, i) => (
                    <td key={getSystemKey(s, i)} className="p-4 text-center text-sm font-medium text-stone-400">N/A</td>
                  ))}
                  <td className="p-4 text-center text-sm font-medium">{selectedGen.fuel_consumption_l_hr} L/hr</td>
                  {hasGrid && (
                    <td className="p-4 text-center text-sm font-medium">{gridDailyKwh.toFixed(1)} kWh/day</td>
                  )}
                </tr>
                <tr className="border-b border-stone-50 bg-stone-50/30">
                  <td className="p-4 font-bold text-stone-600 text-sm">Reliability</td>
                  {systems.map((s, i) => (
                    <td key={getSystemKey(s, i)} className="p-4 text-center text-xs font-medium text-emerald-600">Silent, Automatic</td>
                  ))}
                  <td className="p-4 text-center text-xs font-medium text-red-600">Noisy, Fumes, Manual Start</td>
                  {hasGrid && (
                    <td className="p-4 text-center text-xs font-medium text-amber-600">Always On, Metered</td>
                  )}
                </tr>
              </tbody>
            </table>

            <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
              {systems.map((s, i) => (
                <div key={getSystemKey(s, i)} className="bg-stone-50 p-6 rounded-3xl border border-stone-100">
                  <h4 className="text-xs font-black text-stone-400 uppercase tracking-widest mb-4">When Best to Use (Option {i+1})</h4>
                  <ul className="space-y-3">
                    {getSystemRecommendations(s, systems).map((rec, j) => (
                      <li key={getLogKey("rec", rec, j)} className="flex gap-2 text-sm text-stone-700 font-medium">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <div className="bg-red-50 p-6 rounded-3xl border border-red-100">
                <h4 className="text-xs font-black text-red-400 uppercase tracking-widest mb-4">Generator Profile: {selectedGen.name}</h4>
                <ul className="space-y-3">
                  <li className="flex gap-2 text-sm text-red-700 font-medium">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    Capacity: {selectedGen.capacity_va}VA (Supports {peakWatts}W peak)
                  </li>
                  <li className="flex gap-2 text-sm text-red-700 font-medium">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    Running Costs: ₦{monthlyFuel.toLocaleString()} fuel + ₦{maintenance.toLocaleString()} maintenance per month.
                  </li>
                  <li className="flex gap-2 text-sm text-red-700 font-medium">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    Environmental: High CO2 emissions and noise pollution.
                  </li>
                </ul>
              </div>
              {hasGrid && (
                <div className="bg-amber-50 p-6 rounded-3xl border border-amber-100">
                  <h4 className="text-xs font-black text-amber-400 uppercase tracking-widest mb-4">Grid Power Profile</h4>
                  <ul className="space-y-3">
                    <li className="flex gap-2 text-sm text-amber-700 font-medium">
                      <Zap className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      Cost: ₦{gridPerKwh}/kWh, {gridDailyKwh.toFixed(1)} kWh/day
                    </li>
                    <li className="flex gap-2 text-sm text-amber-700 font-medium">
                      <Zap className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      Monthly Bill: ₦{gridMonthlyCost.toLocaleString()}
                    </li>
                    <li className="flex gap-2 text-sm text-amber-700 font-medium">
                      <Zap className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      Always On, metered, no fuel logistics
                    </li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div className="p-8 bg-stone-50 border-t border-stone-100 text-center">
          <p className="text-sm text-stone-500 font-medium">
            Note: Generator costs are based on {selectedGen.fuel_type} at ₦{fuelPrice}/L and {genHours} hours daily usage. 
            Solar systems pay for themselves in approximately <span className="text-emerald-600 font-bold">{(systems[0].total_price / monthlyTotal).toFixed(1)} months</span>.
          </p>
        </div>
      </motion.div>
    </div>
  );
}

const getHourLabel = (hour: number) => {
  if (hour === 0) return "12 AM";
  if (hour === 24) return "12 AM (Midnight)";
  if (hour === 12) return "12 PM";
  return hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
};

const HOUR_OPTIONS = Array.from({ length: 25 }, (_, i) => ({
  value: i,
  label: getHourLabel(i),
}));

function Tooltip({ content, children }: { content: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative flex items-center" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-64 p-3 bg-stone-800 text-white text-[10px] rounded-xl shadow-xl z-50 pointer-events-none"
          >
            <div className="font-bold mb-1 border-b border-stone-700 pb-1">Example Format:</div>
            <pre className="whitespace-pre-wrap font-mono opacity-80">{content}</pre>
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-stone-800" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>("calculator");
  const [region, setRegion] = useState<Region>("SE_SS");
  const [batteryPreference, setBatteryPreference] = useState<BatteryPreference>("any");
  const [tolerance, setTolerance] = useState<number>(20);
  const [showHighRisk, setShowHighRisk] = useState<boolean>(true); // Show High Risk systems in results
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [devices, setDevices] = useState<Device[]>([]);
  const [savedResults, setSavedResults] = useState<SavedResult[]>(() => {
    const saved = localStorage.getItem("ss_results");
    return saved ? JSON.parse(saved) : [];
  });
  const [masterDevices, setMasterDevices] = useState<MasterDevice[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductTag, setSelectedProductTag] = useState<string>("all");
  const [isCompact, setIsCompact] = useState(false);

  // URL Parameter Handling
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab") as AppTab;
    const tag = params.get("tag");
    const compact = params.get("compact") === "true";

    if (tab) setActiveTab(tab);
    if (tag) {
      setSelectedProductTag(tag);
      // The catalog is grouped by category, so the link jumps to the section.
      window.setTimeout(
        () => document.getElementById(`catalog-${tag}`)?.scrollIntoView({ behavior: "smooth", block: "start" }),
        400
      );
    }
    if (compact) setIsCompact(true);
  }, []);
  
  // Developer Access Check
  const [isDeveloper, setIsDeveloper] = useState<boolean>(() => {
    return sessionStorage.getItem("ss_admin_unlocked") === "true";
  });

  // Unlock admin mode via URL param: ?admin=true
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("admin") === "true") {
      const password = prompt("Enter admin password to unlock developer features:");
      if (!password) return;

      // Verify the password with the server before unlocking
      fetch("/api/admin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      })
        .then((res) => res.json() as Promise<{ valid?: boolean }>)
        .then((data) => {
          if (data.valid) {
            sessionStorage.setItem("ss_admin_unlocked", "true");
            sessionStorage.setItem("ss_admin_key", password);
            setIsDeveloper(true);
            // Clean the URL so the param doesn't stay visible
            window.history.replaceState({}, "", window.location.pathname);
            alert("✅ Admin mode unlocked for this session.");
          } else {
            alert("❌ Incorrect password.");
          }
        })
        .catch(() => alert("Could not verify password with server."));
    }
  }, []);

  // Fetch public master data — no auth needed
  useEffect(() => {
    // Fetch public master data — no auth needed
    sdk.getDevices().then(setMasterDevices).catch(console.error);
    sdk.getProducts().then(setProducts).catch(console.error);
    sdk.getSettings("margins").then(m => m && setMargins(m)).catch(console.error);
    sdk.getSettings("pdf_settings").then(p => p && setPdfSettings(normalizePdfSettings(p))).catch(console.error);
    
    // Fetch global hardware
    sdk.getHardware().then(data => {
      const globalInverters = data.filter((h: any) => h.type === 'inverter').map((h: any) => h.data);
      const globalPanels = data.filter((h: any) => h.type === 'panel').map((h: any) => h.data);
      const globalBatteries = data.filter((h: any) => h.type === 'battery').map((h: any) => h.data);
      const globalPowerstations = data.filter((h: any) => h.type === 'powerstation').map((h: any) => h.data);

      // Merge global hardware into the local list by id so user-added custom
      // items (which only exist in local storage) are never wiped out when the
      // server catalog is refreshed. Local-only ids are preserved; ids present
      // in the global list are updated in place; new global ids are appended.
      // If local storage is empty, fall back to the global defaults.
      const mergeById = <T extends { id: string }>(local: T[], globalItems: T[]): T[] => {
        if (local.length === 0) return globalItems;
        const merged = [...local];
        for (const item of globalItems) {
          const idx = merged.findIndex(m => m.id === item.id);
          if (idx >= 0) merged[idx] = item;
          else merged.push(item);
        }
        return merged;
      };

      if (globalInverters.length > 0) setInverters(prev => mergeById(prev, globalInverters));
      if (globalPanels.length > 0) setPanels(prev => mergeById(prev, globalPanels));
      if (globalBatteries.length > 0) setBatteries(prev => mergeById(prev, globalBatteries));
      if (globalPowerstations.length > 0) setPowerstations(prev => mergeById(prev, globalPowerstations));
    }).catch(console.error);
  }, []); // Empty dependency array — runs once on mount
  
  // Hardware State
  const [inverters, setInverters] = useState<Inverter[]>(() => {
    const saved = localStorage.getItem("ss_inverters");
    const data: Inverter[] = saved ? JSON.parse(saved) : DEFAULT_INVERTERS;
    // Migration: Ensure all have IDs and cc_type
    return data.map((item, idx) => ({ 
      ...item, 
      id: item.id || `inv-legacy-${idx}`,
      cc_type: item.cc_type || "pwm"
    }));
  });
  const [panels, setPanels] = useState<Panel[]>(() => {
    const saved = localStorage.getItem("ss_panels");
    const data: Panel[] = saved ? JSON.parse(saved) : DEFAULT_PANELS;
    return data.map((item, idx) => ({ ...item, id: item.id || `p-legacy-${idx}` }));
  });
  const [batteries, setBatteries] = useState<Battery[]>(() => {
    const saved = localStorage.getItem("ss_batteries");
    const data: Battery[] = saved ? JSON.parse(saved) : DEFAULT_BATTERIES;
    return data.map((item, idx) => ({ ...item, id: item.id || `b-legacy-${idx}` }));
  });
  const [powerstations, setPowerstations] = useState<Powerstation[]>(() => {
    const saved = localStorage.getItem("ss_powerstations");
    const data: Powerstation[] = saved ? JSON.parse(saved) : (typeof POWERSTATIONS !== 'undefined' ? POWERSTATIONS : []);
    return data.map((item, idx) => ({ ...item, id: item.id || `ps-legacy-${idx}` }));
  });
  const [chargeControllers, setChargeControllers] = useState<ChargeController[]>(() => {
    const saved = localStorage.getItem("ss_charge_controllers");
    const data: ChargeController[] = saved ? JSON.parse(saved) : (typeof CHARGE_CONTROLLERS !== 'undefined' ? CHARGE_CONTROLLERS : []);
    return data.map((item, idx) => ({ ...item, id: item.id || `cc-legacy-${idx}` }));
  });
  const [wiring, setWiring] = useState<WiringItem[]>(() => {
    // v2 key: v1 only ever held the small default seed, before wiring was editable.
    const saved = localStorage.getItem("ss_wiring_v2");
    const data: WiringItem[] = saved ? JSON.parse(saved) : DEFAULT_WIRING;
    const seeds = new Map(DEFAULT_WIRING.map((item) => [item.id, item]));
    return data.map((item, idx) => {
      const id = item.id || `w-legacy-${idx}`;
      return {
        ...item,
        id,
        // Saved items predate tooltips, so fall back to the seed copy by id.
        tooltip: item.tooltip ?? seeds.get(id)?.tooltip,
        // Seeds used to store title-case spec keys, which blanked the edit form.
        specs: normalizeWiringSpecs(item.specs ?? {}),
      };
    });
  });

  // Track which nice-to-have wiring items are selected
  const [selectedNiceToHaveIds, setSelectedNiceToHaveIds] = useState<Set<string>>(new Set());
  // Track which charge controllers are selected as optional add-ons (cosmetic only —
  // they are never passed to sizeWiring, so they never affect the calc or the quote).
  const [selectedChargeControllerIds, setSelectedChargeControllerIds] = useState<Set<string>>(new Set());
  // Track quantity for each wiring item (by id)
  const [wiringQuantities, setWiringQuantities] = useState<Record<string, number>>({});
  // Partial/Upgrade mode: allows toggling ALL components (inverters, panels, batteries, wiring)
  const [partialMode, setPartialMode] = useState(false);
  // Track which main components are included in partial mode
  const [partialIncludedComponents, setPartialIncludedComponents] = useState<{
    inverter: boolean;
    panels: boolean;
    batteries: boolean;
  }>({ inverter: true, panels: true, batteries: true });
  // Track expanded state for Available Optional Items
  const [showOptionalItems, setShowOptionalItems] = useState(false);
  const [optionalSearch, setOptionalSearch] = useState("");

  // Internal Logs State
  const [internalLogs, setInternalLogs] = useState<CalculationAttempt[]>(() => {
    const saved = localStorage.getItem("ss_internal_logs");
    return saved ? JSON.parse(saved) : [];
  });

  // Profit Margins State
  const [margins, setMargins] = useState<ProfitMargins>(() => {
    const saved = localStorage.getItem("ss_margins");
    return saved ? JSON.parse(saved) : { inverter: 0, panel: 0, battery: 0, powerstation: 0, product: 0 };
  });

  // PDF Quote Settings State
  const [pdfSettings, setPdfSettings] = useState<PDFSettings>(() => {
    const saved = localStorage.getItem("ss_pdf_settings");
    return saved ? normalizePdfSettings(JSON.parse(saved)) : DEFAULT_PDF_SETTINGS;
  });

  const [newDevice, setNewDevice] = useState<Omit<Partial<Device>, 'qty' | 'watts'> & { qty?: number | ""; watts?: number | "" }>({
    name: "",
    category: "electronics",
    qty: 1,
    watts: 0,
    ranges: [],
  });
  const [newRange, setNewRange] = useState({ start: 18, end: 23 });
  const [selectedSystemLog, setSelectedSystemLog] = useState<string[] | null>(null);
  const [selectedSystemDetails, setSelectedSystemDetails] = useState<SystemCombination | null>(null);
  /** Which page opened the details modal. Catalog products are looser than results. */
  const [detailSource, setDetailSource] = useState<"results" | "catalog">("results");
  const [selectedInternetDevice, setSelectedInternetDevice] = useState<MasterDevice | null>(null);
  const [selectedInternetProduct, setSelectedInternetProduct] = useState<Product | null>(null);
  const [showInteractiveBridge, setShowInteractiveBridge] = useState(false);
  const [adjustedLoad, setAdjustedLoad] = useState<{ devices: Device[], deficit: number } | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [resultFilter, setResultFilter] = useState<"all" | "kits" | "powerstations">("all");
  const [productDraft, setProductDraft] = useState<ProductDraft | null>(null);

  /** Turn a calculated system into a catalog product draft. */
  const openPromoteEditor = (system: SystemCombination) => {
    if (!sessionStorage.getItem("ss_admin_key")) {
      alert("Admin session expired. Visit ?admin=true to unlock again.");
      return;
    }
    setProductDraft({
      ...emptyProductDraft(),
      mode: "promote",
      id: Math.random().toString(36).substr(2, 9),
      name: `${system.inverter} System`,
      description: `Complete solar system with ${system.panel_config} and ${system.battery_config}.`,
      price: String(system.total_price || 0),
      product_type: "system",
      kit_type: system.kit_type ?? "solar",
      tags: "residential",
      shape: "kit",
      inverter: system.inverter ?? "",
      inverter_w: String(system.inverter_w ?? ""),
      inverter_price: String(system.inverter_price ?? ""),
      battery: system.battery_config ?? "",
      battery_price: String(system.battery_price ?? ""),
      panel: system.panel_config ?? "",
      panel_w: String(system.panel_w ?? ""),
      panel_price: String(system.panel_price ?? ""),
      sourceSystem: system,
    });
  };

  /** Start an empty product draft so the admin can enter one by hand. */
  const openManualProductEditor = () => {
    if (!sessionStorage.getItem("ss_admin_key")) {
      alert("Admin session expired. Visit ?admin=true to unlock again.");
      return;
    }
    setProductDraft({
      ...emptyProductDraft(),
      mode: "manual",
      id: Math.random().toString(36).substr(2, 9),
    });
  };

  /** Start an internet kit draft, ready for the admin to pick the devices. */
  const openInternetKitEditor = () => {
    if (!sessionStorage.getItem("ss_admin_key")) {
      alert("Admin session expired. Visit ?admin=true to unlock again.");
      return;
    }
    setProductDraft({
      ...emptyProductDraft(),
      mode: "manual",
      id: Math.random().toString(36).substr(2, 9),
      kit_type: "internet",
      product_type: "system",
      shape: "kit",
      tags: "internet",
    });
  };

  /** Edit a product that is already in the catalog. */
  const openEditProduct = (product: Product) => {
    if (!sessionStorage.getItem("ss_admin_key")) {
      alert("Admin session expired. Visit ?admin=true to unlock again.");
      return;
    }
    const cd = product.combination_data;
    const has = (value: unknown) => !!value && value !== "N/A";
    const shape: ProductDraft["shape"] = has(cd?.panel_config) && has(cd?.battery_config)
      ? "kit"
      : has(cd?.battery_config)
      ? "setup"
      : "single";
    const singleRole: ProductDraft["single_role"] = has(cd?.panel_config)
      ? "panel"
      : has(cd?.battery_config)
      ? "battery"
      : "inverter";
    setProductDraft({
      ...emptyProductDraft(),
      mode: "manual",
      id: product.id,
      name: product.name,
      description: product.description,
      price: String(product.price || ""),
      product_type: product.product_type,
      kit_type: cd?.kit_type ?? "solar",
      tags: (product.tags ?? []).join(", "),
      shape,
      single_role: singleRole,
      inverter: cd?.inverter ?? "",
      inverter_w: String(cd?.inverter_w ?? ""),
      inverter_vdc: String(cd?.inverter_system_vdc ?? ""),
      inverter_price: String(cd?.inverter_price ?? ""),
      battery: cd?.battery_config ?? "",
      battery_voltage: String(cd?.battery_voltage ?? ""),
      battery_ah: String(cd?.battery_ah ?? ""),
      battery_price: String(cd?.battery_price ?? ""),
      panel: cd?.panel_config ?? "",
      panel_w: String(cd?.panel_w ?? ""),
      panel_voc: String(cd?.panel_voc ?? ""),
      panel_isc: String(cd?.panel_isc ?? ""),
      panel_price: String(cd?.panel_price ?? ""),
      cc: cd?.cc_name ?? "",
      cc_pv: String(cd?.cc_max_pv_w ?? ""),
      cc_voc: String(cd?.cc_max_voc ?? ""),
      cc_amps: String(cd?.cc_max_amps ?? ""),
      cc_price: String(cd?.cc_price ?? ""),
      ps_capacity: String(cd?.battery_wh ?? ""),
      ps_output: String(cd?.inverter_w ?? ""),
      ps_pv: String(cd?.panel_w ?? ""),
    });
  };

  const saveProductDraft = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const draft = productDraft;
    if (!draft) return;
    const adminKey = sessionStorage.getItem("ss_admin_key");
    if (!adminKey) {
      alert("Admin session expired. Visit ?admin=true to unlock again.");
      return;
    }

    const num = (value: string) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const tags = draft.tags.split(",").map((t) => t.trim()).filter(Boolean);
    // Internet kits always carry the internet tag so they show on that tab.
    if (draft.kit_type === "internet" && !tags.includes("internet")) tags.push("internet");
    const price = num(draft.price);

    let combination_data: SystemCombination | null = null;
    let type: "standalone" | "combination" = "combination";

    if (draft.mode === "promote" && draft.sourceSystem) {
      combination_data = { ...draft.sourceSystem, total_price: price || draft.sourceSystem.total_price };
    } else if (draft.kit_type === "internet") {
      // An internet kit is a bundle of the internet devices in the catalogue.
      const picked = draft.net_devices
        .map((id) => masterDevices.find((md) => md.id === id))
        .filter(Boolean) as MasterDevice[];
      type = "combination";
      combination_data = {
        inverter: draft.net_router || picked[0]?.name || "Load Balancing Router",
        inverter_price: price,
        inverter_w: 0,
        battery_config: "",
        battery_price: 0,
        panel_config: "",
        panel_price: 0,
        array_size_w: 0,
        battery_total_wh: 0,
        total_price: price,
        daily_yield: 0,
        deficit: 0,
        status: "Optimal",
        advice: draft.description,
        log: [draft.description],
        kit_type: "internet",
        is_preconfigured: true,
        component_specs: picked.map((md) => ({
          role: "network" as const,
          name: md.name,
          quantity: 1,
          specs: { price: md.price ?? 0, watts: md.default_watts, device_class: md.specs?.device_class ?? "" },
        })),
      };
    } else if (draft.kit_type === "powerstation") {
      type = "standalone";
      const capacity = num(draft.ps_capacity);
      const output = num(draft.ps_output);
      combination_data = {
        inverter: draft.name,
        inverter_price: price,
        inverter_w: output,
        battery_config: `${capacity}Wh integrated`,
        battery_price: 0,
        battery_wh: capacity,
        battery_total_wh: capacity,
        panel_config: "",
        panel_price: 0,
        panel_w: num(draft.ps_pv),
        array_size_w: 0,
        total_price: price,
        daily_yield: 0,
        deficit: 0,
        status: "Optimal",
        advice: draft.description,
        log: [draft.description],
        kit_type: "powerstation",
        all_in_one: true,
        is_preconfigured: true,
      };
    } else {
      // Solar: the shape decides which parts the product carries.
      const roles = draft.shape === "single" ? [draft.single_role] : PRODUCT_SHAPE_ROLES[draft.shape];
      type = draft.shape === "single" ? "standalone" : "combination";

      let inverter = "", inverterW = 0, inverterPrice = 0;
      let battery = "", batteryWh = 0, batteryPrice = 0;
      let batteryVoltage = 0, batteryAh = 0;
      let panel = "", panelW = 0, panelPrice = 0, panelVoc = 0, panelIsc = 0;
      let cc = "", ccPrice = 0, ccPv = 0, ccVoc = 0, ccAmps = 0;

      if (roles.includes("inverter")) {
        inverter = draft.inverter;
        inverterW = num(draft.inverter_w);
        inverterPrice = num(draft.inverter_price);
      }
      if (roles.includes("battery")) {
        battery = draft.battery;
        batteryVoltage = num(draft.battery_voltage);
        batteryAh = num(draft.battery_ah);
        batteryWh = batteryVoltage * batteryAh;
        batteryPrice = num(draft.battery_price);
      }
      if (roles.includes("panel")) {
        panel = draft.panel;
        panelW = num(draft.panel_w);
        panelVoc = num(draft.panel_voc);
        panelIsc = num(draft.panel_isc);
        panelPrice = num(draft.panel_price);
      }
      if (roles.includes("chargeController")) {
        cc = draft.cc;
        ccPrice = num(draft.cc_price);
        ccPv = num(draft.cc_pv);
        ccVoc = num(draft.cc_voc);
        ccAmps = num(draft.cc_amps);
      }
      if (roles.includes("accessory")) {
        // An accessory carries no parts, so it stands in as the inverter slot.
        inverter = draft.name;
        inverterPrice = price;
      }

      const partsTotal = inverterPrice + batteryPrice + panelPrice + ccPrice;
      combination_data = {
        inverter,
        inverter_price: inverterPrice,
        inverter_w: inverterW,
        inverter_system_vdc: num(draft.inverter_vdc) || batteryVoltage || undefined,
        battery_config: battery,
        battery_price: batteryPrice,
        battery_wh: batteryWh,
        battery_total_wh: batteryWh,
        battery_voltage: batteryVoltage || undefined,
        battery_ah: batteryAh || undefined,
        panel_config: panel,
        panel_price: panelPrice,
        panel_w: panelW,
        panel_voc: panelVoc || undefined,
        panel_isc: panelIsc || undefined,
        array_size_w: panelW,
        cc_type: cc ? "mppt" : undefined,
        cc_max_pv_w: ccPv || undefined,
        cc_max_voc: ccVoc || undefined,
        cc_max_amps: ccAmps || undefined,
        cc_price: ccPrice || undefined,
        cc_name: cc || undefined,
        total_price: price || partsTotal,
        daily_yield: 0,
        deficit: 0,
        status: "Optimal",
        advice: draft.description,
        log: [draft.description],
        kit_type: draft.kit_type,
        is_preconfigured: true,
      };
    }

    const product = {
      id: draft.id,
      name: draft.name,
      description: draft.description,
      type,
      combination_data,
      tags,
      price: price || combination_data?.total_price || 0,
      product_type: draft.product_type,
    };

    try {
      await sdk.saveProduct(product, adminKey);
      alert("✅ Product saved successfully!");
      setProductDraft(null);
      sdk.getProducts().then(setProducts);
    } catch (err: any) {
      if (err.response?.status === 403) {
        alert("❌ Admin session rejected by server. Unlock again via ?admin=true.");
        sessionStorage.removeItem("ss_admin_unlocked");
        sessionStorage.removeItem("ss_admin_key");
        setIsDeveloper(false);
      } else {
        console.error("Failed to save product:", err);
        alert("Failed to save product. Check console.");
      }
    }
  };

  const deleteProduct = async (id: string) => {
    const adminKey = sessionStorage.getItem("ss_admin_key");
    if (!adminKey) {
      alert("Admin session expired. Visit ?admin=true to unlock again.");
      return;
    }

    if (!confirm("Are you sure you want to delete this product?")) return;
    try {
      const res = await fetch(`/api/products/${id}`, { 
        method: 'DELETE',
        headers: { 'x-admin-key': adminKey }
      });
      
      if (res.status === 403) {
        alert("❌ Admin session rejected by server. Unlock again via ?admin=true.");
        sessionStorage.removeItem("ss_admin_unlocked");
        sessionStorage.removeItem("ss_admin_key");
        setIsDeveloper(false);
        return;
      }

      if (!res.ok) throw new Error("Delete failed");

      setProducts(prev => prev.filter(p => p.id !== id));
      alert("✅ Product deleted.");
    } catch (err) {
      console.error("Failed to delete product:", err);
      alert("Failed to delete product.");
    }
  };
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  // Track which range index is being edited inline (for quick schedule tweaks)
  const [editingRangeDeviceId, setEditingRangeDeviceId] = useState<string | null>(null);
  const [editingRangeIndex, setEditingRangeIndex] = useState<number>(-1);
  const [tempRange, setTempRange] = useState<TimeRange>({ start: 18, end: 23 });
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(null);
  const [selectedSavedAnalysis, setSelectedSavedAnalysis] = useState<SavedResult | null>(null);
  const [selectedSavedComparison, setSelectedSavedComparison] = useState<SavedResult | null>(null);
  const [hasGenerator, setHasGenerator] = useState(() => {
    return localStorage.getItem("ss_has_generator") === "true";
  });
  const [hasGrid, setHasGrid] = useState(() => {
    return localStorage.getItem("ss_has_grid") === "true";
  });
  const [gridPerKwh, setGridPerKwh] = useState(() => {
    const saved = localStorage.getItem("ss_grid_per_kwh");
    return saved ? Number(saved) : 12;
  });
  const [gridKwhOverride, setGridKwhOverride] = useState<number | null>(() => {
    const saved = localStorage.getItem("ss_grid_kwh_override");
    return saved ? Number(saved) : null;
  });

  useEffect(() => {
    localStorage.setItem("ss_has_generator", String(hasGenerator));
    storeSet("ss_has_generator", hasGenerator).catch(() => {});
  }, [hasGenerator]);
  useEffect(() => {
    localStorage.setItem("ss_has_grid", String(hasGrid));
    storeSet("ss_has_grid", hasGrid).catch(() => {});
  }, [hasGrid]);
  useEffect(() => {
    localStorage.setItem("ss_grid_per_kwh", String(gridPerKwh));
    storeSet("ss_grid_per_kwh", gridPerKwh).catch(() => {});
  }, [gridPerKwh]);
  useEffect(() => {
    if (gridKwhOverride === null) {
      localStorage.removeItem("ss_grid_kwh_override");
      storeRemove("ss_grid_kwh_override").catch(() => {});
    } else {
      localStorage.setItem("ss_grid_kwh_override", String(gridKwhOverride));
      storeSet("ss_grid_kwh_override", gridKwhOverride).catch(() => {});
    }
  }, [gridKwhOverride]);

  const [selectedForComparison, setSelectedForComparison] = useState<SystemCombination[]>([]);
  const [showComparison, setShowComparison] = useState(false);
  const toggleComparison = (sys: SystemCombination) => {
    const isSelected = selectedForComparison.some(s => 
      s.inverter === sys.inverter && 
      s.battery_config === sys.battery_config && 
      s.panel_config === sys.panel_config
    );

    if (isSelected) {
      setSelectedForComparison(prev => prev.filter(s => 
        !(s.inverter === sys.inverter && 
          s.battery_config === sys.battery_config && 
          s.panel_config === sys.panel_config)
      ));
    } else {
      if (selectedForComparison.length >= 4) {
        alert("You can compare up to 4 systems at once.");
        return;
      }
      setSelectedForComparison(prev => [...prev, sys]);
    }
  };

  const isSelectedForComparison = (sys: SystemCombination) => {
    return selectedForComparison.some(s => 
      s.inverter === sys.inverter && 
      s.battery_config === sys.battery_config && 
      s.panel_config === sys.panel_config
    );
  };

  // Hardware Form State
  const [showAddHardware, setShowAddHardware] = useState<HardwareType | null>(null);
  const [editingHardware, setEditingHardware] = useState<{ type: HardwareType, id: string, item?: any } | null>(null);
  const [wiringCategoryForAdd, setWiringCategoryForAdd] = useState<WiringCategory>("cables");

  const [showAddMasterDevice, setShowAddMasterDevice] = useState(false);
  const [editingMasterDevice, setEditingMasterDevice] = useState<MasterDevice | null>(null);
  const [masterDeviceClass, setMasterDeviceClass] = useState<string>("");
  const [masterDeviceCategory, setMasterDeviceCategory] = useState<DeviceCategory>("electronics");

  const safeLocalStorageSet = (key: string, value: any) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      // Mirror to SQLite so clearing browser storage does not destroy the data.
      storeSet(key, value).catch(() => {});
      return true;
    } catch (e) {
      if (e instanceof DOMException && e.name === "QuotaExceededError") {
        alert("⚠️ Browser Storage Full: Could not save data. Please clear some logs or saved results to free up space.");
      } else {
        console.error("Storage error:", e);
      }
      return false;
    }
  };

  // Profile State
  const [profiles, setProfiles] = useState<UserProfile[]>(() => {
    const saved = localStorage.getItem("ss_profiles");
    return saved ? JSON.parse(saved) : [];
  });

  // Restore localStorage from SQLite when a key is missing (e.g. user cleared
  // browser storage). Runs once on mount after all useState declarations; the
  // setters repopulate the UI. The persist effect's first-run skip (below)
  // prevents defaults from clobbering the restored values.
  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      const restorations: Array<[string, Promise<unknown | null>]> = [
        [KEY.INVERTERS, storeGet<Inverter[]>(KEY.INVERTERS)],
        [KEY.PANELS, storeGet<Panel[]>(KEY.PANELS)],
        [KEY.BATTERIES, storeGet<Battery[]>(KEY.BATTERIES)],
        [KEY.POWERSTATIONS, storeGet<Powerstation[]>(KEY.POWERSTATIONS)],
        [KEY.PROFILES, storeGet<UserProfile[]>(KEY.PROFILES)],
        [KEY.RESULTS, storeGet<SavedResult[]>(KEY.RESULTS)],
        [KEY.MARGINS, storeGet<ProfitMargins>(KEY.MARGINS)],
        [KEY.PDF_SETTINGS, storeGet<PDFSettings>(KEY.PDF_SETTINGS)],
        [KEY.INTERNAL_LOGS, storeGet<CalculationAttempt[]>(KEY.INTERNAL_LOGS)],
      ];
      for (const [key, promise] of restorations) {
        if (localStorage.getItem(key) != null) continue; // already present
        const value = await promise;
        if (cancelled || value == null) continue;
        try {
          localStorage.setItem(key, JSON.stringify(value));
        } catch {
          // ignore — the in-memory state below is what matters
        }
        switch (key) {
          case KEY.INVERTERS: setInverters(value as Inverter[]); break;
          case KEY.PANELS: setPanels(value as Panel[]); break;
          case KEY.BATTERIES: setBatteries(value as Battery[]); break;
          case KEY.POWERSTATIONS: setPowerstations(value as Powerstation[]); break;
          case KEY.PROFILES: setProfiles(value as UserProfile[]); break;
          case KEY.RESULTS: setSavedResults(value as SavedResult[]); break;
          case KEY.MARGINS: setMargins(value as ProfitMargins); break;
          case KEY.PDF_SETTINGS: setPdfSettings(value as PDFSettings); break;
          case KEY.INTERNAL_LOGS: setInternalLogs(value as CalculationAttempt[]); break;
        }
      }
      // ss_has_generator is a boolean flag, handled separately below
      if (localStorage.getItem(KEY.HAS_GENERATOR) == null) {
        const flag = await storeGet<boolean>(KEY.HAS_GENERATOR);
        if (!cancelled && flag != null) {
          try { localStorage.setItem(KEY.HAS_GENERATOR, String(flag)); } catch {}
          setHasGenerator(flag);
        }
      }
    };
    restore();
    return () => { cancelled = true; };
  }, []);

  // Skip the first mount run so the restore effect above can populate state
  // from SQLite before anything is written back. Subsequent runs mirror the
  // current state to both localStorage and SQLite.
  const persistMountedRef = useRef(false);
  const [showSaveProfile, setShowSaveProfile] = useState(false);
  const [profileName, setProfileName] = useState("");

  const results = useMemo(() => {
    if (devices.length === 0) return null;
    const res = buildCombinations(region, devices, { inverters, panels, batteries, powerstations, chargeControllers, wiring }, batteryPreference, tolerance, products, margins, showHighRisk, Array.from(selectedNiceToHaveIds));
    return res;
  }, [region, devices, inverters, panels, batteries, powerstations, wiring, batteryPreference, tolerance, products, margins, showHighRisk, selectedNiceToHaveIds]);

  // Internal Logging with Duplicate Check
  useEffect(() => {
    if (!results) return;

    const attempt: CalculationAttempt = {
      timestamp: new Date().toISOString(),
      location: region,
      devices: [...devices],
      analysis: results.analysis,
      totalCombinationsChecked: results.allLogs.length,
      validSystemsCount: results.systems.length,
      allLogs: results.allLogs,
    };

    setInternalLogs(prev => {
      const last = prev[0];
      if (last) {
        // Simple duplicate check based on analysis summary and device count
        const isDuplicate = 
          last.analysis.max_surge === attempt.analysis.max_surge &&
          last.analysis.total_daily_wh === attempt.analysis.total_daily_wh &&
          last.devices.length === attempt.devices.length &&
          last.validSystemsCount === attempt.validSystemsCount;
        
        if (isDuplicate) return prev;
      }

      const updated = [attempt, ...prev].slice(0, 20); // Limit to 20 entries
      safeLocalStorageSet("ss_internal_logs", updated);
      return updated;
    });
  }, [results, region, devices]);

  // Reset pagination when results change
  useEffect(() => {
    setCurrentPage(1);
  }, [results]);

  // Persist Hardware
  useEffect(() => {
    if (!persistMountedRef.current) {
      persistMountedRef.current = true;
      return;
    }
    safeLocalStorageSet("ss_inverters", inverters);
    safeLocalStorageSet("ss_panels", panels);
    safeLocalStorageSet("ss_batteries", batteries);
    safeLocalStorageSet("ss_powerstations", powerstations);
    safeLocalStorageSet("ss_charge_controllers", chargeControllers);
    safeLocalStorageSet("ss_wiring_v2", wiring);
    safeLocalStorageSet("ss_profiles", profiles);
    safeLocalStorageSet("ss_margins", margins);
    safeLocalStorageSet("ss_pdf_settings", pdfSettings);
  }, [inverters, panels, batteries, powerstations, chargeControllers, wiring, profiles, margins, pdfSettings]);

  // Persist selected charge controllers globally (survives page refresh)
  useEffect(() => {
    if (!persistMountedRef.current) return;
    safeLocalStorageSet("ss_selected_charge_controllers", Array.from(selectedChargeControllerIds));
  }, [selectedChargeControllerIds]);

  // Restore selected charge controllers from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("ss_selected_charge_controllers");
    if (saved) {
      try {
        const ids = JSON.parse(saved);
        if (Array.isArray(ids)) setSelectedChargeControllerIds(new Set(ids));
      } catch {}
    }
  }, []);

  const saveProfile = async () => {
    if (!profileName.trim()) return;
    
    const existingIndex = profiles.findIndex(p => p.id === currentProfileId || p.name === profileName);
    
    const newProfile: UserProfile = {
      id: existingIndex >= 0 ? profiles[existingIndex].id : crypto.randomUUID(),
      name: profileName,
      timestamp: new Date().toISOString(),
      region,
      batteryPreference,
      devices: [...devices],
    };

    let updated: UserProfile[];
    if (existingIndex >= 0) {
      updated = [...profiles];
      updated[existingIndex] = newProfile;
    } else {
      updated = [newProfile, ...profiles];
    }
    
    if (safeLocalStorageSet("ss_profiles", updated)) {
      setProfiles(updated);
      setCurrentProfileId(newProfile.id);
      setProfileName("");
      setShowSaveProfile(false);
      alert("Profile saved successfully.");
    }
  };

  const deleteProfile = async (id: string) => {
    const updated = profiles.filter((p) => p.id !== id);
    if (safeLocalStorageSet("ss_profiles", updated)) {
      setProfiles(updated);
    }
  };

  const saveResult = async (system: SystemCombination) => {
    const name = prompt(
      "Enter a name for this saved result:",
      `Result - ${new Date().toLocaleDateString()}`
    );
    if (!name) return;

    const newResult: SavedResult = {
      id: crypto.randomUUID(),
      profile_name: name,
      system_data: system,
      devices: [...devices],
      created_at: new Date().toISOString(),
    };

    const updated = [newResult, ...savedResults];
    if (safeLocalStorageSet("ss_results", updated)) {
      setSavedResults(updated);
      alert("Result saved.");
    }
  };

  const saveAnalysis = async () => {
    if (!results || results.systems.length === 0) return;

    const name = prompt(
      "Enter a name for this saved analysis:",
      `Analysis - ${new Date().toLocaleDateString()}`
    );
    if (!name) return;

    const newResult: SavedResult = {
      id: crypto.randomUUID(),
      profile_name: name,
      analysis: results.analysis,
      systems: results.systems,
      devices: [...devices],
      created_at: new Date().toISOString(),
    };

    const updated = [newResult, ...savedResults];
    if (safeLocalStorageSet("ss_results", updated)) {
      setSavedResults(updated);
      alert("Analysis saved.");
    }
  };
  
  const saveComparison = async () => {
    if (selectedForComparison.length === 0 || !results) return;

    const name = prompt(
      "Enter a name for this comparison:",
      `Comparison - ${new Date().toLocaleDateString()}`
    );
    if (!name) return;

    const newResult: SavedResult = {
      id: crypto.randomUUID(),
      profile_name: name,
      analysis: results.analysis,
      systems: selectedForComparison,
      devices: [...devices],
      is_comparison: true,
      has_generator: hasGenerator,
      has_grid: hasGrid,
      grid_per_kwh: gridPerKwh,
      grid_kwh_override: gridKwhOverride,
      created_at: new Date().toISOString(),
    };

    const updated = [newResult, ...savedResults];
    if (safeLocalStorageSet("ss_results", updated)) {
      setSavedResults(updated);
      alert("Comparison saved.");
    }
  };

  const deleteResult = async (id: string) => {
    setSavedResults((prev) => {
      const updated = prev.filter((r) => r.id !== id);
      localStorage.setItem("ss_results", JSON.stringify(updated));
      storeSet("ss_results", updated).catch(() => {});
      return updated;
    });
  };

  const loadProfile = (p: UserProfile) => {
    setRegion(p.region);
    setBatteryPreference(p.batteryPreference);
    setDevices([...p.devices]);
    setCurrentProfileId(p.id);
    setActiveTab("calculator");
  };

  const downloadFile = (content: string, fileName: string, contentType: string) => {
    const a = document.createElement("a");
    const file = new Blob([content], { type: contentType });
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const exportComparisonToPDF = (
    profileName: string,
    systems: SystemCombination[],
    hasGen: boolean = false,
    genHours: number = 6,
    fuelPriceOverride: number | null = null,
    hasGridFlag: boolean = false,
    gridPerKwh: number = 12,
    gridKwhOverride: number | null = null,
    savedAnalysis?: LoadAnalysis
  ) => {
    const doc = new jsPDF('l', 'mm', 'a4');
    const timestamp = new Date().toLocaleString();
    
    doc.setFontSize(22);
    doc.setTextColor(16, 185, 129);
    doc.text(`System Comparison: ${profileName}`, 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated on: ${timestamp}`, 14, 28);

    const activeAnalysis = savedAnalysis || results?.analysis;
    const peakWatts = activeAnalysis?.max_surge || 0;
    const requiredVA = peakWatts / 0.8;
    const selectedGen = GENERATOR_PROFILES.find(g => g.capacity_va >= requiredVA) || GENERATOR_PROFILES[GENERATOR_PROFILES.length - 1];
    // Shared with ComparisonModal via computeGeneratorCosts so the two
    // cannot drift when fuel prices or amortisation rules change.
    const { initialCost, monthlyFuel, monthlyTotal, fiveYearTotal, fuelPrice } =
      computeGeneratorCosts(selectedGen, hasGen, genHours, fuelPriceOverride, FUEL_PRICES[selectedGen.fuel_type]);
    const maintenance = selectedGen.maintenance_mo;

    const headers = ["Feature", ...systems.map((s, i) => s.inverter || `Option ${i+1}`)];
    if (hasGen) headers.push("Generator");
    if (hasGridFlag) headers.push("Grid Power");

    const gridDailyKwh = gridKwhOverride ?? (activeAnalysis ? activeAnalysis.total_daily_wh / 1000 : 0);
    const gridMonthlyCost = gridDailyKwh * gridPerKwh * 30;
    const gridFiveYearCost = gridMonthlyCost * 60;

    const rows = [
      ["Initial Cost", ...systems.map(s => `N${s.total_price.toLocaleString()}`), ...(hasGen ? [`N${initialCost.toLocaleString()}`] : []), ...(hasGridFlag ? ["N/A (Grid Tie)"] : [])],
      ["Monthly Running Cost", ...systems.map(_ => "N0 (Solar)"), ...(hasGen ? [`N${monthlyTotal.toLocaleString()}`] : []), ...(hasGridFlag ? [`N${gridMonthlyCost.toLocaleString()}`] : [])],
      ["5-Year Total Cost", ...systems.map(s => `N${s.total_price.toLocaleString()}`), ...(hasGen ? [`N${fiveYearTotal.toLocaleString()}`] : []), ...(hasGridFlag ? [`N${gridFiveYearCost.toLocaleString()}`] : [])],
      ["Amortized Monthly", ...systems.map(s => `N${(s.total_price/300).toLocaleString(undefined, {maximumFractionDigits: 0})} (25yr)`), ...(hasGen ? [`N${((initialCost / selectedGen.lifespan_mo) + monthlyTotal).toLocaleString(undefined, {maximumFractionDigits: 0})} (${selectedGen.lifespan_mo/12}yr)`] : []), ...(hasGridFlag ? [`N${gridMonthlyCost.toLocaleString(undefined, {maximumFractionDigits: 0})}`] : [])],
      ["Fuel Type", ...systems.map(_ => "N/A"), ...(hasGen ? [selectedGen.fuel_type] : []), ...(hasGridFlag ? ["Grid Tie"] : [])],
      ["Fuel Consumption", ...systems.map(_ => "N/A"), ...(hasGen ? [`${selectedGen.fuel_consumption_l_hr} L/hr`] : []), ...(hasGridFlag ? [`${gridDailyKwh.toFixed(1)} kWh/day`] : [])],
      ["Reliability", ...systems.map(_ => "Silent, Automatic"), ...(hasGen ? ["Noisy, Fumes, Manual"] : []), ...(hasGridFlag ? ["Always On, Metered"] : [])],
    ];

    autoTable(doc, {
      startY: 35,
      head: [headers],
      body: rows,
      theme: "grid",
      headStyles: { fillColor: [16, 185, 129] },
      styles: { fontSize: 8, cellPadding: 3 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 35 } }
    });

    if (hasGen) {
      const finalY = (doc as any).lastAutoTable.finalY + 15;
      doc.setFontSize(14);
      doc.setTextColor(0);
      doc.text("GENERATOR PROFILE DETAILS", 14, finalY);
      
      doc.setFontSize(10);
      doc.setTextColor(60);
      doc.text(`• Capacity: ${selectedGen.capacity_va}VA (Supports ${peakWatts.toFixed(0)}W peak)`, 14, finalY + 8);
      doc.text(`• Running Costs: N${monthlyFuel.toLocaleString()} fuel + N${selectedGen.maintenance_mo.toLocaleString()} maintenance per month.`, 14, finalY + 14);
      doc.text(`• Environmental: High CO2 emissions and noise pollution.`, 14, finalY + 20);
    }

    doc.save(`Comparison_${profileName.replace(/\s+/g, '_')}.pdf`);
  };

  const exportResultsToPDF = (results: { analysis: LoadAnalysis; systems: SystemCombination[] }, savedDevices?: Device[]) => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const timestamp = new Date().toLocaleString();
    const activeDevices = savedDevices || devices;
    
    doc.setFontSize(22);
    doc.setTextColor(16, 185, 129); // Emerald-600
    doc.text("SolarSizer Pro - Calculation Report", 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated on: ${timestamp}`, 14, 28);
    doc.text(`Region: ${REGIONS.find(r => r.value === region)?.label}`, 14, 33);
    
    doc.setFontSize(16);
    doc.setTextColor(0);
    doc.text("Load Profile Summary", 14, 45);
    
    autoTable(doc, {
      startY: 50,
      head: [["Metric", "Value"]],
      body: [
        ["Max Hourly Average", `${Math.max(...Object.values(results.analysis.hourly_consumption)).toFixed(0)}W`],
        ["Peak Surge Load", `${results.analysis.max_surge.toFixed(0)}W`],
        ["Daily Energy Consumption", `${results.analysis.total_daily_wh.toFixed(0)}Wh`],
        ["Nighttime Consumption (6PM-7AM)", `${results.analysis.nighttime_wh.toFixed(0)}Wh`],
        ["System Options Found", results.systems.length.toString()],
      ],
      theme: 'striped',
      headStyles: { fillColor: [16, 185, 129] },
    });

    doc.text("Device List", 14, (doc as any).lastAutoTable.finalY + 15);
    
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 20,
      head: [["Device", "Qty", "Watts", "Category", "Schedule"]],
      body: activeDevices.map(d => [
        d.name,
        d.qty.toString(),
        `${d.watts}W`,
        d.category,
        d.ranges.map(r => `${r.start}:00 - ${r.end}:00`).join(", ")
      ]),
      theme: 'grid',
      headStyles: { fillColor: [16, 185, 129] },
    });

    doc.addPage();
    doc.text("Recommended Systems", 14, 20);

    autoTable(doc, {
      startY: 25,
      head: [["System", "Battery", "Solar", "Price"]],
      body: results.systems.map(sys => [
        sys.inverter,
        sys.battery_config,
        sys.panel_config,
        `₦${sys.total_price.toLocaleString()}`
      ]),
      theme: 'striped',
      headStyles: { fillColor: [16, 185, 129] },
    });

    // Add Hardware Specs section with wiring items
    doc.addPage();
    doc.setFontSize(16);
    doc.setTextColor(0);
    doc.text("Hardware Specs", 14, 20);

    for (const sys of results.systems) {
      const startY = (doc as any).autoTable || 25;
      const wiringItems = sys.component_specs?.filter(c => c.role === 'wiring') || [];
      
      if (wiringItems.length > 0) {
        autoTable(doc, {
          startY: 35,
          head: [[`${sys.inverter} - Wiring & Installation`]],
          body: wiringItems.map(w => [
            `${w.name} (${w.specs.category}, ${w.specs.type})\n${Object.entries(w.specs).filter(([k]) => !['category', 'type', 'price', 'description'].includes(k)).map(([k, v]) => `${k}: ${v}`).join(', ')}\nPrice: ₦${w.specs.price?.toLocaleString() || 0}`
          ]),
          theme: 'striped',
          headStyles: { fillColor: [16, 185, 129] },
          margin: { left: 14, right: 14 },
        });
      }
    }

    doc.save(`SolarSizer_Report_${new Date().getTime()}.pdf`);
  };

  const exportHardwareDatabaseToPDF = () => {
    const doc = new jsPDF('p', 'mm', 'a4');
    doc.setFontSize(22);
    doc.setTextColor(16, 185, 129);
    doc.text("Complete Product Catalog", 14, 20);

    doc.setFontSize(14);
    doc.text("Inverters", 14, 35);
    autoTable(doc, {
      startY: 40,
      head: [["Name", "Max AC", "DC Volts", "PV Input", "Price"]],
      body: inverters.map(inv => [inv.name, `${inv.max_ac_w}W`, `${inv.system_vdc}V`, `${inv.cc_max_pv_w}W`, `₦${inv.price.toLocaleString()}`]),
      theme: 'striped',
      headStyles: { fillColor: [16, 185, 129] },
    });

    doc.text("Solar Panels", 14, (doc as any).lastAutoTable.finalY + 15);
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 20,
      head: [["Name", "Watts", "Voc", "Isc", "Price"]],
      body: panels.map(p => [p.name, `${p.watts}W`, `${p.voc}V`, `${p.isc}A`, `₦${p.price.toLocaleString()}`]),
      theme: 'striped',
      headStyles: { fillColor: [16, 185, 129] },
    });

    doc.text("Batteries", 14, (doc as any).lastAutoTable.finalY + 15);
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 20,
      head: [["Name", "Voltage", "Capacity", "Type", "Price"]],
      body: batteries.map(b => [b.name, `${b.voltage}V`, `${b.capacity_ah}Ah`, b.type, `₦${b.price.toLocaleString()}`]),
      theme: 'striped',
      headStyles: { fillColor: [16, 185, 129] },
    });

    doc.text("Powerstations", 14, (doc as any).lastAutoTable.finalY + 15);
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 20,
      head: [["Name", "Capacity", "Max Output", "PV Input", "Price"]],
      body: powerstations.map(ps => [ps.name, `${ps.capacity_wh}Wh`, `${ps.max_output_w}W`, `${ps.max_pv_input_w}W`, `₦${ps.price.toLocaleString()}`]),
      theme: 'striped',
      headStyles: { fillColor: [16, 185, 129] },
    });

    // Add Wiring section
    doc.text("Wiring & Installation", 14, (doc as any).lastAutoTable.finalY + 15);
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 20,
      head: [["Name", "Category", "Type", "Price", "Description"]],
      body: wiring.map(w => [
        w.name,
        w.category,
        w.type,
        `₦${w.price.toLocaleString()}`,
        w.description
      ]),
      theme: 'striped',
      headStyles: { fillColor: [16, 185, 129] },
    });

    doc.save("SolarSizer_Complete_Product_Catalog.pdf");
  };

  const exportResultsJSON = (results: { analysis: LoadAnalysis; systems: SystemCombination[] }) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const data = {
      metadata: {
        generated: new Date().toISOString(),
        region,
        batteryPreference
      },
      analysis: results.analysis,
      devices,
      systems: results.systems
    };
    downloadFile(JSON.stringify(data, null, 2), `SolarSizer_Results_${timestamp}.json`, "application/json");
  };

  const exportHardwareDatabaseJSON = () => {
    const data = { inverters, panels, batteries, powerstations, wiring };
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadFile(JSON.stringify(data, null, 2), `SolarSizer_Hardware_${timestamp}.json`, "application/json");
  };

  const importHardwareDatabase = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        let importedCount = 0;

        if (data.inverters && Array.isArray(data.inverters)) {
          const sanitizedInverters = data.inverters.map((inv: any) => ({
            ...inv,
            id: inv.id || crypto.randomUUID(),
            max_ac_w: Number(inv.max_ac_w) || 0,
            cc_max_pv_w: Number(inv.cc_max_pv_w) || 0,
            cc_max_voc: Number(inv.cc_max_voc) || 0,
            cc_max_amps: Number(inv.cc_max_amps) || 0,
            system_vdc: Number(inv.system_vdc) || 0,
            max_charge_amps: Number(inv.max_charge_amps) || 0,
            cc_type: inv.cc_type === "mppt" ? "mppt" : "pwm",
            price: Number(inv.price) || 0,
          }));
          setInverters(prev => {
            const merged = [...prev];
            sanitizedInverters.forEach(newItem => {
              const index = merged.findIndex(item => item.id === newItem.id);
              if (index !== -1) {
                merged[index] = newItem;
              } else {
                merged.push(newItem);
              }
            });
            return merged;
          });
          importedCount++;
        }

        if (data.panels && Array.isArray(data.panels)) {
          const sanitizedPanels = data.panels.map((p: any) => ({
            ...p,
            id: p.id || crypto.randomUUID(),
            watts: Number(p.watts) || 0,
            voc: Number(p.voc) || 0,
            isc: Number(p.isc) || 0,
            price: Number(p.price) || 0,
          }));
          setPanels(prev => {
            const merged = [...prev];
            sanitizedPanels.forEach(newItem => {
              const index = merged.findIndex(item => item.id === newItem.id);
              if (index !== -1) {
                merged[index] = newItem;
              } else {
                merged.push(newItem);
              }
            });
            return merged;
          });
          importedCount++;
        }

        if (data.batteries && Array.isArray(data.batteries)) {
          const sanitizedBatteries = data.batteries.map((b: any) => ({
            ...b,
            id: b.id || crypto.randomUUID(),
            voltage: Number(b.voltage) || 0,
            capacity_ah: Number(b.capacity_ah) || 0,
            min_c_rate: Number(b.min_c_rate) || 0.1,
            price: Number(b.price) || 0,
          }));
          setBatteries(prev => {
            const merged = [...prev];
            sanitizedBatteries.forEach(newItem => {
              const index = merged.findIndex(item => item.id === newItem.id);
              if (index !== -1) {
                merged[index] = newItem;
              } else {
                merged.push(newItem);
              }
            });
            return merged;
          });
          importedCount++;
        }

        if (data.powerstations && Array.isArray(data.powerstations)) {
          const sanitizedPS = data.powerstations.map((ps: any) => ({
            ...ps,
            id: ps.id || crypto.randomUUID(),
            capacity_wh: Number(ps.capacity_wh) || 0,
            max_output_w: Number(ps.max_output_w) || 0,
            max_pv_input_w: Number(ps.max_pv_input_w) || 0,
            price: Number(ps.price) || 0,
          }));
          setPowerstations(prev => {
            const merged = [...prev];
            sanitizedPS.forEach(newItem => {
              const index = merged.findIndex(item => item.id === newItem.id);
              if (index !== -1) {
                merged[index] = newItem;
              } else {
                merged.push(newItem);
              }
            });
            return merged;
          });
          importedCount++;
        }

        if (data.wiring && Array.isArray(data.wiring)) {
          const sanitizedWiring = data.wiring.map((w: any) => ({
            ...w,
            id: w.id || crypto.randomUUID(),
            price: Number(w.price) || 0,
          }));
          setWiring(prev => {
            const merged = [...prev];
            sanitizedWiring.forEach(newItem => {
              const index = merged.findIndex(item => item.id === newItem.id);
              if (index !== -1) {
                merged[index] = newItem;
              } else {
                merged.push(newItem);
              }
            });
            return merged;
          });
          importedCount++;
        }

        if (importedCount > 0) {
          alert("Hardware database updated successfully!");
        } else {
          alert("Invalid hardware database file format. Please ensure it contains 'inverters', 'panels', 'batteries', 'powerstations', or 'wiring' arrays.");
        }
      } catch (err) {
        alert("Failed to parse the file. Please ensure it is a valid JSON.");
      }
    };
    reader.readAsText(file);
  };

  const importMasterDevices = async (event: ChangeEvent<HTMLInputElement>) => {
    const adminKey = sessionStorage.getItem("ss_admin_key");
    if (!adminKey) {
      alert("Admin session required. Visit ?admin=true to unlock.");
      return;
    }
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (Array.isArray(data)) {
          for (const item of data) {
            await sdk.saveMasterDevice(item, adminKey);
          }
          const updated = await sdk.getDevices();
          setMasterDevices(updated);
          alert("Master devices imported successfully!");
        } else {
          alert("Invalid format. Expected an array of devices.");
        }
      } catch (err) {
        alert("Import failed: " + (err instanceof Error ? err.message : String(err)));
      }
    };
    reader.readAsText(file);
  };

  const importProducts = async (event: ChangeEvent<HTMLInputElement>) => {
    const adminKey = sessionStorage.getItem("ss_admin_key");
    if (!adminKey) {
      alert("Admin session required. Visit ?admin=true to unlock.");
      return;
    }
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (Array.isArray(data)) {
          for (const item of data) {
            await sdk.saveProduct(item, adminKey);
          }
          const updated = await sdk.getProducts();
          setProducts(updated);
          alert("Products imported successfully!");
        } else {
          alert("Invalid format. Expected an array of products.");
        }
      } catch (err) {
        alert("Import failed: " + (err instanceof Error ? err.message : String(err)));
      }
    };
    reader.readAsText(file);
  };

  const saveGlobalSettings = async () => {
    const adminKey = sessionStorage.getItem("ss_admin_key");
    if (!adminKey) {
      alert("Admin session required to save global settings. Visit ?admin=true to unlock.");
      return;
    }

    try {
      await sdk.saveSettings("margins", margins, adminKey);
      await sdk.saveSettings("pdf_settings", pdfSettings, adminKey);
      localStorage.setItem("ss_margins", JSON.stringify(margins));
      localStorage.setItem("ss_pdf_settings", JSON.stringify(pdfSettings));
      storeSet("ss_margins", margins).catch(() => {});
      storeSet("ss_pdf_settings", pdfSettings).catch(() => {});
      alert("✅ Global settings (margins & PDF customization) saved to server successfully!");
    } catch (err) {
      alert("Failed to save settings: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const exportProductsJSON = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadFile(JSON.stringify(products, null, 2), `SolarSizer_Products_${timestamp}.json`, "application/json");
  };

  const exportInternetDataJSON = () => {
    const internetMasterDevices = masterDevices.filter(md => md.category === 'internet' || md.tags.includes('internet'));
    const internetProducts = products.filter(p => p.tags.includes('internet'));
    const data = { masterDevices: internetMasterDevices, products: internetProducts };
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadFile(JSON.stringify(data, null, 2), `SolarSizer_InternetData_${timestamp}.json`, "application/json");
  };

  const importInternetData = async (event: ChangeEvent<HTMLInputElement>) => {
    const adminKey = sessionStorage.getItem("ss_admin_key");
    if (!adminKey) {
      alert("Admin session required. Visit ?admin=true to unlock.");
      return;
    }
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        let importedMaster = 0;
        let importedProducts = 0;

        if (data.masterDevices && Array.isArray(data.masterDevices)) {
          for (const item of data.masterDevices) {
            await sdk.saveMasterDevice(item, adminKey);
            importedMaster++;
          }
        }
        if (data.products && Array.isArray(data.products)) {
          for (const item of data.products) {
            await sdk.saveProduct(item, adminKey);
            importedProducts++;
          }
        }

        if (importedMaster > 0 || importedProducts > 0) {
          const [updatedDevices, updatedProducts] = await Promise.all([
            sdk.getDevices(),
            sdk.getProducts()
          ]);
          setMasterDevices(updatedDevices);
          setProducts(updatedProducts);
          alert(`Import successful: ${importedMaster} devices and ${importedProducts} products.`);
        } else {
          alert("Invalid format. Expected an object with 'masterDevices' and 'products' arrays.");
        }
      } catch (err) {
        alert("Import failed: " + (err instanceof Error ? err.message : String(err)));
      }
    };
    reader.readAsText(file);
  };

  const exportProfilesJSON = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadFile(JSON.stringify(profiles, null, 2), `SolarSizer_Profiles_${timestamp}.json`, "application/json");
  };

  const importProfiles = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (Array.isArray(data)) {
          setProfiles([...profiles, ...data]);
          alert("Profiles imported successfully!");
        } else {
          alert("Invalid profiles file format.");
        }
      } catch (err) {
        alert("Failed to parse the file. Please ensure it is a valid JSON.");
      }
    };
    reader.readAsText(file);
  };

  const exportFullLogs = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    let content = `SOLARSIZER PRO - FULL CALCULATION LOGS\n`;
    content += `Exported: ${new Date().toLocaleString()}\n`;
    content += `------------------------------------------\n\n`;

    internalLogs.forEach((log, i) => {
      content += `LOG ATTEMPT #${i + 1} - ${new Date(log.timestamp).toLocaleString()}\n`;
      content += `Region: ${log.location}\n`;
      content += `Devices: ${log.devices.length}\n`;
      content += `Analysis: Surge=${log.analysis.max_surge}W, Night=${log.analysis.nighttime_wh}Wh, Daily=${log.analysis.total_daily_wh}Wh\n`;
      content += `Checked: ${log.totalCombinationsChecked}, Valid: ${log.validSystemsCount}\n`;
      content += `--- LOG TRACE ---\n`;
      log.allLogs.forEach(path => {
        content += path.join("\n") + "\n---\n";
      });
      content += `\n==========================================\n\n`;
    });

    downloadFile(content, `SolarSizer_Full_Logs_${timestamp}.txt`, "text/plain");
  };

  const exportSingleLog = (log: CalculationAttempt) => {
    const timestamp = new Date(log.timestamp).toISOString().replace(/[:.]/g, '-');
    let content = `SOLARSIZER PRO - CALCULATION LOG ATTEMPT\n`;
    content += `Timestamp: ${new Date(log.timestamp).toLocaleString()}\n`;
    content += `Region: ${log.location}\n`;
    content += `------------------------------------------\n\n`;
    
    content += `DEVICES LIST\n`;
    log.devices.forEach(d => {
      content += `- ${d.name}: ${d.qty}x ${d.watts}W\n`;
    });
    content += `\n`;

    content += `ANALYSIS SUMMARY\n`;
    content += `Peak Surge: ${log.analysis.max_surge}W\n`;
    content += `Night Usage: ${log.analysis.nighttime_wh}Wh\n`;
    content += `Daily Total: ${log.analysis.total_daily_wh}Wh\n\n`;

    content += `CALCULATION STATS\n`;
    content += `Total Combinations Checked: ${log.totalCombinationsChecked}\n`;
    content += `Valid Systems Found: ${log.validSystemsCount}\n\n`;

    content += `--- FULL LOG TRACE ---\n`;
    log.allLogs.forEach((path, i) => {
      content += `Path #${i + 1}:\n`;
      content += path.join("\n") + "\n---\n";
    });

    downloadFile(content, `SolarSizer_Log_${timestamp}.txt`, "text/plain");
  };


  const exportHardwareDatabase = () => {
    const timestamp = new Date().toISOString().split('T')[0];
    let content = `# Solar Sizing Hardware Database Export\n`;
    content += `Generated on: ${new Date().toLocaleString()}\n\n`;

    content += `## 1. INVERTERS\n`;
    content += `| Name | Max AC (W) | DC Volts (V) | PV Input (W) | CC Type | Max Charge (A) | Price (₦) |\n`;
    content += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;
    inverters.forEach(inv => {
      content += `| ${inv.name} | ${inv.max_ac_w} | ${inv.system_vdc} | ${inv.cc_max_pv_w} | ${(inv.cc_type || "pwm").toUpperCase()} | ${inv.max_charge_amps} | ${inv.price.toLocaleString()} |\n`;
    });
    content += `\n`;

    content += `## 2. SOLAR PANELS\n`;
    content += `| Name | Watts (W) | Voc (V) | Isc (A) | Price (₦) |\n`;
    content += `| :--- | :--- | :--- | :--- | :--- |\n`;
    panels.forEach(p => {
      content += `| ${p.name} | ${p.watts} | ${p.voc} | ${p.isc} | ${p.price.toLocaleString()} |\n`;
    });
    content += `\n`;

    content += `## 3. BATTERIES\n`;
    content += `| Name | Voltage (V) | Capacity (Ah) | Type | Min C-Rate | Price (₦) |\n`;
    content += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;
    batteries.forEach(b => {
      content += `| ${b.name} | ${b.voltage} | ${b.capacity_ah} | ${b.type} | ${b.min_c_rate} | ${b.price.toLocaleString()} |\n`;
    });
    content += `\n`;

    content += `## 4. POWERSTATIONS\n`;
    content += `| Name | Capacity (Wh) | Max Output (W) | Max PV Input (W) | Price (₦) |\n`;
    content += `| :--- | :--- | :--- | :--- | :--- |\n`;
    powerstations.forEach(ps => {
      content += `| ${ps.name} | ${ps.capacity_wh} | ${ps.max_output_w} | ${ps.max_pv_input_w} | ${ps.price.toLocaleString()} |\n`;
    });
    content += `\n`;

    content += `## 5. WIRING\n`;
    content += `| Category | Item Type | Name | Specs | Price (₦) |\n`;
    content += `| :--- | :--- | :--- | :--- | :--- |\n`;
    wiring.forEach(w => {
      const specs = Object.entries(w.specs ?? {})
        .map(([k, v]) => {
          if (typeof v === "object" && v !== null) return `${k}: ${JSON.stringify(v)}`;
          return `${k}: ${v}`;
        })
        .join(", ");
      content += `| ${WIRING_CATEGORY_LABELS[w.category]?.label ?? w.category} | ${w.type === "mandatory" ? "Required" : "Optional"} | ${w.name} | ${specs} | ${w.price.toLocaleString()} |\n`;
    });

    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Solar_Hardware_Database_${timestamp}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const addDevice = () => {
    if (!newDevice.name || !newDevice.watts || (newDevice.ranges?.length === 0 && !newRange)) return;
    
    const finalRanges = [...(newDevice.ranges || [])];
    // If user hasn't added any ranges yet but has values in the range inputs, add it automatically
    if (finalRanges.length === 0) {
      finalRanges.push({ ...newRange });
    }

    if (editingDeviceId) {
      setDevices(devices.map(d => d.id === editingDeviceId ? {
        ...d,
        name: newDevice.name || "Unnamed Device",
        category: newDevice.category as DeviceCategory,
        qty: newDevice.qty || 1,
        watts: newDevice.watts || 0,
        ranges: finalRanges,
      } : d));
      setEditingDeviceId(null);
    } else {
      const device: Device = {
        id: crypto.randomUUID(),
        name: newDevice.name || "Unnamed Device",
        category: newDevice.category as DeviceCategory,
        qty: newDevice.qty || 1,
        watts: newDevice.watts || 0,
        ranges: finalRanges,
      };
      setDevices([...devices, device]);
    }

    setNewDevice({
      name: "",
      category: "electronics",
      qty: 1,
      watts: 0,
      ranges: [],
    });
    setNewRange({ start: 18, end: 23 });
  };

  const startEditingDevice = (device: Device) => {
    setEditingDeviceId(device.id);
    setNewDevice({
      name: device.name,
      category: device.category,
      qty: device.qty,
      watts: device.watts,
      ranges: [...device.ranges],
    });
  };

  const addRange = () => {
    setNewDevice({
      ...newDevice,
      ranges: [...(newDevice.ranges || []), { ...newRange }],
    });
  };

  const removeRange = (index: number) => {
    setNewDevice({
      ...newDevice,
      ranges: (newDevice.ranges || []).filter((_, i) => i !== index),
    });
  };

  // Inline range editing helpers
  const startEditingRange = (deviceId: string, index: number, range: TimeRange) => {
    setEditingRangeDeviceId(deviceId);
    setEditingRangeIndex(index);
    setTempRange({ ...range });
  };
  const cancelEditingRange = () => {
    setEditingRangeDeviceId(null);
    setEditingRangeIndex(-1);
    setTempRange({ start: 18, end: 23 });
  };
  const saveEditedRange = () => {
    if (editingRangeDeviceId === null) return;
    setDevices(devices.map(d => {
      if (d.id !== editingRangeDeviceId) return d;
      const newRanges = [...d.ranges];
      newRanges[editingRangeIndex] = { ...tempRange };
      return { ...d, ranges: newRanges };
    }));
    cancelEditingRange();
  };

  const removeDevice = (id: string) => {
    setDevices(devices.filter((d) => d.id !== id));
  };

  const deleteHardware = async (type: HardwareType, id: string) => {
    if (isDeveloper && type !== "wiring") {
      const adminKey = sessionStorage.getItem("ss_admin_key");
      if (adminKey) {
        try {
          await sdk.deleteHardware(id, adminKey);
        } catch (e) {
          console.error("Failed to delete global hardware:", e);
        }
      }
    }

    if (type === "inverter") setInverters(inverters.filter(i => i.id !== id));
    if (type === "panel") setPanels(panels.filter(p => p.id !== id));
    if (type === "battery") setBatteries(batteries.filter(b => b.id !== id));
    if (type === "powerstation") setPowerstations(powerstations.filter(ps => ps.id !== id));
    if (type === "chargeController") setChargeControllers(chargeControllers.filter(cc => cc.id !== id));
    if (type === "wiring") setWiring(wiring.filter(w => w.id !== id));
  };

  const deleteMasterDevice = async (id: string) => {
    if (!isDeveloper) return;
    const adminKey = sessionStorage.getItem("ss_admin_key");
    if (!adminKey) return;
    if (!confirm("Are you sure you want to delete this master device?")) return;

    try {
      await sdk.deleteMasterDevice(id, adminKey);
      setMasterDevices(prev => prev.filter(d => d.id !== id));
    } catch (e) {
      console.error(e);
      alert("Failed to delete master device.");
    }
  };

  const startEditingMasterDevice = (device: MasterDevice) => {
    setEditingMasterDevice(itemData(device) as MasterDevice);
    setMasterDeviceClass(device.specs?.device_class ?? "");
    setMasterDeviceCategory(device.category ?? "electronics");
    setShowAddMasterDevice(true);
  };

  const startEditing = (type: HardwareType, item: any) => {
    setEditingHardware({ type, id: item.id, item: itemData(item, type) });
    setShowAddHardware(type);
  };

  const saveMasterDevice = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const adminKey = sessionStorage.getItem("ss_admin_key") || "";

    const fd = new FormData(e.currentTarget);
    const optionalNumber = (key: string) => {
      const raw = fd.get(key);
      if (raw === null || raw === "") return undefined;
      const value = Number(raw);
      return Number.isFinite(value) ? value : undefined;
    };
    const optionalText = (key: string) => {
      const raw = (fd.get(key) as string | null)?.trim();
      return raw || undefined;
    };
    const device = {
      id: editingMasterDevice?.id || crypto.randomUUID(),
      name: fd.get("name") as string,
      category: fd.get("category") as DeviceCategory,
      default_watts: Number(fd.get("default_watts")),
      price: fd.get("price") ? Number(fd.get("price")) : undefined,
      specs: {
        device_class: (fd.get("device_class") as DeviceSpecs["device_class"]) || undefined,
        peak_watts: optionalNumber("peak_watts"),
        input_voltage: optionalText("input_voltage"),
        connector: optionalText("connector"),
        duty_cycle: optionalNumber("duty_cycle"),
        ports: optionalNumber("ports"),
        poe_budget_w: optionalNumber("poe_budget_w"),
        uplink: optionalText("uplink"),
        bands: optionalText("bands"),
        operating_temp_c: optionalText("operating_temp_c"),
        mast_height_m: optionalNumber("mast_height_m"),
        dish_power_w: optionalNumber("dish_power_w"),
      } as DeviceSpecs,
      tags: (fd.get("tags") as string)?.split(",").map(t => t.trim()).filter(Boolean) || [],
    };

    try {
      await sdk.saveMasterDevice(device, adminKey || undefined);
      setMasterDevices(prev => {
        const idx = prev.findIndex(d => d.id === device.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = device as MasterDevice;
          return updated;
        }
        return [device as MasterDevice, ...prev];
      });
      setShowAddMasterDevice(false);
      setEditingMasterDevice(null);
    } catch (e) {
      console.error(e);
      alert("Failed to save master device.");
    }
  };
  
  const duplicateHardware = (type: HardwareType, item: any) => {
    const newItem = {
      ...item,
      id: crypto.randomUUID(),
      name: `${item.name} (Copy)`
    };
    if (type === "inverter") setInverters([...inverters, newItem]);
    if (type === "panel") setPanels([...panels, newItem]);
    if (type === "battery") setBatteries([...batteries, newItem]);
    if (type === "powerstation") setPowerstations([...powerstations, newItem]);
    if (type === "chargeController") setChargeControllers([...chargeControllers, newItem]);
    if (type === "wiring") setWiring([...wiring, newItem]);
  };

  const generateUsageProfile = (targetDevices?: Device[]) => {
    const activeDevices = targetDevices || devices;
    if (activeDevices.length === 0) return;
    const doc = new jsPDF();
    const date = new Date().toLocaleDateString();
    const profileId = `UP-${Math.floor(100000 + Math.random() * 900000)}`;

    // Recalculate analysis if targetDevices is provided to ensure accuracy
    const activeAnalysis = targetDevices ? calculateUserNeeds(targetDevices) : results?.analysis;

    // Header
    doc.setFontSize(22);
    doc.setTextColor(16, 185, 129); // emerald-600
    doc.text("LOAD USAGE PROFILE", 105, 20, { align: "center" });
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Profile ID: ${profileId}`, 20, 35);
    doc.text(`Date: ${date}`, 20, 40);
    doc.text(`Location: ${REGIONS.find(r => r.value === region)?.label}`, 20, 45);

    // Load Analysis Summary
    if (activeAnalysis) {
      doc.setFontSize(14);
      doc.setTextColor(0);
      doc.text("LOAD ANALYSIS SUMMARY", 20, 60);
      
      doc.setFontSize(10);
      const summary = [
        ["Peak Surge Load", `${activeAnalysis.max_surge.toFixed(0)}W`],
        ["Total Daily Consumption", `${activeAnalysis.total_daily_wh.toFixed(0)}Wh`],
        ["Nighttime Consumption (6PM-7AM)", `${activeAnalysis.nighttime_wh.toFixed(0)}Wh`],
        ["Average Hourly Load", `${(activeAnalysis.total_daily_wh / 24).toFixed(0)}W`]
      ];

      autoTable(doc, {
        startY: 65,
        head: [["Metric", "Value"]],
        body: summary,
        theme: "striped",
        headStyles: { fillColor: [16, 185, 129] }
      });
    }

    // Itemized Device List
    const finalY = (doc as any).lastAutoTable?.finalY || 100;
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text("ITEMIZED DEVICE LIST", 20, finalY + 15);

    const deviceData = activeDevices.map((d, idx) => {
      const hours = d.ranges.reduce((acc, r) => acc + (r.end >= r.start ? r.end - r.start : 24 - r.start + r.end), 0);
      const dailyWh = d.watts * d.qty * hours;
      return [
        (idx + 1).toString(),
        d.name,
        d.qty.toString(),
        `${d.watts}W`,
        `${d.watts * d.qty}W`,
        hours.toString(),
        `${dailyWh.toFixed(0)}Wh`,
        d.ranges.map(r => `${r.start}:00-${r.end}:00`).join(", ")
      ];
    });

    autoTable(doc, {
      startY: finalY + 20,
      head: [["#", "Device", "Qty", "Watts", "Total W", "Hrs", "Daily Wh", "Schedule"]],
      body: deviceData,
      theme: "grid",
      headStyles: { fillColor: [16, 185, 129] },
      styles: { fontSize: 8 }
    });

    // Hourly Load Distribution
    if (activeAnalysis) {
      const currentY = (doc as any).lastAutoTable.finalY + 15;
      doc.setFontSize(14);
      doc.setTextColor(0);
      doc.text("HOURLY LOAD DISTRIBUTION", 20, currentY);

      const hourlyData: string[][] = [];
      // Split 24 hours into two columns of 12 for better space usage
      for (let i = 0; i < 12; i++) {
        const h1 = i;
        const h2 = i + 12;
        hourlyData.push([
          `${h1}:00`, `${activeAnalysis.hourly_consumption[h1].toFixed(0)}W`,
          `${h2}:00`, `${activeAnalysis.hourly_consumption[h2].toFixed(0)}W`
        ]);
      }

      autoTable(doc, {
        startY: currentY + 5,
        head: [["Hour", "Load", "Hour", "Load"]],
        body: hourlyData,
        theme: "striped",
        headStyles: { fillColor: [16, 185, 129] },
        styles: { fontSize: 9 }
      });
    }

    // Footer
    const footerY = (doc as any).lastAutoTable.finalY + 20;
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text("This usage profile is based on the data provided by the user.", 105, footerY, { align: "center" });
    doc.text("Actual usage may vary based on device efficiency and environmental factors.", 105, footerY + 5, { align: "center" });

    doc.save(`SolarSizer_UsageProfile_${profileId}.pdf`);
  };

  const generateQuote = (sys: SystemCombination) => {
    const doc = new jsPDF();
    const date = new Date().toLocaleDateString();
    
    // Customization Settings
    const { quoteTitle, quotePrefix, footerLine1, footerLine2 } = pdfSettings;
    const quoteId = `${quotePrefix}-${Math.floor(100000 + Math.random() * 900000)}`;
    
    // Safety check for sys
    if (!sys) return;

    const safePrice = (value: unknown) => safeNumber(value, 0);

    // Use adjusted advice if available
    let finalAdvice = sys.advice || "No advice available.";
    if (adjustedLoad && (sys.status === "Conditional" || sys.status === "High Risk")) {
      if (adjustedLoad.deficit === 0) {
        finalAdvice = "Perfect Match (Lifestyle Adjusted): Your modified usage schedule now fits this system's capacity perfectly.";
      } else {
        finalAdvice = `Conditional (Lifestyle Adjusted): With your current adjustments, you still have a small deficit of ${adjustedLoad.deficit.toFixed(0)}Wh. Further minor cuts or grid support needed.`;
      }
    }

    // Header
    doc.setFontSize(22);
    doc.setTextColor(16, 185, 129); // emerald-600
    doc.text(quoteTitle, 105, 20, { align: "center" });
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Quote ID: ${quoteId}`, 20, 35);
    doc.text(`Date: ${date}`, 20, 40);
    doc.text(`Location: ${REGIONS.find(r => r.value === region)?.label}`, 20, 45);

    // Helper to extract units
    const getUnits = (str: string) => {
      const match = str.match(/^(\d+)x/);
      return match ? match[1] : "1";
    };

    // Cost Breakdown (Shifted to first position)
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text("ITEMIZED COST BREAKDOWN", 20, 60);

    // Bundle-priced kits may arrive without a component split.
    sys = withPrices(sys);

    // Check if partial mode with exclusions
    const isPartialMode = !!sys.partial_included && (sys.partial_included.inverter === false || sys.partial_included.panels === false || sys.partial_included.batteries === false);
    const inverterExcluded = isPartialMode && sys.partial_included!.inverter === false;
    const batteryExcluded = isPartialMode && sys.partial_included!.batteries === false;
    const panelExcluded = isPartialMode && sys.partial_included!.panels === false;

    const inverterPrice = inverterExcluded ? 0 : safePrice(sys.inverter_price);
    const batteryPrice = batteryExcluded ? 0 : safePrice(sys.battery_price);
    const panelPrice = panelExcluded ? 0 : safePrice(sys.panel_price);

    const inverterLabel = inverterExcluded ? "Inverter Unit (Excluded)" : "Inverter Unit";
    const batteryLabel = batteryExcluded ? "Battery Storage Bank (Excluded)" : "Battery Storage Bank";
    const panelLabel = panelExcluded ? "Solar PV Array (Excluded)" : "Solar PV Array";

    const money = (value: number) => value > 0 ? `N${Math.round(value).toLocaleString()}` : "Included";

    // Only list parts the product actually contains. A powerstation has no PV
    // array, so a "Solar PV Array — Included" row would be a false promise.
    const hasInverter = !!sys.inverter && sys.inverter !== "N/A";
    const hasBattery = !!sys.battery_config && sys.battery_config !== "N/A";
    const hasPanel = !!sys.panel_config && sys.panel_config !== "N/A";
    const costs: (string | number)[][] = [];
    if (hasInverter) costs.push(["1", inverterLabel, getUnits(sys.inverter), inverterExcluded ? "Excluded" : money(inverterPrice)]);
    if (hasBattery) costs.push(["2", batteryLabel, getUnits(sys.battery_config), batteryExcluded ? "Excluded" : money(batteryPrice)]);
    if (hasPanel) costs.push(["3", panelLabel, getUnits(sys.panel_config), panelExcluded ? "Excluded" : money(panelPrice)]);

    // Add individual wiring items, using the same qty/length pricing as the modal.
    if (sys.wiring_items && sys.wiring_items.length > 0) {
      let row = 0;
      for (const w of sys.wiring_items) {
        const qty = w.qty ?? 1;
        if (qty <= 0) continue;
        row += 1;
        const length = w.length_override ?? (typeof w.specs?.length === "number" ? w.specs.length : undefined);
        const units = length ? `${qty} x ${length}m` : `${qty}`;
        const label = `${w.name}${w.type === "nice-to-have" ? " (Optional)" : ""}`;
        costs.push([`4.${row}`, label, units, money(calculateWirePrice(w))]);
      }
    }

    // Optional charge controllers are quote lines too, priced as catalog items.
    if (sys.selected_charge_controllers && sys.selected_charge_controllers.length > 0) {
      let row = 0;
      for (const id of sys.selected_charge_controllers) {
        const cc = chargeControllers.find((item) => item.id === id);
        if (!cc) continue;
        row += 1;
        costs.push([`5.${row}`, `Charge Controller — ${cc.name}`, "1", money(cc.price)]);
      }
    }

    costs.push(["", "TOTAL INVESTMENT", "", `N${Math.round(safePrice(sys.total_price)).toLocaleString()}`]);

    const vatPercent = safeNumber(pdfSettings.vatPercent, 7.5);
    autoTable(doc, {
      startY: 65,
      head: [["#", "Component", "Units", "Price"]],
      body: costs,
      theme: "grid",
      headStyles: { fillColor: [16, 185, 129] },
      foot: [["", `GRAND TOTAL (Inc. ${vatPercent}% VAT)`, "", `N${Math.round(safePrice(sys.total_price) * (1 + vatPercent / 100)).toLocaleString()}`]],
      footStyles: { fillColor: [245, 245, 244], textColor: [0, 0, 0], fontStyle: "bold" }
    });

    // System Specifications (Shifted under Cost Breakdown)
    const specsY = (doc as any).lastAutoTable.finalY + 15;
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text("SYSTEM SPECIFICATIONS", 20, specsY);
    
    doc.setFontSize(10);
    const specs = [
      ["Status", sys.status || "N/A"],
      ["Advice", finalAdvice],
      ["Inverter", inverterExcluded ? "Excluded (Partial Mode)" : (sys.inverter || "N/A")],
      ["Battery Bank", batteryExcluded ? "Excluded (Partial Mode)" : (sys.battery_config || "N/A")],
      ["Solar Array", panelExcluded ? "Excluded (Partial Mode)" : `${sys.panel_config || "N/A"} (${Math.round(sys.array_size_w || sys.panel_w || 0)}W)`],
      ["Est. Daily Yield", `${(sys.daily_yield || 0).toFixed(0)}Wh`]
    ];

    autoTable(doc, {
      startY: specsY + 5,
      head: [["Specification", "Details"]],
      body: specs,
      theme: "striped",
      headStyles: { fillColor: [16, 185, 129] }
    });

    // Installation Guide (Shifted under System Specifications)
    const hasPvArray = (sys.array_size_w || 0) > 0 || (sys.panel_w || 0) > 0;
    const guide = [
      ...(sys.wiring_items ?? []).filter(w => (w.qty ?? 1) > 0).map(w => {
        const qty = w.qty ?? 1;
        const price = calculateWirePrice(w);
        return [
          WIRING_CATEGORY_LABELS[w.category]?.label ?? w.category,
          `${w.name}${qty > 1 ? ` (x${qty})` : ""} - N${Math.round(price).toLocaleString()}${w.type === "nice-to-have" ? " (optional)" : ""}`
        ];
      }),
      ...(sys.wiring_notes ?? []).map(note => ["Sizing", note]),
      ...(hasPvArray ? [["PV String", `Connect panels in the specified series-parallel configuration to stay within the ${sys.inverter}'s MPPT window.`]] : []),
    ];

    // A unit with no PV array has no wiring guide to print.
    if (guide.length > 0) {
      const guideY = (doc as any).lastAutoTable.finalY + 15;
      doc.setFontSize(14);
      doc.setTextColor(0);
      doc.text("WIRING & INSTALLATION GUIDE", 20, guideY);

      doc.setFontSize(10);
      doc.setTextColor(60);

      autoTable(doc, {
        startY: guideY + 5,
        body: guide,
        theme: "plain",
        styles: { cellPadding: 2, fontSize: 9 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 30 } }
      });
    }

    // Footer
    const footerY = (doc as any).lastAutoTable.finalY + 20;
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(pdfSettings.footerLine1, 105, footerY, { align: "center" });
    doc.text(pdfSettings.footerLine2, 105, footerY + 5, { align: "center" });

    doc.save(`SolarSizer_Quote_${quoteId}.pdf`);

    // Also export usage profile
    generateUsageProfile(adjustedLoad && (sys.status === "Conditional" || sys.status === "High Risk") ? adjustedLoad.devices : devices);
  };

  const startCheckout = async (payload: { productId?: string; amount: number; description: string }) => {
    if (checkoutLoading) return;
    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        alert(data.error || "Could not start Bachs checkout.");
        return;
      }
      window.location.href = data.url;
    } catch {
      alert("Could not start Bachs checkout.");
    } finally {
      setCheckoutLoading(false);
    }
  };

  const startBachsCheckout = async (sys: SystemCombination) =>
    startCheckout({
      productId: sys.product_id,
      amount: sys.total_price,
      description: sys.product_name || `${sys.inverter} + ${sys.battery_config}`,
    });

  /** Buy a single internet device straight from the catalogue. */
  const startDeviceCheckout = async (device: MasterDevice) => {
    if (!device.price) {
      alert("This device is priced on request. Send us a message for a quote.");
      return;
    }
    startCheckout({ amount: device.price, description: device.name });
  };

  // The details modal keeps a snapshot, so wiring is recomputed live from the
  // current selection. Products carry no wiring_items, so they get the same
  // sized list the calculator uses; internet kits have no wiring at all. A
  // catalog product can be a lone panel, battery or inverter, so it still gets
  // the extra items that apply to it even without a PV array.
  const isCatalogProduct = detailSource === "catalog";
  const selectedArrayW =
    selectedSystemDetails?.array_size_w || selectedSystemDetails?.panel_w || 0;
  const hasWiring =
    !!selectedSystemDetails &&
    selectedSystemDetails.kit_type !== "internet" &&
    (isCatalogProduct || selectedArrayW > 0) &&
    (Array.isArray(selectedSystemDetails.wiring_items) || !!selectedSystemDetails.product_id);

  // Reset partial mode state when a new system is selected. Catalog products
  // open in partial mode so every line can be included or dropped by hand.
  useEffect(() => {
    if (selectedSystemDetails) {
      setPartialMode(detailSource === "catalog");
      setPartialIncludedComponents({ inverter: true, panels: true, batteries: true });
      setWiringQuantities({});
      setSelectedNiceToHaveIds(new Set());
    }
  }, [selectedSystemDetails?.product_id, selectedSystemDetails?.inverter, selectedSystemDetails?.battery_config, selectedSystemDetails?.panel_config]);

  // Bundle-priced kits carry no per-component split, so fill one in from the
  // catalog; without it partial mode cannot subtract anything from the total.
  const withPrices = (system: SystemCombination): SystemCombination => {
    const declared =
      safeNumber(system.inverter_price) +
      safeNumber(system.battery_price) +
      safeNumber(system.panel_price);
    const total = safeNumber(system.total_price);
    if (declared > 0 || total <= 0) return system;

    const split = estimateBundleSplit(
      Math.max(0, total - safeNumber(system.wiring_price)),
      system.panel_w ?? system.array_size_w,
      system.battery_wh ?? system.battery_total_wh,
      { panels, batteries },
      margins
    );

    return split.inverter_price + split.battery_price + split.panel_price > 0
      ? { ...system, ...split }
      : system;
  };

  useEffect(() => {
    if (!selectedSystemDetails) return;
    const priced = withPrices(selectedSystemDetails);
    if (priced !== selectedSystemDetails) setSelectedSystemDetails(priced);
  }, [selectedSystemDetails, panels, batteries, margins]);

  // Restore per-system charge controller selection when system changes
  useEffect(() => {
    if (selectedSystemDetails?.selected_charge_controllers) {
      setSelectedChargeControllerIds(new Set(selectedSystemDetails.selected_charge_controllers));
    }
  }, [selectedSystemDetails?.inverter, selectedSystemDetails?.battery_config, selectedSystemDetails?.panel_config]);

  /**
   * A lone battery has no inverter to size against, so its cable is sized for
   * half of the amp-hour rating, the usual inverter-friendly discharge limit.
   */
  const batterySizingWatts = (system: SystemCombination | null): number => {
    const battery = system?.battery_data;
    if (!battery || system?.inverter_w || battery.capacity_ah <= 0) return 0;
    return (0.5 * battery.capacity_ah * battery.voltage) / 1.25;
  };

  const liveSizing = hasWiring
    ? sizeWiring(
        {
          items: wiring,
          inverter: selectedSystemDetails?.inverter_data,
          panel: selectedSystemDetails?.panel_data,
          arrayWatts: selectedSystemDetails?.array_size_w || selectedSystemDetails?.panel_w || 0,
          batteryWh: selectedSystemDetails?.battery_total_wh || 0,
          systemVdc:
            selectedSystemDetails?.inverter_data?.system_vdc ??
            selectedSystemDetails?.battery_data?.voltage ??
            48,
          maxAcW:
            selectedSystemDetails?.inverter_w || batterySizingWatts(selectedSystemDetails),
          all_in_one: selectedSystemDetails?.all_in_one,
          // A product sold on its own keeps every extra item optional.
          discretionary: isCatalogProduct,
        },
        Array.from(selectedNiceToHaveIds)
      )
    : null;

  // Required items always start at 1 so a saved 0 cannot hide them.
  useEffect(() => {
    if (!selectedSystemDetails || !liveSizing) return;
    const defaults: Record<string, number> = {};
    for (const id of liveSizing.includeIds) {
      const item = wiring.find((w) => w.id === id);
      if (item?.type === "mandatory" && wiringQuantities[id] === undefined) {
        defaults[id] = Math.max(1, item.qty ?? 1);
      }
    }
    // Items with no size to size them against start switched off.
    for (const id of liveSizing.unsizedIds) {
      if (wiringQuantities[id] === undefined) defaults[id] = 0;
    }
    if (Object.keys(defaults).length > 0) {
      setWiringQuantities((prev) => ({ ...prev, ...defaults }));
    }
  }, [selectedSystemDetails, liveSizing, wiring, wiringQuantities]);

  // Get wire items with dynamic quantities from state
  const includedWiring = liveSizing
    ? wiring
        .filter((w) => liveSizing.includeIds.has(w.id) || liveSizing.unsizedIds.has(w.id))
        .map(w => ({
          ...w,
          qty: wiringQuantities[w.id] ?? (liveSizing.unsizedIds.has(w.id) ? 0 : w.qty ?? 1)
        }))
        // A zero quantity excludes the item in every mode, not only partial mode.
        .filter(w => (w.qty ?? 1) > 0)
    : [];

/** Calculate wire price accounting for qty and length override. */
const calculateWirePrice = (item: WiringItem): number => {
  const qty = item.qty ?? 1;
  // Get base length from specs, default to 1 (full price)
  const specLength = typeof item.specs?.length === "number" ? item.specs.length : 1;
  const overrideLength = item.length_override || specLength;
  // Price scales with length ratio
  const lengthMultiplier = overrideLength > 0 ? overrideLength / specLength : 1;
  return Math.round(item.price * qty * lengthMultiplier * (1 + margins.product / 100));
};

const liveWiringPrice = liveSizing
  ? Math.round(includedWiring.reduce((sum, w) => sum + calculateWirePrice(w), 0))
  : 0;

  // Hide optional items whose rating cannot serve this system, so the list stays
  // short as the catalogue grows. Unknown ratings stay visible.
  const optionalIsCompatible = (item: WiringItem): boolean => {
    if (!liveSizing) return true;
    const volts = specNumber(item.specs?.voltage);
    const amps = specNumber(item.specs?.current) || specNumber(item.specs?.amperage);
    if (item.category === "cables") {
      const gauge = specNumber(item.specs?.gauge);
      return !gauge || gauge >= liveSizing.derived.cableGauge;
    }
    if (item.category === "dc_bus" || item.category === "breakers") {
      const systemVdc =
        selectedSystemDetails?.inverter_data?.system_vdc || selectedSystemDetails?.battery_data?.voltage || 48;
      return (!volts || volts >= systemVdc) && (!amps || amps >= liveSizing.derived.dcAmps);
    }
    if (item.category === "mc4_connectors") {
      return (!volts || volts >= liveSizing.derived.pvVoc) && (!amps || amps >= liveSizing.derived.pvAmps);
    }
    return true;
  };

  const optionalQuery = optionalSearch.trim().toLowerCase();
  const optionalItems = wiring
    .filter((w) => w.type === "nice-to-have" && !liveSizing?.includeIds.has(w.id) && optionalIsCompatible(w))
    .filter((w) => selectedArrayW > 0 || !PV_ONLY_CATEGORIES.includes(w.category))
    .filter((w) => {
      if (!optionalQuery) return true;
      return [w.name, w.description, w.tooltip, WIRING_CATEGORY_LABELS[w.category]?.label, ...Object.values(w.specs ?? {})]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(optionalQuery);
    });

  const optionalByCategory = (Object.keys(WIRING_CATEGORY_LABELS) as WiringCategory[])
    .map((category) => [category, optionalItems.filter((w) => w.category === category)] as const)
    .filter(([, items]) => items.length > 0);

  // Charge controllers are catalog add-ons. They are filtered for display against
  // the selected inverter and priced into the quote, but they never change the
  // calculator's inverter, wiring sizing or panel/battery split.
  const ccIsCompatible = (cc: ChargeController): boolean => {
    if (!liveSizing) return true;
    const inv = selectedSystemDetails?.inverter_data;
    if (!inv) return true;
    const systemVdc = inv.system_vdc || selectedSystemDetails?.battery_data?.voltage || 0;
    // Voltage must match the inverter's DC bus.
    if (systemVdc > 0 && cc.battery_voltage !== systemVdc) return false;
    // A PWM external controller cannot be paired with an MPPT hybrid inverter.
    if (inv.cc_type === "mppt" && cc.type !== "mppt") return false;
    // External CC must be rated for the actual PV string, not just the inverter's
    // built-in CC limits. Derived Voc/amps come from sizeWiring and reflect the
    // panel model in this system.
    if (liveSizing.derived.pvVoc > 0 && cc.max_voc < liveSizing.derived.pvVoc) return false;
    if (liveSizing.derived.pvAmps > 0 && cc.max_amps < liveSizing.derived.pvAmps) return false;
    return true;
  };

  const ccQuery = optionalSearch.trim().toLowerCase();
  const optionalChargeControllers = chargeControllers
    .filter((cc) => ccIsCompatible(cc))
    .filter((cc) => {
      if (!ccQuery) return true;
      return [cc.name, cc.description, cc.type, String(cc.battery_voltage), String(cc.max_voc), String(cc.max_amps), String(cc.max_pv_w)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(ccQuery);
    });

  // In partial mode, subtract prices of unchecked main components
  const partialInverterPrice = partialMode && !partialIncludedComponents.inverter ? (selectedSystemDetails?.inverter_price || 0) : 0;
  const partialBatteryPrice = partialMode && !partialIncludedComponents.batteries ? (selectedSystemDetails?.battery_price || 0) : 0;
  const partialPanelPrice = partialMode && !partialIncludedComponents.panels ? (selectedSystemDetails?.panel_price || 0) : 0;

  const selectedChargeControllers = chargeControllers.filter((cc) => selectedChargeControllerIds.has(cc.id));
  const chargeControllerPrice = selectedChargeControllers.reduce((sum, cc) => sum + (cc.price || 0), 0);

  const liveSystemTotal = selectedSystemDetails
    ? (selectedSystemDetails.total_price || 0) 
      - (hasWiring ? selectedSystemDetails.wiring_price || 0 : 0) 
      + liveWiringPrice
      - partialInverterPrice
      - partialBatteryPrice
      - partialPanelPrice
      + chargeControllerPrice
    : 0;
  const quotedSystem = selectedSystemDetails
    ? {
        ...selectedSystemDetails,
        wiring_items: hasWiring ? includedWiring : (selectedSystemDetails.wiring_items || []),
        wiring_price: hasWiring ? liveWiringPrice : (selectedSystemDetails.wiring_price || 0),
        wiring_notes: hasWiring ? liveSizing?.notes : (selectedSystemDetails.wiring_notes || []),
        total_price: liveSystemTotal,
        selected_nice_to_have: hasWiring ? Array.from(selectedNiceToHaveIds) : (selectedSystemDetails.selected_nice_to_have || []),
        selected_charge_controllers: Array.from(selectedChargeControllerIds),
        // Track which main components are included for PDF/quote
        partial_included: partialMode ? partialIncludedComponents : undefined,
      }
    : selectedSystemDetails;

  // The catalog is grouped into category sections, one above the other, so the
  // list stays readable as it grows.
  const catalogSections = useMemo(() => {
    const visible = products.filter(
      (p) => !(p.tags.includes("internet") && p.product_type !== "system")
    );
    return PRODUCT_TYPE_FILTERS.filter((f) => f.id !== "all")
      .map((f) => ({ ...f, items: visible.filter((p) => p.product_type === f.id) }))
      .filter((section) => section.items.length > 0);
  }, [products]);

  const scrollToCatalogSection = (id: string) => {
    setSelectedProductTag(id);
    document
      .getElementById(`catalog-${id}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Internet devices grouped by class so the page stays readable as it grows.
  const internetDeviceSections = useMemo(() => {
    const devices = masterDevices.filter(
      (md) => md.category === "internet" || md.tags.includes("internet")
    );
    const byClass = new Map<string, MasterDevice[]>();
    for (const md of devices) {
      const key = md.specs?.device_class ?? "other";
      byClass.set(key, [...(byClass.get(key) ?? []), md]);
    }
    const sections = INTERNET_DEVICE_CLASSES.filter((c) => byClass.has(c.id)).map((c) => ({
      id: c.id,
      label: c.label,
      items: byClass.get(c.id)!,
    }));
    if (byClass.has("other")) {
      sections.push({ id: "other", label: "Other Devices", items: byClass.get("other")! });
    }
    return sections;
  }, [masterDevices]);

  const internetKits = products.filter(
    (p) => p.tags.includes("internet") && p.product_type === "system"
  );

  return (
    <div className="min-h-screen bg-[#F5F5F4] text-[#1C1917] font-sans selection:bg-emerald-100">
      {/* Comparison Modal - Moved higher in DOM and ensured fixed positioning */}
      <AnimatePresence>
        {showComparison && results && (
          <ComparisonModal
            systems={selectedForComparison}
            analysis={results.analysis}
            hasGenerator={hasGenerator}
            setHasGenerator={setHasGenerator}
            hasGrid={hasGrid}
            setHasGrid={setHasGrid}
            gridPerKwh={gridPerKwh}
            setGridPerKwh={setGridPerKwh}
            gridKwhOverride={gridKwhOverride}
            setGridKwhOverride={setGridKwhOverride}
            exportComparisonToPDF={exportComparisonToPDF}
            onSave={saveComparison}
            onClose={() => setShowComparison(false)}
          />
        )}
        {selectedSavedComparison && (
          <ComparisonModal
            systems={selectedSavedComparison.systems!}
            analysis={selectedSavedComparison.analysis!}
            hasGenerator={selectedSavedComparison.has_generator || false}
            setHasGenerator={() => {}}
            hasGrid={selectedSavedComparison.has_grid || false}
            setHasGrid={() => {}}
            gridPerKwh={selectedSavedComparison.grid_per_kwh || 12}
            setGridPerKwh={() => {}}
            gridKwhOverride={selectedSavedComparison.grid_kwh_override ?? null}
            setGridKwhOverride={() => {}}
            exportComparisonToPDF={exportComparisonToPDF}
            onClose={() => setSelectedSavedComparison(null)}
          />
        )}
        {(selectedInternetDevice || selectedInternetProduct) && (
          <InternetDeviceModal
            device={selectedInternetDevice ?? internetProductAsDevice(selectedInternetProduct!, masterDevices)}
            product={selectedInternetProduct ?? undefined}
            powerstations={powerstations}
            products={products}
            routers={masterDevices}
            onBuy={(product) => startBachsCheckout(buildProductDetails(product, panels))}
            onBuyDevice={(device) => startDeviceCheckout(device)}
            onClose={() => { setSelectedInternetDevice(null); setSelectedInternetProduct(null); }}
          />
        )}
      </AnimatePresence>

      {/* Header */}
      {!isCompact && (
        <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
                <Sun className="text-white w-5 h-5" />
              </div>
              <h1 className="text-xl font-bold tracking-tight">SolarSizer <span className="text-emerald-600">Pro</span></h1>
            </div>
            
            <nav className="hidden md:flex items-center bg-stone-100 p-1 rounded-xl">
              <button 
                onClick={() => setActiveTab("calculator")}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${activeTab === "calculator" ? "bg-white shadow-sm text-emerald-600" : "text-stone-500 hover:text-stone-900"}`}
              >
                <Calculator className="w-4 h-4" /> Calculator
              </button>
              <button 
                onClick={() => setActiveTab("products")}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${activeTab === "products" ? "bg-white shadow-sm text-emerald-600" : "text-stone-500 hover:text-stone-900"}`}
              >
                <Layers className="w-4 h-4" /> Products
              </button>
              <button 
                onClick={() => setActiveTab("internet")}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${activeTab === "internet" ? "bg-white shadow-sm text-emerald-600" : "text-stone-500 hover:text-stone-900"}`}
              >
                <Wifi className="w-4 h-4" /> Internet
              </button>
                {isDeveloper && (
                  <button 
                    onClick={() => setActiveTab("database")}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${activeTab === "database" ? "bg-white shadow-sm text-emerald-600" : "text-stone-500 hover:text-stone-900"}`}
                  >
                    <Database className="w-4 h-4" /> Hardware DB
                  </button>
                )}
                {isDeveloper && (
                  <button 
                    onClick={() => setActiveTab("logs")}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${activeTab === "logs" ? "bg-white shadow-sm text-emerald-600" : "text-stone-500 hover:text-stone-900"}`}
                  >
                    <Terminal className="w-4 h-4" /> Logs
                  </button>
                )}
            </nav>

            <div className="flex items-center gap-3">
              <button 
                onClick={() => setShowSaveProfile(true)}
                className="hidden md:flex bg-emerald-600 text-white px-4 py-2 rounded-full hover:bg-emerald-700 transition-colors items-center gap-2 text-sm font-medium"
              >
                <Save className="w-4 h-4" /> Save Profile
              </button>
              <details className="hidden md:block relative">
                <summary className="list-none cursor-pointer p-2 rounded-full text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-colors" title="Saved items">
                  <ChevronDown className="w-5 h-5" />
                </summary>
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-2xl border border-stone-200 shadow-xl p-2 z-20">
                  <button
                    onClick={(e) => { setActiveTab("profiles"); e.currentTarget.closest("details")?.removeAttribute("open"); }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-sm font-medium flex items-center gap-2 ${activeTab === "profiles" ? "bg-emerald-50 text-emerald-700" : "text-stone-600 hover:bg-stone-50"}`}
                  >
                    <FolderOpen className="w-4 h-4" /> Profiles
                  </button>
                  <button
                    onClick={(e) => { setActiveTab("results"); e.currentTarget.closest("details")?.removeAttribute("open"); }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-sm font-medium flex items-center gap-2 ${activeTab === "results" ? "bg-emerald-50 text-emerald-700" : "text-stone-600 hover:bg-stone-50"}`}
                  >
                    <Save className="w-4 h-4" /> Results
                  </button>
                </div>
              </details>
              <div className="hidden md:block h-6 w-px bg-stone-200" />
            </div>
          </div>
        </header>
      )}

      <main className="max-w-7xl mx-auto px-4 py-8">
        {activeTab === "calculator" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column: Configuration */}
            <div className="lg:col-span-5 space-y-8">
            
            {/* Region & Battery Preference */}
            <section className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200 space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <MapPin className="w-5 h-5 text-emerald-600" />
                  <h2 className="font-semibold text-lg">Project Location</h2>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {REGIONS.map((r) => (
                    <button
                      key={r.value}
                      onClick={() => setRegion(r.value)}
                      className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                        region === r.value 
                          ? "border-emerald-600 bg-emerald-50 text-emerald-900" 
                          : "border-stone-200 hover:border-stone-300 bg-stone-50"
                      }`}
                    >
                      <span className="font-medium">{r.label}</span>
                      {region === r.value && <CheckCircle2 className="w-5 h-5" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-6 border-t border-stone-100">
                <div className="flex items-center gap-2 mb-4 relative group">
                  <BatteryIcon className="w-5 h-5 text-emerald-600" />
                  <h2 className="font-semibold text-lg">Battery Preference</h2>
                  <span
                    tabIndex={0}
                    className="p-0.5 text-stone-400 hover:text-emerald-600 cursor-help rounded-full focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    title="Lithium is 80-100% usable and lasts 3000+ cycles. Lead acid is only 50% usable; deeper discharge causes sulfation and shortens life."
                  >
                    <Info className="w-4 h-4" />
                  </span>
                  <div className="absolute z-30 top-full left-0 mt-2 w-80 bg-stone-900 text-white text-xs leading-relaxed px-3 py-2.5 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity pointer-events-none">
                    <p className="font-bold mb-1">Lithium (LiFePO4)</p>
                    <p>80–100% of capacity is usable, 3,000+ cycles, lighter, with a BMS that protects the cells.</p>
                    <p className="font-bold mt-2 mb-1">Lead acid</p>
                    <p>Only 50% is usable. Each deeper discharge causes sulfation and shortens life, so size the bank for at least twice the usable Wh you need. Cheaper upfront, but heavier, needs ventilation, and lasts 300–500 cycles. Use it only for shallow daily cycling and tight budgets.</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(["any", "lithium", "lead-acid"] as BatteryPreference[]).map((pref) => (
                    <button
                      key={pref}
                      onClick={() => setBatteryPreference(pref)}
                      className={`px-4 py-2 rounded-xl border text-xs font-bold uppercase transition-all ${
                        batteryPreference === pref 
                          ? "border-emerald-600 bg-emerald-50 text-emerald-900" 
                          : "border-stone-200 hover:border-stone-300 bg-stone-50 text-stone-500"
                      }`}
                    >
                      {pref.replace("-", " ")}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-6 border-t border-stone-100">
                <div className="flex items-center justify-between gap-2 mb-4">
                  <div className="flex items-center gap-2">
                    <Scale className="w-5 h-5 text-emerald-600" />
                    <h2 className="font-semibold text-lg">Tolerance Level</h2>
                  </div>
                  <span className="text-sm font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">{tolerance}%</span>
                </div>
                <p className="text-xs text-stone-500 mb-4 leading-relaxed">
                  Adjust how much energy deficit (shortage) you're willing to accept before a system is marked as "Undersized".
                </p>
                <input 
                  type="range" 
                  min="0" 
                  max="50" 
                  step="5"
                  value={tolerance}
                  onChange={(e) => setTolerance(parseInt(e.target.value))}
                  className="w-full h-2 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                />
                <div className="flex justify-between mt-2 text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                  <span>Strict (0%)</span>
                  <span>Balanced (20%)</span>
                  <span>Relaxed (50%)</span>
                </div>
              </div>
            </section>

            {/* Undersized Systems Toggle */}
            <section className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                  <div>
                    <h2 className="font-semibold text-lg">Show Undersized Systems</h2>
                    <p className="text-xs text-stone-500 mt-0.5">Include systems that fall significantly short of your load and carry blackout warnings</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowHighRisk(!showHighRisk)}
                  className={`w-12 h-6 rounded-full transition-all relative ${showHighRisk ? 'bg-emerald-600' : 'bg-stone-200'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${showHighRisk ? 'left-7' : 'left-1'}`} />
                </button>
              </div>
            </section>

            {/* Device Input */}
            <section className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200">
              <div className="flex items-center gap-2 mb-6">
                <Zap className="w-5 h-5 text-emerald-600" />
                <h2 className="font-semibold text-lg">Load Profile</h2>
              </div>

              <div className="space-y-4 mb-8">
                {masterDevices.length > 0 && (
                  <div className="mb-4">
                    <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1.5">Quick Add from Database</label>
                    <div className="flex flex-wrap gap-2">
                      {masterDevices
                        .filter(md => md.category !== "internet" && !md.tags.includes("internet"))
                        .map(md => (
                        <button
                          key={md.id}
                          onClick={() => setNewDevice({
                            ...newDevice,
                            name: md.name,
                            category: md.category,
                            watts: md.default_watts
                          })}
                          className="px-3 py-1.5 bg-stone-100 hover:bg-emerald-50 hover:text-emerald-700 rounded-lg text-xs font-bold transition-all border border-stone-200"
                        >
                          + {md.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1.5">Device Name</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Living Room AC"
                      value={newDevice.name}
                      onChange={e => setNewDevice({...newDevice, name: e.target.value})}
                      className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                    <p className="text-[10px] text-stone-400 mt-1 italic">
                      Tip: If devices of the same type have different schedules (e.g. 2 ACs), add them as separate line items.
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1.5">Category</label>
                    <select 
                      value={newDevice.category}
                      onChange={e => setNewDevice({...newDevice, category: e.target.value as DeviceCategory})}
                      className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                    >
                      {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1.5">Quantity</label>
                    <input 
                      type="number" 
                      min="1"
                      value={newDevice.qty}
                      onChange={e => setNewDevice({...newDevice, qty: e.target.value === "" ? "" : parseInt(e.target.value)})}
                      className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1.5">Watts (per unit)</label>
                    <input 
                      type="number" 
                      placeholder="60"
                      value={newDevice.watts}
                      onChange={e => setNewDevice({...newDevice, watts: e.target.value === "" ? "" : parseInt(e.target.value)})}
                      className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                  <div className="col-span-2 space-y-4">
                    <div className="flex items-end gap-4">
                      <div className="flex-1">
                        <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1.5">Start Hour</label>
                        <select 
                          value={newRange.start}
                          onChange={e => setNewRange({...newRange, start: parseInt(e.target.value)})}
                          className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                        >
                          {HOUR_OPTIONS.slice(0, 24).map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1.5">End Hour</label>
                        <select 
                          value={newRange.end}
                          onChange={e => setNewRange({...newRange, end: parseInt(e.target.value)})}
                          className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                        >
                          {HOUR_OPTIONS.slice(1).map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                      </div>
                      <button 
                        onClick={addRange}
                        className="p-2.5 bg-stone-900 text-white rounded-xl hover:bg-stone-800 transition-colors"
                        title="Add Time Range"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Temporary Ranges List */}
                    {newDevice.ranges && newDevice.ranges.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {newDevice.ranges.map((r, i) => (
                          <div key={`${r.start}-${r.end}-${i}`} className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg text-xs font-medium border border-emerald-100">
                            <span>{getHourLabel(r.start)} - {getHourLabel(r.end)}</span>
                            <button onClick={() => removeRange(i)} className="hover:text-emerald-900">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <button 
                  onClick={addDevice}
                  className={`w-full py-3 ${editingDeviceId ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20' : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'} text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 shadow-lg`}
                >
                  {editingDeviceId ? <Save className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                  {editingDeviceId ? "Update Device" : "Add to Profile"}
                </button>
                {editingDeviceId && (
                  <button 
                    onClick={() => {
                      setEditingDeviceId(null);
                      setNewDevice({ name: "", category: "electronics", qty: 1, watts: 0, ranges: [] });
                    }}
                    className="w-full py-2 text-stone-500 text-sm font-medium hover:text-stone-800 transition-colors"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>

              {/* Device List */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400">Current Load Items</h3>
                <AnimatePresence mode="popLayout">
                  {devices.length === 0 ? (
                    <div className="text-center py-8 text-stone-400 border-2 border-dashed border-stone-100 rounded-2xl">
                      No devices added yet
                    </div>
                  ) : (
                    devices.map((d) => (
                      <motion.div
                        key={d.id}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="flex items-center justify-between p-3 bg-stone-50 border border-stone-200 rounded-xl group"
                      >
                        <div>
                          <p className="font-semibold text-sm">{d.name}</p>
                          <div className="flex flex-wrap gap-x-2 text-xs text-stone-500">
                            <span>{d.qty}x {d.watts}W</span>
                            <span className="text-stone-300">·</span>
                            {d.ranges.length > 0 && (
                              <div className="flex gap-1">
                                {d.ranges.map((r, i) => {
                                  const isEditingInline = editingRangeDeviceId === d.id && editingRangeIndex === i;
                                  if (isEditingInline) {
                                    return (
                                      <div key={`${d.id}-inline-edit-${i}`} className="flex items-center gap-1 bg-amber-50 px-2 py-1 rounded">
                                        <select
                                          value={tempRange.start}
                                          onChange={(e) => setTempRange({ ...tempRange, start: parseInt(e.target.value) })}
                                          className="text-xs w-10 bg-white border border-stone-200 rounded"
                                        >
                                          {HOUR_OPTIONS.slice(0, 24).map(opt => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                          ))}
                                        </select>
                                        <span className="text-stone-500">-</span>
                                        <select
                                          value={tempRange.end}
                                          onChange={(e) => setTempRange({ ...tempRange, end: parseInt(e.target.value) })}
                                          className="text-xs w-10 bg-white border border-stone-200 rounded"
                                        >
                                          {HOUR_OPTIONS.slice(1).map(opt => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                          ))}
                                        </select>
                                        <button 
                                          onClick={saveEditedRange}
                                          className="text-emerald-600 hover:text-emerald-700 text-xs font-bold"
                                        >
                                          Save
                                        </button>
                                        <button 
                                          onClick={cancelEditingRange}
                                          className="text-stone-400 hover:text-stone-600 text-xs"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    );
                                  }
                                  return (
                                    <span 
                                      key={`${d.id}-${r.start}-${r.end}-${i}`} 
                                      className="cursor-pointer hover:bg-emerald-100 hover:text-emerald-800 px-1.5 py-0.5 rounded transition-colors"
                                      onClick={() => startEditingRange(d.id, i, r)}
                                    >
                                      {getHourLabel(r.start)}-{getHourLabel(r.end)}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => startEditingDevice(d)}
                            className="p-2 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                          >
                            <Settings className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => removeDevice(d.id)}
                            className="p-2 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
              </div>
            </section>
        </div>

        {/* Right Column: Results */}
        <div className="lg:col-span-7 space-y-8">
            {!results ? (
              <div className="min-h-[420px] flex flex-col items-center justify-center text-center p-12 bg-white rounded-3xl border border-stone-200 border-dashed">
                <div className="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center mb-4">
                  <Calculator className="w-8 h-8 text-stone-400" />
                </div>
                <h3 className="text-xl font-bold mb-2">Ready to Calculate</h3>
                <p className="text-stone-500 max-w-xs">
                  Add your devices and select your region to see optimal solar configurations.
                </p>
              </div>
            ) : (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-8"
              >
                {/* Analysis Summary */}
                <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200">
                    <p className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">Peak Surge</p>
                    <p className="text-2xl font-bold text-stone-900">{results.analysis.max_surge}W</p>
                    <div className="mt-2 flex items-center gap-1 text-xs text-stone-400">
                      <Info className="w-3 h-3" />
                      <span>Critical for Inverter sizing</span>
                    </div>
                  </div>
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200">
                    <p className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">Night Usage</p>
                    <p className="text-2xl font-bold text-stone-900">{results.analysis.nighttime_wh}Wh</p>
                    <div className="mt-2 flex items-center gap-1 text-xs text-stone-400">
                      <Info className="w-3 h-3" />
                      <span>Critical for Battery sizing</span>
                    </div>
                  </div>
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200">
                    <p className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">Daily Total</p>
                    <p className="text-2xl font-bold text-stone-900">{results.analysis.total_daily_wh}Wh</p>
                    <div className="mt-2 flex items-center gap-1 text-xs text-stone-400">
                      <Info className="w-3 h-3" />
                      <span>Critical for Panel sizing</span>
                    </div>
                  </div>
                </section>

                {/* System Options */}
                <section className="space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <h2 className="font-bold text-xl flex items-center gap-2">
                        <BatteryIcon className="w-6 h-6 text-emerald-600" />
                        Recommended Systems
                      </h2>
                      <div className="flex flex-col gap-1">
                        <div className="flex bg-stone-100 p-1 rounded-xl w-fit">
                          <button 
                            onClick={() => setResultFilter("all")}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${resultFilter === "all" ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
                          >
                            Full Results
                          </button>
                          <button 
                            onClick={() => setResultFilter("kits")}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${resultFilter === "kits" ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
                          >
                            Kits
                          </button>
                          <button 
                            onClick={() => setResultFilter("powerstations")}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${resultFilter === "powerstations" ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
                          >
                            Powerstations
                          </button>
                        </div>
                        <p className="text-[10px] text-stone-500 ml-1">
                          Students and young professionals: for easy simple solutions that don't require complex installations, toggle on powerstations or kits.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-stone-500">{results.systems.length} configurations found</span>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => exportResultsToPDF(results)}
                          className="bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-emerald-100 transition-all border border-emerald-100"
                        >
                          <Download className="w-3.5 h-3.5" /> Export Report
                        </button>
                        <button 
                          onClick={saveAnalysis}
                          className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-emerald-700 transition-all shadow-sm"
                        >
                          <Save className="w-3.5 h-3.5" /> Save Analysis
                        </button>
                      </div>
                    </div>
                  </div>

                  {results.systems.length === 0 ? (
                    <div className="bg-amber-50 border border-amber-200 p-6 rounded-2xl flex gap-4">
                      <AlertCircle className="w-6 h-6 text-amber-600 shrink-0" />
                      <div>
                        <h4 className="font-bold text-amber-900">No Matching Systems</h4>
                        <p className="text-sm text-amber-700 mt-1">
                          Your load requirements exceed the safety limits of our current hardware database. 
                          Try reducing your peak load or nighttime usage.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {(() => {
                        const filteredSystems = results.systems.filter(s => {
                          if (resultFilter === "kits") return s.is_preconfigured && s.product_id;
                          if (resultFilter === "powerstations") return s.is_preconfigured && !s.product_id;
                          return true;
                        });

                        const sortedSystems = [...filteredSystems].sort((a, b) => {
                          const statusOrder: Record<string, number> = { "Optimal": 0, "Conditional": 1, "High Risk": 2 };
                          if (statusOrder[a.status] !== statusOrder[b.status]) {
                            return statusOrder[a.status] - statusOrder[b.status];
                          }
                          return a.total_price - b.total_price;
                        });

                        // Categorize for "cheapest of each category first"
                        const categories = ["Optimal", "Conditional", "High Risk"];
                        const cheapestOfEach = categories.map(cat => 
                          sortedSystems.find(s => s.status === cat)
                        ).filter(Boolean) as SystemCombination[];

                        const remaining = sortedSystems.filter(s => 
                          !cheapestOfEach.some(c => c === s)
                        );

                        const finalDisplay = [...cheapestOfEach, ...remaining];
                        
                        // Pagination
                        const totalPages = Math.ceil(finalDisplay.length / itemsPerPage);
                        const startIndex = (currentPage - 1) * itemsPerPage;
                        const paginatedItems = finalDisplay.slice(startIndex, startIndex + itemsPerPage);
                        const pageWindowSize = 5;
                        const pageWindowStart = Math.max(1, Math.min(currentPage - Math.floor(pageWindowSize / 2), totalPages - pageWindowSize + 1));
                        const pageWindowEnd = Math.min(totalPages, pageWindowStart + pageWindowSize - 1);
                        const visiblePages = Array.from({ length: pageWindowEnd - pageWindowStart + 1 }, (_, i) => pageWindowStart + i);

                        return (
                          <>
                            {paginatedItems.map((sys, idx) => (
                              <motion.div
                                key={getSystemKey(sys, startIndex + idx)}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: idx * 0.05 }}
                                className={`bg-white p-6 rounded-2xl shadow-sm border transition-all group relative overflow-hidden ${
                                  isSelectedForComparison(sys) ? 'border-emerald-500 ring-2 ring-emerald-500/10' : 'border-stone-200 hover:border-emerald-500'
                                }`}
                              >
                                {startIndex + idx < cheapestOfEach.length && (
                                  <div className="absolute top-0 right-0 bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-bl-xl">
                                    {sys.status === "Optimal" ? "Perfect Match" : sys.status === "Conditional" ? "Budget Option" : "Undersized Entry"}
                                  </div>
                                )}
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                  <div className="space-y-4 flex-1">
                                    <div className="flex items-center gap-3">
                                      <div className="p-2 bg-stone-100 rounded-lg">
                                        <Zap className="w-5 h-5 text-stone-600" />
                                      </div>
                                      <div>
                                        <div className="flex items-center gap-2">
                                          <h3 className="font-bold text-lg">{sys.inverter}</h3>
                                          {sys.status === "Optimal" ? (
                                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase rounded-full flex items-center gap-1">
                                              <CheckCircle2 className="w-3 h-3" /> Perfect Match
                                            </span>
                                          ) : sys.status === "High Risk" ? (
                                            <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold uppercase rounded-full flex items-center gap-1">
                                              <AlertCircle className="w-3 h-3" /> Undersized
                                            </span>
                                          ) : (
                                            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold uppercase rounded-full flex items-center gap-1">
                                              <AlertCircle className="w-3 h-3" /> Budget Option
                                            </span>
                                          )}
                                        </div>
                                        <p className="text-xs text-stone-500 uppercase tracking-wider font-semibold">Hybrid System Core</p>
                                      </div>
                                    </div>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                      <div className="flex items-start gap-2">
                                        <BatteryIcon className="w-4 h-4 text-emerald-600 mt-0.5" />
                                        <div>
                                          <p className="text-sm font-semibold">{sys.battery_config}</p>
                                          <p className="text-xs text-stone-500">Storage Configuration</p>
                                        </div>
                                      </div>
                                      <div className="flex items-start gap-2">
                                        <Sun className="w-4 h-4 text-amber-500 mt-0.5" />
                                        <div>
                                          <p className="text-sm font-semibold">{sys.panel_config}</p>
                                          <p className="text-xs text-stone-500">{Math.round(sys.array_size_w || 0)}W Array • {sys.daily_yield.toFixed(0)}Wh/day</p>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Advice Section */}
                                    <div className={`p-3 rounded-xl text-xs flex gap-2 items-start ${
                                      sys.status === 'Optimal' ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' : 
                                      sys.status === 'High Risk' ? 'bg-red-50 text-red-800 border border-red-100' :
                                      'bg-amber-50 text-amber-800 border border-amber-100'
                                    }`}>
                                      {sys.status === 'Optimal' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <Info className="w-4 h-4 shrink-0" />}
                                      <p>{sys.advice}</p>
                                    </div>
                                  </div>

                                  <div className="md:text-right pt-4 md:pt-0 border-t md:border-t-0 border-stone-100">
                                    <p className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-1">Estimated Cost</p>
                                    <p className="text-3xl font-black text-stone-900">
                                      <span className="text-sm font-bold mr-1">NGN</span>
                                      {sys.total_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </p>
                                    <div className="mt-4 flex flex-col gap-2">
                                      <button 
                                        onClick={() => { setDetailSource("results"); setSelectedSystemDetails(sys); }}
                                        className="w-full px-6 py-2.5 bg-stone-900 text-white rounded-xl font-semibold hover:bg-stone-800 transition-all flex items-center justify-center gap-2"
                                      >
                                        View Details <ChevronRight className="w-4 h-4" />
                                      </button>
                                      <div className="flex gap-2">
                                        <button 
                                          onClick={() => setSelectedSystemLog(sys.log)}
                                          className="p-2.5 bg-stone-100 text-stone-600 rounded-xl hover:bg-stone-200 transition-all flex items-center justify-center"
                                          title="View Calculation Logs"
                                        >
                                          <ListIcon className="w-5 h-5" />
                                        </button>
                                        <button 
                                          onClick={() => toggleComparison(sys)}
                                          className={`flex-1 px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                                            isSelectedForComparison(sys)
                                            ? 'bg-emerald-600 text-white shadow-md'
                                            : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                                          }`}
                                        >
                                          <Scale className="w-4 h-4" /> 
                                          {isSelectedForComparison(sys) ? "Selected" : "Compare"}
                                        </button>
                                        <button 
                                          onClick={() => saveResult(sys)}
                                          className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl hover:bg-emerald-100 transition-all flex items-center justify-center"
                                          title="Save this configuration"
                                        >
                                          <Save className="w-5 h-5" />
                                        </button>
                                        {isDeveloper && (
                                          <button 
                                            onClick={() => openPromoteEditor(sys)}
                                            className="p-2.5 bg-blue-50 text-blue-700 rounded-xl hover:bg-blue-100 transition-all flex items-center justify-center"
                                            title="Promote to Product"
                                          >
                                            <Layers className="w-5 h-5" />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </motion.div>
                            ))}

                            {/* Pagination Controls */}
                            {totalPages > 1 && (
                              <div className="flex flex-col items-center gap-2 pt-8">
                                <div className="flex items-center justify-center gap-2 max-w-full overflow-x-auto">
                                  <button
                                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                    disabled={currentPage === 1}
                                    className="p-2 bg-white border border-stone-200 rounded-xl disabled:opacity-50 hover:bg-stone-50 transition-all shrink-0"
                                    title="Previous page"
                                  >
                                    <ChevronLeft className="w-5 h-5" />
                                  </button>
                                  {pageWindowStart > 1 && (
                                    <>
                                      <button
                                        onClick={() => setCurrentPage(1)}
                                        className="w-10 h-10 rounded-xl font-bold text-sm bg-white border border-stone-200 text-stone-600 hover:bg-stone-50 transition-all shrink-0"
                                      >
                                        1
                                      </button>
                                      {pageWindowStart > 2 && <span className="px-1 text-stone-400">…</span>}
                                    </>
                                  )}
                                  {visiblePages.map(page => (
                                    <button
                                      key={page}
                                      onClick={() => setCurrentPage(page)}
                                      className={`w-10 h-10 rounded-xl font-bold text-sm transition-all shrink-0 ${
                                        currentPage === page 
                                        ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' 
                                        : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-50'
                                      }`}
                                    >
                                      {page}
                                    </button>
                                  ))}
                                  {pageWindowEnd < totalPages && (
                                    <>
                                      {pageWindowEnd < totalPages - 1 && <span className="px-1 text-stone-400">…</span>}
                                      <button
                                        onClick={() => setCurrentPage(totalPages)}
                                        className="w-10 h-10 rounded-xl font-bold text-sm bg-white border border-stone-200 text-stone-600 hover:bg-stone-50 transition-all shrink-0"
                                      >
                                        {totalPages}
                                      </button>
                                    </>
                                  )}
                                  <button
                                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                    disabled={currentPage === totalPages}
                                    className="p-2 bg-white border border-stone-200 rounded-xl disabled:opacity-50 hover:bg-stone-50 transition-all shrink-0"
                                    title="Next page"
                                  >
                                    <ChevronRight className="w-5 h-5" />
                                  </button>
                                </div>
                                <p className="text-xs font-semibold text-stone-500">Page {currentPage} of {totalPages}</p>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  )}

                  {/* Comparison Bar */}
                  <AnimatePresence>
                    {selectedForComparison.length > 0 && (
                      <motion.div 
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 100, opacity: 0 }}
                        className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 w-full max-w-2xl px-4"
                      >
                        <div className="bg-stone-900 text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between gap-4 border border-stone-800">
                          <div className="flex items-center gap-4">
                            <div className="flex -space-x-2">
                              {selectedForComparison.map((s, i) => (
                                <div key={getSystemKey(s, i)} className="w-8 h-8 rounded-full bg-emerald-600 border-2 border-stone-900 flex items-center justify-center text-[10px] font-bold">
                                  {i + 1}
                                </div>
                              ))}
                            </div>
                            <div>
                              <p className="text-sm font-bold">{selectedForComparison.length} Systems Selected</p>
                              <p className="text-[10px] text-stone-400 uppercase tracking-wider">Compare to Generator Baseline</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => setSelectedForComparison([])}
                              className="px-4 py-2 text-xs font-bold text-stone-400 hover:text-white transition-colors"
                            >
                              Clear
                            </button>
                            <button 
                              onClick={() => setShowComparison(true)}
                              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-lg shadow-emerald-900/20"
                            >
                              <Scale className="w-4 h-4" /> Compare Now
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </section>
              </motion.div>
            )}
          </div>
        </div>
      )}

        {activeTab === "products" && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-stone-900">Product Catalog</h2>
                <p className="text-stone-500 text-sm">Pre-configured solar system combinations and standalone products.</p>
              </div>
              <div className="flex gap-2">
                {isDeveloper && (
                  <>
                    <div className="flex items-center gap-1">
                      <label className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider bg-stone-100 text-stone-600 border border-stone-200 hover:bg-stone-200 transition-all cursor-pointer flex items-center gap-2">
                        <Upload className="w-3 h-3" /> Import
                        <input type="file" accept=".json" onChange={importProducts} className="hidden" />
                      </label>
                      <Tooltip content={`[
  {
    "id": "kit-1",
    "name": "Starter Kit",
    "type": "combination",
    "combination_data": { "inverter": "5kVA", "battery_wh": 5000, "panel_w": 2000 },
    "price": 500000
  }
]`}>
                        <div className="w-5 h-5 bg-stone-200 rounded-full flex items-center justify-center cursor-help hover:bg-stone-300 transition-colors">
                          <span className="text-[10px] font-bold">!</span>
                        </div>
                      </Tooltip>
                    </div>
                    <button 
                      onClick={exportProductsJSON}
                      className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider bg-stone-100 text-stone-600 border border-stone-200 hover:bg-stone-200 transition-all flex items-center gap-2"
                    >
                      <Download className="w-3 h-3" /> Export
                    </button>
                    <button 
                      onClick={openManualProductEditor}
                      className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider bg-stone-900 text-white hover:bg-stone-800 transition-all flex items-center gap-2"
                    >
                      <Plus className="w-3 h-3" /> Add Product
                    </button>
                  </>
                )}
                {PRODUCT_TYPE_FILTERS.filter((f) => f.id !== "all").map((tag) => {
                  const count = catalogSections.find((s) => s.id === tag.id)?.items.length ?? 0;
                  if (count === 0) return null;
                  return (
                    <Tooltip key={tag.id} content={tag.desc}>
                      <button
                        onClick={() => scrollToCatalogSection(tag.id)}
                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                          selectedProductTag === tag.id
                            ? 'bg-stone-900 text-white shadow-lg shadow-stone-900/20'
                            : 'bg-white text-stone-400 border border-stone-200 hover:border-stone-400'
                        }`}
                      >
                        {tag.label}
                      </button>
                    </Tooltip>
                  );
                })}
              </div>
            </div>

            {/* One section per catalog category, stacked one above the other. */}
            {catalogSections.map((section) => (
              <section key={section.id} id={`catalog-${section.id}`} className="scroll-mt-24">
                <SectionHeading label={section.label} count={section.items.length} desc={section.desc} />
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                  {section.items.map((product) => (
                    <CatalogCard
                      key={product.id}
                      product={product}
                      isDeveloper={isDeveloper}
                      onDelete={() => deleteProduct(product.id)}
                      onEdit={() => openEditProduct(product)}
                      onView={() => {
                        if (product.tags.includes("internet")) {
                          setSelectedInternetProduct(product);
                        } else {
                          setDetailSource("catalog");
                          setSelectedSystemDetails(buildProductDetails(product, panels));
                        }
                      }}
                      onBuy={() => startBachsCheckout(buildProductDetails(product, panels))}
                    >
                      {product.combination_data && (
                        <div className="space-y-2.5 p-4 bg-stone-50 rounded-2xl border border-stone-100 mt-5">
                          {product.combination_data.inverter && (
                            <div className="flex items-center gap-2 text-xs font-bold text-stone-600">
                              <Cpu className="w-4 h-4 shrink-0" /> {product.combination_data.inverter}
                            </div>
                          )}
                          {product.combination_data.battery_config && (
                            <div className="flex items-center gap-2 text-xs font-bold text-stone-600">
                              <BatteryIcon className="w-4 h-4 shrink-0" /> {product.combination_data.battery_config}
                            </div>
                          )}
                          {product.combination_data.panel_config && (
                            <div className="flex items-center gap-2 text-xs font-bold text-stone-600">
                              <Sun className="w-4 h-4 shrink-0" /> {product.combination_data.panel_config}
                            </div>
                          )}
                          <div className="grid grid-cols-2 gap-2 text-[10px] text-stone-500 pt-2 border-t border-stone-100">
                            <div>Type: {product.combination_data.kit_type || "solar"}</div>
                            <div>Specs: {product.combination_data.component_specs?.length || 0}</div>
                          </div>
                        </div>
                      )}
                    </CatalogCard>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {activeTab === "internet" && (
          <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div className="max-w-4xl">
                <h2 className="text-4xl font-black text-stone-900 mb-4 tracking-tight">Your Internet Stack. Built for Nigeria.</h2>
                <p className="text-stone-500 text-lg leading-relaxed">
                  The same SIM. The right hardware. Three to five times the speed — and a connection that doesn't die when NEPA does.
                </p>
              </div>
              {isDeveloper && (
                <div className="flex gap-2">
                  <div className="flex items-center gap-1">
                    <label className="bg-stone-100 text-stone-600 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-stone-200 transition-all border border-stone-200 cursor-pointer">
                      <Upload className="w-4 h-4" /> Import Data
                      <input type="file" accept=".json" onChange={importInternetData} className="hidden" />
                    </label>
                    <Tooltip content={`{
  "master": [ { "id": "tv", "name": "TV", "category": "electronics", "default_watts": 100 } ],
  "products": [ { "id": "p1", "name": "Product 1", "price": 100000 } ]
}`}>
                      <div className="w-5 h-5 bg-stone-200 rounded-full flex items-center justify-center cursor-help hover:bg-stone-300 transition-colors">
                        <span className="text-[10px] font-bold">!</span>
                      </div>
                    </Tooltip>
                  </div>
                  <button
                    onClick={exportInternetDataJSON}
                    className="bg-stone-100 text-stone-600 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-stone-200 transition-all border border-stone-200"
                  >
                    <Download className="w-4 h-4" /> Export Data
                  </button>
                  <button
                    onClick={openInternetKitEditor}
                    className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-blue-700 transition-all"
                  >
                    <Plus className="w-4 h-4" /> Add Internet Kit
                  </button>
                </div>
              )}
            </div>

            {/* Internet devices grouped by class, one section above the other. */}
            {internetDeviceSections.map((section) => (
              <section key={section.id} id={`internet-${section.id}`} className="scroll-mt-24">
                <SectionHeading label={section.label} count={section.items.length} />
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                  {section.items.map((md) => (
                    <InternetDeviceCard
                      key={md.id}
                      device={md}
                      onView={() => {
                        setShowInteractiveBridge(false);
                        setSelectedInternetDevice(md);
                      }}
                      onBuy={() => startDeviceCheckout(md)}
                    />
                  ))}
                </div>
              </section>
            ))}

            {/* Internet kits. The single devices above already cover the hardware. */}
            {internetKits.length > 0 && (
              <section id="internet-kits" className="scroll-mt-24">
                <SectionHeading
                  label="Internet Kits"
                  count={internetKits.length}
                  desc="Bundled hardware, ready to install."
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                  {internetKits.map((product) => (
                    <CatalogCard
                      key={product.id}
                      product={product}
                      isDeveloper={isDeveloper}
                      onView={() => {
                        setShowInteractiveBridge(false);
                        setSelectedInternetProduct(product);
                      }}
                      onBuy={() => startBachsCheckout(buildProductDetails(product, panels))}
                      badge={
                        <span className="px-3 py-1 bg-blue-50 text-blue-600 text-[10px] font-black uppercase rounded-full border border-blue-100">
                          {product.tags.find((t) => t.startsWith("tier-"))?.replace("tier-", "Tier ") || "Kit"}
                        </span>
                      }
                    >
                      <div className="p-4 bg-stone-50 rounded-2xl text-[11px] text-stone-600 leading-relaxed border border-stone-100 italic mt-5">
                        <span className="font-black text-stone-400 uppercase block mb-1 not-italic tracking-wider">
                          SolarOne Power Note
                        </span>
                        "Run this on pure sine wave power from your SolarOne unit to protect sensitive radio components from voltage spikes."
                      </div>
                    </CatalogCard>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {activeTab === "database" && isDeveloper && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Hardware Database</h2>
                <p className="text-stone-500">Manage the components used in calculations.</p>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <div className="flex items-center gap-1">
                  <label className="bg-stone-100 text-stone-600 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-stone-200 transition-all border border-stone-200 cursor-pointer">
                    <Upload className="w-4 h-4" /> Import JSON
                    <input type="file" accept=".json" onChange={importHardwareDatabase} className="hidden" />
                  </label>
                  <Tooltip content={`{
  "inverters": [{"name": "...", "max_ac_w": 5000, ...}],
  "panels": [{"name": "...", "watts": 400, ...}],
  "batteries": [{"name": "...", "voltage": 48, ...}],
  "powerstations": [{"name": "...", "watts": 1000, ...}]
}`}>
                    <div className="w-5 h-5 bg-stone-200 rounded-full flex items-center justify-center cursor-help hover:bg-stone-300 transition-colors">
                      <span className="text-[10px] font-bold">!</span>
                    </div>
                  </Tooltip>
                </div>
                <button 
                  onClick={exportHardwareDatabaseJSON}
                  className="bg-stone-100 text-stone-600 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-stone-200 transition-all border border-stone-200"
                >
                  <Download className="w-4 h-4" /> Export JSON
                </button>
                <button 
                  onClick={exportHardwareDatabaseToPDF}
                  className="bg-stone-100 text-stone-600 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-stone-200 transition-all border border-stone-200"
                >
                  <Download className="w-4 h-4" /> Export PDF
                </button>
                <button onClick={() => setShowAddHardware("inverter")} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-emerald-700 transition-all">
                  <Plus className="w-4 h-4" /> Add Inverter
                </button>
                <button onClick={() => setShowAddHardware("panel")} className="bg-amber-500 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-amber-600 transition-all">
                  <Plus className="w-4 h-4" /> Add Panel
                </button>
                <button onClick={() => setShowAddHardware("battery")} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-blue-700 transition-all">
                  <Plus className="w-4 h-4" /> Add Battery
                </button>
                <button onClick={() => setShowAddHardware("powerstation")} className="bg-stone-900 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-stone-800 transition-all">
                  <Plus className="w-4 h-4" /> Add Powerstation
                </button>
                <button onClick={() => setShowAddHardware("chargeController")} className="bg-cyan-600 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-cyan-700 transition-all">
                  <Plus className="w-4 h-4" /> Add Charge Controller
                </button>
                <button onClick={() => { setEditingMasterDevice(null); setMasterDeviceClass(""); setMasterDeviceCategory("internet"); setShowAddMasterDevice(true); }} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-blue-700 transition-all">
                  <Plus className="w-4 h-4" /> Add Internet Device
                </button>
                {(Object.keys(WIRING_CATEGORY_LABELS) as WiringCategory[]).map((category) => {
                  const colors: Record<WiringCategory, string> = {
                    cables: "text-white",
                    breakers: "text-white",
                    dc_bus: "text-white",
                    surge_protectors: "text-white",
                    casings: "text-white",
                    mounting_racks: "text-white",
                    mc4_connectors: "text-white",
                    circuit_breakers: "text-white",
                    earthing_systems: "text-white",
                    smart_controls: "text-white",
                  };
                  const bgColors: Record<WiringCategory, string> = {
                    cables: "bg-teal-600",
                    breakers: "bg-teal-600",
                    dc_bus: "bg-teal-600",
                    surge_protectors: "bg-amber-600",
                    casings: "bg-amber-600",
                    mounting_racks: "bg-amber-600",
                    mc4_connectors: "bg-teal-600",
                    circuit_breakers: "bg-amber-600",
                    earthing_systems: "bg-emerald-600",
                    smart_controls: "bg-emerald-600",
                  };
                  return (
                    <button 
                      key={category}
                      onClick={() => {
                        setWiringCategoryForAdd(category);
                        setShowAddHardware("wiring");
                      }} 
                      className={`${bgColors[category]} ${colors[category]} px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:opacity-90 transition-all`}
                    >
                      <Plus className="w-3 h-3" />
                      {WIRING_CATEGORY_LABELS[category].label}
                    </button>
                  );
                })}
              </div>
            </div>

            {isDeveloper && (
              <div className="bg-emerald-50 p-6 rounded-3xl border border-emerald-100 mb-8">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-emerald-100 rounded-lg">
                    <Percent className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-lg">Profit Margins (%)</h3>
                    <p className="text-xs text-emerald-600/70">Set percentage margins to be added to hardware and product prices.</p>
                  </div>
                  <button 
                    onClick={saveGlobalSettings}
                    className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-emerald-700 transition-all shadow-sm"
                  >
                    <Save className="w-4 h-4" /> Save to Server
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  {(['inverter', 'panel', 'battery', 'powerstation', 'product'] as const).map((key) => (
                    <div key={key}>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-emerald-700 mb-1.5 capitalize">{key}</label>
                      <div className="relative">
                        <input 
                          type="number" 
                          value={margins[key] === 0 ? "" : margins[key]} 
                          onChange={(e) => setMargins({ ...margins, [key]: parseFloat(e.target.value) || 0 })}
                          placeholder="0"
                          className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm font-bold"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-emerald-400">%</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 rounded-xl bg-white border border-emerald-100 p-3 text-[11px] text-emerald-800/80 leading-relaxed">
                  <p className="font-bold uppercase tracking-wider text-emerald-700 mb-1">Where the product margin applies</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    <li>The headline price of every catalog product, so a recommended kit shows the marked-up total.</li>
                    <li>The inverter, battery and panel prices inside a catalog product, so the itemized quote lines match that marked-up total.</li>
                    <li>Wiring prices on every calculated system, in the results list, the details modal and the PDF quote.</li>
                  </ul>
                  <p className="mt-1 italic">The inverter, panel, battery and powerstation margins apply only to those single hardware parts. They are not used for catalog products or wiring.</p>
                </div>
                
                {/* PDF Customization Panel */}
                <div className="mt-8 pt-8 border-t border-emerald-100">
                  <h3 className="font-bold text-sm text-emerald-800 mb-4 flex items-center gap-2">
                    <Settings className="w-4 h-4" /> PDF Quote Customization
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-emerald-700 mb-1.5">Quote Header Title</label>
                        <input 
                          type="text" 
                          value={pdfSettings.quoteTitle}
                          onChange={(e) => setPdfSettings({ ...pdfSettings, quoteTitle: e.target.value })}
                          className="w-full px-4 py-2 bg-white border border-emerald-200 rounded-xl text-sm"
                          placeholder="e.g. SOLARSIZER PRO QUOTE"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-emerald-700 mb-1.5">Quote ID Prefix</label>
                        <input 
                          type="text" 
                          value={pdfSettings.quotePrefix}
                          onChange={(e) => setPdfSettings({ ...pdfSettings, quotePrefix: e.target.value })}
                          className="w-full px-4 py-2 bg-white border border-emerald-200 rounded-xl text-sm"
                          placeholder="e.g. QT"
                        />
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-emerald-700 mb-1.5">VAT Rate (%)</label>
                        <input 
                          type="number" 
                          step="0.1" 
                          value={pdfSettings.vatPercent}
                          onChange={(e) => setPdfSettings((p) => ({ ...p, vatPercent: Number(e.target.value) || 0 }))}
                          className="w-full px-4 py-2 bg-white border border-emerald-200 rounded-xl text-sm"
                          placeholder="e.g. 7.5"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-emerald-700 mb-1.5">Footer Message Line 1</label>
                        <input 
                          type="text" 
                          value={pdfSettings.footerLine1}
                          onChange={(e) => setPdfSettings({ ...pdfSettings, footerLine1: e.target.value })}
                          className="w-full px-4 py-2 bg-white border border-emerald-200 rounded-xl text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-emerald-700 mb-1.5">Footer Message Line 2</label>
                        <input 
                          type="text" 
                          value={pdfSettings.footerLine2}
                          onChange={(e) => setPdfSettings({ ...pdfSettings, footerLine2: e.target.value })}
                          className="w-full px-4 py-2 bg-white border border-emerald-200 rounded-xl text-sm"
                        />
                      </div>
                    </div>
                  </div>
                  <p className="mt-4 text-[10px] text-emerald-600/60 italic">* Changes are saved to the server and synced across devices.</p>
                </div>
              </div>
            )}

            <div className="space-y-8">
              <HardwareRow
                title="Master Devices"
                icon={<ListIcon className="w-5 h-5 text-stone-400" />}
                action={
                  <div className="flex items-center gap-1">
                    <label className="p-1.5 text-stone-400 hover:text-emerald-600 rounded-lg cursor-pointer" title="Import Master Devices">
                      <Upload className="w-4 h-4" />
                      <input type="file" accept=".json" onChange={importMasterDevices} className="hidden" />
                    </label>
                    <Tooltip content={`[
  {
    "id": "fridge",
    "name": "Refrigerator",
    "category": "compressor",
    "default_watts": 150
  }
]`}>
                      <div className="w-5 h-5 bg-stone-200 rounded-full flex items-center justify-center cursor-help hover:bg-stone-300 transition-colors">
                        <span className="text-[10px] font-bold">!</span>
                      </div>
                    </Tooltip>
                  </div>
                }
              >
                {masterDevices
                  .filter((md) => md.category !== "internet" && !md.tags.includes("internet"))
                  .map((md) => (
                  <div key={md.id} className="w-[260px] shrink-0 bg-stone-50 p-4 rounded-xl border border-stone-200 shadow-sm group relative">
                    <div className="flex justify-between items-start mb-2">
                      <p className="font-bold text-sm">{md.name}</p>
                      <div className={`flex gap-1 transition-opacity ${isDeveloper ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                        <button onClick={() => startEditingMasterDevice(md)} className="p-1 text-stone-400 hover:text-emerald-600 rounded" title="Edit"><Settings className="w-3 h-3" /></button>
                        <button onClick={() => deleteMasterDevice(md.id)} className="p-1 text-stone-400 hover:text-red-600 rounded" title="Delete"><Trash2 className="w-3 h-3" /></button>
                      </div>
                      <div className="flex gap-1 flex-wrap">
                        {md.tags.map(tag => (
                          <span key={`${md.id}-${tag}`} className="px-1.5 py-0.5 bg-white text-stone-400 text-[8px] font-black uppercase rounded border border-stone-200">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="text-xs text-stone-500">
                      {md.default_watts}W • {md.category}
                    </div>
                  </div>
                ))}
                {isDeveloper && (
                  <button 
                    onClick={() => { setEditingMasterDevice(null); setMasterDeviceClass(""); setMasterDeviceCategory("electronics"); setShowAddMasterDevice(true); }}
                    className="w-[260px] shrink-0 py-2 border-2 border-dashed border-stone-200 rounded-xl text-stone-400 text-xs font-bold hover:border-stone-400 hover:text-stone-600 transition-all"
                  >
                    + Add Master Device
                  </button>
                )}
              </HardwareRow>

              <HardwareRow
                title="Internet Devices"
                icon={<Wifi className="w-5 h-5 text-blue-600" />}
              >
                {masterDevices
                  .filter((md) => md.category === "internet" || md.tags.includes("internet"))
                  .map((md) => (
                  <div key={md.id} className="w-[260px] shrink-0 bg-stone-50 p-4 rounded-xl border border-stone-200 shadow-sm group relative">
                    <div className="flex justify-between items-start mb-2">
                      <p className="font-bold text-sm">{md.name}</p>
                      <div className={`flex gap-1 transition-opacity ${isDeveloper ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                        <button onClick={() => startEditingMasterDevice(md)} className="p-1 text-stone-400 hover:text-emerald-600 rounded" title="Edit"><Settings className="w-3 h-3" /></button>
                        <button onClick={() => deleteMasterDevice(md.id)} className="p-1 text-stone-400 hover:text-red-600 rounded" title="Delete"><Trash2 className="w-3 h-3" /></button>
                      </div>
                      <div className="flex gap-1 flex-wrap">
                        {md.tags.map(tag => (
                          <span key={`${md.id}-${tag}`} className="px-1.5 py-0.5 bg-white text-stone-400 text-[8px] font-black uppercase rounded border border-stone-200">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="text-xs text-stone-500">
                      {md.default_watts}W • {md.specs?.device_class ? INTERNET_DEVICE_CLASS_LABELS[md.specs.device_class] || md.specs.device_class : md.category}
                    </div>
                  </div>
                ))}
                {isDeveloper && (
                  <button 
                    onClick={() => { setEditingMasterDevice(null); setMasterDeviceClass(""); setMasterDeviceCategory("internet"); setShowAddMasterDevice(true); }}
                    className="w-[260px] shrink-0 py-2 border-2 border-dashed border-stone-200 rounded-xl text-stone-400 text-xs font-bold hover:border-stone-400 hover:text-stone-600 transition-all"
                  >
                    + Add Internet Device
                  </button>
                )}
              </HardwareRow>

              <HardwareRow title="Inverters" icon={<Cpu className="w-5 h-5 text-emerald-600" />}>
                {inverters.map((inv) => (
                  <HardwareCard
                    key={inv.id}
                    name={inv.name}
                    isDeveloper={isDeveloper}
                    onDuplicate={() => duplicateHardware("inverter", inv)}
                    onEdit={() => startEditing("inverter", inv)}
                    onDelete={() => deleteHardware("inverter", inv.id)}
                  >
                    <div className="grid grid-cols-2 gap-2 text-xs text-stone-500">
                      <span>Max AC: {inv.max_ac_w}W</span>
                      <span>DC Volts: {inv.system_vdc}V</span>
                      <span>PV Max: {inv.cc_max_pv_w}W</span>
                      <span>Max Voc: {inv.cc_max_voc}V</span>
                      <span>Max Amps: {inv.cc_max_amps}A</span>
                      <span>Charge: {inv.max_charge_amps}A</span>
                      <span>Parallel: {inv.max_parallel_units} Units</span>
                      <span className="uppercase">CC: {inv.cc_type || "pwm"}</span>
                      <span className="col-span-2 font-bold text-emerald-600 mt-1">₦{inv.price.toLocaleString()}</span>
                    </div>
                  </HardwareCard>
                ))}
              </HardwareRow>

              <HardwareRow title="Solar Panels" icon={<Sun className="w-5 h-5 text-amber-500" />}>
                {panels.map((p) => (
                  <HardwareCard
                    key={p.id}
                    name={p.name}
                    isDeveloper={isDeveloper}
                    onDuplicate={() => duplicateHardware("panel", p)}
                    onEdit={() => startEditing("panel", p)}
                    onDelete={() => deleteHardware("panel", p.id)}
                  >
                    <div className="grid grid-cols-2 gap-2 text-xs text-stone-500">
                      <span>Watts: {p.watts}W</span>
                      <span>Voc: {p.voc}V</span>
                      <span>Isc: {p.isc}A</span>
                      <span>Price: ₦{p.price.toLocaleString()}</span>
                    </div>
                  </HardwareCard>
                ))}
              </HardwareRow>

              <HardwareRow title="Batteries" icon={<BatteryIcon className="w-5 h-5 text-blue-600" />}>
                {batteries.map((b) => (
                  <HardwareCard
                    key={b.id}
                    name={b.name}
                    isDeveloper={isDeveloper}
                    onDuplicate={() => duplicateHardware("battery", b)}
                    onEdit={() => startEditing("battery", b)}
                    onDelete={() => deleteHardware("battery", b.id)}
                  >
                    <div className="grid grid-cols-2 gap-2 text-xs text-stone-500">
                      <span className="font-bold text-stone-700">{b.voltage}V {b.capacity_ah}Ah</span>
                      <span className="capitalize">Type: {b.type}</span>
                      <span>Max Parallel: {b.max_parallel_strings}</span>
                      <span>Min C-Rate: {b.min_c_rate}</span>
                      <span className="col-span-2 font-bold text-emerald-600 mt-1">₦{b.price.toLocaleString()}</span>
                    </div>
                  </HardwareCard>
                ))}
              </HardwareRow>

              <HardwareRow title="Powerstations" icon={<Zap className="w-5 h-5 text-stone-900" />}>
                {powerstations.map((ps) => (
                  <HardwareCard
                    key={ps.id}
                    name={ps.name}
                    isDeveloper={isDeveloper}
                    onDuplicate={() => duplicateHardware("powerstation", ps)}
                    onEdit={() => startEditing("powerstation", ps)}
                    onDelete={() => deleteHardware("powerstation", ps.id)}
                  >
                    <div className="grid grid-cols-2 gap-2 text-xs text-stone-500">
                      <span className="font-bold text-stone-700">{ps.capacity_wh}Wh</span>
                      <span>Output: {ps.max_output_w}W</span>
                      <span>PV Max: {ps.max_pv_input_w}W</span>
                      {ps.system_vdc && <span>Sys VDC: {ps.system_vdc}V</span>}
                      {ps.cc_type && <span>CC: {ps.cc_type.toUpperCase()}</span>}
                      {ps.cc_max_voc && <span>Max Voc: {ps.cc_max_voc}V</span>}
                      {ps.cc_max_amps && <span>Max CC: {ps.cc_max_amps}A</span>}
                      {ps.max_charge_amps && <span>Charge: {ps.max_charge_amps}A</span>}
                      {ps.max_parallel_units && <span>Parallel: {ps.max_parallel_units} Units</span>}
                      {ps.battery_voltage && <span>Bat: {ps.battery_voltage}V</span>}
                      {ps.capacity_ah && <span>Cap: {ps.capacity_ah}Ah</span>}
                      {ps.battery_type && <span className="capitalize">{ps.battery_type}</span>}
                      {ps.min_c_rate && <span>Min C: {ps.min_c_rate}</span>}
                      <span className="col-span-2 font-bold text-emerald-600 mt-1">₦{ps.price.toLocaleString()}</span>
                    </div>
                  </HardwareCard>
                ))}
              </HardwareRow>

              <HardwareRow title="Charge Controllers" icon={<Cpu className="w-5 h-5 text-cyan-600" />}>
                {chargeControllers.map((cc) => (
                  <HardwareCard
                    key={cc.id}
                    name={cc.name}
                    isDeveloper={isDeveloper}
                    onDuplicate={() => duplicateHardware("chargeController", cc)}
                    onEdit={() => startEditing("chargeController", cc)}
                    onDelete={() => deleteHardware("chargeController", cc.id)}
                  >
                    <div className="grid grid-cols-2 gap-2 text-xs text-stone-500">
                      <span className="font-bold text-stone-700">{cc.type.toUpperCase()}</span>
                      <span>Bat: {cc.battery_voltage}V</span>
                      <span>Max PV: {cc.max_pv_w}W</span>
                      <span>Max Voc: {cc.max_voc}V</span>
                      <span>Max Amps: {cc.max_amps}A</span>
                      <span className="col-span-2 font-bold text-emerald-600 mt-1">₦{cc.price.toLocaleString()}</span>
                    </div>
                  </HardwareCard>
                ))}
              </HardwareRow>

              {(Object.keys(WIRING_CATEGORY_LABELS) as WiringCategory[]).map((category) => {
                const items = wiring.filter((w) => w.category === category);
                return (
                  <HardwareRow
                    key={category}
                    title={WIRING_CATEGORY_LABELS[category].label}
                    icon={<Layers className="w-5 h-5 text-stone-400" />}
                  >
                    {items.map((w) => (
                      <HardwareCard
                        key={w.id}
                        name={w.name}
                        isDeveloper={isDeveloper}
                        onDuplicate={() => duplicateHardware("wiring", w)}
                        onEdit={() => startEditing("wiring", w)}
                        onDelete={() => deleteHardware("wiring", w.id)}
                      >
                        <div className="space-y-2 text-xs text-stone-500">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            w.type === "mandatory" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                          }`}>
                            {w.type === "mandatory" ? "Required" : "Optional"}
                          </span>
                          <p className="line-clamp-2">{w.description}</p>
                          <div className="grid grid-cols-2 gap-1">
                            {Object.entries(w.specs || {}).slice(0, 4).map(([key, value]) => (
                              <span key={key} className="truncate">
                                <span className="text-stone-400">{key}: </span>{String(value)}
                              </span>
                            ))}
                          </div>
                          <p className="font-bold text-emerald-600">₦{w.price.toLocaleString()}</p>
                        </div>
                      </HardwareCard>
                    ))}
                    {items.length === 0 && (
                      <p className="text-xs text-stone-400 italic self-center">No items in this category.</p>
                    )}
                  </HardwareRow>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === "logs" && isDeveloper && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Internal Developer Logs</h2>
                <p className="text-stone-500">Historical calculation attempts and internal logic traces.</p>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    if (confirm("Are you sure you want to clear all internal logs? This cannot be undone.")) {
                      setInternalLogs([]);
                      localStorage.removeItem("ss_internal_logs");
                      storeRemove("ss_internal_logs").catch(() => {});
                    }
                  }}
                  className="bg-red-50 text-red-600 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-red-100 transition-all border border-red-100"
                >
                  <Trash2 className="w-4 h-4" /> Clear All Logs
                </button>
                <button 
                  onClick={exportFullLogs}
                  className="bg-stone-100 text-stone-600 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-stone-200 transition-all border border-stone-200"
                >
                  <Download className="w-4 h-4" /> Export Full Logs
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {internalLogs.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-stone-200">
                  <Activity className="w-12 h-12 text-stone-300 mx-auto mb-4" />
                  <p className="text-stone-400">No calculation attempts recorded yet.</p>
                </div>
              ) : (
                internalLogs.map((log, i) => (
                  <div key={`${log.timestamp || "log"}-${i}`} className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm space-y-4">
                    <div className="flex items-center justify-between border-b border-stone-100 pb-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-stone-100 rounded-lg">
                          <Terminal className="w-4 h-4 text-stone-600" />
                        </div>
                        <div>
                          <p className="text-sm font-bold">{new Date(log.timestamp).toLocaleString()}</p>
                          <p className="text-xs text-stone-500">{log.location} • {log.devices.length} devices</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex gap-4 text-xs font-bold uppercase tracking-wider">
                          <div className="text-stone-400">Checked: <span className="text-stone-900">{log.totalCombinationsChecked}</span></div>
                          <div className="text-emerald-500">Valid: <span className="text-emerald-600">{log.validSystemsCount}</span></div>
                        </div>
                        <button 
                          onClick={() => exportSingleLog(log)}
                          className="p-2 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                          title="Export this log"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4 text-xs">
                      <div className="p-3 bg-stone-50 rounded-xl">
                        <p className="text-stone-400 mb-1">Surge</p>
                        <p className="font-bold">{log.analysis.max_surge}W</p>
                      </div>
                      <div className="p-3 bg-stone-50 rounded-xl">
                        <p className="text-stone-400 mb-1">Night Wh</p>
                        <p className="font-bold">{log.analysis.nighttime_wh}Wh</p>
                      </div>
                      <div className="p-3 bg-stone-50 rounded-xl">
                        <p className="text-stone-400 mb-1">Daily Wh</p>
                        <p className="font-bold">{log.analysis.total_daily_wh}Wh</p>
                      </div>
                    </div>

                    <details className="group">
                      <summary className="text-xs font-bold text-emerald-600 cursor-pointer hover:underline">
                        View Full Logic Trace ({log.allLogs.length} paths)
                      </summary>
                      <div className="mt-4 space-y-4 max-h-60 overflow-y-auto p-4 bg-stone-900 rounded-xl">
                        {log.allLogs.map((path, pi) => (
                          <div key={getLogKey("path", path[0] || "empty", pi)} className="border-l-2 border-stone-700 pl-4 space-y-1">
                            {path.map((line, li) => (
                              <p key={getLogKey("line", line, li)} className="text-[10px] font-mono text-stone-400">{line}</p>
                            ))}
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        {activeTab === "profiles" && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Saved Profiles</h2>
                <p className="text-stone-500">Quickly reuse your settings and load profiles.</p>
              </div>
              <div className="flex gap-2 items-center">
                <div className="flex items-center gap-1">
                  <label className="bg-stone-100 text-stone-600 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-stone-200 transition-all border border-stone-200 cursor-pointer">
                    <Upload className="w-4 h-4" /> Import Profiles
                    <input type="file" accept=".json" onChange={importProfiles} className="hidden" />
                  </label>
                  <Tooltip content={`[
  {
    "name": "My Home",
    "region": "SW",
    "devices": [{"name": "TV", "watts": 100, ...}]
  }
]`}>
                    <div className="w-5 h-5 bg-stone-200 rounded-full flex items-center justify-center cursor-help hover:bg-stone-300 transition-colors">
                      <span className="text-[10px] font-bold">!</span>
                    </div>
                  </Tooltip>
                </div>
                <button 
                  onClick={exportProfilesJSON}
                  className="bg-stone-100 text-stone-600 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-stone-200 transition-all border border-stone-200"
                >
                  <Download className="w-4 h-4" /> Export JSON
                </button>
                <button 
                  onClick={() => {
                    const doc = new jsPDF();
                    doc.setFontSize(20);
                    doc.text("Saved Profiles Inventory", 20, 20);
                    
                    profiles.forEach((p, i) => {
                      if (i > 0) doc.addPage();
                      doc.setFontSize(16);
                      doc.text(`Profile: ${p.name}`, 20, 40);
                      doc.setFontSize(10);
                      doc.text(`Region: ${REGIONS.find(r => r.value === p.region)?.label}`, 20, 50);
                      doc.text(`Battery Preference: ${p.batteryPreference}`, 20, 55);
                      
                      autoTable(doc, {
                        startY: 65,
                        head: [["Device", "Watts", "Qty", "Hours", "Daily Wh"]],
                        body: p.devices.map(d => {
                          const hours = d.ranges.reduce((acc, r) => acc + (r.end >= r.start ? r.end - r.start : 24 - r.start + r.end), 0);
                          return [d.name, d.watts, d.qty, hours, d.watts * d.qty * hours];
                        }),
                        theme: "striped"
                      });
                    });
                    doc.save("SolarSizer_Profiles.pdf");
                  }}
                  className="bg-stone-100 text-stone-600 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-stone-200 transition-all border border-stone-200"
                >
                  <Download className="w-4 h-4" /> Export PDF
                </button>
                <button 
                  onClick={() => setShowSaveProfile(true)}
                  className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-emerald-700 transition-all"
                >
                  <Save className="w-4 h-4" /> Save Current
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {profiles.length === 0 ? (
                <div className="col-span-full text-center py-20 bg-white rounded-3xl border border-dashed border-stone-200">
                  <UserCircle className="w-12 h-12 text-stone-300 mx-auto mb-4" />
                  <p className="text-stone-400">No profiles saved yet.</p>
                </div>
              ) : (
                profiles.map((p) => (
                  <div key={p.id} className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm hover:border-emerald-500 transition-all group">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-50 rounded-lg">
                          <UserCircle className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div>
                          <h3 className="font-bold text-lg">{p.name}</h3>
                          <p className="text-xs text-stone-400">{new Date(p.timestamp).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => deleteProfile(p.id)}
                        className="p-2 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="space-y-3 mb-6">
                      <div className="flex items-center gap-2 text-xs text-stone-600">
                        <MapPin className="w-3.5 h-3.5" />
                        <span>{REGIONS.find(r => r.value === p.region)?.label}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-stone-600">
                        <BatteryIcon className="w-3.5 h-3.5" />
                        <span className="capitalize">{p.batteryPreference.replace("-", " ")} Preference</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-stone-600">
                        <Zap className="w-3.5 h-3.5" />
                        <span>{p.devices.length} Devices in Load Profile</span>
                      </div>
                    </div>

                    <button 
                      onClick={() => loadProfile(p)}
                      className="w-full py-2.5 bg-stone-900 text-white rounded-xl text-sm font-bold hover:bg-stone-800 transition-all flex items-center justify-center gap-2"
                    >
                      <FolderOpen className="w-4 h-4" /> Load Profile
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        {activeTab === "results" && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Saved Results</h2>
                <p className="text-stone-500">Access your previously saved system configurations.</p>
              </div>
              {selectedSavedAnalysis && (
                <button 
                  onClick={() => setSelectedSavedAnalysis(null)}
                  className="flex items-center gap-2 text-stone-500 hover:text-stone-900 font-medium transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" /> Back to List
                </button>
              )}
            </div>

            {!selectedSavedAnalysis ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {savedResults.length === 0 ? (
                  <div className="col-span-full text-center py-20 bg-white rounded-3xl border border-dashed border-stone-200">
                    <Save className="w-12 h-12 text-stone-300 mx-auto mb-4" />
                    <p className="text-stone-400">No saved results yet.</p>
                  </div>
                ) : (
                  savedResults.map((r) => {
                    const isAnalysis = !!r.systems && !r.is_comparison;
                    const isComparison = !!r.is_comparison;
                    return (
                      <div key={r.id} className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm hover:border-emerald-500 transition-all group">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-emerald-50 rounded-lg">
                              {isComparison ? <Scale className="w-5 h-5 text-emerald-600" /> : isAnalysis ? <LayoutGrid className="w-5 h-5 text-emerald-600" /> : <Zap className="w-5 h-5 text-emerald-600" />}
                            </div>
                            <div>
                              <h3 className="font-bold text-lg">{r.profile_name}</h3>
                              <p className="text-xs text-stone-400">{new Date(r.created_at).toLocaleDateString()}</p>
                            </div>
                          </div>
                          <button 
                            onClick={() => deleteResult(r.id)}
                            className="p-2 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        {isComparison ? (
                          <div className="space-y-3 mb-6">
                            <div className="flex items-center gap-2 text-xs text-stone-600 font-medium">
                              <Scale className="w-3.5 h-3.5" />
                              <span>Comparison of {r.systems?.length || 0} Systems</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-stone-600">
                              <Zap className="w-3.5 h-3.5" />
                              <span>{r.analysis?.max_surge.toFixed(0)}W Peak Surge</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-stone-600">
                              <Info className="w-3.5 h-3.5" />
                              <span>{r.has_generator ? "Owned Generator" : "New Generator"}</span>
                            </div>
                          </div>
                        ) : isAnalysis ? (
                          <div className="space-y-3 mb-6">
                            <div className="flex items-center gap-2 text-xs text-stone-600 font-medium">
                              <Layers className="w-3.5 h-3.5" />
                              <span>{r.systems?.length || 0} System Options</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-stone-600">
                              <Zap className="w-3.5 h-3.5" />
                              <span>{Math.max(...Object.values(r.analysis?.hourly_consumption || {})).toFixed(0)}W Max Hourly Average</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-stone-600">
                              <BatteryIcon className="w-3.5 h-3.5" />
                              <span>{r.analysis?.total_daily_wh.toFixed(0)}Wh Daily Energy</span>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3 mb-6">
                            <div className="flex items-center gap-2 text-xs text-stone-600">
                              <Cpu className="w-3.5 h-3.5" />
                              <span>{r.system_data?.inverter}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-stone-600">
                              <BatteryIcon className="w-3.5 h-3.5" />
                              <span>{r.system_data?.battery_config}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-stone-600">
                              <Sun className="w-3.5 h-3.5" />
                              <span>{r.system_data?.panel_config}</span>
                            </div>
                            <div className="pt-2 border-t border-stone-100 flex justify-between items-center">
                              <span className="text-xs font-bold text-stone-400">Total Price</span>
                              <span className="text-sm font-black text-stone-900">₦{r.system_data?.total_price.toLocaleString()}</span>
                            </div>
                          </div>
                        )}

                        <div className="flex gap-2">
                          <button 
                            onClick={() => {
                              if (isComparison) setSelectedSavedComparison(r);
                              else if (isAnalysis) setSelectedSavedAnalysis(r);
                              else { setDetailSource("results"); setSelectedSystemDetails(r.system_data!); }
                            }}
                            className="flex-[2] py-2.5 bg-stone-900 text-white rounded-xl text-sm font-bold hover:bg-stone-800 transition-all flex items-center justify-center gap-2"
                          >
                            {isComparison ? "Open Comparison" : isAnalysis ? "Open Analysis" : "View Details"}
                          </button>
                          <button 
                            onClick={() => {
                              if (isComparison) {
                                exportComparisonToPDF(r.profile_name, r.systems!, r.has_generator, 6, null, r.has_grid || false, r.grid_per_kwh || 12, r.grid_kwh_override ?? null, r.analysis);
                              } else if (isAnalysis) {
                                exportResultsToPDF({ analysis: r.analysis!, systems: r.systems! }, r.devices);
                              } else {
                                generateQuote(r.system_data!);
                              }
                            }}
                            className="flex-1 py-2.5 bg-stone-100 text-stone-600 rounded-xl text-sm font-bold hover:bg-stone-200 transition-all flex items-center justify-center"
                            title="Download PDF"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-emerald-900 mb-2">Analysis Summary: {selectedSavedAnalysis.profile_name}</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 mb-1">Max Hourly Average</p>
                          <p className="text-lg font-black text-emerald-900">{selectedSavedAnalysis.analysis ? Math.max(...Object.values(selectedSavedAnalysis.analysis.hourly_consumption)).toFixed(0) : 0}W</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 mb-1">Daily Energy</p>
                          <p className="text-lg font-black text-emerald-900">{selectedSavedAnalysis.analysis?.total_daily_wh.toFixed(0) || 0}Wh</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 mb-1">Surge Load</p>
                          <p className="text-lg font-black text-emerald-900">{selectedSavedAnalysis.analysis?.max_surge.toFixed(0) || 0}W</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 mb-1">Options</p>
                          <p className="text-lg font-black text-emerald-900">{selectedSavedAnalysis.systems?.length || 0}</p>
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={() => exportResultsToPDF({ analysis: selectedSavedAnalysis.analysis!, systems: selectedSavedAnalysis.systems! }, selectedSavedAnalysis.devices)}
                      className="bg-emerald-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-emerald-700 transition-all flex items-center gap-2 shadow-lg shadow-emerald-600/20"
                    >
                      <Download className="w-5 h-5" /> Export PDF Report
                    </button>
                  </div>

                <div className="space-y-4">
                  {selectedSavedAnalysis.systems?.map((sys, idx) => (
                    <motion.div
                      key={getSystemKey(sys, idx)}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200 hover:border-emerald-500 transition-all group relative overflow-hidden"
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="space-y-4 flex-1">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-stone-100 rounded-lg">
                              <Zap className="w-5 h-5 text-stone-600" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="font-bold text-lg">{sys.inverter}</h3>
                                {sys.status === "Optimal" ? (
                                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase rounded-full flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" /> Perfect Match
                                  </span>
                                ) : sys.status === "High Risk" ? (
                                  <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold uppercase rounded-full flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3" /> Undersized
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold uppercase rounded-full flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3" /> Budget Option
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-stone-500 uppercase tracking-wider font-semibold">Hybrid System Core</p>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="flex items-start gap-2">
                              <BatteryIcon className="w-4 h-4 text-emerald-600 mt-0.5" />
                              <div>
                                <p className="text-sm font-semibold">{sys.battery_config}</p>
                                <p className="text-xs text-stone-500">Storage Configuration</p>
                              </div>
                            </div>
                            <div className="flex items-start gap-2">
                              <Sun className="w-4 h-4 text-amber-500 mt-0.5" />
                              <div>
                                <p className="text-sm font-semibold">{sys.panel_config}</p>
                                <p className="text-xs text-stone-500">{Math.round(sys.array_size_w || 0)}W Array • {sys.daily_yield.toFixed(0)}Wh/day</p>
                              </div>
                            </div>
                          </div>

                          <div className={`p-3 rounded-xl text-xs flex gap-2 items-start ${
                            sys.status === 'Optimal' ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' : 
                            sys.status === 'High Risk' ? 'bg-red-50 text-red-800 border border-red-100' :
                            'bg-amber-50 text-amber-800 border border-amber-100'
                          }`}>
                            {sys.status === 'Optimal' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <Info className="w-4 h-4 shrink-0" />}
                            <p>{sys.advice}</p>
                          </div>
                        </div>

                        <div className="md:text-right pt-4 md:pt-0 border-t md:border-t-0 border-stone-100">
                          <p className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-1">Estimated Cost</p>
                          <p className="text-3xl font-black text-stone-900">
                            <span className="text-sm font-bold mr-1">NGN</span>
                            {sys.total_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                          <div className="mt-4 flex flex-col gap-2">
                            <button 
                              onClick={() => setSelectedSystemLog(sys.log)}
                              className="w-full md:w-auto px-6 py-2.5 bg-stone-100 text-stone-900 rounded-xl font-semibold hover:bg-stone-200 transition-all flex items-center justify-center gap-2"
                            >
                              <ListIcon className="w-4 h-4" /> View Log
                            </button>
                            <div className="flex gap-2">
                              <button 
                                onClick={() => { setDetailSource("results"); setSelectedSystemDetails(sys); }}
                                className="flex-1 px-6 py-2.5 bg-stone-900 text-white rounded-xl font-semibold hover:bg-stone-800 transition-all flex items-center justify-center gap-2"
                              >
                                View Details <ChevronRight className="w-4 h-4" />
                              </button>
                                <button 
                                  onClick={() => saveResult(sys)}
                                  className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl font-semibold hover:bg-emerald-100 transition-all flex items-center justify-center gap-2"
                                  title="Save this configuration"
                                >
                                  <Save className="w-5 h-5" />
                                </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Save Profile Modal */}
      <AnimatePresence>
        {showSaveProfile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-stone-100 flex items-center justify-between">
                <h2 className="font-bold text-xl">Save Load Profile</h2>
                <button onClick={() => setShowSaveProfile(false)} className="p-2 hover:bg-stone-100 rounded-full"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-stone-500">
                  Save your current region, battery preferences, and device list as a reusable profile.
                </p>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1.5">Profile Name</label>
                  <input 
                    type="text" 
                    placeholder="e.g. My Home Setup"
                    value={profileName}
                    onChange={e => setProfileName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                    autoFocus
                  />
                </div>
                <div className="pt-4 flex gap-3">
                  <button 
                    onClick={() => setShowSaveProfile(false)}
                    className="flex-1 py-3 bg-stone-100 text-stone-900 rounded-xl font-bold hover:bg-stone-200 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={saveProfile}
                    disabled={!profileName.trim()}
                    className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Save Profile
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="bg-white border-t border-stone-200 mt-12 py-12">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-6 h-6 bg-emerald-600 rounded flex items-center justify-center">
                  <Sun className="text-white w-4 h-4" />
                </div>
                <h2 className="font-bold tracking-tight">SolarSizer Pro</h2>
              </div>
              <p className="text-stone-500 text-sm max-w-sm">
                Advanced solar sizing algorithms based on real-world meteorological data and hardware specifications. 
                Always consult with a certified engineer before installation.
              </p>
            </div>
            <div>
              <h4 className="font-bold text-sm uppercase tracking-wider mb-4">Resources</h4>
              <ul className="space-y-2 text-sm text-stone-500">
                <li><a href="#" className="hover:text-emerald-600">Installation Guide</a></li>
                <li><a href="#" className="hover:text-emerald-600">Battery Safety</a></li>
                <li><a href="#" className="hover:text-emerald-600">Panel Efficiency</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-sm uppercase tracking-wider mb-4">Support</h4>
              <ul className="space-y-2 text-sm text-stone-500">
                <li><a href="#" className="hover:text-emerald-600">Contact Experts</a></li>
                <li><a href="#" className="hover:text-emerald-600">Hardware Partners</a></li>
                <li><a href="#" className="hover:text-emerald-600">API Documentation</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-stone-100 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-stone-400">
            <p>© 2026 SolarSizer Pro. All rights reserved.</p>
            <div className="flex gap-6">
              <a href="#" className="hover:text-stone-600">Privacy Policy</a>
              <a href="#" className="hover:text-stone-600">Terms of Service</a>
              <a href="#" className="hover:text-stone-600">Cookie Settings</a>
            </div>
          </div>
        </div>
      </footer>

      {/* System Details Modal */}
      <AnimatePresence>
        {selectedSystemDetails && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm p-4 flex items-center justify-center"
            onClick={() => {
              setSelectedSystemDetails(null);
              setDetailSource("results");
              setShowInteractiveBridge(false);
              setAdjustedLoad(null);
            }}
          >
            <motion.div
              initial={{ scale: 0.96, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 16 }}
              className="bg-white w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-stone-100 flex items-center justify-between bg-emerald-600 text-white">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="w-6 h-6" />
                  <h2 className="font-bold text-xl">System Configuration Details</h2>
                </div>
                <button
                  onClick={() => {
                    setSelectedSystemDetails(null);
                    setDetailSource("results");
                    setShowInteractiveBridge(false);
                    setAdjustedLoad(null);
                  }}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-8">
                <div className="p-4 rounded-2xl flex items-start gap-3 border transition-colors bg-stone-50 border-stone-100">
                  {selectedSystemDetails.status === "Optimal" ? (
                    <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
                  ) : selectedSystemDetails.status === "High Risk" ? (
                    <AlertCircle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <h4
                      className={`font-bold text-sm uppercase tracking-wider ${
                        selectedSystemDetails.status === "Optimal"
                          ? "text-emerald-700"
                          : selectedSystemDetails.status === "High Risk"
                          ? "text-red-700"
                          : "text-amber-700"
                      }`}
                    >
                      {selectedSystemDetails.status === "Optimal"
                        ? "Perfect Match"
                        : selectedSystemDetails.status === "High Risk"
                        ? "Undersized Configuration"
                        : "Conditional Recommendation"}
                    </h4>
                    <p className="text-sm text-stone-600 mt-1">{selectedSystemDetails.advice}</p>
                    {selectedSystemDetails.status !== "Optimal" && !showInteractiveBridge && (
                      <button
                        onClick={() => setShowInteractiveBridge(true)}
                        className="mt-3 px-4 py-1.5 bg-amber-600 text-white text-xs font-bold rounded-lg hover:bg-amber-700 transition-all flex items-center gap-2"
                      >
                        <Activity className="w-3 h-3" /> Bridge the Gap Interactively
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => startBachsCheckout(quotedSystem ?? selectedSystemDetails)}
                    disabled={checkoutLoading}
                    className="shrink-0 px-5 py-2.5 bg-stone-900 text-white rounded-xl font-bold text-sm hover:bg-stone-800 transition-all flex items-center gap-2 disabled:opacity-60"
                  >
                    <ShoppingCart className="w-4 h-4" />
                    {checkoutLoading ? "Starting..." : "Buy"}
                  </button>
                </div>

                {showInteractiveBridge && selectedSystemDetails.status !== "Optimal" ? (
                  <InteractiveBridge
                    devices={devices}
                    initialDeficit={selectedSystemDetails.deficit}
                    onClose={() => setShowInteractiveBridge(false)}
                    onChange={(adj, def) => setAdjustedLoad({ devices: adj, deficit: def })}
                  />
                ) : (
                  <div className="flex flex-col md:flex-row gap-6">
                      <div className={`flex-1 min-w-0 p-6 bg-stone-50 rounded-2xl border border-stone-100 transition-all ${selectedSystemDetails.inverter ? "" : "hidden"} ${ partialMode && !partialIncludedComponents.inverter ? "opacity-40 border-dashed border-stone-300 bg-white" : "" }`}>
                        <Cpu className="w-8 h-8 text-emerald-600 mb-4" />
                        <h3 className="font-bold text-lg mb-1">{selectedSystemDetails.inverter}</h3>
                        <p className="text-sm text-stone-500">Central Power Unit</p>
                        {partialMode && (
                          <label className="flex items-center gap-2 cursor-pointer mt-2 shrink-0">
                            <input
                              type="checkbox"
                              checked={partialIncludedComponents.inverter}
                              onChange={(e) => setPartialIncludedComponents(prev => ({ ...prev, inverter: e.target.checked }))}
                              className="w-4 h-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
                            />
                            <span className="text-xs font-bold text-stone-600">Include</span>
                          </label>
                        )}
                        <div className="mt-4 space-y-2 text-xs">
                          <div className="flex justify-between"><span>AC Output</span><span className="font-bold">Pure Sine Wave</span></div>
                          <div className="flex justify-between"><span>Efficiency</span><span className="font-bold">~93%</span></div>
                          <div className="flex justify-between pt-2 border-t border-stone-200">
                            <span className="text-emerald-600 font-bold">Price</span>
                            <span className="font-bold">
                              {partialMode && !partialIncludedComponents.inverter
                                ? "Excluded"
                                : selectedSystemDetails.inverter_price > 0
                                  ? `₦${selectedSystemDetails.inverter_price.toLocaleString()}`
                                  : "Included"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className={`flex-1 min-w-0 p-6 bg-stone-50 rounded-2xl border border-stone-100 transition-all ${
                        selectedSystemDetails.battery_config ? "" : "hidden"
                      } ${
                        partialMode && !partialIncludedComponents.batteries 
                          ? "opacity-40 border-dashed border-stone-300 bg-white" 
                          : ""
                      }`}>
                        <BatteryIcon className="w-8 h-8 text-blue-600 mb-4" />
                        <h3 className="font-bold text-lg mb-1">{selectedSystemDetails.battery_config}</h3>
                        <p className="text-sm text-stone-500">Energy Storage Bank</p>
                        {partialMode && (
                          <label className="flex items-center gap-2 cursor-pointer mt-2 shrink-0">
                            <input
                              type="checkbox"
                              checked={partialIncludedComponents.batteries}
                              onChange={(e) => setPartialIncludedComponents(prev => ({ ...prev, batteries: e.target.checked }))}
                              className="w-4 h-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
                            />
                            <span className="text-xs font-bold text-stone-600">Include</span>
                          </label>
                        )}
                        <div className="mt-4 space-y-2 text-xs">
                          <div className="flex justify-between"><span>Wiring</span><span className="font-bold">Series-Parallel</span></div>
                          <div className="flex justify-between">
                            <span>Usable Capacity</span>
                            <span className="font-bold">
                              {(selectedSystemDetails.battery_total_wh || selectedSystemDetails.battery_wh || 0).toFixed(0)}Wh
                            </span>
                          </div>
                          <div className="flex justify-between pt-2 border-t border-stone-200">
                            <span className="text-blue-600 font-bold">Price</span>
                            <span className="font-bold">
                              {partialMode && !partialIncludedComponents.batteries
                                ? "Excluded"
                                : selectedSystemDetails.battery_price > 0
                                  ? `₦${selectedSystemDetails.battery_price.toLocaleString()}`
                                  : "Included"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className={`flex-1 min-w-0 p-6 bg-stone-50 rounded-2xl border border-stone-100 transition-all ${
                        selectedSystemDetails.panel_config ? "" : "hidden"
                      } ${
                        partialMode && !partialIncludedComponents.panels 
                          ? "opacity-40 border-dashed border-stone-300 bg-white" 
                          : ""
                      }`}>
                        <Sun className="w-8 h-8 text-amber-500 mb-4" />
                        <h3 className="font-bold text-lg mb-1">{selectedSystemDetails.panel_config}</h3>
                        <p className="text-sm text-stone-500">Photovoltaic Array</p>
                        {partialMode && (
                          <label className="flex items-center gap-2 cursor-pointer mt-2 shrink-0">
                            <input
                              type="checkbox"
                              checked={partialIncludedComponents.panels}
                              onChange={(e) => setPartialIncludedComponents(prev => ({ ...prev, panels: e.target.checked }))}
                              className="w-4 h-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
                            />
                            <span className="text-xs font-bold text-stone-600">Include</span>
                          </label>
                        )}
                        <div className="mt-4 space-y-2 text-xs">
                          <div className="flex justify-between"><span>Peak Power</span><span className="font-bold">{Math.round(selectedSystemDetails.array_size_w || 0)}W</span></div>
                          <div className="flex justify-between"><span>Daily Yield</span><span className="font-bold">{(selectedSystemDetails.daily_yield || 0).toFixed(0)}Wh</span></div>
                          <div className="flex justify-between pt-2 border-t border-stone-200">
                            <span className="text-amber-600 font-bold">Price</span>
                            <span className="font-bold">
                              {partialMode && !partialIncludedComponents.panels
                                ? "Excluded"
                                : selectedSystemDetails.panel_price > 0
                                  ? `₦${selectedSystemDetails.panel_price.toLocaleString()}`
                                  : "Included"}
                            </span>
                          </div>
                        </div>
                      </div>
                  </div>
                )}

                    {hasWiring && liveSizing && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between gap-3">
                          <h4 className="font-bold text-lg flex items-center gap-2">
                            <Layers className="w-5 h-5 text-stone-400" />
                            {isCatalogProduct ? "Additional Items & Installation" : "Wiring & Installation"}
                          </h4>
                          <span className="text-sm font-bold text-emerald-600">₦{liveWiringPrice.toLocaleString()}</span>
                        </div>
                        
                        {/* Partial/Upgrade Mode Toggle */}
                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={partialMode}
                              onChange={(e) => setPartialMode(e.target.checked)}
                              className="w-4 h-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
                            />
                            <span className="text-sm font-medium text-stone-700">Partial / Upgrade Mode</span>
                          </label>
                          <span className="text-xs text-stone-500">Toggle to pick individual components (disable auto-sizing)</span>
                        </div>

                        {partialMode ? (
                          <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-xl border border-amber-100 flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            <span>
                              {isCatalogProduct ? (
                                <>
                                  <strong>Pick what you need.</strong> This product is sold on its own, so every extra
                                  item is optional. Sizes come from the product specs, so check the gauge before you order.
                                </>
                              ) : (
                                <>
                                  <strong>Auto-sizing disabled.</strong> Cable gauges won't update for your system.
                                  Specify your own lengths. This quote is for components only — not a complete installed system.
                                </>
                              )}
                            </span>
                          </p>
                        ) : (
                          <p className="text-xs text-stone-500">
                            Required cables are sized automatically for your system.
                            Adjust quantities or add optional items below.
                          </p>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {/* Sized items first, then the ones that still apply but
                              have no size to size them against yet. */}
                          {liveSizing.includeIds.size > 0 && (
                            <>
                              {Array.from(liveSizing.includeIds)
                                .map(id => wiring.find(w => w.id === id))
                                .filter(Boolean)
                                .map((item) => {
                                  if (!item) return null;
                                  const isOptional = item.type === "nice-to-have";
                                  const isIncluded = partialMode
                                    ? (wiringQuantities[item.id] !== undefined ? wiringQuantities[item.id] : (item.qty ?? 1)) > 0
                                    : (isOptional && selectedNiceToHaveIds.has(item.id)) || !isOptional;
                                  const currentQty = wiringQuantities[item.id] ?? item.qty ?? 1;
                                  const itemPrice = calculateWirePrice({ ...item, qty: currentQty, length_override: item.length_override });
                                  const tooltipText = item.tooltip ?? item.description;
                                  return (
                                    <div
                                      key={item.id}
                                      title={tooltipText}
                                      className={`p-4 rounded-2xl border transition-all relative ${
                                        isIncluded
                                          ? (isOptional
                                            ? "bg-amber-50 border-amber-100"
                                            : "bg-emerald-50 border-emerald-100")
                                          : "bg-white border-dashed border-stone-200 opacity-50"
                                      }`}
                                    >
                                      {/* Tooltip on hover - wrapper for group hover */}
                                      <div className="relative group">
                                        {tooltipText && (
                                          <div className="absolute z-20 bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 bg-stone-900 text-white text-xs px-3 py-2 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-normal pointer-events-none">
                                            {tooltipText}
                                            <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-4 border-transparent border-t-stone-900" />
                                          </div>
                                        )}

                                        <div className="flex items-start justify-between gap-3">
                                          <div className="flex-1 min-w-0">
                                            <p className="font-bold text-stone-900 break-words">{item.name}</p>
                                            <p className="text-xs text-stone-500">
                                              {WIRING_CATEGORY_LABELS[item.category]?.label ?? item.category}
                                            </p>
                                          </div>
                                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                                            isOptional
                                              ? (isIncluded ? "bg-amber-100 text-amber-700" : "bg-stone-100 text-stone-500")
                                              : "bg-emerald-100 text-emerald-700"
                                          }`}>
                                            {isOptional ? "Optional" : "Required"}
                                          </span>
                                        </div>

                                        <div className="space-y-1 text-xs text-stone-500 mb-3">
                                          {Object.entries(item.specs || {}).map(([key, value]) => (
                                            <div key={key} className="flex items-center justify-between gap-4">
                                              <span className="capitalize">{key.replace(/_/g, " ")}</span>
                                              <span className="font-semibold text-stone-700">{String(value)}</span>
                                            </div>
                                          ))}
                                        </div>

                                        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-stone-200">
                                          <span className="font-bold text-emerald-600">₦{itemPrice.toLocaleString()}</span>
                                          <div className="flex items-center gap-4">
                                            {/* Checkbox for all items in partial mode, optional items only in normal mode */}
                                            {(partialMode || isOptional) ? (
                                              <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                  type="checkbox"
                                                  checked={isIncluded}
                                                  onChange={(e) => {
                                                    e.stopPropagation();
                                                    if (partialMode) {
                                                      // In partial mode, toggle inclusion via quantity (0 = excluded)
                                                      const qty = e.target.checked ? (currentQty || 1) : 0;
                                                      setWiringQuantities(prev => ({ ...prev, [item.id]: qty }));
                                                      setWiring(prev => prev.map(w =>
                                                        w.id === item.id ? { ...w, qty } : w
                                                      ));
                                                    } else {
                                                      // Normal mode: only for optional items
                                                      const next = new Set(selectedNiceToHaveIds);
                                                      if (e.target.checked) next.add(item.id);
                                                      else next.delete(item.id);
                                                      setSelectedNiceToHaveIds(next);
                                                    }
                                                  }}
                                                  className="w-4 h-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
                                                />
                                                <span className="text-xs font-bold text-stone-600">Include</span>
                                              </label>
                                            ) : (
                                              <span className="text-xs font-bold text-stone-400 flex items-center gap-1">
                                                <CheckCircle2 className="w-3 h-3" /> Required
                                              </span>
                                            )}
                                            {/* Quantity control for all items */}
                                            <div className="flex items-center gap-2">
                                              <span className="text-xs text-stone-500">Qty:</span>
                                              <input
                                                type="number"
                                                min={partialMode ? "0" : "1"}
                                                max="100"
                                                value={isIncluded ? currentQty : 0}
                                                onChange={(e) => {
                                                  e.stopPropagation();
                                                  const parsed = parseInt(e.target.value);
                                                  const fallback = partialMode ? 0 : 1;
                                                  const qty = Math.max(fallback, Number.isNaN(parsed) ? fallback : parsed);
                                                  setWiringQuantities(prev => ({ ...prev, [item.id]: qty }));
                                                  // Also persist to wiring state for localStorage
                                                  setWiring(prev => prev.map(w =>
                                                    w.id === item.id
                                                      ? { ...w, qty }
                                                      : w
                                                  ));
                                                }}
                                                className="w-16 px-2 py-1 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                                                disabled={!isIncluded}
                                              />
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })
                              }
                            </>
                          )}

                          {/* Items that still apply but have no size to pick, so the
                              buyer chooses the gauge. Only shown in partial mode. */}
                          {partialMode && liveSizing.unsizedIds.size > 0 && (
                            <>
                              {Array.from(liveSizing.unsizedIds)
                                .map(id => wiring.find(w => w.id === id))
                                .filter(Boolean)
                                .map((item) => {
                                  if (!item) return null;
                                  const currentQty = wiringQuantities[item.id] ?? 0;
                                  const isIncluded = currentQty > 0;
                                  const itemPrice = calculateWirePrice({ ...item, qty: currentQty, length_override: item.length_override });
                                  const tooltipText = item.tooltip ?? item.description;
                                  return (
                                    <div
                                      key={item.id}
                                      title={tooltipText}
                                      className={`p-4 rounded-2xl border transition-all relative ${
                                        isIncluded
                                          ? "bg-stone-50 border-stone-300"
                                          : "bg-white border-dashed border-stone-200 opacity-70"
                                      }`}
                                    >
                                      <div className="relative group">
                                        {tooltipText && (
                                          <div className="absolute z-20 bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 bg-stone-900 text-white text-xs px-3 py-2 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-normal pointer-events-none">
                                            {tooltipText}
                                            <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-4 border-transparent border-t-stone-900" />
                                          </div>
                                        )}
                                        <div className="flex items-start justify-between gap-3">
                                          <div className="flex-1 min-w-0">
                                            <p className="font-bold text-stone-900 break-words">{item.name}</p>
                                            <p className="text-xs text-stone-500">
                                              {WIRING_CATEGORY_LABELS[item.category]?.label ?? item.category}
                                            </p>
                                          </div>
                                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                                            liveSizing.requiredIds.has(item.id)
                                              ? "bg-amber-100 text-amber-700"
                                              : "bg-stone-100 text-stone-600"
                                          }`}>
                                            {liveSizing.requiredIds.has(item.id) ? "Required, size to fit" : "Size to fit"}
                                          </span>
                                        </div>
                                        <div className="space-y-1 text-xs text-stone-500 mb-3">
                                          {Object.entries(item.specs || {}).map(([key, value]) => (
                                            <div key={key} className="flex items-center justify-between gap-4">
                                              <span className="capitalize">{key.replace(/_/g, " ")}</span>
                                              <span className="font-semibold text-stone-700">{String(value)}</span>
                                            </div>
                                          ))}
                                        </div>
                                        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-stone-200">
                                          <span className="font-bold text-stone-700">₦{itemPrice.toLocaleString()}</span>
                                          <div className="flex items-center gap-4">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                              <input
                                                type="checkbox"
                                                checked={isIncluded}
                                                onChange={(e) => {
                                                  e.stopPropagation();
                                                  const qty = e.target.checked ? (currentQty || 1) : 0;
                                                  setWiringQuantities(prev => ({ ...prev, [item.id]: qty }));
                                                }}
                                                className="w-4 h-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
                                              />
                                              <span className="text-xs font-bold text-stone-600">Include</span>
                                            </label>
                                            <div className="flex items-center gap-2">
                                              <span className="text-xs text-stone-500">Qty:</span>
                                              <input
                                                type="number"
                                                min={0}
                                                max="100"
                                                value={currentQty}
                                                onChange={(e) => {
                                                  e.stopPropagation();
                                                  const parsed = parseInt(e.target.value);
                                                  const qty = Math.max(0, Number.isNaN(parsed) ? 0 : parsed);
                                                  setWiringQuantities(prev => ({ ...prev, [item.id]: qty }));
                                                }}
                                                className="w-16 px-2 py-1 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                                              />
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                            </>
                          )}

                          {/* Selected charge controllers (cosmetic add-ons, not sized) */}
                          {selectedChargeControllerIds.size > 0 && (
                            <>
                              {Array.from(selectedChargeControllerIds)
                                .map(id => chargeControllers.find(cc => cc.id === id))
                                .filter(Boolean)
                                .map((cc) => {
                                  if (!cc) return null;
                                  return (
                                    <div
                                      key={cc.id}
                                      title={cc.description ?? cc.name}
                                      className="p-4 rounded-2xl border bg-cyan-50 border-cyan-100 transition-all relative group"
                                    >
                                      <div className="relative group">
                                        {(cc.description ?? cc.name) && (
                                          <div className="absolute z-20 bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 bg-stone-900 text-white text-xs px-3 py-2 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-normal pointer-events-none">
                                            {cc.description ?? cc.name}
                                            <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-4 border-transparent border-t-stone-900" />
                                          </div>
                                        )}
                                        <div className="flex items-start justify-between gap-3">
                                          <div className="flex-1 min-w-0">
                                            <p className="font-bold text-stone-900 break-words">{cc.name}</p>
                                            <p className="text-xs text-stone-500">Charge Controller</p>
                                          </div>
                                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-100 text-cyan-700 shrink-0">
                                            Optional
                                          </span>
                                        </div>
                                        <div className="space-y-1 text-xs text-stone-500 mb-3">
                                          <div className="flex items-center justify-between gap-4"><span className="capitalize">Type</span><span className="font-semibold text-stone-700 uppercase">{cc.type}</span></div>
                                          <div className="flex items-center justify-between gap-4"><span>Battery voltage</span><span className="font-semibold text-stone-700">{cc.battery_voltage}V</span></div>
                                          <div className="flex items-center justify-between gap-4"><span>Max PV</span><span className="font-semibold text-stone-700">{cc.max_pv_w}W</span></div>
                                          <div className="flex items-center justify-between gap-4"><span>Max Voc</span><span className="font-semibold text-stone-700">{cc.max_voc}V</span></div>
                                          <div className="flex items-center justify-between gap-4"><span>Max amps</span><span className="font-semibold text-stone-700">{cc.max_amps}A</span></div>
                                        </div>
                                        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-stone-200">
                                          <span className="font-bold text-emerald-600">₦{cc.price.toLocaleString()}</span>
                                          <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                              type="checkbox"
                                              checked={true}
                                              onChange={(e) => {
                                                e.stopPropagation();
                                                const next = new Set(selectedChargeControllerIds);
                                                if (e.target.checked) next.add(cc.id);
                                                else next.delete(cc.id);
                                                setSelectedChargeControllerIds(next);
                                              }}
                                              className="w-4 h-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
                                            />
                                            <span className="text-xs font-bold text-stone-600">Include</span>
                                          </label>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </>
                            )}
                          </div>

                        <p className="text-xs text-stone-500 mt-2">
                          * Only the correctly sized cable gauge is included. Different gauges serve different current requirements.
                          {partialMode && " In partial mode, cable sizing is disabled — verify gauge matches your system."}
                        </p>

                        {/* Available Optional Items - not yet selected */}
                        <div className="mt-6 pt-6 border-t border-stone-200">
                          <button
                            type="button"
                            onClick={() => setShowOptionalItems(!showOptionalItems)}
                            className="w-full flex items-center justify-between gap-2 p-2 rounded-xl hover:bg-stone-100 transition-colors"
                          >
                            <h5 className="font-bold text-stone-700 flex items-center gap-2">
                              <PlusCircle className="w-5 h-5 text-amber-600" />
                              Available Optional Items
                            </h5>
                            <ChevronDown className={`w-5 h-5 text-stone-500 transition-transform ${showOptionalItems ? "rotate-180" : ""}`} />
                          </button>
                          {showOptionalItems && (
                            <div className="mt-3 space-y-3">
                              <p className="text-xs text-stone-500">
                                Only optional items that fit this system are listed. Hover a card to read what it does.
                              </p>
                              <input
                                type="search"
                                value={optionalSearch}
                                onChange={(e) => setOptionalSearch(e.target.value)}
                                placeholder="Search optional items by name or spec..."
                                className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                              />
                              {optionalByCategory.length === 0 && (
                                <p className="text-sm text-stone-500 px-1">No compatible optional items match your search.</p>
                              )}
                              {optionalByCategory.map(([category, items], index) => (
                                <details
                                  key={category}
                                  open={index === 0 || optionalQuery !== ""}
                                  className="rounded-2xl border border-stone-200 bg-stone-50/60"
                                >
                                  <summary className="cursor-pointer select-none px-4 py-3 flex items-center justify-between gap-2">
                                    <span className="font-bold text-sm text-stone-700">{WIRING_CATEGORY_LABELS[category].label}</span>
                                    <span className="text-xs text-stone-500">{items.length} item{items.length === 1 ? "" : "s"}</span>
                                  </summary>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4 pt-0">
                                    {items.map(item => (
                                      <div
                                        key={item.id}
                                        title={item.tooltip ?? item.description}
                                        className="p-4 rounded-2xl border bg-amber-50 border-amber-100 transition-all relative group cursor-pointer hover:bg-amber-100"
                                      >
                                        <div className="absolute z-20 bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 bg-stone-900 text-white text-xs px-3 py-2 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-normal pointer-events-none">
                                          {item.tooltip ?? item.description}
                                          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-4 border-transparent border-t-stone-900" />
                                        </div>
                                        <div className="flex items-center justify-between gap-3">
                                          <div className="flex-1 min-w-0">
                                            <p className="font-bold text-stone-900 break-words">{item.name}</p>
                                            <p className="text-xs text-stone-500">
                                              {WIRING_CATEGORY_LABELS[item.category]?.label ?? item.category}
                                            </p>
                                          </div>
                                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 shrink-0">
                                            Optional
                                          </span>
                                        </div>
                                        <div className="space-y-1 text-xs text-stone-500 mb-3">
                                          {Object.entries(item.specs || {}).map(([key, value]) => (
                                            <div key={key} className="flex items-center justify-between gap-4">
                                              <span className="capitalize">{key.replace(/_/g, " ")}</span>
                                              <span className="font-semibold text-stone-700">{String(value)}</span>
                                            </div>
                                          ))}
                                        </div>
                                        <div className="flex items-center justify-between">
                                          <span className="font-bold text-emerald-600">₦{item.price.toLocaleString()}</span>
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setSelectedNiceToHaveIds(prev => new Set([...prev, item.id]));
                                              // Initialize quantity
                                              setWiringQuantities(prev => ({ ...prev, [item.id]: item.qty ?? 1 }));
                                            }}
                                            className="bg-amber-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-amber-700 transition"
                                          >
                                            Add
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </details>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Available Charge Controllers — catalog-only add-ons, never sized */}
                        {optionalChargeControllers.length > 0 && (
                          <details
                            open={ccQuery !== ""}
                            className="rounded-2xl border border-cyan-200 bg-cyan-50/60"
                          >
                            <summary className="cursor-pointer select-none px-4 py-3 flex items-center justify-between gap-2">
                              <span className="font-bold text-sm text-stone-700 flex items-center gap-2">
                                <Cpu className="w-4 h-4 text-cyan-600" /> Charge Controllers
                              </span>
                              <span className="text-xs text-stone-500">{optionalChargeControllers.length} item{optionalChargeControllers.length === 1 ? "" : "s"}</span>
                            </summary>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4 pt-0">
                              {optionalChargeControllers.map(cc => {
                                const isSelected = selectedChargeControllerIds.has(cc.id);
                                return (
                                  <div
                                    key={cc.id}
                                    title={cc.description ?? cc.name}
                                    className={`p-4 rounded-2xl border transition-all relative group ${isSelected ? "bg-cyan-100 border-cyan-300" : "bg-cyan-50 border-cyan-100 hover:bg-cyan-100"}`}
                                  >
                                    <div className="absolute z-20 bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 bg-stone-900 text-white text-xs px-3 py-2 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-normal pointer-events-none">
                                      {cc.description ?? cc.name}
                                      <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-4 border-transparent border-t-stone-900" />
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="flex-1 min-w-0">
                                        <p className="font-bold text-stone-900 break-words">{cc.name}</p>
                                        <p className="text-xs text-stone-500">{cc.battery_voltage}V {cc.type.toUpperCase()}</p>
                                      </div>
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-100 text-cyan-700 shrink-0">
                                        Optional
                                      </span>
                                    </div>
                                    <div className="space-y-1 text-xs text-stone-500 mb-3">
                                      <div className="flex items-center justify-between gap-4"><span>Max PV</span><span className="font-semibold text-stone-700">{cc.max_pv_w}W</span></div>
                                      <div className="flex items-center justify-between gap-4"><span>Max Voc</span><span className="font-semibold text-stone-700">{cc.max_voc}V</span></div>
                                      <div className="flex items-center justify-between gap-4"><span>Max amps</span><span className="font-semibold text-stone-700">{cc.max_amps}A</span></div>
                                    </div>
                                    <div className="flex items-center justify-between">
                                      <span className="font-bold text-emerald-600">₦{cc.price.toLocaleString()}</span>
                                      <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={(e) => {
                                            e.stopPropagation();
                                            const next = new Set(selectedChargeControllerIds);
                                            if (e.target.checked) next.add(cc.id);
                                            else next.delete(cc.id);
                                            setSelectedChargeControllerIds(next);
                                          }}
                                          className="w-4 h-4 rounded border-stone-300 text-cyan-600 focus:ring-cyan-500"
                                        />
                                        <span className="text-xs font-bold text-stone-600">{isSelected ? "Added" : "Add"}</span>
                                      </label>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </details>
                        )}
                      </div>
                    )}

                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-emerald-50 rounded-2xl border border-emerald-100">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 mb-1">
                          Total System Investment
                        </p>
                        <p className="text-3xl font-black text-emerald-900">
                          ₦{liveSystemTotal.toLocaleString()}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={() => generateQuote(quotedSystem ?? selectedSystemDetails)}
                          className="bg-emerald-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-emerald-700 transition-all flex items-center gap-2"
                        >
                          Generate Quote <ExternalLink className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => startBachsCheckout(quotedSystem ?? selectedSystemDetails)}
                          disabled={checkoutLoading}
                          className="bg-stone-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-stone-800 transition-all flex items-center gap-2 disabled:opacity-60"
                        >
                          <ShoppingCart className="w-4 h-4" />
                          {checkoutLoading ? "Starting..." : "Buy"}
                        </button>
                      </div>
                    </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Product Editor Modal */}
      <AnimatePresence>
        {productDraft && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-lg max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-stone-100 flex items-center justify-between shrink-0">
                <h2 className="font-bold text-xl">
                  {productDraft.mode === "promote" ? "Promote to Product" : "Add Product"}
                </h2>
                <button onClick={() => setProductDraft(null)} className="p-2 hover:bg-stone-100 rounded-full"><X className="w-5 h-5" /></button>
              </div>
              <form className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0 pb-8" onSubmit={saveProductDraft}>
                <div>
                  <label className="block text-xs font-bold uppercase text-stone-500 mb-1">Product Name</label>
                  <input
                    name="name"
                    required
                    value={productDraft.name}
                    onChange={(e) => setProductDraft({ ...productDraft, name: e.target.value })}
                    className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl"
                    placeholder="e.g. 5kVA Home Solar Kit"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-stone-500 mb-1">Description</label>
                  <textarea
                    rows={2}
                    value={productDraft.description}
                    onChange={(e) => setProductDraft({ ...productDraft, description: e.target.value })}
                    className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl"
                    placeholder="Short line shown on the catalog card"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase text-stone-500 mb-1">Price (₦)</label>
                    <input
                      name="price"
                      type="number"
                      step="any"
                      value={productDraft.price}
                      onChange={(e) => setProductDraft({ ...productDraft, price: e.target.value })}
                      className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-stone-500 mb-1">Catalog Category</label>
                    <select
                      name="product_type"
                      value={productDraft.product_type}
                      onChange={(e) => {
                        const category = e.target.value as ProductType;
                        const next = { ...productDraft, product_type: category };
                        if (category === "powerstation") {
                          next.kit_type = "powerstation";
                          next.shape = "single";
                        } else {
                          if (next.kit_type === "powerstation") next.kit_type = "solar";
                          if (category === "component" || category === "accessory") {
                            next.shape = "single";
                            if (category === "accessory") next.single_role = "accessory";
                          } else if (next.shape === "single") {
                            next.shape = "kit";
                          }
                        }
                        setProductDraft(next);
                      }}
                      className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl"
                    >
                      {PRODUCT_TYPE_FILTERS.filter((f) => f.id !== "all").map((f) => (
                        <option key={f.id} value={f.id}>{f.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase text-stone-500 mb-1">Kit Type</label>
                    <select
                      name="kit_type"
                      value={productDraft.kit_type}
                      onChange={(e) => {
                        const kitType = e.target.value as ProductDraft["kit_type"];
                        const next = { ...productDraft, kit_type: kitType };
                        if (kitType === "internet") {
                          next.product_type = "system";
                          next.shape = "kit";
                        } else if (kitType === "powerstation") {
                          next.product_type = "powerstation";
                          next.shape = "single";
                        } else {
                          if (next.product_type === "powerstation") next.product_type = "system";
                          if (next.shape === "single" && next.product_type === "system") next.shape = "kit";
                        }
                        setProductDraft(next);
                      }}
                      className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl"
                    >
                      <option value="solar">Solar</option>
                      <option value="internet">Internet</option>
                      <option value="powerstation">Powerstation</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-stone-500 mb-1">Tags</label>
                    <input
                      name="tags"
                      value={productDraft.tags}
                      onChange={(e) => setProductDraft({ ...productDraft, tags: e.target.value })}
                      className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl"
                      placeholder="residential,featured"
                    />
                  </div>
                </div>

                {productDraft.mode === "manual" && (
                  <div className="space-y-4 rounded-2xl border border-stone-200 bg-stone-50/60 p-4">
                    {productDraft.kit_type === "solar" && (
                      <>
                        <div>
                          <label className="block text-xs font-bold uppercase text-stone-500 mb-1">Product Shape</label>
                          <select
                            value={productDraft.shape}
                            onChange={(e) => {
                              const shape = e.target.value as ProductDraft["shape"];
                              setProductDraft({
                                ...productDraft,
                                shape,
                                // A single part is a component; a setup or kit is a system.
                                product_type: shape === "single" ? "component" : "system",
                              });
                            }}
                            className="w-full px-4 py-2 bg-white border border-stone-200 rounded-xl"
                          >
                            <option value="single">Single device</option>
                            <option value="setup">Setup (inverter + battery)</option>
                            <option value="kit">Kit (inverter + battery + panel)</option>
                          </select>
                        </div>

                        {productDraft.shape === "single" && (
                          <div>
                            <label className="block text-xs font-bold uppercase text-stone-500 mb-1">Component</label>
                            <select
                              value={productDraft.single_role}
                              onChange={(e) => setProductDraft({ ...productDraft, single_role: e.target.value as ProductDraft["single_role"] })}
                              className="w-full px-4 py-2 bg-white border border-stone-200 rounded-xl"
                            >
                              <option value="inverter">Inverter</option>
                              <option value="battery">Battery</option>
                              <option value="panel">Solar panel</option>
                              <option value="chargeController">Charge controller</option>
                              <option value="accessory">Accessory</option>
                            </select>
                          </div>
                        )}

                        {(() => {
                          const roles = productDraft.shape === "single"
                            ? [productDraft.single_role]
                            : PRODUCT_SHAPE_ROLES[productDraft.shape];
                          const set = (patch: Partial<ProductDraft>) =>
                            setProductDraft({ ...productDraft, ...patch });
                          return (
                            <>
                              {roles.includes("inverter") && (
                                <DraftGroup
                                  title="Inverter"
                                  fields={[
                                    { label: "Model", value: productDraft.inverter, span: true, required: true, onChange: (v) => set({ inverter: v }) },
                                    { label: "Max AC watts", type: "number", step: "any", value: productDraft.inverter_w, onChange: (v) => set({ inverter_w: v }) },
                                    { label: "System volts", type: "number", step: "any", value: productDraft.inverter_vdc, onChange: (v) => set({ inverter_vdc: v }) },
                                    { label: "Price (₦)", type: "number", step: "any", value: productDraft.inverter_price, span: true, onChange: (v) => set({ inverter_price: v }) },
                                  ]}
                                />
                              )}
                              {roles.includes("battery") && (
                                <DraftGroup
                                  title="Battery bank"
                                  fields={[
                                    { label: "Model", value: productDraft.battery, span: true, required: true, onChange: (v) => set({ battery: v }) },
                                    { label: "Bank volts", type: "number", step: "any", value: productDraft.battery_voltage, onChange: (v) => set({ battery_voltage: v }) },
                                    { label: "Amp hours", type: "number", step: "any", value: productDraft.battery_ah, onChange: (v) => set({ battery_ah: v }) },
                                    { label: "Price (₦)", type: "number", step: "any", value: productDraft.battery_price, span: true, onChange: (v) => set({ battery_price: v }) },
                                  ]}
                                />
                              )}
                              {roles.includes("panel") && (
                                <DraftGroup
                                  title="Solar panel"
                                  fields={[
                                    { label: "Model", value: productDraft.panel, span: true, required: true, onChange: (v) => set({ panel: v }) },
                                    { label: "Watts", type: "number", step: "any", value: productDraft.panel_w, onChange: (v) => set({ panel_w: v }) },
                                    { label: "Voc (V)", type: "number", step: "any", value: productDraft.panel_voc, onChange: (v) => set({ panel_voc: v }) },
                                    { label: "Isc (A)", type: "number", step: "any", value: productDraft.panel_isc, onChange: (v) => set({ panel_isc: v }) },
                                    { label: "Price (₦)", type: "number", step: "any", value: productDraft.panel_price, span: true, onChange: (v) => set({ panel_price: v }) },
                                  ]}
                                />
                              )}
                              {roles.includes("chargeController") && (
                                <DraftGroup
                                  title="Charge controller"
                                  fields={[
                                    { label: "Model", value: productDraft.cc, span: true, required: true, onChange: (v) => set({ cc: v }) },
                                    { label: "Max PV watts", type: "number", step: "any", value: productDraft.cc_pv, onChange: (v) => set({ cc_pv: v }) },
                                    { label: "Max Voc (V)", type: "number", step: "any", value: productDraft.cc_voc, onChange: (v) => set({ cc_voc: v }) },
                                    { label: "Max amps", type: "number", step: "any", value: productDraft.cc_amps, onChange: (v) => set({ cc_amps: v }) },
                                    { label: "Price (₦)", type: "number", step: "any", value: productDraft.cc_price, span: true, onChange: (v) => set({ cc_price: v }) },
                                  ]}
                                />
                              )}
                              {roles.includes("accessory") && (
                                <p className="text-xs text-stone-500">
                                  An accessory carries no parts. The name and price above are the whole product.
                                </p>
                              )}
                            </>
                          );
                        })()}
                      </>
                    )}

                    {productDraft.kit_type === "powerstation" && (
                      <DraftGroup
                        title="Powerstation"
                        fields={[
                          { label: "Capacity (Wh)", type: "number", step: "any", value: productDraft.ps_capacity, required: true, onChange: (v) => setProductDraft({ ...productDraft, ps_capacity: v }) },
                          { label: "AC output (W)", type: "number", step: "any", value: productDraft.ps_output, required: true, onChange: (v) => setProductDraft({ ...productDraft, ps_output: v }) },
                          { label: "PV input (W)", type: "number", step: "any", value: productDraft.ps_pv, onChange: (v) => setProductDraft({ ...productDraft, ps_pv: v }) },
                        ]}
                      />
                    )}

                    {productDraft.kit_type === "internet" && (
                      <div className="space-y-4">
                        <DraftGroup
                          title="Bundle"
                          fields={[
                            { label: "Router or load balancer", value: productDraft.net_router, span: true, placeholder: "e.g. TP-Link ER605 Load Balancer", onChange: (v) => setProductDraft({ ...productDraft, net_router: v }) },
                          ]}
                        />
                        <div className="space-y-2">
                          <p className="text-[10px] font-black uppercase tracking-wider text-stone-400">Devices in this kit</p>
                          <div className="max-h-48 overflow-y-auto space-y-1 rounded-xl border border-stone-200 bg-white p-2">
                            {masterDevices
                              .filter((md) => md.category === "internet" || md.tags.includes("internet"))
                              .map((md) => (
                                <label key={md.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-stone-50 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={productDraft.net_devices.includes(md.id)}
                                    onChange={(e) => {
                                      const next = e.target.checked
                                        ? [...productDraft.net_devices, md.id]
                                        : productDraft.net_devices.filter((id) => id !== md.id);
                                      setProductDraft({ ...productDraft, net_devices: next });
                                    }}
                                    className="w-4 h-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
                                  />
                                  <span className="text-sm text-stone-700">{md.name}</span>
                                  <span className="ml-auto text-xs text-stone-400">
                                    {md.specs?.device_class ? INTERNET_DEVICE_CLASS_LABELS[md.specs.device_class] : "device"}
                                  </span>
                                </label>
                              ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <button type="submit" className="w-full py-3 bg-stone-900 text-white rounded-xl font-bold mt-4 shrink-0">
                  {productDraft.mode === "promote" ? "Save as Product" : "Create Product"}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Hardware Modal */}
      <AnimatePresence>
        {showAddMasterDevice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-lg max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-stone-100 flex items-center justify-between shrink-0">
                <h2 className="font-bold text-xl">{editingMasterDevice ? "Edit" : "Add"} Master Device</h2>
                <button onClick={() => { setShowAddMasterDevice(false); setEditingMasterDevice(null); }} className="p-2 hover:bg-stone-100 rounded-full"><X className="w-5 h-5" /></button>
              </div>
              <form className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0 pb-8" onSubmit={saveMasterDevice}>
                <div>
                  <label className="block text-xs font-bold uppercase text-stone-500 mb-1">Device Name</label>
                  <input name="name" defaultValue={itemData(editingMasterDevice)?.name} required className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" placeholder="e.g. LED Bulb" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase text-stone-500 mb-1">Category</label>
                    <select
                      name="category"
                      value={masterDeviceCategory}
                      onChange={(e) => setMasterDeviceCategory(e.target.value as DeviceCategory)}
                      className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl"
                    >
                      <option value="electronics">Electronics</option>
                      <option value="motor">Motor</option>
                      <option value="compressor">Compressor</option>
                      <option value="heating">Heating</option>
                      <option value="internet">Internet</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-stone-500 mb-1">Default Watts</label>
                    <input name="default_watts" type="number" step="any" defaultValue={itemData(editingMasterDevice)?.default_watts} required className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-stone-500 mb-1">Starting Price (₦, optional)</label>
                  <input name="price" type="number" step="any" defaultValue={itemData(editingMasterDevice)?.price} className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" placeholder="Leave blank for Price on request" />
                </div>
                <details className="rounded-2xl border border-stone-200 bg-stone-50/60" open={masterDeviceCategory === "internet"}>
                  <summary className="cursor-pointer select-none px-4 py-3 text-xs font-bold uppercase text-stone-500">
                    Internet Device Specs (optional)
                  </summary>
                  <div className="p-4 pt-0 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <label className="block text-xs font-bold uppercase text-stone-500 mb-1">Device Class</label>
                        <select
                          name="device_class"
                          value={masterDeviceClass}
                          onChange={(e) => setMasterDeviceClass(e.target.value)}
                          className="w-full px-4 py-2 bg-white border border-stone-200 rounded-xl"
                        >
                          <option value="">Not set</option>
                          {INTERNET_DEVICE_CLASSES.map((deviceClass) => (
                            <option key={deviceClass.id} value={deviceClass.id}>{deviceClass.label}</option>
                          ))}
                        </select>
                      </div>
                      {(INTERNET_CLASS_FIELDS[masterDeviceClass] ?? INTERNET_SPEC_FIELDS.map((f) => f.key)).map((key) => {
                        const field = INTERNET_SPEC_FIELDS.find((f) => f.key === key)!;
                        return (
                          <div key={key}>
                            <label className="block text-xs font-bold uppercase text-stone-500 mb-1">{field.label}</label>
                            <input
                              name={key}
                              type={field.type ?? "text"}
                              step="any"
                              defaultValue={
                                itemData(editingMasterDevice)?.specs?.[key] ??
                                (key === "duty_cycle" ? 100 : undefined)
                              }
                              className="w-full px-4 py-2 bg-white border border-stone-200 rounded-xl"
                              placeholder={field.placeholder}
                            />
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-stone-400">
                      The fields follow the device class. Used by the Internet details modal for power, runtime and installation traits.
                    </p>
                  </div>
                </details>
                <div>
                  <label className="block text-xs font-bold uppercase text-stone-500 mb-1">Tags (comma separated)</label>
                  <input name="tags" defaultValue={itemData(editingMasterDevice)?.tags?.join(", ")} className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" placeholder="e.g. lighting, basic" />
                </div>
                <button type="submit" className="w-full py-3 bg-stone-900 text-white rounded-xl font-bold mt-4 shrink-0">
                  {editingMasterDevice ? "Update Device" : "Save Device"}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showAddHardware && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-stone-100 flex items-center justify-between shrink-0">
                <h2 className="font-bold text-xl capitalize">{editingHardware ? "Edit" : "Add New"} {showAddHardware}</h2>
                <button onClick={() => { setShowAddHardware(null); setEditingHardware(null); }} className="p-2 hover:bg-stone-100 rounded-full"><X className="w-5 h-5" /></button>
              </div>
              <form 
                className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0 pb-8"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  const commonData = {
                    name: fd.get("name") as string,
                    price: Number(fd.get("price")),
                    description: fd.get("description") as string,
                    tags: (fd.get("tags") as string)?.split(",").map(t => t.trim()).filter(t => t !== "") || [],
                  };

                  if (showAddHardware === "inverter") {
                    const data: Inverter = {
                      id: editingHardware?.id || crypto.randomUUID(),
                      ...commonData,
                      max_ac_w: Number(fd.get("max_ac_w")),
                      cc_max_pv_w: Number(fd.get("cc_max_pv_w")),
                      cc_max_voc: Number(fd.get("cc_max_voc")),
                      cc_max_amps: Number(fd.get("cc_max_amps")),
                      system_vdc: Number(fd.get("system_vdc")),
                      max_charge_amps: Number(fd.get("max_charge_amps")),
                      cc_type: fd.get("cc_type") as "pwm" | "mppt",
                      max_parallel_units: Number(fd.get("max_parallel_units") || 1),
                    };
                    if (editingHardware) {
                      setInverters(inverters.map(i => i.id === editingHardware.id ? data : i));
                    } else {
                      setInverters([...inverters, data]);
                    }
                  } else if (showAddHardware === "panel") {
                    const data: Panel = {
                      id: editingHardware?.id || crypto.randomUUID(),
                      ...commonData,
                      watts: Number(fd.get("watts")),
                      voc: Number(fd.get("voc")),
                      isc: Number(fd.get("isc")),
                    };
                    if (editingHardware) {
                      setPanels(panels.map(p => p.id === editingHardware.id ? data : p));
                    } else {
                      setPanels([...panels, data]);
                    }
                  } else if (showAddHardware === "battery") {
                    const data: Battery = {
                      id: editingHardware?.id || crypto.randomUUID(),
                      ...commonData,
                      voltage: Number(fd.get("voltage")),
                      capacity_ah: Number(fd.get("capacity_ah")),
                      type: fd.get("type") as any,
                      max_parallel_strings: Number(fd.get("max_parallel_strings") || 10),
                      min_c_rate: Number(fd.get("min_c_rate") || 0.1),
                    };
                    if (editingHardware) {
                      setBatteries(batteries.map(b => b.id === editingHardware.id ? data : b));
                    } else {
                      setBatteries([...batteries, data]);
                    }
                  } else if (showAddHardware === "powerstation") {
                    const data: Powerstation = {
                      id: editingHardware?.id || crypto.randomUUID(),
                      ...commonData,
                      capacity_wh: Number(fd.get("capacity_wh")),
                      max_output_w: Number(fd.get("max_output_w")),
                      max_pv_input_w: Number(fd.get("max_pv_input_w")),
                      battery_type: fd.get("battery_type") as any,
                      inverter_type: fd.get("inverter_type") as any,
                      max_charge_amps: Number(fd.get("max_charge_amps")),
                      system_vdc: Number(fd.get("system_vdc")),
                      cc_type: fd.get("cc_type") as any,
                      cc_max_voc: Number(fd.get("cc_max_voc")),
                      cc_max_amps: Number(fd.get("cc_max_amps")),
                      max_parallel_units: Number(fd.get("max_parallel_units")),
                      battery_voltage: Number(fd.get("battery_voltage")),
                      capacity_ah: Number(fd.get("capacity_ah")),
                      min_c_rate: Number(fd.get("min_c_rate")),
                    };
                    if (editingHardware) {
                      setPowerstations(powerstations.map(ps => ps.id === editingHardware.id ? data : ps));
                    } else {
                      setPowerstations([...powerstations, data]);
                    }

                    if (isDeveloper) {
                      const adminKey = sessionStorage.getItem("ss_admin_key");
                      if (adminKey) {
                        sdk.saveHardware({ id: data.id, type: "powerstation", data, tags: data.tags, description: data.description }, adminKey).catch(console.error);
                      }
                    }
                  } else if (showAddHardware === "chargeController") {
                    const data: ChargeController = {
                      id: editingHardware?.id || crypto.randomUUID(),
                      ...commonData,
                      type: fd.get("type") as "pwm" | "mppt",
                      max_pv_w: Number(fd.get("max_pv_w")),
                      max_voc: Number(fd.get("max_voc")),
                      max_amps: Number(fd.get("max_amps")),
                      battery_voltage: Number(fd.get("battery_voltage")),
                    };
                    if (editingHardware) {
                      setChargeControllers(chargeControllers.map(c => c.id === editingHardware.id ? data : c));
                    } else {
                      setChargeControllers([...chargeControllers, data]);
                    }
                    if (isDeveloper) {
                      const adminKey = sessionStorage.getItem("ss_admin_key");
                      if (adminKey) {
                        sdk.saveHardware({ id: data.id, type: "chargeController", data, tags: data.tags, description: data.description }, adminKey).catch(console.error);
                      }
                    }
                  } else if (showAddHardware === "wiring") {
                    const category = fd.get("category") as WiringCategory;
                    const categoryFields = WIRING_SPEC_FIELDS[category] || [];
                    const specs: Record<string, string | number> = {};
                    for (const field of categoryFields) {
                      const val = fd.get(field.key);
                      if (typeof val === "string" && val !== "") {
                        specs[field.key] = field.type === "number" ? Number(val) : val;
                      }
                    }
                    // Preserve existing specs on edit
                    const mergedSpecs = editingHardware?.item?.specs
                      ? { ...editingHardware.item.specs, ...specs }
                      : specs;
                    // Build data object with category-specific fields
                    const qtyValue = fd.get("qty");
                    const lengthValue = fd.get("length_override");
                    const data: WiringItem = {
                      id: editingHardware?.id || crypto.randomUUID(),
                      name: commonData.name,
                      category,
                      type: fd.get("wiring_type") as WiringItem["type"],
                      description: commonData.description,
                      price: commonData.price,
                      specs: mergedSpecs,
                      ...(qtyValue && { qty: Number(qtyValue) }),
                      ...(lengthValue && { length_override: Number(lengthValue) }),
                    };
                    setWiring(prev => prev.some(w => w.id === data.id)
                      ? prev.map(w => w.id === data.id ? data : w)
                      : [...prev, data]);
                  }

                  // Global sync for other types if developer
                  if (isDeveloper && showAddHardware !== "powerstation" && showAddHardware !== "wiring") {
                    const adminKey = sessionStorage.getItem("ss_admin_key");
                    if (adminKey) {
                      const id = editingHardware?.id || crypto.randomUUID();
                      let data: any;
                      if (showAddHardware === "inverter") {
                        data = { id, ...commonData, max_ac_w: Number(fd.get("max_ac_w")), cc_max_pv_w: Number(fd.get("cc_max_pv_w")), cc_max_voc: Number(fd.get("cc_max_voc")), cc_max_amps: Number(fd.get("cc_max_amps")), system_vdc: Number(fd.get("system_vdc")), max_charge_amps: Number(fd.get("max_charge_amps")), cc_type: fd.get("cc_type"), max_parallel_units: Number(fd.get("max_parallel_units") || 1) };
                      } else if (showAddHardware === "panel") {
                        data = { id, ...commonData, watts: Number(fd.get("watts")), voc: Number(fd.get("voc")), isc: Number(fd.get("isc")) };
                      } else if (showAddHardware === "battery") {
                        data = { id, ...commonData, voltage: Number(fd.get("voltage")), capacity_ah: Number(fd.get("capacity_ah")), type: fd.get("type"), max_parallel_strings: Number(fd.get("max_parallel_strings") || 10), min_c_rate: Number(fd.get("min_c_rate") || 0.1) };
                      }
                      sdk.saveHardware({ id, type: showAddHardware, data, tags: data.tags, description: data.description }, adminKey).catch(console.error);
                    }
                  }
                  setShowAddHardware(null);
                  setEditingHardware(null);
                }}
              >
                {(() => {
                  const currentItem = editingHardware
                    ? itemData(
                      editingHardware.item ?? (
                        editingHardware.type === "inverter" ? inverters.find(i => i.id === editingHardware.id)
                          : editingHardware.type === "panel" ? panels.find(p => p.id === editingHardware.id)
                          : editingHardware.type === "battery" ? batteries.find(b => b.id === editingHardware.id)
                          : editingHardware.type === "powerstation" ? powerstations.find(ps => ps.id === editingHardware.id)
                          : editingHardware.type === "wiring" ? wiring.find(w => w.id === editingHardware.id)
                          : null
                      ),
                      editingHardware.type
                    )
                    : null;
                  
                  return (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold uppercase text-stone-500 mb-1">Model Name</label>
                        <input name="name" defaultValue={currentItem?.name} required className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold uppercase text-stone-500 mb-1">Description (for catalog)</label>
                        <input name="description" defaultValue={(currentItem as any)?.description} placeholder="Brief marketing description..." className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold uppercase text-stone-500 mb-1">Tags (comma separated)</label>
                        <input name="tags" defaultValue={(currentItem as any)?.tags?.join(", ")} placeholder="e.g. residential, featured, budget" className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        {showAddHardware === "inverter" && (
                          <>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">Max AC (W)</label><input name="max_ac_w" type="number" step="any" defaultValue={(currentItem as Inverter)?.max_ac_w} required className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" /></div>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">DC Volts (V)</label><input name="system_vdc" type="number" step="any" defaultValue={(currentItem as Inverter)?.system_vdc} required className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" /></div>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">PV Max (W)</label><input name="cc_max_pv_w" type="number" step="any" defaultValue={(currentItem as Inverter)?.cc_max_pv_w} required className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" /></div>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">Max Voc (V)</label><input name="cc_max_voc" type="number" step="any" defaultValue={(currentItem as Inverter)?.cc_max_voc} required className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" /></div>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">Max Amps (A)</label><input name="cc_max_amps" type="number" step="any" defaultValue={(currentItem as Inverter)?.cc_max_amps} required className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" /></div>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">Charge Amps (A)</label><input name="max_charge_amps" type="number" step="any" defaultValue={(currentItem as Inverter)?.max_charge_amps} required className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" /></div>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">Max Parallel Units</label><input name="max_parallel_units" type="number" step="any" defaultValue={(currentItem as Inverter)?.max_parallel_units || 1} required className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" /></div>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">CC Type</label><select name="cc_type" defaultValue={(currentItem as Inverter)?.cc_type || "pwm"} required className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl"><option value="pwm">PWM</option><option value="mppt">MPPT</option></select></div>
                          </>
                        )}
                        {showAddHardware === "panel" && (
                          <>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">Watts (W)</label><input name="watts" type="number" step="any" defaultValue={(currentItem as Panel)?.watts} required className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" /></div>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">Voc (V)</label><input name="voc" type="number" step="any" defaultValue={(currentItem as Panel)?.voc} required className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" /></div>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">Isc (A)</label><input name="isc" type="number" step="any" defaultValue={(currentItem as Panel)?.isc} required className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" /></div>
                          </>
                        )}
                        {showAddHardware === "battery" && (
                          <>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">Voltage (V)</label><input name="voltage" type="number" step="any" defaultValue={(currentItem as Battery)?.voltage} required className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" /></div>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">Capacity (Ah)</label><input name="capacity_ah" type="number" step="any" defaultValue={(currentItem as Battery)?.capacity_ah} required className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" /></div>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">Type</label><select name="type" defaultValue={(currentItem as Battery)?.type} className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl"><option value="lithium">Lithium</option><option value="lead-acid">Lead-Acid</option></select></div>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">Max Parallel</label><input name="max_parallel_strings" type="number" step="any" defaultValue={(currentItem as Battery)?.max_parallel_strings} className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" /></div>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">Min C-Rate</label><input name="min_c_rate" type="number" step="any" defaultValue={(currentItem as Battery)?.min_c_rate} className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" /></div>
                          </>
                        )}
                        {showAddHardware === "powerstation" && (
                          <>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">Capacity (Wh)</label><input name="capacity_wh" type="number" step="any" defaultValue={(currentItem as Powerstation)?.capacity_wh} required className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" /></div>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">Max Output (W)</label><input name="max_output_w" type="number" step="any" defaultValue={(currentItem as Powerstation)?.max_output_w} required className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" /></div>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">Max PV Input (W)</label><input name="max_pv_input_w" type="number" step="any" defaultValue={(currentItem as Powerstation)?.max_pv_input_w} required className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" /></div>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">Battery Type</label><select name="battery_type" defaultValue={(currentItem as Powerstation)?.battery_type || "lithium"} className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl"><option value="lithium">Lithium</option><option value="lead-acid">Lead-Acid</option></select></div>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">Inverter Type</label><select name="inverter_type" defaultValue={(currentItem as Powerstation)?.inverter_type || "pure-sine"} className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl"><option value="pure-sine">Pure Sine</option><option value="modified-sine">Modified Sine</option></select></div>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">Charge Amps (A)</label><input name="max_charge_amps" type="number" step="any" defaultValue={(currentItem as Powerstation)?.max_charge_amps} className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" /></div>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">System VDC (V)</label><input name="system_vdc" type="number" step="any" defaultValue={(currentItem as Powerstation)?.system_vdc || 12} className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" /></div>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">CC Type</label><select name="cc_type" defaultValue={(currentItem as Powerstation)?.cc_type || "mppt"} className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl"><option value="pwm">PWM</option><option value="mppt">MPPT</option></select></div>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">Max Voc (V)</label><input name="cc_max_voc" type="number" step="any" defaultValue={(currentItem as Powerstation)?.cc_max_voc} className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" /></div>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">Max CC Amps (A)</label><input name="cc_max_amps" type="number" step="any" defaultValue={(currentItem as Powerstation)?.cc_max_amps} className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" /></div>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">Max Parallel Units</label><input name="max_parallel_units" type="number" step="any" defaultValue={(currentItem as Powerstation)?.max_parallel_units || 1} className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" /></div>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">Battery Voltage (V)</label><input name="battery_voltage" type="number" step="any" defaultValue={(currentItem as Powerstation)?.battery_voltage} className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" /></div>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">Capacity (Ah)</label><input name="capacity_ah" type="number" step="any" defaultValue={(currentItem as Powerstation)?.capacity_ah} className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" /></div>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">Min C-Rate</label><input name="min_c_rate" type="number" step="any" defaultValue={(currentItem as Powerstation)?.min_c_rate || 0.1} className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" /></div>
                          </>
                        )}
                        {showAddHardware === "chargeController" && (
                          <>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">Type</label><select name="type" defaultValue={(currentItem as ChargeController)?.type || "mppt"} className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl"><option value="pwm">PWM</option><option value="mppt">MPPT</option></select></div>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">Battery Voltage (V)</label><input name="battery_voltage" type="number" step="any" defaultValue={(currentItem as ChargeController)?.battery_voltage} required className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" /></div>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">Max PV (W)</label><input name="max_pv_w" type="number" step="any" defaultValue={(currentItem as ChargeController)?.max_pv_w} required className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" /></div>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">Max Voc (V)</label><input name="max_voc" type="number" step="any" defaultValue={(currentItem as ChargeController)?.max_voc} required className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" /></div>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">Max Amps (A)</label><input name="max_amps" type="number" step="any" defaultValue={(currentItem as ChargeController)?.max_amps} required className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" /></div>
                          </>
                        )}
                        {showAddHardware === "wiring" && (
                          <>
                            <div className="col-span-2">
                              <label className="block text-xs font-bold uppercase text-stone-500 mb-1">Category</label>
                              <select name="category" defaultValue={currentItem?.category || wiringCategoryForAdd} className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl">
                                {(Object.keys(WIRING_CATEGORY_LABELS) as WiringCategory[]).map((category) => (
                                  <option key={category} value={category}>{WIRING_CATEGORY_LABELS[category].label}</option>
                                ))}
                              </select>
                            </div>
                            <div className="col-span-2">
                              <label className="block text-xs font-bold uppercase text-stone-500 mb-1">Item Type</label>
                              <select name="wiring_type" defaultValue={currentItem?.type || (WIRING_OPTIONAL_BY_DEFAULT.includes(currentItem?.category || wiringCategoryForAdd) ? "nice-to-have" : "mandatory")} className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl">
                                <option value="mandatory">Required</option>
                                <option value="nice-to-have">Optional</option>
                              </select>
                            </div>
                          </>
                        )}
                        {showAddHardware === "wiring" && (() => {
                          const selectedCategory = (currentItem?.category || "cables") as WiringCategory;
                          const fields = WIRING_SPEC_FIELDS[selectedCategory] || [];
                          return fields.map((field) => {
                            if (field.type === "number") {
                              return (
                                <div key={field.key} className="col-span-2">
                                  <label className="block text-xs font-bold uppercase text-stone-500 mb-1">{field.label}</label>
                                  <input 
                                    name={field.key} 
                                    type="number" 
                                    step="any" 
                                    defaultValue={(currentItem as any)?.specs?.[field.key] || ""} 
                                    className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" 
                                  />
                                </div>
                              );
                            } else if (field.type === "select" && field.options) {
                              return (
                                <div key={field.key} className="col-span-2 sm:col-span-1">
                                  <label className="block text-xs font-bold uppercase text-stone-500 mb-1">{field.label}</label>
                                  <select 
                                    name={field.key} 
                                    defaultValue={(currentItem as any)?.specs?.[field.key] || field.options[0]} 
                                    className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl"
                                  >
                                    {field.options.map(opt => (
                                      <option key={opt} value={opt}>{opt}</option>
                                    ))}
                                  </select>
                                </div>
                              );
                            } else {
                              return (
                                <div key={field.key} className="col-span-2 sm:col-span-1">
                                  <label className="block text-xs font-bold uppercase text-stone-500 mb-1">{field.label}</label>
                                  <input 
                                    name={field.key} 
                                    type="text" 
                                    defaultValue={(currentItem as any)?.specs?.[field.key] || ""} 
                                    className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" 
                                  />
                                </div>
                              );
                            }
                          });
                        })()}
                        <div className="col-span-2 sm:col-span-1"><label className="block text-xs font-bold uppercase text-stone-500 mb-1">Retail Price (₦)</label><input name="price" type="number" step="any" defaultValue={currentItem?.price} required className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" /></div>
                        {((currentItem?.category || "cables") as WiringCategory) === "cables" && (
                          <>
                            <div className="col-span-2 sm:col-span-1">
                              <label className="block text-xs font-bold uppercase text-stone-500 mb-1">Quantity</label>
                              <input 
                                name="qty" 
                                type="number" 
                                min="1"
                                defaultValue={(currentItem as any)?.qty || 1} 
                                className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" 
                              />
                            </div>
                            <div className="col-span-2 sm:col-span-1">
                              <label className="block text-xs font-bold uppercase text-stone-500 mb-1">Length Override (m)</label>
                              <input 
                                name="length_override" 
                                type="number" 
                                step="any"
                                defaultValue={(currentItem as any)?.length_override || ""} 
                                className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" 
                              />
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })()}
                <button type="submit" className="w-full py-3 bg-stone-900 text-white rounded-xl font-bold mt-4 shrink-0">
                  {editingHardware ? "Update Component" : "Save Component"}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {selectedSystemLog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-2xl max-h-[80vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-stone-100 flex items-center justify-between bg-stone-50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 rounded-lg">
                    <Calculator className="w-5 h-5 text-emerald-600" />
                  </div>
                  <h2 className="font-bold text-xl text-stone-900">Calculation Log</h2>
                </div>
                <button 
                  onClick={() => setSelectedSystemLog(null)}
                  className="p-2 hover:bg-stone-200 rounded-full transition-colors"
                >
                  <X className="w-6 h-6 text-stone-500" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-3">
                {selectedSystemLog.map((line, i) => (
                  <div 
                    key={getLogKey("system-log", line, i)} 
                    className={`p-3 rounded-xl text-sm font-mono flex gap-3 ${
                      line.includes('✅') ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' :
                      line.includes('❌') ? 'bg-red-50 text-red-800 border border-red-100' :
                      line.includes('Note:') ? 'bg-amber-50 text-amber-800 border border-amber-100' :
                      'bg-stone-50 text-stone-600 border border-stone-100'
                    }`}
                  >
                    <span className="text-stone-300 select-none">{String(i + 1).padStart(2, '0')}</span>
                    <span>{line}</span>
                  </div>
                ))}
              </div>

              <div className="p-6 border-t border-stone-100 bg-stone-50 text-center">
                <p className="text-xs text-stone-400">
                  This log shows the step-by-step validation process for this specific hardware combination.
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
