# app.py
# This Flask application provides a simple API endpoint for the Disaster Management AI.

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


# Add the directory containing disaster_management_ai.py to the Python path
sys.path.append(os.path.dirname(__file__))

from disaster_management_ai import process_disaster_alert, AUTHORITIES_DATA # Import the core AI function and data

app = Flask(__name__)

# --- CORS Configuration ---
# Allow multiple origins for local development.
# It's crucial to include the exact port your frontend (e.g., Live Server) is running on.
# Common Live Server ports are 5500, 5501, 8080, etc.
ALLOWED_ORIGINS = [
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "http://127.0.0.1:5000",
    "http://localhost:5000",
    "http://127.0.0.1:5501", # Added for common Live Server port
    "http://localhost:5501"  # Added for common Live Server port
    # You can add more origins here if your Live Server uses a different port
]
# Updated CORS Configuration (supports both local + deployed frontend)
CORS(
    app,
    resources={
        r"/*": {
            "origins": [
                "http://127.0.0.1:5500",
                "http://localhost:5500",
                "http://127.0.0.1:5000",
                "http://localhost:5000",
                # 🔥 ADD YOUR DEPLOYED FRONTEND URL HERE
                "https://your-frontend.vercel.app"
            ]
        }
    },
    methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
    supports_credentials=True
)

# --- SQLite Database Configuration for Authorities ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE = os.path.join(BASE_DIR, 'authorities.db')
def get_db():
    """Establishes a database connection or returns the current one."""
    db = getattr(g, '_database', None)
    if db is None:
        db = g._database = sqlite3.connect(DATABASE)
        db.row_factory = sqlite3.Row # This makes rows behave like dictionaries
    return db

@app.teardown_appcontext
def close_connection(exception):
    """Closes the database connection at the end of the request."""
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()

