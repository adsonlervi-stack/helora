import React, { useEffect, useRef, useState } from "react";
import { HelpCircle, LogOut, Camera, UserRound } from "lucide-react";
import { supabase } from "../supabaseClient.js";
import { uploadAvatar } from "../api.js";
import Avatar from "./Avatar.jsx";

function roleLabel(profile) {
  if (!profile) return "";
  if (profile.isSuperAdmin) return "Super Admin";
  return profile.role === "owner" ? "Gestor" : "Atendente";
}

// Sidebar principal do painel — ícone + texto, colapsável com duplo clique
// (como no sistema de referência). No mobile ela some e quem assume a
// navegação é o BottomTabBar.
export default function IconRail({ items, section, onChange, unreadTotal, profile, onAvatarUpdated, onHelp, onOpenProfile }) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("helora_sidebar_collapsed") === "1";
    } catch {
      return false;
    }
  });
  const [footerMenuOpen, setFooterMenuOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const footerRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem("helora_sidebar_collapsed", collapsed ? "1" : "0");
    } catch {
      // localStorage indisponível (modo privado etc.) — sem problema, só não persiste
    }
  }, [collapsed]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (footerRef.current && !footerRef.current.contains(e.target)) setFooterMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleCollapse = () => setCollapsed((v) => !v);

  const handlePickPhoto = (e) => {
    e.stopPropagation();
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const { avatarUrl } = await uploadAvatar(file);
      onAvatarUpdated(avatarUrl);
    } catch (err) {
      console.error("Falha ao enviar foto de perfil:", err);
    } finally {
      setUploading(false);
    }
  };

  return (
    <nav
      className={`nav-sidebar ${collapsed ? "collapsed" : ""}`}
      onDoubleClick={toggleCollapse}
      title="Clique duas vezes para recolher/expandir o menu"
    >
      <div className="nav-sidebar-brand">
        <img
          className="nav-sidebar-logo-img"
          src={collapsed ? "/brand/helora-icon.png" : "/brand/helora-wordmark.png"}
          alt="Helora"
        />
        {!collapsed && <div className="nav-sidebar-brand-account">{profile?.accountName || "Sua conta"}</div>}
      </div>

      <div className="nav-sidebar-nav">
        {items.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            className={`nav-sidebar-item ${section === key ? "active" : ""}`}
            onClick={() => onChange(key)}
            title={label}
          >
            <Icon size={18} strokeWidth={2} />
            <span>{label}</span>
            {key === "conversations" && unreadTotal > 0 && (
              <span className="nav-sidebar-badge">{unreadTotal > 9 ? "9+" : unreadTotal}</span>
            )}
          </button>
        ))}
      </div>

      <button className="nav-sidebar-item nav-sidebar-help" title="Falar com o suporte" onClick={onHelp}>
        <HelpCircle size={18} strokeWidth={2} />
        <span>Ajuda</span>
      </button>

      <div className="nav-sidebar-footer sf-clickable" ref={footerRef} onClick={() => setFooterMenuOpen((v) => !v)}>
        <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} style={{ display: "none" }} />

        <div className="avatar-upload-wrap">
          <Avatar name={profile?.name} url={profile?.avatarUrl} size={32} className="nav-sidebar-avatar" />
        </div>

        <div className="nav-sidebar-who">
          <div className="who">{profile?.name || "Usuário"}</div>
          <div className="role">{roleLabel(profile)}</div>
        </div>

        {footerMenuOpen && (
          <div className="nav-sidebar-footer-menu" onClick={(e) => e.stopPropagation()}>
            <div className="nav-sidebar-footer-menu-name">{profile?.name || "Usuário"}</div>
            <div className="nav-sidebar-footer-menu-account">{profile?.accountName}</div>
            <button className="nav-sidebar-footer-menu-photo" onClick={handlePickPhoto} disabled={uploading}>
              <Camera size={14} />
              {uploading ? "Enviando foto…" : "Trocar foto de perfil"}
            </button>
            <button className="nav-sidebar-footer-menu-photo" onClick={() => { setFooterMenuOpen(false); onOpenProfile?.(); }}>
              <UserRound size={14} />
              Meu perfil (nome e senha)
            </button>
            <button className="nav-sidebar-footer-menu-logout" onClick={() => supabase.auth.signOut()}>
              <LogOut size={14} style={{ marginRight: 6 }} />
              Sair
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
