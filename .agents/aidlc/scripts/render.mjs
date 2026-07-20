#!/usr/bin/env node
import { renderViews, rootOption } from "./lib/runtime.mjs";

renderViews(rootOption(process.argv.slice(2)));
console.log("Rendered task review artifacts from canonical JSON state.");
