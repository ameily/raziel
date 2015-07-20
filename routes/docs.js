var express = require('express');
var _ = require('underscore');

var router = express.Router();


router.get("/", function(req, res) {
  res.render("docs");
});

module.exports = router;
