import { Link } from "react-router-dom";
import { HeartIcon } from "@phosphor-icons/react/dist/csr/Heart";
import { ChatCircleIcon } from "@phosphor-icons/react/dist/csr/ChatCircle";
import { BookmarkSimpleIcon } from "@phosphor-icons/react/dist/csr/BookmarkSimple";
import { ArrowBendUpRightIcon } from "@phosphor-icons/react/dist/csr/ArrowBendUpRight";
import { ImageSquareIcon } from "@phosphor-icons/react/dist/csr/ImageSquare";
import { VideoCameraIcon } from "@phosphor-icons/react/dist/csr/VideoCamera";
import { DotsThreeIcon } from "@phosphor-icons/react/dist/csr/DotsThree";
import { PaperPlaneTiltIcon } from "@phosphor-icons/react/dist/csr/PaperPlaneTilt";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";
import { CheckIcon } from "@phosphor-icons/react/dist/csr/Check";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { CaretLeftIcon } from "@phosphor-icons/react/dist/csr/CaretLeft";
import { CaretRightIcon } from "@phosphor-icons/react/dist/csr/CaretRight";
import { UsersIcon } from "@phosphor-icons/react/dist/csr/Users";
import { BuildingsIcon } from "@phosphor-icons/react/dist/csr/Buildings";
import { GlobeHemisphereWestIcon } from "@phosphor-icons/react/dist/csr/GlobeHemisphereWest";
import { LockSimpleIcon } from "@phosphor-icons/react/dist/csr/LockSimple";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/csr/ArrowClockwise";
import { PencilSimpleIcon } from "@phosphor-icons/react/dist/csr/PencilSimple";
import { TrashIcon } from "@phosphor-icons/react/dist/csr/Trash";
import { ChartBarIcon } from "@phosphor-icons/react/dist/csr/ChartBar";
import { BooksIcon } from "@phosphor-icons/react/dist/csr/Books";
import { FlagIcon } from "@phosphor-icons/react/dist/csr/Flag";
import { PushPinIcon } from "@phosphor-icons/react/dist/csr/PushPin";
import { PauseIcon } from "@phosphor-icons/react/dist/csr/Pause";
import { PlayIcon } from "@phosphor-icons/react/dist/csr/Play";
import { EyeIcon } from "@phosphor-icons/react/dist/csr/Eye";
import { LinkIcon } from "@phosphor-icons/react/dist/csr/Link";
import { UserPlusIcon } from "@phosphor-icons/react/dist/csr/UserPlus";
import { UserAvatar } from "../cosmetics/CosmeticVisual.jsx";
import { StoryDialog } from "../features/stories/StoryPrimitives.jsx";
import "../../pages/stories.css";

export const AUDIENCES = { PUBLIC: "Все, кому доступен профиль", FRIENDS: "Друзья", FOLLOWERS: "Подписчики", ONLY_ME: "Только я", COMPANY_INTERNAL: "Участники компании" };
const icons = { heart: HeartIcon, comment: ChatCircleIcon, bookmark: BookmarkSimpleIcon, share: ArrowBendUpRightIcon, image: ImageSquareIcon, video: VideoCameraIcon, more: DotsThreeIcon, send: PaperPlaneTiltIcon, search: MagnifyingGlassIcon, plus: PlusIcon, check: CheckIcon, close: XIcon, left: CaretLeftIcon, right: CaretRightIcon, users: UsersIcon, company: BuildingsIcon, globe: GlobeHemisphereWestIcon, lock: LockSimpleIcon, refresh: ArrowClockwiseIcon, edit: PencilSimpleIcon, trash: TrashIcon, poll: ChartBarIcon, book: BooksIcon, flag: FlagIcon, pin: PushPinIcon, pause: PauseIcon, play: PlayIcon, eye: EyeIcon, link: LinkIcon, follow: UserPlusIcon };
export function FeedIcon({ name, size = 20, filled, ...props }) { const Component = icons[name] || BooksIcon; return <Component size={size} weight={filled ? "fill" : "regular"} aria-hidden="true" {...props} />; }
export const nameOf = (author) => author?.display_name || author?.username || "Участник Арены";
export const timeOf = (date) => date ? new Date(date).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
export const numberOf = (value = 0) => new Intl.NumberFormat("ru-RU").format(value);

