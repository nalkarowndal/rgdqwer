import {it,expect,afterEach} from 'vitest';
import {mkdtemp,rm,readdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {Readable} from 'node:stream';import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {downloadAsset} from '../server/models/download.js';
import type {DownloadResponse} from '../server/models/network.js';
type Transport=(url:URL,signal:AbortSignal,options?:{range?:string})=>Promise<DownloadResponse>;
const dirs:string[]=[];afterEach(async()=>{for(const dir of dirs.splice(0))await rm(dir,{recursive:true,force:true});});
const digest=(data:Buffer)=>createHash('sha256').update(data).digest('hex');
const reset=()=>Object.assign(new Error('aborted'),{code:'ECONNRESET'});
async function fixture(data=Buffer.from('abcdefgh')){const dir=await mkdtemp(join(tmpdir(),'transfer-'));dirs.push(dir);return {dir,data,run:(transport:Transport,signal=new AbortController().signal,hash=digest(data))=>downloadAsset('https://example.com/resolve/pinned/model',dir,'model.pt',data.length,hash,signal,()=>{},'test',transport)};}
function response(data:Buffer,range?:string):DownloadResponse {if(!range)return {status:200,headers:{},body:Readable.from([data])};const [,startText,endText]=/^bytes=(\d+)-(\d+)$/.exec(range)!;const start=Number(startText),end=Number(endText);return {status:206,headers:{'content-range':`bytes ${start}-${end}/${data.length}`},body:Readable.from([data.subarray(start,end+1)])} as DownloadResponse;}
it('resumes a reset from the consumed offset using a fresh original redirect',async()=>{
 const f=await fixture();const calls:string[]=[];const ranges:(string|undefined)[]=[];let first=true;
 await f.run(async(url,_signal,options)=>{calls.push(url.pathname);if(url.hostname==='example.com')return {status:302,headers:{location:'https://cdn.example.com/signed'},body:Readable.from([])};ranges.push(options?.range);if(first){first=false;return {status:200,headers:{},body:Readable.from((async function*(){yield f.data.subarray(0,3);await delay(5);throw reset();})())};}return response(f.data,options?.range);});
 expect(ranges).toEqual([undefined,'bytes=3-7']);expect(calls.filter(c=>c.includes('/resolve/'))).toHaveLength(2);expect((await readFile(join(f.dir,'model.pt'))).equals(f.data)).toBe(true);
});
it('assembles out-of-order ranges with at most four active bodies and retries only a failed segment',async()=>{
 const f=await fixture(Buffer.alloc(9*1024*1024,73));let active=0,maxActive=0,failed=false;const ranges:string[]=[];
 await f.run(async(_url,signal,options)=>{const range=options?.range;expect(range).toBeDefined();ranges.push(range!);const result=response(f.data,range);const [,a,b]=/^bytes=(\d+)-(\d+)$/.exec(range!)!;const start=Number(a),end=Number(b);result.body=Readable.from((async function*(){active++;maxActive=Math.max(maxActive,active);try{await delay(start===0?5:30-(start%17),undefined,{signal});if(start>0&&!failed){failed=true;throw reset();}yield f.data.subarray(start,end+1);}finally{active--;}})());return result;});
 expect(maxActive).toBeGreaterThan(1);expect(maxActive).toBeLessThanOrEqual(4);expect(active).toBe(0);expect(new Set(ranges).size).toBe(4);expect(ranges).toHaveLength(5);expect((await readFile(join(f.dir,'model.pt'))).equals(f.data)).toBe(true);
});
it('falls back when the first Range is ignored without duplicating the full response',async()=>{
 const f=await fixture(Buffer.alloc(4*1024*1024,17));let calls=0;
 await f.run(async(_url,_signal,options)=>{calls++;expect(options?.range).toBeDefined();return response(f.data);});expect(calls).toBe(1);expect((await readFile(join(f.dir,'model.pt'))).equals(f.data)).toBe(true);
});
it('rejects lying ranges, encoded responses and integrity failures without installing',async()=>{
 for(const fault of ['range','encoding','hash']){const f=await fixture(Buffer.alloc(4*1024*1024,27));await expect(f.run(async(_url,_signal,options)=>{const r=response(f.data,options?.range);if(fault==='range')Object.assign(r.headers,{'content-range':`bytes 1-1048576/${f.data.length}`});if(fault==='encoding')Object.assign(r.headers,{'content-encoding':'gzip'});return r;},undefined,fault==='hash'?'0'.repeat(64):digest(f.data))).rejects.toThrow(fault==='hash'?/SHA256/:/범위|인코딩/);expect(await readdir(f.dir)).toEqual([]);}
});
it('retries transient HTTP failures but caps attempts and replaces raw aborted with actionable error',async()=>{
 const f=await fixture();let calls=0;await expect(f.run(async()=>{calls++;throw reset();})).rejects.toThrow(/연결.*3회.*다시/);expect(calls).toBe(3);expect(await readdir(f.dir)).toEqual([]);
 const ok=await fixture();let httpCalls=0;await ok.run(async()=>++httpCalls<3?{status:503,headers:{},body:Readable.from([])}:response(ok.data));expect(httpCalls).toBe(3);
});
it('does not retry permanent HTTP errors or unsafe redirects',async()=>{
 for(const status of [401,404,302]){const f=await fixture();let calls=0;await expect(f.run(async()=>{calls++;return {status,headers:{location:'https://127.0.0.1/private'},body:Readable.from([])};})).rejects.toThrow();expect(calls).toBe(1);expect(await readdir(f.dir)).toEqual([]);}
});
it('cancels retry backoff immediately and removes incomplete files',async()=>{
 const f=await fixture();const controller=new AbortController();let calls=0;const work=f.run(async()=>{calls++;setTimeout(()=>controller.abort(),20);throw reset();},controller.signal);await expect(work).rejects.toThrow();expect(calls).toBe(1);expect(await readdir(f.dir)).toEqual([]);
});
it('refuses a full response when resuming after partial bytes',async()=>{
 const f=await fixture();let calls=0;await expect(f.run(async()=>{calls++;return calls===1?{status:200,headers:{},body:Readable.from((async function*(){yield f.data.subarray(0,2);await delay(5);throw reset();})())}:response(f.data);})).rejects.toThrow(/이어받기/);expect(calls).toBe(2);expect(await readdir(f.dir)).toEqual([]);
});
it('cancels all parallel bodies when a later segment fails validation',async()=>{
 const f=await fixture(Buffer.alloc(8*1024*1024,44));let active=0;
 await expect(f.run(async(_url,signal,options)=>{const r=response(f.data,options?.range);const start=Number(/^bytes=(\d+)/.exec(options?.range??'')?.[1]);if(!start)return r;if(start===4*1024*1024)Object.assign(r.headers,{'content-range':'invalid'});else r.body=Readable.from((async function*(){active++;try{await delay(10000,undefined,{signal});yield Buffer.alloc(2*1024*1024,44);}finally{active--;}})());return r;})).rejects.toThrow(/범위/);expect(active).toBe(0);expect(await readdir(f.dir)).toEqual([]);
});
it('refreshes an expired CDN redirect and rejects an unsafe redirect on retry',async()=>{
 for(const unsafe of [false,true]){const f=await fixture();let origins=0;const transport:Transport=async url=>{if(url.hostname==='example.com'){origins++;return {status:302,headers:{location:origins===2&&unsafe?'https://127.0.0.1/x':`https://cdn.example.com/signed-${origins}`},body:Readable.from([])};}return origins===1?{status:403,headers:{},body:Readable.from([])}:response(f.data);};if(unsafe)await expect(f.run(transport)).rejects.toThrow(/HTTPS/);else await f.run(transport);expect(origins).toBe(2);}
});
it('cancels outstanding parallel requests without leaving partial files',async()=>{
 const f=await fixture(Buffer.alloc(8*1024*1024,33));const controller=new AbortController();let active=0;
 const work=f.run(async(_url,signal,options)=>{const r=response(f.data,options?.range);if(options?.range?.startsWith('bytes=0-'))return r;r.body=Readable.from((async function*(){active++;try{setTimeout(()=>controller.abort(),25);await delay(10000,undefined,{signal});yield Buffer.alloc(2*1024*1024,33);}finally{active--;}})());return r;},controller.signal);await expect(work).rejects.toThrow();expect(active).toBe(0);expect(await readdir(f.dir)).toEqual([]);
});
it('retries a prematurely ended range but refuses an oversized range',async()=>{
 for(const oversized of [false,true]){const f=await fixture(Buffer.alloc(4*1024*1024,55));let firstCalls=0;const transport:Transport=async(_url,_signal,options)=>{const r=response(f.data,options?.range);if(options?.range?.startsWith('bytes=0-')&&++firstCalls===1)r.body=Readable.from([Buffer.alloc(1024*1024+(oversized?1:-1),55)]);return r;};if(oversized){await expect(f.run(transport)).rejects.toThrow(/초과/);expect(firstCalls).toBe(1);}else {await f.run(transport);expect(firstCalls).toBe(2);}}
});
