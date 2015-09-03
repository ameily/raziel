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
var config = require('./conf/app-config');


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


var transports = [
  new winston.transports.DailyRotateFile({
    filename: path.join(__dirname, "log", "app.log"),
    level: config.log.level || "info",
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
];

if(config.log.stdout) {
  transports.push(new winston.transports.Console({
    level: config.log.level || "info",
    colorize: true,
    showLevel: true,
    name: "stdout",
    timestamp: function() {
      return moment().format("HH:mm:ss");
    },
    handleExceptions: true
  }));
}

var appLog = new winston.Logger({
  transports: transports
});


module.exports = {
  appLog: appLog,
  accessLog: accessLog
};
