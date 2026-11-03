const mongoose = require('mongoose');
mongoose.set('strictQuery', true);
module.exports = (uri) => mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
