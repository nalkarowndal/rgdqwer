import { PNG } from 'pngjs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { Artifact, Job } from '../../src/contracts.js';
import { boundedBytes, type ComfyClient } from './client.js';

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
export function validatePng(bytes: Buffer, width: number, height: number) {
  const invalid = () => new Error('PNG 형식·크기·무결성 검증에 실패했습니다.');
  if (bytes.length < 33 || !bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw invalid();
  let ended = false;
  for (let offset = 8; offset < bytes.length;) {
    if (offset + 12 > bytes.length || ended) throw invalid();
    const size = bytes.readUInt32BE(offset); const end = offset + 12 + size;
    if (end > bytes.length) throw invalid();
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (offset === 8) {
      if (type !== 'IHDR' || size !== 13 || bytes.readUInt32BE(offset + 8) !== width || bytes.readUInt32BE(offset + 12) !== height) throw invalid();
    } else if (type === 'IHDR') throw invalid();
    let crc = 0xffffffff;
    for (let index = offset + 4; index < end - 4; index++) crc = crcTable[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
    if (((crc ^ 0xffffffff) >>> 0) !== bytes.readUInt32BE(end - 4)) throw invalid();
    if (type === 'IEND') { if (size !== 0) throw invalid(); ended = true; }
    offset = end;
  }
  if (!ended) throw invalid();
  const decoded = PNG.sync.read(bytes, { checkCRC: true });
  if (decoded.width !== width || decoded.height !== height) throw invalid();
}

export async function saveOutput(client: ComfyClient, job: Job, raw: unknown, directory: string): Promise<Artifact> {
  const value = z.object({ filename: z.string(), subfolder: z.literal('rgdqwer'), type: z.literal('output') }).parse(raw);
  if (!value.filename.startsWith(`${job.id}_`) || !value.filename.endsWith('.png') || /[\\/]/.test(value.filename)) throw new Error('작업에 속하지 않는 결과 파일입니다.');
  const params = new URLSearchParams(value);
  const bytes = await boundedBytes(await client.request(`/view?${params}`), 20 * 1024 ** 2);
  validatePng(bytes, job.input.width, job.input.height);
  const fileName = `${job.id}.png`; const file = join(directory, fileName);
  await mkdir(directory, { recursive: true });
  try { await writeFile(`${file}.tmp`, bytes, { mode: 0o600 }); await rename(`${file}.tmp`, file); }
  finally { await rm(`${file}.tmp`, { force: true }); }
  return { id: job.id, fileName, width: job.input.width, height: job.input.height };
}
