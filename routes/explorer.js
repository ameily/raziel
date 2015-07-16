var express = require('express');
var router = express.Router();

router.get('/explorer', function(req, res, next) {
  res.render('explorer');
});

router.get("/file", function(req, res, next) {
  res.render('file', { url: req.query.url });
});

module.exports = router;
