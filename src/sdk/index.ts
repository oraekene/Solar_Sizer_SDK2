import axios from 'axios';
import { Device, Region, Hardware, BatteryPreference, SystemCombination } from '../types';

export class SolarSizerSDK {
  private baseUrl: string;

  constructor(baseUrl: string = '/api') {
    this.baseUrl = baseUrl;
  }

  async getDevices() {
    const res = await axios.get(`${this.baseUrl}/devices`);
    return res.data;
  }

  async getProducts(tag?: string) {
    const res = await axios.get(`${this.baseUrl}/products`, { params: { tag } });
    return res.data;
  }

  async calculate(params: {
    location: Region;
    devices: Device[];
    hardware: Hardware;
    batteryPreference?: BatteryPreference;
    tolerance?: number;
  }): Promise<{ systems: SystemCombination[] }> {
    const res = await axios.post(`${this.baseUrl}/calculate`, params);
    return res.data;
  }

  async saveProduct(product: any, adminKey: string) {
    const res = await axios.post(`${this.baseUrl}/products`, product, {
      headers: {
        "x-admin-key": adminKey,
      },
    });
    return res.data;
  }
}

export const sdk = new SolarSizerSDK();
