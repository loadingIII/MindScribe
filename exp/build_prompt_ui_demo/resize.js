const grid = document.querySelector('.builder-grid');
const handle = document.getElementById('resizeHandle');

if (grid && handle) {
  let dragging = false;

  const setRatio = (clientX) => {
    const rect = grid.getBoundingClientRect();
    const ratio = Math.max(32, Math.min(68, ((clientX - rect.left) / rect.width) * 100));
    grid.style.gridTemplateColumns = `calc(${ratio}% - 5px) 10px calc(${100 - ratio}% - 5px)`;
  };

  handle.addEventListener('pointerdown', (event) => {
    if (window.innerWidth <= 900) return;
    dragging = true;
    handle.setPointerCapture(event.pointerId);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  handle.addEventListener('pointermove', (event) => {
    if (dragging) setRatio(event.clientX);
  });

  handle.addEventListener('pointerup', () => {
    dragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });

  handle.addEventListener('keydown', (event) => {
    if (window.innerWidth <= 900) return;
    const rect = grid.getBoundingClientRect();
    const current = parseFloat(getComputedStyle(grid).gridTemplateColumns.split(' ')[0]);
    if (event.key === 'ArrowLeft') { event.preventDefault(); grid.style.gridTemplateColumns = `${Math.max(320, current - 24)}px 10px 1fr`; }
    if (event.key === 'ArrowRight') { event.preventDefault(); grid.style.gridTemplateColumns = `${Math.min(rect.width - 380, current + 24)}px 10px 1fr`; }
  });
}
