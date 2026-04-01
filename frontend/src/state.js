export function createAppState() {
  const rawPage = document.body?.dataset?.page || 'lobby';
  return {
    roomId: null,
    account: '',
    roomAccounts: {},
    transportMode: 'auto',
    autoRefreshSeconds: 0,
    eventSeq: 0,
    avatarPage: 1,
    page: rawPage,
  };
}
