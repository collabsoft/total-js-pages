#!/usr/bin/env node

require('total4');

var tasks = [];
var path = '--bundles--';

function buildplugin(name, callback) {
	console.log('| |--', name + '.bundle');
	BACKUP(path + '/' + name + '.bundle', PATH.root(), callback, function(path, isdir) {
		return path === '/' || path === '/plugins/' || (path.indexOf('plugins/' + name) !== -1);
	});
}

console.log('|-- Total.js bundle compiler');
console.time('|-- Compilation');

console.log('| |--', 'app.bundle');
BACKUP(path + '/app.bundle', PATH.root(), function() {
	F.Fs.readdir(PATH.root('plugins'), function(err, response) {
		response.wait(function(key, next) {
			buildplugin(key, next);
		}, function() {
			console.timeEnd('|-- Compilation');
		});
	});
}, function(path, isdir) {
	var p = path.split('/').trim();
	var dir = { controllers: true, definitions: true, modules: true, public: true, schemas: true, views: true };
	return !p[0] || dir[p[0]];
});