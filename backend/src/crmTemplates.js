// Modelos prontos de funil do CRM (colunas + campos personalizados + automações sugeridas).
// Começamos pelas corretoras de seguros, nosso maior público.
const SEGURADORAS = ["Allianz", "Azul", "Bradesco", "HDI", "Itaú", "Mapfre", "Porto Seguro", "Sompo", "SulAmérica", "Suhai", "Tokio Marine", "Yelum (Liberty)", "Zurich", "Outra"];
const TIPOS = ["Auto", "Residencial", "Vida", "Empresarial", "Saúde", "Odonto", "Viagem", "Condomínio", "Fiança locatícia", "Responsabilidade civil", "Consórcio", "Outro"];
const HORARIOS = ["Manhã", "Tarde", "Noite", "Qualquer horário"];

export const FIELD_TYPES = ["text", "textarea", "number", "currency", "date", "select"];

export const TEMPLATES = [
  {
    key: "blank",
    name: "Vendas (padrão)",
    group: "Geral",
    description: "Funil simples de vendas, sem campos extras. Você adiciona o que quiser depois.",
    stages: [
      { id: "novos", name: "Leads novos", color: "#0a84ff" },
      { id: "qualificacao", name: "Qualificação", color: "#bf5af2" },
      { id: "reuniao", name: "Reunião agendada", color: "#ff9f0a" },
      { id: "proposta", name: "Proposta", color: "#ffcc00" },
      { id: "ganho", name: "Ganho", color: "#30d158" },
      { id: "perdido", name: "Perdido", color: "#ff453a" }
    ],
    fields: []
  },
  {
    key: "seguros_renovacao",
    name: "Corretora · Renovações",
    group: "Corretora de seguros",
    description: "Carteira de apólices a vencer: vigência com contagem regressiva, seguradora, tipo de seguro e negociação.",
    stages: [
      { id: "a_renovar", name: "A renovar", color: "#0a84ff" },
      { id: "contato", name: "Contato feito", color: "#5ac8fa" },
      { id: "cotacao", name: "Cotação enviada", color: "#bf5af2",
        automations: [{ id: "a1", type: "task", active: true, title: "Retornar cotação de {nome_completo}", days: 2 }] },
      { id: "negociacao", name: "Negociação", color: "#ff9f0a" },
      { id: "renovado", name: "Renovado", color: "#30d158" },
      { id: "perdido", name: "Não renovou", color: "#ff453a" }
    ],
    fields: [
      { id: "vigencia", label: "Vigência (vencimento)", type: "date", card: true, alert: true },
      { id: "apolice", label: "Apólice", type: "text", card: true },
      { id: "seguradora", label: "Seguradora", type: "select", options: SEGURADORAS, card: true },
      { id: "tipo_seguro", label: "Tipo de seguro", type: "select", options: TIPOS, card: true },
      { id: "protocolo", label: "Protocolo", type: "text" },
      { id: "premio_atual", label: "Prêmio atual", type: "currency" },
      { id: "melhor_horario", label: "Melhor horário para contato", type: "select", options: HORARIOS },
      { id: "negociacao", label: "Negociação", type: "textarea" },
      { id: "corretora", label: "Corretora", type: "text" }
    ]
  },
  {
    key: "seguros_vendas",
    name: "Corretora · Venda nova",
    group: "Corretora de seguros",
    description: "Prospecção e cotação de seguros novos: tipo de seguro, bem segurado, indicação e seguradora escolhida.",
    stages: [
      { id: "novo", name: "Novo lead", color: "#0a84ff" },
      { id: "qualificacao", name: "Qualificação", color: "#5ac8fa" },
      { id: "cotacao", name: "Em cotação", color: "#bf5af2" },
      { id: "proposta", name: "Proposta enviada", color: "#ff9f0a",
        automations: [{ id: "a1", type: "followup", active: true, title: "Follow-up proposta {nome}", days: 2 }] },
      { id: "fechado", name: "Fechado", color: "#30d158" },
      { id: "perdido", name: "Perdido", color: "#ff453a" }
    ],
    fields: [
      { id: "tipo_seguro", label: "Tipo de seguro", type: "select", options: TIPOS, card: true },
      { id: "bem_segurado", label: "Bem segurado (veículo, imóvel…)", type: "text", card: true },
      { id: "indicado_por", label: "Indicado por", type: "text" },
      { id: "seguradora", label: "Seguradora escolhida", type: "select", options: SEGURADORAS, card: true },
      { id: "inicio_vigencia", label: "Início da vigência", type: "date" },
      { id: "melhor_horario", label: "Melhor horário para contato", type: "select", options: HORARIOS }
    ]
  },
  {
    key: "seguros_sinistros",
    name: "Corretora · Sinistros",
    group: "Corretora de seguros",
    description: "Acompanhamento de sinistros do aviso à indenização: número do sinistro, data da ocorrência e valores.",
    stages: [
      { id: "aviso", name: "Aviso de sinistro", color: "#ff453a" },
      { id: "documentos", name: "Documentação", color: "#ff9f0a" },
      { id: "analise", name: "Em análise", color: "#bf5af2" },
      { id: "regulacao", name: "Regulação / vistoria", color: "#5ac8fa" },
      { id: "indenizado", name: "Indenizado", color: "#30d158" },
      { id: "negado", name: "Negado", color: "#8e8e93" }
    ],
    fields: [
      { id: "numero_sinistro", label: "Nº do sinistro", type: "text", card: true },
      { id: "apolice", label: "Apólice", type: "text", card: true },
      { id: "seguradora", label: "Seguradora", type: "select", options: SEGURADORAS, card: true },
      { id: "tipo_seguro", label: "Tipo de seguro", type: "select", options: TIPOS },
      { id: "data_ocorrencia", label: "Data da ocorrência", type: "date" },
      { id: "valor_estimado", label: "Valor estimado", type: "currency" },
      { id: "valor_indenizado", label: "Valor indenizado", type: "currency" }
    ]
  }
];

const slug = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30);

/** Normaliza a lista de campos personalizados enviada pelo painel. */
export function cleanFields(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  return list.slice(0, 30).map((f) => {
    let id = slug(f.id || f.label) || "campo";
    while (seen.has(id)) id += "_2";
    seen.add(id);
    const type = FIELD_TYPES.includes(f.type) ? f.type : "text";
    return {
      id, label: String(f.label || id).slice(0, 60), type,
      ...(type === "select" ? { options: (Array.isArray(f.options) ? f.options : String(f.options || "").split(/[\n,;]/)).map((o) => String(o).trim()).filter(Boolean).slice(0, 50) } : {}),
      card: !!f.card, ...(type === "date" && f.alert ? { alert: true } : {})
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
