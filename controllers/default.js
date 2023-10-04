const REG_META = /<\/head>/;
const REG_UI = /@\{ui\}/i;
const REG_YEAR = /@\{year\}/i;

exports.install = function() {
	ROUTE('+GET /admin/*', admin);
	ROUTE('GET  /*', render);
};

function admin() {

	var self = this;
	var plugins = [];
	var hostname = self.hostname();

	if (PREF.url !== hostname)
		PREF.set('url', hostname);

	for (var key in F.plugins) {
		var item = F.plugins[key];
		if (!item.visible || item.visible(self.user)) {
			var obj = {};
			obj.id = item.id;
			obj.position = item.position;
			obj.name = TRANSLATOR(self.user.language || '', item.name);
			obj.icon = item.icon;
			obj.import = item.import;
			obj.routes = item.routes;
			obj.hidden = item.hidden;
			plugins.push(obj);
		}
	}

	self.view('admin', plugins);
}

function compile_page(id, widgets, callback) {
	MAIN.db.fs.readbuffer(id, function(err, buffer) {
		if (err) {
			callback(err);
		} else {

			var html = buffer ? buffer.toString('utf8') : '';
			var value = {};
			value.id = id;
			value.html = html;
			value.widgets = widgets;

			TRANSFORM('page', value, function(err, value) {
				MAIN.views[id] = CMSCOMPILER(value.html.replace(REG_UI, REPO.ui).replace(REG_YEAR, NOW.getFullYear() + ''), widgets);
				callback(null, MAIN.views[id]);
			});

		}
	});
}

function compile_layout(id, widgets, callback) {
	MAIN.db.fs.readbuffer(id, function(err, buffer) {
		if (err) {
			callback(err);
		} else {

			var html = buffer ? buffer.toString('utf8') : '';
			var value = {};

			value.id = id;
			value.html = html;
			value.widgets = widgets;

			TRANSFORM('layout', value, function(err, value) {
				MAIN.views[id] = CMSCOMPILER(value.html.replace(REG_UI, REPO.ui).replace(REG_YEAR, NOW.getFullYear() + ''), widgets).importcss().importjs();
				callback(null, MAIN.views[id]);
			});

		}
	});
}

function navigation(id) {

	var nav = this.nav[id] || { children: EMPTYARRAY };

	if (nav.links) {
		for (var m of nav.links)
			m.selected = false;
	}

	nav.current = nav.links ? nav.links.findItem('url', this.url) : null;
	var parent = nav.current;

	while (parent) {
		parent.selected = true;
		parent = parent.parent;
	}

	nav.url = this.url;
	nav.page = this.page;

	return nav;
}

function render() {

	var self = this;
	var db = MAIN.db;
	var url = self.url;
	var page = null;

	if (!db.ready) {
		self.throw404();
		return;
	}

	for (var item of db.pages) {
		if (item.url === url && !item.disabled) {
			page = item;
			break;
		}
	}

	if (!page && url === '/') {
		self.redirect('/admin/');
		return;
	}

	if (page) {

		if (!db.refs)
			db.refs = {};

		if (!db.vars)
			db.vars = {};

		var opt = {};
		var cache = MAIN.cache.pages;
		var key = page.id;

		if (!cache[key])
			cache[key] = {};

		opt.inlinecache = cache[key];
		opt.controller = self;
		opt.vars = db.vars;
		opt.refs = db.refs;
		opt.widgets = MAIN.cache.widgets || EMPTYARRAY;
		opt.nav = MAIN.cache.nav;
		opt.url = url;
		opt.user = self.user;
		opt.ua = self.req.headers['user-agent'];

		if (opt.ua)
			opt.ua = opt.ua.parseUA(true);
		else
			opt.ua = EMPTYOBJECT;

		opt.mobile = self.mobile;
		opt.robot = self.robot;
		opt.breadcrumb = FUNC.breadcrumb(url);
		opt.page = page;
		opt.navigation = navigation;

		opt.callback = function(err, response) {
			TRANSFORM('render', response, function(err, response) {
				if (response.css && response.css.length)
					response.html = response.html.replace(/<\/style>/, '\n' + U.minify_css(response.css.join('')) + '</style>');
				self.content(response.html, 'text/html');
			}, self);
		};

		var title = page.title || page.name;
		var meta = '';

		if (title)
			meta += '<title>' + title.encode() + (opt.url !== '/' ? (' - ' + CONF.name) : '') + '</title>';

		if (page.description)
			meta += '<meta name="description" content="' + page.description.encode() + '" />';

		if (page.keywords)
			meta += '<meta name="keywords" content="' + page.keywords.encode() + '" />';

		meta += '<scri' + 'pt src="/visitors.js"></scr' + 'ipt>';

		var cmspage = MAIN.views[page.id];
		var cmslayout = page.layoutid ? MAIN.views[page.layoutid] : 1;

		if (cmslayout && cmslayout.scripts && cmslayout.scripts.length) {
			for (var m of cmslayout.scripts)
				meta += '<scri' + 'pt src="' + m + '"></scr' + 'ipt>';
		}

		if (cmspage && cmslayout) {
			opt.cache = cmspage.cache;
			cmspage.render(opt, cmslayout === 1 ? null : cmslayout, function(err, response) {
				if (err)
					self.throw404();
				else
					self.content(response.replace(REG_META, meta), 'text/html');
			});
		} else if (cmspage && !cmslayout) {
			compile_layout(page.layoutid, opt.widgets, function(err, cmslayout) {

				if (err) {
					self.throw404();
					return;
				}

				cmspage.render(opt, cmslayout === 1 ? null : cmslayout, function(err, response) {
					if (err)
						self.throw404();
					else
						self.content(response.replace(REG_META, meta), 'text/html');
				});
			});
		} else if (!cmspage && cmslayout) {
			compile_page(page.id, opt.widgets, function(err, cmspage) {

				if (err) {
					self.throw404();
					return;
				}

				opt.cache = cmspage.cache;
				cmspage.render(opt, cmslayout === 1 ? null : cmslayout, function(err, response) {
					if (err)
						self.throw404();
					else
						self.content(response.replace(REG_META, meta), 'text/html');
				});
			});
		} else {
			compile_page(page.id, opt.widgets, function(err, cmspage) {

				if (err) {
					self.throw404();
					return;
				}

				compile_layout(page.layoutid, opt.widgets, function(err, cmslayout) {

					if (err) {
						self.throw404();
						return;
					}

					opt.cache = cmspage.cache;
					cmspage.render(opt, cmslayout === 1 ? null : cmslayout, function(err, response) {
						if (err)
							self.throw404();
						else
							self.content(response.replace(REG_META, meta), 'text/html');
					});
				});
			});
		}
	} else
		self.throw404();
}