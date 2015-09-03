module.exports = {

  ///
  /// Web server port.
  ///
  port: 8080,

  ///
  /// MongoDB configuration.
  ///
  mongodb: "mongodb://localhost/raziel",

  ///
  /// Root storage location to hold file content. Relative paths will be
  /// relative to the base raziel directory.
  ///
  storage: "./uploads",


  log: {
    ///
    /// Log level, either "debug", "info", "warn", "error"
    ///
    level: "debug",

    ///
    /// Whether to output to stdout. Set this to `false` for production and/or
    /// daemon deployments.
    ///
    stdout: true
  }
};
