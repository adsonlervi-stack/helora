import { Router } from "express";
import {
  supabase, getConversation, updateConversation, listMessages, addNote, addLabelToConversation,
  logConversationEvent, onlyDigits, upsertContacts, getPrimaryWhatsAppChannel, findOrCreateConversation
} from "../config/db.js";
import { sendTextToConversation, sendMediaUrlToConversation } from "../messaging.js";
import { resolveWhatsAppNumber } from "../whatsapp/baileysClient.js";
import { emitEvent } from "../webhooks.js";
import { runStageAutomations } from "./crm.js";

/**
 * API Pública v1 (estilo SunChat, mais simples). Já autenticada pela chave (X-API-Key) em public.js.
 * Respostas paginadas: { itens, pagina, porPagina, total }
 */
const r = Router();
const page = (q) => {
  const pagina = Math.max(1, parseInt(q.pagina, 10) || 1);
  const porPagina = Math.min(100, Math.max(1, parseInt(q.porPagina, 10) || 30));
  return { pagina, porPagina, from: (pagina - 1) * porPagina, to: pagina * porPagina - 1 };
};
const wrap = (fn) => async (req, res) => {
  try { await fn(req, res); } catch (err) { res.status(err.status || 400).json({ erro: err.message }); }
};
const notFound = (msg = "Não encontrado.") => Object.assign(new Error(msg), { status: 404 });
const safe = (s) => String(s || "").replace(/[%,()]/g, "");

const atendimento = (c) => ({
  id: c.id, nome: c.name, telefone: c.phone || null, canalId: c.channelId, status: c.status === "resolved" ? "finalizado" : "aberto",
  modo: c.mode === "bot" ? "robo" : "humano", prioridade: c.priority || null, departamentoId: c.departmentId || null,
  departamento: c.departmentName || null, atendenteId: c.assignedAgentId || null, atendente: c.assignedAgentName || null,
  etiquetas: (c.labels || []).map((l) => ({ id: l.id, nome: l.title })), naoLidas: c.unread || 0,
  ultimaMensagemEm: c.lastMessageAt, criadoEm: c.createdAt
});
async function conv(req) {
  const c = await getConversation(req.accountId, req.params.id);
  if (!c) throw notFound("Atendimento não encontrado.");
  return c;
}

// ------------------------------------------------------------ Cadastros (leitura)
r.get("/canais", wrap(async (req, res) => {
  const { data } = await supabase.from("channels").select("id, name, platform, status, provider").eq("account_id", req.accountId);
  res.json((data || []).map((c) => ({ id: c.id, nome: c.name, plataforma: c.platform, status: c.status, tipo: c.provider || "qrcode" })));
}));
r.get("/departamentos", wrap(async (req, res) => {
  const { data } = await supabase.from("departments").select("id, name, active").eq("account_id", req.accountId).order("name");
  res.json((data || []).map((d) => ({ id: d.id, nome: d.name, ativo: d.active !== false })));
}));
r.get("/etiquetas", wrap(async (req, res) => {
  const { data } = await supabase.from("labels").select("id, title, color").eq("account_id", req.accountId).order("title");
  res.json((data || []).map((l) => ({ id: l.id, nome: l.title, cor: l.color })));
}));
r.get("/usuarios", wrap(async (req, res) => {
  const { data } = await supabase.from("profiles").select("id, name, role").eq("account_id", req.accountId).order("name");
  res.json((data || []).map((u) => ({ id: u.id, nome: u.name, perfil: u.role === "owner" ? "gestor" : "atendente" })));
}));

