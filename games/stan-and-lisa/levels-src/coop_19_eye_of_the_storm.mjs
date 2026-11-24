// Eye of the Storm (storm): the longest level, in the dark. Each of you carries a
// little light; lightning shows the whole way for a moment.
// 1. A gate, monsters frozen by torchlight, a pond and a pit of spikes.
// 2. A ledge (Lisa from Stan's head), down to the swamp raft.
// 3. A cliff by lift, down to a timed cover, a bank by box and piggyback.
// 4. Down to a goo pit (Lisa holds, Stan locks), pools to jump, the doors.
import { track } from './_track.mjs';

const t = track({ height: 32, floor: 26 });
t.start().gate('fb').monsters().bridgePool('wg').pillars().ledge().descend(3).swampRaft();
t.lift().descend(5).timedCover('fb').boxBank().descend(4).gooBridge('wg').smallPools().doors();

export default t.level({
  file: 'coop_19_eye_of_the_storm.json',
  title: 'Eye of the Storm',
  properties: { environment: 'storm' },
});
