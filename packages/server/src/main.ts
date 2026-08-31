// Placeholder container entrypoint for M0: proves the Docker image builds
// and runs by initializing and closing a TypeORM DataSource, without
// getting ahead of the real Express server built starting in M2 (see
// milestones/M2-webdav-core/02-express-server-bootstrap).
import { createDataSource } from '@davnode/core';

const dataSource = createDataSource();
await dataSource.initialize();
console.log(`DataSource initialized (type: ${dataSource.options.type}).`);

await dataSource.destroy();
console.log('DataSource closed. Placeholder entrypoint exiting.');
