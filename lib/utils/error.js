class MapError extends Error {
  constructor(generator, verb, path, destPath) {
    super();
    this.generator = generator;
    this.verb = verb;
    this.path = path;
    this.destPath = destPath;
    this.message = [
      `Failed to ${verb} ${path}`,
      `Generator: ${generator}`,
      `Input path: ${path}`,
      `DestinationPath: ${destPath}`,
    ].join('\n');
  }
}

module.exports = { MapError };
