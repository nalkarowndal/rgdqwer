import { createServer } from 'node:http';
export const analysisFixture = { caption: 'Synthetic fixture: a person in a forest.', ocr: 'HELLO',
  tags: [{ name: 'blue eyes', score: 0.8, category: 'general' }, { name: 'forest', score: 0.7, category: 'general' }],
  models: ['florence','wd14'], width: 16, height: 8 };
export async function simulatedAnalysis() {
  const calls: { authorization?: string; body: unknown }[] = [];
  const control = { status: 200, malformed: false, redirect: false, hold: false, missing: false };
  let release = () => {};
  const server = createServer(async (req,res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(chunk);
    calls.push({ authorization: req.headers.authorization, body: chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null });
    res.setHeader('content-type','application/json');
    if (control.redirect) { res.writeHead(302,{ location: '/foreign' }); res.end(); return; }
    if (req.url === '/analysis/status') { res.end(JSON.stringify({ busy: false, device: 'cpu', models: ['florence','wd14'].map(id => ({ id, available: !control.missing, reason: 'Synthetic fixture' })) })); return; }
    const send = () => { res.statusCode = control.status; res.end(JSON.stringify(control.malformed ? { private: 'not valid' } : control.status === 200 ? analysisFixture : { detail: 'secret private file path' })); };
    if (control.hold) release = send; else send();
  });
  await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve));
  return { url: `http://127.0.0.1:${(server.address() as { port: number }).port}`, calls, control, release: () => release(),
    close: async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } };
}
