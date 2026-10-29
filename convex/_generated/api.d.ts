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
import type * as http from "../http.js";
import type * as lib_guards from "../lib/guards.js";
import type * as lib_validators from "../lib/validators.js";
import type * as seed from "../seed.js";
import type * as seedData from "../seedData.js";
import type * as ticketing_chaos from "../ticketing/chaos.js";
import type * as ticketing_queries from "../ticketing/queries.js";
import type * as ticketing_reads from "../ticketing/reads.js";
import type * as ticketing_service from "../ticketing/service.js";
import type * as ticketing_similarity from "../ticketing/similarity.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  http: typeof http;
  "lib/guards": typeof lib_guards;
  "lib/validators": typeof lib_validators;
  seed: typeof seed;
  seedData: typeof seedData;
  "ticketing/chaos": typeof ticketing_chaos;
  "ticketing/queries": typeof ticketing_queries;
  "ticketing/reads": typeof ticketing_reads;
  "ticketing/service": typeof ticketing_service;
  "ticketing/similarity": typeof ticketing_similarity;
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
