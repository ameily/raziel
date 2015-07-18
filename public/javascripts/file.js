define([
  'knockout', 'underscore', 'jsonpipe', 'moment', 'models', 'text!/templates/file.tmpl.html'
], function(ko, _, jsonpipe, moment, models, template) {



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
        self.history.push(new models.FileDescriptor(data));
      }
    });
  };


  return {
    viewModel: FileViewModel,
    template: template
  };

});
