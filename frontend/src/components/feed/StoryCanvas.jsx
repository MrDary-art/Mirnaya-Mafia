import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";

const COLORS = ["#022e24", "#1f4d3a", "#4f8f75", "#9fc3b2", "#e7f1ec"];
export default forwardRef(function StoryCanvas({ background, image, text, disabled, onDirty, textColor = "#e7f1ec", textPosition = "center", textSize = 28 }, ref) {
  const svg = useRef(null), active = useRef(null);
  const [strokes, setStrokes] = useState([]), [color, setColor] = useState(COLORS[0]), [tool, setTool] = useState("brush"), [size, setSize] = useState(8);
  const [redo, setRedo] = useState([]);
  function changeStrokes(next) { setStrokes(next); onDirty(next.length > 0); }
  useImperativeHandle(ref, () => ({
    async exportFile() {
      const copy = svg.current.cloneNode(true);
      if (image) {
        const blob = await fetch(image).then(r => r.blob());
        const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
        copy.querySelector("image")?.setAttribute("href", data);
      }
      const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: "image/svg+xml;charset=utf-8" }));
      try {
        const bitmap = new Image(); bitmap.src = url; await bitmap.decode();
        const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1080;
        canvas.getContext("2d").drawImage(bitmap, 0, 0, 1080, 1080);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
        if (!blob) throw new Error("Не удалось сохранить холст. Попробуйте ещё раз.");
        return new File([blob], "arena-story.png", { type: "image/png" });
      } finally { URL.revokeObjectURL(url); }
    }
  }), [background, image, text, strokes, textColor, textPosition, textSize]);
  function point(event) { const rect = svg.current.getBoundingClientRect(); return [(event.clientX - rect.left) / rect.width * 600, (event.clientY - rect.top) / rect.height * 600]; }
  function start(event) {
    if (disabled || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const [x, y] = point(event); const stroke = { color, erase: tool === "eraser", size: tool === "eraser" ? size * 3 : size, points: `${x},${y} ${x + .01},${y}` };
    active.current = stroke; setStrokes(items => [...items, stroke]); setRedo([]); onDirty(true);
  }
  function move(event) {
    if (!active.current) return;
    const [x, y] = point(event); active.current = { ...active.current, points: `${active.current.points} ${x},${y}` };
    const next = active.current; setStrokes(items => [...items.slice(0, -1), next]);
  }
  const lines = useMemo(() => {
    const context = document.createElement("canvas").getContext("2d");
    context.font = `600 ${textSize}px sans-serif`;
    return text.split("\n").flatMap(paragraph => {
      const result = []; let line = "";
      for (const character of Array.from(paragraph)) {
        if (context.measureText(line + character).width > 490 && line) { result.push(line); line = ""; }
        line += character;
      }
      result.push(line); return result;
    });
  }, [text, textSize]);
  const lineHeight = Math.min(textSize * 1.25, 480 / Math.max(1, lines.length));
  const drawing = strokes.reduce((content, stroke, index) => stroke.erase ? <g mask={`url(#story-erase-${index})`}>{content}</g> : <g>{content}<polyline points={stroke.points} fill="none" stroke={stroke.color} strokeWidth={stroke.size} strokeLinecap="round" strokeLinejoin="round" /></g>, null);
  const textY = textPosition === "top" ? 64 : textPosition === "bottom" ? 536 - (lines.length - 1) * lineHeight : 300 - (lines.length - 1) * lineHeight / 2;
  return <section className="story-paint" aria-label="Редактор холста">
    <div className="story-paint-tools" role="toolbar" aria-label="Инструменты рисования">
      <button type="button" aria-pressed={tool === "brush"} onClick={() => setTool("brush")} disabled={disabled}>✎ Кисть</button>
      <button type="button" aria-pressed={tool === "eraser"} onClick={() => setTool("eraser")} disabled={disabled}>▱ Ластик</button>
      <button type="button" onClick={() => { setRedo(items => [...items, strokes[strokes.length - 1]]); changeStrokes(strokes.slice(0, -1)); }} disabled={disabled || !strokes.length}>↶ Назад</button>
      <button type="button" onClick={() => { changeStrokes([...strokes, redo[redo.length - 1]]); setRedo(items => items.slice(0, -1)); }} disabled={disabled || !redo.length}>↷ Вернуть</button>
      <label>Толщина <select value={size} onChange={event => setSize(Number(event.target.value))} disabled={disabled}><option value={4}>Тонкая</option><option value={8}>Средняя</option><option value={16}>Толстая</option></select></label>
    </div>
    <div className="story-paint-palette" aria-label="Цвет кисти">{COLORS.map(value => <button key={value} type="button" style={{ background: value }} aria-label={`Цвет ${value}`} aria-pressed={value === color} disabled={disabled} onClick={() => { setColor(value); setTool("brush"); }} />)}</div>
    <div className="story-paint-board"><svg ref={svg} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" role="img" aria-label="Квадратный холст истории. Рисуйте кистью или добавьте текст ниже." onPointerDown={start} onPointerMove={move} onPointerUp={() => { active.current = null; }} onPointerCancel={() => { active.current = null; }}>
      {/* White and black encode mask visibility; they never paint the story. */}
      <defs>{strokes.map((stroke, index) => stroke.erase && <mask key={index} id={`story-erase-${index}`} maskUnits="userSpaceOnUse" x="0" y="0" width="600" height="600"><rect width="600" height="600" fill="white" /><polyline points={stroke.points} fill="none" stroke="black" strokeWidth={stroke.size} strokeLinecap="round" strokeLinejoin="round" /></mask>)}</defs>
      <rect width="600" height="600" fill={background} />
      {image && <image href={image} width="600" height="600" preserveAspectRatio="xMidYMid slice" />}
      {drawing}
      <text x="300" y={textY} textAnchor="middle" fill={textColor} stroke={image ? (["#e7f1ec", "#9fc3b2"].includes(textColor) ? "#022e24" : "#e7f1ec") : "none"} strokeWidth="1.5" paintOrder="stroke" fontFamily="sans-serif" fontSize={Math.min(textSize, lineHeight * .85)} fontWeight="600">{lines.map((line, index) => <tspan key={index} x="300" dy={index ? lineHeight : 0}>{line}</tspan>)}</text>
    </svg></div>
    <p className="arena-social-story-helper">1080 × 1080 · рисуйте мышью или пальцем. Ластик убирает только рисунок, не фото и текст.</p>
  </section>;
});
