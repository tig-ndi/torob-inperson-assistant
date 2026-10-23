/** The shell-owned sheet button is the only path to the mobile map; a named map action may use it. */
export function revealMapOnMobile() {
  if (!window.matchMedia('(max-width: 959px)').matches) return;
  const control = document.querySelector<HTMLButtonElement>('.ub-sheet-control');
  if (control?.getAttribute('aria-expanded') === 'true') control.click();
  requestAnimationFrame(() => document.querySelector('.ub-map')?.scrollIntoView({ block: 'start' }));
}
