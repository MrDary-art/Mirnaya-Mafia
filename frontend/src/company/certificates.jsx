import { useState } from "react";
import { api, apiForm, downloadPrivate } from "../api.js";
import { useEffect, statusLabels, roleLabels, metricLabels, ru, formatDate, Loader, Empty, Notice } from "./shared.jsx";

export function CertificateArtwork({ item, company }) {
  const result = item.final_score == null ? "Не указан" : `${item.final_score} из 100`;
  const completion = item.completed_at ? formatDate(item.completed_at) : formatDate(item.issued_at);
  return <article className="relative aspect-[1.414/1] w-full overflow-hidden rounded-2xl border border-lime-300/40 bg-[#07110d] text-center text-[#f6f2e9] shadow-2xl" style={{ backgroundImage: "url(/api/company/certificate-template/background)", backgroundSize: "cover", backgroundPosition: "center" }}>
    <div className="absolute inset-x-[10%] top-[5%]">
      <p className="text-[7px] font-bold tracking-[.24em] text-[#c5ff57] sm:text-[10px] md:text-xs">АРЕНА ПЕРЕГОВОРОВ</p>
      <h3 className="mt-[3%] text-xl font-extrabold tracking-[.1em] sm:text-3xl md:text-5xl">СЕРТИФИКАТ</h3>
      <p className="mt-[1.5%] text-[7px] font-medium tracking-[.08em] text-[#eef3ed] sm:text-xs md:text-sm">Подтверждает успешное прохождение</p>
    </div>
    <div className="absolute inset-x-[22%] top-[31%] rounded-[4%] border border-[#c5ff57]/30 bg-[#06100d]/90 px-[4%] py-[2.5%] shadow-[0_16px_60px_rgba(0,0,0,.55)] backdrop-blur-sm">
      <p className="text-[6px] font-bold uppercase tracking-[.2em] text-[#a9c4bf] sm:text-[9px] md:text-[10px]">Сертификат выдан</p>
      <h4 className="mt-[2%] truncate text-lg font-extrabold sm:text-2xl md:text-4xl">{item.holder}</h4>
      <div className="mx-auto my-[3.5%] h-px w-[72%] bg-gradient-to-r from-transparent via-[#c5ff57]/70 to-transparent" />
      <p className="text-[5px] font-bold uppercase tracking-[.18em] text-[var(--accent-peach)] sm:text-[8px] md:text-[9px]">Задание</p>
      <p className="mt-[1%] truncate text-[8px] font-bold text-[#f6f2e9] sm:text-sm md:text-lg">{item.title}</p>
      <p className="mt-[1%] truncate text-[6px] font-medium text-[#d5e2dc] sm:text-[9px] md:text-[11px]">Компания: {item.company_name || company.name}{item.job_title ? ` · Должность: ${item.job_title}` : ""}</p>
    </div>
    <div className="absolute inset-x-[5%] bottom-[3.5%] grid grid-cols-4 items-center gap-2 rounded-xl border border-white/10 bg-[#06100d]/85 px-[3%] py-[1.5%] text-[5px] shadow-lg backdrop-blur-sm sm:text-[8px] md:text-[10px]">
      <div className="text-left"><small className="block uppercase tracking-[.12em] text-[#a9c4bf]">Результат</small><b className="mt-0.5 block text-[#f6f2e9]">{result}</b>{item.passing_score != null && <small className="block text-[#a9c4bf]">Проходной балл: {item.passing_score}</small>}</div>
      <div><small className="block uppercase tracking-[.12em] text-[#a9c4bf]">Дата прохождения</small><b className="mt-0.5 block text-[#f6f2e9]">{completion}</b></div>
      <div><small className="block uppercase tracking-[.12em] text-[#a9c4bf]">Ник в Арене</small><b className="mt-0.5 block truncate text-[#f6f2e9]">@{item.username}</b></div>
      <div className="text-right"><small className="block uppercase tracking-[.12em] text-[#a9c4bf]">Номер сертификата</small><b className="mt-0.5 block text-[#f6f2e9]">{item.certificate_id}</b></div>
    </div>
  </article>;
}


