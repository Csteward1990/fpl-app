import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// ==========================================
// 1. HALL OF SHAME & GLORY (HIGHLIGHTS) COMPONENT
// ==========================================
const LeagueHighlights = ({ data, transfers }) => {
  if (!data || data.length === 0) return null;

  const motw = [...data].sort((a, b) => b.event_total - a.event_total)[0];
  const woodenSpoon = [...data].sort((a, b) => a.event_total - b.event_total)[0];
  const leader = [...data].sort((a, b) => b.total - a.total)[0];
  const bestBench = [...data].sort((a, b) => b.benchPoints - a.benchPoints)[0];
  const bestTransfer = (transfers || []).sort((a, b) => b.diff - a.diff)[0];

  const highlights = [
    { title: "MOTW", emoji: "🥇", winner: motw.player_name, impact: motw.event_total },
    { title: "LEADER", emoji: "🏆", winner: leader.player_name, impact: leader.total },
    { title: "BENCH", emoji: "🪑", winner: bestBench.player_name, impact: bestBench.benchPoints },
    { title: "TRANSFER", emoji: "✨", winner: bestTransfer?.manager || "N/A", impact: bestTransfer?.diff || 0 },
    { title: "SPOON", emoji: "🥄", winner: woodenSpoon.player_name, impact: woodenSpoon.event_total }
  ];

  return (
    <div style={{ marginBottom: '32px' }}>
      <h2 style={{ ...mainHeaderStyle, fontSize: '20px' }}>League Highlights</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
        {highlights.map((h, i) => (
          <div key={i} style={highlightCardStyle}>
            <div style={{ fontSize: '24px', marginBottom: '4px' }}>{h.emoji}</div>
            <div style={{ fontSize: '14px', fontFamily: 'Orbitron', color: '#37003c', textTransform: 'uppercase' }}>{h.title}</div>
            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#00ff87', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.winner}</div>
            <div style={{ fontSize: '14px', fontWeight: 'bold', fontFamily: 'Orbitron' }}>Impact: {h.impact}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

const FplStandings = () => {
  const [standingsData, setStandingsData] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [totwRows, setTotwRows] = useState({ 1: [], 2: [], 3: [], 4: [] });
  const [loading, setLoading] = useState(true);
  const [leagueSize, setLeagueSize] = useState(0);
  const [leagueName, setLeagueName] = useState("");

  // ==========================================
  // DATA FETCHING & PROCESSING LOGIC
  // ==========================================
  useEffect(() => {
    const fetchAllData = async () => {
      try {
        const bootstrapRes = await fetch('http://localhost:5000/api/bootstrap-static');
        const bData = await bootstrapRes.json();
        const activeGW = bData.events.find(e => e.is_current)?.id || 1;
        
        const pMap = {};
        bData.elements.forEach(p => pMap[p.id] = { id: p.id, name: p.web_name, cost: p.now_cost / 10, photo: p.code, pos: p.element_type });

        const liveRes = await fetch(`http://localhost:5000/api/live-data/${activeGW}`);
        const liveData = await liveRes.json();
        const liveEl = liveData.elements || [];

        const standingsRes = await fetch('http://localhost:5000/api/league-standings');
        const sData = await standingsRes.json();
        setLeagueName(sData.league.name);
        const managers = sData.standings.results || [];
        setLeagueSize(managers.length);

        const leaguePlayerPool = new Map();
        const allTransfers = [];

        const enriched = await Promise.all(managers.map(async (m) => {
          const histRes = await fetch(`http://localhost:5000/api/manager-history/${m.entry}`);
          const history = await histRes.json();
          const chips = history.chips || [];
          const historyArray = history.current || history || [];
          
          const usedSecondWC = chips.some(c => c.name === 'wildcard' && c.event >= 20); 
          const activeChip = chips.find(c => c.event === activeGW)?.name || 'None';
          const remainingChips = [];
          if (!usedSecondWC) remainingChips.push('WC');
          if (!chips.some(c => c.name === 'bboost')) remainingChips.push('BB');
          if (!chips.some(c => c.name === '3xc')) remainingChips.push('TC');
          if (!chips.some(c => c.name === 'freehit')) remainingChips.push('FH');

          try {
            const tRes = await fetch(`http://localhost:5000/api/manager-transfers/${m.entry}`);
            const tList = await tRes.json();
            if (Array.isArray(tList)) {
              tList.filter(t => t.event === activeGW).forEach(t => {
                const ptsIn = liveEl.find(el => el.id === t.element_in)?.stats.total_points || 0;
                const ptsOut = liveEl.find(el => el.id === t.element_out)?.stats.total_points || 0;
                allTransfers.push({ manager: m.player_name, playerIn: pMap[t.element_in], playerOut: pMap[t.element_out], diff: ptsIn - ptsOut });
              });
            }
          } catch (e) {}

          const pRes = await fetch(`http://localhost:5000/api/manager-picks/${m.entry}/${activeGW}`);
          const pData = await pRes.json();
          const picks = pData.picks || [];
          const s11 = picks.slice(0, 11);
          const bench = picks.slice(11);

          const left = s11.filter(p => liveEl.find(el => el.id === p.element)?.stats?.minutes === 0).length;
          const bPts = bench.reduce((sum, p) => sum + (liveEl.find(el => el.id === p.element)?.stats.total_points || 0), 0);
          
          const ppmStats = s11.map(p => {
            const live = liveEl.find(el => el.id === p.element)?.stats || {};
            const player = pMap[p.element];
            return { ...player, gwPoints: live.total_points || 0, gwPPM: player?.cost > 0 ? (live.total_points / player.cost).toFixed(1) : 0 };
          });

          // Pool players for TOTW
          s11.forEach(pick => {
             const live = liveEl.find(el => el.id === pick.element)?.stats || {};
             if (pMap[pick.element]) {
               if (!leaguePlayerPool.has(pick.element) || live.total_points > leaguePlayerPool.get(pick.element).gwPoints) {
                 leaguePlayerPool.set(pick.element, { ...pMap[pick.element], gwPoints: live.total_points || 0, ownedCount: (leaguePlayerPool.get(pick.element)?.ownedCount || 0) + 1 });
               } else {
                 const existing = leaguePlayerPool.get(pick.element);
                 leaguePlayerPool.set(pick.element, { ...existing, ownedCount: existing.ownedCount + 1 });
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

          return { ...m, ...stats, leftCount: left, benchPoints: bPts, activeChip, remainingChips, bestGWValue: ppmStats.sort((a,b)=>b.gwPPM-a.gwPPM)[0], worstGWValue: ppmStats.sort((a,b)=>a.gwPPM-b.gwPPM)[0], history: Array.isArray(historyArray) ? historyArray.slice(-5) : [] };
        }));

        // TOTW Formation Logic
        const poolArray = Array.from(leaguePlayerPool.values()).sort((a, b) => b.gwPoints - a.gwPoints);
        let s11totw = []; let c = { 1: 0, 2: 0, 3: 0, 4: 0 };
        const gk = poolArray.find(p => p.pos === 1); if (gk) { s11totw.push(gk); c[1]++; }
        const ds = poolArray.filter(p => p.pos === 2).slice(0, 3); ds.forEach(p => { s11totw.push(p); c[2]++; });
        const ms = poolArray.filter(p => p.pos === 3).slice(0, 3); ms.forEach(p => { s11totw.push(p); c[3]++; });
        const fs = poolArray.filter(p => p.pos === 4).slice(0, 1); if (fs[0]) { s11totw.push(fs[0]); c[4]++; }
        const rem = poolArray.filter(p => !s11totw.find(s => s.id === p.id));
        for (const p of rem) { if (s11totw.length >= 11) break; if ((p.pos === 2 && c[2] < 5) || (p.pos === 3 && c[3] < 5) || (p.pos === 4 && c[4] < 3)) { s11totw.push(p); c[p.pos]++; } }
        const top = Math.max(...s11totw.map(p => p.gwPoints));
        const finalP = s11totw.map(p => ({ ...p, isCaptain: p.gwPoints === top, displayPoints: p.gwPoints === top ? p.gwPoints * 2 : p.gwPoints }));
        setTotwRows({ 1: finalP.filter(p => p.pos === 1), 2: finalP.filter(p => p.pos === 2), 3: finalP.filter(p => p.pos === 3), 4: finalP.filter(p => p.pos === 4) });

        const last5 = enriched[0]?.history.map(h => h.event) || [];
        setChartData(last5.map((gw, idx) => {
          const entry = { gameweek: `GW ${gw}` };
          const sorted = [...enriched].sort((a, b) => (b.history[idx]?.total_points || 0) - (a.history[idx]?.total_points || 0));
          enriched.forEach(m => { entry[m.entry_name] = sorted.findIndex(s => s.entry === m.entry) + 1; });
          return entry;
        }));

        setStandingsData(enriched);
        setTransfers(allTransfers.sort((a, b) => b.diff - a.diff));
        setLoading(false);
      } catch (err) { setLoading(false); }
    };
    fetchAllData();
  }, []);

  const PlayerPhoto = ({ photo, width }) => (
    <img src={`https://resources.premierleague.com/premierleague25/photos/players/110x140/${photo}.png`} style={{ width, borderRadius: '4px' }} alt="" 
      onError={(e) => { e.target.onerror = null; e.target.src = `https://resources.premierleague.com/premierleague/photos/players/110x140/p${photo}.png`; }} />
  );

  const renderTeamCell = (team, manager) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '100px' }}>
      <span style={{ fontWeight: '700', fontSize: '16px', color: '#37003c', textAlign: 'center', lineHeight: '1.2' }}>{team}</span>
      <span style={{ fontSize: '12px', color: '#666', fontWeight: '400' }}>{manager}</span>
    </div>
  );

  if (loading) return <div style={msgStyle}>Loading App Data...</div>;

  return (
    <div style={containerStyle}>
      {/* HEADER SECTION */}
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <h1 style={{ ...mainHeaderStyle, fontSize: '32px' }}>FPL TRACKER</h1>
        <div style={{ fontFamily: 'Orbitron', color: '#666', fontSize: '14px', letterSpacing: '2px', marginBottom: '8px' }}>FPL LEAGUE</div>
        <div style={{ fontFamily: 'Orbitron', color: '#37003c', fontSize: '24px', fontWeight: 'bold' }}>{leagueName}</div>
      </div>
      
      <LeagueHighlights data={standingsData} transfers={transfers} />

      {/* TABLE 1: LEAGUE STANDINGS */}
      <div style={cardStyle}>
        <h3 style={titleStyle}>Standings</h3>
        <table style={tableStyle}>
          <thead><tr style={headerStyle}>
            <th style={thStyle}>Rank</th><th style={thStyle}>Team / Manager</th><th style={thStyle}>Chip</th><th style={thStyle}>GW</th><th style={thStyle}>Total</th>
          </tr></thead>
          <tbody>{standingsData.map(m => (
            <tr key={m.id} style={rowStyle}>
              <td style={tdStyle}>{m.rank}</td>
              <td style={tdStyle}>{renderTeamCell(m.entry_name, m.player_name)}</td>
              <td style={{...tdStyle, fontFamily: 'Orbitron', fontSize: '12px', color: m.activeChip !== 'None' ? '#00ff87' : '#999'}}>{m.activeChip.toUpperCase().slice(0,4)}</td>
              <td style={tdStyle}>{m.event_total}</td>
              <td style={{...tdStyle, fontWeight:'bold', fontSize: '16px'}}>{m.total}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      {/* CHART: LEAGUE POSITION HISTORY */}
      <div style={{ ...cardStyle, padding: '16px' }}>
        <h3 style={titleStyle}>League Position History</h3>
        <div style={{ width: '100%', height: '300px', marginTop: '16px' }}>
          <ResponsiveContainer>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="gameweek" tick={{fontSize: 12, fontFamily: 'Montserrat'}} />
              <YAxis reversed domain={[1, leagueSize]} tick={{fontSize: 12, fontFamily: 'Montserrat'}} />
              <Tooltip labelStyle={{fontFamily: 'Orbitron'}} itemStyle={{fontSize: '14px'}} />
              <Legend wrapperStyle={{fontSize: '12px', paddingTop: '20px'}} />
              {Object.keys(chartData[0] || {}).filter(k => k !== 'gameweek').map((name, i) => (
                <Line key={name} dataKey={name} stroke={`hsl(${(i * 137) % 360}, 70%, 50%)`} strokeWidth={3} dot={{ r: 4 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ==========================================
          RESTORED COMPONENT: MINI LEAGUE TOTW (UNDER CHART)
          ========================================== */}
      <div style={pitchContainerStyle}>
        <h3 style={{ color: '#fff', textAlign: 'center', margin: '0 0 12px 0', fontSize: '18px', fontFamily: 'Orbitron' }}>League Team of the Week</h3>
        {[1, 2, 3, 4].map(row => (
          <div key={row} style={pitchRowStyle}>{totwRows[row].map(p => (
            <div key={p.id} style={playerCardStyle}>
              {p.isCaptain && <div style={captainBadge}>C</div>}
              <div style={pointBadge}>{p.displayPoints}</div>
              <PlayerPhoto photo={p.photo} width="55px" />
              <div style={{ color: '#fff', fontSize: '12px', fontWeight: 'bold', fontFamily: 'Montserrat', marginTop: '4px' }}>{p.name}</div>
            </div>
          ))}</div>
        ))}
      </div>

      {/* TABLE 2: CLINICALITY INDEX */}
      <div style={cardStyle}>
        <h3 style={titleStyle}>Clinicality Index</h3>
        <table style={tableStyle}>
          <thead><tr style={headerStyle}>
            <th style={thStyle}>Team / Manager</th><th style={thStyle}>xG</th><th style={thStyle}>G</th><th style={thStyle}>xA</th><th style={thStyle}>A</th><th style={thStyle}>Net</th>
          </tr></thead>
          <tbody>{standingsData.map(m => {
            const index = (m.goals + m.assists) - (m.xg + m.xa);
            return (<tr key={m.entry} style={rowStyle}>
              <td style={tdStyle}>{renderTeamCell(m.entry_name, m.player_name)}</td>
              <td style={tdStyle}>{m.xg.toFixed(1)}</td><td style={tdStyle}>{m.goals}</td><td style={tdStyle}>{m.xa.toFixed(1)}</td><td style={tdStyle}>{m.assists}</td>
              <td style={{...tdStyle, color: index >= 0 ? '#00ff87' : '#ff005a', fontWeight: 'bold', fontFamily: 'Orbitron'}}>{index.toFixed(1)}</td>
            </tr>);
          })}</tbody>
        </table>
      </div>

      {/* TABLE 3: TRANSFER POINT IMPACT */}
      <div style={cardStyle}>
        <h3 style={titleStyle}>Transfer Impact</h3>
        <table style={tableStyle}>
          <thead><tr style={headerStyle}>
            <th style={thStyle}>Manager</th><th style={thStyle}>IN</th><th style={thStyle}>OUT</th><th style={thStyle}>Diff</th>
          </tr></thead>
          <tbody>{transfers.slice(0, 5).map((t, i) => (
            <tr key={i} style={rowStyle}>
              <td style={tdStyle}><span style={{ fontWeight: '600' }}>{t.manager}</span></td>
              <td style={tdStyle}><div style={{display:'flex', flexDirection:'column', alignItems:'center'}}><PlayerPhoto photo={t.playerIn?.photo} width="32px" /><span style={{fontSize:'12px'}}>{t.playerIn?.name}</span></div></td>
              <td style={tdStyle}><div style={{display:'flex', flexDirection:'column', alignItems:'center', opacity:0.6}}><PlayerPhoto photo={t.playerOut?.photo} width="32px" /><span style={{fontSize:'12px'}}>{t.playerOut?.name}</span></div></td>
              <td style={{...tdStyle, fontWeight:'bold', color: t.diff >= 0 ? '#00ff87' : '#ff005a', fontFamily: 'Orbitron'}}>{t.diff > 0 ? `+${t.diff}` : t.diff}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      {/* TABLE 4: GW EFFICIENCY (PPM) */}
      <div style={cardStyle}>
        <h3 style={titleStyle}>GW Efficiency (PPM)</h3>
        <table style={tableStyle}>
          <thead><tr style={headerStyle}><th style={pStyle}>Team / Manager</th><th style={pStyle}>GW MVP</th><th style={pStyle}>GW LVP</th></tr></thead>
          <tbody>{standingsData.map(m => (
            <tr key={m.entry} style={rowStyle}>
              <td style={tdStyle}>{renderTeamCell(m.entry_name, m.player_name)}</td>
              <td style={tdStyle}>{m.bestGWValue ? <div style={{display:'flex', alignItems:'center', gap:'8px', justifyContent:'center'}}><PlayerPhoto photo={m.bestGWValue.photo} width="35px" /> <span style={{backgroundColor: '#00ff87', color: '#37003c', padding: '4px 8px', borderRadius: '4px', fontSize: '14px', fontWeight: 'bold', fontFamily: 'Orbitron'}}>{m.bestGWValue.gwPPM}</span></div> : '-'}</td>
              <td style={tdStyle}>{m.worstGWValue ? <div style={{display:'flex', alignItems:'center', gap:'8px', justifyContent:'center'}}><PlayerPhoto photo={m.worstGWValue.photo} width="35px" /> <span style={{backgroundColor: '#ff005a', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '14px', fontWeight: 'bold', fontFamily: 'Orbitron'}}>{m.worstGWValue.gwPPM}</span></div> : '-'}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      {/* TABLE 5: BONUS & DISCIPLINE */}
      <div style={{ ...cardStyle, marginBottom: '40px' }}>
        <h3 style={titleStyle}>Bonus & Discipline</h3>
        <table style={tableStyle}>
          <thead><tr style={headerStyle}><th style={pStyle}>Team / Manager</th><th style={pStyle}>Bonus</th><th style={pStyle}>Yellows</th><th style={pStyle}>Reds</th></tr></thead>
          <tbody>{standingsData.map(m => (
            <tr key={m.entry} style={rowStyle}>
              <td style={tdStyle}>{renderTeamCell(m.entry_name, m.player_name)}</td>
              <td style={{...tdStyle, color:'#00ff87', fontWeight:'bold', fontFamily: 'Orbitron'}}>{m.bonus}</td>
              <td style={tdStyle}>{m.yellows} 🟨</td>
              <td style={{...tdStyle, color:'#ff005a'}}>{m.reds} 🟥</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
};

// ==========================================
// CSS STYLES (INLINE)
// ==========================================
const containerStyle = { padding: '16px', fontFamily: '"Montserrat", sans-serif', maxWidth: '100%', margin: '0 auto', backgroundColor: '#f4f4f4', boxSizing: 'border-box' };
const mainHeaderStyle = { fontFamily: '"Orbitron", sans-serif', textAlign: 'center', color: '#37003c', margin: '20px 0 8px 0', textTransform: 'uppercase', letterSpacing: '2px' };
const cardStyle = { backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', overflow: 'hidden', marginBottom: '24px' };
const titleStyle = { padding: '16px', margin: '0', fontFamily: '"Orbitron", sans-serif', backgroundColor: '#f8f9fa', color: '#37003c', borderBottom: '1px solid #eee', fontSize: '18px', fontWeight: '600', textAlign: 'center' };
const tableStyle = { width: '100%', borderCollapse: 'collapse' };
const headerStyle = { backgroundColor: '#37003c', color: 'white', textAlign: 'center', textTransform: 'uppercase' };
const thStyle = { padding: '12px 4px', fontSize: '14px' };
const tdStyle = { padding: '12px 4px', borderBottom: '1px solid #eee', fontSize: '16px', textAlign: 'center', verticalAlign: 'middle' };
const rowStyle = { textAlign: 'center' };
const highlightCardStyle = { backgroundColor: '#fff', padding: '16px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', border: '1px solid #eee', textAlign: 'center', alignItems: 'center' };
const pStyle = { padding: '12px 4px' };
const msgStyle = { textAlign: 'center', padding: '100px', fontSize: '24px', fontFamily: 'Orbitron' };

// TOTW SPECIFIC STYLES
const pitchContainerStyle = { background: 'linear-gradient(to bottom, #008d4c, #005a32)', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '24px' };
const pitchRowStyle = { display: 'flex', justifyContent: 'center', gap: '10px' };
const playerCardStyle = { textAlign: 'center', width: '75px', position: 'relative' };
const pointBadge = { position: 'absolute', top: '-5px', right: '-5px', backgroundColor: '#00ff87', color: '#37003c', borderRadius: '50%', width: '22px', height: '22px', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', zIndex: 2, fontFamily: 'Orbitron' };
const captainBadge = { position: 'absolute', top: '-5px', left: '-5px', backgroundColor: '#37003c', color: '#fff', borderRadius: '3px', width: '18px', height: '18px', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 };

export default FplStandings;