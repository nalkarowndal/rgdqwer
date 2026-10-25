export function parseSoakOptions(args:string[]){
 const flags=new Map<string,string>();for(let i=0;i<args.length;i+=2){if(!['--duration-ms','--cycles','--report'].includes(args[i])||!args[i+1]||flags.has(args[i]))throw new Error('Invalid soak arguments');flags.set(args[i],args[i+1]);}
 const durationMs=Number(flags.get('--duration-ms')??180000),cycles=Number(flags.get('--cycles')??100);
 if(!Number.isSafeInteger(durationMs)||durationMs<1000||durationMs>3600000||!Number.isSafeInteger(cycles)||cycles<6||cycles>2000)throw new Error('Soak requires 1s–1h and 6–2000 cycles');
 return {durationMs,cycles,report:flags.get('--report')??'test-results/m8-soak.json'};
}
export interface MemorySample {heapUsed:number;rss:number}
export function assessMemory(samples:MemorySample[]){
 if(samples.length<2||samples.some(s=>![s.heapUsed,s.rss].every(v=>Number.isFinite(v)&&v>=0)))throw new Error('At least two valid post-warmup memory samples required');
 const baseline=samples[0],end=samples.at(-1)!,thresholds={heapUsed:128*1024**2,rss:256*1024**2};
 const retainedGrowth={heapUsed:end.heapUsed-baseline.heapUsed,rss:end.rss-baseline.rss};const peakGrowth={heapUsed:Math.max(...samples.map(s=>s.heapUsed))-baseline.heapUsed,rss:Math.max(...samples.map(s=>s.rss))-baseline.rss};
 return {baseline,end,retainedGrowth,peakGrowth,thresholds,passed:peakGrowth.heapUsed<=thresholds.heapUsed&&peakGrowth.rss<=thresholds.rss,interpretation:'Finite simulated-engine diagnostic; not proof of leak freedom or GPU stability'};
}
