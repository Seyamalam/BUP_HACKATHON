import { type Database, createDb } from "@BUP_HACKATHON/db";

import { ENV } from "./env.server";

export function getDb(): Database {
  return createDb(ENV);
}
