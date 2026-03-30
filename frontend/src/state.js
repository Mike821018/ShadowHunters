export function createAppState() {
  const rawPage = document.body?.dataset?.page || 'lobby';
  const page = rawPage === 'room-preview' ? 'room' : rawPage;
  return {
    roomId: null,
    account: '',
    roomAccounts: {},
    transportMode: 'auto',
    autoRefreshSeconds: 0,
    eventSeq: 0,
    avatarPage: 1,
    page,
  };
}
