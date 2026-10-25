import {readdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {checksumManifest} from './package-checks.js';
const directory=resolve(process.argv[2]??'release');const files=(await readdir(directory)).filter(file=>/unsigned-setup\.exe(?:\.blockmap)?$/.test(file));
if(!files.some(file=>file.endsWith('.exe')))throw new Error('No unsigned installer found');
await writeFile(join(directory,'SHA256SUMS.txt'),await checksumManifest(directory,files));
