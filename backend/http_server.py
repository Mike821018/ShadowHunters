import json
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Tuple
from urllib.parse import parse_qs, urlparse

from backend.room_manager import RoomManager


class ShadowHuntersHTTPServer(ThreadingHTTPServer):
    # Browsers open many parallel connections for JS/CSS; default backlog (~5) can drop bursts behind ngrok.
    request_queue_size = 128

    def __init__(self, server_address: Tuple[str, int], handler_class, *, root_dir: Path):
        super().__init__(server_address, handler_class)
        self.root_dir = root_dir
        self.room_manager = RoomManager()


class ShadowHuntersRequestHandler(SimpleHTTPRequestHandler):
    server_version = 'ShadowHuntersHTTP/1.0'

    def __init__(self, *args, directory=None, **kwargs):
        super().__init__(*args, directory=directory, **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/room_events':
            return self._handle_room_events(parsed.query)
        if parsed.path == '/api/game_records':
            return self._handle_game_records(parsed.query)
        if parsed.path == '/api/player_stats':
            return self._handle_player_stats(parsed.query)
        if parsed.path == '/api/trip_directory':
            return self._handle_trip_directory(parsed.query)
        if parsed.path == '/api/trip_profile':
            return self._handle_trip_profile(parsed.query)
        if parsed.path == '/api/leaderboard':
            return self._handle_leaderboard(parsed.query)
        if parsed.path == '/api/player_games':
            return self._handle_player_games(parsed.query)
        if parsed.path == '/api/summary_stats':
            return self._handle_summary_stats()
        if parsed.path == '/api/room_stats':
            return self._handle_room_stats(parsed.query)
        if parsed.path == '/api/avatar_catalog':
            return self._handle_avatar_catalog()
        if parsed.path == '/api/version_notes':
            return self._handle_version_notes()
        if parsed.path == '/api/announcement':
            return self._handle_announcement()
        if parsed.path.startswith('/api/game_record/'):
            record_id = parsed.path.rsplit('/', 1)[-1]
            return self._handle_game_record(record_id)
        if parsed.path == '/api/game_record_by_room':
            return self._handle_game_record_by_room(parsed.query)
        if parsed.path == '/':
            self.path = '/index.html'
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != '/api/dispatch':
            self._send_json(
                HTTPStatus.NOT_FOUND,
                {
                    'ok': False,
                    'event': 'unknown',
                    'data': None,
                    'error': {
                        'title': 'Request Failed',
                        'status': HTTPStatus.NOT_FOUND,
                        'detail': 'endpoint not found',
                        'code': 'NOT_FOUND',
                        'errors': [],
                    },
                    'meta': {'version': '1.0.0'},
                },
            )
            return

        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            length = 0

        raw_body = self.rfile.read(length) if length > 0 else b'{}'

        try:
            payload = json.loads(raw_body.decode('utf-8'))
        except json.JSONDecodeError:
            self._send_json(
                HTTPStatus.BAD_REQUEST,
                {
                    'ok': False,
                    'event': 'unknown',
                    'data': None,
                    'error': {
                        'title': 'Request Failed',
                        'status': HTTPStatus.BAD_REQUEST,
                        'detail': 'invalid JSON body',
                        'code': 'INVALID_JSON',
                        'errors': [],
                    },
                    'meta': {'version': '1.0.0'},
                },
            )
            return

        action = payload.get('action')
        action_payload = payload.get('payload', {})

        if not action or not isinstance(action_payload, dict):
            self._send_json(
                HTTPStatus.BAD_REQUEST,
                {
                    'ok': False,
                    'event': action or 'unknown',
                    'data': None,
                    'error': {
                        'title': 'Request Failed',
                        'status': HTTPStatus.BAD_REQUEST,
                        'detail': 'action and payload are required',
                        'code': 'INVALID_PAYLOAD',
                        'errors': [],
                    },
                    'meta': {'version': '1.0.0'},
                },
            )
            return

        result = self.server.room_manager.api_dispatch(action, action_payload)
        status_code = result.get('error', {}).get('status', HTTPStatus.OK) if not result.get('ok', False) else HTTPStatus.OK
        self._send_json(status_code, result)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def _send_json(self, status_code: int, data):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _write_sse_event(self, event_id: int, event_name: str, data):
        payload = json.dumps(data, ensure_ascii=False)
        chunks = [
            f"id: {int(event_id)}\n",
            f"event: {str(event_name or 'message')}\n",
            f"data: {payload}\n\n",
        ]
        for chunk in chunks:
            self.wfile.write(chunk.encode('utf-8'))
        self.wfile.flush()

    def _write_sse_comment(self, text: str = 'keepalive'):
        self.wfile.write(f": {text}\n\n".encode('utf-8'))
        self.wfile.flush()

    def _handle_room_events(self, query: str):
        params = self._query_params(query)
        room_id_raw = (params.get('room_id') or [''])[0]
        account = str((params.get('account') or [''])[0] or '').strip() or None
        last_event_id_raw = str((params.get('last_event_id') or [''])[0] or '').strip()
        header_last_event_id = str(self.headers.get('Last-Event-ID', '') or '').strip()
        if not last_event_id_raw and header_last_event_id:
            last_event_id_raw = header_last_event_id

        try:
            room_id = int(room_id_raw)
            if room_id <= 0:
                raise ValueError()
        except Exception:
            return self._send_json(HTTPStatus.BAD_REQUEST, {'error': 'room_id must be a positive integer'})

        if not self.server.room_manager.get_room(room_id):
            return self._send_json(HTTPStatus.NOT_FOUND, {'error': 'room not found'})

        try:
            last_event_id = max(0, int(last_event_id_raw or 0))
        except Exception:
            last_event_id = 0

        self.send_response(HTTPStatus.OK)
        self.send_header('Content-Type', 'text/event-stream; charset=utf-8')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0, s-maxage=0, no-transform')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        self.send_header('CDN-Cache-Control', 'no-store')
        self.send_header('Cloudflare-CDN-Cache-Control', 'no-store')
        self.send_header('Content-Encoding', 'identity')
        self.send_header('Connection', 'keep-alive')
        self.send_header('X-Accel-Buffering', 'no')
        self.end_headers()

        try:
            room_data = self.server.room_manager.api_get_room_state({
                'room_id': room_id,
                'account': account,
            })
            if room_data.get('ok', False):
                init_payload = {
                    'room_id': room_id,
                    'state': room_data.get('data'),
                }
                self._write_sse_event(last_event_id, 'room_state_changed', init_payload)

            while True:
                events = self.server.room_manager.wait_room_events(
                    room_id,
                    last_event_id,
                    timeout_seconds=20.0,
                )
                if not events:
                    if not self.server.room_manager.get_room(room_id):
                        self._write_sse_event(last_event_id + 1, 'room_closed', {'room_id': room_id})
                        return
                    self._write_sse_comment('ping')
                    continue
                for event in events:
                    event_id = int(event.get('id', 0) or 0)
                    event_name = str(event.get('event', 'message') or 'message')
                    self._write_sse_event(event_id, event_name, event.get('data'))
                    last_event_id = max(last_event_id, event_id)
                    if event_name == 'room_closed':
                        return
        except (BrokenPipeError, ConnectionResetError):
            return

    def _query_params(self, query: str):
        return parse_qs(query, keep_blank_values=True)

    def _handle_player_stats(self, query: str):
        params = self._query_params(query)
        account = (params.get('account') or [''])[0]
        result = self.server.room_manager.records_api.api_get_player_stats(account)
        status = HTTPStatus.OK if 'error' not in result else HTTPStatus.NOT_FOUND
        self._send_json(status, result)

    def _handle_game_records(self, query: str):
        params = self._query_params(query)
        limit_raw = (params.get('limit') or ['100'])[0]
        page_raw = (params.get('page') or ['1'])[0]
        page_size_raw = (params.get('page_size') or ['20'])[0]
        search = (params.get('search') or [''])[0]
        limit = int(limit_raw or 100)
        page = int(page_raw or 1)
        page_size = int(page_size_raw or 20)
        result = self.server.room_manager.records_api.api_get_game_records(limit, page, page_size, search=search)
        self._send_json(HTTPStatus.OK, result)

    def _handle_trip_directory(self, query: str):
        params = self._query_params(query)
        keyword = (params.get('keyword') or [''])[0]
        limit_raw = (params.get('limit') or ['200'])[0]
        page_raw = (params.get('page') or ['1'])[0]
        page_size_raw = (params.get('page_size') or ['20'])[0]
        limit = int(limit_raw or 200)
        page = int(page_raw or 1)
        page_size = int(page_size_raw or 20)
        result = self.server.room_manager.records_api.api_get_trip_directory(
            keyword=keyword,
            limit=limit,
            page=page,
            page_size=page_size,
        )
        self._send_json(HTTPStatus.OK, result)

    def _handle_trip_profile(self, query: str):
        params = self._query_params(query)
        trip = (params.get('trip') or [''])[0]
        if not trip:
            self._send_json(HTTPStatus.BAD_REQUEST, {'error': 'trip is required'})
            return
        limit_raw = (params.get('limit') or ['50'])[0]
        limit = int(limit_raw or 50)
        nickname_page = int((params.get('nickname_page') or ['1'])[0] or 1)
        game_page = int((params.get('game_page') or ['1'])[0] or 1)
        rating_page = int((params.get('rating_page') or ['1'])[0] or 1)
        page_size = int((params.get('page_size') or ['20'])[0] or 20)
        result = self.server.room_manager.records_api.api_get_trip_profile(
            trip=trip,
            limit=limit,
            nickname_page=nickname_page,
            game_page=game_page,
            rating_page=rating_page,
            page_size=page_size,
        )
        status = HTTPStatus.OK if 'error' not in result else HTTPStatus.NOT_FOUND
        self._send_json(status, result)

    def _handle_leaderboard(self, query: str):
        params = self._query_params(query)
        scope = (params.get('scope') or ['global'])[0]
        room_id_raw = (params.get('room_id') or [None])[0]
        limit_raw = (params.get('limit') or ['50'])[0]
        room_id = int(room_id_raw) if room_id_raw not in (None, '') else None
        limit = int(limit_raw or 50)
        result = self.server.room_manager.records_api.api_get_leaderboard(scope, room_id, limit)
        self._send_json(HTTPStatus.OK, result)

    def _handle_game_record(self, record_id: str):
        result = self.server.room_manager.records_api.api_get_game_record(record_id)
        status = HTTPStatus.OK if 'error' not in result else HTTPStatus.NOT_FOUND
        self._send_json(status, result)

    def _handle_game_record_by_room(self, query: str):
        params = self._query_params(query)
        room_id_raw = (params.get('room_id') or [''])[0]
        if not room_id_raw:
            self._send_json(HTTPStatus.BAD_REQUEST, {'error': 'room_id is required'})
            return
        try:
            room_id = int(room_id_raw)
        except (TypeError, ValueError):
            self._send_json(HTTPStatus.BAD_REQUEST, {'error': 'room_id must be an integer'})
            return
        result = self.server.room_manager.records_api.api_get_game_record_by_room_id(room_id)
        status = HTTPStatus.OK if 'error' not in result else HTTPStatus.NOT_FOUND
        self._send_json(status, result)

    def _handle_player_games(self, query: str):
        params = self._query_params(query)
        account = (params.get('account') or [''])[0]
        limit_raw = (params.get('limit') or ['20'])[0]
        limit = int(limit_raw or 20)
        result = self.server.room_manager.records_api.api_get_player_games(account, limit)
        self._send_json(HTTPStatus.OK, result)

    def _handle_room_stats(self, query: str):
        params = self._query_params(query)
        room_id_raw = (params.get('room_id') or [''])[0]
        if not room_id_raw:
            self._send_json(HTTPStatus.BAD_REQUEST, {'error': 'room_id is required'})
            return
        result = self.server.room_manager.records_api.api_get_room_stats(int(room_id_raw))
        status = HTTPStatus.OK if 'error' not in result else HTTPStatus.NOT_FOUND
        self._send_json(status, result)

    def _handle_summary_stats(self):
        result = self.server.room_manager.records_api.api_get_summary_stats()
        self._send_json(HTTPStatus.OK, result)

    def _handle_avatar_catalog(self):
        result = self.server.room_manager.api_get_avatar_catalog()
        self._send_json(HTTPStatus.OK, result)

    def _handle_version_notes(self):
        try:
            version_path = self.server.root_dir / 'VERSION.md'
            content = version_path.read_text(encoding='utf-8')
            encoded = content.encode('utf-8')
            self.send_response(HTTPStatus.OK)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.send_header('Content-Length', str(len(encoded)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(encoded)
        except Exception:
            self.send_response(HTTPStatus.NOT_FOUND)
            self.send_header('Content-Length', '0')
            self.end_headers()

    def _handle_announcement(self):
        try:
            announcement_path = self.server.root_dir / 'announcement.txt'
            content = announcement_path.read_text(encoding='utf-8')
            encoded = content.encode('utf-8')
            self.send_response(HTTPStatus.OK)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.send_header('Content-Length', str(len(encoded)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(encoded)
        except Exception:
            self.send_response(HTTPStatus.NOT_FOUND)
            self.send_header('Content-Length', '0')
            self.end_headers()


def run_server(host: str = '127.0.0.1', port: int = 5600):
    root_dir = Path(__file__).resolve().parent.parent
    frontend_dir = root_dir / 'frontend'
    handler_class = partial(ShadowHuntersRequestHandler, directory=str(frontend_dir))
    httpd = ShadowHuntersHTTPServer((host, port), handler_class, root_dir=root_dir)
    print(f'Serving ShadowHunters on http://{host}:{port}')
    print(f'Frontend: http://{host}:{port}/index.html')
    print(f'API: POST http://{host}:{port}/api/dispatch')
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
