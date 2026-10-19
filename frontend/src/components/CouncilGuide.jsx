import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown";
import "./council-authoring-ui.css";
export const councilSteps = [
  ["Получите свою роль", "Директор, финансист, руководитель проекта — у каждого своя цель, закрытые факты и предел уступок. Вы знаете только свою часть истории."],
  ["Соберите общую картину", "Спрашивайте, делитесь фактами и предлагайте условия. Одному решение не найти: важная информация есть у коллег."],
  ["Договоритесь и проверьте", "Запишите общий план и подтвердите его всей командой. В готовом кейсе новые вводные и событие меняют ход переговоров. После подписи увидите последствия и цену уступок. Разбор реплик использует только сохранённые сообщения и расшифровки."],
];
export default function CouncilGuide() {
  return <details className="council-guide council-guide-disclosure council-guide-brief" id="how-council-works">
    <summary><span><h2>Как играть</h2><span className="council-guide-teaser">У каждого — часть информации. У команды — одна задача. Сможете договориться?</span></span><span className="council-guide-toggle" aria-hidden="true"><CaretDownIcon size={22} weight="bold" /></span></summary>
    <div className="council-guide-story">
      <p><strong>Вы — команда компании в непростой ситуации.</strong> Нужно сохранить клиента, запустить продукт или согласовать бюджет. Каждый получает личную роль, но никто не видит всей картины.</p>
      <aside className="council-guide-example"><h3>Например, на кону крупный контракт</h3><p>Продажи знают: клиент согласен на меньший объём. Производство знает: в срок не успеть. Финансист знает: деньги на ускорение есть, но нужна предоплата.</p><p><strong>Пока не обменяетесь фактами, хорошее решение не сложится.</strong></p></aside>
      <ol>{councilSteps.map(([title,text],i) => <li key={title}><span>{String(i+1).padStart(2,"0")}</span><div><h3>{title}</h3><p>{text}</p></div></li>)}</ol>
      <p className="council-guide-organizer">Совет назначает владелец компании, турнир между компаниями — платформа. Сотрудники присоединяются по приглашению.</p>
      <p className="council-guide-replay">Общая победа не отменяет личных интересов. Поменяйтесь ролями и найдите другую рабочую сделку: кто уступит на этот раз?</p>
    </div>
  </details>;
}
