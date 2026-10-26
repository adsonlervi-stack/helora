// Modelos prontos de funil do CRM (colunas + campos personalizados + automações sugeridas).
// Começamos pelas corretoras de seguros, nosso maior público.
import { SEGURADORAS, RAMOS, PRODUTO_OPTIONS } from "./insuranceLists.js";
const RAMO_LIST = Object.keys(RAMOS);
const HORARIOS = ["Manhã", "Tarde", "Noite", "Qualquer horário"];

export const FIELD_TYPES = ["text", "textarea", "number", "currency", "date", "select"];

export const TEMPLATES = [
  {
    key: "corretora",
    name: "Corretora de seguros",
    group: "Por tipo de empresa",
    kindField: "tipo_negocio",
    description: "Um funil só para a corretora inteira: renovações, vendas novas, planos de saúde e indicações, separados pela etiqueta no topo do card. Vigência com contagem regressiva.",
    stages: [
      { id: "a_tratar", name: "A tratar", color: "#30d158" },
      { id: "em_cotacao", name: "Em cotação", color: "#0a84ff" },
      { id: "em_negociacao", name: "Em negociação", color: "#ffcc00",
        automations: [{ id: "a1", type: "task", active: true, title: "Retornar proposta de {nome_completo}", days: 2 }] },
      { id: "fechado", name: "Fechados", color: "#248a3d" },
      { id: "perdido", name: "Perdidos", color: "#ff453a" }
    ],
    fields: [
      { id: "tipo_negocio", label: "Tipo de negócio", type: "select", options: ["Renovação", "Venda nova", "Plano de saúde", "Indicação", "Endosso"] },
      { id: "vigencia", label: "Vigência (vencimento)", type: "date", card: true, alert: true },
      { id: "corretora", label: "Corretora", type: "text", card: true },
      { id: "apolice", label: "Apólice", type: "text" },
      { id: "seguradora", label: "Seguradora", type: "select", options: SEGURADORAS, free: true, card: true },
      { id: "tipo_seguro", label: "Ramo", type: "select", options: RAMO_LIST, free: true },
      { id: "produto_seguro", label: "Produto", type: "select", options: PRODUTO_OPTIONS, parent: "tipo_seguro", free: true },
      { id: "protocolo", label: "Protocolo", type: "text" },
      { id: "premio", label: "Prêmio", type: "currency" },
      { id: "vidas", label: "Nº de vidas (saúde)", type: "number" },
      { id: "melhor_horario", label: "Melhor horário para contato", type: "select", options: HORARIOS },
      { id: "negociacao", label: "Negociação", type: "textarea" }
    ]
  },
  {
    key: "sinistro",
    name: "Acompanhamento de sinistro",
    group: "Por tipo de empresa",
    kindField: "tipo_sinistro",
    description: "Do aviso ao pagamento: número do sinistro, seguradora, documentos pendentes, vistoria e prazo de resposta, com tarefas automáticas de cobrança.",
    stages: [
      { id: "aviso", name: "Aviso recebido", color: "#0a84ff",
        automations: [{ id: "a1", type: "task", active: true, title: "Abrir o sinistro de {nome_completo} na seguradora", days: 1 }] },
      { id: "documentos", name: "Documentação pendente", color: "#ff9f0a",
        automations: [{ id: "a1", type: "task", active: true, title: "Cobrar documentos do sinistro de {nome_completo}", days: 2 }] },
      { id: "analise", name: "Em análise na seguradora", color: "#bf5af2",
        automations: [{ id: "a1", type: "task", active: true, title: "Acompanhar o sinistro de {nome_completo} na seguradora", days: 5 }] },
      { id: "vistoria", name: "Vistoria / regulação", color: "#5ac8fa" },
      { id: "indenizacao", name: "Aguardando indenização / reparo", color: "#ffcc00",
        automations: [{ id: "a1", type: "task", active: true, title: "Confirmar pagamento / reparo do sinistro de {nome_completo}", days: 7 }] },
      { id: "concluido", name: "Indenizado / concluído", color: "#30d158" },
      { id: "negado", name: "Negado / encerrado", color: "#ff453a" }
    ],
    fields: [
      { id: "tipo_sinistro", label: "Tipo de sinistro", type: "select", free: true, options: ["Colisão", "Roubo / furto", "Incêndio", "Danos elétricos", "Alagamento / vendaval", "Vidros", "Terceiros", "Assistência 24h", "Morte", "Invalidez", "Reembolso saúde", "Outro"] },
      { id: "numero_sinistro", label: "Nº do sinistro", type: "text", card: true },
      { id: "seguradora", label: "Seguradora", type: "select", options: SEGURADORAS, free: true, card: true },
      { id: "ramo", label: "Ramo", type: "select", options: RAMO_LIST, free: true },
      { id: "produto", label: "Produto", type: "select", options: PRODUTO_OPTIONS, parent: "ramo", free: true },
      { id: "apolice", label: "Apólice", type: "text" },
      { id: "data_ocorrencia", label: "Data da ocorrência", type: "date" },
      { id: "data_aviso", label: "Data do aviso", type: "date" },
      { id: "prazo_resposta", label: "Prazo de resposta da seguradora", type: "date", card: true, alert: true },
      { id: "item_segurado", label: "Item segurado (placa, endereço…)", type: "text", card: true },
      { id: "oficina", label: "Oficina / prestador", type: "text" },
      { id: "terceiro", label: "Terceiro envolvido", type: "text" },
      { id: "valor_estimado", label: "Prejuízo estimado", type: "currency" },
      { id: "franquia", label: "Franquia", type: "currency" },
      { id: "valor_indenizado", label: "Valor indenizado", type: "currency" },
      { id: "docs_pendentes", label: "Documentos pendentes", type: "textarea" },
      { id: "observacoes", label: "Observações", type: "textarea" }
    ]
  },
  {
    key: "agencia_viagens",
    name: "Agência de viagens",
    group: "Por tipo de empresa",
    kindField: "tipo_viagem",
    description: "Do orçamento ao retorno da viagem. O cliente consulta voo, hotel e vouchers pelo WhatsApp com o bloco “Consultar cliente” do robô.",
    stages: [
      { id: "orcamento", name: "Orçamento", color: "#0a84ff" },
      { id: "proposta", name: "Proposta enviada", color: "#ffcc00",
        automations: [{ id: "a1", type: "task", active: true, title: "Retornar proposta de viagem de {nome_completo}", days: 2 }] },
      { id: "fechada", name: "Viagem fechada", color: "#30d158" },
      { id: "embarque", name: "Pré-embarque", color: "#bf5af2" },
      { id: "viajando", name: "Viajando", color: "#5ac8fa" },
      { id: "concluida", name: "Concluída", color: "#248a3d" },
      { id: "perdido", name: "Perdidos", color: "#ff453a" }
    ],
    fields: [
      { id: "tipo_viagem", label: "Tipo de viagem", type: "select", options: ["Nacional", "Internacional", "Cruzeiro", "Pacote", "Só aéreo", "Só hotel", "Corporativa", "Lua de mel"] },
      { id: "destino", label: "Destino", type: "text", card: true },
      { id: "ida", label: "Data de ida", type: "date", card: true, alert: true, reminders: [
        { days: 3, text: "Olá, {nome}! Faltam 3 dias para sua viagem para {destino}. ✈️\nVoo: {voo_ida}\nLocalizador: {localizador}\nHotel: {hotel}\n\nSeguem seus vouchers. Boa viagem!", sendFiles: true }
      ] },
      { id: "volta", label: "Data de volta", type: "date" },
      { id: "passageiros", label: "Passageiros", type: "number" },
      { id: "localizador", label: "Localizador (reserva)", type: "text", card: true },
      { id: "voo_ida", label: "Voo de ida (cia, nº e horário)", type: "text" },
      { id: "voo_volta", label: "Voo de volta (cia, nº e horário)", type: "text" },
      { id: "hotel", label: "Hotel", type: "text" },
      { id: "transfer", label: "Transfer", type: "text" },
      { id: "seguro_viagem", label: "Seguro viagem", type: "select", options: ["Incluído", "Não contratado"] },
      { id: "observacoes", label: "Observações para o cliente", type: "textarea" }
    ]
  },
  {
    key: "consorcio",
    name: "Consórcio",
    group: "Por tipo de empresa",
    kindField: "bem",
    description: "Venda de cotas: bem, crédito, prazo, administradora e acompanhamento até a contemplação.",
    stages: [
      { id: "novo", name: "Novo lead", color: "#0a84ff" },
      { id: "simulacao", name: "Simulação enviada", color: "#bf5af2" },
      { id: "negociacao", name: "Negociação", color: "#ff9f0a" },
      { id: "vendido", name: "Cota vendida", color: "#30d158" },
      { id: "contemplado", name: "Contemplado", color: "#ffcc00" },
      { id: "perdido", name: "Perdido", color: "#ff453a" }
    ],
    fields: [
      { id: "bem", label: "Bem", type: "select", options: ["Imóvel", "Automóvel", "Moto", "Pesados", "Serviços"] },
      { id: "credito", label: "Crédito", type: "currency", card: true },
      { id: "prazo", label: "Prazo (meses)", type: "number", card: true },
      { id: "administradora", label: "Administradora", type: "text", card: true },
      { id: "grupo_cota", label: "Grupo / cota", type: "text" }
    ]
  },
  {
    key: "imobiliaria",
    name: "Imobiliária",
    group: "Por tipo de empresa",
    kindField: "interesse",
    description: "Compra, locação e captação num funil só: tipo de imóvel, bairro, faixa de valor e visita.",
    stages: [
      { id: "novo", name: "Novo contato", color: "#0a84ff" },
      { id: "atendimento", name: "Em atendimento", color: "#5ac8fa" },
      { id: "visita", name: "Visita agendada", color: "#bf5af2" },
      { id: "proposta", name: "Proposta", color: "#ff9f0a" },
      { id: "fechado", name: "Fechado", color: "#30d158" },
      { id: "perdido", name: "Perdido", color: "#ff453a" }
    ],
    fields: [
      { id: "interesse", label: "Interesse", type: "select", options: ["Compra", "Locação", "Captação", "Avaliação"] },
      { id: "tipo_imovel", label: "Tipo de imóvel", type: "select", options: ["Apartamento", "Casa", "Terreno", "Sala comercial", "Galpão", "Outro"], card: true },
      { id: "bairro", label: "Bairro / região", type: "text", card: true },
      { id: "faixa_valor", label: "Faixa de valor", type: "currency", card: true },
      { id: "codigo_imovel", label: "Código do imóvel", type: "text" },
      { id: "data_visita", label: "Data da visita", type: "date" }
    ]
  },
  {
    key: "clinica",
    name: "Clínica / consultório",
    group: "Por tipo de empresa",
    kindField: "tipo_atendimento",
    description: "Do primeiro contato ao tratamento: procedimento, convênio e data da consulta.",
    stages: [
      { id: "novo", name: "Novo contato", color: "#0a84ff" },
      { id: "avaliacao", name: "Avaliação agendada", color: "#bf5af2" },
      { id: "orcamento", name: "Orçamento enviado", color: "#ff9f0a" },
      { id: "tratamento", name: "Em tratamento", color: "#30d158" },
      { id: "retorno", name: "Retorno", color: "#5ac8fa" },
      { id: "perdido", name: "Não fechou", color: "#ff453a" }
    ],
    fields: [
      { id: "tipo_atendimento", label: "Tipo", type: "select", options: ["Primeira consulta", "Retorno", "Procedimento", "Avaliação"] },
      { id: "procedimento", label: "Procedimento de interesse", type: "text", card: true },
      { id: "convenio", label: "Convênio", type: "text", card: true },
      { id: "data_consulta", label: "Data da consulta", type: "date", card: true },
      { id: "orcamento", label: "Orçamento", type: "currency" }
    ]
  },
  {
    key: "blank",
    name: "Em branco (vendas)",
    group: "Por tipo de empresa",
    description: "Funil simples de vendas, sem campos extras. Você cria os campos que quiser.",
    stages: [
      { id: "novos", name: "Leads novos", color: "#0a84ff" },
      { id: "qualificacao", name: "Qualificação", color: "#bf5af2" },
      { id: "reuniao", name: "Reunião agendada", color: "#ff9f0a" },
      { id: "proposta", name: "Proposta", color: "#ffcc00" },
      { id: "ganho", name: "Ganho", color: "#30d158" },
      { id: "perdido", name: "Perdido", color: "#ff453a" }
    ],
    fields: []
  }
];

