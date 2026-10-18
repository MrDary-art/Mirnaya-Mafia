import {useState} from 'react';
export default function CouncilParticipantPicker({people,selected,onChange,capacity}) {
  const [query,setQuery]=useState('');
  const normalized=query.trim().toLocaleLowerCase('ru');
  const visible=people.filter(p=>`${p.name} ${p.username}`.toLocaleLowerCase('ru').includes(normalized));
  return <fieldset className="council-people-picker"><legend>Участники <span>{selected.length} / {capacity}</span></legend>
    {people.length>0?<><label className="council-people-search"><span className="sr-only">Найти сотрудника</span><input type="search" placeholder="Найти сотрудника по имени" value={query} onChange={e=>setQuery(e.target.value)}/></label><div className="council-people-grid">{visible.map(person=>{
      const checked=selected.includes(person.id),disabled=!checked&&selected.length>=capacity;
      const initials=person.name.split(/\s+/).filter(Boolean).slice(0,2).map(s=>s[0]).join('');
      return <label className={`council-person-choice${checked?' is-selected':''}${disabled?' is-disabled':''}`} key={person.id}>
        <input type="checkbox" checked={checked} disabled={disabled} onChange={e=>onChange(e.target.checked?[...selected,person.id]:selected.filter(id=>id!==person.id))}/>
        <span className="council-person-avatar" aria-hidden="true">{initials}</span><span className="council-person-name"><b>{person.name}</b><small>@{person.username}</small></span><span className="council-person-check" aria-hidden="true">{checked?'✓':'+'}</span>
      </label>;
    })}</div>{!visible.length&&<p>Сотрудник не найден.</p>}</>:<p>Добавьте сотрудников в разделе «Команда». Пригласить их в совет можно и позже.</p>}
  </fieldset>;
}
