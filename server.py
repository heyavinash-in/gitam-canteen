# GITAM Canteen - Full-Stack Python Backend Server
# Built using Python standard libraries: http.server, sqlite3, urllib, hmac, hashlib

import http.server
import socketserver
import urllib.request
import urllib.error
import json
import sqlite3
import hmac
import hashlib
import os
import sys
import time
import base64
from datetime import datetime
import ssl

# Bypass SSL verify issues on machines with outdated/missing CA certs
SSL_CONTEXT = ssl._create_unverified_context()


PORT = 5000
DB_FILE = 'canteen.db'

# --- SQLite Database Initialization ---
def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    # Create Users table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            email TEXT PRIMARY KEY,
            name TEXT,
            picture TEXT,
            role TEXT
        )
    ''')
    
    # Create Transactions/Ledger table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS transactions (
            id TEXT PRIMARY KEY,
            student_email TEXT,
            student_name TEXT,
            thali_type TEXT,
            amount INTEGER,
            date TEXT,
            status TEXT,
            redeemed_at TEXT,
            security_code TEXT
        )
    ''')
    
    # Create Server Config table for Google & Razorpay settings
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS config (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    ''')
    
    # Seed default config values (always override with hardcoded credentials for persistence)
    cursor.execute("INSERT OR REPLACE INTO config (key, value) VALUES ('google_client_id', '811997218929-tion706h3r0lfo7b2f75m8t33jaaeegc.apps.googleusercontent.com')")
    cursor.execute("INSERT OR REPLACE INTO config (key, value) VALUES ('razorpay_key_id', 'rzp_test_TEXV2FeUmSXt6v')")
    cursor.execute("INSERT OR REPLACE INTO config (key, value) VALUES ('razorpay_key_secret', 'qk8hcrUomfBQCqdDxoP8534H')")
    
    conn.commit()
    conn.close()
    print("[Database] SQLite canteen.db initialized successfully.")

# Get config values helper
def get_config():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT key, value FROM config")
    rows = cursor.fetchall()
    conn.close()
    return {row[0]: row[1] for row in rows}

# Save config values helper
def save_config(google_client_id, razorpay_key_id, razorpay_key_secret):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("UPDATE config SET value = ? WHERE key = 'google_client_id'", (google_client_id,))
    cursor.execute("UPDATE config SET value = ? WHERE key = 'razorpay_key_id'", (razorpay_key_id,))
    if razorpay_key_secret: # Only update if secret was provided
        cursor.execute("UPDATE config SET value = ? WHERE key = 'razorpay_key_secret'", (razorpay_key_secret,))
    conn.commit()
    conn.close()

# --- HTTP Request Handler ---
class CanteenRequestHandler(http.server.BaseHTTPRequestHandler):

    # 1. GET requests for Static Serving & API Loads
    def do_GET(self):
        # API Routes
        if self.path == '/api/config/load':
            self.handle_load_config()
            return
        elif self.path.startswith('/api/coupon/status'):
            self.handle_coupon_status()
            return
        elif self.path == '/api/admin/stats':
            self.handle_admin_stats()
            return
        elif self.path == '/api/admin/ledger':
            self.handle_admin_ledger()
            return
        elif self.path.startswith('/api/attendant/lookup'):
            self.handle_attendant_lookup()
            return
            
        # Static Files Serving
        self.serve_static_file()

    # 2. POST requests for Authentication & Payments
    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        
        try:
            payload = json.loads(post_data.decode('utf-8'))
        except Exception:
            self.send_error_response(400, "Invalid JSON payload.")
            return

        if self.path == '/api/config/save':
            self.handle_save_config(payload)
        elif self.path == '/api/auth/google':
            self.handle_google_auth(payload)
        elif self.path == '/api/auth/bypass':
            self.handle_bypass_auth(payload)
        elif self.path == '/api/payment/create-order':
            self.handle_create_order(payload)
        elif self.path == '/api/payment/verify':
            self.handle_verify_payment(payload)
        elif self.path == '/api/attendant/redeem':
            self.handle_attendant_redeem(payload)
        else:
            self.send_error_response(404, "API endpoint not found.")

    # --- Static File Serving Helper ---
    def serve_static_file(self):
        # Normalize request path
        clean_path = self.path.split('?')[0]
        if clean_path == '/':
            clean_path = '/index.html'
        
        # Build local path
        local_path = '.' + clean_path
        
        # Prevent Directory Traversal
        abs_local = os.path.abspath(local_path)
        abs_workspace = os.path.abspath('.')
        if not abs_local.startswith(abs_workspace):
            self.send_error_response(403, "Access Denied.")
            return

        if not os.path.exists(local_path) or os.path.isdir(local_path):
            self.send_error_response(404, "File not found.")
            return

        # Determine MIME Type
        mime_types = {
            '.html': 'text/html; charset=utf-8',
            '.css': 'text/css; charset=utf-8',
            '.js': 'application/javascript; charset=utf-8',
            '.json': 'application/json',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon'
        }
        _, ext = os.path.splitext(local_path)
        content_type = mime_types.get(ext.lower(), 'application/octet-stream')

        # Read and serve the file
        try:
            with open(local_path, 'rb') as file:
                content = file.read()
                self.send_response(200)
                self.send_header('Content-Type', content_type)
                self.send_header('Content-Length', len(content))
                # Add caching control headers for PWA
                self.send_header('Cache-Control', 'no-cache')
                self.end_headers()
                self.wfile.write(content)
        except Exception as e:
            self.send_error_response(500, f"Error reading file: {str(e)}")

    # --- API Response Helpers ---
    def send_json_response(self, data, status_code=200):
        try:
            response_bytes = json.dumps(data).encode('utf-8')
            self.send_response(status_code)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', len(response_bytes))
            self.end_headers()
            self.wfile.write(response_bytes)
        except Exception as e:
            print("Failed to send JSON response:", e)

    def send_error_response(self, status_code, message):
        self.send_json_response({"status": "error", "message": message}, status_code)

    # --- API Handlers ---
    
    # GET /api/config/load
    def handle_load_config(self):
        conf = get_config()
        # Return public keys (mask the secret key for safety)
        has_secret = 'yes' if conf.get('razorpay_key_secret') else 'no'
        self.send_json_response({
            "google_client_id": conf.get('google_client_id', ''),
            "razorpay_key_id": conf.get('razorpay_key_id', ''),
            "has_razorpay_secret": has_secret
        })

    # POST /api/config/save (Disabled for security)
    def handle_save_config(self, payload):
        self.send_error_response(403, "Configuration updates are disabled in production.")

    # POST /api/auth/google
    def handle_google_auth(self, payload):
        id_token = payload.get('id_token')
        if not id_token:
            self.send_error_response(400, "Google JWT token is missing.")
            return

        conf = get_config()
        client_id = conf.get('google_client_id')
        
        # Verify Token via Google API endpoint
        google_api_url = f"https://oauth2.googleapis.com/tokeninfo?id_token={id_token}"
        try:
            req = urllib.request.Request(google_api_url, method='GET')
            with urllib.request.urlopen(req, context=SSL_CONTEXT) as resp:
                token_info = json.loads(resp.read().decode('utf-8'))
                
                # Check Client ID audience to verify issuer
                aud = token_info.get('aud')
                if client_id and aud != client_id:
                    self.send_error_response(403, "JWT target audience mismatch. Verify Client ID configuration.")
                    return

                email = token_info.get('email')
                name = token_info.get('name')
                picture = token_info.get('picture', '')

                # Sync user details in datastore
                conn = sqlite3.connect(DB_FILE)
                cursor = conn.cursor()
                cursor.execute('''
                    INSERT INTO users (email, name, picture, role)
                    VALUES (?, ?, ?, 'student')
                    ON CONFLICT(email) DO UPDATE SET name=excluded.name, picture=excluded.picture
                ''', (email, name, picture))
                conn.commit()
                conn.close()

                self.send_json_response({
                    "status": "success",
                    "user": {
                        "name": name,
                        "email": email,
                        "picture": picture
                    }
                })
        except urllib.error.HTTPError as e:
            err_body = e.read().decode('utf-8')
            print("[Google Auth] Error validating token:", err_body)
            self.send_error_response(401, f"Google token verification failed: {err_body}")
        except Exception as e:
            print("[Google Auth] Connection error:", e)
            self.send_error_response(500, f"Authentication connection error: {str(e)}")

    # POST /api/auth/bypass
    def handle_bypass_auth(self, payload):
        name = payload.get('name', '').strip()
        email = payload.get('email', '').strip()
        picture = payload.get('picture', '').strip()

        if not name or not email:
            self.send_error_response(400, "Bypass profile details missing.")
            return

        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO users (email, name, picture, role)
            VALUES (?, ?, ?, 'student')
            ON CONFLICT(email) DO UPDATE SET name=excluded.name, picture=excluded.picture
        ''', (email, name, picture))
        conn.commit()
        conn.close()

        self.send_json_response({
            "status": "success",
            "user": {
                "name": name,
                "email": email,
                "picture": picture
            }
        })

    # POST /api/payment/create-order
    def handle_create_order(self, payload):
        thali_type = payload.get('thali_type')
        if thali_type not in ['Veg Thali', 'Non-Veg Thali']:
            self.send_error_response(400, "Invalid meal thali type.")
            return

        price_map = {'Veg Thali': 60, 'Non-Veg Thali': 80}
        amount_in_rupees = price_map[thali_type]
        amount_in_paise = amount_in_rupees * 100

        conf = get_config()
        key_id = conf.get('razorpay_key_id')
        key_secret = conf.get('razorpay_key_secret')

        # Fallback to Test Mock Order if Secret is not set
        if not key_secret or key_id == 'rzp_test_zHsn7sN6rMvH5e':
            mock_order_id = f"order_mock_{int(time.time())}"
            print(f"[Razorpay Bypass] Creating simulated order: {mock_order_id}")
            self.send_json_response({
                "status": "success",
                "order_id": mock_order_id,
                "is_mock": True
            })
            return

        # Secure Order Creation call to Razorpay REST API
        rzp_url = "https://api.razorpay.com/v1/orders"
        order_payload = {
            "amount": amount_in_paise,
            "currency": "INR",
            "receipt": f"receipt_gitam_{int(time.time())}"
        }
        
        # Compile Authorization header bytes
        auth_str = f"{key_id}:{key_secret}"
        auth_b64 = base64.b64encode(auth_str.encode('utf-8')).decode('utf-8')
        
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Basic {auth_b64}"
        }

        try:
            req_data = json.dumps(order_payload).encode('utf-8')
            req = urllib.request.Request(rzp_url, data=req_data, headers=headers, method='POST')
            with urllib.request.urlopen(req, context=SSL_CONTEXT) as resp:
                rzp_order = json.loads(resp.read().decode('utf-8'))
                self.send_json_response({
                    "status": "success",
                    "order_id": rzp_order.get('id'),
                    "is_mock": False
                })
        except urllib.error.HTTPError as e:
            err_msg = e.read().decode('utf-8')
            print("[Razorpay API Error]:", err_msg)
            self.send_error_response(502, f"Gateway error: {err_msg}")
        except Exception as e:
            print("[Razorpay Connection Error]:", e)
            self.send_error_response(500, f"Could not connect to payment gateway: {str(e)}")

    # POST /api/payment/verify
    def handle_verify_payment(self, payload):
        order_id = payload.get('order_id')
        payment_id = payload.get('payment_id')
        signature = payload.get('signature')
        thali_type = payload.get('thali_type')
        student_email = payload.get('student_email')
        student_name = payload.get('student_name')
        
        if not all([order_id, payment_id, thali_type, student_email, student_name]):
            self.send_error_response(400, "Missing payment verification parameters.")
            return

        price_map = {'Veg Thali': 60, 'Non-Veg Thali': 80}
        amount = price_map[thali_type]
        now_time = datetime.now().strftime("%d-%b-%Y %I:%M %p")
        rand_num = hashlib.sha256(payment_id.encode()).hexdigest()[:4].upper()
        sec_code = f"OK-{'VEG' if thali_type == 'Veg Thali' else 'NVG'}-{rand_num}"

        # 1. Verification Logic
        is_verified = False
        if order_id.startswith('order_mock_'):
            is_verified = True
        else:
            conf = get_config()
            key_secret = conf.get('razorpay_key_secret')
            if not key_secret:
                self.send_error_response(500, "Gateway Secret is missing on server.")
                return
                
            # Verify Signature using HMAC-SHA256
            msg = f"{order_id}|{payment_id}".encode('utf-8')
            key = key_secret.encode('utf-8')
            generated_sig = hmac.new(key, msg, hashlib.sha256).hexdigest()
            is_verified = hmac.compare_digest(generated_sig, signature)

        if not is_verified:
            self.send_error_response(400, "Razorpay signature verification failed. Tampering detected.")
            return

        # 2. Write Transaction to DB
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        try:
            cursor.execute('''
                INSERT INTO transactions (id, student_email, student_name, thali_type, amount, date, status, redeemed_at, security_code)
                VALUES (?, ?, ?, ?, ?, ?, 'Paid', NULL, ?)
            ''', (payment_id, student_email, student_name, thali_type, amount, now_time, sec_code))
            conn.commit()
        except sqlite3.IntegrityError:
            pass # Transaction already saved
        finally:
            conn.close()

        self.send_json_response({
            "status": "success",
            "coupon": {
                "id": payment_id,
                "type": thali_type,
                "price": amount,
                "purchasedAt": now_time,
                "status": "ACTIVE - READY",
                "code": sec_code,
                "scratchedAt": None
            }
        })

    # GET /api/coupon/status?id=...
    def handle_coupon_status(self):
        query_string = self.path.split('?')[-1]
        params = dict(q.split('=') for q in query_string.split('&') if '=' in q)
        coupon_id = params.get('id')

        if not coupon_id:
            self.send_error_response(400, "Missing coupon ID.")
            return

        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("SELECT status, redeemed_at FROM transactions WHERE id = ?", (coupon_id,))
        row = cursor.fetchone()
        conn.close()

        if not row:
            self.send_error_response(404, "Coupon transaction not found.")
            return

        # Status returned: 'Paid' -> mapping to ACTIVE, 'Redeemed' -> USED
        coupon_status = 'USED' if row[0] == 'Redeemed' else 'ACTIVE - READY'
        self.send_json_response({
            "status": "success",
            "coupon_status": coupon_status,
            "redeemed_at": row[1]
        })

    # GET /api/admin/stats
    def handle_admin_stats(self):
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        
        cursor.execute("SELECT COUNT(*) FROM transactions WHERE thali_type = 'Veg Thali'")
        veg_count = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM transactions WHERE thali_type = 'Non-Veg Thali'")
        nonveg_count = cursor.fetchone()[0]
        
        cursor.execute("SELECT SUM(amount) FROM transactions")
        total_revenue = cursor.fetchone()[0] or 0
        
        conn.close()

        self.send_json_response({
            "veg_count": veg_count,
            "nonveg_count": nonveg_count,
            "revenue": total_revenue
        })

    # GET /api/admin/ledger
    def handle_admin_ledger(self):
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("SELECT student_name, student_email, thali_type, amount, id, date, status, redeemed_at FROM transactions ORDER BY date DESC")
        rows = cursor.fetchall()
        conn.close()

        ledger = []
        for r in rows:
            ledger.append({
                "studentName": r[0],
                "studentRoll": r[1], # email
                "type": r[2],
                "price": r[3],
                "id": r[4],
                "date": r[5],
                "status": r[6], # 'Paid' or 'Redeemed'
                "redeemedAt": r[7]
            })

        self.send_json_response(ledger)

    # GET /api/attendant/lookup?query=...
    def handle_attendant_lookup(self):
        query_string = self.path.split('?')[-1]
        params = dict(q.split('=') for q in query_string.split('&') if '=' in q)
        search_query = urllib.parse.unquote(params.get('query', '')).strip().lower()

        if not search_query:
            self.send_error_response(400, "Missing search query.")
            return

        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        # Find active paid transactions for roll email or coupon reference code
        cursor.execute('''
            SELECT student_name, student_email, thali_type, amount, id, date, status, redeemed_at 
            FROM transactions 
            WHERE LOWER(student_email) = ? OR LOWER(id) = ?
        ''', (search_query, search_query))
        row = cursor.fetchone()
        conn.close()

        if not row:
            self.send_error_response(404, "No active transaction log records match query.")
            return

        self.send_json_response({
            "status": "success",
            "record": {
                "studentName": row[0],
                "studentRoll": row[1],
                "type": row[2],
                "price": row[3],
                "id": row[4],
                "date": row[5],
                "status": row[6],
                "redeemedAt": row[7]
            }
        })

    # POST /api/attendant/redeem
    def handle_attendant_redeem(self, payload):
        coupon_id = payload.get('id')
        if not coupon_id:
            self.send_error_response(400, "Missing coupon transaction ID.")
            return

        now_time = datetime.now().strftime("%d-%b-%Y %I:%M %p")

        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        
        # Verify transaction status
        cursor.execute("SELECT status FROM transactions WHERE id = ?", (coupon_id,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            self.send_error_response(404, "Meal voucher record not found.")
            return
        if row[0] == 'Redeemed':
            conn.close()
            self.send_error_response(400, "Voucher has already been redeemed.")
            return

        # Mark as Redeemed
        cursor.execute("UPDATE transactions SET status = 'Redeemed', redeemed_at = ? WHERE id = ?", (now_time, coupon_id))
        conn.commit()
        conn.close()

        self.send_json_response({
            "status": "success",
            "message": "Voucher successfully redeemed in datastore.",
            "redeemed_at": now_time
        })

# --- Server Start ---
if __name__ == '__main__':
    # Initialize SQLite database
    init_db()
    
    # Configure and run the HTTP server
    handler = CanteenRequestHandler
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), handler) as httpd:
        print(f"[Server] Full-Stack Canteen server started on PORT {PORT} (http://localhost:{PORT})")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n[Server] Shutting down Canteen server...")
            httpd.shutdown()
            sys.exit(0)
