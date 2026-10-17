/* dc-lite: a small standalone renderer for compiled .dc templates (React 18). */
(function () {
  'use strict';
  var R = window.React, h = R.createElement, Frag = R.Fragment;
  var registry = {};

  var LINKS = { 'Start.dc.html': '/', 'Main.dc.html': '/desktop', 'Tablet.dc.html': '/tablet', 'Mobile.dc.html': '/mobile' };
  var ATTR = {
    'class': 'className', 'for': 'htmlFor', tabindex: 'tabIndex', colspan: 'colSpan', rowspan: 'rowSpan',
    readonly: 'readOnly', maxlength: 'maxLength', minlength: 'minLength', autoplay: 'autoPlay',
    playsinline: 'playsInline', autofocus: 'autoFocus', autocomplete: 'autoComplete', crossorigin: 'crossOrigin',
    enterkeyhint: 'enterKeyHint', inputmode: 'inputMode', spellcheck: 'spellCheck', srcset: 'srcSet'
  };
  var BOOL = { disabled: 1, checked: 1, autoPlay: 1, loop: 1, muted: 1, playsInline: 1, readOnly: 1, required: 1, multiple: 1, selected: 1, hidden: 1, open: 1, autoFocus: 1, controls: 1, defaultChecked: 1 };
  var NO_WS = { table: 1, thead: 1, tbody: 1, tfoot: 1, tr: 1, colgroup: 1, select: 1, ul: 1, ol: 1 };
  var HOLE = /\{\{\s*([^}]*?)\s*\}\}/g;
  var WHOLE = /^\s*\{\{\s*([^}]*?)\s*\}\}\s*$/;

  function lookup(scope, expr) {
    if (expr === 'true') return true;
    if (expr === 'false') return false;
    if (expr === 'null') return null;
    if (expr === 'undefined' || expr === '') return undefined;
    if (/^-?\d+(\.\d+)?$/.test(expr)) return Number(expr);
    var q = expr.match(/^(['"])(.*)\1$/);
    if (q) return q[2];
    var parts = expr.split('.'), v = scope;
    for (var i = 0; i < parts.length; i++) {
      if (v == null) return undefined;
      v = v[parts[i]];
    }
    return v;
  }
  function str(v) { return v == null || v === false ? '' : String(v); }
  function interp(s, scope) { return s.replace(HOLE, function (_, e) { return str(lookup(scope, e)); }); }
  function val(s, scope) {
    var m = s.match(WHOLE);
    return m ? lookup(scope, m[1]) : (s.indexOf('{{') >= 0 ? interp(s, scope) : s);
  }
  function camel(k) { return k.replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); }); }
  var styleCache = {};
  function parseStyle(s) {
    if (styleCache[s]) return styleCache[s];
    var o = {}, depth = 0, cur = '', parts = [];
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (ch === '(') depth++; else if (ch === ')') depth--;
      if (ch === ';' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
    }
    parts.push(cur);
    parts.forEach(function (p) {
      var j = p.indexOf(':');
      if (j < 0) return;
      var k = p.slice(0, j).trim(), v = p.slice(j + 1).trim();
      if (!k) return;
      o[k.indexOf('--') === 0 ? k : camel(k.indexOf('-ms-') === 0 ? k.slice(1) : k)] = v;
    });
    return (styleCache[s] = o);
  }

  function props(node, scope) {
    var p = {}, a = node.a, formEl = node.t === 'input' || node.t === 'textarea' || node.t === 'select';
    for (var k in a) {
      var raw = a[k], v = val(raw, scope);
      var name = ATTR[k] || ATTR[k.toLowerCase()] || k;
      if (name.indexOf('data-') !== 0 && name.indexOf('aria-') !== 0 && name.indexOf('-') > 0) name = camel(name);
      if (name === 'style') { p.style = typeof v === 'string' ? parseStyle(v) : v; continue; }
      if (name === 'href' && typeof v === 'string' && LINKS[v]) v = LINKS[v];
      if (BOOL[name] && v === '' && !WHOLE.test(raw)) v = true;
      if (BOOL[name] && WHOLE.test(raw)) v = !!v;
      p[name] = v;
    }
    if (p.onInput && !p.onChange) { p.onChange = p.onInput; delete p.onInput; }
    var controlled = !!p.onChange;
    if (formEl && 'value' in p) {
      if (p.value == null) p.value = '';
      if (!controlled) { p.defaultValue = p.value; delete p.value; }
    }
    if (formEl && 'checked' in p && !controlled) { p.defaultChecked = p.checked; delete p.checked; }
    return p;
  }

  function kids(list, scope, ctx, keyBase) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var r = build(list[i], scope, ctx, keyBase + i);
      if (r !== null && r !== undefined) out.push(r);
    }
    return out;
  }

  function build(node, scope, ctx, key) {
    if (typeof node === 'string') {
      if (NO_WS[ctx] && !node.trim()) return null;
      if (node.indexOf('{{') < 0) return node;
      var m = node.match(WHOLE);
      if (m) { var v = lookup(scope, m[1]); return str(v); }
      return interp(node, scope);
    }
    var t = node.t;
    if (t === 'sc-if') {
      var cond = val(node.a.value || '', scope);
      if (!cond) return null;
      return h(Frag, { key: key }, kids(node.c, scope, ctx, ''));
    }
    if (t === 'sc-for') {
      var list = val(node.a.list || '', scope) || [], as = node.a.as || 'item';
      return h(Frag, { key: key }, Array.prototype.map.call(list, function (item, i) {
        var s = Object.create(scope); s[as] = item; s.$index = i;
        return h(Frag, { key: (item && (item.key != null ? item.key : item.id != null ? item.id : null)) != null ? 'k' + (item.key != null ? item.key : item.id) + '_' + i : i }, kids(node.c, s, ctx, ''));
      }));
    }
    if (t === 'dc-import') {
      var cp = {};
      for (var k in node.a) if (k !== 'name') cp[camel(k)] = val(node.a[k], scope);
      cp.key = key;
      var C = registry[node.a.name];
      return C ? h(C, cp) : null;
    }
    if (t === 'script' || t === 'helmet') return null;
    var p = props(node, scope);
    p.key = key;
    if ((t === 'textarea' || t === 'select') && node.c.length && !('value' in p) && !('defaultValue' in p) && t === 'textarea') {
      p.defaultValue = node.c.map(function (c) { return typeof c === 'string' ? interp(c, scope) : ''; }).join('');
      return h(t, p);
    }
    if (t === 'textarea' || t === 'input' || t === 'br' || t === 'img' || t === 'hr' || t === 'meta' || t === 'link') return h(t, p);
    var c = kids(node.c, scope, t, '');
    return c.length ? h.apply(null, [t, p].concat(c)) : h(t, p);
  }

  class DCLogic extends R.Component {
    constructor(p) { super(p); if (!this.state) this.state = {}; }
    render() {
      var vals = this.renderVals ? this.renderVals() : {};
      var tpl = this.constructor.__tpl;
      var c = kids(tpl, vals || {}, 'div', 'r');
      return c.length === 1 ? c[0] : h(Frag, null, c);
    }
  }

  var helmetDone = {};
  function define(spec) {
    if (!helmetDone[spec.name] && spec.helmet) {
      helmetDone[spec.name] = 1;
      document.head.insertAdjacentHTML('beforeend', spec.helmet);
    }
    var Comp = new Function('DCLogic', 'React', '"use strict";\n' + spec.logic + '\n;return Component;')(DCLogic, R);
    Comp.__tpl = spec.body;
    Comp.displayName = spec.name;
    registry[spec.name] = Comp;
    return Comp;
  }

  function imports(nodes, acc) {
    nodes.forEach(function (n) {
      if (typeof n === 'string') return;
      if (n.t === 'dc-import' && n.a.name) acc[n.a.name] = 1;
      imports(n.c || [], acc);
    });
    return acc;
  }

  function load(name) {
    if (registry[name]) return Promise.resolve(registry[name]);
    return fetch('/dc/' + name + '.json').then(function (r) {
      if (!r.ok) throw new Error('missing ' + name);
      return r.json();
    }).then(function (spec) {
      return Promise.all(Object.keys(imports(spec.body, {})).map(load)).then(function () { return define(spec); });
    });
  }

  function mount(name, el) {
    load(name).then(function (C) {
      ReactDOM.createRoot(el).render(h(C, {}));
    }).catch(function (e) {
      el.innerHTML = '<div id="boot">שגיאה בטעינת הדמו</div>';
      console.error(e);
    });
  }

  window.DCLite = { mount: mount, load: load, DCLogic: DCLogic };
})();
