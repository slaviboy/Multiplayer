// Spring Meadow (spring): the first outdoor level, a long walk through a meadow.
// 1. A gate: Stan holds the button, Lisa runs through and pulls the lever.
// 2. A pond: Lisa wades over and stands on the button that raises a bridge.
// 3. A hill, small pools of lava and water to jump, a pit of spikes with pillars.
// 4. Up the slope to a ledge five tiles high: Lisa jumps from Stan's head and
//    lowers a ladder for him.
// 5. Down again to a goo pit: Lisa holds the button, Stan crosses the bridge and
//    pulls the lever that keeps it, then the doors.
import { track } from './_track.mjs';

const t = track({ height: 26, floor: 20 });
t.start().hill().gate('fb').flat(6).bridgePool('wg').hill().smallPools().pillars();
t.climb(2).ledge().descend(3).gooBridge('wg').flat(5).doors();

export default t.level({
  file: 'coop_13_spring_meadow.json',
  title: 'Spring Meadow',
  properties: { environment: 'spring' },
});
