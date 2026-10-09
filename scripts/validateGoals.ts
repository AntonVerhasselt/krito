import { parseArgs } from "node:util";
import { validateCatalog } from "./catalog/validate";
const { values } = parseArgs({
  options: { file: { type: "string", default: "data/opstap/1.3/goals.json" } },
});
await validateCatalog(values.file!);