export function FeedAvatar({ author, company, size = "sm" }) {
  return company ? <span className="arena-feed-company-avatar"><FeedIcon name="company" size={24} /></span> : <UserAvatar avatarCode={author?.avatar_code} frameCode={author?.frame_code} userId={author?.id} size={size} name={nameOf(author)} />;
}
export function FeedAuthor({ author, company, date, children }) {
  const path = company?.path || author?.path || `/people/${encodeURIComponent(author?.username || "")}`;
  return <div className="arena-feed-author"><Link to={path} aria-label={`Профиль: ${company?.name || nameOf(author)}`}><FeedAvatar author={author} company={company} /></Link><div><Link to={path}>{company?.name || nameOf(author)}{company && <FeedIcon name="company" size={14} />}</Link><span>{date && <time dateTime={date} title={new Date(date).toLocaleString("ru-RU")}>{timeOf(date)}</time>}{children}</span></div></div>;
}
export function FeedError({ error, retry }) { return error ? <div className="arena-feed-error" role="alert"><p>{error}</p>{retry && <button className="arena-feed-button" type="button" onClick={retry}><FeedIcon name="refresh" size={17} />Повторить</button>}</div> : null; }
export function FeedEmpty({ title = "Здесь пока тихо", children, action }) { return <div className="arena-feed-empty"><FeedIcon name="comment" size={36} /><h2>{title}</h2><p>{children}</p>{action}</div>; }
export function FeedSkeleton() { return <div className="arena-feed-skeleton" role="status"><div /><i /><i /><span /><span className="arena-feed-sr-only">Загружаем публикации…</span></div>; }
export function FeedDialog({ title, children, onClose, wide, subtitle }) { return <StoryDialog title={title} subtitle={subtitle} onClose={onClose} wide={wide}><div className="arena-feed-dialog-content">{children}</div></StoryDialog>; }
export function AudienceSelect({ value, onChange, company = false, disabled }) { return <label className="arena-feed-audience"><FeedIcon name={value === "PUBLIC" ? "globe" : "lock"} size={16} /><span className="arena-feed-sr-only">Кто увидит публикацию</span><select aria-label="Кто увидит публикацию" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>{Object.entries(AUDIENCES).filter(([id]) => company ? id !== "FRIENDS" : id !== "COMPANY_INTERNAL").map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>; }

export function SafePostText({ text }) {
  const parts = String(text || "").split(/(https?:\/\/[^\s<>]+|#[\p{L}\p{N}_]{1,80}|@[\p{L}\p{N}_.-]{2,40})/gu);
  return <>{parts.map((part, index) => /^https?:\/\//i.test(part) ? <a key={index} href={part} target="_blank" rel="noopener noreferrer nofollow">{part}</a> : /^#[\p{L}\p{N}_]+$/u.test(part) ? <Link key={index} to={`/feed?q=${encodeURIComponent(part)}`}>{part}</Link> : /^@[\p{L}\p{N}_.-]+$/u.test(part) ? <Link key={index} to={`/people/${encodeURIComponent(part.slice(1))}`}>{part}</Link> : <span key={index}>{part}</span>)}</>;
}
export function LinkedContent({ content }) {
  if (!content) return null;
  const labels = { SCENARIO: "Сценарий", ACHIEVEMENT: "Достижение", RESULT: "Завершённая практика", LESSON: "Обучение", CERTIFICATE: "Сертификат" };
  const inside = <><span className="arena-feed-link-icon"><FeedIcon name={content.kind === "ACHIEVEMENT" ? "check" : "book"} size={26} /></span><div><small>{labels[content.kind] || "Материал Арены"}{content.verified && <span><FeedIcon name="check" size={12} />Подтверждено Ареной</span>}</small><b>{content.title}</b><span>{content.available ? content.kind === "SCENARIO" || content.kind === "RESULT" ? "Попробовать самому" : "Открыть материал" : "Автор изменил доступ или материал больше недоступен"}</span></div>{content.available && <FeedIcon name="right" size={20} />}</>;
  if (!content.available || !content.path) return <div className="arena-feed-content-link is-unavailable">{inside}</div>;
  return content.path.startsWith("/api/") ? <a className="arena-feed-content-link" href={content.path} target="_blank" rel="noreferrer">{inside}</a> : <Link className="arena-feed-content-link" to={content.path}>{inside}</Link>;
}
