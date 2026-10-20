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
  kind: string;
  state: string;
  createdAt: string;
}
