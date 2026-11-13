// CPF / CNPJ: validação (dígitos verificadores) e formatação.
export const onlyDigits = (v) => String(v || "").replace(/\D/g, "");

export function isCPF(v) {
  const d = onlyDigits(v);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const calc = (len) => {
    let s = 0;
    for (let i = 0; i < len; i++) s += Number(d[i]) * (len + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

export function isCNPJ(v) {
  const d = onlyDigits(v);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (len) => {
    const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let s = 0;
    for (let i = 0; i < len; i++) s += Number(d[i]) * w[i];
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

/** Formata enquanto digita: 000.000.000-00 ou 00.000.000/0000-00 */
export function fmtDoc(v) {
  const d = onlyDigits(v).slice(0, 14);
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (d.length < 11) {
    return d.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d{1,2})$/, "$1.$2.$3-$4");
  }
  return d.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4").replace(/\/(\d{4})(\d{1,2})$/, "/$1-$2");
}

/** "cpf" | "cnpj" | "invalid" | "incomplete" | "" */
export function docStatus(v) {
  const d = onlyDigits(v);
  if (!d) return "";
  if (d.length < 11 || (d.length > 11 && d.length < 14)) return "incomplete";
  if (d.length === 11) return isCPF(d) ? "cpf" : "invalid";
  return isCNPJ(d) ? "cnpj" : "invalid";
}

/** Edição de CPF/CNPJ com máscara: apagar um ponto, barra ou traço apaga o número de antes (senão a máscara volta e "não deixa corrigir"). */
export function editDoc(prev, e) {
  const el = e.target, next = el.value, pos = el.selectionStart ?? next.length;
  const pd = onlyDigits(prev), nd = onlyDigits(next);
  if (next.length < String(fmtDoc(prev)).length && nd === pd && pd.length) {
    const before = onlyDigits(next.slice(0, pos)).length;
    const cut = Math.max(0, before - 1);
    return pd.slice(0, cut) + pd.slice(cut + 1);
  }
  return nd.slice(0, 14);
}
