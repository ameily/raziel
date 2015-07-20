var express = require('express');
var _ = require('underscore');

var router = express.Router();


function cleanUrl(url) {
  var parts = url.split('/');
  var url = "";
  var count = 0;

  _.each(parts, function(part) {
    if(part.length > 0) {
      url += "/" + part;
      count += 1;
    }
  });

  if(url.length == 0 || count > 255) {
    url = "/";
  }

  return url;
}

router.get("*", function(req, res, next) {
  var url = req.path;
  res.render('file', { url: cleanUrl(url) });
});

module.exports = router;
