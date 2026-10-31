// Test harness only: this container has no IPv6, and hub-service listens on '::'.
const net = require('net');
const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function (opts, ...rest) {
  if (opts && typeof opts === 'object' && opts.host === '::') opts = { ...opts, host: '0.0.0.0' };
  return listen.call(this, opts, ...rest);
};
