var mongoose = require('mongoose');
var crypto = require('crypto');
var ObjectId = mongoose.Types.ObjectId;
var _ = require('underscore');

var FileDescriptorSchema = new mongoose.Schema({
  url: String,
  namespace: String,
  apiKey: String,
  version: Number,
  tag: String,
  gfsId: mongoose.Schema.Types.ObjectId,
  downloads: Number,
  name: String,
  timestamp: Number,
  lastDownload: Number,
  mimetype: String,
  size: Number,
  md5: String,
  sha1: String,
  sha256: String
});

FileDescriptorSchema.methods.clean = function() {
  return {
    url: this.url,
    version: this.version,
    tag: this.tag,
    downloads: this.downloads,
    name: this.name,
    timestamp: this.timestamp,
    lastDownload: this.lastDownload,
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


module.exports = {
  FileDescriptor: FileDescriptor
};
