import { sdk } from './src/sdk/index';
import { Region } from './src/types';

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  const APP_URL = process.env.APP_URL || 'http://127.0.0.1:8787';
  // In CLI mode, we need the full URL
  (sdk as any).baseUrl = `${APP_URL}/api`;

  if (command === 'list-devices') {
    const devices = await sdk.getDevices();
    console.table(devices.map((d: any) => ({
      Name: d.name,
      Watts: d.default_watts,
      Category: d.category,
      Tags: d.tags.join(', ')
    })));
  } else if (command === 'calculate') {
    // Basic example: tsx cli.ts calculate North "LED Bulb:5,Ceiling Fan:2"
    const location = (args[1] || 'North') as Region;
    const deviceInput = args[2] || '';
    
    const masterDevices = await sdk.getDevices();
    const devices = deviceInput.split(',').map(item => {
      const [name, qty] = item.split(':');
      const master = masterDevices.find((d: any) => d.name === name);
      return {
        id: Math.random().toString(36).substr(2, 9),
        name: name,
        watts: master?.default_watts || 100,
        qty: parseInt(qty) || 1,
        category: master?.category || 'electronics',
        ranges: [{ start: 18, end: 22 }] // Default 4 hours evening
      };
    });

    // Use default hardware for CLI quick check
    const { INVERTERS, PANELS, BATTERIES, POWERSTATIONS } = await import('./src/constants');
    
    const result = await sdk.calculate({
      location,
      devices,
      hardware: { inverters: INVERTERS, panels: PANELS, batteries: BATTERIES, powerstations: POWERSTATIONS }
    });

    console.log(`\nCalculation Results for ${location}:`);
    console.table(result.systems.slice(0, 5).map(s => ({
      System: s.inverter,
      Panels: s.panel_config,
      Batteries: s.battery_config,
      Price: `₦${s.total_price.toLocaleString()}`,
      Status: s.status
    })));
  } else {
    console.log('SolarSizer CLI');
    console.log('Usage:');
    console.log('  tsx cli.ts list-devices');
    console.log('  tsx cli.ts calculate <location> <devices>');
    console.log('Example:');
    console.log('  tsx cli.ts calculate North "LED Bulb:5,Ceiling Fan:2"');
  }
}

main().catch(console.error);