def init_db():
    """Initializes the database schema for authorities."""
    with app.app_context():
        db = get_db()
        cursor = db.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS authorities (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                location TEXT NOT NULL,
                type TEXT NOT NULL -- e.g., 'city', 'village', 'state'
            )
        ''')
        db.commit()
        print("Authorities database initialized or already exists.")

# Call init_db() when the application starts
with app.app_context():
    init_db()


# --- Firebase Initialization ---
db_firestore = None # Firestore client
current_user_id = None # Store the authenticated user ID
app_id = os.getenv('__app_id', 'default-app-id') # This will be set by Canvas environment

try:
    if not firebase_admin._apps: # Check if Firebase app is already initialized
        firebase_config_str = os.getenv('__firebase_config') # From Canvas environment
        
        if firebase_config_str:
            try:
                firebase_config = json.loads(firebase_config_str)
                cred = credentials.Certificate(firebase_config)
                firebase_admin.initialize_app(cred)
                print("Firebase Admin SDK initialized using Canvas config.")
            except json.JSONDecodeError:
                print("ERROR: __firebase_config environment variable is not valid JSON. Please check its format.")
            except Exception as e:
                print(f"ERROR: Failed to initialize Firebase with Canvas config: {e}")
        else:
            # Fallback for local development outside Canvas
            service_account_key_path = os.path.join(os.path.dirname(__file__), 'serviceAccountKey.json')
            
            if os.path.exists(service_account_key_path):
                try:
                    cred = credentials.Certificate(service_account_key_path)
                    firebase_admin.initialize_app(cred)
                    print(f"Firebase Admin SDK initialized using local service account key: {service_account_key_path}")
                except Exception as e:
                    print(f"ERROR: Failed to initialize Firebase with local service account key: {e}")
            else:
                print("WARNING: Neither Canvas Firebase config nor local 'serviceAccountKey.json' found.")
                print("Firestore will not be available. To enable Firestore locally, download your Firebase service account key (JSON) and place it in the backend directory as 'serviceAccountKey.json'.")
                
    if firebase_admin._apps: # Only proceed if Firebase app was successfully initialized
        db_firestore = firestore.client()
        initial_auth_token = os.getenv('__initial_auth_token') # From Canvas environment

        if initial_auth_token:
            try:
                decoded_token = auth.verify_id_token(initial_auth_token)
                current_user_id = decoded_token['uid']
                print(f"Backend authenticated with custom token. User ID: {current_user_id}")
            except Exception as e:
                print(f"Error verifying custom auth token on backend: {e}")
                print("Backend attempting anonymous sign-in fallback for local development...")
                current_user_id = "anonymous_user_" + os.urandom(16).hex()
                print(f"Backend assigned anonymous User ID: {current_user_id}")
        else:
            print("No initial auth token provided to backend. Assigning anonymous User ID (simulated for local dev).")
            current_user_id = "anonymous_user_" + os.urandom(16).hex()
            print(f"Backend assigned anonymous User ID: {current_user_id}")
    else:
        print("Firebase app not initialized. Firestore client will not be available.")

except Exception as e:
    print(f"Firebase init error: {e}")
    db_firestore = None
    current_user_id = "anonymous_" + os.urandom(8).hex()# Ensure current_user_id is also None if Firebase fails entirely

# --- Firestore Logging Functions ---
def log_communication_to_firestore(log_data):
    """
    Logs communication details (alerts sent) to Firestore.
    Stores in /artifacts/{appId}/public/data/communication_logs
    """
    if db_firestore and current_user_id:
        try:
            collection_path = f"artifacts/{app_id}/public/data/communication_logs"
            logs_ref = db_firestore.collection(collection_path)

            # Use SERVER_TIMESTAMP if available on the firestore module; otherwise fall back to UTC now.
            firestore_any = cast(Any, firestore)
            ts = getattr(firestore_any, 'SERVER_TIMESTAMP', None)
            if ts is None:
                ts = datetime.utcnow()

            log_data['timestamp'] = ts
            log_data['userId'] = current_user_id

            logs_ref.add(log_data)
            print(f"Communication log added to Firestore: {collection_path}")
        except Exception as e:
            print(f"Error adding communication log to Firestore: {e}")
    else:
        print("Firestore not initialized or user not authenticated. Cannot log communication.")

def log_user_report_to_firestore(report_data):
    """
    Logs user incident reports to Firestore.
    Stores in /artifacts/{appId}/public/data/user_reports
    """
    if db_firestore and current_user_id:
        try:
            collection_path = f"artifacts/{app_id}/public/data/user_reports"
            reports_ref = db_firestore.collection(collection_path)

            # Use SERVER_TIMESTAMP if available on the firestore module; otherwise fall back to UTC now.
            firestore_any = cast(Any, firestore)
            ts = getattr(firestore_any, 'SERVER_TIMESTAMP', None)
            if ts is None:
                ts = datetime.utcnow()

            report_data['timestamp'] = ts
            report_data['userId'] = current_user_id # Associate report with user

            reports_ref.add(report_data)
            print(f"User report added to Firestore: {collection_path}")
        except Exception as e:
            print(f"Error adding user report to Firestore: {e}")
    else:
        print("Firestore not initialized or user not authenticated. Cannot log user report.")


@app.route('/')
def home():
    """
    A simple home route to confirm the Flask app is running.
    """
    return "Disaster Management AI Backend is running!"
@app.route('/health')
def health():
    return jsonify({"status": "ok"})

@app.route('/alert', methods=['POST'])
@cross_origin(origins=ALLOWED_ORIGINS, # Use the defined ALLOWED_ORIGINS list
              methods=["POST"],
              allow_headers=["Content-Type", "Authorization"],
              supports_credentials=True)
def trigger_alert():
    """
    API endpoint to trigger a disaster alert for a given location.
    Expects a JSON payload with a 'location' field.
    """
    if not request.is_json:
        return jsonify({"error": "Request must be JSON"}), 400

    data = request.get_json()
    location = data.get('location')

    if not location:
        return jsonify({"error": "Missing 'location' in request body"}), 400

    print(f"Received request to process alert for location: {location}")
    
    result = process_disaster_alert(location)

    # Be defensive about the return type from process_disaster_alert; it should be a dict but
    # we guard against unexpected values to satisfy static analysis and runtime safety.
    if isinstance(result, dict) and result.get('status') == 'success':
        disaster_info = result.get('disaster_info', {})
        log_data = {
            "location": location,
            "disasterType": disaster_info.get('disaster_type') if isinstance(disaster_info, dict) else None,
            "status": disaster_info.get('status') if isinstance(disaster_info, dict) else None,
            "severity": disaster_info.get('severity') if isinstance(disaster_info, dict) else None,
            "threatIndex": disaster_info.get('threat_index') if isinstance(disaster_info, dict) else None,
            "details": disaster_info.get('details', 'N/A') if isinstance(disaster_info, dict) else 'N/A',
        }
        log_communication_to_firestore(log_data)
    else:
        disaster_info = {}

    return jsonify(result), 200

@app.route('/authorities', methods=['GET'])
@cross_origin(origins=ALLOWED_ORIGINS, # Use the defined ALLOWED_ORIGINS list
              methods=["GET"],
              allow_headers=["Content-Type", "Authorization"],
              supports_credentials=True)
def get_authorities_data():
    """
    API endpoint to retrieve the configured authorities data (hardcoded).
    This is kept for compatibility but /api/authorities is preferred.
    """
    return jsonify(AUTHORITIES_DATA), 200

@app.route('/communication_logs', methods=['GET'])
@cross_origin(origins=ALLOWED_ORIGINS, # Use the defined ALLOWED_ORIGINS list
              methods=["GET"],
              allow_headers=["Content-Type", "Authorization"],
              supports_credentials=True)
def get_communication_logs():
    """
    API endpoint to retrieve historical communication logs from Firestore.
    """
    if db_firestore and current_user_id:
        try:
            collection_path = f"artifacts/{app_id}/public/data/communication_logs"
            logs_ref = db_firestore.collection(collection_path)
            
            # firestore.Query may not be present on the typing stubs used by the analyzer; use a runtime
            # fallback to call order_by without direction if needed.
            firestore_any = cast(Any, firestore)
            if hasattr(firestore_any, 'Query'):
                Query = getattr(firestore_any, 'Query')
                DESC = getattr(Query, 'DESCENDING', None)
                if DESC is not None:
                    query = logs_ref.order_by('timestamp', direction=DESC).limit(50)
                else:
                    query = logs_ref.order_by('timestamp').limit(50)
            else:
                query = logs_ref.order_by('timestamp').limit(50)

            docs = query.stream()
            logs = []
            for doc in docs:
                log_entry = doc.to_dict()
                # Convert timestamp-like objects to strings for JSON serialization in a robust way.
                if 'timestamp' in log_entry:
                    ts = log_entry['timestamp']
                    if hasattr(ts, 'strftime'):
                        try:
                            log_entry['timestamp'] = ts.strftime("%Y-%m-%d %H:%M:%S")
                        except Exception:
                            log_entry['timestamp'] = str(ts)
                    else:
                        log_entry['timestamp'] = str(ts)
                log_entry['id'] = doc.id # Add document ID for potential future use
                logs.append(log_entry)
            
            return jsonify({"status": "success", "logs": logs}), 200
        except Exception as e:
            print(f"Error fetching communication logs from Firestore: {e}")
            return jsonify({"status": "error", "message": f"Failed to fetch logs: {e}"}), 500
    else:
        return jsonify({"status": "error", "message": "Firestore not initialized or user not authenticated."}), 500

# --- API Endpoints for Authority Management (SQLite) ---

@app.route('/api/authorities', methods=['GET'])
@cross_origin(origins=ALLOWED_ORIGINS, # Use the defined ALLOWED_ORIGINS list
              methods=["GET"],
              allow_headers=["Content-Type", "Authorization"],
              supports_credentials=True)
def get_all_authorities():
    """Retrieves all authority contacts from the SQLite database."""
    db_conn = get_db()
    cursor = db_conn.cursor()
    cursor.execute("SELECT * FROM authorities")
    authorities = cursor.fetchall()
    return jsonify([dict(row) for row in authorities]), 200

@app.route('/api/authorities', methods=['POST'])
@cross_origin(origins=ALLOWED_ORIGINS, # Use the defined ALLOWED_ORIGINS list
              methods=["POST"],
              allow_headers=["Content-Type", "Authorization"],
              supports_credentials=True)
def add_authority():
    """Adds a new authority contact to the SQLite database."""
    data = request.get_json()
    name = data.get('name')
    email = data.get('email')
    location = data.get('location')
    type = data.get('type')

    if not all([name, email, location, type]):
        return jsonify({"error": "Missing data"}), 400

    db_conn = get_db()
    cursor = db_conn.cursor()
    try:
        cursor.execute("INSERT INTO authorities (name, email, location, type) VALUES (?, ?, ?, ?)",
                       (name, email, location, type))
        db_conn.commit()
        return jsonify({"message": "Authority added successfully", "id": cursor.lastrowid}), 201
    except sqlite3.IntegrityError:
        return jsonify({"error": "Email already exists"}), 409
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/authorities/<int:authority_id>', methods=['PUT'])
@cross_origin(origins=ALLOWED_ORIGINS, # Use the defined ALLOWED_ORIGINS list
              methods=["PUT"],
              allow_headers=["Content-Type", "Authorization"],
              supports_credentials=True)
def update_authority(authority_id):
    """Updates an existing authority contact in the SQLite database."""
    data = request.get_json()
    name = data.get('name')
    email = data.get('email')
    location = data.get('location')
    type = data.get('type')

    db_conn = get_db()
    cursor = db_conn.cursor()
    try:
        cursor.execute("UPDATE authorities SET name=?, email=?, location=?, type=? WHERE id=?",
                       (name, email, location, type, authority_id))
        db_conn.commit()
        if cursor.rowcount == 0:
            return jsonify({"error": "Authority not found"}), 404
        return jsonify({"message": "Authority updated successfully"}), 200
    except sqlite3.IntegrityError:
        return jsonify({"error": "Email already exists"}), 409
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/authorities/<int:authority_id>', methods=['DELETE'])
@cross_origin(origins=ALLOWED_ORIGINS, # Use the defined ALLOWED_ORIGINS list
              methods=["DELETE"],
              allow_headers=["Content-Type", "Authorization"],
              supports_credentials=True)
def delete_authority(authority_id):
    """Deletes an authority contact from the SQLite database."""
    db_conn = get_db()
    cursor = db_conn.cursor()
    try:
        cursor.execute("DELETE FROM authorities WHERE id=?", (authority_id,))
        db_conn.commit()
        if cursor.rowcount == 0:
            return jsonify({"error": "Authority not found"}), 404
        return jsonify({"message": "Authority deleted successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- NEW: API Endpoints for User Incident Reports (Firestore) ---

@app.route('/api/reports', methods=['POST'])
@cross_origin(origins=ALLOWED_ORIGINS, # Use the defined ALLOWED_ORIGINS list
              methods=["POST"],
              allow_headers=["Content-Type", "Authorization"],
              supports_credentials=True)
def submit_report():
    """
    API endpoint to submit a user incident report to Firestore.
    Expects JSON payload with incidentType, incidentLocation, incidentDescription, incidentSeverity.
    """
    if not request.is_json:
        return jsonify({"error": "Request must be JSON"}), 400

    data = request.get_json()
    incident_type = data.get('incidentType')
    incident_location = data.get('incidentLocation')
    incident_description = data.get('incidentDescription')
    incident_severity = data.get('incidentSeverity')

    if not all([incident_type, incident_location, incident_description, incident_severity]):
        return jsonify({"error": "Missing data in incident report"}), 400

    report_data = {
        "incidentType": incident_type,
        "incidentLocation": incident_location,
        "incidentDescription": incident_description,
        "incidentSeverity": incident_severity
    }
    
    log_user_report_to_firestore(report_data) # Log to Firestore

    return jsonify({"message": "Report submitted successfully", "report": report_data}), 201

@app.route('/api/reports', methods=['GET'])
@cross_origin(origins=ALLOWED_ORIGINS, # Use the defined ALLOWED_ORIGINS list
              methods=["GET"],
              allow_headers=["Content-Type", "Authorization"],
              supports_credentials=True)
def get_all_reports():
    """
    API endpoint to retrieve all user incident reports from Firestore.
    """
    if db_firestore and current_user_id:
        try:
            collection_path = f"artifacts/{app_id}/public/data/user_reports"
            reports_ref = db_firestore.collection(collection_path)
            
            # Order by timestamp descending (use runtime fallback if Query not available in stubs)
            firestore_any = cast(Any, firestore)
            if hasattr(firestore_any, 'Query'):
                Query = getattr(firestore_any, 'Query')
                DESC = getattr(Query, 'DESCENDING', None)
                if DESC is not None:
                    query = reports_ref.order_by('timestamp', direction=DESC).limit(50)
                else:
                    query = reports_ref.order_by('timestamp').limit(50)
            else:
                query = reports_ref.order_by('timestamp').limit(50)

            docs = query.stream()
            reports = []
            for doc in docs:
                report_entry = doc.to_dict()
                if 'timestamp' in report_entry:
                    ts = report_entry['timestamp']
                    if hasattr(ts, 'strftime'):
                        try:
                            report_entry['timestamp'] = ts.strftime("%Y-%m-%d %H:%M:%S")
                        except Exception:
                            report_entry['timestamp'] = str(ts)
                    else:
                        report_entry['timestamp'] = str(ts)
                report_entry['id'] = doc.id # Include document ID
                reports.append(report_entry)
            
            return jsonify(reports), 200
        except Exception as e:
            print(f"Error fetching user reports from Firestore: {e}")
            return jsonify({"error": f"Failed to fetch user reports: {e}"}), 500
    else:
        return jsonify({"error": "Firestore not initialized or user not authenticated."}), 500


if __name__ == '__main__':
    print("Starting Flask app...")
    print("Access the home page at http://127.0.0.1:5000/")
    print("Send POST requests to http://127.0.0.1:5000/alert with JSON payload: {'location': 'CityName'}")
    print("Access communication logs at http://127.0.0.1:5000/communication_logs")
    print("\n--- Authority Management API Endpoints (SQLite) ---")
    print("GET /api/authorities - Get all authorities")
    print("POST /api/authorities - Add new authority")
    print("PUT /api/authorities/<id> - Update authority")
    print("DELETE /api/authorities/<id> - Delete authority")
    print("\n--- NEW: User Incident Reporting API Endpoints (Firestore) ---")
    print("POST /api/reports - Submit new incident report")
    print("GET /api/reports - Get all incident reports")
    port = int(os.environ.get("PORT", 5000))
app.run(host="0.0.0.0", port=port)
