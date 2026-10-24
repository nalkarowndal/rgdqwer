import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';import {fileURLToPath} from 'node:url';
interface Notice {name:string;version:string;license:string;path:string}
export async function collectNotices(root:string){
 const lock=JSON.parse(await readFile(join(root,'package-lock.json'),'utf8')) as {packages:Record<string,{dev?:boolean}>};const packages:Notice[]=[];let text='Third-party dependency notices\nPackage license files are authoritative. UNKNOWN is not a license grant.\n\n';
 for(const [path,entry] of Object.entries(lock.packages).sort(([a],[b])=>a.localeCompare(b))){if(!path.startsWith('node_modules/')||entry.dev)continue;let pkg:{name:string;version:string;license?:string|{type:string}};try{pkg=JSON.parse(await readFile(join(root,path,'package.json'),'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')continue;throw error;}
  const license=typeof pkg.license==='string'?pkg.license:pkg.license?.type??'UNKNOWN';packages.push({name:pkg.name,version:pkg.version,license,path});text+=`=== ${pkg.name}@${pkg.version} (${license}) ===\n`;
  const files=(await readdir(join(root,path))).filter(name=>/^(licen[sc]e|copying|notice)(\.|$)/i.test(name));for(const name of files){try{text+=`\n${name}\n${await readFile(join(root,path,name),'utf8')}\n`;}catch(error){if((error as NodeJS.ErrnoException).code!=='EISDIR')throw error;}}text+='\n';
 }return {packages,text};
}
export async function prepareRelease(root=process.cwd()){const result=await collectNotices(root);const target=join(root,'build-resources');await mkdir(target,{recursive:true});await writeFile(join(target,'THIRD_PARTY_NOTICES.txt'),result.text);await writeFile(join(target,'dependencies.json'),JSON.stringify({generatedAt:new Date().toISOString(),packages:result.packages},null,2));console.log(`Prepared notices for ${result.packages.length} installed production packages`);}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await prepareRelease();
