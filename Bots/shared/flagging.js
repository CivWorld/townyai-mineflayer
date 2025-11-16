// shared/flagging.js
const { goals } = require('mineflayer-pathfinder')

// Helper function for cooldowns (similar to combat.js and navigation.js)
function canDoAction(ctx, action) {
  const now = Date.now()
  const last = ctx.lastAction.get(action) || 0
  if ((now - last) > (ctx.cooldowns.get(action) || 0)) {
    ctx.lastAction.set(action, now)
    return true
  }
  return false
}

function addFlag(bot, ctx, vec) {
  ctx.flags.push(vec);
  bot.chat(`Flag added: (${vec.x}, ${vec.y}, ${vec.z})`);
}

function removeFlagByCoords(bot, ctx, x, y, z) {
  if (ctx.flags.length === 0) {
    bot.chat('No flags to remove.');
    return;
  }
  const idx = ctx.flags.findIndex(f => f.x === x && f.y === y && f.z === z);
  if (idx === -1) {
    bot.chat('No matching flag found.');
    return;
  }
  const removed = ctx.flags.splice(idx, 1)[0];
  bot.chat(`Flag removed: (${removed.x}, ${removed.y}, ${removed.z})`);
}

function moveToFlag(bot, ctx) {
  if (ctx.flags.length === 0) {
    bot.chat('No flags in queue.');
    return;
  }
  
  if (!canDoAction(ctx, "flagGoal")) {
    return; // Still on cooldown
  }
  
  const flag = ctx.flags[0];
  ctx.state = "MOVING TO FLAG";
  bot.setControlState('sprint', true);
  bot.pathfinder.setGoal(new goals.GoalBlock(flag.x, flag.y, flag.z, 1));
  bot.chat(`Moving to flag: (${flag.x}, ${flag.y}, ${flag.z})`);
}

module.exports = {
  addFlag,
  removeFlagByCoords,
  moveToFlag,
}

