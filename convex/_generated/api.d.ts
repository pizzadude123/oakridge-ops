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
import type * as http from "../http.js";
import type * as imports from "../imports.js";
import type * as lib_requireUser from "../lib/requireUser.js";
import type * as messages from "../messages.js";
import type * as operationsData from "../operationsData.js";
import type * as routingRules from "../routingRules.js";
import type * as workspace from "../workspace.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  contacts: typeof contacts;
  http: typeof http;
  imports: typeof imports;
  "lib/requireUser": typeof lib_requireUser;
  messages: typeof messages;
  operationsData: typeof operationsData;
  routingRules: typeof routingRules;
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
