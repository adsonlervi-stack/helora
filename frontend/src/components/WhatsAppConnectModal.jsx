import React, { useEffect, useRef, useState } from "react";
import { QrCode, KeyRound, RefreshCw, LogOut, CheckCircle2, Loader2 } from "lucide-react";
import {
  getChannelStatusApi,
  connectWhatsAppApi,
  resetWhatsAppApi,
  requestPairingCodeApi,
  logoutWhatsAppApi
} from "../api.js";

function formatPhone(digits) {
  if (!digits) return "";
  const d = String(digits);
  if (d.startsWith("55") && d.length >= 12) {
    const ddd = d.slice(2, 4);
    const rest = d.slice(4);
    return `+55 (${ddd}) ${rest.slice(0, rest.length - 4)}-${rest.slice(-4)}`;
  }
  return `+${d}`;
}

const errorText = (err) =>
  err?.response?.status === 403
    ? "Só o gestor da conta pode conectar ou desconectar o WhatsApp."
    : err?.response?.data?.error || err?.message || "Algo deu errado. Tente de novo.";

/**
 * Modal de conexão do WhatsApp. Busca o status sozinho a cada 2s e já
 * pede o QR Code ao abrir — a pessoa só precisa apontar o celular.
 */
export default function WhatsAppConnectModal({ channelId, channelName, onClose }) {
  const [info, setInfo] = useState({ status: "connecting", qr: null, pairingCode: null, phone: null });
  const [mode, setMode] = useState("qr");
  const [phone, setPhone] = useState("55");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const started = useRef(false);

  const refresh = () =>
    getChannelStatusApi(channelId)
      .then((s) => setInfo((prev) => ({ ...prev, ...s })))
      .catch(() => {});

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      const s = await fn();
      if (s) setInfo((prev) => ({ ...prev, ...s }));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  // Ao abrir: se não está conectado, já pede o QR Code automaticamente.
  useEffect(() => {
    if (!channelId) return;
    getChannelStatusApi(channelId)
      .then((s) => {
        setInfo((prev) => ({ ...prev, ...s }));
        if (!started.current && s.status !== "connected" && !s.qr && !s.pairingCode) {
          started.current = true;
          run(() => connectWhatsAppApi(channelId));
        }
      })
      .catch((err) => setError(errorText(err)));
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  const connected = info.status === "connected";
  const waiting = !connected && !info.qr && !info.pairingCode;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card wa-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Conectar WhatsApp{channelName ? ` · ${channelName}` : ""}</h3>

        {!channelId && <p>Nenhum dispositivo de WhatsApp nesta conta. Crie um em Canais.</p>}

        {channelId && connected && (
          <div className="wa-connected">
            <CheckCircle2 size={44} />
            <strong>Conectado</strong>
            {info.phone && <span>{formatPhone(info.phone)}</span>}
            <p>As mensagens desse número já chegam no painel.</p>
            {!confirmLogout ? (
              <button className="resolve-btn" disabled={busy} onClick={() => setConfirmLogout(true)}>
                <LogOut size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
                Desconectar número
              </button>
            ) : (
              <div className="wa-confirm">
                <span>Desconectar mesmo? Vai precisar escanear de novo.</span>
                <button
                  className="connect-btn wa-danger"
                  disabled={busy}
                  onClick={() => run(() => logoutWhatsAppApi(channelId)).then(() => setConfirmLogout(false))}
                >
                  Sim, desconectar
                </button>
                <button className="resolve-btn" onClick={() => setConfirmLogout(false)}>
                  Cancelar
                </button>
              </div>
            )}
          </div>
        )}

        {channelId && !connected && (
          <>
            <div className="wa-tabs">
              <button className={mode === "qr" ? "active" : ""} onClick={() => setMode("qr")}>
                <QrCode size={14} /> QR Code
              </button>
              <button className={mode === "code" ? "active" : ""} onClick={() => setMode("code")}>
                <KeyRound size={14} /> Código pelo número
              </button>
            </div>

            {mode === "qr" && (
              <div className="wa-panel">
                <ol className="wa-steps">
                  <li>Abra o WhatsApp no celular</li>
                  <li>
                    Toque em <b>Aparelhos conectados</b> → <b>Conectar um aparelho</b>
                  </li>
                  <li>Aponte a câmera para o código abaixo</li>
                </ol>
                {info.qr ? (
                  <img src={info.qr} alt="QR Code do WhatsApp" className="wa-qr" />
                ) : (
                  <div className="wa-qr wa-qr-empty">
                    {busy || waiting ? (
                      <>
                        <Loader2 size={28} className="wa-spin" />
                        <span>Gerando QR Code…</span>
                      </>
                    ) : (
                      <span>Código expirado</span>
                    )}
                  </div>
                )}
                <button className="resolve-btn" disabled={busy} onClick={() => run(() => resetWhatsAppApi(channelId))}>
                  <RefreshCw size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
                  Gerar novo QR Code
                </button>
              </div>
            )}

            {mode === "code" && (
              <div className="wa-panel">
                {!info.pairingCode ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      run(() => requestPairingCodeApi(channelId, phone));
                    }}
                  >
                    <label className="login-field">
                      <span>Número do WhatsApp (com DDI e DDD)</span>
                      <input
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                        placeholder="5584999998888"
                        inputMode="numeric"
                        autoFocus
                      />
                    </label>
                    <button type="submit" className="connect-btn" disabled={busy || phone.length < 12}>
                      {busy ? "Gerando código…" : "Gerar código"}
                    </button>
                  </form>
                ) : (
                  <>
                    <div className="wa-code">{info.pairingCode}</div>
                    <ol className="wa-steps">
                      <li>
                        No celular: <b>Aparelhos conectados</b> → <b>Conectar um aparelho</b>
                      </li>
                      <li>
                        Toque em <b>Conectar com número de telefone</b>
                      </li>
                      <li>Digite o código acima</li>
                    </ol>
                    <button
                      className="resolve-btn"
                      disabled={busy}
                      onClick={() => run(() => requestPairingCodeApi(channelId, phone))}
                    >
                      <RefreshCw size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
                      Gerar outro código
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        )}

        {error && <div className="wa-error">{error}</div>}

        <button className="modal-close" onClick={onClose}>
          Fechar
        </button>
      </div>
    </div>
  );
}