for (const t of TEMPLATES) for (const f of t.fields) if (f.id === t.kindField) f.kind = true;

const slug = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30);

/** Normaliza a lista de campos personalizados enviada pelo painel. */
export function cleanFields(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  return list.slice(0, 40).map((f) => {
    let id = slug(f.id || f.label) || "campo";
    while (seen.has(id)) id += "_2";
    seen.add(id);
    const type = FIELD_TYPES.includes(f.type) ? f.type : "text";
    return {
      id, label: String(f.label || id).slice(0, 60), type,
      ...(type === "select" ? { options: (Array.isArray(f.options) ? f.options : String(f.options || "").split(/[\n,;]/)).map((o) => String(o).trim()).filter(Boolean).slice(0, 250) } : {}),
      ...(type === "select" && f.free ? { free: true } : {}),
      ...(type === "select" && f.parent ? { parent: slug(f.parent) } : {}),
      card: !!f.card, ...(type === "date" && f.alert ? { alert: true } : {}), ...(type === "select" && f.kind ? { kind: true } : {}),
      ...(type === "date" && Array.isArray(f.reminders) && f.reminders.length ? {
        reminders: f.reminders.slice(0, 5).map((r) => ({
          days: Math.max(-60, Math.min(365, parseInt(r.days, 10) || 0)), text: String(r.text || "").slice(0, 2000), sendFiles: !!r.sendFiles
        })).filter((r) => r.text.trim())
      } : {})
    };
  }).filter((f) => f.label);
}

/** Valores dos campos de um lead (só chaves conhecidas quando a lista de campos é dada). */
export function cleanCustom(obj, fields) {
  if (!obj || typeof obj !== "object") return {};
  const allowed = fields?.length ? new Set(fields.map((f) => f.id)) : null;
  const out = {};
  for (const [k, v] of Object.entries(obj).slice(0, 40)) {
    if (allowed && !allowed.has(k)) continue;
    if (v === null || v === undefined || v === "") continue;
    out[String(k).slice(0, 40)] = typeof v === "number" ? v : String(v).slice(0, 2000);
  }
  return out;
}
