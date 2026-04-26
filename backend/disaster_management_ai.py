# disaster_management_ai.py
import random
import smtplib
from email.mime.text import MIMEText
import time # For simulating delays
import os
from dotenv import load_dotenv
load_dotenv()

# --- Hardcoded Authorities Data (for email simulation within this file) ---
# NOTE: This data is used by process_disaster_alert for SIMULATING email recipients.
# The main authority management in app.py uses an SQLite database.
# In a real-world integrated system, process_disaster_alert would ideally
# receive the relevant authority emails from app.py after app.py fetches them from its DB.
AUTHORITIES_DATA = [
    {"name": "City Emergency Services", "email": "city.emergency@example.com", "location": "Vadlamudi", "type": "city"},
    {"name": "State Disaster Response", "email": "state.response@example.com", "location": "Andhra Pradesh", "type": "state"},
    {"name": "National Disaster Management", "email": "national.dm@example.com", "location": "India", "type": "national"},
    {"name": "Local Police Station", "email": "local.police@example.com", "location": "Tenali", "type": "city"},
    {"name": "Village Head", "email": "village.head@example.com", "location": "Pedavadlapudi", "type": "village"},
    {"name": "Medical Services", "email": "medical.services@example.com", "location": "Guntur", "type": "city"},
]

# --- SMTP Configuration for Sending Emails ---
# IMPORTANT: These credentials should be set via environment variables.
# For Gmail, you might need to generate an "App Password" if 2FA is enabled.
# See: https://support.google.com/accounts/answer/185833
SMTP_CONFIG = {
    "SMTP_SERVER": os.getenv("SMTP_SERVER", "smtp.gmail.com"),  # e.g., "smtp.gmail.com" for Gmail
    "SMTP_PORT": int(os.getenv("SMTP_PORT", 587)),              # 587 for TLS/STARTTLS, 465 for SSL
    "SENDER_EMAIL": os.getenv("SENDER_EMAIL", "amareshchavali2014@gmail.com"),              # Set via environment variable
    "SENDER_PASSWORD": os.getenv("SENDER_PASSWORD", "gpyz pdex ezmt peko")         # Set via environment variable (App Password for Gmail)
}

def send_email(recipient_email, subject, body):
    """
    Sends an email using the configured SMTP server.
    """
    sender_email = SMTP_CONFIG["SENDER_EMAIL"]
    sender_password = SMTP_CONFIG["SENDER_PASSWORD"]
    smtp_server = SMTP_CONFIG["SMTP_SERVER"]
    smtp_port = SMTP_CONFIG["SMTP_PORT"]

    if not all([sender_email, sender_password, smtp_server, smtp_port]):
        print("ERROR: SMTP configuration is incomplete. Cannot send email.")
        return False

    msg = MIMEText(body)
    msg['Subject'] = subject
    msg['From'] = sender_email
    msg['To'] = recipient_email

    try:
        print(f"Attempting to send email to {recipient_email} via {smtp_server}:{smtp_port}...")
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()  # Upgrade the connection to a secure encrypted SSL/TLS connection
            server.login(sender_email, sender_password)
            server.send_message(msg)
        print(f"Email sent successfully to {recipient_email}")
        return True
    except smtplib.SMTPAuthenticationError as e:
        print(f"ERROR: SMTP Authentication failed for {sender_email}. Check your email and password (or App Password). Details: {e}")
        return False
    except smtplib.SMTPConnectError as e:
        print(f"ERROR: SMTP Connection failed to {smtp_server}:{smtp_port}. Check server address, port, and network connectivity. Details: {e}")
        return False
    except Exception as e:
        print(f"ERROR: Failed to send email to {recipient_email}. Details: {e}")
        return False


def process_disaster_alert(location):
    """
    Simulates AI processing to detect a natural disaster and trigger alerts.
    Includes a predictive statement and resource suggestions.
    """
    print(f"AI is processing disaster alert for {location}...")
    
    # Simulate AI decision based on location (simplified for demonstration)
    # In a real scenario, this would involve complex models, real-time data, etc.
    disaster_detected = random.choice([True, False])
    
    # Simulate a delay for AI processing
    time.sleep(1) 

    if disaster_detected:
        disaster_type = random.choice(["Flood", "Earthquake", "Cyclone", "Drought", "Landslide", "Fire"])
        severity = random.choice(["Low", "Moderate", "High", "Critical"])
        threat_index = round(random.uniform(1.0, 10.0), 1) # Simulate a threat index

        details = f"Simulated AI detection indicates a potential {disaster_type} in {location}."
        
        predictive_statement = f"Based on current patterns, there is a high likelihood of {disaster_type.lower()} progression in the next 24-48 hours, potentially impacting surrounding areas."
        
        resource_suggestions = [
            {"resource": "Emergency Medical Teams", "quantity": "2 units"},
            {"resource": "Search and Rescue Personnel", "quantity": "5 teams"},
            {"resource": "Water Purification Tablets", "quantity": "10000 units"},
            {"resource": "Temporary Shelter Kits", "quantity": "500 units"}
        ]

        # Determine relevant authorities to email based on location (using hardcoded data for simulation)
        recipient_emails = []
        location_lower = location.lower()
        for authority in AUTHORITIES_DATA:
            if location_lower in authority["location"].lower() or authority["location"].lower() in location_lower or authority["type"] in ["state", "national"]:
                recipient_emails.append(authority["email"])
        
        # Ensure at least one recipient for simulation purposes if no specific match
        if not recipient_emails:
            recipient_emails.append("central.emergency@example.com") # Fallback email

        alert_subject = f"Urgent: Disaster Alert - {disaster_type} in {location} ({severity} Severity)"
        alert_body = f"""
        Dear Authority,

        This is an automated alert from the Disaster Management AI.

        A potential natural disaster of type: {disaster_type}
        Location: {location}
        Severity: {severity}
        Threat Index (TI): {threat_index}
        Details: {details}

        Predictive Insights: {predictive_statement}

        Suggested Resources:
        """
        for res in resource_suggestions:
            alert_body += f"- {res['resource']}: {res['quantity']}\n"
        
        alert_body += """
        Please take necessary action immediately.

        Sincerely,
        Disaster Management AI System
        """

        # Send emails to determined recipients
        for email in recipient_emails:
            send_email(email, alert_subject, alert_body)

        return {
            "status": "success",
            "message": f"Disaster alert triggered for {location}.",
            "disaster_info": {
                "disaster_type": disaster_type,
                "severity": severity,
                "status": "active",
                "threat_index": threat_index,
                "details": details,
                "predictive_statement": predictive_statement,
                "resource_suggestions": resource_suggestions,
                "emails_sent_to": recipient_emails # Include who emails were sent to
            }
        }
    else:
        return {
            "status": "no_disaster",
            "message": f"No natural disaster detected by AI for {location} at this time."
        }

if __name__ == '__main__':
    # This block is for testing disaster_management_ai.py directly
    print("--- Testing Disaster Management AI Logic ---")
    
    # Test with a location that might trigger an alert
    test_location_1 = "Vadlamudi"
    result_1 = process_disaster_alert(test_location_1)
    print(f"\nResult for {test_location_1}:\n{result_1}")

    # Test with another location
    test_location_2 = "Hyderabad"
    result_2 = process_disaster_alert(test_location_2)
    print(f"\nResult for {test_location_2}:\n{result_2}")

    # Test with a location that might not trigger an alert
    test_location_3 = "New York"
    result_3 = process_disaster_alert(test_location_3)
    print(f"\nResult for {test_location_3}:\n{result_3}")
