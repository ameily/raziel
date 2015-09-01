
var config = require('./conf/app-config');
var path = require('path');
var fs = require('fs');


function FileStore(options) {
  this.root = options.root;
}

FileStore.prototype.add = function(src, sha256) {
  var prefix = sha256[0] + sha256[1];
  var body = sha256.substring(2);

  var dir = path.join(this.root, prefix);
  var stat = fs.statSync(dir);

  if(!stat.isDirectory()) {
    try {
      fs.mkdirSync(dir);
    } catch {
      // ERROR
    }
  }

  var file = path.join(dir, body);
  if(!stat.isFile(file)) {
    try {
      fs.renameSync(src, file);
    } catch {
      // ERROR
    }
  } else {
    fs.unlinkSync(src);
  }
};


module.exports = FileStore;
