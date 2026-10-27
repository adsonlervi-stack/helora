import React, { useState } from "react";
import { createPortal } from "react-dom";
import { X, FileDown, ShieldCheck } from "lucide-react";
import { api } from "../api.js";
import { notify } from "../dialogs.js";

/** Exporta a conversa no formato usado em processos: relatório + transcrição + mídias + hashes SHA-256. */
export default function ExportConversationModal({ conversation, onClose }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [media, setMedia] = useState(true);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const r = await api.get(`/conversations/${conversation.id}/export`, { params: { from: from || undefined, to: to || undefined, media: media ? "1" : "0" }, responseType: "blob", timeout: 0 });
      const name = decodeURIComponent((r.headers?.["content-disposition"] || "").match(/filename="([^"]+)"/)?.[1] || `Conversa ${conversation.name || ""}.zip`);
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      notify("Conversa exportada.", "success");
      onClose();
    } catch (e) {
      let msg = e?.response?.data?.error || e.message;
      try { if (e?.response?.data instanceof Blob) msg = JSON.parse(await e.response.data.text()).error || msg; } catch {}
      notify(msg, "error");
    }
    setBusy(false);
  };
  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card exp-conv" onClick={(e) => e.stopPropagation()}>
        <div className="exp-conv-head">
          <strong><ShieldCheck size={18} /> Exportar conversa (uso jurídico)</strong>
          <button type="button" className="exp-conv-x" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>
        <p className="exp-conv-p">
          Gera um pacote .zip com o <b>relatório da conversa</b> (abre no navegador e pode ser salvo em PDF), a <b>transcrição</b>,
          os <b>dados originais</b>, as <b>mídias</b> (fotos, áudios, documentos) e o <b>código SHA-256</b> de cada arquivo, que prova que nada foi alterado depois.
          Data, hora, remetente e ID de cada mensagem vão no relatório. Mensagens apagadas aparecem com o conteúdo preservado.
        </p>
        <div className="exp-conv-row">
          <label><span>De</span><input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></label>
          <label><span>Até</span><input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
        <div className="exp-conv-hint">Deixe em branco para exportar a conversa inteira.</div>
        <label className="exp-conv-check"><input type="checkbox" checked={media} onChange={(e) => setMedia(e.target.checked)} /> Incluir fotos, áudios e documentos</label>
        <p className="exp-conv-hint">Para processos, guarde o .zip original sem alterar. Se precisar de mais força como prova, leve a um cartório para ata notarial ou a um perito.</p>
        <div className="exp-conv-foot">
          <button type="button" className="pill-btn" onClick={onClose}>Cancelar</button>
          <button type="button" className="pill-btn primary" disabled={busy} onClick={go}><FileDown size={15} /> {busy ? "Gerando…" : "Exportar"}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
