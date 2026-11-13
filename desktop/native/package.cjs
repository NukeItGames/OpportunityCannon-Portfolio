// Keep local builder diagnostics (which include machine paths) out of releases.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const args = process.argv.slice(2);
const override = args.find(a => a.startsWith('--config.directories.output='));
const output = path.resolve(override ? override.split('=').slice(1).join('=') : require('../package.json').build.directories.output);
const root = path.resolve('.');
if (!output.startsWith(root + path.sep)) throw Error('Release output must stay inside this repository');
if (!process.env.npm_execpath) throw Error('Run packaging through npm run package');
cp.execFileSync(process.execPath, [process.env.npm_execpath, 'run', 'build'], {stdio:'inherit'});
cp.execFileSync(process.execPath, [require.resolve('electron-builder/cli.js'), '--win', 'nsis', '--x64', ...args], {stdio:'inherit'});
for (const name of ['builder-debug.yml','builder-effective-config.yaml']) {
  const file = path.join(output,name);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}
console.log('Release contains no local builder diagnostics');
