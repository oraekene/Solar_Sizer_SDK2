import { BATTERIES, INVERTERS, LOCATION_PSH, PANELS, SURGE_MULTIPLIERS, IRRADIANCE_PROFILES } from "../constants";
import { Device, LoadAnalysis, Region, SystemCombination, Inverter, Panel, Battery, BatteryPreference, Product, Powerstation, ProfitMargins } from "../types";

export function calculateUserNeeds(devices: Device[]): LoadAnalysis {
  const hourlyConsumption: Record<number, number> = {};
  const hourlySurge: Record<number, number> = {};

  for (let h = 0; h < 24; h++) {
    hourlyConsumption[h] = 0;
    hourlySurge[h] = 0;
  }

  for (const d of devices) {
    const runW = d.watts * d.qty;
    const surgeW = runW * (SURGE_MULTIPLIERS[d.category] || 1.0);
    const surgeDiff = surgeW - runW;

    for (const range of d.ranges) {
      const start = range.start;
      const end = range.end;
      
      // Calculate duration correctly including wrap-around and 24h coverage
      const duration = end > start ? end - start : 24 - start + end;

      for (let i = 0; i < duration; i++) {
        const h = (start + i) % 24;
        hourlyConsumption[h] += runW;
        if (surgeDiff > hourlySurge[h]) {
          hourlySurge[h] = surgeDiff;
        }
      }
    }
  }

  const maxSurge = Math.max(
    ...Object.keys(hourlyConsumption).map(
      (h) => hourlyConsumption[Number(h)] + hourlySurge[Number(h)]
    )
  );

  // Nighttime: 18:00 to 07:00
  const nightHours = [18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6];
  const nighttimeWh = nightHours.reduce(
    (acc, h) => acc + hourlyConsumption[h],
    0
  );

  const totalDailyWh = Object.values(hourlyConsumption).reduce(
    (acc, val) => acc + val,
    0
  );

  return { 
    max_surge: maxSurge, 
    nighttime_wh: nighttimeWh, 
    total_daily_wh: totalDailyWh,
    hourly_consumption: hourlyConsumption
  };
}

export function simulateHourlySoC(
  hourlyLoad: Record<number, number>,
  actualDailyYield: number,
  usableBatteryWh: number,
  maxChargeW: number,
  ccType: "pwm" | "mppt",
  location: Region
): { passed: boolean; lowestSoCWh: number; finalDeficitWh: number; failureTime: string | null } {
  // FETCH DYNAMIC REGIONAL CURVE
  const irradianceCurve = IRRADIANCE_PROFILES[location] || IRRADIANCE_PROFILES["SW"]; // Fallback to SW if location missing
  
  const hourlySolarGen: Record<number, number> = {};
  for (let h = 0; h < 24; h++) {
    hourlySolarGen[h] = (irradianceCurve[h] || 0) * actualDailyYield;
  }

  // 2. Set up the Virtual Battery
  // Start at 18:00 (6 PM) assuming a full battery
  let currentBatteryWh = usableBatteryWh;
  let lowestBatteryWh = usableBatteryWh;

  // Loop through 48 hours to find actual failure time for unsustainable systems
  const simulationHours = [
    18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
    18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17
  ];

  for (let i = 0; i < simulationHours.length; i++) {
    const h = simulationHours[i];
    const load = hourlyLoad[h] || 0;
    const gen = hourlySolarGen[h] || 0;

    // Priority 1: Solar powers the active load first
    const netPower = gen - load;

    if (netPower > 0) {
      // Priority 2: Excess solar goes to the battery
      const chargeAdded = Math.min(netPower, maxChargeW);
      currentBatteryWh += chargeAdded;

      // Cap battery at 100% full
      if (currentBatteryWh > usableBatteryWh) {
        currentBatteryWh = usableBatteryWh;
      }
    } else {
      // Deficit: Pull from battery
      currentBatteryWh += netPower; // netPower is negative
    }

    // 3. Failure Check
    if (currentBatteryWh < lowestBatteryWh) {
      lowestBatteryWh = currentBatteryWh;
    }

    if (currentBatteryWh < 0) {
      const amPm = h < 12 ? "AM" : "PM";
      let displayHour = h % 12;
      if (displayHour === 0) displayHour = 12;
      const daySuffix = i >= 24 ? " (Day 2)" : "";
      const failureTime = `${displayHour}:00 ${amPm}${daySuffix}`;

      return { passed: false, lowestSoCWh: lowestBatteryWh, finalDeficitWh: Math.abs(currentBatteryWh), failureTime };
    }
  }

  // Check if battery recharged by end of simulation (5 PM Day 2)
  if (currentBatteryWh < usableBatteryWh * 0.95) {
    return { passed: false, lowestSoCWh: lowestBatteryWh, finalDeficitWh: usableBatteryWh - currentBatteryWh, failureTime: "5:00 PM (Insufficient Recharge)" };
  }

  return { passed: true, lowestSoCWh: lowestBatteryWh, finalDeficitWh: 0, failureTime: null };
}

