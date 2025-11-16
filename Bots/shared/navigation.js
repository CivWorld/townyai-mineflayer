// shared/navigation.js
const { goals } = require('mineflayer-pathfinder')
const utils = require('./utils')

// Helper function for cooldowns (similar to combat.js)
function canDoAction(ctx, action) {
  const now = Date.now()
  const last = ctx.lastAction.get(action) || 0
  if ((now - last) > (ctx.cooldowns.get(action) || 0)) {
    ctx.lastAction.set(action, now)
    return true
  }
  return false
}

// 4. RETURN TO ALLY
function returnToAlly(bot, ctx) {
  ctx.state = "RETURNING TO ALLY"
  
  const nearestAlly = utils.getNearestAlly(bot, ctx.allies)
  if (!nearestAlly) {
    //console.log("No ally found to return to")
    ctx.state = "IDLE"
    return
  }
  
  const distance = bot.entity.position.distanceTo(nearestAlly.position)
  //console.log(`Returning to ally ${nearestAlly.username} (${Math.floor(distance)} blocks away)`)
  
  // Reset current target since we're prioritizing ally proximity
  ctx.target = null
  
  // Sprint to ally
  bot.setControlState('sprint', true)
  bot.pathfinder.setGoal(new goals.GoalFollow(nearestAlly, 3)) // Follow within 3 blocks
}

// 6. MOVE TO TARGET
async function moveToTarget(bot, ctx, botReset) {
  // Check if target still exists and has position
  if (!ctx.target || !ctx.target.position) {
    //console.log("Target lost during movement")
    botReset()
    return
  }
  
  ctx.state = "MOVING TO TARGET"
  
  // Calculate the minimum attack range (just outside of REACH_MIN)
  //const minAttackRange = REACH_MIN + 0.1 // Small buffer to avoid getting inside the target
  
  // Start moving to target, but stop at min attack range
  bot.setControlState('sprint', true)
  bot.pathfinder.setGoal(new goals.GoalFollow(ctx.target, ctx.follow_min_range))
  
  // Constantly swing sword if target is within 10 blocks
  if (ctx.target && ctx.target.position) {
    const distance = bot.entity.position.distanceTo(ctx.target.position)
    if (distance <= 10 && canDoAction(ctx, "movementSwing")) {
      // Look at target and swing (no damage)
      const eyePos = ctx.target.position.offset(0, 1.62, 0);
      bot.lookAt(eyePos);
      bot.swingArm()
      //console.log("Movement swinging - target within 10 blocks")
    }
  }
}

function isTooFarFromAlly(bot, ctx) {
  const nearestAlly = utils.getNearestAlly(bot, ctx.allies)
  if (!nearestAlly) return false
  const distance = bot.entity.position.distanceTo(nearestAlly.position)
  return distance > ctx.allyMaxDistance
}

module.exports = {
  returnToAlly,
  moveToTarget,
  isTooFarFromAlly,
}

