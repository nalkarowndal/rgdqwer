import {it,expect} from 'vitest';import {validateArchiveEntries} from '../scripts/verify-payload.js';
const required=['/package.json','/dist/desktop/main.js','/dist/server/app.js','/dist/ui/index.html','/node_modules/sql.js/dist/sql-wasm.wasm'];
it('rejects missing runtime files and leaked local data or development tools in an actual archive listing',()=>{
 expect(()=>validateArchiveEntries(required)).not.toThrow();expect(()=>validateArchiveEntries(required.slice(1))).toThrow(/missing/);
 for(const path of ['/tests/test.ts','/.data/studio.sqlite','/.env','/node_modules/vitest/package.json','/worker/tests/test_app.py','/models/secret.pt','/worker.token'])expect(()=>validateArchiveEntries([...required,path])).toThrow(/forbidden/);
});
it('rejects nonruntime dependency directories at any nesting depth with either separator',()=>{
 for(const path of ['/node_modules/zod/src/v4/classic/tests/a.ts','/node_modules/@fastify/error/benchmarks/a.js','/node_modules/ajv/node_modules/fast-uri/benchmark/a.js','/node_modules/json-schema-traverse/spec/fixtures/schema.js','/node_modules/sonic-boom/fixtures/a.js','/node_modules/example/lib/__tests__/a.js','/node_modules/example/lib/bench/a.js','/node_modules/example/lib/test/a.js']){
  expect(()=>validateArchiveEntries([...required,path])).toThrow(/forbidden/);
  expect(()=>validateArchiveEntries([...required,path.replaceAll('/','\\')])).toThrow(/forbidden/);
 }
});
it('retains runtime files, schemas and notices whose names merely contain test/spec words',()=>{
 expect(()=>validateArchiveEntries([...required,'/node_modules/example/lib/test.js','/node_modules/example/lib/specification.json','/node_modules/example/lib/fixtures.js','/node_modules/@fastify/error/index.js','/node_modules/zod/v4/core/schemas.js','/node_modules/zod/LICENSE'])).not.toThrow();
});
