import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
import "./apple-theme.css";
import "./dialogs.js";
import "./selectMenu.js";
// Aviso discreto enquanto o servidor volta
{ let el; window.addEventListener("helora:reconnecting", (e) => {
  if (e.detail) { if (!el) { el = document.createElement("div"); el.className = "hl-reconnect"; el.innerHTML = "<span></span>Reconectando à Helora…"; document.body.appendChild(el); } }
  else if (el) { el.remove(); el = null; } }); }
try { if (localStorage.getItem("helora:theme") === "dark") document.documentElement.dataset.theme = "dark"; } catch {}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// App no celular (PWA): registra o service worker para permitir "Adicionar à tela inicial".
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}

// Corretor ortográfico em todos os campos de texto do sistema (CRM, configurações, etc.)
document.documentElement.lang = "pt-BR";
document.addEventListener("focusin", (e) => {
  const el = e.target;
  if (!(el instanceof HTMLElement)) return;
  const isText = el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && ["text", "search", ""].includes((el.getAttribute("type") || "").toLowerCase()));
  if (!isText || el.hasAttribute("spellcheck")) return;
  const hint = `${el.getAttribute("name") || ""} ${el.getAttribute("placeholder") || ""}`.toLowerCase();
  if (/e-?mail|telefone|whats|cpf|cnpj|cep|url|link|senha|https?:|\d{4}/.test(hint)) return;
  el.setAttribute("spellcheck", "true");
  el.setAttribute("lang", "pt-BR");
});
