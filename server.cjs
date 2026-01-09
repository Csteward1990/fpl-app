const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();

app.use(cors());

// This is the bridge that talks to the FPL API for you
app.get('/api/league-standings', async (req, res) => {
  try {
    const leagueId = '783411'; // <--- PUT YOUR LEAGUE ID HERE
    const response = await axios.get(`https://fantasy.premierleague.com/api/leagues-classic/${leagueId}/standings/`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch FPL data' });
  }
});

// server.cjs additions
// 1. Get the "Dictionary" of players and teams
app.get('/api/bootstrap-static', async (req, res) => {
  try {
    const response = await axios.get('https://fantasy.premierleague.com/api/bootstrap-static/');
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch bootstrap data' });
  }
});

// 2. Get a specific manager's picks for a specific Gameweek
app.get('/api/manager-picks/:entry_id/:gw', async (req, res) => {
  try {
    const { entry_id, gw } = req.params;
    const response = await axios.get(`https://fantasy.premierleague.com/api/entry/${entry_id}/event/${gw}/picks/`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch manager picks' });
  }
});

// Add this inside your server.cjs above app.listen

app.get('/api/live-points/:gw', async (req, res) => {
  try {
    const { gw } = req.params;
    const response = await axios.get(`https://fantasy.premierleague.com/api/event/${gw}/live/`);
    
    // We only need the 'elements' (players) data
    res.json(response.data.elements);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch live points' });
  }
});

app.get('/api/manager-picks/:entry_id/:gw', async (req, res) => {
  try {
    const { entry_id, gw } = req.params;
    const response = await axios.get(`https://fantasy.premierleague.com/api/entry/${entry_id}/event/${gw}/picks/`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch manager picks' });
  }
});

// Also add the Bootstrap-Static for player names
app.get('/api/bootstrap-static', async (req, res) => {
  try {
    const response = await axios.get(`https://fantasy.premierleague.com/api/bootstrap-static/`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch bootstrap data' });
  }
});

// Add this to your server.cjs
app.get('/api/live-data/:gw', async (req, res) => {
  try {
    const { gw } = req.params;
    const response = await axios.get(`https://fantasy.premierleague.com/api/event/${gw}/live/`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch live data' });
  }
});

// Add to server.cjs
app.get('/api/manager-history/:entry_id', async (req, res) => {
  try {
    const { entry_id } = req.params;
    const response = await axios.get(`https://fantasy.premierleague.com/api/entry/${entry_id}/history/`);
    // 'current' contains the array of all completed gameweeks for this season
    res.json(response.data.current);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch manager history' });
  }
});

// Add to server.cjs
app.get('/api/manager-transfers/:entry_id', async (req, res) => {
  try {
    const { entry_id } = req.params;
    const response = await axios.get(`https://fantasy.premierleague.com/api/entry/${entry_id}/transfers/`);
    res.json(response.data); // This is an array of all transfers made this season
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch transfers' });
  }
});

app.listen(5000, () => console.log('Proxy running on http://localhost:5000'));