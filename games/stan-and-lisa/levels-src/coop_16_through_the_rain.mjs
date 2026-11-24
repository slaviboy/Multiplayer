// Through the Rain (rain): puddles everywhere, so Stan needs a lot of help.
// 1. A puddle with a timed cover: Lisa wades over and presses the timed button.
// 2. A gate (Lisa holds, Stan locks it), a pond Lisa wades to raise a bridge.
// 3. A pit of spikes, up to a ledge (Lisa from Stan's head, a ladder for Stan).
// 4. Another timed cover, down to a lake crossed by raft, pools to jump.
// 5. A goo pit (Stan holds, Lisa locks), a lift up a cliff (Stan holds, Lisa
//    rides and lowers a ladder), down again and a last pond.
import { track } from './_track.mjs';

const t = track({ height: 30, floor: 24 });
t.start().timedCover('fb').gate('wg').bridgePool('wg').pillars().climb(2).ledge().flat(4);
t.timedCover('fb').descend(3).raft('fb').smallPools().gooBridge('fb').lift().descend(5).bridgePool('wg').doors();

export default t.level({
  file: 'coop_16_through_the_rain.json',
  title: 'Through the Rain',
  properties: { environment: 'rain' },
});
