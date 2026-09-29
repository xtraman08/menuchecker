// Database access for the API. Usage:
//   const card = await withUserTx(userId, (tx) => dishes.getWithMatch(tx, id));
// Repositories rely on RLS for scoping: the current diner is whoever withUserTx set.
export { closePool, createPool, getPool, setPool } from './pool.js';
export { withUserTx, type Tx } from './tx.js';
export { createDb, type Db } from './createDb.js';
export type * from './types.js';
export * as users from './repositories/users.js';
export * as restaurants from './repositories/restaurants.js';
export * as menus from './repositories/menus.js';
export * as dishes from './repositories/dishes.js';
export * as feedback from './repositories/feedback.js';
export * as tasteProfiles from './repositories/tasteProfiles.js';
export * as matches from './repositories/matches.js';
