define([
  'knockout', 'underscore', 'jsonpipe', 'moment', 'text!/templates/file.tmpl.html'
], function(ko, _, jsonpipe, moment, template) {

  function FileDescriptor(params) {
    params = params || {};
    this.name = params.name || null;
    this.namespace = params.namespace || "";
    this.version = params.version || 0;
    this.url = params.url || "";
    this.md5 = params.md5 || "";
    this.sha1 = params.sha1 || "";
    this.sha256 = params.sha256 || "";
    this.size = params.size || -1;
    this.tag = params.tag || null;
    this.downloads = params.downloads || -1;
    this.lastDownload = params.lastDownload ? moment.utc(params.lastDownload) : null;
    this.mimetype = params.mimetype || null;
    this.timestamp = params.timestamp ? moment.utc(params.timestamp) : null;

    if(this.size > 0) {
      var unit;
      var val;
      if(this.size >= 1099511627776) {
        val = (this.size / 1099511627776).toFixed(2);
        unit = 'Tb';
      } else if(this.size >= 1073741824) {
        val = (this.size / 1073741824).toFixed(2);
        unit = 'Gb';
      } else if(this.size >= 1048576) {
        val = (this.size / 1048576).toFixed(2);
        unit = 'Mb';
      } else if(this.size >= 1024) {
        val = (this.size / 1024).toFixed(2);
        unit = 'Kb';
      } else {
        val = this.size.toString();
        unit = this.size == 1 ? 'Byte' : 'Bytes';
      }

      this.size = val + ' ' + unit;
    }

  }

  function FileViewModel(params) {
    this.url = ko.observable(params.url);
    this.history = ko.observableArray(params.history || []);
    this.fetch();
  };

  FileViewModel.prototype.fetch = function() {
    var self = this;

    jsonpipe.flow("/v1" + this.url() + "?f=history", {
      delimiter: "\n",
      success: function onItem(data) {
        self.history.push(new FileDescriptor(data));
      }
    });
  };


  return {
    viewModel: FileViewModel,
    template: template
  };

});
