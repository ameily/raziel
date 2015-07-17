var express = require('express');
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

router.get('/explorer/*', function(req, res, next) {
  var url = req.path.substring("/explorer".length);
  res.render('explorer', { url: cleanUrl(url) });
});

router.get("/file", function(req, res, next) {
  res.render('file', { url: req.query.url });
});

module.exports = router;
