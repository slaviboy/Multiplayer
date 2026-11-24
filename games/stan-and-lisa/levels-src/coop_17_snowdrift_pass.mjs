// Snowdrift Pass (snow): over the mountain pass in falling snow.
// 1. Up the slope, over the ice, across a pit of icicle spikes.
// 2. A gate (Stan holds, Lisa locks), then a bank seven tiles high: Stan pushes
//    the box against it and stands on it, Lisa jumps from his head and lowers a
//    ladder.
// 3. Down over the ice to a pond (Lisa raises the bridge), monsters that freeze
//    in the light (Stan holds the button, Lisa locks the lever), pools, spikes.
// 4. A ledge (Lisa from Stan's head), down to a goo pit (Stan holds, Lisa locks)
//    and a lava pool with a timed cover for Lisa.
import { track } from './_track.mjs';

const t = track({ height: 30, floor: 24 });
t.start().climb(2).ice(6).pillars().gate('fb').boxBank().ice(6).descend(4).bridgePool('wg').monsters();
t.smallPools().pillars().hill().ledge().descend(3).gooBridge('fb').timedCover('wg').doors();

export default t.level({
  file: 'coop_17_snowdrift_pass.json',
  title: 'Snowdrift Pass',
  properties: { environment: 'snow' },
});
