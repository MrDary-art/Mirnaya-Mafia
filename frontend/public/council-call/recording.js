export function createRecording({api,code,getToken,getMember,error,status,uploadBinary}){
 let recorder=null,id=null,chain=Promise.resolve(),failed=[],stopping=null;
 const upload=async blob=>{if(uploadBinary){await uploadBinary(id,blob);return;}const res=await fetch('/api/rooms/'+code+'/audio/'+id,{method:'POST',headers:{Authorization:'Bearer '+getToken()},body:blob});if(!res.ok)throw new Error((await res.json()).error);};
 async function start(track){
  if(!track||getMember()?.role<0)return;if(recorder?.state==='inactive')throw new Error('Сначала повторите загрузку предыдущей записи.');if(recorder)return;
  if(!window.MediaRecorder)throw new Error('Этот браузер не поддерживает запись. Используйте актуальный Chrome или Edge.');
  const mime=['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4'].find(x=>MediaRecorder.isTypeSupported(x));
  if(!mime)throw new Error('Нет поддерживаемого формата записи звука.');
  const rec=await api('recordstart',{mime});id=rec.id;failed=[];chain=Promise.resolve();
  recorder=new MediaRecorder(new MediaStream([track]),{mimeType:mime,audioBitsPerSecond:32000});
  recorder.ondataavailable=e=>{if(!e.data.size)return;const blob=e.data;chain=chain.then(async()=>{if(failed.length){failed.push(blob);return;}try{await upload(blob);}catch(e){failed.push(blob);status('Ошибка загрузки · запись сохранена в этой вкладке');error(e.message);}});};
  recorder.start(5000);status('● Идёт запись вашего микрофона');
 }
 async function finish(){if(stopping)return stopping;if(!recorder)return;if(recorder.state==='inactive')return retry();
  const old=recorder;stopping=new Promise(resolve=>{old.onstop=resolve;old.stop();}).then(async()=>{await chain;if(failed.length)throw new Error('Не все фрагменты загружены. Нажмите «Повторить загрузку», не закрывайте вкладку.');await api('recordfinish',{id});recorder=null;status('✓ Запись загружена для расшифровки');}).finally(()=>{stopping=null;});return stopping;
 }
 async function retry(){await chain;const remaining=[...failed];failed=[];for(let i=0;i<remaining.length;i++){try{await upload(remaining[i]);}catch(e){failed.push(...remaining.slice(i));throw e;}}if(recorder?.state==='inactive'){await api('recordfinish',{id});recorder=null;status('✓ Запись загружена');}}
 return {start,finish,retry,hasPending:()=>!!recorder||failed.length>0,hasFailed:()=>failed.length>0||!!(recorder?.state==='inactive'&&!stopping)};
}
