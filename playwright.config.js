// Config for the LIVE selector check. Not used by the mock e2e scripts (those are plain node).
module.exports = {
  testDir: 'test',
  testMatch: /selector-check\.spec\.js/,
  timeout: 90_000,
  workers: 1,
  reporter: [['list']]
};
