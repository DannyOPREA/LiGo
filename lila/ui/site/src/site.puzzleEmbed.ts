// The daily puzzle embed (https://lichess.org/training/frame in lichess): the server draws the Go board as an
// SVG, so this only keeps the frame no taller than the window (chessground left in unit 3.19 part 2).
window.onload = () => {
  const el = document.querySelector<HTMLElement>('#daily-puzzle');
  if (!el) return;

  const resize = () => {
    const windowHeight = window.innerHeight;
    if (el.offsetHeight > windowHeight) {
      const textHeightOffset = el.querySelector<HTMLElement>('span.text')?.offsetHeight ?? 0;
      el.style.maxWidth = windowHeight - textHeightOffset + 'px';
    }
  };
  resize();
  window.addEventListener('resize', resize);
};
