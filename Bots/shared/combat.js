// shared/combat.js
const utils = require('./utils')

/**
 * constants needed (pass from fighterbot):
 * {
 *   REACH_MIN, REACH_MAX,
 *   MISS_CHANCE_BASE, MISS_STREAK_INCREASE_MIN, MISS_STREAK_INCREASE_MAX, MISS_STREAK_RESET,
 *   LEFT_RIGHT_MIN_MS, LEFT_RIGHT_MAX_MS, BACK_MS, JUMP_CHANCE, JUMP_HOLD_MS,
 *   TARGETING_RANGE
 * }
 */

function checkForClosestTarget(bot, ctx, C) {
  const players = Object.values(bot.players)
    .map(p => p.entity)
    .filter(e =>
      e &&
      e.type === 'player' &&
      e.username !== bot.username &&
      !utils.isAlly(e.username, ctx.allies) &&
      e.position
    )

  if (players.length === 0) {
    if (ctx.target) bot_reset_soft(bot, ctx)
    return
  }

  let closestEnemy = null
  let closestDistance = Infinity
  for (const p of players) {
    const d = bot.entity.position.distanceTo(p.position)
    if (d < closestDistance) {
      closestDistance = d
      closestEnemy = p
    }
  }

  if (closestDistance > C.TARGETING_RANGE) {
    if (ctx.target) bot_reset_soft(bot, ctx)
    return
  }

  if (!ctx.target || ctx.target.id !== closestEnemy.id) {
    ctx.target = closestEnemy
  }
}

function attackTarget(bot, ctx, C) {
  if (!ctx.target || !ctx.target.position) { bot_reset_soft(bot, ctx); return }

  ctx.state = 'ATTACKING TARGET'
  const eyePos = ctx.target.position.offset(0, 1.62, 0)
  bot.lookAt(eyePos)

  const distance = bot.entity.position.distanceTo(ctx.target.position)

  // strafing substate
  handleStrafing(bot, ctx, C)

  // progressive miss chance
  const baseMiss = C.MISS_CHANCE_BASE + Math.random() * (C.MISS_STREAK_INCREASE_MAX - C.MISS_CHANCE_BASE)
  const streakInc = ctx.consecutiveMisses * (C.MISS_STREAK_INCREASE_MIN + Math.random() * (C.MISS_STREAK_INCREASE_MAX - C.MISS_STREAK_INCREASE_MIN))
  const currentMissChance = Math.min(baseMiss + streakInc, 0.85)

  // randomized reach
  const currentReach = C.REACH_MIN + Math.random() * (C.REACH_MAX - C.REACH_MIN)

  if (canDoAction(ctx, 'attack')) {
    if (distance <= currentReach) {
      const missRoll = Math.random()
      if (missRoll < currentMissChance) {
        bot.swingArm()
        ctx.consecutiveMisses++
        if (ctx.consecutiveMisses >= C.MISS_STREAK_RESET) ctx.consecutiveMisses = 0
      } else {
        bot.attack(ctx.target)
        ctx.consecutiveMisses = 0
      }
    }
  }
}

function handleStrafing(bot, ctx, C) {
  const stopAllStrafe = () => {
    bot.setControlState('left', false)
    bot.setControlState('right', false)
    bot.setControlState('back', false)
    ctx.strafeDirection = null
  }

  const startStrafe = (dir, ms) => {
    stopAllStrafe()
    bot.setControlState(dir, true)
    ctx.strafeDirection = dir
    ctx.cooldowns.set('strafeHold', ms)
    ctx.lastAction.set('strafeHold', Date.now())
  }

  if (ctx.strafeDirection && canDoAction(ctx, 'strafeHold')) {
    stopAllStrafe()
  }

  if (canDoAction(ctx, 'strafeDecision')) {
    const choice = ['left', 'right', 'back', 'none'][Math.floor(Math.random() * 4)]
    switch (choice) {
      case 'left': {
        const dur = C.LEFT_RIGHT_MIN_MS + Math.random() * (C.LEFT_RIGHT_MAX_MS - C.LEFT_RIGHT_MIN_MS)
        startStrafe('left', dur)
        break
      }
      case 'right': {
        const dur = C.LEFT_RIGHT_MIN_MS + Math.random() * (C.LEFT_RIGHT_MAX_MS - C.LEFT_RIGHT_MIN_MS)
        startStrafe('right', dur)
        break
      }
      case 'back': {
        startStrafe('back', C.BACK_MS)
        break
      }
      default:
        stopAllStrafe()
        break
    }
  }

  if (!ctx.strafeDirection) return
  if (Math.random() >= C.JUMP_CHANCE) return
  bot.setControlState('jump', true)
  setTimeout(() => bot.setControlState('jump', false), C.JUMP_HOLD_MS)
}

function hasLineOfSight(bot, ctx, targetEntity, C, step = 0.1) {
  if (!targetEntity?.position) return false

  const botPos = bot.entity.position
  const targetPos = targetEntity.position

  const direction = targetPos.minus(botPos)
  const distance = direction.norm()
  const dirN = direction.normalize()

  const startPos = botPos.offset(0, 1.6, 0)
  const steps = Math.ceil(distance / step)

  for (let i = 1; i < steps; i++) {
    const currentPos = startPos.plus(dirN.scaled(i * step))
    const block = bot.blockAt(currentPos)
    if (block && block.boundingBox === 'block') {
      ctx.followMinRange = 1
      return false
    }
  }
  ctx.followMinRange = C.REACH_MIN + 0.1
  return true
}

//local helpers
function canDoAction(ctx, key) {
  const now = Date.now()
  const last = ctx.lastAction.get(key) || 0
  if ((now - last) > (ctx.cooldowns.get(key) || 0)) {
    ctx.lastAction.set(key, now)
    return true
  }
  return false
}

function bot_reset_soft(bot, ctx) {
  bot.setControlState('sprint', false)
  bot.setControlState('forward', false)
  bot.setControlState('left', false)
  bot.setControlState('right', false)
  bot.setControlState('back', false)
  bot.setControlState('jump', false)
  ctx.target = null
  ctx.consecutiveMisses = 0
  ctx.strafeDirection = null
  bot.pathfinder.setGoal(null)
  ctx.state = 'IDLE'
}

module.exports = {
  checkForClosestTarget,
  attackTarget,
  handleStrafing,
  hasLineOfSight,
}
