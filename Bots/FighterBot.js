const mineflayer      = require('mineflayer');
const mcData     = require('minecraft-data')('1.21.4')  // adjust to match your server version
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const armorManager = require('mineflayer-armor-manager')
const Vec3 = require('vec3')
const utils = require('./shared/utils')
const combat = require('./shared/combat')
const survival = require('./shared/survival')
const navigation = require('./shared/navigation')
const flagging = require('./shared/flagging')

function getArg(flag, fallback = undefined) {
const i = process.argv.indexOf(flag);
return i !== -1 && process.argv[i+1] ? process.argv[i + 1]: fallback;
}
const BOTNAME = process.env.BOTNAME || getArg('--name', `fighter`/*`Fighter_${Math.floor(Math.random()*10000)}`*/);
const ACK     = process.env.ACK     || getArg('--ack', '')

//BOT INSTANCE
const bot = mineflayer.createBot({
  host: process.env.MC_HOST || 'localhost', // DO NOT PUSH HARDCODED CHANGES TO THESE VALUES.
  port: process.env.MC_PORT || 25565, // DO NOT PUSH HARDCODED CHANGES TO THESE VALUES.
  username: BOTNAME,
  version: process.env.MC_VERSION || '1.21.4',
  auth: 'offline', // or 'mojang' for older versions
});

  
//PLUGINS
bot.loadPlugin(pathfinder)
bot.loadPlugin(armorManager)

  var ctx = { //bot context
    allies: [],   // replaces ALLY_LIST
    allyMaxDistance: 30,    // replaces ALLY_MAX_DISTANCE
    flags: [],              // replaces flagQueue
    cooldowns: new Map(),
    lastAction: new Map(),

    state: 'IDLE',
    target: null,
    consecutiveMisses: 0,
    strafeDirection: null,
    followMinRange: undefined

  }

var C = { //combat variables
    REACH_MIN: 2.85,
    REACH_MAX: 3.68,
    MISS_CHANCE_BASE: 0.02,
    MISS_CHANCE_MAX: 0.12,
    MISS_STREAK_INCREASE_MIN: 0.05,
    MISS_STREAK_INCREASE_MAX: 0.12,
    MISS_STREAK_RESET: 5,
    LEFT_RIGHT_MIN_MS: 1000,
    LEFT_RIGHT_MAX_MS: 3000,
    BACK_MS: 500,
    JUMP_CHANCE: 0.02,
    JUMP_HOLD_MS: 50,
    TARGETING_RANGE: 25,
    CPS: 13 //used to calculate attack cooldown
  }

const S = { //survival constants
    HEALTH_THRESHOLD: 10,
    HUNGER_THRESHOLD: 18
  }
  

ctx.cooldowns.set('attack',800/C.CPS) //time between attacks, modify via CPS const
ctx.cooldowns.set('stateprint',500) // time between console output of state
ctx.cooldowns.set('gearing',500) // time for gearing process
ctx.cooldowns.set('healing',1000) // time between healing attempts
ctx.cooldowns.set('eating',500) // time between eating attempts
ctx.cooldowns.set('playerCollect',250) // time for player collect gearing
ctx.cooldowns.set('movementSwing',75) // ~13 CPS for movement swinging
ctx.cooldowns.set('lookAround',2000) // 2 seconds between look around actions
ctx.cooldowns.set('targetCheck',2000) // 2 seconds between target checks
ctx.cooldowns.set('strafeDecision',4000) // 4 seconds between strafe decisions
ctx.cooldowns.set('flagGoal',15000) // 15 seconds between flag goal changes

// Initial gearing on spawn
bot.once('spawn', () => {
    console.log('Bot spawned and starting initial gearing.')
    console.log('my ack code is: ' + ACK)
    //setTimeout(() => {
    bot.chat(`/minecraft:msg ADMINBOT `+ACK)
        //bot.whisper("ADMINBOT", ACK)
    //}, 1000)
    ctx.state = "gearing"
})

bot.on('error', err => {
    console.error(`${bot.username} error:`, err.message);
    
    // Handle protocol errors gracefully
    if (err.message.includes('PartialReadError') || err.message.includes('Read error')) {
      console.log(`${bot.username}: Protocol read error detected, this is usually harmless`);
      return;
    }
    
    // For other errors, you might want to reconnect
    if (err.message.includes('ECONNRESET') || err.message.includes('Connection lost')) {
      console.log(`${bot.username}: Connection lost, could not connect.`);
      process.exit(101);
    //  // You could implement reconnection logic here
    }
  });

//INTERRUPT TRIGGERS
bot.on("death", () => {
    bot_reset()
});

bot.on('entityGone', (entity) => {
    if (ctx.target && entity.id === ctx.target.id) {
        console.log("Target entity is gone (died or left)");
        bot_reset();
    }
});

bot.on('playerCollect', (collector, itemDrop) => {
    if (collector !== bot.entity) return
    ctx.state = "gearing"
    if (canDoAction("playerCollect")) {
        bot.armorManager.equipAll().catch(() => {})
    }
});

