import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const id = randomBytes(4).toString("hex");
const dbPath = `db/data.test.${id}.sqlite`;
mkdirSync(dirname(dbPath), { recursive: true });
process.env.DB_PATH = dbPath;
