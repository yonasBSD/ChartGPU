import { ChartGPU } from '../../src';
import type { ChartGPUInstance } from '../../src';

// --- Data generation ---

interface MaintenanceWindow {
  /** Offset from start in hours */
  startHour: number;
  /** Duration in hours */
  durationHours: number;
}

function generatePriceData(
  startPrice: number,
  hours: number,
  volatility: number,
  startTime: number,
  maintenance: MaintenanceWindow[],
): Array<readonly [number, number] | null> {
  const data: Array<readonly [number, number] | null> = [];
  let price = startPrice;
  const hourMs = 3600_000;

  for (let h = 0; h < hours; h++) {
    const t = startTime + h * hourMs;

    // Check if this hour falls inside a maintenance window
    const inMaintenance = maintenance.some(
      (w) => h >= w.startHour && h < w.startHour + w.durationHours,
    );

    if (inMaintenance) {
      data.push(null);
    } else {
      // Random walk with slight upward drift
      price += price * (Math.random() - 0.48) * volatility;
      price = Math.max(price * 0.5, price); // floor at 50% of current
      data.push([t, Math.round(price * 100) / 100] as const);
    }
  }

  return data;
}

function generateSessionData(
  sessions: Array<{ start: number; points: number; basePrice: number; volatility: number }>,
): Array<readonly [number, number] | null> {
  const result: Array<readonly [number, number] | null> = [];
  const hourMs = 3600_000;

  for (let s = 0; s < sessions.length; s++) {
    if (s > 0) result.push(null); // gap between sessions
    const sess = sessions[s];
    let price = sess.basePrice;
    for (let i = 0; i < sess.points; i++) {
      price += price * (Math.random() - 0.48) * sess.volatility;
      result.push([sess.start + i * hourMs, Math.round(price * 100) / 100] as const);
    }
  }

  return result;
}

// --- Init ---

async function init() {
  const now = Date.now();
  const startTime = now - 30 * 24 * 3600_000; // 30 days ago
  const totalHours = 30 * 24; // 720 hours

  // BTC data with 3 maintenance windows
  const btcMaintenance: MaintenanceWindow[] = [
    { startHour: 120, durationHours: 4 },   // day 5
    { startHour: 360, durationHours: 6 },   // day 15
    { startHour: 580, durationHours: 3 },   // day 24
  ];
  const btcData = generatePriceData(42000, totalHours, 0.008, startTime, btcMaintenance);

  // ETH data with different maintenance windows
  const ethMaintenance: MaintenanceWindow[] = [
    { startHour: 72, durationHours: 5 },    // day 3
    { startHour: 300, durationHours: 4 },   // day 12.5
    { startHour: 620, durationHours: 6 },   // day 26
  ];
  const ethData = generatePriceData(2200, totalHours, 0.01, startTime, ethMaintenance);

  // SOL data with its own windows
  const solMaintenance: MaintenanceWindow[] = [
    { startHour: 48, durationHours: 3 },    // day 2
    { startHour: 240, durationHours: 8 },   // day 10
    { startHour: 500, durationHours: 4 },   // day 21
  ];
  const solData = generatePriceData(95, totalHours, 0.015, startTime, solMaintenance);

  // --- Chart 1: BTC gaps visible ---
  await ChartGPU.create(document.getElementById('chart-gaps')!, {
    series: [{
      type: 'line',
      name: 'BTC/USDT',
      data: btcData as any,
      color: '#f7931a',
      areaStyle: { opacity: 0.15 },
      connectNulls: false,
    }],
    xAxis: { type: 'time' },
    yAxis: { tickFormatter: (v) => `$${(v / 1000).toFixed(1)}k` },
    dataZoom: [{ type: 'inside' }, { type: 'slider' }],
    grid: { left: 65, right: 20, top: 20, bottom: 40 },
    legend: { show: false },
    animation: false,
  });

  // --- Chart 2: BTC gaps bridged (with toggle) ---
  let connectNulls = true;
  const connectedChart: ChartGPUInstance = await ChartGPU.create(document.getElementById('chart-connected')!, {
    series: [{
      type: 'line',
      name: 'BTC/USDT',
      data: btcData as any,
      color: '#f7931a',
      areaStyle: { opacity: 0.15 },
      connectNulls: true,
    }],
    xAxis: { type: 'time' },
    yAxis: { tickFormatter: (v) => `$${(v / 1000).toFixed(1)}k` },
    dataZoom: [{ type: 'inside' }, { type: 'slider' }],
    grid: { left: 65, right: 20, top: 20, bottom: 40 },
    legend: { show: false },
    animation: false,
  });

  // Toggle button
  const toggleBtn = document.getElementById('toggle-connect')!;
  toggleBtn.addEventListener('click', () => {
    connectNulls = !connectNulls;
    connectedChart.setOption({
      series: [{
        type: 'line',
        name: 'BTC/USDT',
        data: btcData as any,
        color: '#f7931a',
        areaStyle: { opacity: 0.15 },
        connectNulls,
      }],
    });
    toggleBtn.textContent = `connectNulls: ${connectNulls}`;
    toggleBtn.classList.toggle('active', connectNulls);
  });

  // --- Chart 3: Multi-asset with independent gaps ---
  await ChartGPU.create(document.getElementById('chart-multi')!, {
    series: [
      {
        type: 'line',
        name: 'ETH',
        data: ethData as any,
        color: '#627eea',
        connectNulls: false,
      },
      {
        type: 'line',
        name: 'SOL',
        data: solData as any,
        color: '#00d18c',
        connectNulls: false,
      },
    ],
    xAxis: { type: 'time' },
    yAxis: {},
    dataZoom: [{ type: 'inside' }],
    grid: { left: 55, right: 20, top: 20, bottom: 30 },
    animation: false,
  });

  // --- Chart 4: Trading sessions concatenated ---
  const dayMs = 24 * 3600_000;
  const sessionData = generateSessionData([
    { start: startTime, points: 8 * 4, basePrice: 43500, volatility: 0.005 },
    { start: startTime + 1 * dayMs + 9 * 3600_000, points: 8 * 4, basePrice: 43800, volatility: 0.005 },
    { start: startTime + 2 * dayMs + 9 * 3600_000, points: 8 * 4, basePrice: 44100, volatility: 0.005 },
  ]);

  await ChartGPU.create(document.getElementById('chart-sessions')!, {
    series: [{
      type: 'line',
      name: 'BTC Futures',
      data: sessionData as any,
      color: '#e8c547',
      areaStyle: { opacity: 0.1 },
      connectNulls: false,
    }],
    xAxis: { type: 'time' },
    yAxis: { tickFormatter: (v) => `$${(v / 1000).toFixed(1)}k` },
    grid: { left: 65, right: 20, top: 20, bottom: 30 },
    legend: { show: false },
    animation: false,
  });
}

init().catch((err) => {
  const el = document.createElement('div');
  el.style.cssText = 'padding:20px;color:#ff6b6b;';
  el.textContent = String(err);
  document.body.prepend(el);
  console.error(err);
});
