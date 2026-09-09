import { registerExperimentalWorlds } from './entry.js';

registerExperimentalWorlds(window.HordeExperimentalWorldsHost)
    .then(runtime => { window.HordeExperimentalWorlds = runtime; })
    .catch(error => { console.error('Experimental Worlds registration failed:', error); });
