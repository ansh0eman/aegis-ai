import { registerHooks } from "node:module";
import { resolve } from "node:path";

const nextServerOnlyStub = resolve(
  "node_modules/next/dist/compiled/server-only/empty.js",
);

// Next.js aliases this marker during server builds. The isolated Node tests
// apply the same empty server-side marker without loading a client bundle.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return nextResolve(nextServerOnlyStub, context);
    }
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (
        (specifier.startsWith("./") || specifier.startsWith("../")) &&
        !/\.[a-z]+$/i.test(specifier)
      ) {
        return nextResolve(new URL(`${specifier}.ts`, context.parentURL).href, context);
      }
      throw error;
    }
  },
});
