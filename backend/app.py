# app.py

from flask import Flask, request, jsonify, g
from flask_cors import CORS, cross_origin
import sys
import os
import firebase_admin
from firebase_admin import credentials, firestore, auth
from datetime import datetime
from typing import Any, cast
import json
import sqlite3

# Add path
sys.path.append(os.path.dirname(__file__))

from disaster_management_ai import process_disaster_alert, AUTHORITIES_DATA

app = Flask(__name__)

# ---------------- CORS ----------------
ALLOWED_ORIGINS = [
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "http://127.0.0.1:5000",
    "http://localhost:5000",
    "http://127.0.0.1:5501",
    "http://localhost:5501",
    "https://your-frontend.vercel.app"
]

CORS(
    app,
    resources={r"/*": {"origins": ALLOWED_ORIGINS}},
    methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
    supports_credentials=True
)

# ---------------- SQLite ----------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE = os.path.join(BASE_DIR, 'authorities.db')

def get_db():
    db = getattr(g, '_database', None)
    if db is None:
        db = g._database = sqlite3.connect(DATABASE)
        db.row_factory = sqlite3.Row
    return db

@app.teardown_appcontext
def close_connection(exception):
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()

def init_db():
    with app.app_context():
        db = get_db()
        cursor = db.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS authorities (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                location TEXT NOT NULL,
                type TEXT NOT NULL
            )
        ''')
        db.commit()

with app.app_context():
    init_db()

# ---------------- Firebase (SAFE INIT) ----------------
db_firestore = None
current_user_id = None
app_id = os.getenv('__app_id', 'default-app-id')

try:
    if not firebase_admin._apps:
        key_path = os.path.join(os.path.dirname(__file__), 'serviceAccountKey.json')

        if os.path.exists(key_path):
            cred = credentials.Certificate(key_path)
            firebase_admin.initialize_app(cred)
            print("Firebase initialized (local key)")
        else:
            print("Firebase key not found — skipping init")

    if firebase_admin._apps:
        db_firestore = firestore.client()
        current_user_id = "anonymous_" + os.urandom(8).hex()

except Exception as e:
    print("Firebase init error:", e)

# ---------------- Firestore Logging ----------------
def log_communication_to_firestore(data):
    if db_firestore:
        try:
            ref = db_firestore.collection(f"artifacts/{app_id}/public/data/communication_logs")
            data["timestamp"] = datetime.utcnow()
            data["userId"] = current_user_id
            ref.add(data)
        except Exception as e:
            print("Firestore log error:", e)

# ---------------- ROUTES ----------------
@app.route('/')
def home():
    return "Backend Running"

@app.route('/health')
def health():
    return jsonify({"status": "ok"})

@app.route('/alert', methods=['POST'])
def trigger_alert():
    # Validate JSON body exists
    data = request.get_json()
    if data is None:
        return jsonify({"status": "error", "message": "Invalid JSON payload"}), 400
    
    # Validate location parameter
    location = data.get('location')
    if not location or not isinstance(location, str) or not location.strip():
        return jsonify({"status": "error", "message": "Location parameter is required and must be a non-empty string"}), 400

    try:
        result = process_disaster_alert(location.strip())

        if isinstance(result, dict) and result.get('status') == 'success':
            disaster_info = result.get("disaster_info", {})
            log_communication_to_firestore({
                "location": location,
                "details": disaster_info.get("details") if disaster_info else None # type: ignore
            })

        return jsonify(result)
    except Exception as e:
        print(f"Error processing alert: {e}")
        return jsonify({"status": "error", "message": "Failed to process disaster alert"}), 500

# ---------------- RUN FIX (IMPORTANT) ----------------
if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)