// Writes dist/sw.js after each production build, with the list of built files to precache.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEMPLATE = fileURLToPath(new URL('./sw-template.js', import.meta.url));
// Precache the shell, not every photo (those are cached as they are viewed).
const SKIP = [/^uploads\//, /^screenshots\//, /^brand\/Screenshot/, /^sw\.js$/, /^_redirects$/, /\.map$/, /CREDITS\.md$/];

function walk(dir, root = dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full, root) : [relative(root, full).split(sep).join('/')];
  });
}

export default function serviceWorker() {
  let outDir = 'dist';
  return {
    name: 'sunucampus-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const files = walk(outDir).filter((f) => !SKIP.some((re) => re.test(f)));
      const urls = files.map((f) => (f === 'index.html' ? '/index.html' : `/${f}`));
      const sw = readFileSync(TEMPLATE, 'utf8')
        .replace('__VERSION__', Date.now().toString(36))
        .replace('__PRECACHE_URLS__', JSON.stringify(urls, null, 2));
      writeFileSync(join(outDir, 'sw.js'), sw);
    },
  };
}
