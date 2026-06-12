import { startRealtimePoller } from './src/workers/gtfs-rt-poller.js';
startRealtimePoller();

import './dist/server/entry.mjs'; // then start the Astro standalone server
