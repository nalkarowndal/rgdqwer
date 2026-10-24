import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {importModelSchema,downloadModelSchema,nodeInstallSchema} from '../../src/models.js';
import {ModelManager} from './manager.js';
export async function registerModelRoutes(app:FastifyInstance,models:ModelManager){
 app.addHook('preClose',async()=>{await models.close();});
 app.get('/api/models',async()=>models.inventory());
 app.post('/api/models/import',async(request,reply)=>{const input=importModelSchema.safeParse(request.body);if(!input.success)return reply.code(400).send({error:'파일·메타데이터·사용 권한 확인을 완료하세요.'});return reply.code(202).send(models.startImport(input.data));});
 app.post('/api/models/download',async(request,reply)=>{const input=downloadModelSchema.safeParse(request.body);if(!input.success)return reply.code(400).send({error:'다운로드 주소·크기·SHA256·권한을 확인하세요.'});return reply.code(202).send(models.startDownload(input.data));});
 app.post('/api/models/nodes',async(request,reply)=>{const input=nodeInstallSchema.safeParse(request.body);if(!input.success)return reply.code(400).send({error:'GitHub 소스·커밋·코드 위험 확인이 필요합니다.'});return reply.code(202).send(models.startNode(input.data));});
 app.post<{Params:{id:string}}>('/api/models/nodes/:id',async(request,reply)=>{const input=z.object({action:z.enum(['activate','deactivate','remove']),acknowledged:z.literal(true)}).strict().safeParse(request.body);if(!input.success)return reply.code(400).send({error:'노드 변경을 확인하세요.'});return models.changeNode(request.params.id,input.data.action,input.data.acknowledged);});
 app.put('/api/models/root',async(request,reply)=>{const input=z.object({root:z.string().min(1).max(4096),confirmed:z.literal(true)}).strict().safeParse(request.body);if(!input.success)return reply.code(400).send({error:'변경할 절대 경로를 확인하세요.'});return models.setRoot(input.data.root);});
 app.post<{Params:{id:string}}>('/api/models/tasks/:id/cancel',async request=>models.cancel(request.params.id));
 app.post<{Params:{id:string}}>('/api/models/:id/remove',async(request,reply)=>{const input=z.object({confirmed:z.literal(true),acknowledgedReferences:z.boolean()}).strict().safeParse(request.body);if(!input.success)return reply.code(400).send({error:'삭제 및 기존 작업 참조를 확인하세요.'});return models.remove(request.params.id,input.data);});
}
