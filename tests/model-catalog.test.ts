import {it,expect} from 'vitest';
import {Readable} from 'node:stream';
import {createHash} from 'node:crypto';
import {catalogFiles,selectCatalogFiles,featureDownloadSchema} from '../src/model-catalog.js';
import {resolveCatalogFiles,readCatalogBytes} from '../server/models/catalog.js';
import type {DownloadResponse} from '../server/models/network.js';
const revision='a'.repeat(40),hash='b'.repeat(64);
const response=(body:unknown,status=200):DownloadResponse=>({status,headers:{},body:Readable.from([typeof body==='string'?body:JSON.stringify(body)])});
it('deduplicates common encoders/VAE and rejects unknown or unconfirmed selections',()=>{
 const both=selectCatalogFiles(['krea-turbo','krea-raw','krea-turbo']);expect(both).toHaveLength(4);expect(new Set(both.map(f=>f.id)).size).toBe(4);
 expect(()=>selectCatalogFiles(['made-up'])).toThrow();expect(featureDownloadSchema.safeParse({featureIds:['sdxl'],confirmed:false}).success).toBe(false);expect(featureDownloadSchema.safeParse({featureIds:[],confirmed:true}).success).toBe(false);
});
it('resolves LFS metadata once per repository and pins all files to an immutable revision',async()=>{
 const files=selectCatalogFiles(['krea-turbo']);const urls:string[]=[];
 const resolved=await resolveCatalogFiles(files,{},AbortSignal.timeout(1000),async url=>{urls.push(url.href);return response({sha:revision,siblings:files.map(f=>({rfilename:f.path,size:3,lfs:{sha256:hash,size:3}}))});});
 expect(urls).toHaveLength(1);expect(resolved).toHaveLength(3);
 for(const item of resolved){expect(item.input.sha256).toBe(hash);expect(item.input.bytes).toBe(3);expect(item.input.manifest.sourceUrl).toContain(`/resolve/${revision}/`);expect(item.input.manifest.revision).toBe(revision);}
});
it('verifies ordinary Git config blobs before deriving SHA256 and honors retry revision',async()=>{
 const file=catalogFiles.find(f=>f.path==='selected_tags.csv')!,body='tag_id,name\n0,test\n';const blobId=createHash('sha1').update(`blob ${Buffer.byteLength(body)}\0`).update(body).digest('hex');const urls:string[]=[];
 const transport=async(url:URL)=>{urls.push(url.href);return url.pathname.startsWith('/api/')?response({sha:revision,siblings:[{rfilename:file.path,size:Buffer.byteLength(body),blobId}]}):response(body);};
 const [resolved]=await resolveCatalogFiles([file],{[file.repo]:revision},AbortSignal.timeout(1000),transport);
 expect(urls[0]).toContain(`/revision/${revision}?blobs=true`);expect(resolved.input.sha256).toBe(createHash('sha256').update(body).digest('hex'));expect(resolved.input.manifest.fileName).toBe('selected_tags.csv');
 await expect(resolveCatalogFiles([file],{},AbortSignal.timeout(1000),async url=>url.pathname.startsWith('/api/')?response({sha:revision,siblings:[{rfilename:file.path,size:2,blobId}]}):response('xx'))).rejects.toThrow(/Git/);
});
it('rejects missing, inconsistent, unbounded or mutable provider metadata',async()=>{
 const file=selectCatalogFiles(['sdxl'])[0];
 for(const metadata of [{sha:'main',siblings:[]},{sha:revision,siblings:[]},{sha:revision,siblings:[{rfilename:file.path,size:3,lfs:{sha256:'bad',size:3}}]},{sha:revision,siblings:[{rfilename:file.path,size:3,lfs:{sha256:hash,size:4}}]},{sha:revision,siblings:[{rfilename:file.path,size:65*1024**3,lfs:{sha256:hash,size:65*1024**3}}]}])await expect(resolveCatalogFiles([file],{},AbortSignal.timeout(1000),async()=>response(metadata))).rejects.toThrow();
 await expect(resolveCatalogFiles([file],{[file.repo]:'c'.repeat(40)},AbortSignal.timeout(1000),async()=>response({sha:revision,siblings:[]}))).rejects.toThrow(/버전/);
});
it('bounds metadata reads and validates each redirect without reaching private hosts',async()=>{
 await expect(readCatalogBytes('https://huggingface.co/api/x',AbortSignal.timeout(1000),3,async()=>response('1234'))).rejects.toThrow(/크기/);
 let calls=0;await expect(readCatalogBytes('https://huggingface.co/api/x',AbortSignal.timeout(1000),100,async()=>{calls++;return {...response('',302),headers:{location:'https://127.0.0.1/private'}};})).rejects.toThrow(/HTTPS/);expect(calls).toBe(1);
 await expect(readCatalogBytes('https://huggingface.co/api/x',AbortSignal.timeout(1000),100,async()=>response('',401))).rejects.toThrow(/401/);
 const controller=new AbortController();controller.abort();await expect(readCatalogBytes('https://huggingface.co/api/x',controller.signal,100,async()=>response('ignored'))).rejects.toThrow();
});
