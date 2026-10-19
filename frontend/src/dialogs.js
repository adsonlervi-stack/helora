// Avisos e confirmações do próprio Helora (no lugar do alert/confirm/prompt do navegador).
const ensureRoot = () => {
  let root = document.getElementById("hl-dialogs");
  if (!root) { root = document.createElement("div"); root.id = "hl-dialogs"; document.body.appendChild(root); }
  return root;
};
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** Aviso rápido no canto da tela (some sozinho). */
export function notify(message, type = "info") {
  const root = ensureRoot();
  let stack = root.querySelector(".hl-toasts");
  if (!stack) { stack = document.createElement("div"); stack.className = "hl-toasts"; root.appendChild(stack); }
  const t = document.createElement("div");
  const kind = type === "info" && /erro|falh|não foi|nao foi|inválid|invalid/i.test(String(message)) ? "error" : type;
  t.className = `hl-toast ${kind}`;
  t.innerHTML = `<span class="hl-toast-dot"></span><span>${esc(message).replace(/\n/g, "<br>")}</span>`;
  t.onclick = () => close();
  stack.appendChild(t);
  requestAnimationFrame(() => t.classList.add("in"));
  const close = () => { t.classList.remove("in"); setTimeout(() => t.remove(), 220); };
  setTimeout(close, Math.min(9000, 3200 + String(message).length * 35));
}

function modal({ title, message, input, okText = "Confirmar", cancelText = "Cancelar", danger = false }) {
  return new Promise((resolve) => {
    const root = ensureRoot();
    const wrap = document.createElement("div");
    wrap.className = "hl-modal-back";
    wrap.innerHTML = `<div class="hl-modal" role="dialog" aria-modal="true">
      ${title ? `<h3>${esc(title)}</h3>` : ""}
      ${message ? `<p>${esc(message).replace(/\n/g, "<br>")}</p>` : ""}
      ${input ? `<input class="hl-modal-input" value="${esc(input.value || "")}" placeholder="${esc(input.placeholder || "")}">` : ""}
      <div class="hl-modal-actions">
        <button type="button" class="hl-btn ghost" data-a="no">${esc(cancelText)}</button>
        <button type="button" class="hl-btn ${danger ? "danger" : "primary"}" data-a="ok">${esc(okText)}</button>
      </div></div>`;
    root.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add("in"));
    const field = wrap.querySelector(".hl-modal-input");
    (field || wrap.querySelector('[data-a="ok"]')).focus();
    if (field) field.select();
    const done = (ok) => {
      document.removeEventListener("keydown", onKey, true);
      wrap.classList.remove("in");
      setTimeout(() => wrap.remove(), 180);
      resolve(input ? (ok ? field.value : null) : ok);
    };
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); done(false); }
      if (e.key === "Enter") { e.preventDefault(); done(true); }
    };
    document.addEventListener("keydown", onKey, true);
    wrap.addEventListener("mousedown", (e) => { if (e.target === wrap) done(false); });
    wrap.querySelector('[data-a="ok"]').onclick = () => done(true);
    wrap.querySelector('[data-a="no"]').onclick = () => done(false);
  });
}

/** Pergunta sim/não. Ex.: if (await askConfirm("Excluir?")) … */
export const askConfirm = (message, opts = {}) =>
  modal({ message, okText: opts.okText || (/excluir|apagar|remover|descartar|desconectar|sair/i.test(message) ? "Confirmar" : "OK"), danger: opts.danger ?? /excluir|apagar|remover|descartar/i.test(message), ...opts });

/** Pede um texto. Devolve null se cancelar. */
export const askPrompt = (message, value = "", opts = {}) => modal({ title: message, input: { value }, okText: "Salvar", ...opts });

// Qualquer alert() que sobrar no código vira aviso do próprio sistema.
if (typeof window !== "undefined") window.alert = (m) => notify(m);
