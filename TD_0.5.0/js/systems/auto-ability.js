// ---------------------------------------------------------------------------
// AutoAbility -- the ON/OFF switch that fires an ability for you.
//
// Added 2026-07-30, at the owner's request: "add an auto ability button on every
// tower with an ability that can be turned on and off."
//
// An ability is a panel button the player presses when they judge the moment is
// right. That is fine for one tower and unmanageable for eight, so every ability
// that CAN run itself gets a switch: flip it on and the tower fires that ability
// the instant it comes off cooldown, forever, until the switch goes off again.
//
// THE SWITCH IS OFF BY DEFAULT, and that is the owner's instruction, not a
// default chosen here. An ability with a cost is a decision, and the game must
// not start making it on the player's behalf. The corollary is the other half of
// what he said -- "the decision is up to the user" -- so there is deliberately
// NO safety rule anywhere in this file. In particular the Arcane Sniper's nuke
// permanently lowers its own maximum health, and left on it will eventually
// destroy the tower. That is allowed. A guard that quietly declined to fire the
// ability the player switched on would be the game overriding the choice this
// switch exists to give them, and it would do it invisibly.
//
// WHAT MAY HAVE A SWITCH. An ability qualifies only if firing it needs nothing
// from the player but the decision to fire. The Arcane Sniper's cone RE-AIM does
// not qualify and deliberately has no switch: it arms a mode and then takes a
// direction from the player's next click on the map, so "automatic re-aim" would
// have to invent a direction, and inventing one is a balance decision disguised
// as a convenience. The Siphon's panel readout does not qualify either --
// it is `readonly`, a passive reporting itself, not an ability at all.
//
// HOW IT IS WIRED. Three lines per tower, and no new machinery in the towers:
//
//   panelActions()   AutoAbility.attach(action, this, abilityId)
//                     -- hangs a `toggle` on the ability's own button
//   performAction()   var auto = AutoAbility.handle(this, id);
//                     if (auto) return auto;
//                     -- catches the "auto:<id>" click before anything else
//   update()          if (AutoAbility.isOn(this, id) && ready) fire()
//
// The switch lives on the TOWER (`tower.autoAbilities`), like every other piece
// of per-tower state, so it dies with the tower and `restartGame()` clears it by
// clearing `towers`. It is deliberately NOT saved: `MetaProgress` persists coins,
// owned towers and the loadout, and a switch on a tower that no longer exists is
// not a thing to remember.
//
// The button is drawn as a small pill INSIDE the ability's own button rather than
// as a row of its own. That is a layout constraint as much as a design one -- the
// Rifleman's panel at full path B is 564 px of a 602 px budget, so a
// fourth full-width action row did not fit -- but it is also where the control
// belongs: this switch is an attribute of one ability, not a peer of it.
// ---------------------------------------------------------------------------

var AutoAbility = {

  // Action ids are namespaced so a tower's performAction can tell "the player
  // pressed the ability" from "the player flipped its switch" without either
  // side inventing a convention. `handle` below is the only thing that parses
  // one, so the prefix is an implementation detail of this file.
  PREFIX: "auto:",

  actionIdFor: function (abilityId) {
    return AutoAbility.PREFIX + abilityId;
  },

  // The ability id inside an auto action id, or null if this is not one.
  abilityIdFrom: function (actionId) {
    if (typeof actionId !== "string") return null;
    if (actionId.indexOf(AutoAbility.PREFIX) !== 0) return null;
    return actionId.slice(AutoAbility.PREFIX.length);
  },

  // Missing map reads as every switch off, so a tower that never calls anything
  // in this file behaves exactly as it did before it existed.
  isOn: function (tower, abilityId) {
    return !!(tower && tower.autoAbilities && tower.autoAbilities[abilityId]);
  },

  set: function (tower, abilityId, on) {
    if (!tower.autoAbilities) tower.autoAbilities = {};
    tower.autoAbilities[abilityId] = !!on;
    return tower.autoAbilities[abilityId];
  },

  toggle: function (tower, abilityId) {
    return AutoAbility.set(tower, abilityId, !AutoAbility.isOn(tower, abilityId));
  },

  // Hang the switch on an ability's button. `label` is what the pill says when
  // there is room for a word; the state is drawn from `on`.
  //
  // Returns the same action object, so a caller can wrap an action literal in
  // this call and keep one expression.
  attach: function (action, tower, abilityId, label) {
    action.toggle = {
      id: AutoAbility.actionIdFor(abilityId),
      abilityId: abilityId,
      label: label || "AUTO",
      on: AutoAbility.isOn(tower, abilityId),
      tooltip: AutoAbility.card(tower, abilityId, action.label)
    };
    return action;
  },

  // The hover card for the switch itself. It says what the switch does and what
  // it costs to leave on -- the second half being the whole reason the default
  // is off.
  card: function (tower, abilityId, abilityLabel) {
    var on = AutoAbility.isOn(tower, abilityId);
    var name = abilityLabel || "this ability";
    return UpgradeEffects.card({
      title: "Auto  ·  " + name,
      subtitle: on ? "ON — click to turn off" : "OFF — click to turn on",
      changes: [
        { label: "State", from: "", to: on ? "on" : "off", delta: "" }
      ],
      abilities: [{
        name: on ? "Firing by itself" : "Fires by itself",
        text: "While this is on, the tower uses " + name.toLowerCase() +
          " the moment it comes off cooldown, without being asked. Everything the " +
          "ability costs is still paid every time it fires."
      }],
      note: "Off by default. Turning it on hands the timing to the tower — " +
        "including the cost, if the ability has one."
    });
  },

  // The performAction half. Returns a message if `actionId` was this tower's
  // auto switch (so the caller can return it straight back), or null if it was
  // not -- in which case the caller carries on to its own actions.
  //
  // It does NOT check whether the ability is ready. Flipping the switch is
  // always legal, and has to be: an ability on a 40 s cooldown would otherwise
  // have its switch dead for 40 s at a time, which is exactly when a player
  // reaches for it.
  handle: function (tower, actionId) {
    var abilityId = AutoAbility.abilityIdFrom(actionId);
    if (abilityId === null) return null;

    var now = AutoAbility.toggle(tower, abilityId);
    return (tower.name || "tower") + " → auto " + abilityId + " " + (now ? "on" : "off");
  }
};
