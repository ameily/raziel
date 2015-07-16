require.config({
  paths: {
    underscore: "underscore/underscore-min",
    knockout: "knockout/dist/knockout",
    jsonpipe: "jsonpipe/jsonpipe",
    moment: "moment/moment",
    text: "requirejs-text/text"
  },
  baseUrl: "/vendor"
});

define(['knockout'], function(ko) {
  ko.components.register('raziel-explorer', {
    require: "/javascripts/explorer.js"
  });
  ko.components.register('raziel-file', {
    require: "/javascripts/file.js"
  });

  ko.applyBindings();
});
