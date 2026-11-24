// Frozen Night (winter): a clear winter night on icy ground.
// 1. Ice, a gate (Lisa holds, Stan locks), a pond and a pit of spikes.
// 2. The ice cliff: Lisa rides the lift and lowers a ladder for Stan.
// 3. Down to the swamp raft (Lisa sends Stan, he calls it back for her), past
//    the wolves that freeze in the light (Stan holds, Lisa locks).
// 4. The box against a bank seven tiles high (Stan on the box, Lisa from his
//    head), down to pools, a timed cover for Stan and a last gate.
import { track } from './_track.mjs';

const t = track({ height: 32, floor: 26 });
t.start().ice(6).gate('wg').bridgePool('wg').pillars().lift().ice(5).descend(4).swampRaft().monsters();
t.boxBank().descend(5).smallPools().timedCover('fb').gate('fb').doors();

export default t.level({
  file: 'coop_18_frozen_night.json',
  title: 'Frozen Night',
  properties: { environment: 'winter' },
});
