import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './data-source.options';

/** Entry point for the TypeORM CLI (`yarn migration:run`, etc.). */
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL must be set');

export default new DataSource(buildDataSourceOptions(url));
