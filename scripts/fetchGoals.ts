import { parseArgs } from "node:util";
import { fetchCatalog } from "./catalog/fetch";
const { values } = parseArgs({ options: { version: { type: "string" } } });
await fetchCatalog(values.version);
