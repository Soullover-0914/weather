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

# Add path before importing local modules
sys.path.insert(0, os.path.dirname(__file__))

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
    "https://weather-ruby-ten.vercel.app"
]

CORS(
    app,
    resources={r"/*": {"origins": ALLOWED_ORIGINS}},
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

# ---------------- AUTHORITY API ----------------

@app.route('/api/authorities', methods=['GET'])
def get_authorities():
    try:
        db = get_db()
        rows = db.execute('SELECT id, name, email, location, type FROM authorities ORDER BY id DESC').fetchall()
        return jsonify([dict(row) for row in rows]), 200
    except Exception as e:
        print(f'Error fetching authorities: {e}')
        return jsonify({'error': 'Failed to fetch authorities'}), 500

@app.route('/api/authorities', methods=['POST'])
def add_authority():
    data = request.get_json(silent=True) or {}
    name = str(data.get('name', '')).strip()
    email = str(data.get('email', '')).strip()
    location = str(data.get('location', '')).strip()
    authority_type = str(data.get('type', '')).strip()
    if not all([name, email, location, authority_type]):
        return jsonify({'error': 'name, email, location and type are required'}), 400
    try:
        db = get_db()
        cursor = db.execute('INSERT INTO authorities (name, email, location, type) VALUES (?, ?, ?, ?)', (name, email, location, authority_type))
        db.commit()
        return jsonify({'message': 'Authority added successfully', 'id': cursor.lastrowid}), 201
    except sqlite3.IntegrityError:
        return jsonify({'error': 'An authority with this email already exists'}), 409
    except Exception as e:
        print(f'Error adding authority: {e}')
        return jsonify({'error': 'Failed to add authority'}), 500

@app.route('/api/authorities/<int:authority_id>', methods=['PUT'])
def update_authority(authority_id):
    data = request.get_json(silent=True) or {}
    name = str(data.get('name', '')).strip()
    email = str(data.get('email', '')).strip()
    location = str(data.get('location', '')).strip()
    authority_type = str(data.get('type', '')).strip()
    if not all([name, email, location, authority_type]):
        return jsonify({'error': 'name, email, location and type are required'}), 400
    try:
        db = get_db()
        cursor = db.execute('UPDATE authorities SET name=?, email=?, location=?, type=? WHERE id=?', (name, email, location, authority_type, authority_id))
        db.commit()
        if cursor.rowcount == 0:
            return jsonify({'error': 'Authority not found'}), 404
        return jsonify({'message': 'Authority updated successfully'}), 200
    except sqlite3.IntegrityError:
        return jsonify({'error': 'An authority with this email already exists'}), 409
    except Exception as e:
        print(f'Error updating authority: {e}')
        return jsonify({'error': 'Failed to update authority'}), 500

@app.route('/api/authorities/<int:authority_id>', methods=['DELETE'])
def delete_authority(authority_id):
    try:
        db = get_db()
        cursor = db.execute('DELETE FROM authorities WHERE id=?', (authority_id,))
        db.commit()
        if cursor.rowcount == 0:
            return jsonify({'error': 'Authority not found'}), 404
        return jsonify({'message': 'Authority deleted successfully'}), 200
    except Exception as e:
        print(f'Error deleting authority: {e}')
        return jsonify({'error': 'Failed to delete authority'}), 500

# ---------------- ROUTES ----------------
@app.route('/', methods=['GET'])
def home():
    return jsonify({
        "status": "success",
        "message": "Disaster Management Backend is LIVE 🚀"
    })

@app.route('/test')
def test():
    return jsonify({"status": "success", "message": "Test route working"})

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

