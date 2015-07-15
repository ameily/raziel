var express = require('express');
var router = express.Router();

router.get('/explorer', function(req, res, next) {
  res.render('explorer');
});

module.exports = router;
