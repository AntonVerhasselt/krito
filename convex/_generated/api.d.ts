/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as access from "../access.js";
import type * as analyses from "../analyses.js";
import type * as analysisAdmin from "../analysisAdmin.js";
import type * as analysisValidators from "../analysisValidators.js";
import type * as analytics from "../analytics.js";
import type * as catalogImport from "../catalogImport.js";
import type * as catalogValidators from "../catalogValidators.js";
import type * as crons from "../crons.js";
import type * as emailValidators from "../emailValidators.js";
import type * as emails from "../emails.js";
import type * as files from "../files.js";
import type * as goals from "../goals.js";
import type * as health from "../health.js";
import type * as http from "../http.js";
import type * as migrations from "../migrations.js";
import type * as node_convert from "../node/convert.js";
import type * as node_email from "../node/email.js";
import type * as node_openai from "../node/openai.js";
import type * as node_pdf from "../node/pdf.js";
import type * as node_report from "../node/report.js";
import type * as node_storage from "../node/storage.js";
import type * as node_storageSmoke from "../node/storageSmoke.js";
import type * as reminders from "../reminders.js";
import type * as reports from "../reports.js";
import type * as testHarness from "../testHarness.js";
import type * as users from "../users.js";
import type * as workflow from "../workflow.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  access: typeof access;
  analyses: typeof analyses;
  analysisAdmin: typeof analysisAdmin;
  analysisValidators: typeof analysisValidators;
  analytics: typeof analytics;
  catalogImport: typeof catalogImport;
  catalogValidators: typeof catalogValidators;
  crons: typeof crons;
  emailValidators: typeof emailValidators;
  emails: typeof emails;
  files: typeof files;
  goals: typeof goals;
  health: typeof health;
  http: typeof http;
  migrations: typeof migrations;
  "node/convert": typeof node_convert;
  "node/email": typeof node_email;
  "node/openai": typeof node_openai;
  "node/pdf": typeof node_pdf;
  "node/report": typeof node_report;
  "node/storage": typeof node_storage;
  "node/storageSmoke": typeof node_storageSmoke;
  reminders: typeof reminders;
  reports: typeof reports;
  testHarness: typeof testHarness;
  users: typeof users;
  workflow: typeof workflow;
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

export declare const components: {
  posthog: import("@posthog/convex/_generated/component.js").ComponentApi<"posthog">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
