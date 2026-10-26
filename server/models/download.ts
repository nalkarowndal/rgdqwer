import {Readable} from 'node:stream';
import {storeStream} from './files.js';
import {httpsResponse,validateDownloadUrl} from './network.js';
import {transfer,type DownloadTransport} from './transfer.js';
export async function downloadAsset(source:string,root:string,path:string,bytes:number,sha256:string,signal:AbortSignal,progress:(bytes:number)=>void,id:string,transport:DownloadTransport=httpsResponse){
 validateDownloadUrl(source);signal.throwIfAborted();
 const controller=new AbortController();const combined=AbortSignal.any([signal,controller.signal]);
 const stream=Readable.from(transfer(source,bytes,combined,controller,transport),{objectMode:false});
 try{return await storeStream(stream,root,path,bytes,sha256,combined,progress,id,error=>controller.abort(error));}
 catch(error){if(controller.signal.aborted&&!signal.aborted)throw controller.signal.reason;throw error;}
 finally{controller.abort();stream.destroy();}
}
