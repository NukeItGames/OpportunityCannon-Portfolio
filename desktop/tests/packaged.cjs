if (!process.argv[2]) throw Error('Usage: node tests/packaged.cjs <installed-executable>');
require('node:child_process').execFileSync(process.execPath, ['tests/onboarding.cjs',process.argv[2]], {stdio:'inherit'});
