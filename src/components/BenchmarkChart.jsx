import React, { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { fetchHistory } from '../api/yahoo.js';
import { useCurrency } from '../context/CurrencyContext.jsx';

const BenchmarkChart = ({ portfolioHistory, holdings, user }) => {
  const { currency, convert, sym } = useCurrency();
  const [selectedBenchmark, setSelectedBenchmark] = useState('^GSPTSE');
  const [selectedRange, setSelectedRange] = useState('1Y');
  const [benchmarkData, setBenchmarkData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const benchmarks = [
    { symbol: '^GSPTSE', label: 'TSX Composite' },
    { symbol: '^GSPC', label: 'S&P 500' },
    { symbol: '^IXIC', label: 'NASDAQ' },
  ];

  const ranges = [
    { value: '1M', days: 30, interval: '1d' },
    { value: '3M', days: 90, interval: '1d' },
    { value: '6M', days: 180, interval: '1d' },
    { value: '1Y', days: 365, interval: '1d' },
    { value: 'All', days: null, interval: '1wk' },
  ];

  // Fetch benchmark data when benchmark or range changes
  React.useEffect(() => {
    const fetchBenchmarkData = async () => {
      setLoading(true);
      setError(null);
      try {
        const rangeConfig = ranges.find(r => r.value === selectedRange);
        const data = await fetchHistory(
          selectedBenchmark,
          rangeConfig.days,
          rangeConfig.interval
        );
        setBenchmarkData(data);
      } catch (err) {
        setError('Failed to fetch benchmark data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchBenchmarkData();
  }, [selectedBenchmark, selectedRange]);

  // Normalize and merge data
  const chartData = useMemo(() => {
    if (!benchmarkData || !portfolioHistory || portfolioHistory.length === 0) {
      return [];
    }

    // Filter portfolio history based on range
    const rangeConfig = ranges.find(r => r.value === selectedRange);
    const now = new Date();
    const cutoffDate = new Date(now.getTime() - (rangeConfig.days ? rangeConfig.days * 24 * 60 * 60 * 1000 : 0));

    const filteredPortfolioHistory = portfolioHistory.filter(item => {
      const date = new Date(item.snapshot_date);
      return date >= cutoffDate;
    });

    if (filteredPortfolioHistory.length === 0) {
      return [];
    }

    // Find start values
    const portfolioStartValue = filteredPortfolioHistory[0].total_value;
    const benchmarkStart = benchmarkData[0];
    const benchmarkStartPrice = benchmarkStart?.close || 1;

    // Create a map of dates to benchmark values
    const benchmarkMap = {};
    benchmarkData.forEach(item => {
      const dateStr = new Date(item.date).toISOString().split('T')[0];
      benchmarkMap[dateStr] = item.close;
    });

    // Build merged dataset
    const merged = filteredPortfolioHistory.map(item => {
      const dateStr = item.snapshot_date;
      const portfolioPercentChange = ((item.total_value / portfolioStartValue) - 1) * 100;

      // Find closest benchmark price
      let benchmarkPrice = null;
      let benchmarkPercentChange = 0;

      const itemDate = new Date(dateStr);
      let closestDate = null;
      let closestDistance = Infinity;

      benchmarkData.forEach(bItem => {
        const bDate = new Date(bItem.date);
        const distance = Math.abs(itemDate - bDate);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestDate = bItem.date;
          benchmarkPrice = bItem.close;
        }
      });

      if (benchmarkPrice) {
        benchmarkPercentChange = ((benchmarkPrice / benchmarkStartPrice) - 1) * 100;
      }

      return {
        date: dateStr,
        portfolio: parseFloat(portfolioPercentChange.toFixed(2)),
        benchmark: parseFloat(benchmarkPercentChange.toFixed(2)),
      };
    });

    return merged;
  }, [portfolioHistory, benchmarkData, selectedRange]);

  // Calculate performance metrics
  const metrics = useMemo(() => {
    if (chartData.length === 0) {
      return {
        portfolioReturn: 0,
        benchmarkReturn: 0,
        alpha: 0,
        sharpeRatio: 0,
      };
    }

    const lastData = chartData[chartData.length - 1];
    const portfolioReturn = lastData.portfolio || 0;
    const benchmarkReturn = lastData.benchmark || 0;
    const alpha = portfolioReturn - benchmarkReturn;

    // Simplified Sharpe Ratio: (return - 0) / volatility
    const portfolioReturns = chartData.map(d => d.portfolio);
    const mean = portfolioReturns.reduce((a, b) => a + b, 0) / portfolioReturns.length;
    const variance = portfolioReturns.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / portfolioReturns.length;
    const volatility = Math.sqrt(variance);
    const sharpeRatio = volatility > 0 ? (portfolioReturn / volatility) * Math.sqrt(252) : 0;

    return {
      portfolioReturn,
      benchmarkReturn,
      alpha,
      sharpeRatio,
    };
  }, [chartData]);

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const diff = (data.portfolio - data.benchmark).toFixed(2);
      return (
        <div style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        }}>
          <p style={{ margin: '0 0 4px 0', color: 'var(--text)', fontSize: '12px' }}>
            {data.date}
          </p>
          <p style={{ margin: '2px 0', color: 'var(--green)', fontSize: '12px' }}>
            Portfolio: {data.portfolio.toFixed(2)}%
          </p>
          <p style={{ margin: '2px 0', color: 'var(--text-secondary)', fontSize: '12px' }}>
            Benchmark: {data.benchmark.toFixed(2)}%
          </p>
          <p style={{
            margin: '4px 0 0 0',
            color: diff >= 0 ? 'var(--green)' : 'var(--red)',
            fontSize: '12px',
            fontWeight: 'bold',
          }}>
            Difference: {diff >= 0 ? '+' : ''}{diff}%
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div style={{
      backgroundColor: 'var(--bg-card)',
      borderRadius: '12px',
      border: '1px solid var(--border)',
      padding: '24px',
      marginBottom: '24px',
    }}>
      {/* Header */}
      <div style={{
        marginBottom: '24px',
      }}>
        <h2 style={{
          margin: '0 0 16px 0',
          color: 'var(--text)',
          fontSize: '20px',
          fontWeight: '600',
        }}>
          Portfolio vs Benchmark
        </h2>

        {/* Benchmark Selector */}
        <div style={{ marginBottom: '16px' }}>
          <p style={{
            margin: '0 0 8px 0',
            color: 'var(--text-secondary)',
            fontSize: '12px',
            textTransform: 'uppercase',
            fontWeight: '600',
          }}>
            Benchmark
          </p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {benchmarks.map(bench => (
              <button
                key={bench.symbol}
                onClick={() => setSelectedBenchmark(bench.symbol)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '20px',
                  border: selectedBenchmark === bench.symbol ? '2px solid var(--gold)' : '1px solid var(--border)',
                  backgroundColor: selectedBenchmark === bench.symbol ? 'var(--bg-hover)' : 'transparent',
                  color: 'var(--text)',
                  fontSize: '13px',
                  fontWeight: selectedBenchmark === bench.symbol ? '600' : '500',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                {bench.label}
              </button>
            ))}
          </div>
        </div>

        {/* Range Selector */}
        <div>
          <p style={{
            margin: '0 0 8px 0',
            color: 'var(--text-secondary)',
            fontSize: '12px',
            textTransform: 'uppercase',
            fontWeight: '600',
          }}>
            Time Range
          </p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {ranges.map(range => (
              <button
                key={range.value}
                onClick={() => setSelectedRange(range.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: selectedRange === range.value ? '2px solid var(--gold)' : '1px solid var(--border)',
                  backgroundColor: selectedRange === range.value ? 'var(--bg-hover)' : 'transparent',
                  color: 'var(--text)',
                  fontSize: '12px',
                  fontWeight: selectedRange === range.value ? '600' : '500',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                {range.value}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart */}
      {loading && (
        <div style={{
          height: '300px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-secondary)',
        }}>
          Loading benchmark data...
        </div>
      )}

      {error && (
        <div style={{
          height: '300px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--red)',
          fontSize: '14px',
        }}>
          {error}
        </div>
      )}

      {!loading && !error && chartData.length > 0 && (
        <>
          <ResponsiveContainer width="100%" height={350}>
            <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorPortfolio" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--green)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--green)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                stroke="var(--text-muted)"
                style={{ fontSize: '12px' }}
                tick={{ fill: 'var(--text-muted)' }}
              />
              <YAxis
                stroke="var(--text-muted)"
                style={{ fontSize: '12px' }}
                tick={{ fill: 'var(--text-muted)' }}
                label={{ value: 'Return (%)', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ paddingTop: '20px' }}
                iconType="line"
              />
              <Area
                type="monotone"
                dataKey="portfolio"
                stroke="var(--green)"
                strokeWidth={2}
                fill="url(#colorPortfolio)"
                name="Your Portfolio"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="benchmark"
                stroke="var(--text-muted)"
                strokeWidth={2}
                strokeDasharray="5 5"
                fill="none"
                name={benchmarks.find(b => b.symbol === selectedBenchmark)?.label}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>

          {/* Performance Summary Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '16px',
            marginTop: '24px',
          }}>
            {/* Portfolio Return */}
            <div style={{
              backgroundColor: 'var(--bg)',
              borderRadius: '8px',
              padding: '16px',
              border: '1px solid var(--border)',
            }}>
              <p style={{
                margin: '0 0 8px 0',
                color: 'var(--text-secondary)',
                fontSize: '12px',
                fontWeight: '600',
                textTransform: 'uppercase',
              }}>
                Your Portfolio
              </p>
              <p style={{
                margin: '0',
                color: metrics.portfolioReturn >= 0 ? 'var(--green)' : 'var(--red)',
                fontSize: '24px',
                fontWeight: '700',
              }}>
                {metrics.portfolioReturn >= 0 ? '+' : ''}{metrics.portfolioReturn.toFixed(2)}%
              </p>
            </div>

            {/* Benchmark Return */}
            <div style={{
              backgroundColor: 'var(--bg)',
              borderRadius: '8px',
              padding: '16px',
              border: '1px solid var(--border)',
            }}>
              <p style={{
                margin: '0 0 8px 0',
                color: 'var(--text-secondary)',
                fontSize: '12px',
                fontWeight: '600',
                textTransform: 'uppercase',
              }}>
                {benchmarks.find(b => b.symbol === selectedBenchmark)?.label}
              </p>
              <p style={{
                margin: '0',
                color: metrics.benchmarkReturn >= 0 ? 'var(--green)' : 'var(--red)',
                fontSize: '24px',
                fontWeight: '700',
              }}>
                {metrics.benchmarkReturn >= 0 ? '+' : ''}{metrics.benchmarkReturn.toFixed(2)}%
              </p>
            </div>

            {/* Alpha */}
            <div style={{
              backgroundColor: 'var(--bg)',
              borderRadius: '8px',
              padding: '16px',
              border: '1px solid var(--border)',
            }}>
              <p style={{
                margin: '0 0 8px 0',
                color: 'var(--text-secondary)',
                fontSize: '12px',
                fontWeight: '600',
                textTransform: 'uppercase',
              }}>
                Alpha
              </p>
              <p style={{
                margin: '0',
                color: metrics.alpha >= 0 ? 'var(--green)' : 'var(--red)',
                fontSize: '24px',
                fontWeight: '700',
              }}>
                {metrics.alpha >= 0 ? '+' : ''}{metrics.alpha.toFixed(2)}%
              </p>
            </div>

            {/* Sharpe Ratio */}
            <div style={{
              backgroundColor: 'var(--bg)',
              borderRadius: '8px',
              padding: '16px',
              border: '1px solid var(--border)',
            }}>
              <p style={{
                margin: '0 0 8px 0',
                color: 'var(--text-secondary)',
                fontSize: '12px',
                fontWeight: '600',
                textTransform: 'uppercase',
              }}>
                Sharpe Ratio
              </p>
              <p style={{
                margin: '0',
                color: 'var(--text)',
                fontSize: '24px',
                fontWeight: '700',
              }}>
                {metrics.sharpeRatio.toFixed(2)}
              </p>
            </div>
          </div>
        </>
      )}

      {!loading && !error && chartData.length === 0 && (
        <div style={{
          height: '300px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-secondary)',
        }}>
          No data available for this range
        </div>
      )}
    </div>
  );
};

export default BenchmarkChart;
