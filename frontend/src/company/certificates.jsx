import { useState } from "react";
import { api, downloadPrivate } from "../api.js";
import { useEffect, statusLabels, formatDate, Empty, Notice } from "./shared.jsx";

export function CertificateArtwork({ item, company }) {
  const result = item.final_score == null ? "Не указан" : `${item.final_score} из 100`;
  const completion = item.completed_at ? formatDate(item.completed_at) : formatDate(item.issued_at);
  return <article className="relative aspect-[1.414/1] w-full overflow-hidden rounded-2xl border border-lime-300/40 bg-[#022e24] text-center text-[#e7f1ec] shadow-2xl" style={{ backgroundImage: "url(/api/company/certificate-template/background)", backgroundSize: "cover", backgroundPosition: "center" }}>
    <div className="absolute inset-x-[10%] top-[5%]">
      <p className="text-[7px] font-bold tracking-[.24em] text-[#e7f1ec] sm:text-[10px] md:text-xs">АРЕНА ПЕРЕГОВОРОВ</p>
      <h3 className="mt-[3%] text-xl font-extrabold tracking-[.1em] sm:text-3xl md:text-5xl">СЕРТИФИКАТ</h3>
      <p className="mt-[1.5%] text-[7px] font-medium tracking-[.08em] text-[#e7f1ec] sm:text-xs md:text-sm">Подтверждает успешное прохождение</p>
    </div>
    <div className="absolute inset-x-[22%] top-[31%] rounded-[4%] border border-[#9fc3b2]/30 bg-[#022e24]/90 px-[4%] py-[2.5%] shadow-[0_16px_60px_rgba(2, 46, 36,.55)] backdrop-blur-sm">
      <p className="text-[6px] font-bold uppercase tracking-[.2em] text-[#9fc3b2] sm:text-[9px] md:text-[10px]">Сертификат выдан</p>
      <h4 className="mt-[2%] truncate text-lg font-extrabold sm:text-2xl md:text-4xl">{item.holder}</h4>
      <div className="mx-auto my-[3.5%] h-px w-[72%] bg-gradient-to-r from-transparent via-[#e7f1ec]/70 to-transparent" />
      <p className="text-[5px] font-bold uppercase tracking-[.18em] text-[var(--accent-peach)] sm:text-[8px] md:text-[9px]">Задание</p>
      <p className="mt-[1%] truncate text-[8px] font-bold text-[#e7f1ec] sm:text-sm md:text-lg">{item.title}</p>
      <p className="mt-[1%] truncate text-[6px] font-medium text-[#e7f1ec] sm:text-[9px] md:text-[11px]">Компания: {item.company_name || company.name}{item.job_title ? ` · Должность: ${item.job_title}` : ""}</p>
    </div>
    <div className="absolute inset-x-[5%] bottom-[3.5%] grid grid-cols-4 items-center gap-2 rounded-xl border border-white/10 bg-[#022e24]/85 px-[3%] py-[1.5%] text-[5px] shadow-lg backdrop-blur-sm sm:text-[8px] md:text-[10px]">
      <div className="text-left"><small className="block uppercase tracking-[.12em] text-[#9fc3b2]">Результат</small><b className="mt-0.5 block text-[#e7f1ec]">{result}</b>{item.passing_score != null && <small className="block text-[#9fc3b2]">Проходной балл: {item.passing_score}</small>}</div>
      <div><small className="block uppercase tracking-[.12em] text-[#9fc3b2]">Дата прохождения</small><b className="mt-0.5 block text-[#e7f1ec]">{completion}</b></div>
      <div><small className="block uppercase tracking-[.12em] text-[#9fc3b2]">Ник в Арене</small><b className="mt-0.5 block truncate text-[#e7f1ec]">@{item.username}</b></div>
      <div className="text-right"><small className="block uppercase tracking-[.12em] text-[#9fc3b2]">Номер сертификата</small><b className="mt-0.5 block text-[#e7f1ec]">{item.certificate_id}</b></div>
    </div>
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
