exports.createLogger = (name, logFun = console.log) => {
	return (...args) => logFun(new Date().toISOString(), `[${name}]`, ...args);
}