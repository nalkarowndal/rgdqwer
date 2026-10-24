import {it,expect,afterEach} from 'vitest';
import {mkdtemp,rm,readdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {Readable} from 'node:stream';import {createHash} from 'node:crypto';
import {publicAddress,validateDownloadUrl,assertDirectDownload} from '../server/models/network.js';
import {downloadAsset} from '../server/models/download.js';
const dirs:string[]=[];afterEach(async()=>{for(const dir of dirs.splice(0))await rm(dir,{recursive:true,force:true});});
it('rejects local, reserved, mapped addresses and non-HTTPS credential destinations',()=>{
 for(const address of ['127.0.0.1','10.2.3.4','169.254.169.254','100.64.0.1','192.168.1.2','0.0.0.0','224.0.0.1','::1','::ffff:127.0.0.1','fc00::1','2001:db8::1','2002:7f00:1::'])expect(publicAddress(address)).toBe(false);
 for(const address of ['8.8.8.8','1.1.1.1','2606:4700:4700::1111'])expect(publicAddress(address)).toBe(true);
 for(const url of ['http://example.com/x','https://a:b@example.com/x','https://example.com:444/x','https://127.0.0.1/x','file:///x'])expect(()=>validateDownloadUrl(url)).toThrow();
 expect(validateDownloadUrl('https://example.com/model?download=true').hostname).toBe('example.com');
 expect(()=>assertDirectDownload({HTTPS_PROXY:'http://proxy:8080'})).toThrow(/프록시/);
});
it('commits only exact hash and size, refuses overwrite, rejects private redirects and cleans partial files',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'download-'));dirs.push(dir);const bytes=Buffer.from('fixture');const hash=createHash('sha256').update(bytes).digest('hex');
 const response=async()=>({status:200,headers:{},body:Readable.from([bytes])});
 await downloadAsset('https://example.com/x',dir,'good.pt',bytes.length,hash,new AbortController().signal,()=>{},'one',response);
 expect(await readFile(join(dir,'good.pt'))).toEqual(bytes);
 await expect(downloadAsset('https://example.com/x',dir,'good.pt',bytes.length,hash,new AbortController().signal,()=>{},'two',response)).rejects.toThrow();
 for(const [size,digest] of [[bytes.length,'0'.repeat(64)],[bytes.length+1,hash],[bytes.length-1,hash]] as const)await expect(downloadAsset('https://example.com/x',dir,'bad.pt',size,digest,new AbortController().signal,()=>{},'bad',response)).rejects.toThrow();
 await expect(downloadAsset('https://example.com/x',dir,'bad.pt',7,hash,new AbortController().signal,()=>{},'redir',async()=>({status:302,headers:{location:'https://127.0.0.1/x'},body:Readable.from([])}))).rejects.toThrow();
 const controller=new AbortController();controller.abort();await expect(downloadAsset('https://example.com/x',dir,'bad.pt',7,hash,controller.signal,()=>{},'abort',response)).rejects.toThrow();
 expect(await readdir(dir)).toEqual(['good.pt']);
});
it('pins the chosen DNS result for both Node single and multi-address lookup contracts',async()=>{
 const {pinnedLookup}=await import('../server/models/network.js');const lookup=pinnedLookup({address:'8.8.8.8',family:4});
 const single=await new Promise(resolve=>lookup('example.com',{all:false},(_error,address,family)=>resolve({address,family})));expect(single).toEqual({address:'8.8.8.8',family:4});
 const multiple=await new Promise(resolve=>lookup('example.com',{all:true},(_error,address)=>resolve(address)));expect(multiple).toEqual([{address:'8.8.8.8',family:4}]);
});