bot.on('chat', (username, message) => {
    if (username === bot.username) return;   

    if (!['ADMINBOT', 'Asdeo', 'Saier', 'Civwars'].some(allowedUser => 
        allowedUser.toLowerCase() === username.toLowerCase())) {
        return; // Silently ignore commands from non-whitelisted users
    }
    const parts = message.trim().split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);
    
    switch (command) {
    case 'gearup':
        ctx.state = "gearing";
        bot.chat("Recalling gearing up state and equipping armor.");
        survival.gear(bot, ctx);
        break;
    }
});

    bot.on('whisper', (username, message) => {
        if (username === bot.username) return;

        const parts = message.trim().split(/\s+/);
        const command = parts[0].toLowerCase();
        const args = parts.slice(1);

        switch (command) {
                case 'addflag':
                    // Usage: addflag x y z
                    if (args.length === 3) {
                        const x = parseFloat(args[0]);
                        const y = parseFloat(args[1]);
                        const z = parseFloat(args[2]);
                        if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
                            flagging.addFlag(bot, ctx, new Vec3(x, y, z));
                            if (ctx.flags.length === 1) flagging.moveToFlag(bot, ctx); // If first flag, start moving
                        } else {
                            bot.chat('Usage: addflag <x> <y> <z>');
                        }
                    } else {
                        bot.chat('Usage: addflag <x> <y> <z>');
                    }
                    break;
                case 'removeflag':
                    // Usage: removeflag x y z
                    if (args.length === 3) {
                        const x = parseFloat(args[0]);
                        const y = parseFloat(args[1]);
                        const z = parseFloat(args[2]);
                        if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
                            flagging.removeFlagByCoords(bot, ctx, x, y, z);
                            // After removal, move to next flag if available
                            if (ctx.flags.length > 0) flagging.moveToFlag(bot, ctx);
                        } else {
                            bot.chat('Usage: removeflag <x> <y> <z>');
                        }
                    } else {
                        bot.chat('Usage: removeflag <x> <y> <z>');
                    }
                    break;
                case 'goto':
                    // Usage: goto (moves to first flag in queue)
                    flagging.moveToFlag(bot, ctx);
                    break;

            case 'addally':
                if (args.length === 1) {
                    const allyNames = args[0].split(',').map(a => a.trim()).filter(a => a.length > 0);
                    let added = [];
                    let already = [];
                    for (const allyName of allyNames) {
                        if (!ctx.allies.some(ally => ally.toLowerCase() === allyName.toLowerCase())) {
                            ctx.allies.push(allyName);
                            added.push(allyName);
                        } else {
                            already.push(allyName);
                        }
                    }
                    if (added.length > 0) bot.chat(`Added allies: ${added.join(', ')}`);
                    if (already.length > 0) bot.chat(`Already allies: ${already.join(', ')}`);
                } else {
                    bot.chat('Usage: addally <username1,username2,...>');
                }
                break;
            case 'removeally':
                if (args.length === 1) {
                    const allyNames = args[0].split(',').map(a => a.trim()).filter(a => a.length > 0);
                    let removed = [];
                    let notfound = [];
                    for (const allyName of allyNames) {
                        const idx = ctx.allies.findIndex(ally => ally.toLowerCase() === allyName.toLowerCase());
                        if (idx !== -1) {
                            ctx.allies.splice(idx, 1);
                            removed.push(allyName);
                        } else {
                            notfound.push(allyName);
                        }
                    }
                    if (removed.length > 0) bot.chat(`Removed allies: ${removed.join(', ')}`);
                    if (notfound.length > 0) bot.chat(`Not in ally list: ${notfound.join(', ')}`);
                } else {
                    bot.chat('Usage: removeally <username1,username2,...>');
                }
                break;
            case 'config':
                // Usage: config <CPS> <REACH_MIN> <REACH_MAX> <LEFT_RIGHT_MIN_MS> <LEFT_RIGHT_MAX_MS> <MISS_CHANCE_MAX>
                if (args.length === 6) {
                    const newCPS = parseFloat(args[0]);
                    const newReachMin = parseFloat(args[1]);
                    const newReachMax = parseFloat(args[2]);
                    const newLeftRightMinMs = parseFloat(args[3]);
                    const newLeftRightMaxMs = parseFloat(args[4]);
                    const newMissChanceMax = parseFloat(args[5]);
                    
                    if (!isNaN(newCPS) && !isNaN(newReachMin) && !isNaN(newReachMax) && 
                        !isNaN(newLeftRightMinMs) && !isNaN(newLeftRightMaxMs) && !isNaN(newMissChanceMax)) {
                        
                        C.CPS = newCPS;
                        C.REACH_MIN = newReachMin;
                        C.REACH_MAX = newReachMax;
                        C.LEFT_RIGHT_MIN_MS = newLeftRightMinMs;
                        C.LEFT_RIGHT_MAX_MS = newLeftRightMaxMs;
                        C.MISS_CHANCE_MAX = newMissChanceMax;

                        ctx.cooldowns.set('attack',800/C.CPS)
                        bot.chat(`Configuration updated: CPS=${C.CPS}, REACH_MIN=${C.REACH_MIN}, REACH_MAX=${C.REACH_MAX}, LEFT_RIGHT_MIN_MS=${C.LEFT_RIGHT_MIN_MS}, LEFT_RIGHT_MAX_MS=${C.LEFT_RIGHT_MAX_MS}, MISS_CHANCE_MAX=${C.MISS_CHANCE_MAX}`);

                    } else {
                        bot.chat('Usage: config <CPS> <REACH_MIN> <REACH_MAX> <LEFT_RIGHT_MIN_MS> <LEFT_RIGHT_MAX_MS> <MISS_CHANCE_MAX> - All values must be numbers');
                    }
                } else {
                    bot.chat('Usage: config <CPS> <REACH_MIN> <REACH_MAX> <LEFT_RIGHT_MIN_MS> <LEFT_RIGHT_MAX_MS> <MISS_CHANCE_MAX>');
                }
                break;
            default:
                // Optionally handle unknown commands
                break;
        }
    });

