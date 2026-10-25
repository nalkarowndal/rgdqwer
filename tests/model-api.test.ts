import {it,expect} from 'vitest';import {mkdtemp,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {createApp} from '../server/app.js';
it('protects model and library routes, requires rights and rejects invalid filters and node revisions',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'model-api-'));const app=await createApp({dataDir:dir});const host={host:'127.0.0.1'};const {token}=(await app.inject({url:'/api/session',headers:host})).json();const headers={...host,authorization:`Bearer ${token}`};
 try{for(const url of ['/api/models','/api/models/catalog','/%61pi/models/catalog','/%61pi/models/paths','/api/library'])expect((await app.inject({url,headers:host})).statusCode).toBe(401);
 for(const url of ['/api/models/catalog/download','/api/models/import','/api/models/download','/api/models/nodes']){expect((await app.inject({method:'POST',url,headers:host,payload:{}})).statusCode).toBe(401);expect((await app.inject({method:'POST',url,headers,payload:{confirmed:false}})).statusCode).toBe(400);}
 expect((await app.inject({url:'/api/library?offset=-1',headers})).statusCode).toBe(400);expect((await app.inject({url:'/api/library?favorite=yes',headers})).statusCode).toBe(400);
 expect((await app.inject({method:'POST',url:'/api/models/nodes',headers,payload:{name:'fixture',repository:'https://github.com/test/test',commit:'main',confirmed:true,codeRiskAccepted:true}})).statusCode).toBe(400);
 expect((await app.inject({method:'PUT',url:'/api/library/unknown',headers,payload:{favorite:true,title:'unknown'}})).statusCode).toBe(404);
 expect((await app.inject({url:'/api/models',headers})).json().assets).toEqual([]);
 expect((await app.inject({url:'/api/models/catalog',headers})).json().features).toHaveLength(8);
 for(const featureIds of [[],['unknown'],['../bad']])expect((await app.inject({url:'/api/models/catalog/download',method:'POST',headers,payload:{featureIds,confirmed:true}})).statusCode).toBe(400);
 }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
