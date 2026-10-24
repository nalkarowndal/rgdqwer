import {it,expect,afterEach} from 'vitest';import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
import {configureResources,voiceRunnerPath} from '../server/resources.js';import {collectNotices} from '../scripts/prepare-release.js';
const dirs:string[]=[];afterEach(async()=>{configureResources();for(const dir of dirs.splice(0))await rm(dir,{recursive:true,force:true});});
it('resolves bundled Python outside ASAR independently of the working directory',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'packaged-resources-'));dirs.push(dir);await mkdir(join(dir,'python','voice_worker'),{recursive:true});await writeFile(join(dir,'python','voice_worker','runner.py'),'# fixture');configureResources(dir);expect(voiceRunnerPath()).toBe(join(dir,'python','voice_worker','runner.py'));await rm(join(dir,'python','voice_worker','runner.py'));expect(()=>voiceRunnerPath()).toThrow(/Worker/);configureResources();expect(voiceRunnerPath()).toBe(resolve('voice_worker/runner.py'));
});
it('collects installed production notices without including development dependencies or inventing licenses',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'notices-'));dirs.push(dir);await writeFile(join(dir,'package-lock.json'),JSON.stringify({packages:{'':{},'node_modules/runtime':{version:'1'},'node_modules/devtool':{version:'2',dev:true}}}));for(const name of ['runtime','devtool']){await mkdir(join(dir,'node_modules',name),{recursive:true});await writeFile(join(dir,'node_modules',name,'package.json'),JSON.stringify({name,version:'1.0.0'}));await writeFile(join(dir,'node_modules',name,'LICENSE'),'Copyright fixture');}
 const result=await collectNotices(dir);expect(result.packages).toHaveLength(1);expect(result.packages[0]).toMatchObject({name:'runtime',license:'UNKNOWN'});expect(result.text).toContain('Copyright fixture');expect(result.text).not.toContain('devtool');
});
