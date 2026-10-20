import MeetingSummaryText from "./MeetingSummaryText.jsx";
const sections = [["DECISION","Решения"],["ACTION","Следующие шаги"],["QUESTION","Открытые вопросы"],["RISK","Риски"]];
export default function CouncilReviewItems({report,transcript,canReview,renderAssignee}) {
  const analysis=report.council_analysis;
  return <div className="council-review-items">{analysis && <section className="council-review-group"><h4>Разбор общего решения</h4>{analysis.feasible!=null && <p>{analysis.ended_by_organizer || analysis.ended_by_timeout ? "Встреча завершена без общего подтверждения соглашения." : analysis.feasible ? "Зафиксированное соглашение соответствует условиям сценария." : "В условиях соглашения найдены противоречия."}</p>}{analysis.issues?.length>0 && <ul>{analysis.issues.map(issue=><li key={issue}>{issue}</li>)}</ul>}{analysis.audio_coverage?.notice && <p>{analysis.audio_coverage.notice}</p>}{analysis.evidence_note && <p>{analysis.evidence_note}</p>}{analysis.episodes?.map((episode,index)=><article className="meeting-item" key={index}><b>{episode.title}</b><blockquote><b>{episode.author}</b><p>«{episode.quote}»</p></blockquote><p>{episode.lesson}</p></article>)}</section>}{sections.map(([kind,title])=>{
    const items=report.items.filter(item=>item.kind===kind);
    return <section className="council-review-group" key={kind}><h4>{title} <span>{items.length}</span></h4>{items.length ? items.map(item=>{
      const sources=canReview ? transcript.filter(segment=>item.source_segment_ids?.includes(segment.id)) : [];
      return <article key={item.id} className="meeting-item"><b>{item.title}</b>{item.detail && item.detail!==item.title && <MeetingSummaryText text={item.detail} label="Показать подробности" />}{item.confidence<80 && <p className="council-review-candidate">Найдено автоматически · проверьте смысл и формулировку</p>}{sources.length>0 && <details className="council-review-source"><summary>На основании каких реплик?</summary>{sources.map(segment=><blockquote key={segment.id}><b>{segment.speaker || "Участник"} · фрагмент {segment.id}</b><p>{segment.text}</p></blockquote>)}</details>}{kind==="ACTION" && report.status!=="PUBLISHED" && canReview && renderAssignee(item)}</article>;
    }) : <p className="council-review-none">В материалах не зафиксировано.</p>}</section>;
  })}</div>;
}
