import { useEffect, useState } from 'react';

export default function OwlDebugPanel({ owl }) {
  const [clip, setClip] = useState('Idle');
  const [stats, setStats] = useState(() => owl.getDiagnostics());
  useEffect(() => {
    const timer = setInterval(() => setStats(owl.getDiagnostics()), 200);
    return () => clearInterval(timer);
  }, [owl]);
  const duration = stats.clips.find(item => item.name === clip)?.duration || 1;
  return <details className="owl-debug-panel" open>
    <summary>Сова v4 · проверка анимаций</summary>
    <label>Клип<select value={clip} onChange={event => { setClip(event.target.value); owl.inspectClip(event.target.value); }}>{stats.clips.map(item => <option key={item.name}>{item.name}</option>)}</select></label>
    <button onClick={() => owl.inspectClip(clip)}>С начала</button>
    <button onClick={() => owl.setPaused(!owl.paused)}>{owl.paused ? 'Продолжить' : 'Пауза'}</button>
    <label>Позиция: {stats.time.toFixed(2)} / {duration.toFixed(2)} с<input type="range" min="0" max={duration} step="0.01" value={Math.min(stats.time, duration)} onChange={event => { if (!owl.debug) owl.inspectClip(clip); owl.seek(Number(event.target.value)); owl.setPaused(true); setStats(owl.getDiagnostics()); }} /></label>
    <label>Скорость<select value={stats.speed} onChange={event => owl.setSpeed(Number(event.target.value))}><option value="1">1×</option><option value="0.5">0,5×</option></select></label>
    <label>Ракурс<select defaultValue="0" onChange={event => { if (!owl.debug) owl.inspectClip(clip); owl.debugYaw = Number(event.target.value); }}><option value="0">Спереди (+Z)</option><option value={Math.PI / 2}>Сбоку</option><option value={Math.PI}>Сзади</option></select></label>
    <label className="owl-debug-toggle"><input type="checkbox" onChange={event => owl.showSkeleton(event.target.checked)} />Скелет</label>
    <label className="owl-debug-toggle"><input type="checkbox" onChange={event => owl.showAxes(event.target.checked)} />Оси и опорная точка</label>
    <button onClick={() => owl.resumeJourney()}>Вернуться к прокрутке</button>
    <pre>{stats.state} · {stats.clip}{'\n'}{stats.actions.map(item => `${item.name}: вес ${item.weight.toFixed(2)}`).join('\n')}{'\n'}Root Y: {stats.rootY?.toFixed(3)}{'\n'}{owl.assetUrl}{'\n'}SHA-256: {owl.sha256?.slice(0, 16)}…</pre>
  </details>;
}
