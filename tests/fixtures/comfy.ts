import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { PNG } from 'pngjs';
export async function simulatedComfy(options: { extraNodes?: Record<string, unknown>; width?: number; height?: number; outputExtension?: string } = {}) {
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  let id = ''; let history: Record<string, unknown> = {}; let running = false;
  let releaseCancel = () => {};
  const control = { finalPrompt: null as string | null, autoFinish: true, corruptImage: false, externalBusy: false, rejectPrompt: false, cancelSupported: true, holdResponse: false, rejectHistory: false, wrongOutput: false, holdCancelResponse: false, outputBytes: null as Buffer | null };
  const png = new PNG({ width: options.width ?? 512, height: options.height ?? 512 }); png.data.fill(255);
  const bytes = PNG.sync.write(png);
  const nodes: Record<string, unknown> = Object.fromEntries(['KSampler','CheckpointLoaderSimple','EmptyLatentImage','CLIPTextEncode','VAEDecode','SaveImage'].map(name => [name, { input: { required: name === 'CheckpointLoaderSimple' ? { ckpt_name: [['test.safetensors']] } : name === 'KSampler' ? { sampler_name: [['euler']], scheduler: [['normal']] } : {} } }]));
  Object.assign(nodes, options.extraNodes);
  const server = createServer(async (req, res) => {
    const path = new URL(req.url!, 'http://localhost').pathname;
    let body: Record<string, unknown> = {};
    if (req.method === 'POST') { const chunks = []; for await (const chunk of req) chunks.push(chunk); const text=Buffer.concat(chunks).toString();
      body = path==='/upload/image'?{name:text.match(/filename="([^"]+)"/)?.[1],overwrite:text.match(/name="overwrite"\r\n\r\n([^\r]+)/)?.[1]}:JSON.parse(text || '{}'); }
    calls.push({ path, body });
    res.setHeader('content-type', 'application/json');
    const send = (value: unknown) => res.end(JSON.stringify(value));
    if (path === '/free') return res.end();
    if (path === '/upload/image') return send({name:body.name,subfolder:'',type:'input'});
    if (path === '/system_stats') return send({ system: { os: 'nt', python_version: '3.12', ram_total: 16 * 1024 ** 3 }, devices: [] });
    if (path === '/object_info') return send(nodes);
    if (path === '/object_info/CheckpointLoaderSimple') return send({ CheckpointLoaderSimple: nodes.CheckpointLoaderSimple });
    if (path === '/queue') return send({ queue_running: control.externalBusy ? [[0, 'external-task']] : running ? [[0, id]] : [], queue_pending: [] });
    if (path === '/prompt') {
      if (control.rejectPrompt) { res.statusCode = 400; return send({ error: { message: 'Invalid model' }, node_errors: {} }); }
      id = String(body.prompt_id); running = true; history = {};
      if (!control.holdResponse) send({ prompt_id: id, number: 0, node_errors: {} });
      if (control.autoFinish) setTimeout(finish, 150);
      return;
    }
    if (path.startsWith('/history/')) { if (control.rejectHistory) { res.statusCode = 400; return send({ error: 'unavailable' }); } return send(history); }
    if (path === '/view') { res.setHeader('content-type','image/png'); return res.end(control.outputBytes ?? (control.corruptImage ? Buffer.from('broken PNG') : bytes)); }
    if (path.endsWith('/cancel')) {
      if (!control.cancelSupported) { res.statusCode = 404; return send({ error: 'unknown' }); }
      running = false;
      history = { [id]: { status: { completed: false, status_str: 'error', messages: [['execution_interrupted', {}]] }, outputs: {} } };
      if (control.holdCancelResponse) { releaseCancel = () => send({ cancelled: true }); return; }
      return send({ cancelled: true });
    }
    res.statusCode = 404; send({ error: 'unknown' });
  });
  const ws = new WebSocketServer({ server });
  function progress(value: number) {
    for (const client of ws.clients) client.send(JSON.stringify({ type: 'progress', data: { prompt_id: id, value, max: 20 } }));
  }
  function finish() {
    if (!running) return;
    progress(20); running = false;
    history = { [id]: { status: { completed: true, status_str: 'success', messages: [] }, outputs: { ...(control.finalPrompt===null?{}:{'20':{text:[control.finalPrompt]}}), '9': { images: [{ filename: control.wrongOutput ? '../foreign.png' : `${id}_00001_.${options.outputExtension??'png'}`, subfolder: 'rgdqwer', type: 'output' }] } } } };
  }
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { url: `http://127.0.0.1:${(server.address() as { port: number }).port}`, calls, control, progress, finish, nodes,
    connections: () => ws.clients.size,
    releaseCancel: () => releaseCancel(),
    forget: () => { running = false; history = {}; },
    close: async () => { for (const client of ws.clients) client.terminate(); ws.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } };
}
