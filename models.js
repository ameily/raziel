///
/// @copyright 2015 Adam Meily <meily.adam@gmail.com>
///

var mongoose = require('mongoose');
var crypto = require('crypto');
var ObjectId = mongoose.Types.ObjectId;
var _ = require('underscore');
var logger = require('./logger');


var FileDescriptorSchema = new mongoose.Schema({
  url: String,
  namespace: String,
  apiKey: String,
  version: Number,
  tag: String,
  gfsId: mongoose.Schema.Types.ObjectId,
  downloads: Number,
  name: String,
  lastDownload: Number,
  mimetype: String,
  size: Number,
  md5: String,
  sha1: String,
  sha256: String
});

FileDescriptorSchema.methods.toClient = function() {
  return {
    url: this.url,
    version: this.version,
    tag: this.tag,
    downloads: this.downloads,
    name: this.name,
    lastDownload: this.lastDownload,
    timestamp: this._id.getTimestamp().valueOf(),
    mimetype: this.mimetype,
    size: this.size,
    md5: this.md5,
    sha1: this.sha1,
    sha256: this.sha256,
    namespace: this.namespace
  };
};

FileDescriptorSchema.methods.generateApiKey = function() {
  // this.apiKey = md5(apiKey);
  var sha1 = crypto.createHash('sha1');
  var apiKey = ObjectId().toString();
  sha1.update(apiKey);
  this.apiKey = sha1.digest('hex');
  return apiKey;
};

FileDescriptorSchema.methods.apiKeyMatches = function(apiKey) {
  if(!_.isString(apiKey)) {
    return false;
  }

  var sha1 = crypto.createHash('sha1');
  sha1.update(apiKey.toString());
  return sha1.digest('hex') == this.apiKey;
};

FileDescriptorSchema.methods.setApiKey = function(apiKey) {
  var sha1 = crypto.createHash('sha1');
  sha1.update(apiKey.toString());
  this.apiKey = sha1.digest('hex');
}

var FileDescriptor = mongoose.model('File', FileDescriptorSchema);

var TreeDescriptorSchema = new mongoose.Schema({
  namespace: String,
  name: String,
  type: String
});

TreeDescriptorSchema.statics.addFile = function(file) {
  var parts = [];
  var prev = "";
  _.each(file.url.split('/'), function(part) {
    if(part.length > 0) {
      var namespace = prev.length > 0 ? prev : "/";
      var name = part;

      parts.push({
        namespace: namespace,
        name: name,
        type: 'tree'
      });

      prev += "/" + part;
    }
  });

  if(parts.length == 0) {
    return;
  }

  parts[parts.length-1].type = 'leaf';

  _.each(parts, function(url) {
    TreeDescriptor.findOne(url).exec(function(err, tree) {
      if(!tree) {
        var leaf = new TreeDescriptor(url).save(function(subErr) {
          logger.info("create tree node: %s / %s", url.namespace, url.name);
        });
      }
    });
  });
};

TreeDescriptorSchema.methods.toClient = function() {
  return {
    name: this.name,
    type: this.type
  };
};

var TreeDescriptor = mongoose.model('Tree', TreeDescriptorSchema);

module.exports = {
  FileDescriptor: FileDescriptor,
  TreeDescriptor: TreeDescriptor
};
