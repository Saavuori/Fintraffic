// MapLibre 6 ships its worker as a separate ESM file and resolves it at runtime
// from `import.meta.url`. The bundler never sees that reference, so the worker
// is left out of `dist/` and the request 404s in production — the map still
// draws its background, but every source stays empty. Handing MapLibre a URL
// Vite has emitted itself keeps the worker in the build.
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

setWorkerUrl(workerUrl);
