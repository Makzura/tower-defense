// ---------------------------------------------------------------------------
// MOVED in v0.3.5 -> js/systems/range-filter.js
//
// This file used to define a global called `Targeting` that answered "is this
// enemy within reach" (range, deadzone, cone arc, camo/flying visibility).
//
// The v0.3.5 merge brought in a module ALSO called `Targeting` -- js/targeting.js
// -- answering the other half of the question: given several reachable enemies,
// which one do I shoot (first / last / weakest / strongest / fastest /
// nearest). Two globals, one name.
//
// The reach test was renamed `RangeFilter`, which is what it actually does.
// Nothing loads this file any more. It is empty rather than deleted only
// because it could not be removed from the machine it was written on; delete
// it whenever convenient.
// ---------------------------------------------------------------------------