// ------------------------------------------------------------ Contatos
const contato = (c) => ({ id: c.id, nome: c.name || c.push_name || null, telefone: c.phone, email: c.email || null, observacoes: c.notes || null, criadoEm: c.created_at });
r.get("/contatos", wrap(async (req, res) => {
  const p = page(req.query);
  let q = supabase.from("contacts").select("*", { count: "exact" }).eq("account_id", req.accountId).order("name", { nullsFirst: false }).range(p.from, p.to);
  if (req.query.busca) {
    const s = safe(req.query.busca);
    q = q.or(`name.ilike.%${s}%,push_name.ilike.%${s}%,phone.ilike.%${onlyDigits(s) || s}%,email.ilike.%${s}%`);
  }
  const { data, count, error } = await q;
  if (error) throw error;
  res.json({ itens: data.map(contato), pagina: p.pagina, porPagina: p.porPagina, total: count || 0 });
}));
r.get("/contatos/:id", wrap(async (req, res) => {
  const { data } = await supabase.from("contacts").select("*").eq("account_id", req.accountId).eq("id", req.params.id).maybeSingle();
  if (!data) throw notFound("Contato não encontrado.");
  res.json(contato(data));
}));
r.post("/contatos", wrap(async (req, res) => {
  const b = req.body || {};
  const phone = onlyDigits(b.telefone);
  if (phone.length < 10) throw new Error("telefone inválido (DDI + DDD + número, ex.: 5584999998888).");
  await upsertContacts(req.accountId, null, [{ phone, name: b.nome || null }], "api");
  const patch = {};
  if (b.email !== undefined) patch.email = b.email;
  if (b.observacoes !== undefined) patch.notes = b.observacoes;
  if (Object.keys(patch).length) await supabase.from("contacts").update(patch).eq("account_id", req.accountId).eq("phone", phone);
  const { data } = await supabase.from("contacts").select("*").eq("account_id", req.accountId).eq("phone", phone).maybeSingle();
  res.status(201).json(contato(data));
}));
r.patch("/contatos/:id", wrap(async (req, res) => {
  const b = req.body || {};
  const patch = {};
  if (b.nome !== undefined) patch.name = b.nome;
  if (b.email !== undefined) patch.email = b.email;
  if (b.observacoes !== undefined) patch.notes = b.observacoes;
  if (b.telefone !== undefined) patch.phone = br55(b.telefone);
  const { data, error } = await supabase.from("contacts").update(patch).eq("account_id", req.accountId).eq("id", req.params.id).select().maybeSingle();
  if (error) throw error;
  if (!data) throw notFound("Contato não encontrado.");
  res.json(contato(data));
}));
r.delete("/contatos/:id", wrap(async (req, res) => {
  await supabase.from("contacts").delete().eq("account_id", req.accountId).eq("id", req.params.id);
  res.sendStatus(204);
}));

// ------------------------------------------------------------ Atendimentos
r.get("/atendimentos", wrap(async (req, res) => {
  const p = page(req.query);
  let q = supabase.from("conversations").select("id", { count: "exact" }).eq("account_id", req.accountId).eq("is_group", false)
    .order("last_message_at", { ascending: false }).range(p.from, p.to);
  if (req.query.status === "aberto") q = q.neq("status", "resolved");
  if (req.query.status === "finalizado") q = q.eq("status", "resolved");
  if (req.query.departamentoId) q = q.eq("department_id", req.query.departamentoId);
  if (req.query.atendenteId) q = q.eq("assigned_agent_id", req.query.atendenteId);
  if (req.query.canalId) q = q.eq("channel_id", req.query.canalId);
  if (req.query.busca) q = q.or(`name.ilike.%${safe(req.query.busca)}%,phone.ilike.%${onlyDigits(req.query.busca) || safe(req.query.busca)}%`);
  const { data, count, error } = await q;
  if (error) throw error;
  const itens = [];
  for (const row of data) { const c = await getConversation(req.accountId, row.id); if (c) itens.push(atendimento(c)); }
  res.json({ itens, pagina: p.pagina, porPagina: p.porPagina, total: count || 0 });
}));
r.get("/atendimentos/:id", wrap(async (req, res) => res.json(atendimento(await conv(req)))));

