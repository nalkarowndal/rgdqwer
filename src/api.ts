export class ApiError extends Error { constructor(message: string, public tokenFile?: string) { super(message); } }
let session: Promise<string> | undefined;
function token() {
  session ??= fetch('/api/session').then(async response => {
    if (!response.ok) throw new Error('로컬 서버 연결을 확인하세요.');
    return (await response.json() as { token: string }).token;
  }).catch(error => { session = undefined; throw error; });
  return session;
}
export async function api<T>(path: string, body?: unknown, method?: 'POST' | 'PUT' | 'DELETE', timeout = 12000): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method: method ?? (body === undefined ? 'GET' : 'PUT'),
    headers: { Authorization: `Bearer ${await token()}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401) session = undefined;
    throw new ApiError(result.error ?? '요청을 처리하지 못했습니다.', result.tokenFile);
  }
  return result as T;
}
export async function artifactBlob(id: string): Promise<Blob> {
  const response = await fetch(`/api/artifacts/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${await token()}` }, signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error('결과 파일을 읽지 못했습니다. 파일이 이동되거나 삭제되었는지 확인하세요.');
  return response.blob();
}
export async function uploadMedia(kind:'image'|'video',file:File) {
 const response=await fetch(`/api/media/${kind}`,{method:'POST',headers:{Authorization:`Bearer ${await token()}`,'Content-Type':'application/octet-stream'},body:file,signal:AbortSignal.timeout(300000)});
 const result=await response.json();if(!response.ok){if(response.status===401)session=undefined;throw new ApiError(result.error??'업로드 실패');}return result as import('./video').MediaInput;
}
export async function sourceBlob(id:string):Promise<Blob> {
 const response=await fetch(`/api/media/${encodeURIComponent(id)}/file`,{headers:{Authorization:`Bearer ${await token()}`},signal:AbortSignal.timeout(60000)});
 if(!response.ok)throw new Error('원본 파일을 읽지 못했습니다. 다시 업로드하세요.');return response.blob();
}
export async function uploadAudio(file:File) {
 const extension=file.name.split('.').pop()?.toLowerCase();const format=extension==='wav'?'wav':extension==='mp3'?'mp3':extension==='webm'?'webm':undefined;
 if(!format||file.size>16*1024**2)throw new Error('WAV·MP3·WebM 파일을 선택하세요. 최대 16MiB입니다.');
 const response=await fetch(`/api/voice/audio/${format}`,{method:'POST',headers:{Authorization:`Bearer ${await token()}`,'Content-Type':'application/octet-stream'},body:file,signal:AbortSignal.timeout(180000)});
 const result=await response.json();if(!response.ok)throw new ApiError(result.error??'음성 업로드 실패');return result as import('./voice').AudioSource;
}
export async function audioSourceBlob(id:string):Promise<Blob>{
 const response=await fetch(`/api/voice/audio/${encodeURIComponent(id)}/file`,{headers:{Authorization:`Bearer ${await token()}`},signal:AbortSignal.timeout(60000)});
 if(!response.ok)throw new Error('원본 음성이 없거나 이동되었습니다.');return response.blob();
}
