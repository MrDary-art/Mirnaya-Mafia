import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";

export default function InstallationNotice() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (sessionStorage.getItem("installation-notice-dismissed")) return;
    api("/api/installation/status", { auth: false }).then(x => setShow(x.needs_setup)).catch(() => {});
  }, []);
  if (!show) return null;
  return <aside style={{ position: "fixed", zIndex: 9999, bottom: 16, left: 16, maxWidth: "min(420px, calc(100vw - 32px))", padding: 18, borderRadius: 16, background: "#eaf3e6", color: "#243a2d", boxShadow: "0 5px 24px #0003" }} aria-label="Настройка установки"><b>Сайт установлен</b><p>Администратор может подключить ИИ и проверить голос в настройках.</p><Link to="/admin">Открыть управление</Link><button aria-label="Закрыть уведомление" style={{ marginLeft: 16 }} onClick={() => { sessionStorage.setItem("installation-notice-dismissed", "1"); setShow(false); }}>Закрыть</button></aside>;
}
