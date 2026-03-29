import argparse
import os
import subprocess
import sys
import time
from urllib.error import URLError
from urllib.request import urlopen

from backend.http_server import run_server
from backend.room_manager import API_SCHEMAS, RoomManager
from backend.validation import validate_game_flow, validate_roll_7_flow


def run_validations():
	validation = validate_game_flow()
	roll_7_validation = validate_roll_7_flow()
	print('validation ok')
	print(validation)
	print('roll 7 validation ok')
	print(roll_7_validation)


def _run_subprocess(cmd, label: str):
	print(f'[test] running {label}: {" ".join(cmd)}')
	subprocess.run(cmd, check=True)


def _wait_for_server(host: str, port: int, timeout_seconds: float = 30.0):
	deadline = time.time() + timeout_seconds
	url = f'http://{host}:{port}/api/summary_stats'
	last_error = None
	while time.time() < deadline:
		try:
			with urlopen(url, timeout=5) as response:
				if response.status == 200:
					return
		except URLError as exc:
			last_error = exc
			time.sleep(0.5)
	raise RuntimeError(f'server did not become ready: {last_error}')


def run_test_suite(host: str, port: int, games: int, eight_player_games: int, batch_size: int):
	run_validations()
	_run_subprocess([sys.executable, '-m', 'scripts.issue6_smoke'], 'issue6 smoke')

	env = os.environ.copy()
	server_cmd = [sys.executable, 'main.py', 'serve', '--host', host, '--port', str(port)]
	print(f'[test] starting server: {" ".join(server_cmd)}')
	server_proc = subprocess.Popen(server_cmd, env=env)
	try:
		_wait_for_server(host, port)
		validator_cmd = [
			sys.executable,
			'scripts/run_http_validator_batched.py',
			'--base-url', f'http://{host}:{port}/api/dispatch',
			'--games', str(games),
			'--eight-player-games', str(eight_player_games),
			'--batch-size', str(batch_size),
		]
		_run_subprocess(validator_cmd, 'HTTP validator')
	finally:
		server_proc.terminate()
		try:
			server_proc.wait(timeout=10)
		except subprocess.TimeoutExpired:
			server_proc.kill()
			server_proc.wait(timeout=10)
		print('[test] server stopped')


def build_parser():
	parser = argparse.ArgumentParser(description='ShadowHunters development entrypoint')
	subparsers = parser.add_subparsers(dest='command')

	serve_parser = subparsers.add_parser('serve', help='run integrated frontend/backend HTTP server')
	serve_parser.add_argument('--host', default='127.0.0.1')
	serve_parser.add_argument('--port', type=int, default=5600)

	subparsers.add_parser('validate', help='run backend validation flows')
	test_parser = subparsers.add_parser('test', help='run validate, smoke, and HTTP regression tests')
	test_parser.add_argument('--host', default='127.0.0.1')
	test_parser.add_argument('--port', type=int, default=5600)
	test_parser.add_argument('--games', type=int, default=4)
	test_parser.add_argument('--eight-player-games', type=int, default=4)
	test_parser.add_argument('--batch-size', type=int, default=2)
	return parser


if __name__ == '__main__':
	parser = build_parser()
	args = parser.parse_args()

	if args.command == 'serve':
		run_server(host=args.host, port=args.port)
	elif args.command == 'test':
		run_test_suite(
			host=args.host,
			port=args.port,
			games=args.games,
			eight_player_games=args.eight_player_games,
			batch_size=args.batch_size,
		)
	else:
		run_validations()