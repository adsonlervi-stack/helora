import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, Filter, ArrowUpDown, Columns3, Upload, Download, Plus, Building2, User, X, ChevronLeft, ChevronRight, PanelLeftClose } from "lucide-react";
import { crm } from "../api.js";
import { notify } from "../dialogs.js";
import { openClient } from "./CrmCliente.jsx";

const errText = (e) => e?.response?.data?.error || e.message;
const digits = (v) => String(v || "").replace(/\D/g, "");
export const fmtDoc = (d) => { d = digits(d); return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") : d; };
export const fmtPhone = (p) => { const d = digits(p); return !d ? "" : d.length >= 12 ? `+${d}` : d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : d; };
const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const openRow = (r) => openClient(r.clientId ? `c:${r.clientId}` : r.leadId);

const COLS = [
  ["doc", "CNPJ / CPF", (r) => fmtDoc(r.doc) || <em>Indefinido</em>, true],
  ["ownerName", "Responsável", (r) => r.ownerName || <em>Indefinido</em>, true],
  ["email", "E-mail", (r) => r.email || <em>Indefinido</em>, true],
  ["phone", "Telefone", (r) => fmtPhone(r.phone) || <em>Indefinido</em>, true],
  ["open", "Negócios em andamento", (r) => r.open, true],
  ["won", "Negócios ganhos", (r) => r.won, false],
  ["value", "Valor ganho", (r) => (r.value ? brl(r.value) : "—"), false],
  ["source", "Origem", (r) => r.source || "—", false],
  ["sector", "Setor", (r) => r.sector || "—", false],
  ["category", "Categoria", (r) => r.category || "—", false],
  ["legalName", "Razão social", (r) => r.legalName || "—", false],
  ["createdAt", "Cliente desde", (r) => (r.createdAt ? new Date(r.createdAt).toLocaleDateString("pt-BR") : "—"), false],
  ["lastAt", "Última interação", (r) => (r.lastAt ? new Date(r.lastAt).toLocaleDateString("pt-BR") : "—"), false]
];
const SORTS = [["name", "Nome (A-Z)"], ["-createdAt", "Mais recentes"], ["createdAt", "Mais antigos"], ["-lastAt", "Última interação"], ["-open", "Mais negócios em andamento"], ["-value", "Maior valor ganho"]];

export function useClients() {
  const [data, setData] = useState(null);
  const load = () => crm.companies().then(setData).catch((e) => { notify(errText(e), "error"); setData({ rows: [] }); });
  useEffect(() => { load(); const on = () => load(); window.addEventListener("helora:clients-changed", on); return () => window.removeEventListener("helora:clients-changed", on); }, []);
  return [data, load];
}

/** Empresas e Pessoas (igual ao Agendor): tabela com busca, filtros, ordenação, colunas, importar, exportar e adicionar. */
export default function CrmEmpresas({ ctx }) {
  const [data, load] = useClients();
  const [kind, setKind] = useState("empresa");
  const [q, setQ] = useState("");
  const [f, setF] = useState({ owner: "", deals: "", source: "" });
  const [sort, setSort] = useState("name");
  const [cols, setCols] = useState(() => { try { const s = JSON.parse(localStorage.getItem("helora_emp_cols")); if (Array.isArray(s)) return new Set(s); } catch {} return new Set(COLS.filter((c) => c[3]).map((c) => c[0])); });
  const [menu, setMenu] = useState(null);
  const [page, setPage] = useState(0);
  const [form, setForm] = useState(null);
  const fileRef = useRef(null);
  useEffect(() => { try { localStorage.setItem("helora_emp_cols", JSON.stringify([...cols])); } catch {} }, [cols]);
  useEffect(() => setPage(0), [kind, q, f, sort]);

  const rows = useMemo(() => {
    if (!data) return [];
    const t = q.trim().toLowerCase(), td = digits(q);
    const list = data.rows.filter((r) => {
      if (r.kind !== kind) return false;
      if (t && !(`${r.name} ${r.legalName} ${r.email} ${r.description || ""}`.toLowerCase().includes(t) || (td.length >= 3 && (digits(r.doc).includes(td) || digits(r.phone).includes(td))))) return false;
      if (f.owner && (f.owner === "_none" ? r.ownerId : r.ownerId !== f.owner)) return false;
      if (f.deals === "sem" && r.open > 0) return false;
      if (f.deals === "com" && !r.open) return false;
      if (f.deals === "nunca" && r.deals > 0) return false;
      if (f.deals === "ganhos" && !r.won) return false;
      if (f.source && r.source !== f.source) return false;
      return true;
    });
    const k = sort.replace("-", ""), dir = sort.startsWith("-") ? -1 : 1;
    return list.sort((a, b) => { const x = a[k] ?? "", y = b[k] ?? ""; return (typeof x === "number" ? x - y : String(x).localeCompare(String(y), "pt-BR")) * dir; });
  }, [data, kind, q, f, sort]);
  const sources = useMemo(() => [...new Set((data?.rows || []).map((r) => r.source).filter(Boolean))].sort(), [data]);
  const shown = rows.slice(page * 25, page * 25 + 25);
  const chosen = COLS.filter((c) => cols.has(c[0]));
  const activeFilters = Object.values(f).filter(Boolean).length;

  const exportXlsx = async () => {
    const XLSX = await import("xlsx");
    const body = rows.map((r) => ({ Nome: r.name, [kind === "empresa" ? "CNPJ" : "CPF"]: fmtDoc(r.doc), "Razão social": r.legalName, Responsável: r.ownerName, "E-mail": r.email, Telefone: fmtPhone(r.phone), Origem: r.source, Setor: r.sector, Categoria: r.category, "Negócios em andamento": r.open, "Negócios ganhos": r.won, "Valor ganho": r.value, "Cliente desde": r.createdAt ? new Date(r.createdAt) : "" }));
    const ws = XLSX.utils.json_to_sheet(body, { cellDates: true });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, kind === "empresa" ? "Empresas" : "Pessoas");
    XLSX.writeFile(wb, `${kind === "empresa" ? "Empresas" : "Pessoas"} ${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}.xlsx`);
  };
  const importFile = async (file) => {
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: false });
      const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      const pick = (o, re) => { const k = Object.keys(o).find((x) => re.test(norm(x))); return k ? String(o[k]).trim() : ""; };
      const items = raw.map((o) => ({
        kind, name: pick(o, /^(nome|empresa|cliente|razao)/), doc: pick(o, /cnpj|cpf|documento/), legalName: pick(o, /razao/), email: pick(o, /e-?mail/), phone: pick(o, /telefone|celular|whats|fone/),
        source: pick(o, /origem/), sector: pick(o, /setor|segmento/), category: pick(o, /categoria/), description: pick(o, /descri|observ/)
      })).filter((x) => x.name);
      if (!items.length) return notify("Não encontrei a coluna Nome na planilha.", "error");
      const r = await crm.createCompanies(items);
      notify(`${r.created} ${kind === "empresa" ? "empresas importadas" : "pessoas importadas"}.`, "success");
      load();
    } catch (e) { notify(errText(e), "error"); }
  };

  return (
    <div className="emp">
      {data && data.tableOk === false && <div className="admin-feedback error" style={{ marginBottom: 10 }}>Para cadastrar e importar clientes, rode a migration 042 (clientes) no Supabase. A lista abaixo mostra os clientes que já têm negócios.</div>}
      <div className="emp-top">
        <div className="ac-seg">
          <button className={kind === "empresa" ? "on" : ""} onClick={() => setKind("empresa")}><Building2 size={14} /> Empresas</button>
          <button className={kind === "pessoa" ? "on" : ""} onClick={() => setKind("pessoa")}><User size={14} /> Pessoas</button>
        </div>
        <label className="emp-search"><input placeholder={kind === "empresa" ? "Buscar por nome, razão social, CNPJ ou descrição" : "Buscar por nome, CPF, telefone ou e-mail"} value={q} onChange={(e) => setQ(e.target.value)} /><Search size={15} /></label>
        <div className="emp-pop">
          <button className={`emp-btn ${activeFilters ? "on" : ""}`} onClick={() => setMenu(menu === "f" ? null : "f")}><Filter size={14} /> Filtros{activeFilters ? ` (${activeFilters})` : ""}</button>
          {menu === "f" && (
            <div className="emp-menu" onMouseLeave={() => setMenu(null)}>
              <label>Responsável<select value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })}><option value="">Todos</option><option value="_none">Indefinido</option>{(ctx.team || []).map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}</select></label>
              <label>Negócios<select value={f.deals} onChange={(e) => setF({ ...f, deals: e.target.value })}><option value="">Todos</option><option value="com">Com negócio em andamento</option><option value="sem">Sem negócio em andamento</option><option value="nunca">Nunca teve negócio</option><option value="ganhos">Já fechou negócio</option></select></label>
              <label>Origem<select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}><option value="">Todas</option>{sources.map((s) => <option key={s}>{s}</option>)}</select></label>
              {activeFilters > 0 && <button className="lp-link sm" onClick={() => setF({ owner: "", deals: "", source: "" })}>Limpar filtros</button>}
            </div>
          )}
        </div>
        <div className="emp-pop">
          <button className="emp-btn link" onClick={() => setMenu(menu === "s" ? null : "s")}><ArrowUpDown size={14} /> Ordenar</button>
          {menu === "s" && <div className="emp-menu" onMouseLeave={() => setMenu(null)}>{SORTS.map(([k, l]) => <button key={k} className={sort === k ? "on" : ""} onClick={() => { setSort(k); setMenu(null); }}>{l}</button>)}</div>}
        </div>
        <div className="emp-pop">
          <button className="emp-btn link" onClick={() => setMenu(menu === "c" ? null : "c")}><Columns3 size={14} /> Colunas</button>
          {menu === "c" && <div className="emp-menu" onMouseLeave={() => setMenu(null)}>{COLS.map(([k, l]) => <label key={k} className="rp-check"><input type="checkbox" checked={cols.has(k)} onChange={() => setCols((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; })} /> {l}</label>)}</div>}
        </div>
        <span style={{ flex: 1 }} />
        <button className="emp-btn link" onClick={() => fileRef.current?.click()} disabled={data?.tableOk === false}><Upload size={14} /> Importar</button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { const fl = e.target.files?.[0]; e.target.value = ""; fl && importFile(fl); }} />
        <button className="emp-btn link" onClick={exportXlsx} disabled={!rows.length}><Download size={14} /> Exportar</button>
        <button className="emp-add" onClick={() => setForm({ kind })} disabled={data?.tableOk === false}><Plus size={15} /> Adicionar {kind === "empresa" ? "empresa" : "pessoa"}</button>
      </div>

      <div className="emp-table">
        <table>
          <thead><tr><th className="emp-name">Nome</th>{chosen.map(([k, l]) => <th key={k}>{l}</th>)}</tr></thead>
          <tbody>
            {!data && <tr><td colSpan={chosen.length + 1} className="cv-muted">Carregando…</td></tr>}
            {shown.map((r, i) => (
              <tr key={r.key} onClick={() => openRow(r)}>
                <td className="emp-name"><span className="emp-i">{String(page * 25 + i + 1).padStart(2, "0")}</span><span className="emp-ic">{r.kind === "empresa" ? <Building2 size={15} /> : <User size={15} />}</span><strong>{r.name}</strong></td>
                {chosen.map(([k, , render]) => <td key={k}>{render(r)}</td>)}
              </tr>
            ))}
            {data && !rows.length && <tr><td colSpan={chosen.length + 1} className="cv-muted">Nenhum{kind === "empresa" ? "a empresa" : "a pessoa"} encontrad{kind === "empresa" ? "a" : "a"}.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="emp-foot">
        <span>Exibindo {shown.length} de {rows.length} {kind === "empresa" ? "empresas" : "pessoas"}</span>
        <span style={{ flex: 1 }} />
        <button className="lp-icon" disabled={!page} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={16} /></button>
        <span>{page + 1} / {Math.max(1, Math.ceil(rows.length / 25))}</span>
        <button className="lp-icon" disabled={(page + 1) * 25 >= rows.length} onClick={() => setPage((p) => p + 1)}><ChevronRight size={16} /></button>
      </div>
      {form && <ClientForm initial={form} team={ctx.team || []} me={ctx.profile} onClose={() => setForm(null)} onSaved={(c) => { setForm(null); load(); if (c?.id) openClient(`c:${c.id}`); }} />}
    </div>
  );
}

