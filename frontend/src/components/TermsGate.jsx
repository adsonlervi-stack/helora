import React, { useEffect, useState } from "react";
import { getLegalStatusApi, acceptLegalApi } from "../api.js";

/** No primeiro acesso: aceite dos Termos de Uso (todos) e do Contrato (gestor da empresa). */
export default function TermsGate() {
  const [st, setSt] = useState(null);
  const [terms, setTerms] = useState(false);
  const [contract, setContract] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    getLegalStatusApi().then(setSt).catch(() => {});
  }, []);
  if (!st || (st.termsAccepted && !st.contractRequired)) return null;
  const needTerms = !st.termsAccepted;
  const ok = (!needTerms || terms) && (!st.contractRequired || contract);
  const accept = async () => {
    setBusy(true);
    try {
      await acceptLegalApi(st.contractRequired);
      setSt({ ...st, termsAccepted: true, contractRequired: false });
    } catch {}
    setBusy(false);
  };
  return (
    <div className="modal-backdrop terms-gate">
      <div className="modal lg-modal">
        <div className="modal-header"><h3>Antes de continuar</h3></div>
        <p className="cv-muted" style={{ margin: 0 }}>Para usar o Helora, leia e aceite os documentos abaixo.</p>
        {needTerms && (
          <label className="bh-switch terms-check">
            <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
            <span>Li e aceito os <a href="/termos.html" target="_blank" rel="noreferrer">Termos de Uso e a Política de Privacidade</a></span>
          </label>
        )}
        {st.contractRequired && (
          <label className="bh-switch terms-check">
            <input type="checkbox" checked={contract} onChange={(e) => setContract(e.target.checked)} />
            <span>Em nome da empresa, li e aceito o <a href="/contrato.html" target="_blank" rel="noreferrer">Contrato de Prestação de Serviços</a></span>
          </label>
        )}
        <button className="connect-btn" disabled={!ok || busy} onClick={accept}>{busy ? "Salvando…" : "Aceitar e continuar"}</button>
      </div>
    </div>
  );
}
