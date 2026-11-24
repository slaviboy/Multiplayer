// Sun-Baked Dunes (summer): hot sand, lava and a cliff.
// 1. A lava pit: Stan walks across to the button that raises a bridge for Lisa.
// 2. A gate: Lisa holds it open, Stan pulls the lever behind it.
// 3. Pools to jump, a pit of spikes with pillars.
// 4. A cliff seven tiles high: Lisa rides the lift while Stan holds its button,
//    then lowers a ladder for him.
// 5. Down the dunes to a goo pit (Stan holds, Lisa crosses and locks the bridge).
// 6. A lava pool with a timed cover: Stan wades over and presses the timed button;
//    Lisa has six seconds to cross.
// 7. A long lava lake: Stan holds the button and the raft carries Lisa, then he
//    wades after her to the doors.
import { track } from './_track.mjs';

const t = track({ height: 30, floor: 24 });
t.start().hill().bridgePool('fb').gate('wg').smallPools().hill().pillars();
t.lift().flat(4).descend(4).gooBridge('fb').timedCover('wg').hill().raft('wg').doors();

export default t.level({
  file: 'coop_14_sun_baked_dunes.json',
  title: 'Sun-Baked Dunes',
  properties: { environment: 'summer' },
});
