import { Link } from "react-router-dom";
import { ArrowUpRightIcon } from "@phosphor-icons/react/dist/csr/ArrowUpRight";
export default function PracticeGuideEntry() {
  return <Link to="/ai/guide" className="practice-guide-entry"><div><span className="eyebrow">ЗНАКОМСТВО · БЕЗ ЗАПОЛНЕНИЯ ФОРМ</span><h2>Вы здесь впервые?</h2><p>Посмотрите путь от задачи до разбора и следующей попытки.</p></div><strong>Как это работает <ArrowUpRightIcon size={23} weight="bold" /></strong></Link>;
}
