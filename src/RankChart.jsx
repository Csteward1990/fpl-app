import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const RankChart = ({ managers }) => {
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      // 1. Limit to top 10 managers to keep the chart readable
      const topManagers = managers.slice(0, 10);

      try {
        const allHistories = await Promise.all(topManagers.map(async (m) => {
          const res = await fetch(`http://localhost:5000/api/manager-history/${m.entry}`);
          const history = await res.json();
          // Take only the last 5 completed gameweeks
          return {
            name: m.entry_name,
            history: history.slice(-5) 
          };
        }));

        // 2. Format data for Recharts [{ gameweek: 20, "Team A": 5, "Team B": 12 }, ...]
        const formattedData = allHistories[0].history.map((gw, index) => {
          const entry = { gameweek: `GW ${gw.event}` };
          allHistories.forEach(manager => {
            entry[manager.name] = manager.history[index]?.rank || null;
          });
          return entry;
        });

        setChartData(formattedData);
        setLoading(false);
      } catch (err) {
        console.error("Chart fetch error:", err);
      }
    };

    if (managers.length > 0) fetchHistory();
  }, [managers]);

  if (loading) return <div>Loading Rank History...</div>;

  return (
    <div style={{ height: 400, marginTop: '40px', padding: '20px', backgroundColor: '#fff', borderRadius: '8px' }}>
      <h3>Rank History (Last 5 GWs)</h3>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="gameweek" />
          {/* Reversed Y-Axis because Rank 1 is better than Rank 100 */}
          <YAxis reversed={true} domain={['dataMin - 1', 'dataMax + 1']} />
          <Tooltip />
          <Legend />
          {Object.keys(chartData[0])
            .filter(key => key !== 'gameweek')
            .map((teamName, idx) => (
              <Line 
                key={teamName} 
                type="monotone" 
                dataKey={teamName} 
                stroke={`hsl(${(idx * 137) % 360}, 70%, 50%)`} 
                strokeWidth={2}
              />
            ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default RankChart;