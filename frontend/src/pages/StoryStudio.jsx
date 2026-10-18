import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { storyApi } from "../api.js";
import { useAuth } from "../auth.jsx";
import { StoryArtwork, StoryDialog, StoryError, StoryGraphPreview, StoryIcon, STORY_STATUS, STORY_THEMES, STORY_TOPICS } from "../components/features/stories/StoryPrimitives.jsx";
import "./stories.css";

const TACTICS = [
  { id: "explore", label: "Уточнить интересы", hint: "Выяснить, что действительно важно собеседнику.", effect: { trust: 12, goal: 8, control: 5, eq: 10 } },
  { id: "exchange", label: "Предложить обмен", hint: "Связать свою уступку со встречным условием.", effect: { trust: 5, goal: 14, control: 10, eq: 5 } },
  { id: "boundary", label: "Обозначить границы", hint: "Спокойно назвать ограничения и сохранить позицию.", effect: { trust: -3, goal: 6, control: 12, eq: 3 } },
  { id: "yield", label: "Уступить сразу", hint: "Сохранить согласие, пожертвовав частью своих интересов.", effect: { trust: 4, goal: -12, control: -10, eq: 2 } },
  { id: "pressure", label: "Надавить", hint: "Добиваться своего через ультиматум или угрозу.", effect: { trust: -15, goal: 5, control: 8, eq: -12 } },
];
const blankOption = (tactic) => ({ text: "", reaction: "", explanation: "", endingTitle: "", lesson: "", tactic });
const blankForm = () => ({ title: "", hook: "", topic: "career", theme: "mint", role: "", brief: "", speaker: "", opening: "", options: [blankOption("explore"), blankOption("yield"), blankOption("boundary")] });

function readLocalDraft(key) {
  try {
    const data = JSON.parse(sessionStorage.getItem(key) || "null");
    if (!data || !Array.isArray(data.options) || data.options.length !== 3) return null;
    const fields = ["title", "hook", "topic", "theme", "role", "brief", "speaker", "opening"];
    if (fields.some((field) => typeof data[field] !== "string") || data.options.some((option) => ["text", "reaction", "explanation", "endingTitle", "lesson", "tactic"].some((field) => typeof option[field] !== "string"))) return null;
    return data;
  } catch { return null; }
}

function toGraph(form) {
  const endings = {};
  const options = form.options.map((option, index) => {
    const id = String.fromCharCode(97 + index), next = `ending_${id}`;
    endings[next] = { title: option.endingTitle.trim(), text: option.reaction.trim(), lesson: option.lesson.trim() };
    return { id, text: option.text.trim(), next, effect: TACTICS.find((tactic) => tactic.id === option.tactic)?.effect || option.originalEffect, explanation: option.explanation.trim() };
  });
  return { roles: [{ id: "player", label: form.role.trim(), brief: form.brief.trim(), start: "opening" }], nodes: { opening: { speaker: form.speaker.trim(), text: form.opening.trim(), options } }, endings };
}

function fromGraph(story, graph) {
  const role = graph.roles?.[0];
  const node = graph.nodes?.[role?.start];
  if (graph.roles?.length !== 1 || Object.keys(graph.nodes || {}).length !== 1 || node?.options?.length !== 3 || node.options.some((option) => !graph.endings?.[option.next])) return null;
  return { title: story.title, hook: story.hook, topic: story.topic, theme: story.theme, role: role.label, brief: role.brief, speaker: node.speaker, opening: node.text, options: node.options.map((option) => {
    const ending = graph.endings[option.next];
    const tactic = TACTICS.find((item) => Object.keys(item.effect).every((key) => item.effect[key] === option.effect?.[key]));
    return { text: option.text, reaction: ending.text, explanation: option.explanation, endingTitle: ending.title, lesson: ending.lesson, tactic: tactic?.id || "original", originalEffect: option.effect };
  }) };
}

function Field({ label, hint, value, onChange, maxLength, rows, placeholder, required = true, ...props }) {
  return <label className="stories-field"><span>{label}{maxLength && <small>{value.length} / {maxLength}</small>}</span>{rows ? <textarea value={value} onChange={(event) => onChange(event.target.value)} maxLength={maxLength} rows={rows} required={required} placeholder={placeholder} {...props} /> : <input value={value} onChange={(event) => onChange(event.target.value)} maxLength={maxLength} required={required} placeholder={placeholder} {...props} />}{hint && <small>{hint}</small>}</label>;
}

