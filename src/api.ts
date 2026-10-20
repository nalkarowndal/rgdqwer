let session: Promise<string> | undefined;
function token() {
  session ??= fetch('/api/session').then(async response => {
    if (!response.ok) throw new Error('로컬 서버 연결을 확인하세요.');
    return (await response.json() as { token: string }).token;
  }).catch(error => { session = undefined; throw error; });
  return session;
}
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method: body === undefined ? 'GET' : 'PUT',
    headers: { Authorization: `Bearer ${await token()}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(12000),
  });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401) session = undefined;
    throw new Error(result.error ?? '요청을 처리하지 못했습니다.');
  }
  return result as T;
}
