import React, { useEffect, useState } from "react";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import { aiPrompts, aiStatusApi, getDepartments } from "../api.js";
import { Sheet, Group, Row, Switch, Button } from "./ui.jsx";

const errText = (e) => e?.response?.data?.error || e?.message || "Erro";
const BLANK = {
  name: "", prompt: "", historySize: 20, maxTurns: 20, transferDepartmentId: "", transferMessageEnabled: true,
  transferMessage: "Vou te transferir para um dos nossos atendentes, só um instante! 😊", processImages: false,
  unsupportedMediaMessage: "Ah, que pena! 😅 No momento eu só consigo entender mensagens de texto. Se quiser, pode me escrever por aqui que vou te ajudar com o maior prazer!"
};

/** Prompts de IA: o "cérebro" do bloco Atendente IA dos fluxos (estilo ClickMassa). */
export default function PromptsPage({ canEdit }) {
  const [list, setList] = useState(null);
  const [edit, setEdit] = useState(null);
  const [deps, setDeps] = useState([]);
  const [status, setStatus] = useState(null);
  const [err, setErr] = useState(null);
  const load = () => aiPrompts.list().then(setList).catch((e) => { setErr(errText(e)); setList([]); });
  useEffect(() => {
    load();
    getDepartments().then(setDeps).catch(() => {});
    aiStatusApi().then(setStatus);
  }, []);
  const save = async () => {
    try {
      if (edit.id) await aiPrompts.update(edit.id, edit); else await aiPrompts.create(edit);
      setEdit(null);
      load();
    } catch (e) { setErr(errText(e)); }
  };
  const set = (k) => (e) => setEdit((c) => ({ ...c, [k]: e.target.value }));

  return (
    <>
      <div className="ap-page-head">
        <div>
          <p style={{ fontSize: 15, fontWeight: 600, color: "#1d1d1f" }}>Prompts de IA</p>
          <p>Escreva como a IA deve atender. Depois, no fluxo, use o bloco <strong>Atendente IA</strong> e escolha o prompt.</p>
        </div>
        {canEdit && <Button onClick={() => setEdit({ ...BLANK })}><Plus size={16} /> Novo prompt</Button>}
      </div>
      {status && !status.configured && <div className="admin-feedback error" style={{ marginBottom: 12 }}>A IA ainda não está ativada no servidor (falta a chave da Anthropic). Os prompts ficam salvos e passam a funcionar quando ativar.</div>}
      {status && status.configured && !status.allowed && <div className="admin-feedback error" style={{ marginBottom: 12 }}>O módulo de IA não está liberado para a sua empresa.</div>}
      {err && <div className="admin-feedback error" style={{ marginBottom: 12 }}>{err}</div>}
      <div className="ap-list">
        {list === null && <div className="ap-empty">Carregando…</div>}
        {list?.map((p) => (
          <div key={p.id} className="ap-list-row" style={{ cursor: canEdit ? "pointer" : "default" }} onClick={() => canEdit && setEdit({ ...p, transferDepartmentId: p.transferDepartmentId || "" })}>
            <span className="ap-avatar" style={{ background: "linear-gradient(135deg,#bf5af2,#5e5ce6)" }}><Sparkles size={17} /></span>
            <div className="ap-list-main">
              <strong>{p.name}</strong>
              <span>{(p.prompt || "Sem texto").slice(0, 140)}</span>
            </div>
          </div>
        ))}
        {list && !list.length && <div className="ap-empty">Nenhum prompt ainda. Crie o primeiro para usar a IA nos fluxos.</div>}
      </div>

      {edit && (
        <Sheet title={edit.id ? "Editar prompt" : "Criar prompt"} subtitle="A IA responde o cliente seguindo exatamente este texto." onClose={() => setEdit(null)} width={760}
          footer={<>
            {edit.id && <Button variant="danger" style={{ marginRight: "auto" }} onClick={async () => { if (confirm("Excluir este prompt?")) { await aiPrompts.remove(edit.id); setEdit(null); load(); } }}><Trash2 size={14} /> Excluir</Button>}
            <Button variant="secondary" onClick={() => setEdit(null)}>Cancelar</Button>
            <Button disabled={!edit.name.trim() || !edit.prompt.trim()} onClick={save}>Salvar</Button>
          </>}>
          <Group>
            <Row label="Nome"><input autoFocus value={edit.name} onChange={set("name")} placeholder="Ex: Atendimento Seguros" /></Row>
          </Group>
          <Group title="Prompt" hint={`${edit.prompt.length} caracteres · Diga quem a IA é, o que a empresa faz, o que perguntar, o que pode e não pode prometer, e quando passar para humano.`}>
            <Row label="" stack>
              <textarea rows={14} value={edit.prompt} onChange={set("prompt")} className="prompt-area"
                placeholder={"Você é a Ana, atendente da Parcer Seguros.\nSeu objetivo é entender qual seguro o cliente precisa (auto, vida, saúde ou residencial), pegar nome, cidade e melhor horário para contato.\nSeja simpática e objetiva. Não informe preços: diga que um consultor vai enviar a cotação.\nSe o cliente quiser falar com uma pessoa, transfira."} />
            </Row>
          </Group>
          <Group title="Comportamento">
            <Row label="Tamanho do histórico"><input type="number" min="2" max="50" value={edit.historySize} onChange={set("historySize")} /></Row>
            <Row label="Máximo de respostas da IA"><input type="number" min="1" max="100" value={edit.maxTurns} onChange={set("maxTurns")} /></Row>
            <Row label="Processar imagens com IA"><Switch checked={!!edit.processImages} onChange={(v) => setEdit((c) => ({ ...c, processImages: v }))} /></Row>
          </Group>
          <Group title="Transferência para humano">
            <Row label="Departamento padrão">
              <select value={edit.transferDepartmentId} onChange={set("transferDepartmentId")}>
                <option value="">Manter o atual</option>
                {deps.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Row>
            <Row label="Enviar mensagem ao transferir"><Switch checked={!!edit.transferMessageEnabled} onChange={(v) => setEdit((c) => ({ ...c, transferMessageEnabled: v }))} /></Row>
            {edit.transferMessageEnabled && <Row label="" stack><textarea rows={2} value={edit.transferMessage} onChange={set("transferMessage")} placeholder="Vazio = a IA escreve a mensagem" /></Row>}
          </Group>
          <Group title="Mensagem para mídias não suportadas" hint="Enviada quando o cliente manda vídeo, áudio, documento (ou imagem, se o processamento estiver desligado).">
            <Row label="" stack><textarea rows={2} maxLength={500} value={edit.unsupportedMediaMessage} onChange={set("unsupportedMediaMessage")} /></Row>
          </Group>
        </Sheet>
      )}
    </>
  );
}
