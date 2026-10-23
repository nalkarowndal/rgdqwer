import type { KreaInput } from './krea.js';
import type { PromptDocument } from './prompt.js';
export interface Settings {
  comfyUrl: string;
  workerUrl: string;
  comfyPath: string;
  modelPath: string;
  lowVram: boolean;
}
export interface Device {
  name: string;
  type: string;
  vramTotal: number | null;
  vramFree: number | null;
}
export interface EngineStatus {
  state: 'connected' | 'disconnected' | 'error';
  message: string;
  checkedAt: string;
  devices: Device[];
  ramTotal: number | null;
  checkpoints: string[];
  version: string | null;
}
export interface WorkerStatus {
  state: 'connected' | 'disconnected' | 'error';
  message: string;
  capabilities: string[];
  hardware?: {
    gpu_status: string;
    cuda_inference_verified: boolean;
    gpus: { name: string; memory_total_mib: number; memory_free_mib: number; driver: string }[];
  };
}
export interface Job {
  id: string;
  kind: 'image';
  state: 'preparing' | 'queued' | 'running' | 'cancelling' | 'postprocessing' | 'completed' | 'failed' | 'cancelled' | 'interrupted' | 'unknown';
  createdAt: string;
  updatedAt: string;
  input: GenerationInput;
  workflowVersion: string;
  engineUrl: string;
  promptId: string | null;
  progress: number | null;
  error: string | null;
  artifacts: Artifact[];
  log: string[];
  cancelRequested: boolean;
}
export interface ImageInput {
  promptDocument?: PromptDocument;
  profile: 'sd15' | 'sdxl' | 'illustrious'; checkpoint: string;
  prompt: string; negative: string; width: number; height: number;
  seed: number; steps: number; cfg: number;
}
export interface Artifact { id: string; fileName: string; width: number; height: number }

export type GenerationInput = ImageInput | KreaInput;
