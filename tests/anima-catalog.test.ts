import {expect,it} from 'vitest';
import {catalogFiles,modelFeatures,featureDownloadSchema,selectCatalogFiles} from '../src/model-catalog.js';
it('includes complete official Anima base bundle and accepts all features together',()=>{
 const files=selectCatalogFiles(['anima']);expect(files.map(f=>f.path)).toEqual(['split_files/diffusion_models/anima-base-v1.0.safetensors','split_files/text_encoders/qwen_3_06b_base.safetensors','split_files/vae/qwen_image_vae.safetensors']);
 expect(files.map(f=>f.kind)).toEqual(['video','text_encoder','vae']);expect(files.every(f=>f.repo==='circlestone-labs/Anima'&&f.license.includes('Non-Commercial'))).toBe(true);
 expect(featureDownloadSchema.safeParse({featureIds:modelFeatures.map(f=>f.id),confirmed:true}).success).toBe(true);expect(modelFeatures).toHaveLength(9);expect(new Set(catalogFiles.map(f=>f.id)).size).toBe(catalogFiles.length);
});
