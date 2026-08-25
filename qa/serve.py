"""Static server for the hero build + a POST sink so the page can hand back
canvas captures for review. Dev/QA only — never part of the shipped build.

  GET  /...            -> files from the project root
  POST /__qa/<name>    -> body is a data: URL, saved to qa/<name>
"""
import base64
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QA = os.path.join(ROOT, "qa")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def do_GET(self):
        # /reference is study material only - never served, not even in dev
        if self.path.lstrip("/").startswith("reference"):
            self.send_error(403, "reference mirror is not served")
            return
        super().do_GET()

    def do_POST(self):
        if not self.path.startswith("/__qa/"):
            self.send_error(404)
            return
        name = os.path.basename(self.path[len("/__qa/"):]) or "capture.png"
        body = self.rfile.read(int(self.headers.get("Content-Length", 0))).decode("utf-8")
        payload = body.split(",", 1)[1] if body.startswith("data:") else body
        os.makedirs(QA, exist_ok=True)
        with open(os.path.join(QA, name), "wb") as f:
            f.write(base64.b64decode(payload))
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.end_headers()
        self.wfile.write(b"ok")

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
