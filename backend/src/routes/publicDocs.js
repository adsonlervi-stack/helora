import { Router } from "express";

/** Documentação da API Pública v1 (OpenAPI 3 + Swagger UI). */
const r = Router();
const P = (name, desc, req = false, inn = "query") => ({ name, in: inn, required: req, description: desc, schema: { type: "string" } });
const id = P("id", "ID", true, "path");
const pag = [P("pagina", "Página (1…)"), P("porPagina", "Itens por página (máx. 100)")];
const body = (props, required = []) => ({ required: true, content: { "application/json": { schema: { type: "object", required, properties: Object.fromEntries(Object.entries(props).map(([k, v]) => [k, typeof v === "string" ? { type: "string", description: v } : v])) } } } });
const op = (tag, summary, extra = {}) => ({ tags: [tag], summary, responses: { 200: { description: "OK" }, 400: { description: "Erro de validação" }, 401: { description: "Chave inválida" } }, ...extra });

export const spec = {
  openapi: "3.0.3",
  info: {
    title: "Helora — API Pública",
    version: "1.0",
    description: "API simples para integrar a Helora ao seu sistema.\n\n**Autenticação:** envie o header `X-API-Key` com a chave criada em Configurações → API.\n\n**Limite:** 120 requisições por minuto.\n\n**Webhooks:** cadastre URLs em Configurações → API para receber eventos (`mensagem.recebida`, `atendimento.finalizado`, `lead.criado`…). Cada POST traz o header `X-Helora-Signature` = HMAC-SHA256 do corpo com o segredo do webhook."
  },
  servers: [{ url: "/public/v1" }],
  components: { securitySchemes: { chave: { type: "apiKey", in: "header", name: "X-API-Key" } } },
  security: [{ chave: [] }],
  paths: {
    "/canais": { get: op("Cadastros", "Lista os canais (WhatsApp)") },
    "/departamentos": { get: op("Cadastros", "Lista os setores") },
    "/etiquetas": { get: op("Cadastros", "Lista as etiquetas") },
    "/usuarios": { get: op("Cadastros", "Lista os usuários/atendentes") },
    "/mensagens/texto": { post: op("Mensagens", "Envia texto avulso para um número", { requestBody: body({ telefone: "5584999998888", texto: "Mensagem", canalId: "Opcional" }, ["telefone", "texto"]) }) },
    "/contatos": {
      get: op("Contatos", "Lista contatos", { parameters: [P("busca", "Nome, telefone ou e-mail"), ...pag] }),
      post: op("Contatos", "Cria/atualiza contato pelo telefone", { requestBody: body({ telefone: "5584999998888", nome: "Nome", email: "E-mail", observacoes: "Notas" }, ["telefone"]) })
    },
    "/contatos/{id}": {
      get: op("Contatos", "Detalhe do contato", { parameters: [id] }),
      patch: op("Contatos", "Atualiza contato", { parameters: [id], requestBody: body({ nome: "", telefone: "", email: "", observacoes: "" }) }),
      delete: op("Contatos", "Remove contato", { parameters: [id] })
    },
    "/atendimentos": {
      get: op("Atendimentos", "Lista atendimentos", { parameters: [P("status", "aberto | finalizado"), P("departamentoId", "Setor"), P("atendenteId", "Atendente"), P("canalId", "Canal"), P("busca", "Nome ou telefone"), ...pag] }),
      post: op("Atendimentos", "Abre atendimento com um número (mensagem opcional)", { requestBody: body({ telefone: "5584999998888", nome: "", mensagem: "Opcional", departamentoId: "", atendenteId: "", canalId: "" }, ["telefone"]) })
    },
    "/atendimentos/{id}": {
      get: op("Atendimentos", "Detalhe do atendimento", { parameters: [id] }),
      patch: op("Atendimentos", "Altera setor, prioridade ou nome", { parameters: [id], requestBody: body({ departamentoId: "", prioridade: "", nome: "" }) })
    },
    "/atendimentos/{id}/atribuir": { post: op("Atendimentos", "Atribui a um atendente (vazio = volta pra fila)", { parameters: [id], requestBody: body({ atendenteId: "" }) }) },
    "/atendimentos/{id}/transferir": { post: op("Atendimentos", "Transfere para setor/atendente", { parameters: [id], requestBody: body({ departamentoId: "", atendenteId: "", observacao: "" }) }) },
    "/atendimentos/{id}/finalizar": { post: op("Atendimentos", "Finaliza", { parameters: [id] }) },
    "/atendimentos/{id}/reabrir": { post: op("Atendimentos", "Reabre", { parameters: [id] }) },
    "/atendimentos/{id}/mensagens": {
      get: op("Atendimentos", "Histórico de mensagens", { parameters: [id] }),
      post: op("Atendimentos", "Envia mensagem (texto/mídia) ou nota interna", { parameters: [id], requestBody: body({ texto: "", midiaUrl: "URL pública", tipoMidia: "image | video | audio | document", nota: { type: "boolean" }, remetente: "Assina com esse nome" }) })
    },
    "/atendimentos/{id}/etiquetas": { post: op("Atendimentos", "Adiciona etiquetas", { parameters: [id], requestBody: body({ etiquetaIds: { type: "array", items: { type: "string" } } }) }) },
    "/atendimentos/{id}/etiquetas/{etiquetaId}": { delete: op("Atendimentos", "Remove etiqueta", { parameters: [id, P("etiquetaId", "Etiqueta", true, "path")] }) },
    "/crm/funis": { get: op("CRM", "Funis e etapas") },
    "/crm/leads": {
      get: op("CRM", "Lista leads", { parameters: [P("funilId", ""), P("etapa", ""), P("telefone", ""), P("busca", ""), ...pag] }),
      post: op("CRM", "Cria lead (sem funilId usa o primeiro funil)", { requestBody: body({ nome: "", telefone: "", email: "", empresa: "", valor: { type: "number" }, funilId: "", etapa: "", responsavelId: "", origem: "", observacoes: "" }, ["nome"]) })
    },
    "/crm/leads/{id}": {
      patch: op("CRM", "Atualiza lead / muda de etapa", { parameters: [id], requestBody: body({ etapa: "", valor: { type: "number" }, nome: "", responsavelId: "" }) }),
      delete: op("CRM", "Remove lead", { parameters: [id] })
    },
    "/crm/produtos": { get: op("CRM", "Produtos") },
    "/crm/reunioes": {
      get: op("CRM", "Agenda", { parameters: [P("de", "ISO"), P("ate", "ISO"), P("leadId", "")] }),
      post: op("CRM", "Agenda reunião", { requestBody: body({ titulo: "", inicio: "2026-11-01T14:00:00-03:00", fim: "", leadId: "", responsavelId: "", observacoes: "" }, ["inicio"]) })
    },
    "/tarefas": {
      get: op("Tarefas", "Lista tarefas", { parameters: [P("status", "aberta | concluida"), P("responsavelId", "")] }),
      post: op("Tarefas", "Cria tarefa", { requestBody: body({ titulo: "", descricao: "", responsavelId: "", prazo: "ISO" }, ["titulo"]) })
    },
    "/credits": { get: op("Cadastros", "Saldo de créditos de disparo") }
  }
};

r.get("/openapi.json", (req, res) => res.json(spec));
r.get("/docs", (req, res) => res.type("html").send(`<!doctype html><html lang="pt-br"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Helora API</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.17.14/swagger-ui.min.css">
<style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif;background:#fff}.topbar{display:none}</style></head>
<body><div id="ui"></div><script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.17.14/swagger-ui-bundle.min.js"></script>
<script>SwaggerUIBundle({url:"/public/openapi.json",dom_id:"#ui",docExpansion:"list",persistAuthorization:true,tryItOutEnabled:true});</script></body></html>`));
export default r;
