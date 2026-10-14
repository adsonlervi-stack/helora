import { supabase, getProfileDepartmentIds } from "../config/db.js";

/**
 * Verifica o token do Supabase Auth enviado pelo frontend
 * (Authorization: Bearer <token>) e descobre a conta (account_id) do
 * usuário logado através da tabela profiles.
 *
 * Usa a service_role key (o mesmo client exportado por config/db.js),
 * então ignora RLS de propósito — é o próprio backend confirmando quem
 * é o usuário, não um acesso direto do navegador.
 */
export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Token de autenticação ausente." });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    return res.status(401).json({ error: "Sessão inválida ou expirada." });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("account_id, role, is_super_admin, name")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return res.status(403).json({ error: "Usuário sem conta associada." });
  }

  req.userId = userData.user.id;
  req.accountId = profile.account_id;
  req.role = profile.role;
  req.isSuperAdmin = profile.is_super_admin;
  req.userName = profile.name;
  req.actingAsAccount = false;

  // Super admin "entrando" numa empresa: o painel manda o cabeçalho
  // X-Account-Id e, SÓ para super admin, o backend passa a operar
  // dentro daquela conta com poderes de gestor.
  const actAs = req.headers["x-account-id"];
  if (profile.is_super_admin && actAs && actAs !== profile.account_id) {
    const { data: target } = await supabase.from("accounts").select("id").eq("id", actAs).maybeSingle();
    if (!target) return res.status(404).json({ error: "Empresa não encontrada." });
    req.accountId = target.id;
    req.role = "owner";
    req.actingAsAccount = true;
  }

  // Empresa suspensa: ninguém dela entra (o super admin continua entrando).
  if (!profile.is_super_admin) {
    const { data: acc } = await supabase.from("accounts").select("status").eq("id", profile.account_id).maybeSingle();
    if (acc?.status === "suspended") {
      return res.status(403).json({ error: "Esta empresa está suspensa. Fale com o administrador." });
    }
  }
  // "Visão de túnel": um atendente (role 'agent') só enxerga os tickets do
  // próprio setor ou atribuídos a ele. Gestor (role 'owner') vê tudo.
  req.departmentIds = req.role === "agent" ? await getProfileDepartmentIds(userData.user.id) : [];

  next();
}

/**
 * Usa depois de requireAuth — bloqueia rotas que só o super admin
 * (dono da Helora) pode acessar, como criar contas novas.
 */
export function requireSuperAdmin(req, res, next) {
  if (!req.isSuperAdmin) {
    return res.status(403).json({ error: "Acesso restrito ao administrador do sistema." });
  }
  next();
}

/**
 * Usa depois de requireAuth — bloqueia rotas que só o Gestor (dono da
 * conta) pode acessar, como gerenciar setores, equipe e canais.
 */
export function requireOwner(req, res, next) {
  if (req.role !== "owner" && !req.isSuperAdmin) {
    return res.status(403).json({ error: "Acesso restrito ao gestor da conta." });
  }
  next();
}
