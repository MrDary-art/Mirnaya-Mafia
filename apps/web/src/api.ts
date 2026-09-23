let csrf = "";
export function setCsrf(value:string) { csrf=value; }
export async function transcribeWav(wav:ArrayBuffer):Promise<string> {
  const response=await fetch("/api/ai/transcribe",{method:"POST",credentials:"same-origin",headers:{"content-type":"audio/wav","x-csrf-token":csrf},body:wav});
  const data=await response.json();
  if(!response.ok)throw Error(data.error??`Ошибка ${response.status}`);
  return String(data.text??"");
}
export async function api<T>(path:string, method="GET", body?:unknown):Promise<T> {
  const response=await fetch(`/api${path}`,{method,credentials:"same-origin",headers:{...(body?{"content-type":"application/json"}:{}),...(method!=="GET"&&csrf?{"x-csrf-token":csrf}:{})},body:body?JSON.stringify(body):undefined});
  const data=await response.json().catch(()=>({error:"Сервер вернул пустой ответ"}));
  if(!response.ok) throw Error(data.error??`Ошибка ${response.status}`);
  return data as T;
}
