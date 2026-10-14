import React, { useRef, useState } from "react";
import { MoreHorizontal, LogOut, X, Camera } from "lucide-react";
import { supabase } from "../supabaseClient.js";
import { uploadAvatar } from "../api.js";
import Avatar from "./Avatar.jsx";

function roleLabel(profile) {
  if (!profile) return "";
  if (profile.isSuperAdmin) return "Super Admin";
  return profile.role === "owner" ? "Gestor" : "Atendente";
}

// Barra inferior do mobile: os 3 primeiros itens ficam à mostra, o resto
// (+ o usuário logado e o Sair) fica atrás do botão "Mais" — igual ao
// sistema de referência.
export default function BottomTabBar({ items, section, onChange, unreadTotal, profile, onAvatarUpdated }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const primary = items.slice(0, 3);
  const rest = items.slice(3);
  const moreActive = rest.some((i) => i.key === section);

  const handlePick = (key) => {
    onChange(key);
    setMoreOpen(false);
  };

  const handlePickPhoto = () => fileInputRef.current?.click();

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
    <>
      <nav className="tab-bar">
        {primary.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            className={`tab-btn ${section === key ? "active" : ""}`}
            onClick={() => onChange(key)}
          >
            <Icon size={20} strokeWidth={2} />
            {label}
            {key === "conversations" && unreadTotal > 0 && (
              <span className="tab-badge">{unreadTotal > 9 ? "9+" : unreadTotal}</span>
            )}
          </button>
        ))}

        <button className={`tab-btn ${moreActive ? "active" : ""}`} onClick={() => setMoreOpen(true)}>
          <MoreHorizontal size={20} strokeWidth={2} />
          Mais
        </button>
      </nav>

      {moreOpen && (
        <div className="modal-overlay" onClick={() => setMoreOpen(false)}>
          <div className="modal-card more-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="more-sheet-head">
              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                onChange={handleFileChange}
                style={{ display: "none" }}
              />
              <div className="avatar-upload-wrap">
                <Avatar name={profile?.name} url={profile?.avatarUrl} size={42} />
                <button className="avatar-upload-badge" title="Trocar foto de perfil" onClick={handlePickPhoto} disabled={uploading}>
                  <Camera />
                </button>
              </div>
              <div className="more-sheet-info">
                <div className="more-sheet-name">{profile?.name || "Usuário"}</div>
                <div className="more-sheet-role">{roleLabel(profile)}</div>
              </div>
              <button className="modal-close more-sheet-close" onClick={() => setMoreOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="more-sheet-list">
              {rest.map(({ key, label, icon: Icon }) => (
                <button key={key} className="more-sheet-item" onClick={() => handlePick(key)}>
                  <Icon size={18} strokeWidth={2} />
                  {label}
                  {key === "conversations" && unreadTotal > 0 && (
                    <span className="tab-badge more-sheet-badge">{unreadTotal > 9 ? "9+" : unreadTotal}</span>
                  )}
                </button>
              ))}

              <button
                className="more-sheet-item more-sheet-logout"
                onClick={() => {
                  setMoreOpen(false);
                  supabase.auth.signOut();
                }}
              >
                <LogOut size={18} strokeWidth={2} />
                Sair
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