export default function StoryStudio() {
  const { storyId } = useParams();
  const { user } = useAuth();
  const draftKey = `arena:story-studio:${user?.username || user?.id}:${storyId || "new"}`;
  const navigate = useNavigate();
  const [form, setForm] = useState(blankForm);
  const [story, setStory] = useState(null);
  const [originalGraph, setOriginalGraph] = useState(null);
  const [advanced, setAdvanced] = useState(false);
  const [loading, setLoading] = useState(Boolean(storyId));
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState(false);
  const [retry, setRetry] = useState(0);
  const formRef = useRef(null);
  const lock = useRef(false);
  const readOnly = advanced || (story && !["draft", "rejected"].includes(story.status));

  useEffect(() => {
    setStory(null); setForm(blankForm()); setOriginalGraph(null); setAdvanced(false); setDirty(false); setNotice("");
    if (!storyId) {
      const local = readLocalDraft(draftKey);
      if (local) { setForm(local); setDirty(true); setNotice("Восстановили текст, который вы писали в этой вкладке. На сервер он ещё не отправлен."); }
      setLoading(false); setError(""); return undefined;
    }
    let cancelled = false;
    setLoading(true); setError("");
    storyApi.draft(storyId).then((result) => {
      if (cancelled) return;
      setStory(result.story); setOriginalGraph(result.graph);
      const editableForm = fromGraph(result.story, result.graph);
      setAdvanced(!editableForm);
      const local = ["draft", "rejected"].includes(result.story.status) ? readLocalDraft(draftKey) : null;
      if (editableForm) setForm(local || editableForm);
      setDirty(Boolean(local && editableForm));
      if (local && editableForm) setNotice("Восстановили несохранённые изменения из этой вкладки. Сохраните их, когда история будет готова.");
    }).catch((failure) => { if (!cancelled) setError(failure.message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [storyId, retry, draftKey]);
  useEffect(() => {
    if (!dirty || loading) return;
    try { sessionStorage.setItem(draftKey, JSON.stringify(form)); }
    catch { setNotice("Не удалось сохранить текст в этой вкладке. Не уходите со страницы до сохранения черновика на сервер."); }
  }, [form, dirty, loading, draftKey]);
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function field(key, value) { setForm((current) => ({ ...current, [key]: value })); setDirty(true); setNotice(""); }
  function optionField(index, key, value) { setForm((current) => ({ ...current, options: current.options.map((option, optionIndex) => index === optionIndex ? { ...option, [key]: value } : option) })); setDirty(true); setNotice(""); }
  function validate() {
    if (!formRef.current?.reportValidity()) return false;
    const all = [form.title, form.hook, form.role, form.brief, form.speaker, form.opening, ...form.options.flatMap((option) => [option.text, option.reaction, option.explanation, option.endingTitle, option.lesson])];
    if (all.some((value) => !value.trim())) { setError("Заполните все поля: пробелы не заменяют реплику или разбор."); return false; }
    if (new Set(form.options.map((option) => option.text.trim().toLowerCase())).size !== 3) { setError("Три реплики должны отличаться — читателю нужен настоящий выбор."); return false; }
    if (new Set(form.options.map((option) => option.endingTitle.trim().toLowerCase())).size !== 3) { setError("Дайте трём исходам разные названия, чтобы читатель различал последствия."); return false; }
    return true;
  }
  async function save(andSubmit = false) {
    if (lock.current || readOnly || loading || (storyId && String(story?.id) !== String(storyId)) || !validate()) return;
    lock.current = true; setSaving(true); setSubmitting(andSubmit); setError(""); setNotice("");
    let saved = null;
    try {
      const payload = { title: form.title.trim(), hook: form.hook.trim(), topic: form.topic, theme: form.theme, duration_seconds: 60, graph: toGraph(form) };
      saved = story ? await storyApi.update(story.id, payload) : await storyApi.create(payload);
      setStory(saved); setOriginalGraph(payload.graph); setDirty(false);
      try { sessionStorage.removeItem(draftKey); } catch {}
      if (andSubmit) { saved = await storyApi.submit(saved.id); setStory(saved); setNotice("История отправлена редакции. После проверки она появится в ленте."); }
      else setNotice("Черновик сохранён. Можно вернуться к нему из раздела «Мои истории».");
      if (!storyId) navigate(`/stories/${saved.id}/edit`, { replace: true });
    } catch (failure) {
      setError(failure.message);
      if (saved && !storyId) navigate(`/stories/${saved.id}/edit`, { replace: true });
    } finally { lock.current = false; setSaving(false); setSubmitting(false); }
  }
  const previewStory = advanced ? story : { ...form, duration_seconds: 60 };
  const graph = advanced ? originalGraph : toGraph(form);
  return <div className="stories-page stories-studio">
    <div className="stories-studio-breadcrumb"><Link to="/stories?tab=mine"><StoryIcon name="arrow" size={17} />Мои истории</Link></div>
    <header className="stories-studio-header"><div><span className="stories-eyebrow">ВАШ ОПЫТ МОЖЕТ СТАТЬ ЧЬИМ-ТО ОТКРЫТИЕМ</span><h1>Один разговор.<br /><em>Три продолжения.</em></h1><p>Создайте короткую интерактивную историю, в которой хочется оказаться.</p></div><div className="stories-studio-state">{story && <span className={`stories-status stories-status-${story.status}`}>{STORY_STATUS[story.status]}</span>}<small>{dirty ? "Есть несохранённые изменения" : story ? "Изменения сохранены" : "Новая история"}</small></div></header>
    {loading ? <div className="stories-state" role="status">Открываем вашу историю…</div> : <>
      <StoryError error={error} onRetry={storyId && !story ? () => setRetry((value) => value + 1) : undefined} />
      {notice && <div className="stories-success" role="status"><StoryIcon name="check" size={20} />{notice}</div>}
      {story?.moderation_note && <div className="stories-review-note"><b>Комментарий редакции</b><p>{story.moderation_note}</p></div>}
      {readOnly && <div className="stories-studio-readonly"><StoryIcon name="check" size={24} /><div><h2>{story?.status === "pending" ? "Теперь слово за редакцией" : story?.status === "published" ? "Ваша история уже в ленте" : advanced ? "История с несколькими эпизодами" : "История скрыта"}</h2><p>{advanced ? "Этот формат можно просмотреть целиком. Студия коротких историй редактирует истории с одним эпизодом и тремя исходами." : story?.status === "pending" ? "Вы можете просмотреть все ветки. Редактирование станет доступно, если редакция попросит внести изменения." : story?.status === "published" ? "Посмотрите, как читатели проходят ваш разговор, и присоединитесь к обсуждению." : "Комментарий редакции поможет понять причину."}</p><div className="stories-row"><button className="stories-button stories-button-secondary" onClick={() => setPreview(true)}>Посмотреть историю</button>{story?.status === "published" && <Link className="stories-button stories-button-primary" to={`/stories/${story.id}`}>Открыть в ленте <StoryIcon name="arrow" size={17} /></Link>}</div></div></div>}
      {!readOnly && !(storyId && !story) && <div className="stories-studio-layout"><form ref={formRef} className="stories-form stories-studio-form" onSubmit={(event) => { event.preventDefault(); save(false); }}>
        <fieldset disabled={saving} className="stories-studio-section"><legend><span>01</span>Сначала — зацепить</legend><p>Знакомая ситуация и конкретная ставка. Что человек может потерять или получить?</p><Field label="Название истории" minLength={3} value={form.title} onChange={(value) => field("title", value)} maxLength={120} placeholder="Повышение, которое всё откладывают" /><Field label="Коротко о конфликте" minLength={10} value={form.hook} onChange={(value) => field("hook", value)} maxLength={500} rows={3} placeholder="Вы третий месяц выполняете работу за двоих. Руководитель снова предлагает вернуться к вопросу зарплаты позже…" /><label className="stories-field"><span>Тема</span><select value={form.topic} onChange={(event) => field("topic", event.target.value)}>{STORY_TOPICS.map((topic) => <option key={topic.id} value={topic.id}>{topic.label}</option>)}</select></label><div className="stories-theme-picker"><span>Настроение обложки</span><div>{STORY_THEMES.map((theme, index) => <label key={theme} className={`stories-theme-swatch stories-theme-${theme}${form.theme === theme ? " is-selected" : ""}`}><input type="radio" name="story-theme" value={theme} checked={form.theme === theme} onChange={() => field("theme", theme)} /><span className="stories-sr-only">{["Шалфей", "Янтарь", "Сирень", "Небо", "Роза", "Медь"][index]}</span>{form.theme === theme && <StoryIcon name="check" size={20} />}</label>)}</div></div></fieldset>
        <fieldset disabled={saving} className="stories-studio-section"><legend><span>02</span>Поставить на место героя</legend><p>Читателю нужно понять, кем он будет и почему этот разговор важен.</p><div className="stories-form-pair"><Field label="Роль читателя" value={form.role} onChange={(value) => field("role", value)} maxLength={80} placeholder="Дизайнер" /><Field label="Собеседник" value={form.speaker} onChange={(value) => field("speaker", value)} maxLength={80} placeholder="Руководитель" /></div><Field label="Цель и обстоятельства героя" value={form.brief} onChange={(value) => field("brief", value)} maxLength={1000} rows={3} placeholder="Вы хотите обсудить повышение за дополнительную ответственность, сохранив рабочие отношения." /><Field label="С чего начинается разговор?" value={form.opening} onChange={(value) => field("opening", value)} maxLength={1500} rows={3} placeholder="Я ценю твой вклад. Но сейчас сложный квартал. Давай вернёмся к этому через полгода?" hint="Прямая речь собеседника. Именно на неё будет отвечать читатель." /></fieldset>
        <section className="stories-studio-options"><div className="stories-section-title"><span>03</span><div><h2>Дать настоящий выбор</h2><p>Три разных подхода. Три последствия. Разбор, который помогает понять связь.</p></div></div>{form.options.map((option, index) => <fieldset key={index} disabled={saving} className="stories-studio-option"><legend><span>{String.fromCharCode(65 + index)}</span>Вариант ответа</legend><Field label="Реплика читателя" value={option.text} onChange={(value) => optionField(index, "text", value)} maxLength={280} rows={2} placeholder={index === 0 ? "Что должно измениться, чтобы мы могли вернуться к разговору раньше?" : index === 1 ? "Хорошо, давайте через полгода." : "Давайте тогда определим, какие задачи остаются в моей текущей роли."} /><label className="stories-field"><span>Какой это подход?</span><select value={option.tactic} onChange={(event) => optionField(index, "tactic", event.target.value)}>{option.tactic === "original" && <option value="original">Исходный подход автора</option>}{TACTICS.map((tactic) => <option key={tactic.id} value={tactic.id}>{tactic.label}</option>)}</select><small>{TACTICS.find((item) => item.id === option.tactic)?.hint || "Сохраняем исходное влияние реплики на показатели."}</small></label><Field label="Как отреагирует собеседник?" value={option.reaction} onChange={(value) => optionField(index, "reaction", value)} maxLength={1500} rows={3} placeholder="Опишите ответ и то, к чему пришли участники." /><div className="stories-form-pair"><Field label="Название этого исхода" value={option.endingTitle} onChange={(value) => optionField(index, "endingTitle", value)} maxLength={120} placeholder={index === 0 ? "Появился конкретный план" : index === 1 ? "Разговор отложен" : "Границы обозначены"} /><Field label="Почему получилось именно так?" value={option.explanation} onChange={(value) => optionField(index, "explanation", value)} maxLength={1000} rows={3} placeholder="Объясните связь между выбранной репликой и реакцией." /></div><Field label="Что взять в следующий разговор?" value={option.lesson} onChange={(value) => optionField(index, "lesson", value)} maxLength={1000} rows={2} placeholder="Один конкретный приём, который читатель сможет попробовать." /></fieldset>)}</section>
        <div className="stories-studio-publish"><p><StoryIcon name="check" size={18} />Публикуйте только свои истории или материалы, на которые у вас есть права. Не раскрывайте чужие личные данные. Перед публикацией историю проверит редакция.</p><div><button type="submit" className="stories-button stories-button-secondary" disabled={saving}>{saving && !submitting ? "Сохраняем…" : "Сохранить черновик"}</button><button type="button" className="stories-button stories-button-primary" disabled={saving} onClick={() => save(true)}>{submitting ? "Отправляем…" : "На проверку"}<StoryIcon name="arrow" size={18} /></button></div></div>
      </form><aside className="stories-studio-aside"><span className="stories-eyebrow">ТАК ВАС УВИДЯТ В ЛЕНТЕ</span><div className="stories-cover-preview"><StoryArtwork story={previewStory} /><p>{form.hook || "Опишите конфликт — и читатель узнает в нём свою ситуацию."}</p><span>{form.role || "Роль читателя"}</span></div><button type="button" className="stories-button stories-button-secondary" onClick={() => setPreview(true)}>Посмотреть все развилки <StoryIcon name="branch" size={18} /></button><div className="stories-writing-tip"><span className="stories-eyebrow">ЗАМЕТКА РЕДАКТОРА</span><h3>Сильнее всего работает узнавание.</h3><p>Конкретная реплика, понятный интерес и немного неоднозначности. Не делайте всех героев идеальными.</p><p>Подход задаёт влияние на показатели. Объясняйте поведение в этом разговоре, а не характер человека.</p></div></aside></div>}
    </>}
    {preview && <StoryDialog title="Ваша история изнутри" subtitle="Предпросмотр всех веток. Изменения сохраняются отдельно." onClose={() => setPreview(false)} wide><div className="stories-dialog-body"><StoryArtwork story={previewStory} /><p className="stories-hook">{previewStory.hook}</p><StoryGraphPreview graph={graph} /></div></StoryDialog>}
  </div>;
}
