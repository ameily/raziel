require.config({
  paths: {
    underscore: "underscore-min",
    knockout: "knockout-3.3.0"
  },
  baseUrl: "/vendor"
});

define(['knockout'], function(ko) {
  ko.components.register('raziel-explorer', {
    require: "/javascripts/explorer.js"
  });

  ko.applyBindings();
});
