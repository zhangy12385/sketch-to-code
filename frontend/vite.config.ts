import path from "path";
import { fileURLToPath } from "url";
import { defineConfig, loadEnv } from "vite";
import checker from "vite-plugin-checker";
import react from "@vitejs/plugin-react";
import { createHtmlPlugin } from "vite-plugin-html";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// https://vitejs.dev/config/
export default ({ mode }) => {
  process.env = { ...process.env, ...loadEnv(mode, process.cwd()) };
  return defineConfig({
    base: "",
    plugins: [
      react(),
      checker({
        typescript: true,
      }),
      createHtmlPlugin({
        inject: {
          tags: process.env.VITE_IS_DEPLOYED
            ? [
                {
                  tag: "script",
                  injectTo: "head",
                  attrs: {
                    defer: "",
                    "data-domain": "screenshottocode.com",
                    src: "https://plausible.io/js/script.js",
                  },
                },
              ]
            : [],
        },
      }),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  });
};
