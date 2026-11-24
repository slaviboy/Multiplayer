// Across the Lake (lake): rafts, a swamp and the shore.
// 1. The lake: Lisa holds the button, the raft carries Stan, then she wades over.
// 2. A gate (Stan holds, Lisa locks it).
// 3. The swamp: its raft moves while the near button is held or the far lever is
//    on. Lisa sends Stan over, the raft comes back, and Stan calls it for her.
// 4. A pond Lisa wades to raise a bridge, pools to jump, up to a ledge (Lisa from
//    Stan's head, a ladder for Stan) and down again.
// 5. A second lake by raft, a timed cover (Lisa presses, Stan runs), and a goo
//    pit where Stan holds the button and Lisa locks the bridge.
import { track } from './_track.mjs';

const t = track({ height: 26, floor: 20 });
t.start().raft('fb').hill().gate('fb').swampRaft().flat(4).bridgePool('wg').smallPools();
t.climb(2).ledge().descend(5).raft('fb').timedCover('fb').gooBridge('fb').doors();

export default t.level({
  file: 'coop_15_across_the_lake.json',
  title: 'Across the Lake',
  properties: { environment: 'lake' },
});
