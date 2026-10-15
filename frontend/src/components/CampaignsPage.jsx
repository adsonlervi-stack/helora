import React, { useEffect, useMemo, useState } from "react";
import { Megaphone, Plus, Play, Pause, XCircle, Trash2, Coins, X, Search, ArrowLeft, AlertTriangle } from "lucide-react";
import { getCampaigns, getCampaignApi, createCampaignApi, campaignActionApi, deleteCampaignApi, getCredits, getContacts, getLabels } from "../api.js";

const STATUS = {
  draft: ["Rascunho", "#8e8e93"], scheduled: ["Agendada", "#0a84ff"], running: ["Enviando", "#30d158"],
  paused: ["Pausada", "#ff9f0a"], done: ["Concluída", "#248a3d"], canceled: ["Cancelada", "#ff453a"]
};
const R_STATUS = { pending: "Na fila", sent: "Enviada", failed: "Falhou", skipped: "Pulada" };
const errText = (e) => e?.response?.data?.error || e?.message || "Erro";
const when = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

function parsePasted(text) {
  return text
    .split(/\n|;(?=\s*\d{10,})/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [a, b] = l.split(/[;,\t]/).map((x) => x.trim());
      const aDigits = (a || "").replace(/\D/g, "");
      if (aDigits.length >= 10) return { phone: aDigits, name: b || "" };
      return { phone: (b || "").replace(/\D/g, ""), name: a || "" };
    })
    .filter((r) => r.phone.length >= 10);
}