export function Certificates({ data }) {
  const id = data.company.id;
  const manager = data.permissions.manage_learning;
  const [items, setItems] = useState([]);
  const [note, setNote] = useState("");
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [preview, setPreview] = useState(null);
  const load = () => api(`/api/company/${id}/certificates`).then(setItems).catch((error) => setNote(error.message));
  useEffect(load, [id]);
  const revoke = async (event) => { event.preventDefault(); if (!revokeTarget || !revokeReason.trim()) return; try { await api(`/api/company/${id}/certificates/${revokeTarget.id}/revoke`, { method: "POST", body: { reason: revokeReason } }); setNote("Сертификат отозван."); setRevokeTarget(null); setRevokeReason(""); load(); } catch (error) { setNote(error.message); } };
  const downloadPdf = (item) => downloadPrivate(`/api/company/${id}/certificates/${item.id}/pdf`, `${item.certificate_id}.pdf`).catch((error) => setNote(error.message));
  return <section className="space-y-5"><div><div className="eyebrow">ПОДТВЕРЖДЕНИЕ КВАЛИФИКАЦИИ</div><h2 className="text-3xl font-bold">{manager ? "Корпоративные сертификаты" : "Мои корпоративные сертификаты"}</h2></div>{note && <Notice tone={note.includes("отозван") ? "success" : "red"}>{note}</Notice>}{revokeTarget && <form className="glass rounded-2xl p-5" onSubmit={revoke}><b>Отзыв сертификата: {revokeTarget.title}</b><textarea required className="company-input mt-3" rows="2" placeholder="Причина отзыва" value={revokeReason} onChange={(event) => setRevokeReason(event.target.value)} /><div className="mt-3 flex gap-2"><button className="primary-button">Подтвердить отзыв</button><button type="button" className="subtle-button" onClick={() => setRevokeTarget(null)}>Отмена</button></div></form>}{preview && <section className="fixed inset-0 z-50 grid place-items-center overflow-auto bg-slate-950/85 p-4" onMouseDown={() => setPreview(null)}><div className="w-full max-w-5xl" onMouseDown={(event) => event.stopPropagation()}><button className="subtle-button mb-3" onClick={() => setPreview(null)}>Закрыть</button><CertificateArtwork item={preview} company={data.company} /></div></section>}<div className="grid gap-4 md:grid-cols-2">{items.map((item) => <article key={item.id} className="glass rounded-3xl p-6"><h3 className="text-xl font-bold">{item.title}</h3>{manager && <p className="mt-2 text-sm text-slate-400">{item.holder}</p>}<p className="mt-4 text-sm">Выдан: {formatDate(item.issued_at)}</p><p className="text-sm">Итоговый результат: {item.final_score == null ? "не указан" : `${item.final_score}/100`}</p><p className="text-sm">Действует до: {formatDate(item.expires_at)}</p>{item.revoke_reason && <p className="mt-2 text-sm text-rose-200">Причина отзыва: {item.revoke_reason}</p>}<span className="mt-4 inline-block rounded-full bg-emerald-400/10 px-3 py-1 text-xs text-emerald-300">{statusLabels[item.status] || item.status}</span><div className="mt-4 flex flex-wrap gap-2"><button className="subtle-button" onClick={() => setPreview(item)}>Открыть сертификат</button>{item.membership_id === data.membership.id && <button className="subtle-button" onClick={() => downloadPdf(item)}>Скачать PDF</button>}{manager && item.status !== "REVOKED" && <button className="subtle-button" onClick={() => setRevokeTarget(item)}>Отозвать</button>}</div></article>)}{!items.length && <Empty>Сертификаты появятся после успешного прохождения корпоративного задания.</Empty>}</div></section>;
}
