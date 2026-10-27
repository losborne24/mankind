"""Standalone local tile host with CORS, conditional requests and safe 204 misses."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

TILE_SUFFIXES = ('.png','.webp')

class Handler(SimpleHTTPRequestHandler):
    # Python 3.9's default table has no WebP entry.
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.webp': 'image/webp'}

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin','*')
        self.send_header('Access-Control-Allow-Methods','GET, HEAD, OPTIONS')
        # Without this a cross-origin tile reports transferSize 0 in Resource
        # Timing, making local measurement of request bytes impossible.
        self.send_header('Timing-Allow-Origin','*')
        if getattr(self, 'absent', False):
            # Never cache "this tile is empty". Locally, absence is temporary:
            # a generation run writes tiles over many minutes, and a cached 204
            # leaves holes in the globe for the whole max-age — dark rectangles
            # that look exactly like missing data. Only real tile bodies are
            # cacheable. A versioned production prefix is immutable, so negative
            # caching is safe there and is configured at the CDN instead.
            self.send_header('Cache-Control','no-store')
        elif self.path.endswith(TILE_SUFFIXES):
            self.send_header('Cache-Control','public, max-age=3600')
        else:
            self.send_header('Cache-Control','no-cache')
        super().end_headers()

    def do_OPTIONS(self):
        self.absent = False
        self.send_response(204); self.end_headers()

    def send_head(self):
        # Ocean-only and out-of-coverage tiles are never generated. Answer 204 so
        # MapLibre treats them as empty rather than flooding errors; a production
        # object store answers 404, which MapLibre also tolerates.
        self.absent = (self.path.endswith(TILE_SUFFIXES)
                       and not Path(self.translate_path(self.path)).is_file())
        if self.absent:
            self.send_response(204); self.end_headers(); return None
        return super().send_head()

    def log_message(self,*a):
        if not getattr(self.server,'quiet',False): super().log_message(*a)

if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--directory',default='.biome-data/tiles')
    p.add_argument('--port',type=int,default=8766)
    p.add_argument('--quiet',action='store_true',help='Suppress per-request logging during large global sessions')
    args=p.parse_args()
    root=Path(args.directory).resolve()
    if not root.is_dir(): p.error(f'Generate tiles first: {root}')
    print(f'Serving {root} at http://localhost:{args.port}',flush=True)
    server=ThreadingHTTPServer(('127.0.0.1',args.port),partial(Handler,directory=str(root)))
    server.quiet=args.quiet
    server.serve_forever()
