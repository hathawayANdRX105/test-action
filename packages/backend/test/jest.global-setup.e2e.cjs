module.exports = async function globalSetup() {
	const entry = await import('../built-test/entry.js');
	return entry.default();
};
