// Troca a lista nativa (cinza) de todos os <select> do sistema pelo menu branco do CRM.
// O <select> continua existindo: só a lista que abre é nossa. No celular fica a nativa.
const touch = window.matchMedia?.("(pointer: coarse)").matches;
let pop = null, cur = null;

function close() {
  if (!pop) return;
  pop.remove(); pop = null;
  cur?.classList.remove("hs-open"); cur = null;
  window.removeEventListener("scroll", onScroll, true);
}
function onScroll(e) { if (pop && !pop.contains(e.target)) close(); }

function choose(sel, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
  setter.call(sel, value);
  sel.dispatchEvent(new Event("input", { bubbles: true }));
  sel.dispatchEvent(new Event("change", { bubbles: true }));
  close(); sel.focus();
}

function open(sel) {
  close();
  cur = sel; sel.classList.add("hs-open");
  const items = [];
  for (const el of sel.children) {
    if (el.tagName === "OPTGROUP") {
      items.push({ group: el.label });
      for (const o of el.children) items.push({ o });
    } else items.push({ o: el });
  }
  const opts = items.filter((x) => x.o);
  pop = document.createElement("div");
  pop.className = "hsel-pop hs-native";
  let q = null;
  if (opts.length > 8) {
    q = document.createElement("input");
    q.className = "hsel-q"; q.placeholder = "Buscar…";
    pop.appendChild(q);
  }
  const list = document.createElement("div");
  list.className = "hsel-list";
  pop.appendChild(list);
  const render = (t = "") => {
    list.innerHTML = "";
    const tl = t.trim().toLowerCase();
    let any = false;
    for (const it of items) {
      if (it.group) { if (!tl) { const g = document.createElement("div"); g.className = "hs-group"; g.textContent = it.group; list.appendChild(g); } continue; }
      const o = it.o;
      if (o.hidden) continue;
      if (tl && !o.textContent.toLowerCase().includes(tl)) continue;
      any = true;
      const b = document.createElement("button");
      b.type = "button";
      const on = o.value === sel.value && o.selected;
      b.className = "hsel-opt" + (on ? " on" : "") + (o.value === "" ? " placeholder" : "");
      b.disabled = o.disabled;
      b.innerHTML = `<span></span>${on ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>' : ""}`;
      b.firstChild.textContent = o.textContent;
      b.onclick = () => choose(sel, o.value);
      list.appendChild(b);
    }
    if (!any) { const e = document.createElement("div"); e.className = "hsel-empty"; e.textContent = "Nenhuma opção."; list.appendChild(e); }
  };
  render();
  if (q) {
    q.oninput = () => render(q.value);
    q.onkeydown = (e) => {
      if (e.key === "Enter") { e.preventDefault(); list.querySelector(".hsel-opt:not(:disabled)")?.click(); }
      if (e.key === "Escape") { close(); sel.focus(); }
    };
  }
  document.body.appendChild(pop);
  const r = sel.getBoundingClientRect();
  const w = Math.max(r.width, 180);
  const h = Math.min(pop.scrollHeight, 320);
  const below = window.innerHeight - r.bottom;
  pop.style.left = Math.min(r.left, window.innerWidth - w - 8) + "px";
  pop.style.minWidth = w + "px";
  if (below < h + 12 && r.top > below) pop.style.bottom = window.innerHeight - r.top + 4 + "px";
  else pop.style.top = r.bottom + 4 + "px";
  (q || list.querySelector(".on"))?.focus?.();
  list.querySelector(".on")?.scrollIntoView({ block: "nearest" });
  window.addEventListener("scroll", onScroll, true);
}

if (!touch) {
  document.addEventListener("mousedown", (e) => {
    const sel = e.target.closest?.("select");
    if (pop && !pop.contains(e.target) && sel !== cur) close();
    if (!sel || sel.multiple || sel.size > 1 || sel.disabled || sel.dataset.native != null) return;
    e.preventDefault();
    if (cur === sel) { close(); return; }
    sel.focus();
    open(sel);
  }, true);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && pop) { const s = cur; close(); s?.focus(); return; }
    const sel = e.target;
    if (sel?.tagName === "SELECT" && !sel.multiple && (e.key === " " || e.key === "Enter" || (e.altKey && e.key === "ArrowDown"))) { e.preventDefault(); open(sel); }
  }, true);
  window.addEventListener("resize", close);
}
