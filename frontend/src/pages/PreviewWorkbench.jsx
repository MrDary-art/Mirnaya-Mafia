import { Link, useSearchParams } from "react-router-dom";
import AiMode from "./AiMode.jsx";
import PracticeGuide from "./PracticeGuide.jsx";
import ReportExample from "./ReportExample.jsx";
import GuidedDemo from "./GuidedDemo.jsx";
import { MentorExample, DuelExample } from "./PracticeExamples.jsx";

export default function PreviewWorkbench() {
  const [params] = useSearchParams();
  const page = params.get("page") || "report";
  return <div className="preview-workbench"><p className="preview-label">ПРЕДПРОСМОТР ИЗМЕНЕНИЙ · учебные примеры, без сохранения результатов</p><nav className="preview-nav" aria-label="Примеры страниц">{[["report","Разбор беседы"],["ai","Практика с ИИ"],["guide","Вы здесь впервые?"],["rooms","Как работает 1×1"],["mentor","Чат и ментор"],["duel","Сравнение интервью"],["human","Итог встречи"]].map(([id,label])=><Link key={id} to={`/preview?page=${id}`} aria-current={page===id ? "page" : undefined}>{label}</Link>)}</nav>{page === "mentor" ? <MentorExample/> : page === "duel" ? <DuelExample/> : page === "human" ? <DuelExample human/> : page === "ai" ? <AiMode/> : page === "guide" ? <PracticeGuide/> : page === "rooms" ? <GuidedDemo/> : <ReportExample/>}</div>;
}
