import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { Lightning, Clock, CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { Device, TimeRange } from "../types";

interface InteractiveBridgeProps {
  devices: Device[];
  initialDeficit: number;
  onClose: () => void;
  onChange?: (adjusted: Device[], deficit: number) => void;
}

export default function InteractiveBridge({ devices, initialDeficit, onClose, onChange }: InteractiveBridgeProps) {
  const [adjustedDevices, setAdjustedDevices] = useState<Device[]>(() => 
    JSON.parse(JSON.stringify(devices))
  );

  const currentDeficit = useMemo(() => {
    let savings = 0;
    adjustedDevices.forEach((adj, idx) => {
      const orig = devices[idx];
      const hourlyWh = orig.watts * orig.qty;

      const getHours = (ranges: TimeRange[]) => {
        return ranges.reduce((acc, r) => {
          const start = r.start;
          const end = r.end;
          return acc + (end > start ? end - start : 24 - start + end);
        }, 0);
      };

      const origHours = getHours(orig.ranges);
      const adjHours = getHours(adj.ranges);
      savings += (origHours - adjHours) * hourlyWh;
    });

    return Math.max(0, initialDeficit - savings);
  }, [adjustedDevices, devices, initialDeficit]);

  useEffect(() => {
    onChange?.(adjustedDevices, currentDeficit);
  }, [adjustedDevices, currentDeficit, onChange]);

  const updateRange = (deviceIdx: number, rangeIdx: number, field: "start" | "end", value: number) => {
    setAdjustedDevices(prev => {
      const next = [...prev];
      next[deviceIdx].ranges[rangeIdx][field] = value;
      return next;
    });
  };

  const getHourLabel = (hour: number) => {
    if (hour === 0) return "12 AM";
    if (hour === 24) return "12 AM (Midnight)";
    if (hour === 12) return "12 PM";
    return hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
  };

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-2xl flex items-center justify-between" style={{
        background: currentDeficit === 0 ? 'rgba(16,185,129,0.08)' : 'rgba(217,119,6,0.08)',
        border: currentDeficit === 0 ? '1px solid rgba(16,185,129,0.15)' : '1px solid rgba(217,119,6,0.15)'
      }}>
        <div className="flex items-center gap-3">
          {currentDeficit === 0 ? (
            <CheckCircle weight="fill" className="text-[#10B981]" size={24} />
          ) : (
            <WarningCircle weight="light" className="text-[#D97706]" size={24} />
          )}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider" style={{color: '#57534E'}}>Remaining Deficit</p>
            <p className="text-2xl font-black" style={{color: currentDeficit === 0 ? '#059669' : '#B45309'}}>
              {currentDeficit.toFixed(0)}Wh
            </p>
          </div>
        </div>
        {currentDeficit === 0 && (
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="text-white px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest" style={{background: 'var(--color-accent)'}}
          >
            Gap Bridged!
          </motion.div>
        )}
      </div>

      <div className="space-y-4">
        <h4 className="font-bold text-sm uppercase tracking-widest flex items-center gap-2" style={{color: '#57534E'}}>
          <Clock weight="light" size={16} /> Adjust Usage Windows
        </h4>
        
        <div className="grid gap-4">
          {adjustedDevices.map((device, dIdx) => (
            <div key={device.id} className="double-bezel">
              <div className="double-bezel-inner p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2" style={{color: '#A8A29E'}}>
                    <Lightning weight="light" size={16} />
                    <span className="font-bold text-[#FAFAF9]">{device.name}</span>
                  </div>
                  <span className="text-xs font-mono" style={{color: '#57534E'}}>{device.watts * device.qty}W Draw</span>
                </div>

                {device.ranges.map((range, rIdx) => (
                  <div key={rIdx} className="space-y-3">
                    <div className="flex justify-between text-[10px] font-bold uppercase" style={{color: '#57534E'}}>
                      <span>Start: {getHourLabel(range.start)}</span>
                      <span>End: {getHourLabel(range.end)}</span>
                    </div>
                    
                    <div className="relative h-6 flex items-center">
                      <div className="absolute inset-0 rounded-full h-1.5 my-auto" style={{background: 'rgba(255,255,255,0.06)'}} />
                      
                      <div 
                        className="absolute h-1.5 rounded-full my-auto"
                        style={{
                          background: 'var(--color-accent)',
                          left: `${(range.start / 24) * 100}%`,
                          width: `${((range.end >= range.start ? range.end - range.start : 24 - range.start + range.end) / 24) * 100}%`
                        }}
                      />

                      <input 
                        type="range"
                        min="0"
                        max="24"
                        value={range.start}
                        onChange={(e) => updateRange(dIdx, rIdx, "start", parseInt(e.target.value))}
                        className="absolute w-full appearance-none bg-transparent pointer-events-none z-10 [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-[#141414] [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-emerald-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:cursor-pointer"
                      />
                      <input 
                        type="range"
                        min="0"
                        max="24"
                        value={range.end}
                        onChange={(e) => updateRange(dIdx, rIdx, "end", parseInt(e.target.value))}
                        className="absolute w-full appearance-none bg-transparent pointer-events-none z-10 [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-[#141414] [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-emerald-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:cursor-pointer"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