/*bot state priority
1. equip armor [implemented] -> gearing system with cooldown
2. heal [implemented] -> check if health below 10, throw splash potions away from target with cooldown. if below 7, double pots
3. eat food [implemented] -> hunger ≤18 interrupts all functions except gearing and healing
4. return to ally [implemented] -> if too far from ally, return to them
5. attack target [implemented] -> basic combat with CPS limiting with progressive miss chance
6. move to target [implemented] -> pathfinding with sprint and kiting
7. get new target [implemented] -> nearest player within targeting range (excluding allies)
*/

bot.on('physicsTick', async () => {
    try {
        if (bot.pathfinder.isMining() || bot.pathfinder.isBuilding()) {
            console.log("im mining now")
            return;
        }
        
        // 0. reevaluate target
        if (ctx.state !== "EATING" && ctx.state !== "gearing" && canDoAction("targetCheck")) {
            combat.checkForClosestTarget(bot, ctx, C)
        }
        else {
            //console.log(bot.entity.effects)
            // 1. Equip armor
            if(ctx.state === "gearing"){
                survival.gear(bot, ctx)
            }
            
            // 2. buff
            else if ((!bot.entity.effects[4] && survival.hasPotion(bot, 36)) || 
                     (!bot.entity.effects[0] && survival.hasPotion(bot, 15)) || 
                     (!bot.entity.effects[11] && survival.hasPotion(bot, 12))) {
                survival.DrinkBuffPotions(bot, ctx);
            }
            // 3. Heal 
            else if(bot.health < S.HEALTH_THRESHOLD && survival.canHealSelf(bot)){
                survival.heal(bot, ctx, S)
            }
            // 4. Eat food 
            else if(bot.food <= S.HUNGER_THRESHOLD && survival.canEatFood(bot) || ctx.state == "EATING"){
                survival.eat(bot, ctx, S)
            }
            // 5. Return to ally
            else if(navigation.isTooFarFromAlly(bot, ctx)){
                navigation.returnToAlly(bot, ctx)
            }
            // 6. Attack target 
            else if(ctx.target && ctx.target.position && bot.entity.position.distanceTo(ctx.target.position) <= C.REACH_MAX && combat.hasLineOfSight(bot, ctx, ctx.target, C)){
                combat.attackTarget(bot, ctx, C)
            }
            // 7. Move to target 
            else if(ctx.target && ctx.target.position){
                navigation.moveToTarget(bot, ctx, bot_reset)
            }
        }
        //logging
        if (canDoAction("stateprint")){
            console.log(ctx.state)
        }
    } catch (error) {
        console.log('Physics tick error:', error.message)
        // Reset bot state on error to prevent getting stuck
        if (error.message.includes('PartialReadError') || error.message.includes('Read error')) {
            bot_reset()
        }
    }
});


function canDoAction(action) {
    const now = Date.now()
    const last = ctx.lastAction.get(action) || 0
    if ((now - last) > (ctx.cooldowns.get(action) || 0)) {
      ctx.lastAction.set(action, now)
      return true
    }
    return false
  }
  
function bot_reset(){
    bot.setControlState('sprint', false)
    bot.setControlState('forward', false)
    bot.setControlState('left', false)
    bot.setControlState('right', false)
    bot.setControlState('back', false)
    bot.setControlState('jump', false)
    ctx.target = null
    ctx.consecutiveMisses = 0 // Reset miss streak on bot reset
    ctx.strafeDirection = null // Reset strafe state
    bot.pathfinder.setGoal(null)
    //console.log("RESETTING")
    ctx.state = "IDLE"
    //attemptDrinkBuffPotions(); MARKED FOR REMOVAL - LET STATE MACHINE HANDLE IT 
}
