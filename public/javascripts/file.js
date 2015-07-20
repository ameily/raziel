define([
  'knockout', 'underscore', 'jsonpipe', 'moment', 'models', 'text!/templates/file.tmpl.html'
], function(ko, _, jsonpipe, moment, models, template) {



  function FileViewModel(params) {
    this.url = ko.observable(params.url);
    this.history = ko.observableArray(params.history || []);
    this.hasMoreItems = ko.observable(false);
    this.limit = 25;
    _.bindAll(this, 'loadMore');

    this.loadMore();
  };

  FileViewModel.prototype.loadMore = function() {
    var self = this;
    var skip = this.history().length;
    var q = "?f=history" +
            "&limit=" + this.limit.toString() +
            "&skip=" + skip.toString();
    var count = 0;

    jsonpipe.flow("/v1" + this.url() + q, {
      delimiter: "\n",
      success: function onItem(data) {
        self.history.push(new models.FileDescriptor(data));
        count += 1;
      },
      complete: function() {
        self.hasMoreItems(count == self.limit);
      }
    });
  };


  return {
    viewModel: FileViewModel,
    template: template
  };

});
