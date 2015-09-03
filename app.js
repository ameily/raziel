///
/// @copyright 2015 Adam Meily <meily.adam@gmail.com>
///

// Libraries
var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('./logger');
var cookieParser = require('cookie-parser');
var config = require('./conf/app-config');
var bodyParser = require('body-parser');
var apiV1 = require('./routes/api/v1');
var mongoose = require('mongoose');


var FileStore = require('./file-store');
var VError = require('verror');
var http = require('http');
var async = require('async');

// Routes
var explorer = require('./routes/explorer');
var index = require('./routes/index');
var docs = require('./routes/docs');

// Application
var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));

// Use morgan for access log.
app.use(logger.accessLog);

// Parse JSON and url-encoded request bodies
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));


var storage;


app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor', express.static(path.join(__dirname, 'bower_components')));

// initialize mongodb and the file store
async.series([
  // Initialize file store
  function(cb) {
    logger.appLog.debug("initializing file store: %s", config.storage);
    storage = new FileStore({ root: config.storage }, cb);
  },

  // initialize mongodb
  function(cb) {
    logger.appLog.debug("connecting to MongoDB: %s", config.mongodb);
    mongoose.connect(config.mongodb, cb)
  }],

  // setup the routes and then start the http server
  function(err) {

    if(err) {
      throw err;
    }

    ///
    /// multer is used to manage streaming file uploads. Here, uploading files
    /// have their hashes calculated on the fly. After upload has completed, the
    /// database is queried to see if the file content already exists.
    ///
    app.use(storage.multer);

    app.use(function(req, res, next) {
      // add GridFs to each request
      req.ctx = {
        storage: storage
      };
      next();
    });

    app.use("/", index);
    app.use("/docs", docs);
    app.use(explorer);
    app.use('/v1', apiV1);

    // catch 404 and forward to error handler
    app.use(function(req, res, next) {
      var err = new Error('Not Found');
      err.status = 404;
      next(err);
    });

    // error handlers

    // development error handler
    // will print stacktrace
    if(app.get('env') === 'development') {
      app.use(function(err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
          message: err.message,
          error: err
        });
      });
    }

    // production error handler
    // no stacktraces leaked to user
    app.use(function(err, req, res, next) {
      res.status(err.status || 500);
      res.render('error', {
        message: err.message,
        error: {}
      });
    });

    var server = http.createServer(app);

    server.listen(config.port);
    server.on('listening', function() {
      logger.appLog.info("HTTP server running on port %d", config.port);
    });
});



module.exports = app;
