export function scrollToElement(elementId: string): void {
  requestAnimationFrame(() => {
    const element = document.getElementById(elementId);

    if (!element) {
      return;
    }

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    element.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'start'
    });
  });
}
