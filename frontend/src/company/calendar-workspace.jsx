import { Calendar, CorporateActivities } from "./engagement.jsx";
import MeetingProtocols from "./meeting-protocols.jsx";
import { GrowthTools } from "./growth.jsx";
import { useWorkspaceTab, WorkspaceTabs } from "./workspace-ui.jsx";
export default function CalendarWorkspace(props) {
  const manager = Boolean(props.data.permissions?.manage_team);
  const items = [["events", "События и сроки"], ["meetings", "Встречи, протоколы и поручения"], ...(manager ? [["activities", "Командные активности"], ["leagues", "Лиги и турниры"]] : [])];
  const [view, setView] = useWorkspaceTab("view", "events", items.map(([key]) => key));
  return <section className="profile-results"><p className="workspace-navigation-note">Календарь — для встреч и сроков. Выполнение учебных заданий находится в «Обучении».</p><WorkspaceTabs items={items} value={view} onChange={setView} label="Разделы календаря"/>{view === "events" && <Calendar {...props}/>}{view === "meetings" && <MeetingProtocols {...props}/>}{view === "activities" && <CorporateActivities {...props}/>}{view === "leagues" && <GrowthTools data={props.data} section="leagues"/>}</section>;
}
