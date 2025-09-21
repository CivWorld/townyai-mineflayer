function getPotionId(item) {
    if (!item.components) return null
    
    // Check for bundle_contents structure (newer mineflayer versions)
    const bundleComp = item.components.find(c => c.type === 'bundle_contents')
    if (bundleComp?.data?.contents?.[0]?.itemCount) {
        return bundleComp.data.contents[0].itemCount
    }
    
    // Fallback to old potion_contents structure
    const potionComp = item.components.find(c => c.type === 'potion_contents')
    return potionComp?.data?.potionId || null
  }
  
  function isAlly(playerName, allyList) {
    if (!playerName) return false
    return allyList.some(a => a.toLowerCase() === playerName.toLowerCase())
  }
  
  function getNearestAlly(bot, allyList) {
    let nearest = null
    let minDist = Infinity
    for (const name in bot.players) {
      const player = bot.players[name]
      if (isAlly(name, allyList) && player?.entity?.position) {
        const d = bot.entity.position.distanceTo(player.entity.position)
        if (d < minDist) {
          minDist = d
          nearest = player.entity
        }
      }
    }
    return nearest
  }
  
  function getStrongestSword(bot) {
    const order = ['netherite_sword','diamond_sword','iron_sword','stone_sword','golden_sword','wooden_sword']
    const swords = bot.inventory.items().filter(i => order.includes(i.name))
    if (swords.length === 0) return false
    swords.sort((a,b)=> order.indexOf(a.name) - order.indexOf(b.name))
    const strongest = swords[0]
    if (strongest && bot.heldItem !== strongest) {
      bot.equip(strongest, 'hand').catch(() => {})
    }
    return true
  }
  
  function getBestFood(bot) {
    const order = [
      'enchanted_golden_apple','golden_apple','golden_carrot',
      'cooked_beef','cooked_porkchop','cooked_chicken','cooked_rabbit','cooked_mutton',
      'bread','cooked_cod','baked_potato'
    ]
    const foods = bot.inventory.items().filter(i => order.includes(i.name))
    if (foods.length === 0) return false
    foods.sort((a,b)=> order.indexOf(a.name) - order.indexOf(b.name))
    const best = foods[0]
    bot.equip(best, 'hand').catch(()=>{})
    return true
  }
  
  async function lookAwayFromTarget(bot, target) {
    if (!target?.position) return
    const away = bot.entity.position.minus(target.position).normalize()
    const lookPos = bot.entity.position.plus(away.scaled(5))
    try { await bot.lookAt(lookPos, true) } catch {}
  }
  
  module.exports = {
    getPotionId,
    isAlly,
    getNearestAlly,
    getStrongestSword,
    getBestFood,
    lookAwayFromTarget,
  }
  