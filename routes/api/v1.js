///
/// @copyright 2015 Adam Meily <meily.adam@gmail.com>
///

var express = require('express');
var router = express.Router();
var models = require('../../models');
var util = require('util');
var _ = require('underscore');
var moment = require('moment');
var ObjectId = require('mongoose').Types.ObjectId;
var fs = require('fs');
var logger = require('../../logger');
var path = require('path');

var VALID_FILE_NAME_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789,._ &";

// TODO comments
// TODO logging

///
/// Clean a file name.
///
function cleanFileName(name) {
  var result = "";
  var prev = null;

  _.each(name, function(c) {
    if(VALID_FILE_NAME_CHARS.indexOf(c) >= 0) {
      prev = c;
      result += c;
    } else if(prev != null && prev != '-') {
      result += '-';
      prev = '-';
    }
  });

  return result.length > 0 ? result : null;
}

///
/// Retrieve an Enoch file from the database.
///
function getFileDescriptor(req, cb) {
  var version = req.query.version || req.body.version || null;
  var tag = req.query.tag || req.body.tag || null;

  var query = {
    url: cleanUrl(req.path)
  };

  if(query.url.length <= 1) {
    cb("no file path specified");
    return;
  }

  if(version != null) {
    // Only query on version if the version is a valid number.
    if(_.isString(version)) {
      version = parseInt(version);
      if(!_.isNaN(version)) {
          query.version = version;
      }
    } else if(_.isNumber(version)) {
      query.version = version;
    }
  }

  if(tag != null && _.isString(tag)) {
    // Only query on tag if tag is a string.
    query.tag = tag;
  }

  logger.debug("getFileDescriptor(): query: %s", util.inspect(query));

  models.FileDescriptor.findOne(query).sort({ _id: -1 }).exec(cb);
}

///
/// Parse url
///
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

///
/// Download a file or its metadata, based on the format query parameter.
///
router.get("*", function(req, res) {
  var format = req.query.f || req.body.f || null;
  if(!_.isString(format)) {
    format = null;
  }

  if(format == 'history') {
    models.FileDescriptor.find({ url: cleanUrl(req.path) }).stream({
      transform: function(doc) {
        return JSON.stringify(doc.clean());
      }
    }).pipe(res);

    return;
  } else if(format == 'dir') {
    var namespace = cleanUrl(req.path);
    res.set("Content-Type", "text/event-stream");
    models.TreeDescriptor.find({ namespace: namespace }).stream({
      transform: function(doc) {
        return "data: " + JSON.stringify({
          name: doc.name,
          type: doc.type
        }) + "\n\n";
      }
    }).pipe(res);
    return;
  }

  getFileDescriptor(req, function(err, file) {
    if(err) {
      // the quiery was invalid if an error occurred
      logger.info("invalid query for file %s: %s", req.path, err.toString());
      res.status(404).json({ error: "invalid query: " + err.toString()});
    } else if(file == null) {
      // the file wasn't found based on the query
      logger.info("file not found: %s", req.path);
      res.status(404).json({ error: "file not found" });
    } else {
      // File exists, check the format
      if(format == "stat") {
        // Send metadata
        logger.info("get metadata: %s", req.path);
        res.json(file.clean());
      } else {
        // Send file content
        logger.info("get content: %s", req.path);

        res.set({
          'Content-Type': file.mimetype,
          'Content-Length': file.size
        });

        if(file.name) {
          res.set('Content-Disposition', 'attachment; filename="' + file.name + '"');
        }

        req.ctx.gridfs.createReadStream({ _id: file.gfsId }).pipe(res);

        // Update file statistics
        models.FileDescriptor.update({_id: file._id}, {
          $inc: { downloads: 1 },
          $set: { lastDownload: moment.utc().unix() }
        }, function(err) {
          if(err) {
            logger.error("failed to update file statistics: %s: %s", req.path,
                         err.toString());
          }
        });
      }
    }
  });
});


