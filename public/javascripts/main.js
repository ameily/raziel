require.config({
  paths: {
    underscore: "underscore/underscore-min",
    knockout: "knockout/dist/knockout",
    jsonpipe: "jsonpipe/jsonpipe",
    text: "requirejs-text/text"
  },
  baseUrl: "/vendor"
});

define(['knockout'], function(ko) {
  ko.components.register('raziel-explorer', {
    require: "/javascripts/explorer.js"
  });

  ko.applyBindings();
});
