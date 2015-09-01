define([
  'knockout', 'underscore', 'moment'
], function(ko, _, moment) {

  function FileDescriptor(params) {
    params = params || {};
    this.name = params.name || null;
    this.namespace = params.namespace || "";
    this.version = params.version || 0;
    this.url = params.url || "";
    this.md5 = params.md5 || "";
    this.sha1 = params.sha1 || "";
    this.sha256 = params.sha256 || "";
    this.tag = params.tag || null;
    this.downloads = params.downloads || 0;
    this.lastDownload = params.lastDownload ? moment.unix(params.lastDownload) : null;
    this.mimetype = params.mimetype || null;
    this.timestamp = params.timestamp ? moment.unix(params.timestamp) : null;

    this.size = humanizeFileSize(params.size || 0);

    this.downloadUrl = "/v1/files" + this.url + "?version=" + this.version.toString();
    this.infoUrl = "/file" + this.url;
  }

  function TreeNode(params, cwd) {
    this.name = params.name;
    this.namespace = params.namespace || cwd || "";
    this.selected = ko.observable(params.selected || false);

    if(this.namespace.length > 1) {
      this.url = this.namespace + '/' + this.name;
    } else {
      this.url = this.namespace + this.name;
    }

    this.type = params.type;
  }

  TreeNode.prototype.isTree = function() {
    return this.type == 'tree';
  };

  TreeNode.prototype.isLeaf = function() {
    return this.type == 'leaf';
  };

  function humanizeFileSize(size) {
    var val;
    var unit;

    if(size >= 1099511627776) {
      val = (size / 1099511627776).toFixed(2);
      unit = 'Tb';
    } else if(size >= 1073741824) {
      val = (size / 1073741824).toFixed(2);
      unit = 'Gb';
    } else if(size >= 1048576) {
      val = (size / 1048576).toFixed(2);
      unit = 'Mb';
    } else if(size >= 1024) {
      val = (size / 1024).toFixed(2);
      unit = 'Kb';
    } else {
      val = size.toString();
      unit = size == 1 ? 'Byte' : 'Bytes';
    }

    return val + ' ' + unit;
  }

  return {
    FileDescriptor: FileDescriptor,
    TreeNode: TreeNode,
    humanizeFileSize: humanizeFileSize
  };
});
