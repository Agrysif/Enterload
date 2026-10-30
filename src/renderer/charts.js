import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Filler, Tooltip } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Filler, Tooltip);

ChartJS.defaults.font.family = "'Inter Variable', 'Segoe UI', sans-serif";
ChartJS.defaults.font.size = 12;
Object.assign(ChartJS.defaults.plugins.tooltip, {
  backgroundColor: 'rgba(28, 28, 30, 0.92)',
  padding: 10,
  cornerRadius: 10,
  displayColors: false,
  titleFont: { weight: '600' },
  caretSize: 0,
});

// Vertical fade from the accent color to transparent
export const accentGradient = (accent, alpha = 0.35) => ({ chart }) => {
  const { ctx, chartArea } = chart;
  if (!chartArea) return 'transparent';
  const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
  gradient.addColorStop(0, `${accent}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`);
  gradient.addColorStop(1, `${accent}00`);
  return gradient;
};
