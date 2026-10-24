import {BlockList,isIP,type LookupFunction} from 'node:net';
import {lookup} from 'node:dns/promises';
import {get} from 'node:https';
import type {Readable} from 'node:stream';
const blocked=new BlockList();
for(const [address,prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]] as const)blocked.addSubnet(address,prefix);
const global6=new BlockList();global6.addSubnet('2000::',3,'ipv6');
for(const [address,prefix] of [['2001::',23],['2001:db8::',32],['2002::',16],['3fff::',20]] as const)blocked.addSubnet(address,prefix,'ipv6');
export function publicAddress(address:string){const version=isIP(address);return version===4?!blocked.check(address,'ipv4'):version===6&&global6.check(address,'ipv6')&&!blocked.check(address,'ipv6');}
export function validateDownloadUrl(raw:string){const url=new URL(raw);const host=url.hostname.replace(/^\[|\]$/g,'');if(url.protocol!=='https:'||(url.port&&url.port!=='443')||url.username||url.password||host==='localhost'||host.endsWith('.localhost')||(isIP(host)&&!publicAddress(host)))throw new Error('공개 HTTPS(443) 다운로드 주소만 허용됩니다.');return url;}
export function assertDirectDownload(env:NodeJS.ProcessEnv=process.env){if(Object.entries(env).some(([key,value])=>/^(https?|all)_proxy$/i.test(key)&&value))throw new Error('프록시 환경에서는 내장 다운로드를 지원하지 않습니다. 브라우저로 다운로드한 후 가져오세요.');}
export interface DownloadResponse {status:number;headers:{location?:string};body:Readable}
export function pinnedLookup(chosen:{address:string;family:number}):LookupFunction{return (_host,options,callback)=>{if(options.all)callback(null,[chosen]);else callback(null,chosen.address,chosen.family);};}
export async function httpsResponse(url:URL,signal:AbortSignal):Promise<DownloadResponse>{
 assertDirectDownload();const host=url.hostname.replace(/^\[|\]$/g,'');const addresses=await lookup(host,{all:true});signal.throwIfAborted();if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw new Error('다운로드 호스트가 공개 IP가 아닙니다.');const chosen=addresses[0];
 return new Promise((resolve,reject)=>{const request=get(url,{signal,agent:false,lookup:pinnedLookup(chosen),headers:{'Accept-Encoding':'identity','User-Agent':'rgdqwer-model-manager'}},response=>resolve({status:response.statusCode??0,headers:response.headers,body:response}));request.setTimeout(30000,()=>request.destroy(new Error('다운로드 응답 시간 초과')));request.once('error',reject);});
}
