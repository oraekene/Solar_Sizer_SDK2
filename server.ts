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

  // Seed master devices if empty
  const count = db.prepare("SELECT COUNT(*) as count FROM devices_master").get().count;
  if (count === 0) {
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
    ];
    const insert = db.prepare("INSERT INTO devices_master (id, name, category, default_watts, tags) VALUES (?, ?, ?, ?, ?)");
    seedDevices.forEach(d => insert.run(d.id, d.name, d.category, d.watts, JSON.stringify(d.tags)));
  }

  // Seed Flagship Products and Hardware
  const productCount = db.prepare("SELECT COUNT(*) as count FROM products").get().count;
  if (productCount === 0) {
    // 1. Seed Products (Kits/Powerstations)
    const seedProducts = [
      {
        id: 'p1',
        name: 'SolarOne A300 Plug-and-Play Power Box',
        description: 'True plug-and-play "Setup in a Box". 300W Pure Sine Wave inverter and 390Wh deep cycle battery.',
        type: 'combination',
        combination_data: {
          inverter: '300W Pure Sine Wave',
          inverter_w: 300,
          battery_config: '390Wh Deep Cycle',
          battery_wh: 390,
          panel_config: '1x 250W Mono',
          panel_w: 250,
          total_price: 185000,
          status: 'Optimal',
          advice: 'Perfect for exams and studio sessions.'
        },
        tags: ['flagship', 'kit', 'powerstation'],
        price: 185000
      },
      {
        id: 'p2',
        name: 'SolarOne A500 Pro Power Box',
        description: 'Whole-house power without the installation. Premium 600Wh LiFePO4 battery and 500W Pure Sine Wave inverter.',
        type: 'combination',
        combination_data: {
          inverter: '500W Pure Sine Wave',
          inverter_w: 500,
          battery_config: '600Wh LiFePO4',
          battery_wh: 600,
          panel_config: '1x 350W Mono',
          panel_w: 350,
          total_price: 300000,
          status: 'Optimal',
          advice: 'Premium power for sensitive electronics.'
        },
        tags: ['flagship', 'kit', 'powerstation'],
        price: 300000
      },
      {
        id: 'p3',
        name: 'Itel Energy iESS 320T + 200W Panel Kit',
        description: 'Portable 320Wh LiFePO4 battery and 130W pure sine wave inverter.',
        type: 'combination',
        combination_data: {
          inverter: '130W Pure Sine Wave',
          inverter_w: 130,
          battery_config: '320Wh LiFePO4',
          battery_wh: 320,
          panel_config: '1x 200W Mono',
          panel_w: 200,
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
        description: 'Massive 1000Wh LiFePO4 battery paired with a 500W pure sine wave inverter.',
        type: 'combination',
        combination_data: {
          inverter: '500W Pure Sine Wave',
          inverter_w: 500,
          battery_config: '1000Wh LiFePO4',
          battery_wh: 1000,
          panel_config: '1x 450W Mono',
          panel_w: 450,
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
        description: '600Wh LiFePO4 battery and 500W modified sine wave AC output.',
        type: 'combination',
        combination_data: {
          inverter: '500W Modified Sine',
          inverter_w: 500,
          battery_config: '600Wh LiFePO4',
          battery_wh: 600,
          panel_config: '1x 350W Mono',
          panel_w: 350,
          total_price: 310000,
          status: 'Optimal',
          advice: 'Accessible off-grid power for daily essentials.'
        },
        tags: ['solar', 'kit', 'powerstation'],
        price: 310000
      }
    ];
    const insertProduct = db.prepare("INSERT INTO products (id, name, description, type, combination_data, tags, price) VALUES (?, ?, ?, ?, ?, ?, ?)");
    seedProducts.forEach(p => insertProduct.run(p.id, p.name, p.description, p.type, JSON.stringify(p.combination_data), JSON.stringify(p.tags), p.price));

    // 2. Seed Hardware (Panels, Batteries, Cables)
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
      // Internet Hardware
      {
        id: 'i1',
        type: 'internet',
        tags: ['internet', 'tier-a'],
        description: 'Cat19 LTE with 8x8 MIMO. Theoretical 1.6Gbps DL.',
        data: { name: 'Huawei B818-263', price: 100000, category: '4G LTE Cat19' }
      },
      {
        id: 'i2',
        type: 'internet',
        tags: ['internet', 'tier-a'],
        description: '5G NR bands n78 / n77 / n28. WiFi 6 AX3600.',
        data: { name: 'ZTE MC888', price: 110000, category: '5G Indoor CPE' }
      },
      {
        id: 'i3',
        type: 'internet',
        tags: ['internet', 'tier-b'],
        description: 'Multi-WAN Load Balancing Router. Gigabit ports.',
        data: { name: 'TP-Link ER605 (V2)', price: 75000, category: 'Load Balancer' }
      }
    ];
    const insertHardware = db.prepare("INSERT INTO hardware (id, user_id, type, tags, description, data) VALUES (?, ?, ?, ?, ?, ?)");
    seedHardware.forEach(h => insertHardware.run(h.id, 'system', h.type, JSON.stringify(h.tags), h.description, JSON.stringify(h.data)));
  }
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
