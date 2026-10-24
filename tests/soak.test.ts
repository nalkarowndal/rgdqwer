import {it,expect} from 'vitest';
import {parseSoakOptions,assessMemory} from '../scripts/soak-report.js';
it('bounds soak duration and cycles and rejects ambiguous flags',()=>{
 expect(parseSoakOptions([])).toMatchObject({durationMs:180000,cycles:100});
 expect(parseSoakOptions(['--duration-ms','20000','--cycles','20'])).toMatchObject({durationMs:20000,cycles:20});
 for(const args of [['--cycles','0'],['--duration-ms','3600001'],['--cycles','2001'],['--cycles','1.5'],['--duration-ms','NaN'],['--unknown','1'],['--cycles','10','--cycles','20']])expect(()=>parseSoakOptions(args)).toThrow();
});
it('reports peak growth as well as retained growth after warmup without claiming leak freedom',()=>{
 const mb=1024**2;expect(assessMemory([{heapUsed:10*mb,rss:20*mb},{heapUsed:20*mb,rss:30*mb}]).passed).toBe(true);
 const spike=assessMemory([{heapUsed:mb,rss:mb},{heapUsed:140*mb,rss:300*mb},{heapUsed:mb,rss:mb}]);expect(spike.passed).toBe(false);expect(spike.retainedGrowth.heapUsed).toBe(0);expect(spike.peakGrowth.heapUsed).toBe(139*mb);
 expect(()=>assessMemory([])).toThrow();
});
