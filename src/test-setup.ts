import { randomBytes } from "node:crypto";

const id = randomBytes(4).toString("hex");
process.env.DB_PATH = `db/data.test.${id}.sqlite`;
