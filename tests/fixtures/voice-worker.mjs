// Test-only inference double; outputs deterministic PCM, never represents speech synthesis.
import { readFileSync,writeFileSync } from 'node:fs';
const args=process.argv.slice(2);
if(args[0]==='status')console.log(JSON.stringify({engines:[{id:'chatterbox-tts',available:true,message:'TEST FIXTURE'},{id:'chatterbox-vc',available:true,message:'TEST FIXTURE'}]}));
else {
 const req=JSON.parse(readFileSync(args[1],'utf8'));
 if(req.prompt==='slow')await new Promise(resolve=>setTimeout(resolve,30000));
 if(req.prompt==='fail')process.exit(2);
 if(req.prompt==='bad'){writeFileSync(args[2],'corrupt');process.exit(0);}
 const samples=24000,b=Buffer.alloc(44+samples*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(24000,24);b.writeUInt32LE(48000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(samples*2,40);for(let i=0;i<samples;i++)b.writeInt16LE(Math.round(Math.sin(i/20)*1000),44+i*2);writeFileSync(args[2],b);
}
