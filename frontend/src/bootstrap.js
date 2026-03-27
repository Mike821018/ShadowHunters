export function bindTransportModeEvents({ el, setTransportMode, persistCurrentSession }) {
  el.btnUseAuto?.addEventListener('click', () => {
    setTransportMode('auto');
    persistCurrentSession();
  });

  el.btnUseHttp?.addEventListener('click', () => {
    setTransportMode('http');
    persistCurrentSession();
  });

  el.btnUseDemo?.addEventListener('click', () => {
    setTransportMode('demo');
    persistCurrentSession();
  });
}