// Abre (ou retoma) um atendimento com um número. mensagem é opcional.
r.post("/atendimentos", wrap(async (req, res) => {
  const b = req.body || {};
  const phone = onlyDigits(b.telefone);
  if (phone.length < 10) throw new Error("telefone inválido (DDI + DDD + número).");
  const channelId = b.canalId || (await getPrimaryWhatsAppChannel(req.accountId));
  if (!channelId) throw new Error("Nenhum WhatsApp conectado nesta empresa.");
  const jid = await resolveWhatsAppNumber(channelId, phone);
  let c = await findOrCreateConversation({ accountId: req.accountId, platform: "whatsapp", externalId: jid, phone: jid.split("@")[0], name: b.nome || phone, channelId });
  const patch = { status: "open", mode: "human" };
  if (b.departamentoId) patch.departmentId = b.departamentoId;
  if (b.atendenteId) patch.assignedAgentId = b.atendenteId;
  c = await updateConversation(req.accountId, c.id, patch);
  if (b.mensagem) await sendTextToConversation(req.accountId, c, String(b.mensagem), { senderName: "API" });
  res.status(201).json(atendimento(await getConversation(req.accountId, c.id)));
}));
r.patch("/atendimentos/:id", wrap(async (req, res) => {
  await conv(req);
  const b = req.body || {};
  const patch = {};
  if (b.departamentoId !== undefined) patch.departmentId = b.departamentoId || null;
  if (b.prioridade !== undefined) patch.priority = b.prioridade || null;
  if (b.nome !== undefined) patch.name = b.nome;
  await updateConversation(req.accountId, req.params.id, patch);
  res.json(atendimento(await conv(req)));
}));
r.post("/atendimentos/:id/atribuir", wrap(async (req, res) => {
  await conv(req);
  const id = req.body?.atendenteId || null;
  await updateConversation(req.accountId, req.params.id, { assignedAgentId: id, ...(id ? { mode: "human" } : {}) });
  await logConversationEvent(req.accountId, req.params.id, "assigned", id ? "Conversa atribuída pela API" : "Conversa devolvida para a fila pela API", "API");
  res.json(atendimento(await conv(req)));
}));
r.post("/atendimentos/:id/transferir", wrap(async (req, res) => {
  await conv(req);
  const b = req.body || {};
  if (!b.departamentoId && !b.atendenteId) throw new Error("Informe departamentoId e/ou atendenteId.");
  await updateConversation(req.accountId, req.params.id, { mode: "human", departmentId: b.departamentoId || undefined, assignedAgentId: b.atendenteId || null });
  await logConversationEvent(req.accountId, req.params.id, "transferred", `Conversa transferida pela API${b.observacao ? ` · "${b.observacao}"` : ""}`, "API");
  res.json(atendimento(await conv(req)));
}));
r.post("/atendimentos/:id/finalizar", wrap(async (req, res) => {
  await conv(req);
  await updateConversation(req.accountId, req.params.id, { status: "resolved" });
  await logConversationEvent(req.accountId, req.params.id, "closed", "Conversa encerrada pela API", "API");
  res.json(atendimento(await conv(req)));
}));
r.post("/atendimentos/:id/reabrir", wrap(async (req, res) => {
  await conv(req);
  await updateConversation(req.accountId, req.params.id, { status: "open" });
  await logConversationEvent(req.accountId, req.params.id, "reopened", "Conversa reaberta pela API", "API");
  res.json(atendimento(await conv(req)));
}));
r.get("/atendimentos/:id/mensagens", wrap(async (req, res) => {
  await conv(req);
  const list = await listMessages(req.accountId, req.params.id);
  res.json(list.map((m) => ({
    id: m.id, direcao: m.direction === "in" ? "recebida" : "enviada", autor: m.author, texto: m.text || "",
    midiaUrl: m.mediaUrl || null, tipoMidia: m.mediaType || null, status: m.status || null, enviadaEm: m.timestamp
  })));
}));
// Envia mensagem no atendimento. nota=true grava como nota interna (não vai ao cliente).
r.post("/atendimentos/:id/mensagens", wrap(async (req, res) => {
  const c = await conv(req);
  const b = req.body || {};
  if (!b.texto && !b.midiaUrl) throw new Error("Envie texto e/ou midiaUrl.");
  if (b.nota) {
    await addNote({ accountId: req.accountId, conversationId: c.id, content: b.texto || b.midiaUrl });
    return res.status(201).json({ ok: true, nota: true });
  }
  const m = b.midiaUrl
    ? await sendMediaUrlToConversation(req.accountId, c, { url: b.midiaUrl, mediaType: b.tipoMidia || "image", caption: b.texto || "" }, { senderName: b.remetente || null, sign: !!b.remetente })
    : await sendTextToConversation(req.accountId, c, String(b.texto), { senderName: b.remetente || null, sign: !!b.remetente });
  res.status(201).json({ id: m.id, enviadaEm: m.timestamp });
}));
r.post("/atendimentos/:id/etiquetas", wrap(async (req, res) => {
  await conv(req);
  for (const id of req.body?.etiquetaIds || []) await addLabelToConversation(req.accountId, req.params.id, id).catch(() => {});
  res.json(atendimento(await conv(req)));
}));
r.delete("/atendimentos/:id/etiquetas/:etiquetaId", wrap(async (req, res) => {
  await conv(req);
  await supabase.from("conversation_labels").delete().eq("conversation_id", req.params.id).eq("label_id", req.params.etiquetaId);
  res.json(atendimento(await conv(req)));
}));

