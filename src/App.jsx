import React, { useState, useEffect, useMemo } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  ScatterChart, Scatter, ZAxis, ReferenceLine, Cell, LabelList
} from 'recharts';
import './App.css'; 

// ==========================================
// MAIN APP COMPONENT
// ==========================================
function App() {
  const [activeTab, setActiveTab] = useState('league');
  const [standingsData, setStandingsData] = useState([]);
  const [gwGlobalStats, setGwGlobalStats] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [totwRows, setTotwRows] = useState({ 1: [], 2: [], 3: [], 4: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null); 
  const [leagueSize, setLeagueSize] = useState(10);
  const [leagueName, setLeagueName] = useState("");

  useEffect(() => {
    const fetchAllData = async () => {
      try {
        const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

        // 1. Fetch Bootstrap (Global Info)
        const bootstrapRes = await fetch(`${API_BASE_URL}/api/bootstrap-static`);
        if (!bootstrapRes.ok) throw new Error("Server is sleeping or unreachable. Please refresh.");
        const bData = await bootstrapRes.json();
        const activeGW = bData?.events?.find(e => e.is_current)?.id || 1;
        
        // Map Teams (id -> name)
        const teamMap = {};
        bData?.teams?.forEach(t => {
            teamMap[t.id] = { name: t.name, short: t.short_name };
        });

        // Map Players
        const pMap = {};
        bData?.elements?.forEach(p => {
          pMap[p.id] = { 
            id: p.id, 
            name: p.web_name, 
            teamId: p.team,
            team: teamMap[p.team]?.short || "UNK",
            team_full: teamMap[p.team]?.name || "Unknown",
            cost: p.now_cost / 10, 
            photo: p.code, 
            pos: p.element_type,
            transfers_in: p.transfers_in_event,
            transfers_out: p.transfers_out_event,
            selected_by: parseFloat(p.selected_by_percent)
          };
        });

        // 2. Fetch Live Stats (Global Stats for this GW)
        const liveRes = await fetch(`${API_BASE_URL}/api/live-data/${activeGW}`);
        const liveData = await liveRes.json();
        const liveEl = liveData?.elements || [];

        // --- GLOBAL STATS AGGREGATION ---
        let totalGoals = 0;
        let totalAssists = 0;
        let totalRedCards = 0;
        let totalPoints = 0;
        
        // Team Aggregation Container
        const teamPerf = {}; 
        // Initialize all teams
        bData.teams.forEach(t => {
            teamPerf[t.id] = { 
                name: t.name, 
                short: t.short_name, 
                goals: 0, 
                assists: 0, 
                xg: 0, 
                conceded: 0, 
                total_minutes: 0, // Track if ANYONE played
                clean_sheet: false, 
                defScore: 0 // (Defcon + Bonus) for GK/DEF
            };
        });

        const allPlayers = liveEl.map(el => {
            const meta = pMap[el.id] || {};
            const stats = el.stats;
            
            // 1. Defcon Calculation
            const pos = meta.pos || 0;
            let defPts = 0;
            if (stats.clean_sheets) defPts += (pos <= 2 ? 4 : pos === 3 ? 1 : 0);
            if (pos <= 2 && stats.goals_conceded >= 2) defPts -= Math.floor(stats.goals_conceded / 2);
            if (stats.saves) defPts += Math.floor(stats.saves / 3);
            if (stats.penalties_saved) defPts += (stats.penalties_saved * 5);
            if (stats.own_goals) defPts += (stats.own_goals * -2);

            // 2. Global Aggregates
            totalGoals += stats.goals_scored;
            totalAssists += stats.assists;
            totalRedCards += stats.red_cards;
            totalPoints += stats.total_points;

            // 3. Team Aggregation
            if(meta.teamId && teamPerf[meta.teamId]) {
                const t = teamPerf[meta.teamId];
                t.goals += stats.goals_scored;
                t.assists += stats.assists;
                t.xg += parseFloat(stats.expected_goals || 0);
                t.total_minutes += stats.minutes;
                
                // Conceded: Sum from Goalkeepers (Pos 1) only to avoid duplicates
                if(pos === 1) {
                    t.conceded += stats.goals_conceded;
                }

                // Best Defense Logic: Sum Defcon + Bonus for GK (1) and DEF (2)
                if(pos <= 2) {
                    t.defScore += (defPts + stats.bonus);
                }
            }

            return {
                ...meta,
                points: stats.total_points,
                goals: stats.goals_scored,
                minutes: stats.minutes,
                transfers_in: meta.transfers_in,
                transfers_out: meta.transfers_out,
            };
        });

        // 4. Calculate Team Winners
        const teamsArray = Object.values(teamPerf);
        
        // Clean Sheet Logic: Team played minutes AND Goalkeeper conceded 0
        teamsArray.forEach(t => {
            if(t.total_minutes > 0 && t.conceded === 0) {
                t.clean_sheet = true;
            }
        });

        // Total League Clean Sheets
        const totalCleanSheets = teamsArray.filter(t => t.clean_sheet).length;

        // Best Attack: Goals + Assists
        const bestAttack = teamsArray.sort((a,b) => (b.goals + b.assists) - (a.goals + a.assists))[0];
        
        // Best Defense: Defcon + Bonus
        const bestDefense = teamsArray.sort((a,b) => b.defScore - a.defScore)[0];

        // 5. Sort Player Lists
        const mostIn = [...allPlayers].sort((a, b) => b.transfers_in - a.transfers_in).slice(0, 5);
        const mostOut = [...allPlayers].sort((a, b) => b.transfers_out - a.transfers_out).slice(0, 5);
        
        // Ownership Logic: MUST have played (minutes > 0)
        const winnersLowOwn = [...allPlayers].filter(p => p.minutes > 0 && p.selected_by < 10).sort((a,b) => b.points - a.points).slice(0, 3);
        const dudsHighOwn = [...allPlayers].filter(p => p.minutes > 0 && p.selected_by > 15).sort((a,b) => a.points - b.points).slice(0, 3);

        // 6. Scatter Data (TEAM Based)
        const scatterData = teamsArray.map(t => ({
            name: t.short,
            full_name: t.name,
            x: parseFloat(t.xg.toFixed(2)),
            y: t.goals,
            z: 1 // Bubble size uniform
        }));

        setGwGlobalStats({
            summary: { totalGoals, totalAssists, totalCleanSheets, totalRedCards, totalPoints },
            bestAttack,
            bestDefense,
            mostIn,
            mostOut,
            winnersLowOwn,
            dudsHighOwn,
            scatterData
        });

        // --- EXISTING LEAGUE LOGIC ---
        const standingsRes = await fetch(`${API_BASE_URL}/api/league-standings`);
        const sData = await standingsRes.json();
        setLeagueName(sData?.league?.name || "League");
        const managers = sData?.standings?.results || [];
        setLeagueSize(Math.max(managers.length, 5));
        const leaguePlayerPool = new Map();
        const allTransfers = [];

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
                allTransfers.push({ manager: m.player_name, teamName: m.entry_name || "Team", playerIn: pMap[t.element_in], playerOut: pMap[t.element_out], diff: pIn - pOut });
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
            return { ...player, gwPoints: live.total_points || 0, gwPPM: player?.cost > 0 ? ((live.total_points || 0) / player.cost).toFixed(1) : 0 };
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
            const playerInfo = pMap[p.element] || {};
            const pos = playerInfo.pos || 0; 
            const goalPts = (s.goals_scored || 0) * (pos <= 2 ? 6 : pos === 3 ? 5 : 4);
            const assistPts = (s.assists || 0) * 3;
            const minPts = (s.minutes || 0) >= 60 ? 2 : ((s.minutes || 0) > 0 ? 1 : 0);
            const cardPts = ((s.yellow_cards || 0) * -1) + ((s.red_cards || 0) * -3);
            let defPts = 0;
            if (s.clean_sheets) defPts += (pos <= 2 ? 4 : pos === 3 ? 1 : 0);
            if (pos <= 2 && s.goals_conceded >= 2) defPts -= Math.floor(s.goals_conceded / 2);
            if (s.saves) defPts += Math.floor(s.saves / 3);
            if (s.penalties_saved) defPts += (s.penalties_saved * 5);
            if (s.own_goals) defPts += (s.own_goals * -2);

            return {
              xg: acc.xg + parseFloat(s.expected_goals || 0),
              goals: acc.goals + (s.goals_scored || 0),
              xa: acc.xa + parseFloat(s.expected_assists || 0),
              assists: acc.assists + (s.assists || 0),
              ptsGoals: acc.ptsGoals + goalPts,
              ptsAssists: acc.ptsAssists + assistPts,
              ptsBonus: acc.ptsBonus + (s.bonus || 0),
              ptsCards: acc.ptsCards + cardPts,
              ptsDefcon: acc.ptsDefcon + defPts,
              yellows: acc.yellows + (s.yellow_cards || 0),
              reds: acc.reds + (s.red_cards || 0)
            };
          }, { xg: 0, goals: 0, xa: 0, assists: 0, ptsGoals: 0, ptsAssists: 0, ptsBonus: 0, ptsCards: 0, ptsDefcon: 0, yellows: 0, reds: 0 });

          const rawHistory = Array.isArray(history) ? history : (history.current || []);
          return { ...m, ...stats, leftCount: left, benchPoints: bPts, activeChip, bestGWValue: ppmStats.sort((a,b)=>b.gwPPM-a.gwPPM)[0], worstGWValue: ppmStats.sort((a,b)=>a.gwPPM-b.gwPPM)[0], rawHistory: rawHistory };
        }));

        const longestHistoryManager = enriched.reduce((prev, current) => (prev.rawHistory.length > current.rawHistory.length) ? prev : current, { rawHistory: [] });
        const relevantHistory = longestHistoryManager.rawHistory.slice(-5); 
        const finalChartData = relevantHistory.map((hItem) => {
           const gwId = hItem.event;
           const dataPoint = { gameweek: `GW${gwId}` };
           const managersAtGw = enriched.map(m => {
              const historyEntry = m.rawHistory.find(h => h.event === gwId);
              return { name: m.entry_name, total_points: historyEntry ? historyEntry.total_points : -1 };
           });
           managersAtGw.sort((a, b) => b.total_points - a.total_points);
           managersAtGw.forEach((m, rankIndex) => { if (m.total_points > -1) dataPoint[m.name] = rankIndex + 1; });
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
          if ((p.pos === 2 && c[2] < 5) || (p.pos === 3 && c[3] < 5) || (p.pos === 4 && c[4] < 3)) { s11totw.push(p); c[p.pos]++; } 
        }
        const top = Math.max(...s11totw.map(p => p.gwPoints));
        const finalP = s11totw.map(p => ({ ...p, isCaptain: p.gwPoints === top, displayPoints: p.gwPoints }));
        setTotwRows({ 1: finalP.filter(p => p.pos === 1), 2: finalP.filter(p => p.pos === 2), 3: finalP.filter(p => p.pos === 3), 4: finalP.filter(p => p.pos === 4) });
        setChartData(finalChartData); setStandingsData(enriched); setTransfers(allTransfers.sort((a, b) => b.diff - a.diff)); setLoading(false);
      } catch (err) { console.error(err); setError(err.message); setLoading(false); }
    };
    fetchAllData();
  }, []);

  const renderTeamCell = (team, manager) => (
    <div className="cell-content"><span className="team-name">{team || "Unknown"}</span><span className="manager-name">{manager || "Manager"}</span></div>
  );
  const PlayerPhoto = ({ photo }) => (
    <img src={`https://resources.premierleague.com/premierleague25/photos/players/110x140/${photo}.png`} className="player-photo" alt="" onError={(e) => { e.target.onerror = null; e.target.src = `https://resources.premierleague.com/premierleague/photos/players/110x140/p${photo}.png`; }} />
  );
  const getResultBadge = (pts) => {
      if (pts >= 10) return <span className="result-badge res-haul">HAUL</span>;
      if (pts <= 2) return <span className="result-badge res-flop">FLOP</span>;
      return <span className="result-badge res-ok">OK</span>;
  };
  const renderPlayerList = (list) => list.map(p => (
    <div key={p.id} className="player-list-item">
        <div className="player-info">
            <PlayerPhoto photo={p.photo} />
            <div className="player-meta"><span className="meta-name">{p.name}</span><span className="meta-team">{p.team} - {p.pos === 1 ? 'GK' : p.pos === 2 ? 'DEF' : p.pos === 3 ? 'MID' : 'FWD'}</span></div>
        </div>
        <div className="stat-box"><div className="stat-val">{p.points}</div><div className="stat-label">PTS</div></div>
        <div className="stat-box"><div className="stat-val">{p.selected_by}%</div><div className="stat-label">OWN</div></div>
        {getResultBadge(p.points)}
    </div>
  ));

  if (loading) return <div className="loading-screen">INITIALIZING FPL TRACKER...</div>;
  if (error) return <div className="loading-screen" style={{color: '#ff005a'}}>Error: {error}</div>;

  return (
    <div className="app-container">
      <header className="main-header">
        <h1>FPL TRACKER</h1>
        <div className="league-meta"><p className="league-label">FPL League</p><h2 className="league-name">{leagueName}</h2></div>
      </header>
      <div className="tab-container">
        <button className={`tab-btn ${activeTab === 'league' ? 'active' : ''}`} onClick={() => setActiveTab('league')}>League Report</button>
        <button className={`tab-btn ${activeTab === 'gw' ? 'active' : ''}`} onClick={() => setActiveTab('gw')}>GW Report</button>
      </div>

      {activeTab === 'league' && (
        <>
            <section className="dashboard-section">
                <h3 className="section-title">League Standings</h3>
                <div className="table-wrapper">
                <table className="data-table">
                    <thead><tr><th style={{width:'8%'}}>Rank</th><th className="col-team text-left">Team / Manager</th><th style={{width:'15%'}}>Chip</th><th className="col-stat">GW</th><th className="col-stat">Total</th></tr></thead>
                    <tbody>{standingsData.map(m => (<tr key={m.id}><td>{m.rank}</td><td className="text-left">{renderTeamCell(m.entry_name, m.player_name)}</td><td><span className={m.activeChip !== 'None' ? 'chip-badge' : 'chip-none'}>{(m.activeChip || "NONE").toUpperCase().slice(0,4)}</span></td><td className="val-neutral">{m.event_total}</td><td className="val-pos">{m.total}</td></tr>))}</tbody>
                </table>
                </div>
            </section>
            <section className="dashboard-section"><h3 className="section-title">GW Points Breakdown</h3><div className="table-wrapper"><table className="data-table"><thead><tr><th className="col-team text-left">Team</th><th className="col-stat">G</th><th className="col-stat">A</th><th className="col-stat">B</th><th className="col-stat">DC</th><th className="col-stat">Cards</th></tr></thead><tbody>{standingsData.map(m => (<tr key={m.entry}><td className="text-left">{renderTeamCell(m.entry_name, m.player_name)}</td><td className="val-pos">{m.ptsGoals}</td><td className="val-pos">{m.ptsAssists}</td><td className="val-neutral">{m.ptsBonus}</td><td style={{color: m.ptsDefcon >= 0 ? '#00ff87' : '#ff005a'}}>{m.ptsDefcon}</td><td className="val-neg">{m.ptsCards}</td></tr>))}</tbody></table></div></section>
            <section className="dashboard-section"><h3 className="section-title">Transfer Impact</h3><div className="table-wrapper"><table className="data-table"><thead><tr><th className="col-team" style={{textAlign: 'center'}}>Team</th><th className="col-wide-stat" style={{textAlign: 'center'}}>IN</th><th className="col-wide-stat" style={{textAlign: 'center'}}>OUT</th><th className="col-stat" style={{textAlign: 'center'}}>Diff</th></tr></thead><tbody>{transfers.slice(0, 5).map((t, i) => (<tr key={i}><td style={{textAlign: 'center', paddingLeft: 0}}><div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}><span style={{color: '#ffffff', fontWeight: '700', fontSize: '0.75rem'}}>{t.teamName}</span><span style={{color: '#a0a0a0', fontSize: '0.65rem', marginTop: '2px'}}>{t.manager}</span></div></td><td><div style={{display:'flex', flexDirection:'column', alignItems:'center'}}><PlayerPhoto photo={t.playerIn?.photo} width="32px" /><span style={{fontSize:'0.65rem'}}>{t.playerIn?.name}</span></div></td><td><div style={{display:'flex', flexDirection:'column', alignItems:'center', opacity:0.6}}><PlayerPhoto photo={t.playerOut?.photo} width="32px" /><span style={{fontSize:'0.65rem'}}>{t.playerOut?.name}</span></div></td><td className={t.diff >= 0 ? 'val-pos' : 'val-neg'}>{t.diff > 0 ? `+${t.diff}` : t.diff}</td></tr>))}</tbody></table></div></section>
            <section className="dashboard-section" style={{background: 'transparent', border: 'none'}}><h3 className="section-title" style={{borderRadius: '8px 8px 0 0'}}>Rank History</h3><div className="chart-wrapper"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 40 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" /><XAxis dataKey="gameweek" tick={{fontSize: 12, fill: '#a0a0a0'}} stroke="#555" dy={10} /><YAxis reversed={true} domain={[1, leagueSize]} ticks={Array.from({length: leagueSize}, (_, i) => i + 1)} tick={{fontSize: 12, fill: '#a0a0a0'}} width={30} stroke="#555" /><Tooltip contentStyle={{ backgroundColor: '#141414', borderColor: '#333', color: '#fff' }} /><Legend align="center" verticalAlign="bottom" iconType="circle" iconSize={10} wrapperStyle={{ paddingTop: '10px', fontSize: '11px', width: '100%', left: 0, bottom: 0, color: '#a0a0a0' }} />{Object.keys(chartData[0] || {}).filter(k => k !== 'gameweek').map((name, i) => (<Line key={name} dataKey={name} stroke={`hsl(${(i * 137) % 360}, 50%, 60%)`} strokeWidth={3} dot={{ r: 4 }} />))}</LineChart></ResponsiveContainer></div></section>
            <section className="dashboard-section"><h3 className="section-title">GW Efficiency (PPM)</h3><div className="table-wrapper"><table className="data-table"><thead><tr><th className="col-team" style={{textAlign: 'center'}}>Team</th><th className="col-wide-stat" style={{textAlign: 'center'}}>GW MVP</th><th className="col-wide-stat" style={{textAlign: 'center'}}>GW LVP</th></tr></thead><tbody>{standingsData.map(m => (<tr key={m.entry}><td style={{textAlign: 'center', paddingLeft: 0}}>{renderTeamCell(m.entry_name, m.player_name)}</td><td style={{textAlign: 'center'}}>{m.bestGWValue ? (<div style={{display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'2px'}}><PlayerPhoto photo={m.bestGWValue.photo} width="32px" /><span style={{fontSize:'0.65rem', fontWeight:'600'}}>{m.bestGWValue.name}</span><span className="val-pos">{m.bestGWValue.gwPPM}</span></div>) : '-'}</td><td style={{textAlign: 'center'}}>{m.worstGWValue ? (<div style={{display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'2px', opacity:0.7}}><PlayerPhoto photo={m.worstGWValue.photo} width="32px" /><span style={{fontSize:'0.65rem', fontWeight:'600'}}>{m.worstGWValue.name}</span><span className="val-neg">{m.worstGWValue.gwPPM}</span></div>) : '-'}</td></tr>))}</tbody></table></div></section>
            <section className="dashboard-section"><h3 className="section-title">League Team of the Week</h3><div className="totw-pitch">{[1, 2, 3, 4].map(row => (<div key={row} className="pitch-row">{totwRows[row].map(p => (<div key={p.id} className="player-card"><div className="points-badge">{p.displayPoints}</div><PlayerPhoto photo={p.photo} /><div className="player-name">{p.name}</div></div>))}</div>))}</div></section>
        </>
      )}

      {activeTab === 'gw' && gwGlobalStats && (
        <>
           {/* 1. GW SUMMARY BANNER */}
           <div className="gw-summary-banner">
              <div className="summary-card"><div className="summary-value">{gwGlobalStats.summary.totalGoals}</div><div className="summary-sub">Goals</div></div>
              <div className="summary-card"><div className="summary-value">{gwGlobalStats.summary.totalAssists}</div><div className="summary-sub">Assists</div></div>
              <div className="summary-card"><div className="summary-value">{gwGlobalStats.summary.totalCleanSheets}</div><div className="summary-sub">Clean Sheets</div></div>
              <div className="summary-card"><div className="summary-value" style={{color: '#ff005a'}}>{gwGlobalStats.summary.totalRedCards}</div><div className="summary-sub">Red Cards</div></div>
              <div className="summary-card"><div className="summary-value">{gwGlobalStats.summary.totalPoints.toLocaleString()}</div><div className="summary-sub">Total Points</div></div>
           </div>

           {/* 2. TEAM OF THE WEEK (Best Attack/Def) */}
           <div className="transfer-market-grid">
               <div className="summary-card">
                   <div className="summary-sub" style={{color: '#00ff87'}}>BEST ATTACK</div>
                   <div className="summary-value">{gwGlobalStats.bestAttack.name}</div>
                   <span className="summary-badge badge-green">{gwGlobalStats.bestAttack.goals} Goals, {gwGlobalStats.bestAttack.assists} Assists</span>
               </div>
               <div className="summary-card">
                   <div className="summary-sub" style={{color: '#a0a0a0'}}>BEST DEFENSE</div>
                   <div className="summary-value">{gwGlobalStats.bestDefense.name}</div>
                   <span className="summary-badge" style={{background: '#333', color: '#fff'}}>Score: {gwGlobalStats.bestDefense.defScore} (Defcon+Bonus)</span>
               </div>
           </div>

           {/* 3. TRANSFER MARKET */}
           <h3 className="section-title">Transfer Market (Volume)</h3>
           <div className="transfer-market-grid">
               <div><div className="market-col-header market-in">MOST IN</div>{renderPlayerList(gwGlobalStats.mostIn)}</div>
               <div><div className="market-col-header market-out">MOST OUT</div>{renderPlayerList(gwGlobalStats.mostOut)}</div>
           </div>

           {/* 4. OWNERSHIP GEMS */}
           <h3 className="section-title">Ownership Impact (Played Only)</h3>
           <div className="transfer-market-grid">
               <div><div className="market-col-header" style={{borderColor: '#00ff87', color: '#00ff87'}}>LOW OWNERSHIP WINNERS (&lt;10%)</div>{renderPlayerList(gwGlobalStats.winnersLowOwn)}</div>
               <div><div className="market-col-header" style={{borderColor: '#ff005a', color: '#ff005a'}}>HIGH OWNERSHIP DUDS (&gt;15%)</div>{renderPlayerList(gwGlobalStats.dudsHighOwn)}</div>
           </div>

           {/* 5. TEAM CLINICALITY SCATTER CHART */}
           <h3 className="section-title">Team Clinicality (Goals vs xG)</h3>
           <div className="scatter-container">
               <div className="chart-annotation note-clinical">CLINICAL<br/>(Overperforming)</div>
               <div className="chart-annotation note-wasteful">WASTEFUL<br/>(Underperforming)</div>
               <ResponsiveContainer width="100%" height="100%">
                   <ScatterChart margin={{ top: 20, right: 10, bottom: 20, left: 0 }}>
                       <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                       <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 7, y: 7 }]} stroke="#666" strokeDasharray="5 5" strokeWidth={1}/>
                       <XAxis type="number" dataKey="x" name="xG" domain={[0, 'auto']} tickCount={8} stroke="#888" label={{ value: 'Expected Goals (xG)', position: 'insideBottom', offset: -10, fill: '#888', fontSize: 12 }} />
                       <YAxis type="number" dataKey="y" name="Goals" domain={[0, 'auto']} tickCount={8} width={30} stroke="#888" label={{ value: 'Actual Goals', angle: -90, position: 'insideLeft', offset: 10, fill: '#888', fontSize: 12 }} />
                       <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }) => {
                           if (active && payload && payload.length) {
                               const data = payload[0].payload;
                               return (
                                   <div style={{ background: '#141414', border: '1px solid #333', padding: '10px', borderRadius: '4px', zIndex: 100 }}>
                                       <div style={{color:'#fff', fontWeight:'700'}}>{data.full_name}</div>
                                       <div style={{marginTop:'5px', fontSize:'0.8rem'}}>Goals: <span style={{color:'#00ff87'}}>{data.y}</span></div>
                                       <div style={{fontSize:'0.8rem'}}>xG: <span style={{color:'#aaa'}}>{data.x.toFixed(2)}</span></div>
                                       <div style={{fontSize:'0.7rem', color: data.y >= data.x ? '#00ff87' : '#ff005a', marginTop:'4px'}}>{data.y >= data.x ? `+${(data.y - data.x).toFixed(2)}` : (data.y - data.x).toFixed(2)} Diff</div>
                                   </div>
                               );
                           }
                           return null;
                       }} />
                       <Scatter name="Teams" data={gwGlobalStats.scatterData} fill="#8884d8">
                            {gwGlobalStats.scatterData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.y > entry.x ? '#00ff87' : '#ff005a'} />
                            ))}
                            <LabelList dataKey="name" position="top" offset={5} style={{ fill: '#fff', fontSize: '10px', fontWeight:'700' }} />
                       </Scatter>
                   </ScatterChart>
               </ResponsiveContainer>
           </div>
        </>
      )}
    </div>
  );
}

export default App;