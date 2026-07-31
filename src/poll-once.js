require('dotenv').config();
const { pollPublishedEntries } = require('./lib/poller');

pollPublishedEntries()
  .then((result) => {
    console.log(result);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