function NewCampaign({ balance, onClose, onCreated }) {
  const [f, setF] = useState({ name: "", message: "", mediaUrl: "", mediaType: "image", scheduledAt: "", minDelay: 15, maxDelay: 45, hourlyLimit: 120 });
  const [source, setSource] = useState("contacts"); // contacts | all | paste
  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState(new Set());
  const [pasted, setPasted] = useState("");
  const [showAdv, setShowAdv] = useState(true);
  const [variants, setVariants] = useState(["", ""]);
  const [labels, setLabels] = useState([]);
  const [pickedLabels, setPickedLabels] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  useEffect(() => {
    getContacts("").then(setContacts).catch(() => {});
    getLabels().then(setLabels).catch(() => {});
  }, []);

  const visible = useMemo(
    () => contacts.filter((c) => `${c.name || ""} ${c.pushName || ""} ${c.phone}`.toLowerCase().includes(search.toLowerCase())),
    [contacts, search]
  );
  const pastedList = useMemo(() => parsePasted(pasted), [pasted]);
  const count = source === "all" ? contacts.length : source === "contacts" ? picked.size : source === "labels" ? null : pastedList.length;

  const toggle = (id) =>
    setPicked((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const submit = async (start) => {
    setBusy(true);
    setError(null);
    try {
      const body = {
        ...f,
        mediaUrl: f.mediaUrl.trim() || null,
        scheduledAt: f.scheduledAt ? new Date(f.scheduledAt).toISOString() : null,
        allContacts: source === "all",
        contactIds: source === "contacts" ? [...picked] : [],
        recipients: source === "paste" ? pastedList : [],
        labelIds: source === "labels" ? [...pickedLabels] : [],
        variants: variants.map((v) => v.trim()).filter(Boolean)
      };
      const c = await createCampaignApi(body);
      if (start && !f.scheduledAt) await campaignActionApi(c.id, "start");
      onCreated();
      onClose();
    } catch (e) {
      setError(errText(e));
    }
    setBusy(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card lg-sheet camp-new" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h3>Nova campanha</h3>
          <button className="cv-icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        <label className="login-field"><span>Nome da campanha</span><input value={f.name} onChange={set("name")} placeholder="Ex: Renovação de seguro auto - outubro" autoFocus /></label>
        <label className="login-field">
          <span>Mensagem</span>
          <textarea rows={5} value={f.message} onChange={set("message")} placeholder="Olá {nome}! ..." />
          <small className="fe-hint">Use {"{nome}"} para o primeiro nome do contato. *negrito* e _itálico_ funcionam no WhatsApp.</small>
        </label>
        {variants.map((v, i) => (
          <label className="login-field" key={i}>
            <span>Versão {i + 2} da mensagem (recomendado)</span>
            <textarea rows={3} value={v} onChange={(e) => setVariants((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))} placeholder="Mesmo assunto, com outras palavras" />
          </label>
        ))}
        <small className="fe-hint">Cada contato recebe uma das versões, sorteada. Textos diferentes reduzem o risco de bloqueio do número.</small>
        <div className="client-two">
          <label className="login-field"><span>Imagem/vídeo/PDF (link, opcional)</span><input value={f.mediaUrl} onChange={set("mediaUrl")} placeholder="https://..." /></label>
          <label className="login-field"><span>Tipo do anexo</span>
            <select className="deal-stage-select" value={f.mediaType} onChange={set("mediaType")}>
              <option value="image">Imagem</option><option value="video">Vídeo</option><option value="document">Documento</option>
            </select>
          </label>
        </div>

        <div className="fe-field-label">Para quem</div>
        <div className="cv-segment" style={{ width: "100%" }}>
          <button className={source === "contacts" ? "active" : ""} onClick={() => setSource("contacts")}>Escolher contatos</button>
          <button className={source === "labels" ? "active" : ""} onClick={() => setSource("labels")}>Por etiqueta</button>
          <button className={source === "all" ? "active" : ""} onClick={() => setSource("all")}>Todos os contatos</button>
          <button className={source === "paste" ? "active" : ""} onClick={() => setSource("paste")}>Colar lista</button>
        </div>

        {source === "contacts" && (
          <div className="camp-pick">
            <div className="cv-search"><Search size={14} /><input placeholder="Buscar contato" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
            <div className="gestao-row" style={{ margin: "6px 0" }}>
              <button className="pill-btn" onClick={() => setPicked(new Set(visible.map((c) => c.id)))}>Marcar visíveis</button>
              <button className="pill-btn" onClick={() => setPicked(new Set())}>Limpar</button>
            </div>
            <div className="camp-pick-list">
              {visible.map((c) => (
                <label key={c.id} className="col-toggle-row">
                  <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
                  <span>{c.name || c.pushName || "Sem nome"}</span>
                  <small className="cv-muted">+{c.phone}</small>
                </label>
              ))}
              {!visible.length && <div className="cv-muted">Nenhum contato. Importe em Contatos ou use "Colar lista".</div>}
            </div>
          </div>
        )}
        {source === "labels" && (
          <div className="camp-labels">
            {labels.map((l) => (
              <button
                type="button"
                key={l.id}
                className={`label-chip pick ${pickedLabels.has(l.id) ? "on" : ""}`}
                style={{ "--chip-color": l.color }}
                onClick={() => setPickedLabels((p) => { const n = new Set(p); n.has(l.id) ? n.delete(l.id) : n.add(l.id); return n; })}
              >
                {pickedLabels.has(l.id) ? "✓ " : ""}{l.title}
              </button>
            ))}
            {!labels.length && <div className="cv-muted">Nenhuma etiqueta criada ainda (Configurações → Etiquetas).</div>}
            <p className="cv-muted" style={{ width: "100%" }}>Vão receber os contatos das conversas marcadas com {pickedLabels.size > 1 ? "qualquer uma dessas etiquetas" : "essa etiqueta"} (números repetidos são enviados uma vez só).</p>
          </div>
        )}
        {source === "all" && <p className="cv-muted">{contacts.length} contato(s) cadastrados vão receber.</p>}
        {source === "paste" && (
          <label className="login-field">
            <span>Um por linha: número;nome (ex: 5584999998888;Maria)</span>
            <textarea rows={6} value={pasted} onChange={(e) => setPasted(e.target.value)} />
            <small className="fe-hint">{pastedList.length} número(s) válido(s)</small>
          </label>
        )}

        <label className="login-field"><span>Agendar para (opcional)</span><input type="datetime-local" value={f.scheduledAt} onChange={set("scheduledAt")} /></label>

        <button className="cv-viewall" onClick={() => setShowAdv((v) => !v)}>{showAdv ? "▾" : "▸"} Intervalo entre mensagens</button>
        {showAdv && (
          <div className="client-two">
            <label className="login-field"><span>Intervalo mínimo (s)</span><input type="number" min="5" value={f.minDelay} onChange={set("minDelay")} /></label>
            <label className="login-field"><span>Intervalo máximo (s)</span><input type="number" min="5" value={f.maxDelay} onChange={set("maxDelay")} /></label>
            <label className="login-field"><span>Máximo por hora</span><input type="number" min="10" max="300" value={f.hourlyLimit} onChange={set("hourlyLimit")} /></label>
          </div>
        )}

        <div className={`camp-cost ${count > balance ? "warn" : ""}`}>
          <Coins size={16} /> Custo: <strong>{count ?? "1 por contato"}</strong>{count != null ? " crédito(s)" : ""} · Saldo: <strong>{balance}</strong>
          {count > balance && <span> — a campanha pausa quando o saldo acabar</span>}
        </div>
        <div className="camp-risk"><AlertTriangle size={14} /> Disparo em massa por WhatsApp pode levar ao bloqueio do número. Envie só para clientes ou contatos que autorizaram receber mensagens, use as 3 versões e mantenha intervalos longos.</div>

        {error && <div className="admin-feedback error">{error}</div>}
        <div className="gestao-row" style={{ justifyContent: "flex-end" }}>
          <button className="pill-btn" disabled={busy || !f.message.trim() || !(count ?? pickedLabels.size)} onClick={() => submit(false)}>Salvar rascunho</button>
          <button className="pill-btn primary" disabled={busy || !f.message.trim() || !(count ?? pickedLabels.size)} onClick={() => submit(true)}>
            {f.scheduledAt ? "Agendar" : "Salvar e enviar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CampaignDetail({ id, onBack }) {
  const [c, setC] = useState(null);
  useEffect(() => {
    const load = () => getCampaignApi(id).then(setC).catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [id]);
  if (!c) return <div className="cv-muted">Carregando…</div>;
  const [label, color] = STATUS[c.status] || [c.status, "#8e8e93"];
  return (
    <div>
      <button className="pill-btn" onClick={onBack}><ArrowLeft size={14} /> Campanhas</button>
      <div className="lg-card camp-detail">
        <h2>{c.name}</h2>
        <span className="cv-tag" style={{ "--tag": color }}>{label}</span>
        {c.pauseReason && <div className="fe-insp-warn">{c.pauseReason}</div>}
        <div className="camp-msg">{c.message}</div>
        <div className="fe-insp-stats">
          <div><strong>{c.total}</strong><span>destinatários</span></div>
          <div><strong>{c.sent}</strong><span>enviadas</span></div>
          <div><strong>{c.failed}</strong><span>falharam</span></div>
          <div><strong>{Math.max(0, c.total - c.sent - c.failed)}</strong><span>na fila</span></div>
        </div>
      </div>
      <div className="lg-card contacts-list" style={{ marginTop: 12 }}>
        {c.recipients.map((r) => (
          <div key={r.id} className="contact-row">
            <div className="contact-info"><strong>{r.name || "—"}</strong><span>+{r.phone}{r.error ? ` · ${r.error}` : ""}</span></div>
            <span className={`invoice-badge ${r.status === "sent" ? "paid" : r.status === "failed" ? "overdue" : ""}`}>{R_STATUS[r.status]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CampaignsPage({ canEdit }) {
  const [list, setList] = useState([]);
  const [balance, setBalance] = useState(0);
  const [showNew, setShowNew] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [error, setError] = useState(null);

  const load = () => {
    getCampaigns().then(setList).catch((e) => setError(errText(e)));
    getCredits().then((d) => setBalance(d.balance)).catch(() => {});
  };
  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);

  if (openId) return <div className="page"><CampaignDetail id={openId} onBack={() => setOpenId(null)} /></div>;

  const act = async (id, action) => {
    setError(null);
    try {
      await campaignActionApi(id, action);
    } catch (e) {
      setError(errText(e));
    }
    load();
  };

  return (
    <div className="page">
      <div className="lg-card fl-hero">
        <span className="fl-hero-icon camp-icon"><Megaphone size={22} /></span>
        <div>
          <h2>Campanhas</h2>
          <p>Disparo em massa para seus contatos, como uma lista de transmissão. Cada mensagem enviada usa 1 crédito.</p>
        </div>
        <div className="camp-balance"><Coins size={16} /> <strong>{balance}</strong> créditos</div>
        {canEdit && <button className="pill-btn primary" onClick={() => setShowNew(true)}><Plus size={15} /> Nova campanha</button>}
      </div>
      {error && <div className="admin-feedback error" style={{ margin: "12px 0" }}>{error}</div>}

      <div className="lg-card contacts-list" style={{ marginTop: 14 }}>
        {list.map((c) => {
          const [label, color] = STATUS[c.status] || [c.status, "#8e8e93"];
          const pct = c.total ? Math.round(((c.sent + c.failed) / c.total) * 100) : 0;
          return (
            <div className="contact-row camp-row" key={c.id}>
              <div className="contact-info" onClick={() => setOpenId(c.id)} style={{ cursor: "pointer" }}>
                <strong>{c.name}</strong>
                <span>{c.status === "scheduled" ? `Agendada para ${when(c.scheduledAt)}` : `Criada em ${when(c.createdAt)}`} · {c.sent}/{c.total} enviadas{c.failed ? ` · ${c.failed} falhas` : ""}</span>
                <div className="camp-bar"><div style={{ width: `${pct}%`, background: color }} /></div>
                {c.pauseReason && c.status === "paused" && <small className="camp-pause">{c.pauseReason}</small>}
              </div>
              <span className="cv-tag" style={{ "--tag": color }}>{label}</span>
              {canEdit && ["draft", "paused", "scheduled"].includes(c.status) && (
                <button className="cv-icon-btn ok" title="Enviar agora" onClick={() => act(c.id, "start")}><Play size={15} /></button>
              )}
              {canEdit && c.status === "running" && <button className="cv-icon-btn" title="Pausar" onClick={() => act(c.id, "pause")}><Pause size={15} /></button>}
              {canEdit && ["running", "paused", "scheduled"].includes(c.status) && (
                <button className="cv-icon-btn" title="Cancelar" onClick={() => act(c.id, "cancel")}><XCircle size={15} /></button>
              )}
              {canEdit && !["running"].includes(c.status) && (
                <button className="cv-icon-btn" title="Apagar" onClick={async () => { await deleteCampaignApi(c.id).catch(() => {}); load(); }}><Trash2 size={15} /></button>
              )}
            </div>
          );
        })}
        {!list.length && !error && <div className="cv-empty">Nenhuma campanha ainda.</div>}
      </div>

      {showNew && <NewCampaign balance={balance} onClose={() => setShowNew(false)} onCreated={load} />}
    </div>
  );
}
