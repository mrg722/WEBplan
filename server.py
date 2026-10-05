from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

ROOT = Path(__file__).parent

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

if __name__ == '__main__':
    print('PLAN 2.0 disponible en http://localhost:4173')
    ThreadingHTTPServer(('127.0.0.1', 4173), Handler).serve_forever()
