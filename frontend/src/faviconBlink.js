// Favicon do mascote Helora no sistema: bola branca com olhos pretos; pisca e olha para os lados. No Safari fica parado.
(function () {
  function draw(dx, closed) {
    var c = document.createElement("canvas"); c.width = c.height = 64;
    var x = c.getContext("2d");
    var g = x.createRadialGradient(22, 18, 3, 32, 32, 32); g.addColorStop(0, "#ffffff"); g.addColorStop(.75, "#eef3fb"); g.addColorStop(1, "#c9d6ea");
    x.fillStyle = g; x.beginPath(); x.arc(32, 32, 29, 0, Math.PI * 2); x.fill();
    x.lineWidth = 2.5; x.strokeStyle = "#b9c7dd"; x.stroke();
    x.fillStyle = "#101820";
    var h = closed ? 2.5 : 16, y = closed ? 27 : 19;
    x.beginPath(); x.roundRect(21 + dx, y, 8, h, 4); x.roundRect(35 + dx, y, 8, h, 4); x.fill();
    return c.toDataURL("image/png");
  }
  try {
    var F = { c: draw(0, false), b: draw(0, true), l: draw(-5, false), r: draw(5, false) };
    var link = document.querySelector('link[rel="icon"]');
    if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
    link.type = "image/png"; link.href = F.c;
    var seq = [[["b", 150], ["c", 0]], [["l", 900], ["c", 300], ["r", 900], ["c", 0]], [["b", 120], ["c", 160], ["b", 120], ["c", 0]]];
    var tick = function () {
      if (!document.hidden) { var s = seq[Math.floor(Math.random() * seq.length)], t = 0; s.forEach(function (st) { setTimeout(function () { link.href = F[st[0]] }, t); t += st[1] }) }
      setTimeout(tick, 2800 + Math.random() * 2800);
    };
    setTimeout(tick, 2000);
  } catch (e) {}
})();
