import {it,expect} from 'vitest';import {validateArchiveEntries} from '../scripts/verify-payload.js';
const required=['/package.json','/dist/desktop/main.js','/dist/server/app.js','/dist/ui/index.html','/node_modules/sql.js/dist/sql-wasm.wasm'];
it('rejects missing runtime files and leaked local data or development tools in an actual archive listing',()=>{
 expect(()=>validateArchiveEntries(required)).not.toThrow();expect(()=>validateArchiveEntries(required.slice(1))).toThrow(/missing/);
 for(const path of ['/tests/test.ts','/.data/studio.sqlite','/.env','/node_modules/vitest/package.json','/worker/tests/test_app.py','/models/secret.pt','/worker.token'])expect(()=>validateArchiveEntries([...required,path])).toThrow(/forbidden/);
});
