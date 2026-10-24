import {z} from 'zod';
export const MAX_MODEL_BYTES=64*1024**3;
const portable=(s:string)=>/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(s)&&!s.endsWith('.')&&!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s)&&!s.includes('..');
export const modelKindSchema=z.enum(['checkpoint','lora','vae','text_encoder','analysis','video','voice']);
export type ModelKind=z.infer<typeof modelKindSchema>;
export const modelFolders:Record<ModelKind,string>={checkpoint:'checkpoints',lora:'loras',vae:'vae',text_encoder:'text_encoders',analysis:'analysis',video:'diffusion_models',voice:'voice'};
export const modelManifestSchema=z.object({name:z.string().trim().min(1).max(100),kind:modelKindSchema,family:z.string().trim().min(1).max(80),fileName:z.string().max(160).refine(s=>portable(s)&&/\.(safetensors|ckpt|pt|pth|bin|onnx|json|index|yaml|txt|model|tiktoken)$/i.test(s),'지원하는 모델 파일명만 사용하세요.'),bundle:z.string().max(80).refine(s=>s===''||portable(s)).default(''),sourceUrl:z.string().max(4000).default(''),revision:z.string().max(100).default(''),license:z.string().trim().min(1).max(500),requiredAssets:z.array(z.string().uuid()).max(30).default([]),requiredNodes:z.array(z.string().min(1).max(100)).max(100).default([]),vramGiB:z.number().positive().max(256).nullable().default(null)}).strict();
export type ModelManifest=z.infer<typeof modelManifestSchema>;
export const importModelSchema=z.object({manifest:modelManifestSchema,sourcePath:z.string().min(1).max(4096),confirmed:z.literal(true)}).strict();
export const downloadModelSchema=z.object({manifest:modelManifestSchema,bytes:z.number().int().positive().max(MAX_MODEL_BYTES),sha256:z.string().regex(/^[a-fA-F0-9]{64}$/).transform(v=>v.toLowerCase()),confirmed:z.literal(true)}).strict();
export type ImportModelInput=z.infer<typeof importModelSchema>;
export type DownloadModelInput=z.infer<typeof downloadModelSchema>;
export interface InstalledAsset extends ModelManifest {id:string;root:string;relativePath:string;bytes:number;sha256:string;installedAt:string;method:'import'|'download'}
export interface ModelTask {id:string;root:string;operation:'import'|'download'|'stage-node';name:string;state:'running'|'completed'|'failed'|'cancelled';received:number;total:number|null;error:string|null;createdAt:string;updatedAt:string;assetId?:string}
export interface DiscoveredModel {root:string;relativePath:string;bytes:number;managed:boolean}
export interface AssetDiagnostics {id:string;issues:string[];historicalJobs:number;dependents:string[];engineVisible:boolean|null}
export interface NodePack {id:string;name:string;repository:string;commit:string;root:string;treeHash:string;bytes:number;files:number;requirements:string;license:string;installedAt:string;activePath?:string}
export const nodeInstallSchema=z.object({name:z.string().min(1).max(80),repository:z.string().regex(/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/),commit:z.string().regex(/^[a-fA-F0-9]{40}$/).transform(v=>v.toLowerCase()),confirmed:z.literal(true),codeRiskAccepted:z.literal(true)}).strict();
export type NodeInstallInput=z.infer<typeof nodeInstallSchema>;
export interface LibraryEntry {job:import('./contracts.js').Job;favorite:boolean;title:string}
export interface LibraryPage {items:LibraryEntry[];total:number;offset:number;limit:number}

export type ModelRemoval={id:string;kind:'asset';asset:InstalledAsset}|{id:string;kind:'node';pack:NodePack;action:'deactivate'|'remove'};
