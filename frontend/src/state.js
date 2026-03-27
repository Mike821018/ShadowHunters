export function createAppState() {
  return {
    roomId: null,
    account: '',
    roomAccounts: {},
    transportMode: 'auto',
    autoRefreshSeconds: 0,
    eventSeq: 0,
    avatarPage: 1,
    page: document.body?.dataset?.page || 'lobby',
  };
}
