import "dotenv/config";
import { runMigrations } from "../db/migrate-lib";

const url = process.env.DATABASE_OWNER_URL;
if (!url) {
  console.error("Defina DATABASE_OWNER_URL no .env (papel pos_owner).");
  process.exit(1);
}

runMigrations(url)
  .then(() => console.log("Migrations em dia."))
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
