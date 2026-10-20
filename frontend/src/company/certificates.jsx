import { useState } from "react";
import { api, downloadPrivate } from "../api.js";
import { useEffect, statusLabels, formatDate, Empty, Notice } from "./shared.jsx";
import certificateExample from "../assets/certificate-example.png";

export function CertificateTemplateSettings() {
  const [failed, setFailed] = useState(false);
  const file = certificateExample;
  return <section className="business-management-card business-certificate-template">
    <div><h3>Образец сертификата</h3><p>Полный образец оформления с демонстрационными данными. Это не выданный сотруднику сертификат.</p></div>
    {failed ? <Notice tone="red">Не удалось загрузить образец. Обновите страницу или попробуйте открыть файл отдельно.</Notice> : <img src={file} alt="Образец корпоративного сертификата с демонстрационными данными" onError={() => setFailed(true)} />}
    <div className="business-management-actions"><a className="subtle-button" href={file} target="_blank" rel="noopener noreferrer">Открыть образец</a><a className="primary-button" href={file} download="arena-certificate-example.png">Скачать образец · PNG</a></div>
    <p className="business-management-note">Выданные именные сертификаты и их PDF доступны в разделе «Аналитика → Сертификаты».</p>
  </section>;
}

export function CertificateArtwork({ item }) {
  const result = item.final_score == null ? "Не указан" : `${item.final_score} из 100`;
  const completion = item.completed_at ? formatDate(item.completed_at) : formatDate(item.issued_at);
  const facts = [
    ["Результат", result, item.passing_score == null ? "" : `Проходной балл: ${item.passing_score}`],
    ["Дата прохождения", completion, ""],
    ["Ник в Арене", `@${item.username}`, ""],
    ["Номер сертификата", item.certificate_id, ""],
  ];
  return <article className="business-certificate-artwork" style={{ backgroundImage: "url(/api/company/certificate-template/background?v=certificate-v2)" }} aria-label={`Сертификат ${item.holder}`}>
    <img className="business-certificate-logo" src="/assets/arena-owl-logo.png?v=owl-suit" alt="" />
    <p className="business-certificate-brand">АРЕНА ПЕРЕГОВОРОВ</p>
    <header className="business-certificate-title">
      <h3>СЕРТИФИКАТ</h3>
      <p>ПОДТВЕРЖДАЕТ УСПЕШНОЕ ПРОХОЖДЕНИЕ</p>
    </header>
    <section className="business-certificate-recipient">
      <span>ФИО</span>
      <strong>{item.holder}</strong>
    </section>
    <section className="business-certificate-assignment">
      <span>ЗАДАНИЕ</span>
      <strong>{item.title}</strong>
    </section>
    <div className="business-certificate-divider" aria-hidden="true"><i /></div>
    <footer className="business-certificate-facts">
      {facts.map(([label, value, detail]) => <div key={label}>
        <span>{label}</span>
        <strong>{value}</strong>
        {detail && <small>{detail}</small>}
      </div>)}
    </footer>
  </article>;
}


export function Certificates({ data }) {
  const initialVisible = 4;
  const id = data.company.id;
  const manager = data.permissions.manage_learning;
  const [items, setItems] = useState([]);
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState(null);
  const [visibleCount, setVisibleCount] = useState(initialVisible);
  const load = () => api(`/api/company/${id}/certificates`).then(setItems).catch((error) => setNote(error.message));
  useEffect(load, [id]);
  useEffect(() => { setVisibleCount(initialVisible); }, [id]);
  const downloadPdf = (item) => downloadPrivate(`/api/company/${id}/certificates/${item.id}/pdf`, `${item.certificate_id}.pdf`).catch((error) => setNote(error.message));
  const visibleItems = manager ? items.slice(0, visibleCount) : items;
  const remaining = Math.max(0, items.length - visibleItems.length);
  return <section className="space-y-5"><div><div className="eyebrow">ПОДТВЕРЖДЕНИЕ КВАЛИФИКАЦИИ</div><h2 className="text-3xl font-bold">{manager ? "Корпоративные сертификаты" : "Мои корпоративные сертификаты"}</h2></div>{note && <Notice tone="red">{note}</Notice>}{preview && <section className="fixed inset-0 z-50 grid place-items-center overflow-auto bg-slate-950/85 p-4" onMouseDown={() => setPreview(null)}><div className="w-full max-w-5xl" onMouseDown={(event) => event.stopPropagation()}><button className="subtle-button mb-3" onClick={() => setPreview(null)}>Закрыть</button><CertificateArtwork item={preview} company={data.company} /></div></section>}<div className="grid gap-4 md:grid-cols-2">{visibleItems.map((item) => <article key={item.id} className="glass rounded-3xl p-6"><h3 className="text-xl font-bold">{item.title}</h3>{manager && <p className="mt-2 text-sm text-slate-400">{item.holder}</p>}<p className="mt-4 text-sm">Выдан: {formatDate(item.issued_at)}</p><p className="text-sm">Итоговый результат: {item.final_score == null ? "не указан" : `${item.final_score}/100`}</p><p className="text-sm">Действует до: {formatDate(item.expires_at)}</p><span className="mt-4 inline-block rounded-full bg-lime-400/10 px-3 py-1 text-xs text-lime-300">{statusLabels[item.status] || item.status}</span><div className="mt-4 flex flex-wrap gap-2"><button className="subtle-button" onClick={() => setPreview(item)}>Открыть сертификат</button>{item.membership_id === data.membership.id && <button className="subtle-button" onClick={() => downloadPdf(item)}>Скачать PDF</button>}</div></article>)}{!items.length && <Empty>Сертификаты появятся после успешного прохождения корпоративного задания.</Empty>}</div>{manager && items.length > 0 && <div className="business-certificates-pagination"><span>Показано {visibleItems.length} из {items.length}</span>{remaining > 0 && <button type="button" className="subtle-button" onClick={() => setVisibleCount(current => Math.min(items.length, current + initialVisible))}>Показать ещё {Math.min(initialVisible, remaining)}</button>}</div>}</section>;
}
