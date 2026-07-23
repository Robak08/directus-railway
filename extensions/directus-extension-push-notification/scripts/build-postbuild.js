#!/usr/bin/env node
import { copyFileSync } from "node:fs";
import * as esbuild from "esbuild";

copyFileSync("directus-state.json", "dist/directus-state.json");

await esbuild.build({
  entryPoints: ["src/push-notification/service-worker.ts"],
  outfile: "dist/service-worker.js",
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2020",
});
