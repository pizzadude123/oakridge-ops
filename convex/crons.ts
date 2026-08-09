import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "Synchronize Microsoft Graph inboxes every two hours",
  { hours: 2 },
  internal.microsoftGraph.syncAllConnections,
  {},
);

export default crons;
