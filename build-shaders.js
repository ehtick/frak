/**
 * Builds FRAK bundled shaders
 * run: node build-shaders
 */

const fs = require('fs');
const path = require('path');
const util = require('util');
const readdir = util.promisify(fs.readdir);
const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);

const OUTPUT_PATH = './src/rendering/shaders/BuiltInShaders.js';
const BUNDLE_RELATIVE_PATH = './assets';
const EXTENSION_FILTER = ['.vert', '.frag'];

let profiles = {
	'default': './assets/shaders/default',
	'webgl2': './assets/shaders/webgl2',
};

async function main() {
	let output = {};

	for (let profile in profiles) {
		console.log('Bundling profile: %s', profile);
		output[profile] = {};
		let shadersPath = profiles[profile];
		let bundleBasePath = path.relative(BUNDLE_RELATIVE_PATH, shadersPath);

		try {
			let files = await readdir(shadersPath);
			for (let file of files) {
				if (EXTENSION_FILTER.indexOf(path.extname(file)) == -1)
					continue;
				let relativePath = path.join(shadersPath, file);
				let data = await readFile(path.join(shadersPath, file));
				output[profile][path.join(bundleBasePath, file)] = data.toString();
			}
		}
		catch (err) {
			console.log(err);
		}
	}

	let js = `// Generated at ${new Date()}\nvar BuiltInShaders = ${JSON.stringify(output, null, '\t')};`;
	await writeFile(OUTPUT_PATH, js);
	console.log('Output written to %s', OUTPUT_PATH);
}

main();