export function getLoadSheddingAdvice(devices: Device[], deficit: number): string {
  // Sort devices by hourly consumption (highest to lowest)
  const sortedDevices = [...devices].sort((a, b) => (b.watts * b.qty) - (a.watts * a.qty));

  let deficitRemaining = deficit;
  const adviceSteps: string[] = [];

  for (const d of sortedDevices) {
    const hourlyWh = d.watts * d.qty;

    // Calculate total run hours for this device
    let totalRunHours = 0;
    for (const range of d.ranges) {
      const start = range.start;
      const end = range.end;
      totalRunHours += end > start ? end - start : 24 - start + end;
    }

    if (hourlyWh === 0 || totalRunHours <= 0) {
      continue;
    }

    const hoursToCut = Math.ceil(deficitRemaining / hourlyWh);

    // If we can cover the remaining deficit just by trimming this device:
    if (hoursToCut <= totalRunHours) {
      if (hoursToCut === totalRunHours) {
        adviceSteps.push(`turn off the ${d.name} completely`);
      } else {
        adviceSteps.push(`run your ${d.name} for ${hoursToCut} hour(s) less`);
      }

      deficitRemaining = 0;
      break; // We've covered the deficit!
    }
    // If this device isn't enough, we turn it off completely and keep going:
    else {
      adviceSteps.push(`turn off the ${d.name} completely`);
      deficitRemaining -= (totalRunHours * hourlyWh);
    }
  }

  // Format the final output
  if (deficitRemaining <= 0) {
    return `To bridge the ${deficit.toFixed(0)}Wh gap, ` + adviceSteps.join(" AND ") + ".";
  } else {
    return `Even after suggesting major cuts, you are still short. You must use grid power or upgrade the setup.`;
  }
}

function getNominalBatteryVoltage(voltage: number): number {
  // Standard LiFePO4 nominal classes
  if (voltage <= 14.4) return 12;
  if (voltage <= 28.8) return 24;
  if (voltage <= 57.6) return 48;
  return Math.round(voltage);
}

function isBatteryVoltageCompatible(systemVdc: number, batteryVoltage: number): boolean {
  const nominal = getNominalBatteryVoltage(batteryVoltage);

  // Keep this tolerant so 12.8V batteries work on 12V systems,
  // 25.6V on 24V systems, and 51.2V on 48V systems.
  const voltageMatch = Math.abs(batteryVoltage - nominal) / nominal <= 0.2;
  const systemMatch = systemVdc % nominal === 0;

  return voltageMatch && systemMatch;
}

function getHourlyDeficitPct(totalDailyWh: number, simDeficitWh: number): number {
  if (totalDailyWh <= 0) return 0;
  return (simDeficitWh / totalDailyWh) * 100;
}

function getStatusFromSimulation(
  simPassed: boolean,
  simDeficitWh: number,
  totalDailyWh: number,
  tolerance: number
): "Optimal" | "Conditional" | "High Risk" {
  const deficitPct = getHourlyDeficitPct(totalDailyWh, simDeficitWh);

  if (simPassed) return "Optimal";
  if (deficitPct <= tolerance) return "Conditional";
  return "High Risk";
}

