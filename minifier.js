'use strict';
var through = require('through2');
var deap = require('deap');
var PluginError = require('gulp-util/lib/PluginError');
var log = require('fancy-log');
var applySourceMap = require('vinyl-sourcemaps-apply');
var saveLicense = require('uglify-save-license');
var isObject = require('isobject');
var reSourceMapComment = /\n\/\/# sourceMappingURL=.+?$/;
var pluginName = 'gulp-uglify';

function trycatch(fn, handle) {
  try {
    return fn();
  } catch (e) {
    return handle(e);
  }
}

function setup(opts) {
  if (opts && !isObject(opts)) {
    log('gulp-uglify expects an object, non-object provided');
    opts = {};
  }

  var options = deap({}, opts, {
    fromString: true,
    output: {}
  });

  if (options.preserveComments === 'all') {
    options.output.comments = true;
  } else if (options.preserveComments === 'some') {
    // preserve comments with directives or that start with a bang (!)
    options.output.comments = /^!|@preserve|@license|@cc_on/i;
  } else if (options.preserveComments === 'license') {
    options.output.comments = saveLicense;
  } else if (typeof options.preserveComments === 'function') {
    options.output.comments = options.preserveComments;
  }

  return options;
}

function createError(file, err) {
  if (typeof err === 'string') {
    return new PluginError(pluginName, file.path + ': ' + err, {
      fileName: file.path,
      showStack: false
    });
  }

  var msg = err.message || err.msg || /* istanbul ignore next */ 'unspecified error';

  return new PluginError(pluginName, file.path + ': ' + msg, {
    fileName: file.path,
    lineNumber: err.line,
    stack: err.stack,
    showStack: false
  });
}

module.exports = function (opts, uglify) {
  function minify(file, encoding, callback) {
    var throughStream = this;
    var options = setup(opts || {});

    if (file.isNull()) {
      return callback(null, file);
    }

    if (file.isStream()) {
      return callback(createError(file, 'Streaming not supported'));
    }

    if (file.sourceMap) {
      options.outSourceMap = file.relative;
    }

    var mangled = trycatch(function () {
      try {
        var m = uglify.minify(String(file.contents), options);
        m.code = new Buffer(m.code.replace(reSourceMapComment, ''));
        return m;
       } catch (ex) {
        throughStream.emit("warning",{message: "Failed to minify file.", path: file.path, exception:ex})
        return { code: file.contents };
      }
    }, createError.bind(null, file));

    if (mangled instanceof PluginError) {
      return callback(mangled);
    }

    file.contents = mangled.code;

    if (file.sourceMap && mangled.map) {
      var sourceMap = JSON.parse(mangled.map);
      sourceMap.sources = [file.relative];
      applySourceMap(file, sourceMap);
    }

    callback(null, file);
  }

  return through.obj(minify);
};
