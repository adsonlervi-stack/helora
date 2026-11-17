// Favicon do mascote Helora piscando (Chrome, Edge, Firefox). No Safari fica parado.
function draw(closed) {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const x = c.getContext("2d"), s = 64 / 200;
  const g = x.createLinearGradient(0, 0, 64, 64); g.addColorStop(0, "#0071e3"); g.addColorStop(1, "#5ac8fa");
  x.fillStyle = g; x.beginPath(); x.roundRect(0, 0, 64, 64, 48 * s); x.fill();
  x.fillStyle = "#fff"; x.beginPath(); x.arc(32, 32, 66 * s, 0, Math.PI * 2); x.fill();
  x.fillStyle = "#101820";
  const h = closed ? 4 * s : 32 * s, y = closed ? 92 * s : 78 * s;
  x.beginPath(); x.roundRect(76 * s, y, 14 * s, h, 7 * s); x.roundRect(110 * s, y, 14 * s, h, 7 * s); x.fill();
  return c.toDataURL("image/png");
}
try {
  const open = draw(false), shut = draw(true);
  let link = document.querySelector('link[rel="icon"]');
  if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
  link.type = "image/png"; link.href = open;
  const tick = () => {
    if (!document.hidden) { link.href = shut; setTimeout(() => { link.href = open; }, 160); }
    setTimeout(tick, 3000 + Math.random() * 3000);
  };
  setTimeout(tick, 2500);
} catch {}
