-- SQL Schema for Supabase (PostgreSQL)
-- Copy and paste this into the Supabase SQL Editor

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  name TEXT,
  picture TEXT,
  provider TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  name TEXT,
  region TEXT,
  battery_preference TEXT,
  devices JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create results table
CREATE TABLE IF NOT EXISTS results (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  profile_name TEXT,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create hardware table
CREATE TABLE IF NOT EXISTS hardware (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  type TEXT, -- 'inverter', 'panel', 'battery', 'powerstation'
  data JSONB,
  tags JSONB,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create devices_master table
CREATE TABLE IF NOT EXISTS devices_master (
  id TEXT PRIMARY KEY,
  name TEXT,
  category TEXT,
  default_watts REAL,
  tags JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create products table
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT,
  description TEXT,
  type TEXT, -- 'standalone' or 'combination'
  combination_data JSONB,
  tags JSONB,
  price REAL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create settings table
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
-- Note: These rules are simple. For production, refine based on your needs.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE results ENABLE ROW LEVEL SECURITY;
ALTER TABLE hardware ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Create policies (Allow users to see and modify only their own data)
DROP POLICY IF EXISTS "Users can view own profile" ON users;
CREATE POLICY "Users can view own profile" ON users FOR SELECT USING (auth.uid()::text = id);

DROP POLICY IF EXISTS "Users can update own profile" ON users;
CREATE POLICY "Users can update own profile" ON users FOR UPDATE USING (auth.uid()::text = id);

DROP POLICY IF EXISTS "Users can manage own profiles" ON profiles;
CREATE POLICY "Users can manage own profiles" ON profiles FOR ALL USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "Users can manage own results" ON results;
CREATE POLICY "Users can manage own results" ON results FOR ALL USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "Users can manage own hardware" ON hardware;
CREATE POLICY "Users can manage own hardware" ON hardware FOR ALL USING (user_id = auth.uid()::text);

-- Public read access for master data
DROP POLICY IF EXISTS "Anyone can view master devices" ON devices_master;
CREATE POLICY "Anyone can view master devices" ON devices_master FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can view products" ON products;
CREATE POLICY "Anyone can view products" ON products FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can view settings" ON settings;
CREATE POLICY "Anyone can view settings" ON settings FOR SELECT USING (true);

-- Admin write access (simplified for this example)
DROP POLICY IF EXISTS "Admins can manage master devices" ON devices_master;
CREATE POLICY "Admins can manage master devices" ON devices_master FOR ALL USING (true);

DROP POLICY IF EXISTS "Admins can manage products" ON products;
CREATE POLICY "Admins can manage products" ON products FOR ALL USING (true);

DROP POLICY IF EXISTS "Admins can manage settings" ON settings;
CREATE POLICY "Admins can manage settings" ON settings FOR ALL USING (true);

DROP POLICY IF EXISTS "Admins can manage hardware" ON hardware;
CREATE POLICY "Admins can manage hardware" ON hardware FOR ALL USING (true);
