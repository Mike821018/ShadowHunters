export function createAppState() {
  const rawPage = document.body?.dataset?.page || 'lobby';
  return {
    roomId: null,
    account: '',
    roomAccounts: {},
    transportMode: 'auto',
    skipTargetConfirm: false,
    autoEndTurn: true,
    eventSeq: 0,
    avatarPage: 1,
    page: rawPage,
  };
}
