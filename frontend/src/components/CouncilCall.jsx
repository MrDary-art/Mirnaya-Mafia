export default function CouncilCall({meetingId}){
 return <section className="council-panel"><h3>Видеовстреча и общая доска</h3><p>Отдельная вкладка: камера, микрофон, показ экрана, рисунки и запись речи каждого игрока. Все действия проходят проверку доступа вашей компании.</p><a className="council-button" href={'/council/'+meetingId+'/call'} target="_blank" rel="noopener">Открыть звонок ↗</a></section>;
}
