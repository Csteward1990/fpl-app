import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import './App.css'; 

// ==========================================
// 1. HIGHLIGHTS COMPONENT
// ==========================================
const LeagueHighlights = ({ data, transfers }) => {
  if (!data || data.length === 0) return null;

  const motw = [...data].sort((a, b) => (b.event_total || 0) - (a.event_total || 0))[0];
  const woodenSpoon = [...data].sort((a, b) => (a.event_total || 0) - (b.event_total || 0))[0];
  const leader = [...data].sort((a, b) => (b.total || 0) - (a.total || 0))[0];
  const bestBench = [...data].sort((a, b) => (b.benchPoints || 0) - (a.benchPoints || 0))[0];
  const bestTransfer = (transfers || []).sort((a, b) => (b.diff || 0) - (a.diff || 0))[0];

  const highlights = [
    { title: "MOTW", emoji: "🥇", winner: motw?.player_name, impact: motw?.event_total },
    { title: "LEADER", emoji: "🏆", winner: leader?.player_name, impact: leader?.total },
    { title: "BENCH", emoji: "🪑", winner: bestBench?.player_name, impact: bestBench?.benchPoints },
    { title: "TRANSFER", emoji: "✨", winner: bestTransfer?.manager || "N/A", impact: bestTransfer?.diff || 0 },
    { title: "SPOON", emoji: "🥄", winner: woodenSpoon?.player_name, impact: woodenSpoon?.event_total }
  ];

  return (
    <div style={{ marginBottom: '32px' }}>
      <h2 className="section-title" style={{ background: 'transparent', border: 'none', textAlign: 'center', fontSize: '1.4rem' }}>
        League Highlights
      </h2>
      <div className="highlights-grid">
        {highlights.map((h, i) => (
          <div key={i} className="highlight-card">
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>{h.emoji}</div>
            <div style={{ fontSize: '12px', fontFamily: 'Orbitron', color: '#667eea', textTransform: 'uppercase' }}>{h.title}</div>
            <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#00ff87', margin: '4px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {h.winner || 'N/A'}
            </div>
            <div style={{ fontSize: '12px', fontWeight: 'bold' }}>Impact: {h.impact || 0}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ==========================================
// MAIN APP COMPONENT
// ==========================================
function App() {
  const [standingsData, setStandingsData] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [totwRows, setTotwRows] = useState({ 1: [], 2: [], 3: [], 4: [] });
  
  // Loading & Error States
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null); 
  
  const [leagueSize, setLeagueSize] = useState(10);
  const [leagueName, setLeagueName] = useState("");

  // --- DATA FETCHING ---
  useEffect(() => {
    const fetchAllData = async () => {
      try {
        const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

        // 1. Fetch Bootstrap
        const bootstrapRes = await fetch(`${API_BASE_URL}/api/bootstrap-static`);
        if (!bootstrapRes.ok) throw new Error("Server is sleeping or unreachable. Please refresh.");
        const bData = await bootstrapRes.json();
        const activeGW = bData?.events?.find(e => e.is_current)?.id || 1;
        
        const pMap = {};
        bData?.elements?.forEach(p => {
          pMap[p.id] = { id: p.id, name: p.web_name, cost: p.now_cost / 10, photo: p.code, pos: p.element_type };
        });

        // 2. Fetch Live Stats
        const liveRes = await fetch(`${API_BASE_URL}/api/live-data/${activeGW}`);
        const liveData = await liveRes.json();
        const liveEl = liveData?.elements || [];

        // 3. Fetch Standings
        const standingsRes = await fetch(`${API_BASE_URL}/api/league-standings`);
        const sData = await standingsRes.json();
        setLeagueName(sData?.league?.name || "League");
        
        const managers = sData?.standings?.results || [];
        setLeagueSize(Math.max(managers.length, 5));

        const leaguePlayerPool = new Map();
        const allTransfers = [];

        // 4. Enrich Data
        const enriched = await Promise.all(managers.map(async (m) => {
          const histRes = await fetch(`${API_BASE_URL}/api/manager-history/${m.entry}`);
          const history = await histRes.json();
          const chips = history?.chips || [];
          const activeChip = chips.find(c => c.event === activeGW)?.name || 'None';

          try {
            const tRes = await fetch(`${API_BASE_URL}/api/manager-transfers/${m.entry}`);
            const tList = await tRes.json();
            if (Array.isArray(tList)) {
              tList.filter(t => t.event === activeGW).forEach(t => {
                const pIn = liveEl.find(el => el.id === t.element_in)?.stats?.total_points || 0;
                const pOut = liveEl.find(el => el.id === t.element_out)?.stats?.total_points || 0;
                
                // --- FIX: Explicitly ensure teamName is captured ---
                allTransfers.push({ 
                  manager: m.player_name, 
                  teamName: m.entry_name || "Team",  // Fallback if missing
                  playerIn: pMap[t.element_in], 
                  playerOut: pMap[t.element_out], 
                  diff: pIn - pOut 
                });
              });
            }
          } catch (e) {}

          const pRes = await fetch(`${API_BASE_URL}/api/manager-picks/${m.entry}/${activeGW}`);
          const pData = await pRes.json();
          const picks = pData?.picks || [];
          const s11 = picks.slice(0, 11);
          const bench = picks.slice(11);

          const left = s11.filter(p => liveEl.find(el => el.id === p.element)?.stats?.minutes === 0).length;
          const bPts = bench.reduce((sum, p) => sum + (liveEl.find(el => el.id === p.element)?.stats?.total_points || 0), 0);
          
          const ppmStats = s11.map(p => {
            const live = liveEl.find(el => el.id === p.element)?.stats || {};
            const player = pMap[p.element];
            return { 
              ...player, 
              gwPoints: live.total_points || 0, 
              gwPPM: player?.cost > 0 ? ((live.total_points || 0) / player.cost).toFixed(1) : 0 
            };
          });

          s11.forEach(pick => {
             const live = liveEl.find(el => el.id === pick.element)?.stats || {};
             if (pMap[pick.element]) {
               const current = leaguePlayerPool.get(pick.element);
               if (!current || live.total_points > current.gwPoints) {
                 leaguePlayerPool.set(pick.element, { ...pMap[pick.element], gwPoints: live.total_points || 0 });
               }
             }
          });

          const stats = s11.reduce((acc, p) => {
            const s = liveEl.find(el => el.id === p.element)?.stats || {};
            return {
              bonus: acc.bonus + (s.bonus || 0), yellows: acc.yellows + (s.yellow_cards || 0), reds: acc.reds + (s.red_cards || 0),
              xg: acc.xg + parseFloat(s.expected_goals || 0), goals: acc.goals + (s.goals_scored || 0),
              xa: acc.xa + parseFloat(s.expected_assists || 0), assists: acc.assists + (s.assists || 0)
            };
          }, { bonus: 0, yellows: 0, reds: 0, xg: 0, goals: 0, xa: 0, assists: 0 });

          const rawHistory = Array.isArray(history) ? history : (history.current || []);

          return { 
            ...m, ...stats, leftCount: left, benchPoints: bPts, activeChip, 
            bestGWValue: ppmStats.sort((a,b)=>b.gwPPM-a.gwPPM)[0], 
            worstGWValue: ppmStats.sort((a,b)=>a.gwPPM-b.gwPPM)[0], 
            rawHistory: rawHistory 
          };
        }));

        const longestHistoryManager = enriched.reduce((prev, current) => 
          (prev.rawHistory.length > current.rawHistory.length) ? prev : current
        , { rawHistory: [] });
        
        const relevantHistory = longestHistoryManager.rawHistory.slice(-5); 

        const finalChartData = relevantHistory.map((hItem) => {
           const gwId = hItem.event;
           const dataPoint = { gameweek: `GW${gwId}` };
           const managersAtGw = enriched.map(m => {
              const historyEntry = m.rawHistory.find(h => h.event === gwId);
              return { name: m.entry_name, total_points: historyEntry ? historyEntry.total_points : -1 };
           });
           managersAtGw.sort((a, b) => b.total_points - a.total_points);
           managersAtGw.forEach((m, rankIndex) => {
             if (m.total_points > -1) dataPoint[m.name] = rankIndex + 1;
           });
           return dataPoint;
        });

        const poolArray = Array.from(leaguePlayerPool.values()).sort((a, b) => b.gwPoints - a.gwPoints);
        let s11totw = []; let c = { 1: 0, 2: 0, 3: 0, 4: 0 };
        const gk = poolArray.find(p => p.pos === 1); if (gk) { s11totw.push(gk); c[1]++; }
        const ds = poolArray.filter(p => p.pos === 2).slice(0, 3); ds.forEach(p => { s11totw.push(p); c[2]++; });
        const ms = poolArray.filter(p => p.pos === 3).slice(0, 3); ms.forEach(p => { s11totw.push(p); c[3]++; });
        const fs = poolArray.filter(p => p.pos === 4).slice(0, 1); if (fs[0]) { s11totw.push(fs[0]); c[4]++; }
        const rem = poolArray.filter(p => !s11totw.find(s => s.id === p.id));
        for (const p of rem) { 
          if (s11totw.length >= 11) break; 
          if ((p.pos === 2 && c[2] < 5) || (p.pos === 3 && c[3] < 5) || (p.pos === 4 && c[4] < 3)) { 
            s11totw.push(p); c[p.pos]++; 
          } 
        }
        const top = Math.max(...s11totw.map(p => p.gwPoints));
        const finalP = s11totw.map(p => ({ ...p, isCaptain: p.gwPoints === top, displayPoints: p.gwPoints }));
        setTotwRows({ 1: finalP.filter(p => p.pos === 1), 2: finalP.filter(p => p.pos === 2), 3: finalP.filter(p => p.pos === 3), 4: finalP.filter(p => p.pos === 4) });

        setChartData(finalChartData);
        setStandingsData(enriched);
        setTransfers(allTransfers.sort((a, b) => b.diff - a.diff));
        setLoading(false);
      } catch (err) { 
        console.error(err); 
        setError(err.message); 
        setLoading(false); 
      }
    };
    fetchAllData();
  }, []);

  const renderTeamCell = (team, manager) => (
    <div className="cell-content">
      <span className="team-name">{team || "Unknown"}</span>
      <span className="manager-name">{manager || "Manager"}</span>
    </div>
  );

  const PlayerPhoto = ({ photo }) => (
    <img src={`https://resources.premierleague.com/premierleague25/photos/players/110x140/${photo}.png`} 
         className="player-photo" alt="" 
         onError={(e) => { e.target.onerror = null; e.target.src = `https://resources.premierleague.com/premierleague/photos/players/110x140/p${photo}.png`; }} />
  );

  if (loading) return <div className="loading-screen">INITIALIZING FPL TRACKER...<br/><span style={{fontSize:'0.8rem', marginTop:'10px'}}>Waking up server...</span></div>;
  if (error) return <div className="loading-screen" style={{color: '#ff005a'}}>Error: {error}<br/>(Try refreshing)</div>;

  return (
    <div className="app-container">
      <header className="main-header">
        <h1>FPL TRACKER</h1>
        <div className="league-meta">
          <p className="league-label">FPL League</p>
          <h2 className="league-name">{leagueName}</h2>
        </div>
      </header>
      
      {/* <LeagueHighlights data={standingsData} transfers={transfers} /> */}

      <section className="dashboard-section">
        <h3 className="section-title">League Standings</h3>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{width:'8%'}}>Rank</th>
                <th className="col-team">Team / Manager</th>
                <th style={{width:'15%'}}>Chip</th>
                <th className="col-stat">GW</th>
                <th className="col-stat">Total</th>
              </tr>
            </thead>
            <tbody>
              {standingsData.map(m => (
                <tr key={m.id}>
                  <td>{m.rank}</td>
                  <td>{renderTeamCell(m.entry_name, m.player_name)}</td>
                  <td><span className={m.activeChip !== 'None' ? 'chip-badge' : 'chip-none'}>{(m.activeChip || "NONE").toUpperCase().slice(0,4)}</span></td>
                  <td className="val-neutral">{m.event_total}</td>
                  <td className="val-pos">{m.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="dashboard-section" style={{background: 'transparent', border: 'none'}}>
        <h3 className="section-title" style={{borderRadius: '8px 8px 0 0'}}>Rank History</h3>
        <div className="chart-wrapper">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart 
              data={chartData} 
              margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" />
              <XAxis dataKey="gameweek" stroke="#888" tick={{fontSize: 12}} />
              <YAxis 
                reversed 
                domain={[1, leagueSize]} 
                ticks={Array.from({length: leagueSize}, (_, i) => i + 1)} 
                interval={0}
                stroke="#888" 
                tick={{fontSize: 12}} 
              />
              <Tooltip contentStyle={{ backgroundColor: '#1e1e1e', borderColor: '#333', color: '#fff' }} />
              <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }} />
              {standingsData.map((m, i) => (
                <Line 
                  key={m.entry_name} 
                  type="monotone" 
                  dataKey={m.entry_name} 
                  stroke={`hsl(${(i * 137) % 360}, 70%, 50%)`} 
                  strokeWidth={3} 
                  dot={{r:3}} 
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="dashboard-section">
        <h3 className="section-title">League Team of the Week</h3>
        <div className="totw-pitch">
          {[1, 2, 3, 4].map(row => (
            <div key={row} className="pitch-row">
              {totwRows[row].map(p => (
                <div key={p.id} className="player-card">
                  <div className="points-badge">{p.displayPoints}</div>
                  <PlayerPhoto photo={p.photo} />
                  <div className="player-name">{p.name}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="dashboard-section">
        <h3 className="section-title">Clinicality Index</h3>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th className="col-team">Team</th>
                <th>xG</th><th>G</th><th>xA</th><th>A</th><th>Net</th>
              </tr>
            </thead>
            <tbody>
              {standingsData.map(m => {
                const net = (m.goals + m.assists) - (m.xg + m.xa);
                return (
                  <tr key={m.entry}>
                    <td>{renderTeamCell(m.entry_name, m.player_name)}</td>
                    <td>{m.xg.toFixed(1)}</td><td>{m.goals}</td><td>{m.xa.toFixed(1)}</td><td>{m.assists}</td>
                    <td className={net >= 0 ? 'val-pos' : 'val-neg'}>{net.toFixed(1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* --- UPDATED: TRANSFER IMPACT --- */}
      <section className="dashboard-section">
        <h3 className="section-title">Transfer Impact</h3>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                {/* FIXED WIDTHS APPLIED */}
                <th className="col-team">Team / Manager</th>
                <th className="col-stat">IN</th>
                <th className="col-stat">OUT</th>
                <th className="col-stat">Diff</th>
              </tr>
            </thead>
            <tbody>
              {transfers.slice(0, 5).map((t, i) => (
                <tr key={i}>
                  <td style={{textAlign: 'center', paddingLeft: 0}}>
                    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
                      <span style={{color: '#ffffff', fontWeight: '700', fontSize: '0.75rem'}}>{t.teamName}</span>
                      <span style={{color: '#a0a0a0', fontSize: '0.65rem', marginTop: '2px'}}>{t.manager}</span>
                    </div>
                  </td>
                  <td><div style={{display:'flex', flexDirection:'column', alignItems:'center'}}><PlayerPhoto photo={t.playerIn?.photo} width="32px" /><span style={{fontSize:'0.7rem'}}>{t.playerIn?.name}</span></div></td>
                  <td><div style={{display:'flex', flexDirection:'column', alignItems:'center', opacity:0.6}}><PlayerPhoto photo={t.playerOut?.photo} width="32px" /><span style={{fontSize:'0.7rem'}}>{t.playerOut?.name}</span></div></td>
                  <td className={t.diff >= 0 ? 'val-pos' : 'val-neg'}>{t.diff > 0 ? `+${t.diff}` : t.diff}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* --- UPDATED: GW EFFICIENCY --- */}
      <section className="dashboard-section">
        <h3 className="section-title">GW Efficiency (PPM)</h3>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                {/* FIXED WIDTHS APPLIED */}
                <th className="col-team">Team</th>
                <th className="col-wide-stat">GW MVP</th>
                <th className="col-wide-stat">GW LVP</th>
              </tr>
            </thead>
            <tbody>
              {standingsData.map(m => (
                <tr key={m.entry}>
                  <td>{renderTeamCell(m.entry_name, m.player_name)}</td>
                  <td style={{textAlign: 'center'}}>
                    {m.bestGWValue ? (
                      <div style={{display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'2px'}}>
                        <PlayerPhoto photo={m.bestGWValue.photo} width="32px" />
                        <span style={{fontSize:'0.7rem', fontWeight:'600'}}>{m.bestGWValue.name}</span>
                        <span className="val-pos">{m.bestGWValue.gwPPM}</span>
                      </div>
                    ) : '-'}
                  </td>
                  <td style={{textAlign: 'center'}}>
                    {m.worstGWValue ? (
                      <div style={{display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'2px', opacity:0.7}}>
                        <PlayerPhoto photo={m.worstGWValue.photo} width="32px" />
                        <span style={{fontSize:'0.7rem', fontWeight:'600'}}>{m.worstGWValue.name}</span>
                        <span className="val-neg">{m.worstGWValue.gwPPM}</span>
                      </div>
                    ) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="dashboard-section">
        <h3 className="section-title">Bonus & Discipline</h3>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th className="col-team">Team</th>
                <th>Bonus</th><th>Yellows</th><th>Reds</th>
              </tr>
            </thead>
            <tbody>
              {standingsData.map(m => (
                <tr key={m.entry}>
                  <td>{renderTeamCell(m.entry_name, m.player_name)}</td>
                  <td className="val-pos">{m.bonus}</td><td>{m.yellows} 🟨</td><td className="val-neg">{m.reds} 🟥</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default App;