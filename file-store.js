
var path = require('path');
var fs = require('fs');
var logger = require('./logger').appLog;
var util = require('util');
var VError = require('verror');

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
  callback = callback || function throwError(err) { if(err) throw err; };

  logger.debug("storage root: %s", this.root);
  logger.debug("storage temp: %s", this.temp);

  this.ensureDirectory(this.root, function(err) {
    if(err) {
      callback(new VError(err, "failed to create storage directory '%s'", self.root));
    } else {
      self.ensureDirectory(self.temp, function(err) {
        if(err) {
          callback(new VError(
            err, "failed to create temp storage directory '%s'", self.temp
          ));
        } else {
          callback();
        }
      });
    }
  });
}

FileStore.prototype.ensureDirectory = function(dir, callback) {
  fs.stat(dir, function(err, stat) {
    if(err && err.code == 'ENOENT') {
      logger.info("mkdir( %s )", dir);
      fs.mkdir(dir, function(err) {
        callback(err);
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
      logger.info("mv '%s' => '%s'", src, dest);
      fs.rename(src, dest, function(err) {
        if(!err) {
          callback();
        } else if(err.code == 'EEXIST') {
          fs.unlink(src, function(err) {
            callback();
          });
        } else {
          callback(err);
        }
      });
    } else if(!err) {
      if(stat.isFile()) {
        callback();
      } else {
        callback(new Error("path is not a file: " + dest));
      }
    } else {
      callback(err);
    }
  });
};


FileStore.prototype.add = function(src, sha256, callback) {
  var prefix = sha256[0] + sha256[1];
  var body = sha256.substring(2);

  var prefixDir = path.join(this.root, prefix);
  var dest = path.join(body);

  this.ensureDirectory(prefixDir, function(err) {
    if(err) {
      callback(err);
    } else {
      this.ensureFile(src, dest, function(err) {
        if(err) {
          callback(err);
        } else {
          callback();
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


module.exports = FileStore;