// ------------------------------------------------------------ CRM
const br55 = (v) => { const d = onlyDigits(v); return d.length === 10 || d.length === 11 ? `55${d}` : d; };
const lead = (l) => ({
  id: l.id, funilId: l.pipeline_id, etapa: l.stage, nome: l.name, telefone: l.phone, email: l.email, empresa: l.company,
  valor: l.value != null ? Number(l.value) : null, responsavelId: l.owner_id, tagIds: l.tag_ids || [], origem: l.source,
  observacoes: l.notes, campos: l.custom || {}, criadoEm: l.created_at, etapaDesde: l.stage_changed_at
});
r.get("/crm/funis", wrap(async (req, res) => {
  const { data } = await supabase.from("crm_pipelines").select("*").eq("account_id", req.accountId).order("created_at");
  res.json((data || []).map((p) => ({ id: p.id, nome: p.name, etapas: (p.stages || []).map((s) => ({ id: s.id, nome: s.name })) })));
}));
r.get("/crm/leads", wrap(async (req, res) => {
  const p = page(req.query);
  let q = supabase.from("crm_leads").select("*", { count: "exact" }).eq("account_id", req.accountId).is("deleted_at", null).order("created_at", { ascending: false }).range(p.from, p.to);
  if (req.query.funilId) q = q.eq("pipeline_id", req.query.funilId);
  if (req.query.etapa) q = q.eq("stage", req.query.etapa);
  if (req.query.telefone) q = q.eq("phone", onlyDigits(req.query.telefone));
  if (req.query.busca) q = q.or(`name.ilike.%${safe(req.query.busca)}%,company.ilike.%${safe(req.query.busca)}%,email.ilike.%${safe(req.query.busca)}%`);
  const { data, count, error } = await q;
  if (error) throw error;
  res.json({ itens: data.map(lead), pagina: p.pagina, porPagina: p.porPagina, total: count || 0 });
}));
// Cria lead no CRM. Aceita: funil (nome) ou funilId, etapa, produto (nome ou lista de nomes), campos {apolice: "...", ...},
// formulario (identifica de qual formulário do site veio). Produto que não existe é cadastrado na hora.
r.post("/crm/leads", wrap(async (req, res) => {
  const b = req.body || {};
  if (!b.nome) throw new Error("nome é obrigatório.");
  const { data: pipes } = await supabase.from("crm_pipelines").select("id, name, stages, fields").eq("account_id", req.accountId).order("created_at");
  if (!pipes?.length) throw new Error("Crie um funil no CRM antes.");
  const norm = (x) => String(x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const pipe = (b.funilId && pipes.find((p) => p.id === b.funilId)) || (b.funil && pipes.find((p) => norm(p.name) === norm(b.funil))) || pipes[0];
  const stage = (b.etapa && (pipe.stages || []).find((st) => st.id === b.etapa || norm(st.name) === norm(b.etapa))) || pipe.stages?.[0];
  // campos personalizados: aceita o id do campo ou o nome dele ("Vigência", "Seguradora"…)
  const custom = {};
  for (const [k, v] of Object.entries(b.campos || {})) {
    const f = (pipe.fields || []).find((x) => x.id === k || norm(x.label) === norm(k) || norm(x.label.replace(/\s*\(.*\)$/, "")) === norm(k));
    if (f && v !== "" && v != null) custom[f.id] = f.type === "date" && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(String(v)) ? String(v).split("/").reverse().map((x) => x.padStart(2, "0")).join("-") : v;
  }
  // produtos
  const nomes = (Array.isArray(b.produto) ? b.produto : b.produto ? [b.produto] : []).map((x) => String(x).trim()).filter(Boolean).slice(0, 10);
  const itens = [];
  if (nomes.length) {
    const { data: prods } = await supabase.from("crm_products").select("id, name, price").eq("account_id", req.accountId);
    for (const n of nomes) {
      let p = (prods || []).find((x) => norm(x.name) === norm(n));
      if (!p) {
        const ins = await supabase.from("crm_products").insert({ account_id: req.accountId, name: n.slice(0, 120), price: 0, active: true }).select("id, name, price").single();
        if (ins.error) throw ins.error;
        p = ins.data;
        prods?.push(p);
      }
      itens.push({ productId: p.id, price: Number(p.price) || 0 });
    }
  }
  const valorProdutos = itens.reduce((s, i) => s + i.price, 0);
  const origem = b.origem || b.formulario || "Site";
  const { data, error } = await supabase.from("crm_leads").insert({
    account_id: req.accountId, pipeline_id: pipe.id, stage: stage?.id || "novos", name: String(b.nome).slice(0, 120), phone: br55(b.telefone) || null,
    email: b.email || null, company: b.empresa || null, value: b.valor != null && b.valor !== "" ? Number(String(b.valor).replace(",", ".")) || null : valorProdutos || null,
    owner_id: b.responsavelId || null, source: String(origem).slice(0, 80),
    notes: [b.formulario ? `Formulário: ${b.formulario}` : null, b.observacoes || null].filter(Boolean).join("\n") || null,
    tag_ids: b.tagIds || [], custom, stage_changed_at: new Date().toISOString()
  }).select().single();
  if (error) throw error;
  if (itens.length) {
    await supabase.from("crm_lead_products").insert(itens.map((i) => ({ account_id: req.accountId, lead_id: data.id, product_id: i.productId, qty: 1, price: i.price })));
  }
  const out = { ...lead(data), funil: pipe.name, produtos: nomes };
  emitEvent(req.accountId, "lead.criado", out);
  runStageAutomations(req.accountId, data, null).catch(() => {});
  res.status(201).json(out);
}));
r.patch("/crm/leads/:id", wrap(async (req, res) => {
  const b = req.body || {};
  const map = { nome: "name", email: "email", empresa: "company", origem: "source", observacoes: "notes", responsavelId: "owner_id", tagIds: "tag_ids", funilId: "pipeline_id" };
  const patch = {};
  for (const [k, col] of Object.entries(map)) if (b[k] !== undefined) patch[col] = b[k];
  if (b.telefone !== undefined) patch.phone = br55(b.telefone);
  if (b.valor !== undefined) patch.value = b.valor === null ? null : Number(b.valor);
  if (b.etapa !== undefined) { patch.stage = b.etapa; patch.stage_changed_at = new Date().toISOString(); }
  const { data, error } = await supabase.from("crm_leads").update(patch).eq("account_id", req.accountId).eq("id", req.params.id).select().maybeSingle();
  if (error) throw error;
  if (!data) throw notFound("Lead não encontrado.");
  emitEvent(req.accountId, "lead.atualizado", lead(data));
  res.json(lead(data));
}));
r.delete("/crm/leads/:id", wrap(async (req, res) => {
  // Dados do CRM nunca são apagados de verdade: some da tela, mas fica guardado
  await supabase.from("crm_leads").update({ deleted_at: new Date().toISOString() }).eq("account_id", req.accountId).eq("id", req.params.id);
  res.sendStatus(204);
}));
r.get("/crm/produtos", wrap(async (req, res) => {
  const { data } = await supabase.from("crm_products").select("*").eq("account_id", req.accountId).order("name");
  res.json((data || []).map((p) => ({ id: p.id, nome: p.name, preco: Number(p.price), recorrente: p.recurring, ativo: p.active })));
}));
r.get("/crm/reunioes", wrap(async (req, res) => {
  let q = supabase.from("crm_events").select("*").eq("account_id", req.accountId).order("starts_at");
  if (req.query.de) q = q.gte("starts_at", req.query.de);
  if (req.query.ate) q = q.lte("starts_at", req.query.ate);
  if (req.query.leadId) q = q.eq("lead_id", req.query.leadId);
  const { data } = await q.limit(500);
  res.json((data || []).map((e) => ({ id: e.id, titulo: e.title, tipo: e.kind, inicio: e.starts_at, fim: e.ends_at, leadId: e.lead_id, meet: e.meet_link || null, feito: e.done })));
}));
r.post("/crm/reunioes", wrap(async (req, res) => {
  const b = req.body || {};
  if (!b.inicio) throw new Error("inicio é obrigatório (data/hora ISO).");
  const { data, error } = await supabase.from("crm_events").insert({
    account_id: req.accountId, lead_id: b.leadId || null, title: b.titulo || "Reunião", kind: b.tipo || "reuniao",
    starts_at: b.inicio, ends_at: b.fim || null, notes: b.observacoes || null, owner_id: b.responsavelId || null
  }).select().single();
  if (error) throw error;
  res.status(201).json({ id: data.id, titulo: data.title, inicio: data.starts_at });
}));

// ------------------------------------------------------------ Tarefas
r.get("/tarefas", wrap(async (req, res) => {
  let q = supabase.from("tasks").select("*").eq("account_id", req.accountId).order("due_at", { ascending: true, nullsFirst: false }).limit(500);
  if (req.query.status === "aberta") q = q.eq("status", "open");
  if (req.query.status === "concluida") q = q.eq("status", "done");
  if (req.query.responsavelId) q = q.eq("assignee_id", req.query.responsavelId);
  const { data } = await q;
  res.json((data || []).map((t) => ({ id: t.id, titulo: t.title, descricao: t.description, responsavelId: t.assignee_id, prazo: t.due_at, status: t.status === "done" ? "concluida" : "aberta" })));
}));
r.post("/tarefas", wrap(async (req, res) => {
  const b = req.body || {};
  if (!b.titulo) throw new Error("titulo é obrigatório.");
  const { data, error } = await supabase.from("tasks").insert({
    account_id: req.accountId, title: String(b.titulo).slice(0, 200), description: b.descricao || null,
    assignee_id: b.responsavelId || null, due_at: b.prazo || null, kind: "manual"
  }).select().single();
  if (error) throw error;
  res.status(201).json({ id: data.id, titulo: data.title, status: "aberta" });
}));

export default r;
