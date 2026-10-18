import SupportDesk from "../components/SupportDesk.jsx";
import PageHeader from "../design/PageHeader.jsx";

export default function SupportPage(){
  return <section className="mx-auto max-w-3xl space-y-6"><PageHeader title="Мои обращения"/><SupportDesk placement="page"/></section>;
}