/** Cadastro/edição de empresa ou pessoa. */
export function ClientForm({ initial, team, me, onClose, onSaved }) {
  const [f, setF] = useState({ kind: "empresa", name: "", doc: "", legalName: "", email: "", phone: "", ownerId: me?.id || "", source: "", sector: "", category: "", description: "", address: "", ...initial });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const pj = f.kind === "empresa";
  const lookup = async () => {
    const d = digits(f.doc);
    if (d.length !== 14) return;
    try {
      const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${d}`).then((x) => (x.ok ? x.json() : null));
      if (r) setF((c) => ({ ...c, legalName: c.legalName || r.razao_social || "", name: c.name || r.nome_fantasia || r.razao_social || "", sector: c.sector || r.cnae_fiscal_descricao || "", email: c.email || (r.email || "").toLowerCase(), phone: c.phone || digits(r.ddd_telefone_1), address: c.address || [r.logradouro, r.numero, r.bairro, r.municipio, r.uf].filter(Boolean).join(", ") }));
    } catch {}
  };
  const save = async () => {
    if (!f.name.trim()) return notify("Informe o nome.", "error");
    setBusy(true);
    try { const r = f.id ? await crm.updateCompany(f.id, f) : await crm.createCompany(f); notify("Cliente salvo.", "success"); window.dispatchEvent(new Event("helora:clients-changed")); onSaved(r); }
    catch (e) { notify(errText(e), "error"); }
    setBusy(false);
  };
  return createPortal(
    <div className="lp-overlay" style={{ zIndex: 1300 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cl-form ea" style={{ width: "min(640px,94vw)" }}>
        <h3>{f.id ? "Editar" : "Adicionar"} {pj ? "empresa" : "pessoa"}</h3>
        {!f.id && <div className="full ac-seg" style={{ background: "#f2f2f7", width: "fit-content" }}>
          <button className={pj ? "on" : ""} onClick={() => setF({ ...f, kind: "empresa" })}><Building2 size={14} /> Empresa</button>
          <button className={!pj ? "on" : ""} onClick={() => setF({ ...f, kind: "pessoa" })}><User size={14} /> Pessoa</button>
        </div>}
        <label className="full"><span>{pj ? "Nome da empresa" : "Nome completo"}</span><input value={f.name} onChange={set("name")} autoFocus /></label>
        <label><span>{pj ? "CNPJ" : "CPF"}</span><input value={fmtDoc(f.doc)} onChange={(e) => setF({ ...f, doc: digits(e.target.value).slice(0, 14) })} onBlur={pj ? lookup : undefined} placeholder={pj ? "Preenche os dados sozinho" : ""} /></label>
        {pj ? <label><span>Razão social</span><input value={f.legalName} onChange={set("legalName")} /></label> : <label><span>Empresa onde trabalha</span><input value={f.legalName} onChange={set("legalName")} /></label>}
        <label><span>E-mail</span><input type="email" value={f.email} onChange={set("email")} /></label>
        <label><span>Telefone / WhatsApp</span><input value={f.phone} onChange={set("phone")} inputMode="tel" /></label>
        <label><span>Responsável</span><select value={f.ownerId || ""} onChange={set("ownerId")}><option value="">Indefinido</option>{team.map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}</select></label>
        <label><span>Origem</span><input value={f.source} onChange={set("source")} placeholder="Indicação, Instagram…" /></label>
        {pj && <label><span>Setor</span><input value={f.sector} onChange={set("sector")} /></label>}
        <label><span>Categoria</span><input value={f.category} onChange={set("category")} placeholder="Cliente, prospect, parceiro…" /></label>
        <label className="full"><span>Endereço</span><input value={f.address} onChange={set("address")} /></label>
        <label className="full"><span>Descrição</span><textarea rows={3} value={f.description} onChange={set("description")} /></label>
        <div className="cl-form-foot"><button className="lp-btn" onClick={onClose}>Cancelar</button><button className="lp-btn primary" disabled={busy} onClick={save}>{busy ? "Salvando…" : "Salvar"}</button></div>
      </div>
    </div>,
    document.body
  );
}

/** Painel recolhível ao lado do funil: lista de clientes com busca e "só sem negócios em andamento". */
export function ClientsSidePanel({ onClose }) {
  const [data] = useClients();
  const [kind, setKind] = useState("empresa");
  const [q, setQ] = useState("");
  const [onlyFree, setOnlyFree] = useState(() => { try { return localStorage.getItem("helora_side_free") === "1"; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem("helora_side_free", onlyFree ? "1" : "0"); } catch {} }, [onlyFree]);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase(), td = digits(q);
    return (data?.rows || []).filter((r) => r.kind === kind && (!onlyFree || !r.open) && (!t || r.name.toLowerCase().includes(t) || (td.length >= 3 && (digits(r.doc).includes(td) || digits(r.phone).includes(td)))))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [data, kind, q, onlyFree]);
  return (
    <aside className="csp">
      <div className="csp-h"><strong>Clientes</strong><button className="lp-icon" onClick={onClose} title="Recolher"><PanelLeftClose size={16} /></button></div>
      <div className="ac-seg csp-seg">
        <button className={kind === "empresa" ? "on" : ""} onClick={() => setKind("empresa")}>Empresas</button>
        <button className={kind === "pessoa" ? "on" : ""} onClick={() => setKind("pessoa")}>Pessoas</button>
      </div>
      <label className="rp-check csp-free"><input type="checkbox" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} /> Só quem está sem negócio em andamento</label>
      <label className="emp-search"><input placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} /><Search size={14} /></label>
      <small className="csp-n">{rows.length} resultados</small>
      <div className="csp-list">
        {!data && <div className="cv-muted">Carregando…</div>}
        {rows.slice(0, 300).map((r) => (
          <button key={r.key} className="csp-it" onClick={() => openRow(r)}>
            <span className="emp-ic">{r.kind === "empresa" ? <Building2 size={15} /> : <User size={15} />}</span>
            <span><strong>{r.name}</strong><small>{[fmtPhone(r.phone), r.email].filter(Boolean).join(" · ") || (r.open ? `${r.open} em andamento` : "Sem negócio em andamento")}</small></span>
          </button>
        ))}
      </div>
    </aside>
  );
}
