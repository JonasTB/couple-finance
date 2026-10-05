import { loadRootEnvFile } from './load-env-file';

// Side-effect import: must run before AppModule is imported, because
// ConfigModule.forRoot validates process.env while the module graph is being loaded.
loadRootEnvFile();
