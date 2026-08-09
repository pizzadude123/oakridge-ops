/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as contacts from "../contacts.js";
import type * as crons from "../crons.js";
import type * as googleData from "../googleData.js";
import type * as googleGmail from "../googleGmail.js";
import type * as googleHttp from "../googleHttp.js";
import type * as graphData from "../graphData.js";
import type * as graphHttp from "../graphHttp.js";
import type * as http from "../http.js";
import type * as imports from "../imports.js";
import type * as lib_gmailMessage from "../lib/gmailMessage.js";
import type * as lib_graphCrypto from "../lib/graphCrypto.js";
import type * as lib_graphRouting from "../lib/graphRouting.js";
import type * as lib_mailContent from "../lib/mailContent.js";
import type * as lib_mailDelivery from "../lib/mailDelivery.js";
import type * as lib_requireUser from "../lib/requireUser.js";
import type * as lib_workbookMonitor from "../lib/workbookMonitor.js";
import type * as messages from "../messages.js";
import type * as microsoftGraph from "../microsoftGraph.js";
import type * as microsoftMail from "../microsoftMail.js";
import type * as microsoftWorkbook from "../microsoftWorkbook.js";
import type * as operationsData from "../operationsData.js";
import type * as routingRules from "../routingRules.js";
import type * as workbookData from "../workbookData.js";
import type * as workspace from "../workspace.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  contacts: typeof contacts;
  crons: typeof crons;
  googleData: typeof googleData;
  googleGmail: typeof googleGmail;
  googleHttp: typeof googleHttp;
  graphData: typeof graphData;
  graphHttp: typeof graphHttp;
  http: typeof http;
  imports: typeof imports;
  "lib/gmailMessage": typeof lib_gmailMessage;
  "lib/graphCrypto": typeof lib_graphCrypto;
  "lib/graphRouting": typeof lib_graphRouting;
  "lib/mailContent": typeof lib_mailContent;
  "lib/mailDelivery": typeof lib_mailDelivery;
  "lib/requireUser": typeof lib_requireUser;
  "lib/workbookMonitor": typeof lib_workbookMonitor;
  messages: typeof messages;
  microsoftGraph: typeof microsoftGraph;
  microsoftMail: typeof microsoftMail;
  microsoftWorkbook: typeof microsoftWorkbook;
  operationsData: typeof operationsData;
  routingRules: typeof routingRules;
  workbookData: typeof workbookData;
  workspace: typeof workspace;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
