var express = require('express');
var _ = require('underscore');
var cleanUrl = require('../models').cleanUrl;

var router = express.Router();
var explorer = express.Router();
var files = express.Router();


explorer.get('*', function(req, res, next) {
  //var url = req.path.substring("/explorer".length);
  var url = req.path;
  res.render('explorer', { url: cleanUrl(url) });
});

files.get("*", function(req, res, next) {
  var url = req.path;
  res.render('file', { url: cleanUrl(url) });
});

router.use('/explorer', explorer);
router.use('/file', files);

module.exports = router;
