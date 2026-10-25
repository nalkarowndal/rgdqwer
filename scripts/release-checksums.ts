import {readdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {checksumManifest,releaseArtifactFiles} from './package-checks.js';
const directory=resolve(process.argv[2]??'release');
const kind=(process.argv[3]??'installer') as 'installer'|'standalone';
const files=releaseArtifactFiles(await readdir(directory),kind);
await writeFile(join(directory,kind==='standalone'?'SHA256SUMS-standalone.txt':'SHA256SUMS.txt'),await checksumManifest(directory,files));
