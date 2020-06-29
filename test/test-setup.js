jest.mock('../lib/vcs-configs');

global.inspect = (value) => {
  // eslint-disable-next-line no-console
  console.log(value);
  return value;
};
