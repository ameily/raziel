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
var multer = require('multer');
var mmm = require('mmmagic');
var crypto = require('crypto');
var models = require('./models');
var magic = new mmm.Magic(mmm.MAGIC_MIME_TYPE);
var FileStore = require('./file-store');

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


var storage = new FileStore({
  root: config.storage
}, function(err) {
  if(err) {
    console.log(err.message);
    throw err;
  }
});


///
/// multer is used to manage streaming file uploads. Here, uploading files
/// have their hashes calculated on the fly. After upload has completed, the
/// database is queried to see if the file content already exists.
///
app.use(multer({
  dest: storage.temp,

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
    // The request has completed, determine if the uploaded file already exists
    if(req.files && req.files.file) {
      var upload = req.files.file;

      storage.add(upload.path, upload.sha256, function(err, dest) {
        if(err) {
          throw err;
        }

        models.FileDescriptor.findOne({ sha256: upload.sha256 }).exec(function(err, file) {
          if(file) {
            req.files.file.dbFile = file;
            next();
          } else {
            // This is a new file that we haven't seen before. Determine the
            // file's mimetype.
            magic.detectFile(dest, function(err, result) {
              if(result) {
                req.files.file.mimetype = result;
              }
              next();
            });
          }
        });
      });
    } else {
      // No file was uploaded.
      next();
    }
  }
}));


app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor', express.static(path.join(__dirname, 'bower_components')));

mongoose.connect(config.mongodb);

console.log("Connecting to MongoDB");

mongoose.connection.once('open', function() {
  console.log("MongoDB connected");

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
});



module.exports = app;
