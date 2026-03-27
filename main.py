import argparse

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


def build_parser():
	parser = argparse.ArgumentParser(description='ShadowHunters development entrypoint')
	subparsers = parser.add_subparsers(dest='command')

	serve_parser = subparsers.add_parser('serve', help='run integrated frontend/backend HTTP server')
	serve_parser.add_argument('--host', default='127.0.0.1')
	serve_parser.add_argument('--port', type=int, default=5600)

	subparsers.add_parser('validate', help='run backend validation flows')
	return parser


if __name__ == '__main__':
	parser = build_parser()
	args = parser.parse_args()

	if args.command == 'serve':
		run_server(host=args.host, port=args.port)
	else:
		run_validations()