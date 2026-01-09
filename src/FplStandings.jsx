import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const FplStandings = () => {
  const [standingsData, setStandingsData] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [totwRows, setTotwRows] = useState({ 1: [], 2: [], 3: [], 4: [] });
  const [loading, setLoading] = useState(true);
  const [leagueSize, setLeagueSize] = useState(0);

  useEffect(() => {
    const fetchAllData = async () => {
      try {
        const bootstrapRes = await fetch('http://localhost:5000/api/bootstrap-static');
        const bData = await bootstrapRes.json();
        const currentEvent = bData.events.find(e => e.is_current) || bData.events.filter(e => e.finished).slice(-1)[0];
        const activeGW = currentEvent.id;
        
        const pDetailsMap = {};
        bData.elements.forEach(p => {
          const cost = p.now_cost / 10;
          pDetailsMap[p.id] = {
            id: p.id,
            name: p.web_name,
            cost: cost,
            photo: p.code,
            pos: p.element_type
          };
        });

        const liveRes = await fetch(`http://localhost:5000/api/live-data/${activeGW}`);
        const liveData = await liveRes.json();
        const liveElements = liveData.elements || [];

        const standingsRes = await fetch('http://localhost:5000/api/league-standings');
        const sData = await standingsRes.json();
        const managers = sData.standings.results || [];
        setLeagueSize(managers.length);

        const leaguePlayerPool = new Map();
        const allTransferData = [];

        const enrichedStandings = await Promise.all(managers.map(async (m) => {
          // Transfers Logic
          try {
            const transRes = await fetch(`http://localhost:5000/api/manager-transfers/${m.entry}`);
            const transList = await transRes.json();
            if (Array.isArray(transList)) {
              transList.filter(t => t.event === activeGW).forEach(t => {
                const ptsIn = liveElements.find(el => el.id === t.element_in)?.stats.total_points || 0;
                const ptsOut = liveElements.find(el => el.id === t.element_out)?.stats.total_points || 0;
                allTransferData.push({ manager: m.player_name, playerIn: pDetailsMap[t.element_in], playerOut: pDetailsMap[t.element_out], diff: ptsIn - ptsOut });
              });
            }
          } catch (e) { console.warn("Transfers unavailable"); }

          // Picks & GW Metrics
          const picksRes = await fetch(`http://localhost:5000/api/manager-picks/${m.entry}/${activeGW}`);
          const pData = await picksRes.json();
          const starting11 = pData.picks?.slice(0, 11) || [];
          
          const leftCount = starting11.filter(p => liveElements.find(el => el.id === p.element)?.stats?.minutes === 0).length;

          // Process players for GW PPM
          const teamPPMStats = starting11.map(pick => {
            const live = liveElements.find(el => el.id === pick.element)?.stats || {};
            const player = pDetailsMap[pick.element];
            const gwPPM = player?.cost > 0 ? (live.total_points / player.cost).toFixed(2) : 0;
            return { ...player, gwPoints: live.total_points || 0, gwPPM: parseFloat(gwPPM) };
          }).filter(p => p.id);

          const teamStats = starting11.reduce((acc, pick) => {
            const s = liveElements.find(el => el.id === pick.element)?.stats || {};
            return {
              bonus: acc.bonus + (s.bonus || 0), yellows: acc.yellows + (s.yellow_cards || 0), reds: acc.reds + (s.red_cards || 0),
              xg: acc.xg + parseFloat(s.expected_goals || 0), xa: acc.xa + parseFloat(s.expected_assists || 0),
              goals: acc.goals + (s.goals_scored || 0), assists: acc.assists + (s.assists || 0)
            };
          }, { bonus: 0, yellows: 0, reds: 0, xg: 0, xa: 0, goals: 0, assists: 0 });

          starting11.forEach(pick => {
            const live = liveElements.find(el => el.id === pick.element)?.stats || {};
            if (pDetailsMap[pick.element]) {
              if (!leaguePlayerPool.has(pick.element) || live.total_points > leaguePlayerPool.get(pick.element).gwPoints) {
                leaguePlayerPool.set(pick.element, { ...pDetailsMap[pick.element], gwPoints: live.total_points || 0, ownedCount: (leaguePlayerPool.get(pick.element)?.ownedCount || 0) + 1 });
              } else {
                const existing = leaguePlayerPool.get(pick.element);
                leaguePlayerPool.set(pick.element, { ...existing, ownedCount: existing.ownedCount + 1 });
              }
            }
          });

          const histRes = await fetch(`http://localhost:5000/api/manager-history/${m.entry}`);
          const history = await histRes.json();

          return { 
            ...m, ...teamStats, leftCount, 
            bestGWValue: teamPPMStats.sort((a,b)=>b.gwPPM-a.gwPPM)[0], 
            worstGWValue: teamPPMStats.sort((a,b)=>a.gwPPM-b.gwPPM)[0], 
            history: Array.isArray(history) ? history.slice(-5) : [] 
          };
        }));

        // Formation Logic
        const poolArray = Array.from(leaguePlayerPool.values()).sort((a, b) => b.gwPoints - a.gwPoints);
        let selected11 = []; let counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
        const gk = poolArray.find(p => p.pos === 1); if (gk) { selected11.push(gk); counts[1]++; }
        const defs = poolArray.filter(p => p.pos === 2).slice(0, 3); defs.forEach(p => { selected11.push(p); counts[2]++; });
        const mids = poolArray.filter(p => p.pos === 3).slice(0, 3); mids.forEach(p => { selected11.push(p); counts[3]++; });
        const fwd = poolArray.filter(p => p.pos === 4).slice(0, 1); if (fwd) { selected11.push(fwd[0]); counts[4]++; }

        const remaining = poolArray.filter(p => !selected11.find(s => s.id === p.id));
        for (const player of remaining) {
          if (selected11.length >= 11) break;
          const canAdd = (player.pos === 2 && counts[2] < 5) || (player.pos === 3 && counts[3] < 5) || (player.pos === 4 && counts[4] < 3);
          if (canAdd) { selected11.push(player); counts[player.pos]++; }
        }
        const topScore = Math.max(...selected11.map(p => p.gwPoints));
        const finalPlayers = selected11.map(p => ({ ...p, isCaptain: p.gwPoints === topScore, displayPoints: p.gwPoints === topScore ? p.gwPoints * 2 : p.gwPoints }));
        setTotwRows({ 1: finalPlayers.filter(p => p.pos === 1), 2: finalPlayers.filter(p => p.pos === 2), 3: finalPlayers.filter(p => p.pos === 3), 4: finalPlayers.filter(p => p.pos === 4) });

        // Rank Chart Data
        const last5GWs = enrichedStandings[0]?.history.map(h => h.event) || [];
        setChartData(last5GWs.map((gwId, idx) => {
          const entry = { gameweek: `GW ${gwId}` };
          const sorted = [...enrichedStandings].sort((a, b) => (b.history[idx]?.total_points || 0) - (a.history[idx]?.total_points || 0));
          enrichedStandings.forEach(m => { entry[m.entry_name] = sorted.findIndex(s => s.entry === m.entry) + 1; });
          return entry;
        }));

        setStandingsData(enrichedStandings);
        setTransfers(allTransferData.sort((a, b) => b.diff - a.diff));
        setLoading(false);
      } catch (err) { console.error(err); setLoading(false); }
    };
    fetchAllData();
  }, []);

  const PlayerPhoto = ({ photo, width }) => (
    <img 
      src={`https://resources.premierleague.com/premierleague25/photos/players/110x140/${photo}.png`} 
      style={{ width, borderRadius: '4px' }} 
      alt="" 
      onError={(e) => {
        const currentSrc = e.target.src;
        if (currentSrc.includes('premierleague25')) {
          e.target.src = `https://resources.premierleague.com/premierleague/photos/players/110x140/p${photo}.png`;
        } else {
          e.target.onerror = null;
          e.target.src = "https://resources.premierleague.com/premierleague/photos/players/110x140/Photo-Missing.png";
        }
      }}
    />
  );

  if (loading) return <div style={msgStyle}>Switching to GW Value Metrics...</div>;

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '1200px', margin: '0 auto', backgroundColor: '#f4f4f4' }}>
      <h1 style={{ textAlign: 'center', color: '#37003c', marginBottom: '30px' }}>FPL Friends Tracker Pro</h1>

      {/* 1. TOTW Pitch View */}
      <div style={pitchContainerStyle}>
        <h3 style={{ color: '#fff', textAlign: 'center', margin: '0 0 20px 0' }}>Mini-League Team of the Week</h3>
        {[1, 2, 3, 4].map(row => (
          <div key={row} style={pitchRowStyle}>
            {totwRows[row].map(p => (
              <div key={p.id} style={playerCardStyle}>
                {p.isCaptain && <div style={captainBadge}>C</div>}
                <div style={pointBadge}>{p.displayPoints}</div>
                <PlayerPhoto photo={p.photo} width="65px" />
                <div style={{ color: '#fff', fontSize: '0.8em', fontWeight: 'bold', marginTop: '4px' }}>{p.name}</div>
                <div style={{ color: '#00ff87', fontSize: '0.65em' }}>Owned: {p.ownedCount}/{leagueSize}</div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* 2. League Standings */}
      <div style={{ ...cardStyle, marginTop: '40px' }}>
        <h3 style={titleStyle}>League Standings</h3>
        <table style={tableStyle}>
          <thead><tr style={headerStyle}><th style={pStyle}>Rank</th><th style={pStyle}>Team</th><th style={pStyle}>Left</th><th style={pStyle}>GW Pts</th><th style={pStyle}>Total</th></tr></thead>
          <tbody>{standingsData.map(m => (
            <tr key={m.id} style={rowStyle}>
              <td style={pStyle}>{m.rank}</td>
              <td style={pStyle}><strong>{m.entry_name}</strong></td>
              <td style={pStyle}>{m.leftCount} / 11</td>
              <td style={pStyle}>{m.event_total}</td>
              <td style={{...pStyle, fontWeight:'bold'}}>{m.total}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      {/* 3. Clinicality Index */}
      <div style={{ ...cardStyle, marginTop: '30px' }}>
        <h3 style={titleStyle}>Clinicality Index (GW xG vs Goals)</h3>
        <table style={tableStyle}>
          <thead><tr style={headerStyle}><th style={pStyle}>Team</th><th style={pStyle}>xG</th><th style={pStyle}>G</th><th style={pStyle}>xA</th><th style={pStyle}>A</th><th style={pStyle}>Index</th></tr></thead>
          <tbody>{standingsData.map(m => {
            const index = (m.goals + m.assists) - (m.xg + m.xa);
            return (
              <tr key={m.entry} style={rowStyle}><td><strong>{m.entry_name}</strong></td><td>{m.xg.toFixed(2)}</td><td>{m.goals}</td><td>{m.xa.toFixed(2)}</td><td>{m.assists}</td><td style={{color: index >= 0 ? '#00ff87' : '#ff005a', fontWeight: 'bold'}}>{index.toFixed(2)}</td></tr>
            );
          })}</tbody>
        </table>
      </div>

      {/* 4. GW Transfer Impact */}
      <div style={{ ...cardStyle, marginTop: '30px' }}>
        <h3 style={titleStyle}>GW Transfer Point Impact</h3>
        <table style={tableStyle}>
          <thead><tr style={headerStyle}><th style={pStyle}>Manager</th><th style={pStyle}>IN</th><th style={pStyle}>OUT</th><th style={pStyle}>Diff</th></tr></thead>
          <tbody>{transfers.map((t, i) => (
            <tr key={i} style={rowStyle}>
              <td>{t.manager}</td>
              <td><div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><PlayerPhoto photo={t.playerIn?.photo} width="35px" /> {t.playerIn?.name}</div></td>
              <td><div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.7 }}><PlayerPhoto photo={t.playerOut?.photo} width="35px" /> {t.playerOut?.name}</div></td>
              <td style={{fontWeight:'bold', color: t.diff >= 0 ? '#00ff87' : '#ff005a'}}>{t.diff > 0 ? `+${t.diff}` : t.diff}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      {/* 5. Bonus & Discipline */}
      <div style={{ ...cardStyle, marginTop: '30px' }}>
        <h3 style={titleStyle}>Bonus Kings & Discipline (GW)</h3>
        <table style={tableStyle}>
          <thead><tr style={headerStyle}><th style={pStyle}>Team</th><th style={pStyle}>GW Bonus</th><th style={pStyle}>Yellows</th><th style={pStyle}>Reds</th></tr></thead>
          <tbody>{standingsData.map(m => (
            <tr key={m.entry} style={rowStyle}>
              <td style={pStyle}><strong>{m.entry_name}</strong></td>
              <td style={{color:'#00ff87', fontWeight:'bold'}}>{m.bonus}</td>
              <td style={pStyle}>{m.yellows} 🟨</td>
              <td style={{color:'#ff005a'}}>{m.reds} 🟥</td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      {/* 6. GW Value Analysis */}
      <div style={{ ...cardStyle, marginTop: '30px' }}>
        <h3 style={titleStyle}>Gameweek Efficiency (GW PPM)</h3>
        <table style={tableStyle}>
          <thead><tr style={headerStyle}><th style={pStyle}>Team</th><th style={pStyle}>MVP (Elite GW Value)</th><th style={pStyle}>LVP (Low GW Value)</th></tr></thead>
          <tbody>{standingsData.map(m => (
            <tr key={m.entry} style={rowStyle}>
              <td style={pStyle}><strong>{m.entry_name}</strong></td>
              <td style={pStyle}>{m.bestGWValue ? <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><PlayerPhoto photo={m.bestGWValue.photo} width="40px" /> <div>{m.bestGWValue.name}<br/><span style={badgeStyle}>{m.bestGWValue.gwPPM} GW PPM</span></div></div> : 'N/A'}</td>
              <td style={pStyle}>{m.worstGWValue ? <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><PlayerPhoto photo={m.worstGWValue.photo} width="40px" /> <div>{m.worstGWValue.name}<br/><span style={{...badgeStyle, backgroundColor:'#ff005a'}}>{m.worstGWValue.gwPPM} GW PPM</span></div></div> : 'N/A'}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      {/* 7. Rank Chart */}
      <div style={{ ...cardStyle, marginTop: '40px', padding: '20px' }}>
        <h3 style={{ color: '#37003c', textAlign: 'center', marginBottom: '20px' }}>League Position History</h3>
        <div style={{ height: '350px' }}>
          <ResponsiveContainer>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="gameweek" />
              <YAxis reversed={true} domain={[1, leagueSize]} ticks={Array.from({length: leagueSize}, (_, i) => i + 1)} />
              <Tooltip />
              <Legend />
              {Object.keys(chartData[0] || {}).filter(k => k !== 'gameweek').map((name, i) => (
                <Line key={name} dataKey={name} stroke={`hsl(${(i * 137) % 360}, 70%, 50%)`} strokeWidth={3} dot={{ r: 4 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

// Styles
const pitchContainerStyle = { background: 'linear-gradient(to bottom, #008d4c 0%, #005a32 100%)', borderRadius: '15px', padding: '30px 20px', display: 'flex', flexDirection: 'column', gap: '20px' };
const pitchRowStyle = { display: 'flex', justifyContent: 'center', gap: '15px' };
const playerCardStyle = { textAlign: 'center', width: '100px', position: 'relative' };
const pointBadge = { position: 'absolute', top: '0', right: '0', backgroundColor: '#00ff87', color: '#37003c', borderRadius: '50%', width: '25px', height: '25px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75em', fontWeight: 'bold', zIndex: 2 };
const captainBadge = { position: 'absolute', top: '0', left: '0', backgroundColor: '#37003c', color: '#fff', borderRadius: '3px', width: '20px', height: '20px', fontSize: '0.65em', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const cardStyle = { backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', overflow: 'hidden' };
const titleStyle = { padding: '12px', margin: '0', backgroundColor: '#f8f9fa', color: '#37003c', borderBottom: '1px solid #eee' };
const tableStyle = { width: '100%', borderCollapse: 'collapse' };
const headerStyle = { backgroundColor: '#37003c', color: 'white', textAlign: 'left' };
const rowStyle = { borderBottom: '1px solid #eee' };
const pStyle = { padding: '12px' };
const msgStyle = { textAlign: 'center', padding: '100px', fontSize: '1.2em' };
const badgeStyle = { backgroundColor: '#00ff87', color: '#37003c', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7em', fontWeight: 'bold' };

export default FplStandings;