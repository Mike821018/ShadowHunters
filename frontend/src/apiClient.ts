import type { ApiAction, ApiRequest, Envelope } from './types';

export type ApiTransport = <TPayload extends Record<string, unknown>>(req: ApiRequest<TPayload>) => Promise<Envelope>;

export function createApiClient(transport: ApiTransport) {
  return {
    dispatch<TPayload extends Record<string, unknown>>(action: ApiAction, payload: TPayload) {
      return transport({ action, payload });
    },

    createRoom(room_name: string, options?: { room_comment?: string; require_trip?: boolean; hide_trip?: boolean; trip_min_games?: number; manager_trip?: string; manager_trip_encrypted?: boolean; turn_timeout_minutes?: number }) {
      return transport({
        action: 'create_room',
        payload: {
          room_name,
          room_comment: options?.room_comment || '',
          require_trip: Boolean(options?.require_trip),
          hide_trip: options?.hide_trip !== false,
          trip_min_games: Math.max(0, Number(options?.trip_min_games || 0)),
          manager_trip: options?.manager_trip || '',
          manager_trip_encrypted: options?.manager_trip_encrypted !== false,
        },
      });
    },

    listRooms() {
      return transport({ action: 'list_rooms', payload: {} });
    },

    joinRoom(room_id: number, params: { account: string; password: string; name: string; trip?: string; avatar_no?: number }) {
      return transport({
        action: 'join_room',
        payload: { room_id, player_info: params },
      });
    },

    loginRoom(room_id: number, account: string, password: string) {
      return transport({
        action: 'login_room',
        payload: { room_id, account, password },
      });
    },

    leaveRoom(room_id: number, account: string) {
      return transport({
        action: 'leave_room',
        payload: { room_id, account },
      });
    },

    startGame(room_id: number, seed?: number) {
      return transport({ action: 'start_game', payload: { room_id, seed } });
    },

    nextStep(room_id: number, params: { action?: boolean; action_type?: string; target?: unknown } = {}) {
      return transport({
        action: 'next_step',
        payload: {
          room_id,
          action: Boolean(params.action),
          action_type: params.action_type,
          target: params.target,
        },
      });
    },

    getRoomState(room_id: number) {
      return transport({ action: 'get_room_state', payload: { room_id } });
    },

    changeColor(room_id: number, account: string, color: string) {
      return transport({ action: 'change_color', payload: { room_id, account, color } });
    },

    revealCharacter(room_id: number, account: string) {
      return transport({ action: 'reveal_character', payload: { room_id, account } });
    },
  };
}
