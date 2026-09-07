import * as esbuild from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join } from "node:path";

/* Load .env (KEY=value lines) without a dependency. Real env vars win. */
function loadEnv() {
  const out = {};
  try {
    for (const line of readFileSync(".env", "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* no .env — fine */
  }
  return { ...out, ...process.env };
}
const env = loadEnv();

const OUT_DIR = "dist";
const OUT_FILE = join(OUT_DIR, "index.html");
const watch = process.argv.includes("--watch") || process.argv.includes("--serve");
const serve = process.argv.includes("--serve");
const PORT = 8000;

mkdirSync(OUT_DIR, { recursive: true });

/* Bundle React + the app into one script, then inline it into the shell so the
   output is a single file with no external requests. */
const inline = {
  name: "inline-html",
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length) return;
      const js = result.outputFiles.find((f) => f.path.endsWith(".js")).text;
      const shell = readFileSync("src/shell.html", "utf8");
      writeFileSync(OUT_FILE, shell.replace("__BUNDLE__", () => js));
      const kb = Math.round(js.length / 1024);
      console.log(`built ${OUT_FILE} (${kb} KB) ${new Date().toLocaleTimeString()}`);
    });
  },
};

const options = {
  entryPoints: ["src/app.jsx"],
  bundle: true,
  minify: !watch,
  format: "iife",
  target: ["safari15"],
  loader: { ".jsx": "jsx" },
  define: {
    "process.env.NODE_ENV": watch ? '"development"' : '"production"',
    "process.env.SUPABASE_URL": JSON.stringify(env.SUPABASE_URL || ""),
    "process.env.SUPABASE_ANON_KEY": JSON.stringify(env.SUPABASE_ANON_KEY || ""),
  },
  outfile: "dist/bundle.js",
  write: false,
  plugins: [inline],
  logLevel: "info",
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  if (serve) {
    const types = { ".html": "text/html", ".json": "application/json" };
    createServer((req, res) => {
      const path = req.url === "/" ? "/index.html" : req.url.split("?")[0];
      try {
        const body = readFileSync(join(OUT_DIR, path));
        res.writeHead(200, { "Content-Type": types[extname(path)] || "text/plain" });
        res.end(body);
      } catch {
        res.writeHead(404).end("not found");
      }
    }).listen(PORT, () =>
      console.log(
        `serving http://localhost:${PORT} — open this on your phone via your LAN IP to test localStorage`
      )
    );
  }
} else {
  await esbuild.build(options);
}
