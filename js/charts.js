/**
 * HAVIT PRO — Master Spreadsheet Chart & Gauge Engine
 */

class AnalyticsChartsEngine {
  constructor() {
    this.donutToday = null;
    this.donutWeekly = null;
    this.donutMonthly = null;
    this.weeklyBarChart = null;
    this.monthlyBarChart = null;
    this.yearlyTrendChart = null;
  }

  applyChartDefaults() {
    Chart.defaults.color = '#94A3B8';
    Chart.defaults.font.family = "'Plus Jakarta Sans', system-ui, sans-serif";
    Chart.defaults.plugins.tooltip.backgroundColor = '#0F172A';
    Chart.defaults.plugins.tooltip.borderColor = 'rgba(0, 240, 255, 0.4)';
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.padding = 8;
    Chart.defaults.plugins.tooltip.cornerRadius = 6;
  }

  // --- 3 EXECUTIVE DONUT GAUGES (MATCHING REFERENCE IMAGE) ---

  renderDonutGauges(todayPercent, weeklyPercent, monthlyPercent) {
    // 1. Today Gauge (Lime Green)
    this.renderSingleDonut('donutTodayChart', todayPercent, '#10B981', '#F59E0B', 'donutToday');
    document.getElementById('donutTodayVal').textContent = `${todayPercent}%`;

    // 2. Weekly Gauge (Cyan / Sky Blue)
    this.renderSingleDonut('donutWeeklyChart', weeklyPercent, '#00F0FF', '#3B82F6', 'donutWeekly');
    document.getElementById('donutWeeklyVal').textContent = `${weeklyPercent}%`;

    // 3. Monthly Gauge (Orange / Amber / Magenta)
    this.renderSingleDonut('donutMonthlyChart', monthlyPercent, '#F97316', '#EC4899', 'donutMonthly');
    document.getElementById('donutMonthlyVal').textContent = `${monthlyPercent}%`;
  }

  renderSingleDonut(canvasId, percent, primaryColor, secondaryColor, propName) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    if (this[propName]) {
      this[propName].destroy();
    }

    const remaining = Math.max(0, 100 - percent);

    this[propName] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        datasets: [{
          data: [percent, remaining],
          backgroundColor: [
            primaryColor,
            'rgba(255, 255, 255, 0.08)'
          ],
          borderWidth: 0,
          cutout: '76%'
        }]
      },
      options: {
        responsive: false,
        maintainAspectRatio: false,
        animation: { duration: 500 },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }
        }
      }
    });
  }

  // --- BOTTOM 7-DAY & 30-DAY CHARTS (MATCHING REFERENCE IMAGE) ---

  renderWeeklyBarChart(weekdayDistribution) {
    const ctx = document.getElementById('sheetWeeklyBarChart');
    if (!ctx) return;

    if (this.weeklyBarChart) {
      this.weeklyBarChart.destroy();
    }

    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const dataValues = labels.map(day => weekdayDistribution[day] || 0);

    const canvasCtx = ctx.getContext('2d');
    const gradient = canvasCtx.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, '#10B981');
    gradient.addColorStop(1, '#059669');

    this.weeklyBarChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Habits Completed',
          data: dataValues,
          backgroundColor: gradient,
          borderRadius: 4,
          borderSkipped: false,
          barThickness: 24
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => ` Total Completed: ${context.raw}`
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(255, 255, 255, 0.06)' },
            ticks: { stepSize: 2 }
          },
          x: {
            grid: { display: false }
          }
        }
      }
    });
  }

  renderMonthlyBarChart(daysData) {
    const ctx = document.getElementById('sheetMonthlyBarChart');
    if (!ctx) return;

    if (this.monthlyBarChart) {
      this.monthlyBarChart.destroy();
    }

    const labels = daysData.map(d => `${d.dayNumber}`);
    const dataValues = daysData.map(d => d.completedCount);

    const canvasCtx = ctx.getContext('2d');
    const gradient = canvasCtx.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, '#F59E0B');
    gradient.addColorStop(1, '#D97706');

    this.monthlyBarChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Daily Habits Done',
          data: dataValues,
          backgroundColor: gradient,
          borderRadius: 3,
          borderSkipped: false,
          barThickness: 12
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => ` Day ${context.label}: ${context.raw} habits completed`
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(255, 255, 255, 0.06)' },
            ticks: { stepSize: 2 }
          },
          x: {
            grid: { display: false }
          }
        }
      }
    });
  }

  // --- YEARLY 365-DAY HEATMAP & TREND ---

  renderYearlyHeatmap(yearlyData, onSelectDate) {
    const grid = document.getElementById('yearlyGridMaster');
    const monthsRow = document.getElementById('yearlyMonthsRow');
    const tooltip = document.getElementById('sheetHeatmapTooltip');
    if (!grid || !monthsRow) return;

    grid.innerHTML = '';
    monthsRow.innerHTML = '';

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    months.forEach(m => {
      const mDiv = document.createElement('span');
      mDiv.textContent = m;
      monthsRow.appendChild(mDiv);
    });

    const colors = ['#151D2F', '#064E3B', '#059669', '#10B981', '#34D399'];

    yearlyData.allDays.forEach(day => {
      const cell = document.createElement('div');
      cell.className = 'heatmap-cell';
      cell.style.background = colors[day.level];

      cell.addEventListener('mouseenter', () => {
        if (tooltip) {
          const rect = cell.getBoundingClientRect();
          tooltip.innerHTML = `<strong>${day.date}</strong>: ${day.percent}% Completed`;
          tooltip.style.left = `${rect.left - 40}px`;
          tooltip.style.top = `${rect.top - 36}px`;
          tooltip.style.opacity = '1';
        }
      });

      cell.addEventListener('mouseleave', () => {
        if (tooltip) tooltip.style.opacity = '0';
      });

      cell.addEventListener('click', () => {
        if (onSelectDate) onSelectDate(day.date);
      });

      grid.appendChild(cell);
    });
  }

  renderYearlyTrend(yearlyData) {
    const ctx = document.getElementById('yearlyTrendChartCanvas');
    if (!ctx) return;

    if (this.yearlyTrendChart) {
      this.yearlyTrendChart.destroy();
    }

    const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const canvasCtx = ctx.getContext('2d');
    const gradient = canvasCtx.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, '#00F0FF');
    gradient.addColorStop(1, '#10B981');

    this.yearlyTrendChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Monthly Average Consistency %',
          data: yearlyData.monthChartData,
          backgroundColor: gradient,
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { min: 0, max: 100, ticks: { callback: (v) => `${v}%` } },
          x: { grid: { display: false } }
        }
      }
    });
  }
}

window.AnalyticsCharts = new AnalyticsChartsEngine();
