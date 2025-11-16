// shared/survival.js
const Vec3 = require('vec3')
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

// 1. EQUIP ARMOR
function gear(bot, ctx) {
  ctx.state = "GEARING UP"
  
  // Equip armor
  bot.armorManager.equipAll().catch(() => {})
  
  // Equip strongest sword
  utils.getStrongestSword(bot)
  
  // Reset state after gearing cooldown and ensure sword is equipped
  if (canDoAction(ctx, "gearing")) {
    ctx.state = "IDLE"
    utils.getStrongestSword(bot)
  }
}

// 2. HEAL
async function heal(bot, ctx, S) {
  if (ctx.state != "HEALING" && canDoAction(ctx, "healing")) {
    ctx.state = "HEALING"

    // Find a splash instant health potion with potionId 25 in inventory
    const splashPotions = bot.inventory.items().filter(item => item.name === 'splash_potion');
    let foundPotion = null;
    for (const item of splashPotions) {
      const potionId = utils.getPotionId(item);
      if (potionId === 25) {
        foundPotion = item;
        break;
      }
    }
    if (!foundPotion) {
      //console.log('No healing splash potion with potionId 25 found');
      ctx.state = "IDLE";
      return;
    }
    await bot.equip(foundPotion, 'hand');
    
    try {
      // Add a short random delay before healing (between 10 and 11 ticks) 
      const ticks = Math.floor(Math.random() * 10) + 1;
      //await bot.waitForTicks(ticks);
    
      // Turn away from target if there is one and run away while healing
      if (ctx.target) {
        // Calculate direction away from target
        await utils.lookAwayFromTarget(bot, ctx.target)
        
        // Start sprinting away from target
        bot.setControlState('sprint', true)
        bot.setControlState('forward', true)
        //console.log('Running away from target while healing')
        await bot.waitForTicks(ticks)
      } 
      
      if(bot.health < 7){
        await bot.activateItem(false, new Vec3(0, -1, 0))
        ctx.cooldowns.set('healing',500) //double pot
      }else{
        await bot.activateItem(false, new Vec3(0, -1, 0))
        ctx.cooldowns.set('healing',1000)
      }

      // Stop moving after healing
      bot.setControlState('sprint', false)
      bot.setControlState('forward', false)

      // Immediately resume normal state after healing and re-equip sword
      ctx.state = "IDLE"
      utils.getStrongestSword(bot)
      //console.log('Healing complete, resuming combat')
    } catch (error) {
      //console.log('Error during healing:', error.message)
      // Stop movement on error
      bot.setControlState('sprint', false)
      bot.setControlState('forward', false)
      ctx.state = "IDLE"
      utils.getStrongestSword(bot)
    }
  }
}

// 3. EAT FOOD
async function eat(bot, ctx, S) {
  //console.log(bot.food)
  // Start eating if not already eating and cooldown allows
  if (ctx.state !== "EATING" && canDoAction(ctx, "eating")) {
    ctx.state = "EATING"
    const food = await utils.getBestFood(bot)
    
    if (!food) {
      //console.log('No valid food found in inventory')
      ctx.state = "IDLE"
      return
    }
    
    //console.log('Started eating food - will jump and face away from target')
    if (ctx.target && ctx.target.position) { // Face away from target and move forward
      try {
        await utils.lookAwayFromTarget(bot, ctx.target)
        bot.setControlState('forward', true);
        bot.setControlState('jump', true);
        bot.setControlState('jump', false);
      } catch (error) {
      }
    } else {
      bot.setControlState('forward', false);
    }
    
  }
  if (bot.food > S.HUNGER_THRESHOLD) {
    //console.log('No longer hungry, stopping eating')
    ctx.state = "IDLE"
    utils.getStrongestSword(bot)
    return
  }
  else{
    //console.log(bot.food)
  }
  bot.activateItem()
}

function canEatFood(bot) {
  // Check if bot has any valid food
  return utils.getBestFood(bot)
}

function canHealSelf(bot) {
  // Only return true if splash potion with potionId 25 is present
  const splashPotions = bot.inventory.items().filter(item => item.name === 'splash_potion');
  for (const item of splashPotions) {
    if (utils.getPotionId(item) === 25) return true;
  }
  return false;
}

function hasPotion(bot, id) {
  const potion= bot.inventory.items().filter(item => item.name === 'potion');
  for (const item of potion) {
    console.log(utils.getPotionId(item))
    if (utils.getPotionId(item) === id) return true;
  }
  
  return false;
}

// Attempt to drink buff potions (IDs: 36, 15, 12) with cooldowns
async function DrinkBuffPotions(bot, ctx){
  if(ctx.state == "DRINKINGFRES"){
    if(bot.entity.effects[11]){
      bot.chat("drank fres")
      ctx.state = "IDLE"
    }
    bot.activateItem()
    return
  }
  if(ctx.state == "DRINKINGSPEED"){
    if(bot.entity.effects[0]){
      bot.chat("drank speed")
      ctx.state = "IDLE"
    }
    bot.activateItem()
    return
  }
  if(ctx.state == "DRINKINGSTRENGTH"){
    if(bot.entity.effects[4]){
      bot.chat("drank strength")
      ctx.state = "IDLE"
    }
    bot.activateItem()
    return
  }    
  const potionsToDrink = [
    { potion_id: 36, effect_id:4},
    { potion_id: 15, effect_id:0},
    { potion_id: 12, effect_id:11}
  ];
  for (const { potion_id, effect_id } of potionsToDrink) {
    if(!bot.entity.effects[effect_id]){
      console.log("missing " + effect_id)
      const potions = bot.inventory.items().filter(item => item.name === 'potion' && utils.getPotionId(item) === potion_id);
      if (potions.length > 0) {
        await bot.equip(potions[0], 'hand');
        switch (effect_id) {
          case 11:
            ctx.state = "DRINKINGFRES";
            break;
          case 0:
            ctx.state = "DRINKINGSPEED";
            break;
          case 4:
            ctx.state = "DRINKINGSTRENGTH";
            break;
        }
      }else{
        bot.chat("no potion of id" + potion_id)
      }


    }
  }
}

module.exports = {
  gear,
  heal,
  eat,
  canEatFood,
  canHealSelf,
  hasPotion,
  DrinkBuffPotions,
}

