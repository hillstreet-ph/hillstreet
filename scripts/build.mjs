import { build } from 'esbuild';
import { readFile, access } from 'node:fs/promises';
await build({ entryPoints: ['src/website.js'], bundle: true, minify: true, format: 'iife', target: ['es2022'], outfile: 'site/assets/website.js', sourcemap: false });
for (const path of ['site/index.html','site/assets/index-D4yBHoPu.js','site/assets/index-DwciAvas.css','site/images/business-meeting-proof.mp4']) await access(path);
const html = await readFile('site/index.html', 'utf8');
if (!html.includes('/assets/website.js')) throw new Error('Website integration entry is missing');
console.log('HillStreet website build passed. Deploy site/ with root functions/.');
