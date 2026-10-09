import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
const crons = cronJobs();
crons.interval(
  "Resume interrupted work",
  { minutes: 1 },
  internal.workflow.recover,
);
crons.interval(
  "Remove abandoned drafts",
  { hours: 1 },
  internal.workflow.cleanDrafts,
);
export default crons;
