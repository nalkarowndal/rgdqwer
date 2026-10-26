import {addAbortSignal, type Readable} from 'node:stream';
import {setTimeout as delay} from 'node:timers/promises';
import {httpsResponse, validateDownloadUrl, type DownloadResponse} from './network.js';

export type DownloadTransport = typeof httpsResponse;
const MiB = 1024 ** 2;
const attempts = 3;
const transientCodes = new Set(['ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ERR_STREAM_PREMATURE_CLOSE', 'EAI_AGAIN', 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH']);
class RetryableError extends Error {
 constructor(message:string, readonly retryAfter=0) { super(message); }
}
function transient(error:unknown) {
 return error instanceof RetryableError || (error instanceof Error && transientCodes.has((error as NodeJS.ErrnoException).code ?? ''));
}
function exhausted() { return new Error('다운로드 연결이 3회 연속 실패했습니다. 인터넷 연결과 제공자 상태를 확인한 뒤 다시 다운로드하세요. 완료된 구성 파일은 유지됩니다.'); }
async function pause(error:unknown, attempt:number, signal:AbortSignal) {
 signal.throwIfAborted();
 if (!transient(error)) throw error;
 if (attempt >= attempts - 1) throw exhausted();
 const milliseconds = Math.max(500 * 2 ** attempt, error instanceof RetryableError ? error.retryAfter : 0);
 await delay(milliseconds, undefined, {signal});
}
function retryAfter(value:string|undefined) {
 if (!value) return 0;
 const seconds = Number(value);
 const milliseconds = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now();
 return Number.isFinite(milliseconds) ? Math.max(0, Math.min(10000, milliseconds)) : 0;
}
/** Each attempt starts at the original URL, obtaining a fresh signed redirect. */
async function request(source:string, signal:AbortSignal, transport:DownloadTransport, range?:string) {
 let url = validateDownloadUrl(source);
 for (let redirects = 0; redirects <= 5; redirects++) {
  signal.throwIfAborted();
  const response = await transport(url, signal, {range});
  if (signal.aborted) { response.body.destroy(); signal.throwIfAborted(); }
  if ([301,302,303,307,308].includes(response.status)) {
   response.body.destroy();
   if (!response.headers.location) throw new Error('리디렉션 주소가 없습니다.');
   url = validateDownloadUrl(new URL(response.headers.location, url).href);
   continue;
  }
  if (response.status !== 200 && response.status !== 206) {
   response.body.destroy();
   if ([408,429,500,502,503,504].includes(response.status) || (response.status === 403 && redirects > 0)) {
    throw new RetryableError(`다운로드 HTTP ${response.status}`, retryAfter(response.headers['retry-after']));
   }
   throw new Error(`다운로드 HTTP ${response.status}`);
  }
  if (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') {
   response.body.destroy(); throw new Error('지원하지 않는 다운로드 인코딩입니다.');
  }
  return response;
 }
 throw new Error('리디렉션이 5회를 초과했습니다.');
}
function checkRange(response:DownloadResponse, start:number, end:number, total:number) {
 const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers['content-range'] ?? '');
 const length = response.headers['content-length'];
 if (response.status !== 206 || !match || Number(match[1]) !== start || Number(match[2]) !== end || Number(match[3]) !== total || (length !== undefined && Number(length) !== end - start + 1)) {
  response.body.destroy(); throw new Error('서버의 다운로드 범위 응답이 요청과 일치하지 않습니다.');
 }
}
async function collect(body:Readable, bytes:number, signal:AbortSignal) {
 const chunks:Buffer[] = []; let received = 0;
 try {
  for await (const value of addAbortSignal(signal, body)) {
   signal.throwIfAborted(); const chunk = Buffer.from(value); received += chunk.length;
   if (received > bytes) throw new Error('선언한 다운로드 범위 크기를 초과했습니다.');
   chunks.push(chunk);
  }
  if (received !== bytes) throw new RetryableError('다운로드 범위 연결이 일찍 종료되었습니다.');
  return Buffer.concat(chunks, bytes);
 } finally { body.destroy(); }
}
async function segment(source:string, start:number, end:number, total:number, signal:AbortSignal, transport:DownloadTransport, allowFull=false):Promise<Buffer|DownloadResponse> {
 for (let attempt = 0; ; attempt++) {
  try {
   const response = await request(source, signal, transport, `bytes=${start}-${end}`);
   if (allowFull && response.status === 200) return response;
   checkRange(response, start, end, total);
   return await collect(response.body, end - start + 1, signal);
  } catch (error) { await pause(error, attempt, signal); }
 }
}
async function* sequential(source:string, total:number, signal:AbortSignal, transport:DownloadTransport, initial?:DownloadResponse) {
 let received = 0;
 for (let attempt = 0; ; attempt++) {
  let response:DownloadResponse|undefined;
  try {
   response = initial ?? await request(source, signal, transport, received ? `bytes=${received}-${total-1}` : undefined);
   initial = undefined;
   if (received) {
    if (response.status === 200) throw new Error('서버가 이어받기를 지원하지 않습니다. 다시 다운로드하거나 브라우저로 받아 가져오세요.');
    checkRange(response, received, total-1, total);
   } else if (response.status !== 200) throw new Error('예상하지 않은 다운로드 범위 응답입니다.');
   for await (const value of addAbortSignal(signal, response.body)) {
    signal.throwIfAborted(); const chunk = Buffer.from(value); received += chunk.length;
    if (received > total) throw new Error('선언한 파일 크기를 초과했습니다.');
    yield chunk;
   }
   if (received !== total) throw new RetryableError('다운로드 연결이 일찍 종료되었습니다.');
   return;
  } catch (error) {
   // All expected bytes already reached the verified writer; a trailing reset needs no new request.
   if (received === total && transient(error)) { signal.throwIfAborted(); return; }
   await pause(error, attempt, signal);
  } finally { response?.body.destroy(); }
 }
}
/** Bounded windows keep at most four 16 MiB ranges in flight, emitted in file order. */
export async function* transfer(source:string, total:number, signal:AbortSignal, controller:AbortController, transport:DownloadTransport) {
 if (total < 4 * MiB) { yield* sequential(source, total, signal, transport); return; }
 const size = Math.min(16 * MiB, Math.max(MiB, Math.ceil(total / 4)));
 const first = await segment(source, 0, size-1, total, signal, transport, true);
 if (!Buffer.isBuffer(first)) { yield* sequential(source, total, signal, transport, first); return; }
 yield first;
 for (let offset = size; offset < total;) {
  const pending:Promise<Buffer|DownloadResponse>[] = [];
  for (let index = 0; index < 4 && offset < total; index++, offset += size) {
   const work = segment(source, offset, Math.min(total-1, offset+size-1), total, signal, transport);
   // Observe failures immediately, including workers later in file order.
   pending.push(work.catch(error => { controller.abort(error); throw error; }));
  }
  const settled = Promise.allSettled(pending); let completed = false;
  try {
   for (const work of pending) {
    const chunk = await work;
    signal.throwIfAborted();
    if (!Buffer.isBuffer(chunk)) throw new Error('예상하지 않은 다운로드 범위 응답입니다.');
    yield chunk;
   }
   completed = true;
  } finally { if (!completed) controller.abort(); await settled; }
 }
}