///
/// Insert a file
///
/// Process:
///
/// if url exists:
///   if url and version exist:
///     replace fileId in database { downloads: 0 }
///   else
///     create new version
/// else
///   create new file
///
router.post("*", function(req, res) {
  var url = cleanUrl(req.path);

  if(url.length <= 1) {
    // the root is not a valid file
    logger.info("post: invalid/missing url");
    res.status(404).json({ error: "no file path specified" });
    return;
  }

  var name = _.isString(req.body.name) ? cleanFileName(req.body.name) : null;
  var tag = _.isString(req.body.tag) ? cleanFileName(req.body.tag) : null;
  var apiKey = _.isString(req.body.apiKey) ? req.body.apiKey : null;
  var clearApiKey = null;

  if(!req.files || !req.files.file) {
    // a file was not uploaded
    res.status(400).json({ error: "no file specified" });
    return;
  }

  // the file uploaded
  var upload = req.files.file;

  logger.debug("upload to %s: %s, type: %s, size: %d => ", url,
              upload.originalname, upload.mimetype, upload.size, upload.path);



  // Find the latest version of the file based on url alone
  models.FileDescriptor.findOne({ url: url }).sort({ _id: -1 }).exec(function(err, prev) {
    var file = new models.FileDescriptor({
      url: url,
      namespace: path.dirname(url),
      version: 0,
      name: req.body.name || null,
      gfsId: null,
      apiKey: null,
      downloads: 0,
      lastDownload: 0,
      mimetype: upload.mimetype,
      tag: tag,
      size: upload.size,
      md5: upload.md5,
      sha1: upload.sha1,
      sha256: upload.sha256
    });

    if(prev == null) {
      // This is a new file descriptor.

      models.TreeDescriptor.addFile(file);

      if(!apiKey && req.body.protect === true) {
        // generate API key
        clearApiKey = file.generateApiKey();
        logger.debug("generated api key for file: %s", url, file.version);
      } else if(apiKey) {
        // encrypt API key
        logger.debug("protected new file with api key: %s", url);
        file.setApiKey(apiKey);
      }

      logger.info("created new file descriptor: %s", url);
    } else {
      // file already exists

      // Check if the file is protected
      if(prev.apiKey && !prev.apiKeyMatches(apiKey)) {
        // file is API key protected and api key doesn't match
        logger.info("unauthorized upload to %s", url);
        res.status(401).json({ error: "file is protected by api key" });

        fs.unlink(upload.path, function(err) {
          logger.debug("delete temporary upload file (unauthorized): %s", upload.file);
        })

        return;
      }

      file.version = prev.version + 1;
      file.apiKey = prev.apiKey;

      logger.info("created new version: %s [%d]", url, file.version);
    }

    if(upload.dbFile) {
      // The already exists in the database
      file.gfsId = upload.dbFile._id;
      logger.info("duplicate file content found: %s [%d]", url, file.version);

      fs.unlink(upload.path, function() {
        logger.debug("deleted temporary upload file [duplicate]: %s", upload.path);
      });
    } else {
      file.gfsId = new ObjectId();

      var gridStream = req.ctx.gridfs.createWriteStream({
        _id: file.gfsId
      });

      fs.createReadStream(upload.path).pipe(gridStream).on('close', function(gridfs) {
        logger.info("completed file import: %s => %s", upload.path, url);
        fs.unlink(upload.path, function() {
          logger.debug("deleted temporary upload file: %s", upload.path);
        });
      });
    }

    file.save(function(err) {
      if(err) {
        logger.error("failed to save file descriptor: %s [%d]: %s", url,
                     file.version, err.toString());

        res.status(500).json({ error: "failed to save file: " + err.toString()});
      } else {
        logger.debug("saved file descriptor: %s [%d]", url, file.version);
        var json = file.clean();
        if(apiKey) {
          json.apiKey = apiKey;
        }
        res.json(json);
      }
    });
  });
});


module.exports = router;


/*

metasponse/
  relase.zip | tags: [1.4.3, 1.4.2, 1.4.1]
  releases/
    latest.zip
    metasponse-1.4.3.zip
  libs.zip | tags: [1.4.3, 1.4.2, 1.4.1]
  builtins.zip | tags: [1.4.3, 1.4.2, 1.4.1]



*/
