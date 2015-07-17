define([
  'knockout', 'underscore', 'jsonpipe', 'text!/templates/explorer.tmpl.html'
], function(ko, _, jsonpipe, template) {

  /*
   * A Tree node, which may be a pointer to a TreeDescriptor or to a generic
   * FileDescriptor.
   */
  function TreeNode(params, cwd) {
    this.name = params.name;
    this.namespace = params.namespace || cwd || "";

    if(this.namespace.length > 1) {
      this.url = this.namespace + '/' + this.name;
    } else {
      this.url = this.namespace + this.name;
    }

    this.type = params.type;
  }

  TreeNode.prototype.isTree = function() { return this.type == 'tree'; };
  TreeNode.prototype.isLeaf = function() { return this.type == 'leaf'; };

  function ExplorerLocation() {
    this.crumbs = ko.observableArray([]);
    this.url = ko.observable("");
    this.namespace = ko.observable("");
    this.name = ko.observable("");
    this.isAtRoot = ko.computed(function() {
      return this.url() == '/';
    }, this);

    _.bindAll(this, 'setLocation', 'gotoRoot');
  }

  ExplorerLocation.prototype.setLocation = function(url) {
    if(!_.isString(url)) {
      url = url.url;
    }

    this.url(url);

    var parts = _.filter(url.split('/'), function(i) {
      return i.length > 0;
    });

    if(parts.length == 0) {
      this.crumbs.removeAll();
      this.name("raziel://");
      this.url("/");
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
    this.setLocation('/');
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

    this.path.setLocation(url);

    //this.update();
  };

  ExplorerViewModel.prototype.update = function() {
    var url = this.path.url();
    var self = this;

    this.items.removeAll();
    jsonpipe.flow("/v1" + url + "?f=dir", {
      delimiter: "\n",
      success: function onNode(data) {
        self.items.push(new TreeNode(data, url));
      }
    });
  };

  ExplorerViewModel.prototype.openFile = function(file) {
    //this.selectedFile(file);
    window.location = "/file?url=" + file.url;
  };

  ExplorerViewModel.prototype.closeFile = function() {
    this.selectedFile(null);
  };

  return {
    viewModel: ExplorerViewModel,
    template: template
  };
});