export function buildCombinations(
  location: Region,
  devices: Device[],
  hardware: { inverters: Inverter[]; panels: Panel[]; batteries: Battery[]; powerstations: Powerstation[] },
  batteryPreference: BatteryPreference = "any",
  tolerance: number = 20,
  products: Product[] = [],
  margins: ProfitMargins = { inverter: 0, panel: 0, battery: 0, powerstation: 0, product: 0 }
): { analysis: LoadAnalysis; systems: SystemCombination[]; allLogs: string[][] } {
  const safeDevices = Array.isArray(devices) ? devices : [];
  const safeHardware = {
    inverters: Array.isArray(hardware?.inverters) ? hardware.inverters : [],
    panels: Array.isArray(hardware?.panels) ? hardware.panels : [],
    batteries: Array.isArray(hardware?.batteries) ? hardware.batteries : [],
    powerstations: Array.isArray(hardware?.powerstations) ? hardware.powerstations : []
  };
  const safeProducts = Array.isArray(products) ? products : [];

  const analysis = calculateUserNeeds(safeDevices);
  const { max_surge, nighttime_wh, total_daily_wh } = analysis;
  const psh = LOCATION_PSH[location] || 2.6;

  const applyMargin = (price: number, marginPercent: number) => price * (1 + marginPercent / 100);

  const validSystems: SystemCombination[] = [];
  const allLogs: string[][] = [];

  const isAcceptableStatus = (status: "Optimal" | "Conditional" | "High Risk") => status !== "High Risk";

  // --- 1. Pre-configured Kits ---
  for (const prod of safeProducts) {
    if (prod.type !== "combination" || !prod.combination_data) continue;

    const prodLog: string[] = [];
    const data = prod.combination_data;

    const invW = data.inverter_w || 0;
    const batWh = data.battery_wh || 0;
    const panW = data.panel_w || 0;

    prodLog.push(`Checking Pre-configured Kit: ${prod.name}`);

    if (invW < max_surge) {
      prodLog.push(`❌ Rejected: Kit inverter (${invW}W) is less than peak surge (${max_surge}W).`);
      allLogs.push(prodLog);
      continue;
    }
    prodLog.push(`✅ Kit inverter (${invW}W) matches surge requirements.`);

    const dailyYield = panW * psh * 0.8;
    prodLog.push(`Dynamic Daily Yield (${psh} PSH): ${dailyYield.toFixed(0)}Wh.`);

    const sim = simulateHourlySoC(
      analysis.hourly_consumption,
      dailyYield,
      usableWh,
      maxChargeW,
      ccType,
      location
    );
    
    const simDeficit = sim.finalDeficitWh;
    const deficitPercentage = getHourlyDeficitPct(total_daily_wh, simDeficit);
    
    let status: "Optimal" | "Conditional" | "High Risk";
    let advice: string;
    
    if (sim.passed) {
      status = "Optimal";
      advice = "Perfect match. Fully covers your scheduled daily energy needs based on hourly simulation.";
    } else if (deficitPercentage <= tolerance) {
      status = "Conditional";
      advice = `⚠️ Blackout Risk: You are short by ${simDeficit.toFixed(0)}Wh (${deficitPercentage.toFixed(0)}%).`;
    } else {
      status = "High Risk";
      advice = `🚨 High Blackout Risk: You are short by ${simDeficit.toFixed(0)}Wh (${deficitPercentage.toFixed(0)}%).`;
      allLogs.push(prodLog);
      continue;
    }
    prodLog.push(`Status: ${status}.`);

    if (!isAcceptableStatus(status)) {
      allLogs.push(prodLog);
      continue;
    }

    const totalPrice = applyMargin(prod.price, margins.product);

    validSystems.push({
      inverter: data.inverter,
      inverter_price: applyMargin(data.inverter_price || 0, margins.product),
      battery_config: data.battery_config,
      battery_price: applyMargin(data.battery_price || 0, margins.product),
      panel_config: data.panel_config,
      panel_price: applyMargin(data.panel_price || 0, margins.product),
      array_size_w: panW,
      battery_total_wh: batWh,
      total_price: totalPrice,
      daily_yield: dailyYield,
      deficit: Math.max(0, simDeficit),
      status,
      advice,
      log: prodLog,
      is_preconfigured: true,
      product_id: prod.id
    });

    allLogs.push(prodLog);
  }

  // --- 1.5 Powerstations ---
  for (const ps of safeHardware.powerstations) {
    const psLog: string[] = [];
    psLog.push(`Checking Powerstation: ${ps.name} (${ps.capacity_wh}Wh, ${ps.max_output_w}W)`);

    if (ps.max_output_w < max_surge) {
      psLog.push(`❌ Rejected: Powerstation output (${ps.max_output_w}W) is less than peak surge (${max_surge}W).`);
      allLogs.push(psLog);
      continue;
    }
    psLog.push(`✅ Powerstation output (${ps.max_output_w}W) matches surge requirements.`);

    const usableWh = ps.capacity_wh * (ps.battery_type === "lithium" ? 0.9 : 0.8);
    const maxChargeW = ps.max_charge_amps && ps.system_vdc
      ? ps.max_charge_amps * ps.system_vdc
      : ps.max_pv_input_w;

    const ccType = ps.cc_type || "mppt";

    // Use the real PV input rating, not a fixed 350W panel assumption.
    const dailyYield = ps.max_pv_input_w * psh * 0.8;

    const sim = simulateHourlySoC(
      analysis.hourly_consumption,
      dailyYield,
      usableWh,
      maxChargeW,
      ccType,
      location
    );
    
    const simDeficit = sim.finalDeficitWh;
    const deficitPercentage = getHourlyDeficitPct(total_daily_wh, simDeficit);
    
    let status: "Optimal" | "Conditional" | "High Risk";
    let advice: string;
    
    if (sim.passed) {
      status = "Optimal";
      advice = `This powerstation covers your load.`;
    } else if (deficitPercentage <= tolerance) {
      status = "Conditional";
      advice = `⚠️ Blackout Risk: Short by ${simDeficit.toFixed(0)}Wh (${deficitPercentage.toFixed(0)}%).`;
    } else {
      status = "High Risk";
      advice = `🚨 High Blackout Risk: Short by ${simDeficit.toFixed(0)}Wh (${deficitPercentage.toFixed(0)}%).`;
      allLogs.push(psLog);
      continue;
    }
    psLog.push(`Daily Yield: ${dailyYield.toFixed(0)}Wh.`);
    psLog.push(`Status: ${status}.`);

    if (!isAcceptableStatus(status)) {
      allLogs.push(psLog);
      continue;
    }

    const psPrice = applyMargin(ps.price, margins.powerstation);
    const panelEquivalentCount = Math.max(1, Math.ceil(ps.max_pv_input_w / 350));
    const panelPrice = applyMargin(panelEquivalentCount * 95000, margins.panel);

    validSystems.push({
      inverter: `${ps.name} (Built-in Inverter)`,
      inverter_price: psPrice,
      battery_config: `${ps.name} (Built-in Battery)`,
      battery_price: 0,
      panel_config: `${ps.max_pv_input_w}W PV Input`,
      panel_price: panelPrice,
      array_size_w: ps.max_pv_input_w,
      battery_total_wh: ps.capacity_wh,
      total_price: psPrice + panelPrice,
      daily_yield: dailyYield,
      deficit: Math.max(0, simDeficit),
      status,
      advice,
      log: psLog,
      is_preconfigured: true
    });

    allLogs.push(psLog);
  }

  // --- 2. Custom inverter + battery + panel combinations ---
  for (const inv of safeHardware.inverters) {
    const minUnitsForSurge = Math.ceil(max_surge / inv.max_ac_w);

    if (minUnitsForSurge > inv.max_parallel_units) {
      const invLog: string[] = [];
      invLog.push(`Checking inverter: ${inv.name} (Max AC: ${inv.max_ac_w}W)`);
      invLog.push(
        `❌ Rejected: Even with max parallel units (${inv.max_parallel_units}), total AC output (${inv.max_ac_w * inv.max_parallel_units}W) is less than peak surge (${max_surge}W).`
      );
      allLogs.push(invLog);
      continue;
    }

    const unitsToTry = [minUnitsForSurge];
    if (minUnitsForSurge + 1 <= inv.max_parallel_units) {
      unitsToTry.push(minUnitsForSurge + 1);
    }

    for (const numUnits of unitsToTry) {
      const invLog: string[] = [];
      const totalMaxAcW = inv.max_ac_w * numUnits;
      const totalMaxChargeAmps = inv.max_charge_amps * numUnits;
      const totalMaxPvW = inv.cc_max_pv_w * numUnits;
      const totalMaxCcAmps = inv.cc_max_amps * numUnits;
      const inverterDisplayName = numUnits > 1 ? `${numUnits}x ${inv.name}` : inv.name;

      invLog.push(`Checking setup: ${inverterDisplayName} (Total Max AC: ${totalMaxAcW}W)`);
      invLog.push(`✅ Inverter setup matches surge requirements.`);

      for (const bat of safeHardware.batteries) {
        const batLog = [...invLog];
        batLog.push(`Checking battery: ${bat.name} (${bat.voltage}V, ${bat.capacity_ah}Ah)`);

        if (batteryPreference !== "any" && bat.type !== batteryPreference) {
          batLog.push(`❌ Rejected: Battery type (${bat.type}) does not match preference (${batteryPreference}).`);
          allLogs.push(batLog);
          continue;
        }

        if (!isBatteryVoltageCompatible(inv.system_vdc, bat.voltage)) {
          batLog.push(
            `❌ Rejected: Battery voltage (${bat.voltage}V) is not compatible with inverter DC voltage (${inv.system_vdc}V).`
          );
          allLogs.push(batLog);
          continue;
        }

        const nominalBatteryV = getNominalBatteryVoltage(bat.voltage);
        const batteriesInSeries = inv.system_vdc / nominalBatteryV;
        batLog.push(`System requires ${batteriesInSeries} battery(ies) in series to match ${inv.system_vdc}V DC.`);

        const dodLimit = bat.type === "lead-acid" ? 0.5 : 0.8;
        const usableWhPerBattery = bat.voltage * bat.capacity_ah * dodLimit;
        const totalUsablePerString = usableWhPerBattery * batteriesInSeries;
        batLog.push(`Usable energy per series string: ${totalUsablePerString}Wh (DoD: ${dodLimit * 100}%).`);

        let parallelStrings = 1;
        if (nighttime_wh > 0) {
          parallelStrings = Math.ceil(nighttime_wh / totalUsablePerString);
          batLog.push(`Required nighttime energy (${nighttime_wh}Wh) requires ${parallelStrings} parallel string(s).`);
        } else {
          batLog.push(`No nighttime load detected. Using 1 parallel string.`);
        }

        if (parallelStrings > bat.max_parallel_strings) {
          batLog.push(
            `❌ Rejected: Required parallel strings (${parallelStrings}) exceeds battery's physical limit (${bat.max_parallel_strings}).`
          );
          allLogs.push(batLog);
          continue;
        }

        const totalBatteries = parallelStrings * batteriesInSeries;
        batLog.push(`Total batteries in bank: ${totalBatteries} (${batteriesInSeries}S x ${parallelStrings}P).`);

        const totalAhBank = bat.capacity_ah * parallelStrings;
        const minChargeAmpsNeeded = totalAhBank * bat.min_c_rate;
        batLog.push(`Battery bank requires min ${minChargeAmpsNeeded.toFixed(1)}A charging current (C-Rate: ${bat.min_c_rate}).`);

        if (totalMaxChargeAmps < minChargeAmpsNeeded) {
          batLog.push(
            `❌ Rejected: Inverter setup max charge current (${totalMaxChargeAmps}A) is less than required (${minChargeAmpsNeeded.toFixed(1)}A).`
          );
          allLogs.push(batLog);
          continue;
        }

        batLog.push(`✅ Battery bank is compatible with inverter charging capacity.`);
        const totalBatteryPrice = applyMargin(bat.price * totalBatteries, margins.battery);

        for (const panel of safeHardware.panels) {
          const panelLog = [...batLog];
          panelLog.push(`Checking panel: ${panel.name} (${panel.watts}W, Voc: ${panel.voc}V, Isc: ${panel.isc}A)`);

          const maxSeries = Math.floor(inv.cc_max_voc / panel.voc);
          const maxParallel = Math.floor(totalMaxCcAmps / panel.isc);
          const maxAllowedPanels = maxSeries * maxParallel;
          panelLog.push(`Charge controller limits: Max ${maxSeries} in series, Max ${maxParallel} in parallel (Total: ${maxAllowedPanels} panels).`);

          if (maxAllowedPanels === 0) {
            panelLog.push(`❌ Rejected: Panel electrical specs exceed charge controller limits.`);
            allLogs.push(panelLog);
            continue;
          }

          const ccType = (inv.cc_type || "pwm").toLowerCase();
          let usableWattsPerPanel = 0;

          if (ccType === "mppt") {
            usableWattsPerPanel = panel.watts * 0.95;
            panelLog.push(`Charge Controller: MPPT (Efficiency: 95%). Usable power per panel: ${usableWattsPerPanel.toFixed(1)}W.`);
          } else {
            const chargingVoltage = (inv.system_vdc / 12) * 13.5;
            usableWattsPerPanel = chargingVoltage * panel.isc;
            const ccEfficiency = usableWattsPerPanel / panel.watts;
            panelLog.push(
              `Charge Controller: PWM. Panel voltage dragged to ${chargingVoltage}V. Usable power per panel: ${usableWattsPerPanel.toFixed(1)}W (Effective Efficiency: ${(ccEfficiency * 100).toFixed(1)}%).`
            );
          }

          const requiredArrayWatts = total_daily_wh / (psh * 0.8);
          let minPanelsNeeded = Math.ceil(requiredArrayWatts / usableWattsPerPanel);
          if (minPanelsNeeded < 1) minPanelsNeeded = 1;

          panelLog.push(`Minimum panels needed to meet load (${total_daily_wh}Wh): ${minPanelsNeeded}.`);

          if (minPanelsNeeded > maxAllowedPanels) {
            panelLog.push(`❌ Rejected: Required panels (${minPanelsNeeded}) exceeds inverter's physical limit (${maxAllowedPanels}).`);
            allLogs.push(panelLog);
            continue;
          }

          const totalPanels = minPanelsNeeded;
          const arrayWattsRaw = totalPanels * panel.watts;
          const arrayWattsActual = totalPanels * usableWattsPerPanel;
          const usableArrayWatts = Math.min(arrayWattsActual, totalMaxPvW);

          if (arrayWattsRaw > totalMaxPvW) {
            panelLog.push(`Note: Array size (${arrayWattsRaw}W) exceeds charge controller PV input (${totalMaxPvW}W). Clipping will occur.`);
          }

          const dailyYield = usableArrayWatts * psh;
          panelLog.push(`Adjusted Daily Yield: ${dailyYield.toFixed(0)}Wh.`);

          const totalUsableBatteryWh = totalUsablePerString * parallelStrings;
          const maxChargeW = totalMaxChargeAmps * inv.system_vdc;

          const sim = simulateHourlySoC(
            analysis.hourly_consumption,
            dailyYield,
            totalUsableBatteryWh,
            maxChargeW,
            ccType as "pwm" | "mppt",
            location
          );

          const simDeficit = sim.finalDeficitWh;
          const deficitPercentage = getHourlyDeficitPct(total_daily_wh, simDeficit);
          // OLDER VERSION
          // const simDeficit = sim.finalDeficitWh;
          // const deficitPercentage = total_daily_wh > 0 ? (simDeficit / total_daily_wh) * 100 : 0;

          let status: "Optimal" | "Conditional" | "High Risk";
          let advice: string;

          if (sim.passed) {
            status = "Optimal";
            advice = "Perfect match. Fully covers your scheduled daily energy needs based on hourly simulation.";
            panelLog.push(`✅ System passed 24-hour hourly stress test.`);
          } else if (deficitPercentage <= tolerance) {
            status = "Conditional";
            const controllerWarning = ccType.toUpperCase();
            advice = `⚠️ Blackout Risk: With this ${controllerWarning} setup, your battery will drain at ${sim.failureTime}. You are short by ${simDeficit.toFixed(0)}Wh. Use the sliders below to adjust your schedule and prevent this.`;
            panelLog.push(`⚠️ System failed hourly simulation (${deficitPercentage.toFixed(0)}% deficit), but within tolerance.`);
          } else {
            status = "High Risk";
            const controllerWarning = ccType.toUpperCase();
            advice = `🚨 High Blackout Risk: Your battery will drain at ${sim.failureTime}. You are short by ${simDeficit.toFixed(0)}Wh (${deficitPercentage.toFixed(0)}%). This system is significantly undersized for your load.`;
            panelLog.push(`🚨 System failed hourly simulation with high deficit (${deficitPercentage.toFixed(0)}%).`);
          }

          if (status === "High Risk") {
            allLogs.push(panelLog);
            continue;
          }

          const totalPanelPrice = applyMargin(panel.price * totalPanels, margins.panel);
          const totalInverterPrice = applyMargin(inv.price * numUnits, margins.inverter);
          const totalSystemPrice = totalInverterPrice + totalBatteryPrice + totalPanelPrice;

          validSystems.push({
            inverter: inverterDisplayName,
            inverter_price: totalInverterPrice,
            battery_config: `${totalBatteries}x ${bat.name} (${batteriesInSeries}S${parallelStrings}P)`,
            battery_price: totalBatteryPrice,
            panel_config: `${totalPanels}x ${panel.name}`,
            panel_price: totalPanelPrice,
            array_size_w: arrayWattsActual,
            battery_total_wh: bat.voltage * bat.capacity_ah * totalBatteries,
            total_price: totalSystemPrice,
            daily_yield: dailyYield,
            deficit: Math.max(0, simDeficit),
            status,
            advice,
            log: panelLog,
            inverter_data: inv,
            panel_data: panel,
            battery_data: bat,
          });

          allLogs.push(panelLog);
        }
      }
    }
  }

  validSystems.sort((a, b) => a.total_price - b.total_price);
  return { analysis, systems: validSystems, allLogs };
}
