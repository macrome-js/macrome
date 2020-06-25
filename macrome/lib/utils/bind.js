function bindAll(obj, context = obj) {
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'function') {
      obj[key] = obj[key].bind(context);
    }
  }
  return obj;
}

module.exports = { bindAll };
