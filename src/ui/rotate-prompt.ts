const ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="3" width="10" height="18" rx="2"/><path d="M3 14a9 9 0 0 0 6 7M21 10a9 9 0 0 0-6-7"/></svg>';

/** Full-screen "rotate your device" message. CSS shows it only in portrait. */
export function addRotatePrompt(root: HTMLElement) {
  const prompt = document.createElement('div');
  prompt.className = 'rotate-prompt';
  prompt.innerHTML = `${ICON}<p>Gira el dispositivo para jugar en horizontal</p>`;
  root.append(prompt);
}
