import express from "express";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import cookieSession from "cookie-session";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Database Setup ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const useSupabase = !!(SUPABASE_URL && SUPABASE_KEY);

let db: any;
let supabase: any;

if (useSupabase) {
  console.log("Using Supabase as backend database.");
  supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!);
} else {
  console.log("Using local SQLite as backend database. Note: Data will be ephemeral on Render.");
  db = new Database("solar_sizer.db");
  db.pragma("foreign_keys = ON");

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      name TEXT,
      picture TEXT,
      provider TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      name TEXT,
      region TEXT,
      battery_preference TEXT,
      devices TEXT, -- JSON string
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS results (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      profile_name TEXT,
      data TEXT, -- JSON string containing the full SavedResult object
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS hardware (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      type TEXT, -- 'inverter', 'panel', 'battery'
      data TEXT, -- JSON string
      tags TEXT, -- JSON array of strings
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS devices_master (
      id TEXT PRIMARY KEY,
      name TEXT,
      category TEXT,
      default_watts REAL,
      tags TEXT, -- JSON array of strings
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT,
      description TEXT,
      type TEXT, -- 'standalone' or 'combination'
      combination_data TEXT, -- JSON string if type is combination
      tags TEXT, -- JSON array of strings
      price REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

    // Seed master devices
    const seedDevices = [
      { id: 'd1', name: 'LED Bulb', category: 'electronics', watts: 10, tags: ['basic', 'lighting'] },
      { id: 'd2', name: 'Standing Fan', category: 'motor', watts: 50, tags: ['cooling', 'essential'] },
      { id: 'd3', name: 'Ceiling Fan', category: 'motor', watts: 75, tags: ['cooling', 'essential'] },
      { id: 'd4', name: 'Laptop', category: 'electronics', watts: 65, tags: ['study', 'office'] },
      { id: 'd5', name: 'Wi-Fi Router', category: 'electronics', watts: 15, tags: ['internet', 'essential'] },
      { id: 'd6', name: 'Phone Charger', category: 'electronics', watts: 10, tags: ['basic', 'essential'] },
      { id: 'd7', name: 'Studio Monitor (Speaker)', category: 'electronics', watts: 40, tags: ['studio', 'audio'] },
      { id: 'd8', name: 'Desktop PC', category: 'electronics', watts: 200, tags: ['office', 'gaming'] },
      { id: 'd9', name: 'Refrigerator (Small)', category: 'compressor', watts: 120, tags: ['kitchen', 'essential'] },
      { id: 'd10', name: 'Air Conditioner (1HP)', category: 'compressor', watts: 850, tags: ['luxury', 'office'] },
      { id: 'd11', name: 'Television (43")', category: 'electronics', watts: 80, tags: ['entertainment'] },
      // Internet Devices (Tab 3)
      { id: 'd12', name: 'Huawei B818-263', category: 'internet', watts: 20, tags: ['internet', 'tier-a'] },
      { id: 'd13', name: 'ZTE MC888', category: 'internet', watts: 25, tags: ['internet', 'tier-a'] },
      { id: 'd14', name: 'ZTE MC888 PRO', category: 'internet', watts: 30, tags: ['internet', 'tier-a'] },
      { id: 'd15', name: 'Huawei CPE PRO 2', category: 'internet', watts: 22, tags: ['internet', 'tier-a'] },
      { id: 'd16', name: 'Cudy LT500', category: 'internet', watts: 12, tags: ['internet', 'tier-b'] },
      { id: 'd17', name: 'Cudy LT700', category: 'internet', watts: 15, tags: ['internet', 'tier-b'] },
      { id: 'd18', name: 'TP-Link ER605', category: 'internet', watts: 15, tags: ['internet', 'tier-b'] },
      { id: 'd19', name: 'TP-Link ER7206', category: 'internet', watts: 20, tags: ['internet', 'tier-b'] },
      { id: 'd20', name: 'Starlink Gen 2', category: 'internet', watts: 65, tags: ['internet', 'flagship'] },
      { id: 'd21', name: 'Starlink Gen 3', category: 'internet', watts: 85, tags: ['internet', 'flagship'] },
      { id: 'd22', name: 'GL.iNet Spitz AX', category: 'internet', watts: 18, tags: ['internet', 'router'] },
      { id: 'd23', name: 'GL.iNet Slate AX', category: 'internet', watts: 15, tags: ['internet', 'router'] },
      { id: 'd24', name: 'Cudy WR2100', category: 'internet', watts: 12, tags: ['internet', 'router'] },
      { id: 'd25', name: 'Pepwave MAX BR1 Mini', category: 'internet', watts: 20, tags: ['internet', 'enterprise'] },
    ];
    const insert = db.prepare("INSERT OR REPLACE INTO devices_master (id, name, category, default_watts, tags) VALUES (?, ?, ?, ?, ?)");
    seedDevices.forEach(d => insert.run(d.id, d.name, d.category, d.watts, JSON.stringify(d.tags)));

    // Seed internet products and standalone hardware
    const seedProducts = [
      {
        id: 'p1',
        name: 'SolarOne A300 Plug-and-Play Power Box',
        description: 'True plug-and-play "Setup in a Box" — unbox, plug in, and power up with zero installation labor fees.',
        type: 'combination',
        combination_data: {
          inverter: '300W Pure Sine Wave',
          inverter_w: 300,
          inverter_price: 120000,
          battery_config: '390Wh Deep Cycle',
          battery_wh: 390,
          battery_price: 45000,
          panel_config: '1x 250W Mono',
          panel_w: 250,
          panel_price: 20000,
          total_price: 185000,
          status: 'Optimal',
          advice: 'Perfect for exams and studio sessions.'
        },
        tags: ['flagship', 'kit', 'powerstation', 'solar'],
        price: 185000
      },
      {
        id: 'p2',
        name: 'SolarOne A500 Pro Power Box',
        description: 'Whole-house power without the installation: custom generator-style outlet plugs directly into your home wiring.',
        type: 'combination',
        combination_data: {
          inverter: '500W Pure Sine Wave',
          inverter_w: 500,
          inverter_price: 180000,
          battery_config: '600Wh LiFePO4',
          battery_wh: 600,
          battery_price: 80000,
          panel_config: '1x 350W Mono',
          panel_w: 350,
          panel_price: 40000,
          total_price: 300000,
          status: 'Optimal',
          advice: 'Premium power for sensitive electronics.'
        },
        tags: ['flagship', 'kit', 'powerstation', 'solar'],
        price: 300000
      },
      {
        id: 'p3',
        name: 'Itel Energy iESS 320T + 200W Panel Kit',
        description: 'True plug-and-play setup: 130W pure sine wave inverter and 320Wh LiFePO4 battery in a compact, portable case.',
        type: 'combination',
        combination_data: {
          inverter: '130W Pure Sine Wave',
          inverter_w: 130,
          inverter_price: 100000,
          battery_config: '320Wh LiFePO4',
          battery_wh: 320,
          battery_price: 40000,
          panel_config: '1x 200W Mono',
          panel_w: 200,
          panel_price: 45000,
          total_price: 185000,
          status: 'Optimal',
          advice: 'Built for students. Direct laptop charging via Type-C.'
        },
        tags: ['solar', 'kit', 'powerstation'],
        price: 185000
      },
      {
        id: 'p4',
        name: 'Itel 1000W Powerstation + 450W Panel',
        description: 'Massive 1000Wh LiFePO4 battery paired with a 500W pure sine wave inverter for clean, stable studio power.',
        type: 'combination',
        combination_data: {
          inverter: '500W Pure Sine Wave',
          inverter_w: 500,
          inverter_price: 200000,
          battery_config: '1000Wh LiFePO4',
          battery_wh: 1000,
          battery_price: 140000,
          panel_config: '1x 450W Mono',
          panel_w: 450,
          panel_price: 85000,
          total_price: 425000,
          status: 'Optimal',
          advice: 'Complete one-stop solution for studio power.'
        },
        tags: ['solar', 'kit', 'powerstation'],
        price: 425000
      },
      {
        id: 'p5',
        name: '500W Powerstation + 350W Panel Combo',
        description: 'Accessible off-grid power featuring a 600Wh LiFePO4 battery and 500W modified sine wave AC output.',
        type: 'combination',
        combination_data: {
          inverter: '500W Modified Sine',
          inverter_w: 500,
          inverter_price: 150000,
          battery_config: '600Wh LiFePO4',
          battery_wh: 600,
          battery_price: 115000,
          panel_config: '1x 350W Mono',
          panel_w: 350,
          panel_price: 45000,
          total_price: 310000,
          status: 'Optimal',
          advice: 'Accessible off-grid power for daily essentials.'
        },
        tags: ['solar', 'kit', 'powerstation'],
        price: 310000
      },
      {
        id: 'p6',
        name: 'Starlink Gen 2 + SolarOne A300 Internet Kit',
        description: 'High-speed internet anywhere. Includes Starlink Gen 2 and SolarOne A300 powerstation.',
        type: 'combination',
        combination_data: {
          inverter: '300W Pure Sine Wave',
          inverter_w: 300,
          inverter_price: 120000,
          battery_config: '390Wh LiFePO4',
          battery_wh: 390,
          battery_price: 45000,
          panel_config: '1x 250W Mono',
          panel_w: 250,
          panel_price: 20000,
          total_price: 650000,
          status: 'Optimal',
          advice: 'The ultimate remote work setup.'
        },
        tags: ['internet', 'kit', 'flagship'],
        price: 650000
      },
      {
        id: 'p7',
        name: '9Solar 550W Mono Panel',
        description: 'High-efficiency 550W monocrystalline solar panel.',
        type: 'standalone',
        tags: ['panel', 'solar'],
        price: 103000
      },
      {
        id: 'p8',
        name: 'Taico 12V 200Ah LiFePO4 Battery',
        description: 'Deep cycle lithium iron phosphate battery for long-lasting storage.',
        type: 'standalone',
        tags: ['battery', 'solar'],
        price: 375000
      },
      {
        id: 'p9',
        name: 'Starlink Gen 3 Standard Kit',
        description: 'High-speed, low-latency satellite internet. Standard Gen 3 hardware kit.',
        type: 'standalone',
        tags: ['internet', 'flagship'],
        price: 450000
      },
      {
        id: 'p10',
        name: 'Starlink Gen 3 + SolarOne A500 Pro Internet Kit',
        description: 'Ultimate power and speed. Includes Starlink Gen 3 and SolarOne A500 Pro powerstation.',
        type: 'combination',
        combination_data: {
          inverter: '500W Pure Sine Wave',
          inverter_w: 500,
          inverter_price: 180000,
          battery_config: '600Wh LiFePO4',
          battery_wh: 600,
          battery_price: 80000,
          panel_config: '1x 350W Mono',
          panel_w: 350,
          panel_price: 40000,
          total_price: 750000,
          status: 'Optimal',
          advice: 'The professional remote work setup for Gen 3 Starlink.'
        },
        tags: ['internet', 'kit', 'flagship'],
        price: 750000
      },
      {
        id: 'p11',
        name: 'Huawei B818-263 4G+ Router',
        description: 'High-performance 4G+ router for fast mobile internet.',
        type: 'standalone',
        tags: ['internet', 'tier-a'],
        price: 100000
      },
      {
        id: 'p12',
        name: 'ZTE MC888 5G Router',
        description: 'Next-generation 5G router for ultra-fast internet.',
        type: 'standalone',
        tags: ['internet', 'tier-a'],
        price: 110000
      },
      {
        id: 'p13',
        name: 'ZTE MC888 PRO 5G',
        description: 'Professional grade 5G router with enhanced coverage.',
        type: 'standalone',
        tags: ['internet', 'tier-a'],
        price: 135000
      },
      {
        id: 'p14',
        name: 'Huawei CPE PRO 2 5G',
        description: 'Reliable 5G connectivity for home and office.',
        type: 'standalone',
        tags: ['internet', 'tier-a'],
        price: 85000
      },
      {
        id: 'p15',
        name: 'Cudy LT500 4G LTE Router',
        description: 'Affordable 4G LTE router for everyday use.',
        type: 'standalone',
        tags: ['internet', 'tier-b'],
        price: 55000
      },
      {
        id: 'p16',
        name: 'Taico 12V 100Ah LiFePO4 Battery',
        description: 'Reliable lithium iron phosphate battery.',
        type: 'standalone',
        tags: ['battery', 'solar'],
        price: 210000
      },
      {
        id: 'p17',
        name: '9Solar 190W Mono Panel',
        description: 'Compact and efficient monocrystalline solar panel.',
        type: 'standalone',
        tags: ['panel', 'solar'],
        price: 45000
      }
    ];
    const insertProduct = db.prepare("INSERT OR REPLACE INTO products (id, name, description, type, combination_data, tags, price) VALUES (?, ?, ?, ?, ?, ?, ?)");
    seedProducts.forEach(p => insertProduct.run(p.id, p.name, p.description, p.type, JSON.stringify(p.combination_data), JSON.stringify(p.tags), p.price));

    // Seed Hardware (Panels, Batteries, Cables)
    const seedHardware = [
      {
        id: 'h1',
        type: 'panel',
        tags: ['flagship', 'solar', 'panel'],
        description: 'Exceptional low irradiance performance. PID resistant.',
        data: { name: 'Kulpower 100W Mono Crystalline Panel', watts: 100, voc: 22.5, isc: 5.8, price: 32000 }
      },
      {
        id: 'h2',
        type: 'panel',
        tags: ['flagship', 'solar', 'panel'],
        description: 'Radically reduced string mismatch losses. Built-in bypass diode.',
        data: { name: '9Solar 190W Mono Crystalline Panel (39 Cells)', watts: 190, voc: 24.2, isc: 10.1, price: 45000 }
      },
      {
        id: 'h3',
        type: 'panel',
        tags: ['flagship', 'solar', 'panel'],
        description: 'Industry\'s lowest thermal co-efficient. High-yield upgrade.',
        data: { name: 'Kulpower 340W Mono Crystalline Panel', watts: 340, voc: 41.5, isc: 10.5, price: 70000 }
      },
      {
        id: 'h4',
        type: 'battery',
        tags: ['flagship', 'solar', 'battery'],
        description: 'Massive 640Wh usable capacity. Grade A cells.',
        data: { name: 'PowMr 50A LiFePO4 Expansion Battery', voltage: 12.8, capacity_ah: 50, type: 'lithium', min_c_rate: 0.1, price: 110000 }
      },
      {
        id: 'h5',
        type: 'accessory',
        tags: ['flagship', 'solar', 'accessory'],
        description: 'Premium wiring for flexible panel connectivity. Weatherproof.',
        data: { name: 'Heavy-Duty Solar Extension Cables', price: 4500 }
      },
      {
        id: 'h6',
        type: 'powerstation',
        tags: ['flagship', 'portable', 'pure-sine'],
        description: 'True plug-and-play Setup in a Box.',
        data: { name: 'SolarOne A300', capacity_wh: 390, max_output_w: 300, max_pv_input_w: 250, price: 185000, battery_type: 'lithium', inverter_type: 'pure-sine' }
      },
      {
        id: 'h7',
        type: 'powerstation',
        tags: ['flagship', 'pro', 'pure-sine'],
        description: 'Whole-house power without the installation.',
        data: { 
          name: 'SolarOne A500 Pro', 
          capacity_wh: 600, 
          max_output_w: 500, 
          max_pv_input_w: 350, 
          price: 300000, 
          battery_type: 'lithium', 
          inverter_type: 'pure-sine', 
          system_vdc: 12, 
          max_charge_amps: 40, 
          cc_type: 'mppt',
          cc_max_voc: 50,
          cc_max_amps: 30,
          max_parallel_units: 1,
          battery_voltage: 12.8,
          capacity_ah: 50,
          min_c_rate: 0.1
        }
      },
      {
        id: 'h8',
        type: 'powerstation',
        tags: ['budget', 'student', 'pure-sine'],
        description: 'Compact student power box.',
        data: { 
          name: 'Itel Energy iESS 320T', 
          capacity_wh: 320, 
          max_output_w: 130, 
          max_pv_input_w: 200, 
          price: 140000, 
          battery_type: 'lithium', 
          inverter_type: 'pure-sine', 
          system_vdc: 12, 
          max_charge_amps: 10, 
          cc_type: 'pwm',
          cc_max_voc: 25,
          cc_max_amps: 10,
          max_parallel_units: 1,
          battery_voltage: 12.8,
          capacity_ah: 25,
          min_c_rate: 0.1
        }
      },
      {
        id: 'h9',
        type: 'powerstation',
        tags: ['mid-range', 'modified-sine'],
        description: 'Affordable backup power.',
        data: { 
          name: '500W Generic Powerstation', 
          capacity_wh: 600, 
          max_output_w: 500, 
          max_pv_input_w: 350, 
          price: 265000, 
          battery_type: 'lithium', 
          inverter_type: 'modified-sine', 
          system_vdc: 12, 
          max_charge_amps: 30, 
          cc_type: 'pwm',
          cc_max_voc: 30,
          cc_max_amps: 20,
          max_parallel_units: 1,
          battery_voltage: 12.8,
          capacity_ah: 50,
          min_c_rate: 0.1
        }
      },
      {
        id: 'h10',
        type: 'powerstation',
        tags: ['pro', 'high-capacity'],
        description: 'High capacity studio power.',
        data: { 
          name: 'Itel 1000W Powerstation', 
          capacity_wh: 1000, 
          max_output_w: 500, 
          max_pv_input_w: 450, 
          price: 340000, 
          battery_type: 'lithium', 
          inverter_type: 'pure-sine', 
          system_vdc: 12, 
          max_charge_amps: 50, 
          cc_type: 'mppt',
          cc_max_voc: 60,
          cc_max_amps: 40,
          max_parallel_units: 1,
          battery_voltage: 12.8,
          capacity_ah: 80,
          min_c_rate: 0.1
        }
      },
      {
        id: 'h11',
        type: 'battery',
        tags: ['solar', 'battery', 'lithium'],
        description: 'Smart Bluetooth Monitoring. Integrated BMS.',
        data: { name: 'Taico 12V 100Ah LiFePO4', voltage: 12.8, capacity_ah: 100, type: 'lithium', min_c_rate: 0.1, price: 210000 }
      },
      {
        id: 'h12',
        type: 'battery',
        tags: ['solar', 'battery', 'lithium'],
        description: 'Modular design. DIY-friendly expansion.',
        data: { name: 'Cworth 12V 100Ah LiFePO4', voltage: 12.8, capacity_ah: 100, type: 'lithium', min_c_rate: 0.1, price: 230000 }
      },
      {
        id: 'h13',
        type: 'inverter',
        tags: ['pro', 'solar', 'pure-sine'],
        description: 'High-power 5kVA pure sine wave inverter for whole-home backup.',
        data: { 
          name: 'Must 5kVA 48V Hybrid Inverter', 
          max_ac_w: 5000, 
          system_vdc: 48, 
          cc_max_pv_w: 4000, 
          cc_max_voc: 145, 
          cc_max_amps: 80, 
          max_charge_amps: 60, 
          cc_type: 'mppt', 
          max_parallel_units: 3, 
          price: 450000 
        }
      },
      {
        id: 'h14',
        type: 'panel',
        tags: ['pro', 'solar', 'panel'],
        description: 'High-efficiency 550W monocrystalline solar panel.',
        data: { name: 'Jinko 550W Mono Crystalline Panel', watts: 550, voc: 49.8, isc: 13.5, price: 105000 }
      },
      {
        id: 'h15',
        type: 'battery',
        tags: ['pro', 'solar', 'gel'],
        description: 'Deep cycle 12V 200Ah Gel battery for reliable energy storage.',
        data: { name: 'Felicity 12V 200Ah Gel Battery', voltage: 12, capacity_ah: 200, type: 'lead-acid', min_c_rate: 0.1, price: 185000 }
      }
    ];
    const insertHardware = db.prepare("INSERT OR REPLACE INTO hardware (id, user_id, type, tags, description, data) VALUES (?, ?, ?, ?, ?, ?)");
    seedHardware.forEach(h => insertHardware.run(h.id, 'system', h.type, JSON.stringify(h.tags), h.description, JSON.stringify(h.data)));
  }

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Health check for UptimeRobot
  app.get('/healthz', (req, res) => {
    res.status(200).send('OK');
  });

  // Trust proxy is required for correct host/protocol detection in Cloud Run
  app.set('trust proxy', true);

  app.use(express.json());
  app.use(
    cookieSession({
      name: "session",
      keys: [process.env.SESSION_SECRET || "solar-sizer-secret"],
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: "none",
      secure: true,
      httpOnly: true,
    })
  );

  const APP_URL = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

  // --- Auth Routes ---
  app.get("/api/auth/user", (req, res) => {
    // Always return null until OAuth is set up
    res.json({ user: null });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session = null;
    res.json({ success: true });
  });

  app.post("/api/admin/verify", (req, res) => {
    const { password } = req.body;
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
    if (!ADMIN_PASSWORD) {
      return res.status(500).json({ error: "Admin password not configured." });
    }
    res.json({ valid: password === ADMIN_PASSWORD });
  });

  // Google OAuth routes removed — add later when ready

  // --- User Data Routes (Auth Disabled) ---

  app.get("/api/user/data", async (req, res) => {
    res.json({ profiles: [], results: [], hardware: [] });
  });

  app.post("/api/user/profiles", async (req, res) => {
    res.json({ success: true });
  });

  app.post("/api/user/results", async (req, res) => {
    res.json({ success: true });
  });

  app.post("/api/user/hardware", async (req, res) => {
    res.json({ success: true });
  });

  app.delete("/api/user/:type/:id", async (req, res) => {
    res.json({ success: true });
  });

  // --- Master Data & Product Routes ---

  app.get("/api/devices", async (req, res) => {
    if (useSupabase) {
      const { data } = await supabase.from("devices_master").select("*");
      res.json(data || []);
    } else {
      const devices = db.prepare("SELECT * FROM devices_master").all();
      res.json(devices.map((d: any) => ({ ...d, tags: JSON.parse(d.tags) })));
    }
  });

  app.get("/api/hardware", async (req, res) => {
    if (useSupabase) {
      const { data } = await supabase.from("hardware").select("*").eq("user_id", "system");
      res.json(data || []);
    } else {
      const hardware = db.prepare("SELECT * FROM hardware WHERE user_id = 'system'").all();
      res.json(hardware.map((h: any) => ({
        ...h,
        data: JSON.parse(h.data),
        tags: JSON.parse(h.tags)
      })));
    }
  });

  app.post("/api/hardware", async (req, res) => {
    const adminKey = req.headers["x-admin-key"];
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
    if (adminKey !== ADMIN_PASSWORD) return res.status(403).json({ error: "Unauthorized" });

    const { id, type, data, tags, description } = req.body;
    if (useSupabase) {
      const { error } = await supabase.from("hardware").upsert({
        id, user_id: "system", type, data, tags, description
      });
      if (error) return res.status(500).json({ error: error.message });
    } else {
      const upsert = db.prepare(`
        INSERT INTO hardware (id, user_id, type, data, tags, description)
        VALUES (?, 'system', ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          type = excluded.type,
          data = excluded.data,
          tags = excluded.tags,
          description = excluded.description
      `);
      upsert.run(id, type, JSON.stringify(data), JSON.stringify(tags), description);
    }
    res.json({ success: true });
  });

  app.delete("/api/hardware/:id", async (req, res) => {
    const adminKey = req.headers["x-admin-key"];
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
    if (adminKey !== ADMIN_PASSWORD) return res.status(403).json({ error: "Unauthorized" });

    const { id } = req.params;
    if (useSupabase) {
      const { error } = await supabase.from("hardware").delete().eq("id", id);
      if (error) return res.status(500).json({ error: error.message });
    } else {
      db.prepare("DELETE FROM hardware WHERE id = ?").run(id);
    }
    res.json({ success: true });
  });

  app.post("/api/devices", async (req, res) => {
    const adminKey = req.headers["x-admin-key"];
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
    if (adminKey !== ADMIN_PASSWORD) return res.status(403).json({ error: "Unauthorized" });

    const { id, name, category, default_watts, tags } = req.body;
    if (useSupabase) {
      const { error } = await supabase.from("devices_master").upsert({
        id, name, category, default_watts, tags
      });
      if (error) return res.status(500).json({ error: error.message });
    } else {
      const upsert = db.prepare(`
        INSERT INTO devices_master (id, name, category, default_watts, tags)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          category = excluded.category,
          default_watts = excluded.default_watts,
          tags = excluded.tags
      `);
      upsert.run(id, name, category, default_watts, JSON.stringify(tags));
    }
    res.json({ success: true });
  });

  app.delete("/api/devices/:id", async (req, res) => {
    const adminKey = req.headers["x-admin-key"];
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
    if (adminKey !== ADMIN_PASSWORD) return res.status(403).json({ error: "Unauthorized" });

    const { id } = req.params;
    if (useSupabase) {
      const { error } = await supabase.from("devices_master").delete().eq("id", id);
      if (error) return res.status(500).json({ error: error.message });
    } else {
      db.prepare("DELETE FROM devices_master WHERE id = ?").run(id);
    }
    res.json({ success: true });
  });

  app.get("/api/products", async (req, res) => {
    const { tag } = req.query;
    let productsList: any[] = [];
    let hardwareList: any[] = [];

    if (useSupabase) {
      let prodQuery = supabase.from("products").select("*");
      if (tag) prodQuery = prodQuery.contains("tags", [tag]);
      const { data: prods } = await prodQuery;
      productsList = prods || [];

      let hwQuery = supabase.from("hardware").select("*").neq("tags", "[]");
      if (tag) hwQuery = hwQuery.contains("tags", [tag]);
      const { data: hws } = await hwQuery;
      hardwareList = hws || [];
    } else {
      let prods = db.prepare("SELECT * FROM products").all();
      productsList = prods.map((p: any) => ({
        ...p,
        combination_data: JSON.parse(p.combination_data),
        tags: JSON.parse(p.tags)
      }));

      let hws = db.prepare("SELECT * FROM hardware WHERE tags != '[]' AND tags IS NOT NULL").all();
      hardwareList = hws.map((h: any) => ({
        ...h,
        data: JSON.parse(h.data),
        tags: JSON.parse(h.tags)
      }));

      if (tag) {
        productsList = productsList.filter((p: any) => p.tags.includes(tag));
        hardwareList = hardwareList.filter((h: any) => h.tags.includes(tag));
      }
    }

    // Transform Hardware into Product shape
    const hardwareAsProducts = hardwareList.map(h => ({
      id: h.id,
      name: h.data.name || h.id,
      description: h.description || `Standalone ${h.type}`,
      type: "standalone",
      tags: h.tags,
      price: h.data.price || 0,
      combination_data: null
    }));

    res.json([...productsList, ...hardwareAsProducts]);
  });

  app.post("/api/products", async (req, res) => {
    // Validate admin password from request header
    const adminKey = req.headers["x-admin-key"];
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

    if (!ADMIN_PASSWORD) {
      return res.status(500).json({ error: "Admin password not configured on server." });
    }

    if (adminKey !== ADMIN_PASSWORD) {
      return res.status(403).json({ error: "Invalid admin credentials." });
    }

    const { id, name, description, type, combination_data, tags, price } = req.body;

    if (useSupabase) {
      const { error } = await supabase.from("products").upsert({
        id, name, description, type, combination_data, tags, price
      });
      if (error) return res.status(500).json({ error: error.message });
    } else {
      const upsert = db.prepare(`
        INSERT INTO products (id, name, description, type, combination_data, tags, price)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          description = excluded.description,
          type = excluded.type,
          combination_data = excluded.combination_data,
          tags = excluded.tags,
          price = excluded.price
      `);
      upsert.run(
        id, name, description, type,
        JSON.stringify(combination_data),
        JSON.stringify(tags),
        price
      );
    }
    res.json({ success: true });
  });

  app.delete("/api/products/:id", async (req, res) => {
    // Validate admin password from request header
    const adminKey = req.headers["x-admin-key"];
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

    if (!ADMIN_PASSWORD) {
      return res.status(500).json({ error: "Admin password not configured on server." });
    }

    if (adminKey !== ADMIN_PASSWORD) {
      return res.status(403).json({ error: "Invalid admin credentials." });
    }

    const { id } = req.params;

    if (useSupabase) {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) return res.status(500).json({ error: error.message });
    } else {
      const del = db.prepare("DELETE FROM products WHERE id = ?");
      del.run(id);
    }
    res.json({ success: true });
  });

  // --- Calculation API ---
  app.post("/api/calculate", async (req, res) => {
    const { location, devices, hardware, batteryPreference, tolerance } = req.body;
    
    try {
      // Fetch products to include pre-configured kits in calculation
      let products: any[] = [];
      if (useSupabase) {
        const { data } = await supabase.from("products").select("*");
        products = data || [];
      } else {
        products = db.prepare("SELECT * FROM products").all();
        products = products.map(p => ({
          ...p,
          combination_data: JSON.parse(p.combination_data),
          tags: JSON.parse(p.tags)
        }));
      }

      const { buildCombinations } = await import("./src/utils/solarCalculator.ts");
      const result = buildCombinations(location, devices, hardware, batteryPreference, tolerance, products);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // --- Vite Middleware ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
