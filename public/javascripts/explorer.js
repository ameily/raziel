define([
  'knockout', 'underscore', 'jsonpipe', 'text!/templates/explorer.html'
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


  function ExplorerViewModel(params) {
    this.items = ko.observableArray([]);
    this.selectedFile = ko.observable(params.selectedFile || null);
    this.url = ko.observable("");

    _.bindAll(this, 'gotoTree', 'openFile', 'closeFile');

    this.gotoTree({ url: params.url || "/" });

    /*
    window.history.pushState({url: this.url() });
    window.onpopstate = function(state) {
      self.gotoTree(state.url);
    };
    */
  };

  ExplorerViewModel.prototype.gotoTree = function(node) {
    var self = this;
    var url = "/v1" + node.url;
    this.url(url);

    this.items.removeAll();

    jsonpipe.flow(url + "?f=dir", {
      delimiter: "\n",
      success: function onNode(data) {
        self.items.push(new TreeNode(data, node.url));
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
