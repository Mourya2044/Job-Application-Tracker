import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "path";
import { fileURLToPath } from "url";
import { db, pool } from "./index";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations() {
  console.log("Running PostgreSQL schema migrations...");
  const migrationsFolder = path.resolve(__dirname, "./migrations");
  try {
    await migrate(db, { migrationsFolder });
    console.log("PostgreSQL schema migrations applied successfully.");
  } catch (err) {
    console.error("Migration error:", err);
    throw err;
  }
}

// Allow direct execution: `node dist/db/migrate.js` or `tsx src/db/migrate.ts`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => pool.end())
    .catch(async (e) => {
      console.error(e);
      await pool.end();
      process.exit(1);
    });
}

