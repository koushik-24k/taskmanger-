const Datastore = require('@seald-io/nedb');
const path = require('path');

const dbDir = path.join(__dirname, 'data');

// One datastore per "table", auto-persisted to files
const db = {
  users:    new Datastore({ filename: path.join(dbDir, 'users.db'),    autoload: true }),
  posts:    new Datastore({ filename: path.join(dbDir, 'posts.db'),    autoload: true }),
  comments: new Datastore({ filename: path.join(dbDir, 'comments.db'), autoload: true }),
};

// Ensure unique indexes
db.users.ensureIndex({ fieldName: 'username', unique: true });
db.users.ensureIndex({ fieldName: 'email',    unique: true });
db.posts.ensureIndex({ fieldName: 'slug',     unique: true });

module.exports = db;
