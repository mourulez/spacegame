const ENTER_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>';
const EXIT_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/></svg>';

/**
 * Top-right toggle for fullscreen, plus the F key. Not shown where the browser
 * can't do it (e.g. iPhone Safari, or an iframe without allowfullscreen).
 */
export function addFullscreenButton(root: HTMLElement, target: Element = document.documentElement) {
  if (!document.fullscreenEnabled) return;

  const button = document.createElement('button');
  button.className = 'fullscreen-button';
  root.append(button);

  const toggle = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      target
        .requestFullscreen()
        .then(lockLandscape)
        .catch(() => {});
    }
  };

  const sync = () => {
    const active = document.fullscreenElement !== null;
    button.innerHTML = active ? EXIT_ICON : ENTER_ICON;
    button.setAttribute('aria-label', active ? 'Salir de pantalla completa' : 'Pantalla completa');
  };

  button.addEventListener('click', toggle);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyF' && !e.repeat) toggle();
  });
  document.addEventListener('fullscreenchange', sync);
  sync();
}

/** The game is landscape only. Browsers that can lock the orientation (Android, in fullscreen) do it here. */
function lockLandscape() {
  const orientation = screen.orientation as ScreenOrientation & { lock?: (type: string) => Promise<void> };
  return orientation.lock?.('landscape');
}
