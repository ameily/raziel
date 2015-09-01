///
/// @copyright 2015 Adam Meily <meily.adam@gmail.com>
///

var winston = require('winston');
var util = require('util');
var moment = require('moment');
var fs = require('fs');
var morgan = require('morgan');
var FileStreamRotator = require('file-stream-rotator');
var path = require('path');


try {
  var stats = fs.statSync("./log");
} catch(e) {
  fs.mkdirSync("./log");
}

var accessStream = FileStreamRotator.getStream({
  filename: path.join(__dirname, "log", "access.log"),
  frquency: 'daily',
  verbose: false
});

var accessLog = morgan('combined', {stream: accessStream });


var appLog = new winston.Logger({
  transports: [
    new winston.transports.Console({
      level: "debug",
      colorize: true,
      showLevel: true,
      name: "stdout",
      timestamp: function() {
        return moment().format("HH:mm:ss");
      }
    }),

    new winston.transports.DailyRotateFile({
      filename: path.join(__dirname, "log", "app.log"),
      level: "debug",
      tailable: true,
      name: "app-log",
      json: false,
      maxFiles: 5,
      timestamp: function() {
        return moment().format("HH:mm:ss");
      }
    }),

    new winston.transports.DailyRotateFile({
      filename: path.join(__dirname, "log", "error.log"),
      level: "error",
      name: "error-log",
      tailable: true,
      json: false,
      maxFiles: 5,
      timestamp: function() {
        return moment().format("HH:mm:ss");
      },
      handleExceptions: true
    })
  ]
});


module.exports = {
  appLog: appLog,
  accessLog: accessLog
};
