"""Standalone local tile host with CORS, conditional requests and safe 204 misses."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin','*')
        self.send_header('Access-Control-Allow-Methods','GET, HEAD, OPTIONS')
        self.send_header('Cache-Control','public, max-age=3600' if self.path.endswith('.png') else 'no-cache')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204); self.end_headers()

    def send_head(self):
        # Missing prototype tiles remain transparent; no HTML/error floods.
        if self.path.endswith('.png') and not Path(self.translate_path(self.path)).is_file():
            self.send_response(204); self.end_headers(); return None
        return super().send_head()

if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--directory',default='.biome-data/tiles')
    p.add_argument('--port',type=int,default=8766)
    args=p.parse_args()
    root=Path(args.directory).resolve()
    if not root.is_dir(): p.error(f'Generate tiles first: {root}')
    print(f'Serving {root} at http://localhost:{args.port}',flush=True)
    ThreadingHTTPServer(('127.0.0.1',args.port),partial(Handler,directory=str(root))).serve_forever()
