
var path = require('path');
var fs = require('fs');
var logger = require('./logger').appLog;
var util = require('util');
var VError = require('verror');
var crypto = require('crypto');
var models = require('./models');
var multer = require('multer');
var mmm = require('mmmagic');
var magic = new mmm.Magic(mmm.MAGIC_MIME_TYPE);


///
/// Files stored on the filesystem by their sha256 hashes. Like git, the first
/// 2 characters of the sha256 hash are a directory located in the root storage
/// location. The actual file is stored inside of the hash prefix directory.
///
/// Example:
///
/// /root/2c/f24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
///



function FileStore(options, callback) {
  var self = this;
  this.root = path.resolve(options.root);
  this.temp = path.join(this.root, 'temp');
  this.multer = null;
  callback = callback || function throwError(err) { if(err) throw err; };

  logger.debug("storage root: %s", this.root);
  logger.debug("storage temp: %s", this.temp);

  this.ensureDirectory(this.root, function(err) {
    if(err) {
      callback(new VError(err, "failed to create storage directory '%s'", self.root));
    } else {
      self.ensureDirectory(self.temp, function(err) {
        if(err && err.code != 'EEXIST') {
          callback(new VError(
            err, "failed to create temp storage directory '%s'", self.temp
          ));
        } else {
          // initialize the multer middleware for upload management
          self.initMulter(callback);
        }
      });
    }
  });
}

FileStore.prototype.ensureDirectory = function(dir, callback) {
  logger.debug("ensureDirectory( %s )", dir);
  fs.stat(dir, function(err, stat) {
    if(err && err.code == 'ENOENT') {
      logger.debug("mkdir( %s )", dir);
      fs.mkdir(dir, function(err) {
        if(err) {
          callback(err);
        } else {
          logger.info("created new storage directory: %s", dir);
          callback(null);
        }
      });
    } else if(!err) {
      if(stat.isDirectory()) {
        callback();
      } else {
        callback(new Error("path is not a directory: " + dir));
      }
    } else {
      callback(err);
    }
  });
};

FileStore.prototype.ensureFile = function(src, dest, callback) {
  fs.stat(dest, function(err, stat) {
    if(err && err.code == 'ENOENT') {
      // File does not exist
      logger.debug("mv '%s' => '%s'", src, dest);
      fs.rename(src, dest, function(err) {
        if(!err) {
          logger.info("stored new file: %s", dest);
          callback(null);
        } else if(err.code == 'EEXIST') {
          logger.debug("duplicate file: %s", dest);
          fs.unlink(src, function(err) {
            callback(null);
          });
        } else {
          callback(err);
        }
      });
    } else if(!err) {
      // File exists
      if(stat.isFile()) {
        logger.debug("duplicate file: %s", dest);
        fs.unlink(src, function(err) {
          callback(null);
        });
      } else {
        callback(new Error("path is not a file: " + dest));
      }
    } else {
      // Probably permission error
      callback(new VError(err, "failed to stat file"));
    }
  });
};


FileStore.prototype.add = function(src, sha256, callback) {
  var self = this;
  var prefix = sha256[0] + sha256[1];
  var body = sha256.substring(2);

  var prefixDir = path.join(this.root, prefix);
  var dest = path.join(prefixDir, body);

  this.ensureDirectory(prefixDir, function(err) {
    if(err) {
      callback(err);
    } else {
      self.ensureFile(src, dest, function(err) {
        if(err) {
          callback(err);
        } else {
          callback(null, dest);
        }
      });
    }
  });
};

FileStore.prototype.createReadStream = function(sha256, callback) {
  var prefix = sha256[0] + sha256[1];
  var body = sha256.substring(2);

  var prefixDir = path.join(this.root, prefix);
  var src = path.join(prefixDir, body);

  return fs.createReadStream(src);
};

FileStore.prototype.initMulter = function(callback) {
  var self = this;

  this.multer = multer({
    dest: this.temp,

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

        self.add(upload.path, upload.sha256, function(err, dest) {
          if(err) {
            throw new VError(err, "failed to add upload %s", upload.path);
          }

          // The uploaded file has been successfully placed into the file store.

          // Determine if the uploaded path is new or contains an existing file
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
  });

  callback();
};


module.exports = FileStore;
