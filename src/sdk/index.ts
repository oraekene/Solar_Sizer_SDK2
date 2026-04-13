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

  async getHardware() {
    const res = await axios.get(`${this.baseUrl}/hardware`);
    return res.data;
  }

  async saveHardware(item: any, adminKey: string) {
    const res = await axios.post(`${this.baseUrl}/hardware`, item, {
      headers: { "x-admin-key": adminKey }
    });
    return res.data;
  }

  async deleteHardware(id: string, adminKey: string) {
    const res = await axios.delete(`${this.baseUrl}/hardware/${id}`, {
      headers: { "x-admin-key": adminKey }
    });
    return res.data;
  }

  async saveMasterDevice(device: any, adminKey: string) {
    const res = await axios.post(`${this.baseUrl}/devices`, device, {
      headers: { "x-admin-key": adminKey }
    });
    return res.data;
  }

  async deleteMasterDevice(id: string, adminKey: string) {
    const res = await axios.delete(`${this.baseUrl}/devices/${id}`, {
      headers: { "x-admin-key": adminKey }
    });
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
