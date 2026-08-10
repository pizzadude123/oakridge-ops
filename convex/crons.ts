import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "Synchronize Microsoft Graph inboxes every two hours",
  { hours: 2 },
  internal.microsoftGraph.syncAllConnections,
  {},
);

crons.interval(
  "Check connected Excel workbooks every five minutes",
  { minutes: 5 },
  internal.microsoftWorkbook.syncAllWorkbooks,
  {},
);

crons.interval(
  "Reconcile interrupted provider email deliveries every five minutes",
  { minutes: 5 },
  internal.messages.expireStaleProviderDeliveries,
  {},
);

crons.interval(
  "Remove abandoned email images every hour",
  { hours: 1 },
  internal.emailAssets.pruneExpired,
  {},
);

crons.interval(
  "Remove abandoned crisis attachments every hour",
  { hours: 1 },
  internal.crisisAttachments.pruneExpired,
  {},
);

export default crons;
