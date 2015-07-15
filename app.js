///
/// @copyright 2015 Adam Meily <meily.adam@gmail.com>
///

var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var apiV1 = require('./routes/api/v1');
var mongoose = require('mongoose');
var GridFs = require("gridfs-stream");
var multer = require('multer');
var mmm = require('mmmagic');
var crypto = require('crypto');
var models = require('./models');

var explorer = require('./routes/explorer');
//var users = require('./routes/users');

var app = express();
var magic = new mmm.Magic(mmm.MAGIC_MIME_TYPE);

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.use(multer({
  onFileUploadStart: function(file, req, res) {
    // On upload start, begin hashing
    file.md5 = crypto.createHash('md5');
    file.sha1 = crypto.createHash('sha1');
    file.sha256 = crypto.createHash('sha256');
  },
  onFileUploadData: function(file, data, req, res) {
    // updated hashes
    file.md5.update(data);
    file.sha1.update(data);
    file.sha256.update(data);
  },
  onFileUploadComplete: function(file, req, res) {
    // complete file hashes
    file.md5 = file.md5.digest('hex');
    file.sha1 = file.sha1.digest('hex');
    file.sha256 = file.sha256.digest('hex');
  },
  onParseEnd: function(req, next) {
    if(req.files && req.files.file) {
      models.FileDescriptor.findOne({ sha256: req.files.file.sha256 }).exec(function(err, file) {
        if(file) {
          req.files.file.dbFile = file;
          next();
        } else {
          magic.detectFile(req.files.file.path, function(err, result) {
            if(result) {
              req.files.file.mimetype = result;
            }
            next();
          });
        }
      });
    } else {
      next();
    }
  }
}));

app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor', express.static(path.join(__dirname, 'bower_components')));

GridFs.mongo = mongoose.mongo;

mongoose.connect("mongodb://localhost/raziel");

mongoose.connection.once('open', function() {
  var gridfs = GridFs(mongoose.connection.db);

  app.use(function(req, res, next) {
    // add GridFs to each request
    req.ctx = {
      gridfs: gridfs
    };
    next();
  })
  app.use('/', explorer);
  //app.use('/users', users);
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
});



module.exports = app;
