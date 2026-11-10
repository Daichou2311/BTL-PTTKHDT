"""Server cục bộ: phục vụ website và lưu dữ liệu vào database.json (chỉ dùng thư viện chuẩn).
Chạy: python server.py  rồi mở http://localhost:8000
"""
import json
import os
import tempfile
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(DIR, 'database.json')
LOCK = threading.Lock()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split('?')[0] != '/api/db':
            return super().do_GET()          # file tĩnh: index.html, app.js, style.css
        with LOCK:
            if not os.path.exists(DB_FILE):
                return self._json(404, {'error': 'Chưa có database.json'})
            with open(DB_FILE, encoding='utf-8') as f:
                return self._json(200, json.load(f))

    def do_POST(self):
        if self.path != '/api/db':
            return self._json(404, {'error': 'Không tìm thấy'})
        try:
            data = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))))
            assert isinstance(data, dict) and 'users' in data and 'units' in data
        except Exception:
            return self._json(400, {'error': 'Dữ liệu không hợp lệ'})
        with LOCK:
            fd, tmp = tempfile.mkstemp(dir=DIR, suffix='.tmp')
            with os.fdopen(fd, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            os.replace(tmp, DB_FILE)         # ghi nguyên tử, không để file dở dang
        self._json(200, {'ok': True})


if __name__ == '__main__':
    port = 8000
    print(f'Mở http://localhost:{port}  (Ctrl+C để dừng)')
    ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
