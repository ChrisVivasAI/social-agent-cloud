// Polyfill SlowBuffer for Node 25+ (removed upstream, needed by jsonwebtoken/jwa)
const buffer = require("buffer");
if (!buffer.SlowBuffer) {
  buffer.SlowBuffer = buffer.Buffer;
}
