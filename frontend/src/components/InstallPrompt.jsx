import React, { useEffect, useState } from "react";
import { X, Share } from "lucide-react";

const KEY = "helora_pwa_dismiss";
const standalone = () => window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isSafari = () => /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios|chrome|android/i.test(navigator.userAgent);
const dismissedRecently = () => { try { return Date.now() - Number(localStorage.getItem(KEY) || 0) < 14 * 86400000; } catch { return false; } };

/** Convite para instalar o Helora como app (Android: botão; iPhone: passo a passo do Safari). */
export default function InstallPrompt() {
  const [evt, setEvt] = useState(null);
  const [ios, setIos] = useState(false);
  const [hide, setHide] = useState(true);

  useEffect(() => {
    if (standalone() || dismissedRecently()) return;
    const on = (e) => { e.preventDefault(); setEvt(e); setHide(false); };
    window.addEventListener("beforeinstallprompt", on);
    const installed = () => setHide(true);
    window.addEventListener("appinstalled", installed);
    let t;
    if (isIOS()) t = setTimeout(() => { setIos(true); setHide(false); }, 2500);
    return () => { window.removeEventListener("beforeinstallprompt", on); window.removeEventListener("appinstalled", installed); clearTimeout(t); };
  }, []);

  if (hide || (!evt && !ios)) return null;
  const close = () => { try { localStorage.setItem(KEY, String(Date.now())); } catch {} setHide(true); };
  const install = async () => {
    if (!evt) return;
    evt.prompt();
    try { await evt.userChoice; } catch {}
    setEvt(null);
    setHide(true);
  };

  return (
    <div className="pwa-banner" role="dialog" aria-label="Instalar o Helora">
      <img src="/icon-192.png" alt="" />
      <div className="pwa-banner-txt">
        <strong>Instale o Helora no celular</strong>
        {evt ? "Abre em tela cheia, com ícone e notificações de novas mensagens."
          : isSafari() ? <>Toque em <span className="pwa-ios"><Share size={14} /> Compartilhar</span> e depois em <b>“Adicionar à Tela de Início”</b>. Assim você recebe as notificações.</>
          : <>Abra o Helora no <b>Safari</b>, toque em <span className="pwa-ios"><Share size={14} /> Compartilhar</span> e em <b>“Adicionar à Tela de Início”</b>.</>}
      </div>
      {evt && <button type="button" className="pwa-go" onClick={install}>Instalar</button>}
      <button type="button" className="pwa-x" aria-label="Agora não" onClick={close}><X size={18} /></button>
    </div>
  );
}
