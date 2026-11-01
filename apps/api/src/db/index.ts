import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { config } from "../config";
import * as schema from "./schema/index";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.db.url,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export const db = drizzle(pool, { schema });
export type Database = typeof db;
