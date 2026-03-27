export type Problem = {
  type?: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  code: string;
  errors?: Array<Record<string, unknown>>;
};

export type Envelope<T = unknown> = {
  ok: boolean;
  event: string;
  data: T | null;
  error: Problem | null;
  meta: {
    timestamp: string;
    version: string;
  };
};

export type TargetRef =
  | { kind: 'none' }
  | { kind: 'player'; id: string }
  | { kind: 'area'; id: string };

export type ApiAction =
  | 'create_room'
  | 'list_rooms'
  | 'join_room'
  | 'leave_room'
  | 'login_room'
  | 'start_game'
  | 'next_step'
  | 'card_effect'
  | 'loot_from_kill'
  | 'steal_equipment'
  | 'get_room_state'
  | 'change_color'
  | 'abolish_room'
  | 'toggle_ready'
  | 'vote_kick'
  | 'reveal_character'
  | 'submit_trip_rating';

export type ApiRequest<TPayload = Record<string, unknown>> = {
  action: ApiAction;
  payload: TPayload;
};
