/**
 * Composition root for the Stream-Deck-facing singletons: wires the
 * SDK-decoupled StateManager to the live ReaperClient. Actions should
 * import `stateManager` from here, not construct their own.
 */

import { connectionManager } from "./reaper/connection-manager.js";
import { StateManager } from "./reaper/state-manager.js";

export const stateManager = new StateManager((queries) => connectionManager.current.query(queries));
