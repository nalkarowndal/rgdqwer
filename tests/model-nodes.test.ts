import {it,expect,afterEach} from 'vitest';import {mkdtemp,writeFile,readFile,rm,mkdir,symlink} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {inspectTree,activatePack,removePack} from '../server/models/nodes.js';
const dirs:string[]=[];afterEach(async()=>{for(const dir of dirs.splice(0))await rm(dir,{recursive:true,force:true});});
it('inspects code without executing it and activates an immutable copy only after acknowledgement',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'nodes-'));dirs.push(dir);const root=join(dir,'staged');await mkdir(root);await writeFile(join(root,'__init__.py'),'raise Exception("MUST NOT EXECUTE")');await writeFile(join(root,'requirements.txt'),'torch>=2\n');await writeFile(join(root,'LICENSE'),'fixture license');
 const info=await inspectTree(root);expect(info.requirements).toContain('torch');expect(info.license).toBe('fixture license');
 const pack={...info,id:'11111111-1111-4111-8111-111111111111',name:'Fixture',repository:'https://github.com/test/test',commit:'a'.repeat(40),root,installedAt:new Date().toISOString()};
 await expect(activatePack(pack,dir,false)).rejects.toThrow();const active=await activatePack(pack,dir,true);expect(await readFile(join(active.activePath!,'__init__.py'),'utf8')).toContain('MUST NOT EXECUTE');
 await writeFile(join(active.activePath!,'__init__.py'),'changed');await expect(removePack(active,true)).rejects.toThrow(/변경/);expect(await readFile(join(root,'requirements.txt'),'utf8')).toBe('torch>=2\n');
});
it('rejects linked directories and bounds static inspection',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'nodes-'));dirs.push(dir);const root=join(dir,'staged');await mkdir(root);const outside=join(dir,'outside');await mkdir(outside);await symlink(outside,join(root,'linked'),process.platform==='win32'?'junction':'dir');await expect(inspectTree(root)).rejects.toThrow(/링크/);
});
it('checks out a pinned local Git fixture without running repository code or hooks',async()=>{
 const {gitCommand}=await import('../server/models/nodes.js');const dir=await mkdtemp(join(tmpdir(),'node-git-'));dirs.push(dir);const signal=new AbortController().signal;
 await gitCommand(dir,['init','--template='],signal);await writeFile(join(dir,'__init__.py'),'raise Exception("never run")');await gitCommand(dir,['add','.'],signal);
 await gitCommand(dir,['-c','user.name=Fixture','-c','user.email=fixture@example.com','commit','-m','fixture'],signal);const commit=await gitCommand(dir,['rev-parse','HEAD'],signal);
 await writeFile(join(dir,'__init__.py'),'changed');await gitCommand(dir,['checkout','--force','--detach',commit],signal);expect(await readFile(join(dir,'__init__.py'),'utf8')).toContain('never run');await rm(join(dir,'.git'),{recursive:true});expect((await inspectTree(dir)).files).toBe(1);
});
it('allows ordinary Python bytecode caches after activation but rejects nested Git metadata',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'node-cache-'));dirs.push(dir);const root=join(dir,'staged');await mkdir(root);await writeFile(join(root,'__init__.py'),'pass');const info=await inspectTree(root);const pack={...info,id:'cache-fixture',name:'Fixture',repository:'https://github.com/test/test',commit:'a'.repeat(40),root,installedAt:''};const active=await activatePack(pack,dir,true);await mkdir(join(active.activePath!,'__pycache__'));await writeFile(join(active.activePath!,'__pycache__','__init__.cpython-312.pyc'),'cache');await expect(removePack(active,false)).resolves.toMatchObject({id:pack.id});
 await mkdir(join(root,'nested','.git'),{recursive:true});await expect(inspectTree(root)).rejects.toThrow(/Git/);
});
it('preserves user-added root Git history when removing or activating a reviewed pack',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'node-history-'));dirs.push(dir);const root=join(dir,'staged');await mkdir(root);await writeFile(join(root,'__init__.py'),'pass');const info=await inspectTree(root);const pack={...info,id:'history-fixture',name:'Fixture',repository:'https://github.com/test/test',commit:'a'.repeat(40),root,installedAt:''};await mkdir(join(root,'.git'));await writeFile(join(root,'.git','important-stash'),'keep');
 await expect(activatePack(pack,dir,true)).rejects.toThrow(/Git/);await expect(removePack(pack,true)).rejects.toThrow(/Git/);expect(await readFile(join(root,'.git','important-stash'),'utf8')).toBe('keep');
});
