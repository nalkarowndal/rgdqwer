import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir,writeFile,readFile,lstat} from 'node:fs/promises';
import {isAbsolute,join,basename} from 'node:path';
export function releaseArtifactFiles(files:string[],kind:'installer'|'standalone'){
 if(kind!=='installer'&&kind!=='standalone')throw new Error('Unknown release kind');
 const pattern=kind==='installer'?/^rgdqwer-[\w.+-]+-windows-x64-unsigned-setup\.exe$/:/^rgdqwer-[\w.+-]+-windows-x64-unsigned-standalone\.zip$/;
 const primary=files.filter(file=>pattern.test(file));
 if(primary.length!==1)throw new Error(`Exactly one ${kind} artifact required`);
 const blockmap=`${primary[0]}.blockmap`;
 return kind==='installer'&&files.includes(blockmap)?[primary[0],blockmap]:primary;
}
export function parseSmokeArgs(args:string[]){
 const flags=new Map<string,string>();
 for(let i=0;i<args.length;i+=2){if(!['--executable','--profile','--mode','--report'].includes(args[i])||!args[i+1]||flags.has(args[i]))throw new Error('Invalid smoke arguments');flags.set(args[i],args[i+1]);}
 const executable=flags.get('--executable')??'',profile=flags.get('--profile')??'',mode=flags.get('--mode');
 if(!isAbsolute(executable)||!isAbsolute(profile)||!['seed','verify'].includes(mode??''))throw new Error('Absolute executable/profile and seed|verify mode required');
 return {executable,profile,mode:mode as 'seed'|'verify',report:flags.get('--report')};
}
export async function ownProfile(profile:string,mode:'seed'|'verify'){
 if(!isAbsolute(profile))throw new Error('Absolute QA profile required');
 const marker=join(profile,'.rgdqwer-qa-profile');
 if(mode==='seed'){await mkdir(profile);await writeFile(marker,'rgdqwer packaged QA v1\n',{flag:'wx'});}
 else{if(!(await lstat(profile)).isDirectory()||(await lstat(marker)).isSymbolicLink()||await readFile(marker,'utf8')!=='rgdqwer packaged QA v1\n')throw new Error('Not an owned QA profile');}
}
export async function checksumManifest(directory:string,files:string[]){
 const lines:string[]=[];for(const file of [...files].sort()){if(basename(file)!==file||/[\r\n\\]/.test(file))throw new Error('Unsafe artifact name');const path=join(directory,file);if(!(await lstat(path)).isFile())throw new Error('Artifact must be a regular file');const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);lines.push(`${hash.digest('hex')}  ${file}\n`);}return lines.join('');
}
