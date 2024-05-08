const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const UserSchema = new Schema({
  username: {
    type: String,
    required: true,
    minLength: 4,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  //admin
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user',
    required: true,
  },
});

const UserModel = model('User', UserSchema);

module.exports = UserModel;
