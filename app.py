from flask import Flask, jsonify
import requests
from flask_cors import CORS
import os

app = Flask(__name__)
# Enable CORS for all domains so Vercel can talk to Render
CORS(app)

# =======================================================
# ⚙️ CONFIGURATION
# =======================================================
# REPLACE THIS WITH YOUR ACTUAL LEAGUE ID
LEAGUE_ID = 783411  # <--- ENTER YOUR LEAGUE ID HERE

FPL_BASE_URL = "https://fantasy.premierleague.com/api"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

# =======================================================
# 🚀 API ROUTES
# =======================================================

@app.route('/')
def home():
    return "FPL Tracker API is Running!"

@app.route('/api/bootstrap-static')
def get_bootstrap():
    """Fetches general game data (players, teams, gameweeks)."""
    try:
        r = requests.get(f"{FPL_BASE_URL}/bootstrap-static/", headers=HEADERS)
        r.raise_for_status()
        return jsonify(r.json())
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/league-standings')
def get_standings():
    """Fetches the specific league standings."""
    try:
        # Uses the hardcoded LEAGUE_ID
        r = requests.get(f"{FPL_BASE_URL}/leagues-classic/{LEAGUE_ID}/standings/", headers=HEADERS)
        r.raise_for_status()
        return jsonify(r.json())
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/live-data/<int:event_id>')
def get_live_data(event_id):
    """Fetches live points for a specific Gameweek."""
    try:
        r = requests.get(f"{FPL_BASE_URL}/event/{event_id}/live/", headers=HEADERS)
        r.raise_for_status()
        return jsonify(r.json())
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/manager-history/<int:manager_id>')
def get_manager_history(manager_id):
    """Fetches a manager's past rank and points history."""
    try:
        r = requests.get(f"{FPL_BASE_URL}/entry/{manager_id}/history/", headers=HEADERS)
        r.raise_for_status()
        return jsonify(r.json())
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/manager-picks/<int:manager_id>/<int:event_id>')
def get_manager_picks(manager_id, event_id):
    """Fetches a manager's team selection for a specific GW."""
    try:
        r = requests.get(f"{FPL_BASE_URL}/entry/{manager_id}/event/{event_id}/picks/", headers=HEADERS)
        r.raise_for_status()
        return jsonify(r.json())
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/manager-transfers/<int:manager_id>')
def get_manager_transfers(manager_id):
    """Fetches a manager's transfer history."""
    try:
        r = requests.get(f"{FPL_BASE_URL}/entry/{manager_id}/transfers/", headers=HEADERS)
        r.raise_for_status()
        return jsonify(r.json())
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Use the PORT environment variable if available (required for Render)
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)