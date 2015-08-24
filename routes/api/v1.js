///
/// @copyright 2015 Adam Meily <meily.adam@gmail.com>
///

var express = require('express');
var router = express.Router();
var trees = express.Router();
var history = express.Router();
var files = express.Router();
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



trees.get('*', function(req, res) {
  var namespace = cleanUrl(req.path);
  var limit = req.query.limit || req.body.limit || null;
  var skip = req.query.skip || req.body.skip || null;
  var cursor = models.TreeDescriptor.find({ namespace: namespace }).sort({ name: 1 });

  if(_.isNumber(limit)) {
    cursor = cursor.limit(limit);
  }

  if(_.isNumber(skip)) {
    cursor = cursor.skip(skip);
  }

  cursor.stream({
    transform: function(doc) {
      return JSON.stringify(doc.toClient()) + "\n";
    }
  }).pipe(res);

  return;
});


/*
router.get('/trees/*', function(req, res) {
  if(format == 'history') {
    return streamHistory(req, res);
  } else if(format == 'dir') {
    return streamDirListing(req, res);
  }
});
*/

///
/// Download a file or its metadata, based on the format query parameter.
///
files.get("*", function(req, res) {
  var format = req.query.format || req.body.format || null;
  if(!_.isString(format)) {
    format = null;
  }

  getFileDescriptor(req, function(err, file) {
    if(err) {
      // the quiery was invalid if an error occurred
      logger.info("invalid query for file %s: %s", req.path, err.toString());
      res.status(400).json({ error: "invalid query: " + err.toString()});
    } else if(file == null) {
      // the file wasn't found based on the query
      logger.info("file not found: %s", req.path);
      res.status(404).json({ error: "file not found" });
    } else {
      // File exists, check the format
      if(format == "stat") {
        // Send metadata
        logger.info("get metadata: %s", req.path);
        res.json(file.toClient());
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

history.get('*', function (req, res) {
  var cursor = models.FileDescriptor.find({ url: cleanUrl(req.path) }).sort({ _id: -1 });
  var limit = parseInt(req.query.limit || req.body.limit || null);
  var skip = parseInt(req.query.skip || req.body.skip || null);

  if(!_.isNaN(limit) && _.isNumber(limit)) {
    cursor = cursor.limit(limit);
  }

  if(!_.isNaN(skip) && _.isNumber(skip)) {
    cursor = cursor.skip(skip);
  }

  cursor.stream({
    transform: function(doc) {
      return JSON.stringify(doc.toClient()) + "\n";
    }
  }).pipe(res);

  return;
});

router.use('/trees', trees);
router.use('/history', history);
router.use('/files', files);


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
files.post("*", function(req, res) {
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
      version: 1,
      name: req.body.name || upload.originalname || path.basename(url) || "",
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
      var protect = false;
      if(req.body.protect) {
        if(_.isBoolean(req.body.protect)) {
          protect = req.body.protect;
        } else if(_.isString(req.body.protect)) {
          protect = req.body.protect.toLowerCase() == "true";
        }
      }

      models.TreeDescriptor.addFile(file);

      if(!apiKey && protect) {
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
        var json = file.toClient();
        if(apiKey) {
          json.apiKey = apiKey;
        }
        res.json(json);
      }
    });
  });
});


///
/// Make a symlink.
///
files.put('*', function(req, res) {
  var url = cleanUrl(req.path);
  // target file url
  var targetUrl = req.body.target;
  // target file version
  var version = null;
  // what to do, only symlink supported
  var action = req.body.action;
  // use api key
  var apiKey = req.body.apiKey;
  // query for link and target files
  var qLink, qTarget;
  // if the file is new, protect it or not
  var protect = req.body.protect;
  // if protect = true and apiKey = false and the file doesn't exist, this var
  // will hold the generated api key in clear text.
  var clearApiKey;

  if(url.length <= 1) {
    // the root is not a valid file
    logger.info("put: invalid/missing url");
    res.status(404).json({ error: "no file path specified" });
    return;
  }

  if(action != 'symlink') {
    logger.info("put: invalid action");
    res.status(400).json({ error: "invalid action: " + symlink });
    return;
  }

  if(!_.isString(targetUrl)) {
    logger.info("put: invalid target url");
    res.status(400).json({ error: "invalid target url" });
    return
  }

  qLink = { url: url };
  qTarget = { url: targetUrl };

  // validate the version number
  if(!_.isUndefined(req.body.version)) {
    version = parseInt(req.body.version);
    if(_.isNaN(version)) {
      logger.info("put: invalid target version");
      res.status(400).json({ error: "invalid version" });
      return;
    } else {
      // version number is valid
      qTarget.version = version;
    }
  }

  // first, retrieve the link file
  models.FileDescriptor.findOne(qLink).sort({ _id: -1 }).exec(function(err, link) {
    if(err) {
      // the quiery was invalid if an error occurred
      logger.info("invalid query for link %s: %s", url, err.toString());
      res.status(400).json({ error: "invalid link query: " + err.toString()});
      return;
    }

    if(link) {
      if(link.apiKey && !link.apiKeyMatches(apiKey)) {
        // file is API key protected and api key doesn't match
        logger.info("unauthorized upload to %s", url);
        res.status(401).json({ error: "link file is protected by api key" });
        return;
      }
    }

    // We found the link, find the target
    models.FileDescriptor.findOne(qTarget).sort({ _id: -1 }).exec(function(errT, target) {
      if(errT) {
        // the quiery was invalid if an error occurred
        logger.info("invalid query for target %s: %s", targetUrl, errT.toString());
        res.status(400).json({ error: "invalid target query: " + errT.toString()});
        return;
      }

      if(!target) {
        logger.info("target not found: %s v%s", targetUrl, version);
        res.status(404).json({ error: "target file not found" });
        return;
      }

      // We have link and we have target
      link = target.mklink({
        url: url,
        namespace: path.dirname(url),
        version: link ? link.version + 1 : 1
      });

      if(apiKey) {
        link.setApiKey(apiKey);
      } else if(protect) {
        clearApiKey = link.generateApiKey();
      }

      link.save(function(saveErr) {
        if(saveErr) {
          logger.error("failed to save link %s => %s[v%d]: %s", url, targetUrl,
                       version, saveErr);
          res.status(500).json({
            error: "failed to save link: " + saveErr.toString()
          });
        } else {
          var json = link.toClient();
          if(clearApiKey) {
            json.apiKey = clearApiKey;
          }

          models.TreeDescriptor.addFile(link);

          logger.info("created link: %s[%d] => %s[v%d]", url, link.version,
                      target.url, target.version);
          res.status(200).json(link);
        }
      });
    });
  });
});


module.exports = router;
