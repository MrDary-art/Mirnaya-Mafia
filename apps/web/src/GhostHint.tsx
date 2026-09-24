import { useState } from "react";
export default function GhostHint({hint}:{hint?:string}){
  const [enabled,setEnabled]=useState(false);
  if(!hint)return null;
  return <div className="ghost-hint"><label className="item-choice"><input type="checkbox" checked={enabled} onChange={event=>setEnabled(event.target.checked)}/><span>Тренер-призрак · показывать подсказку</span></label>{enabled&&<p>{hint}</p>}</div>;
}
