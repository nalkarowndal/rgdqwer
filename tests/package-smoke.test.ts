import {it,expect} from 'vitest';
import {mkdtemp,rm,writeFile,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ownProfile,parseSmokeArgs,checksumManifest,releaseArtifactFiles} from '../scripts/package-checks.js';

it('selects standalone ZIP separately from installer, unrelated ZIPs and stale blockmaps',()=>{
 const setup='rgdqwer-0.9.0-windows-x64-unsigned-setup.exe';
 const zip='rgdqwer-0.9.0-windows-x64-unsigned-standalone.zip';
 const files=[zip,setup,`${setup}.blockmap`,'debug.zip','other.exe','old-unsigned-setup.exe.blockmap'];
 expect(releaseArtifactFiles(files,'standalone')).toEqual([zip]);
 expect(releaseArtifactFiles(files,'installer')).toEqual([setup,`${setup}.blockmap`]);
 expect(releaseArtifactFiles([setup],'installer')).toEqual([setup]);
});
it('refuses missing or ambiguous release artifacts and unknown kinds',()=>{
 for(const kind of ['installer','standalone'] as const){
  expect(()=>releaseArtifactFiles(['debug.zip','other.exe'],kind)).toThrow();
  const suffix=kind==='installer'?'setup.exe':'standalone.zip';
  expect(()=>releaseArtifactFiles([`rgdqwer-0.9.0-windows-x64-unsigned-${suffix}`,`rgdqwer-0.9.1-windows-x64-unsigned-${suffix}`],kind)).toThrow();
 }
 // Runtime CLI input must be checked even though TypeScript restricts callers.
 expect(()=>releaseArtifactFiles([], 'wrong' as 'installer')).toThrow('Unknown release kind');
});

it('requires absolute executable/profile paths and a known lifecycle mode',()=>{
 const root=tmpdir();expect(parseSmokeArgs(['--executable',join(root,'app'),'--profile',join(root,'profile'),'--mode','seed']).mode).toBe('seed');
 for(const args of [[],['--executable','relative','--profile',root,'--mode','seed'],['--executable',root,'--profile',root,'--mode','remove']])expect(()=>parseSmokeArgs(args)).toThrow();
});
it('never adopts an existing profile or follows a substituted profile symlink',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ownership-'));try{const profile=join(dir,'profile');await ownProfile(profile,'seed');await ownProfile(profile,'verify');await expect(ownProfile(profile,'seed')).rejects.toThrow();await expect(ownProfile(dir,'verify')).rejects.toThrow();await symlink(profile,join(dir,'link'),process.platform==='win32'?'junction':'dir');await expect(ownProfile(join(dir,'link'),'verify')).rejects.toThrow();}finally{await rm(dir,{recursive:true,force:true});}
});
it('hashes release artifacts in a portable deterministic manifest',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'manifest-'));try{await writeFile(join(dir,'setup.exe'),'abc');expect(await checksumManifest(dir,['setup.exe'])).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  setup.exe\n');await expect(checksumManifest(dir,['../other.exe'])).rejects.toThrow();}finally{await rm(dir,{recursive:true,force:true});}
});
