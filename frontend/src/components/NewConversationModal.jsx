import React, { useEffect, useRef, useState } from "react";
import { Search, Paperclip, X, FileText, Check, MessageSquarePlus, ArrowLeft, ArrowRight, Send } from "lucide-react";
import { getContacts, startConversationApi, sendMediaMessage, getDepartments, getChannels } from "../api.js";
import { TemplateChooser, fillVars } from "./WaTemplates.jsx";
import { waTemplates } from "../api.js";
import Avatar from "./Avatar.jsx";

const fmtPhone = (d) => {
  const s = String(d || "");
  if (s.startsWith("55") && s.length >= 12) {
    const rest = s.slice(4);
    return `+55 (${s.slice(2, 4)}) ${rest.slice(0, rest.length - 4)}-${rest.slice(-4)}`;
  }
  return s ? `+${s}` : "";
};
/** Nome "de verdade": ignora nomes que são só pontos/símbolos (ex.: "+55•••••04"). */
const realName = (c) => {
  const n = String(c.name || c.pushName || "").trim();
  return n.replace(/[^A-Za-zÀ-ÿ]/g, "").length >= 2 ? n : "";
};

/** Iniciar atendimento: escolhe um contato (ou digita o número). Mensagem e anexos são opcionais. */
export default function NewConversationModal({ onClose, onStarted, initialContact }) {
  const [search, setSearch] = useState("");
  const [contacts, setContacts] = useState([]);
  const [phone, setPhone] = useState(initialContact?.phone || "55");
  const [name, setName] = useState(initialContact ? realName(initialContact) : "");
  const [text, setText] = useState(initialContact?.text || "");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);
  const [departments, setDepartments] = useState([]);
  const [departmentId, setDepartmentId] = useState("");
  const [chans, setChans] = useState([]);
  const [channelId, setChannelId] = useState("");
  const [tplV, setTplV] = useState(null);
  useEffect(() => { getChannels().then((l) => { const w = l.filter((c) => c.platform === "whatsapp"); setChans(w); }).catch(() => {}); }, []);
  const isCloud = chans.find((c) => c.id === channelId)?.provider === "cloud";
  useEffect(() => { getDepartments().then((l) => { setDepartments(l); if (l.length === 1) setDepartmentId(l[0].id); }).catch(() => {}); }, []);

  useEffect(() => {
    const t = setTimeout(() => getContacts(search).then((l) => setContacts(l.slice(0, 30))).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [search]);

  const pick = (c) => {
    setPhone(c.phone);
    setName(realName(c));
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const who = { name, phone };
      const template = isCloud && tplV ? { name: tplV.tpl.name, language: tplV.tpl.language, vars: fillVars(tplV.map, who, tplV.headerMedia && { ...tplV.headerMedia, kind: tplV.kind }) } : undefined;
      if (isCloud && !template) throw new Error("Escolha o template para iniciar a conversa.");
      const conv = await startConversationApi({ phone, name, text: isCloud ? "" : text.trim(), departmentId, channelId: channelId || undefined, template });
      if (template) waTemplates.saveMap(tplV.key, tplV.map).catch(() => {});
      if (!isCloud) for (const f of files) await sendMediaMessage(conv.id, f).catch((e) => setError(e.response?.data?.error || e.message));
      onStarted(conv);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
    setBusy(false);
  };
  const [step, setStep] = useState(1);
  const canNext = channelId && phone.length >= 12 && !(departments.length > 0 && !departmentId);
  const label = isCloud ? "Escolher template" : text.trim() || files.length ? "Iniciar e enviar" : "Abrir conversa";
  const chan = chans.find((c) => c.id === channelId);

  return (
    <div className="nc-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`nc-modal ${step === 2 ? "wide" : ""}`} role="dialog" aria-label="Nova conversa">
        {step === 1 ? (
          <div className="nc-head">
            <span className="nc-ico"><MessageSquarePlus size={18} /></span>
            <div><b>Nova conversa</b><small>Escolha um contato ou digite o número</small></div>
            <button type="button" className="nc-x" onClick={onClose} aria-label="Fechar"><X size={16} /></button>
          </div>
        ) : (
          <div className="nc-head">
            <button type="button" className="nc-back" onClick={() => setStep(1)}><ArrowLeft size={15} /> Voltar</button>
            <div><b>Escolha o template</b><small>Para <strong>{name || fmtPhone(phone)}</strong> · {chan?.name} (API oficial)</small></div>
            <span className="nc-step">Passo 2 de 2</span>
            <button type="button" className="nc-x" onClick={onClose} aria-label="Fechar"><X size={16} /></button>
          </div>
        )}

        {step === 1 ? (
          <div className="nc-body">
            <div className="nc-left">
              <div className="nc-search"><Search size={15} /><input placeholder="Buscar nos contatos" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus /></div>
              <div className="nc-k">{search ? "Resultados" : "Contatos"}</div>
              <div className="nc-list">
                {contacts.map((c) => {
                  const n = realName(c);
                  return (
                    <button key={c.id} type="button" className={`nc-row ${phone === c.phone ? "on" : ""}`} onClick={() => pick(c)}>
                      <Avatar name={n || "?"} size={34} />
                      <span><strong>{n || fmtPhone(c.phone)}</strong><small>{n ? fmtPhone(c.phone) : "Sem nome salvo"}</small></span>
                      {phone === c.phone && <Check size={15} />}
                    </button>
                  );
                })}
                {contacts.length === 0 && <div className="nc-empty">Nenhum contato encontrado. Digite o número ao lado.</div>}
              </div>
            </div>
            <div className="nc-right">
              <div className="nc-two">
                <label className="nc-f"><span>WhatsApp <i>*</i></span><input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="5584999998888" /></label>
                <label className="nc-f"><span>Nome</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Opcional" /></label>
              </div>
              <div className="nc-two">
                {departments.length > 0 && (
                  <label className="nc-f"><span>Setor <i>*</i></span>
                    <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                      <option value="">Escolha o setor</option>
                      {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </label>
                )}
                <label className="nc-f"><span>Enviar por <i>*</i></span>
                  <select value={channelId} onChange={(e) => { setChannelId(e.target.value); setTplV(null); }}>
                    <option value="">Escolha o número…</option>
                    {chans.map((c) => <option key={c.id} value={c.id}>{c.name}{c.provider === "cloud" ? " · API oficial" : " · QR Code"}</option>)}
                  </select>
                </label>
              </div>
              {isCloud ? (
                <div className="nc-note">Este número é da API oficial: a conversa começa com um template aprovado. No próximo passo você escolhe e vê como o cliente vai receber.</div>
              ) : (
                <>
                  <label className="nc-f"><span>Primeira mensagem <em>(opcional)</em></span>
                    <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Olá! Aqui é da ..." />
                  </label>
                  {files.map((f, i) => (
                    <div key={i} className="nc-file"><FileText size={15} /><span>{f.name}</span><button type="button" onClick={() => setFiles((c) => c.filter((_, j) => j !== i))}><X size={14} /></button></div>
                  ))}
                  <button type="button" className="nc-attach" onClick={() => fileRef.current?.click()}><Paperclip size={14} /> Anexar arquivo</button>
                  <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={(e) => { const l = [...(e.target.files || [])]; e.target.value = ""; setFiles((c) => [...c, ...l].slice(0, 10)); }} />
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="nc-tpl"><TemplateChooser wide channelId={channelId} who={{ name, phone }} value={tplV} onChange={setTplV} /></div>
        )}

        {error && <div className="admin-feedback error" style={{ margin: "0 22px 12px" }}>{error}</div>}
        <div className="nc-foot">
          <button type="button" className="nc-btn" onClick={onClose}>Cancelar</button>
          {step === 1 && isCloud
            ? <button type="button" className="nc-btn p" disabled={!canNext} onClick={() => setStep(2)}>{label} <ArrowRight size={15} /></button>
            : <button type="button" className="nc-btn p" disabled={busy || !canNext || (isCloud && !tplV)} onClick={submit}><Send size={15} /> {busy ? "Abrindo…" : isCloud ? "Enviar template" : label}</button>}
        </div>
      </div>
    </div>
  );
}
