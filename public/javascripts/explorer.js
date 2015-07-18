///
/// TODO fixed position for file summary component
/// TODO query limits
/// TODO "Load more" buttons
/// TODO about and index page
///

define([
  'knockout', 'underscore', 'jsonpipe', 'models', 'text!/templates/explorer.tmpl.html'
], function(ko, _, jsonpipe, models, template) {

  var TreeNode = models.TreeNode;
  var FileDescriptor = models.FileDescriptor;

  function ExplorerLocation() {
    var self = this;

    this.crumbs = ko.observableArray([]);
    this.url = ko.observable("");
    this.namespace = ko.observable("");
    this.name = ko.observable("");
    this.isAtRoot = ko.computed(function() {
      return this.url() == '/';
    }, this);

    _.bindAll(this, 'setLocation', 'gotoRoot');

    //window.history.pushState({ url: '/' }, "", "/explorer");
    window.onpopstate = function(event) {
      self.setLocation(event.state.url, false);
    };
  }

  ExplorerLocation.prototype.setLocation = function(url, pushHistory) {
    if(!_.isString(url)) {
      url = url.url;
    }

    this.url(url);

    if(pushHistory) {
      window.history.pushState({ url: url }, "", "/explorer" + url);
    }

    var parts = _.filter(url.split('/'), function(i) {
      return i.length > 0;
    });

    if(parts.length == 0) {
      this.crumbs.removeAll();
      this.name("raziel://");
      return;
    }

    var current = this.crumbs();
    this.name(parts.pop());

    if(parts.length < current.length) {
      var diff = current.length - parts.length;
      for(var i = 0; i < diff; ++i) {
        this.crumbs.pop();
        current.pop();
      }
    }

    var cwd = "";
    for(var i = 0; i < parts.length; ++i) {
      var name = parts[i];
      cwd += "/" + name;

      var item = {
        url: cwd,
        name: name
      };

      if(i >= current.length) {
        this.crumbs.push(item);
      } else if(name != current[i].name) {
        var diff = current.length - i;
        for(var j = 0; j < diff; ++j) {
          current.pop();
          this.crumbs.pop();
        }

        this.crumbs.push(item);
      }
    }
  };

  ExplorerLocation.prototype.gotoRoot = function() {
    this.setLocation('/', true);
  };


  function ExplorerViewModel(params) {
    var self = this;

    this.items = ko.observableArray([]);
    this.selectedFile = ko.observable(params.selectedFile || null);
    this.path = new ExplorerLocation();

    this.path.url.subscribe(function(url) {
      self.update();
    });

    _.bindAll(this, 'gotoTree', 'openFile', 'closeFile', 'update');

    this.gotoTree(params.url || "/" );
  };

  ExplorerViewModel.prototype.gotoRoot = function() {
    this.gotoTree("/");
  };

  ExplorerViewModel.prototype.gotoTree = function(node) {
    var url = _.isString(node) ? node : node.url;

    this.path.setLocation(url, true);

    //this.update();
  };

  ExplorerViewModel.prototype.update = function() {
    var url = this.path.url();
    var self = this;
    if(this.selectedFile()) {
      this.selectedFile(null);
    }

    this.items.removeAll();
    jsonpipe.flow("/v1" + url + "?f=dir", {
      delimiter: "\n",
      success: function onNode(data) {
        self.items.push(new TreeNode(data, url));
      }
    });
  };

  ExplorerViewModel.prototype.openFile = function(file) {
    var self = this;

    if(this.selectedFile()) {
      this.selectedFile().selected(false);
    }

    file.selected(true);

    $.getJSON("/v1" + file.url + "?f=stat", function(data) {
      file.latest = new FileDescriptor(data);
      //file.latest.downloadUrl = "/v1" + file.url;
      //file.latest.infoUrl = "/file" + file.url;
      self.selectedFile(file);
    });
  };

  ExplorerViewModel.prototype.closeFile = function() {
    this.selectedFile(null);
  };

  return {
    viewModel: ExplorerViewModel,
    template: template
  };
});
