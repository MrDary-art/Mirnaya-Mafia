import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";

export default function RegistrationControl() {
  const [policy, setPolicy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try { setPolicy(await api("/api/admin/registration")); setError(""); }
    catch (reason) { setError(reason.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function toggle() {
    if (!policy || loading || saving) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const result = await api("/api/admin/registration", { method: "PUT", body: { enabled: !policy.enabled, revision: policy.revision } });
      setPolicy(result);
      setMessage(result.enabled ? "Регистрация открыта. Новые пользователи могут создавать аккаунты." : "Регистрация закрыта. Вход в существующие аккаунты продолжает работать.");
    } catch (reason) {
      // A conflict or interrupted response must not leave an invented local state.
      try { setPolicy(await api("/api/admin/registration")); } catch { setPolicy(null); }
      setError(reason.message);
    } finally { setSaving(false); }
  }

  return <section className={`admin-registration ${policy?.enabled === false ? "is-closed" : ""}`} aria-labelledby="admin-registration-title" aria-busy={loading || saving}>
    <div><span className="admin-eyebrow">Доступ к сайту</span><h2 id="admin-registration-title">Регистрация пользователей</h2>
      <p>Управляйте созданием новых аккаунтов. Существующие пользователи и демо-аккаунты смогут входить в любом режиме.</p>
      <strong className="admin-registration-state" role="status">{loading ? "Проверяем состояние…" : !policy ? "Состояние неизвестно" : policy.enabled ? "Регистрация разрешена" : "Регистрация запрещена"}</strong>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
    <div className="admin-registration-action"><button type="button" className="admin-registration-button" onClick={toggle} disabled={!policy || loading || saving}>
      {saving ? "Сохраняем…" : !policy || loading ? "Загружаем…" : policy.enabled ? "Запретить регистрацию" : "Разрешить регистрацию"}
    </button>{error && <button type="button" onClick={load} disabled={loading || saving}>Обновить состояние</button>}</div>
  </section>;
}
