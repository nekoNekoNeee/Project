const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const User = require('./models/User');
const Post = require('./models/Post');
const bcrypt = require('bcryptjs');
const app = express();
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const uploadMiddleware = multer({ dest: 'uploads/' });
const fs = require('fs');

const salt = bcrypt.genSaltSync(10);
const secret = ' jabhcflsidjkadsfhjkdslhfkdjs';

app.use(cors({
  credentials: true,
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE'], // Specify allowed methods
  allowedHeaders: ['Content-Type', 'Authorization'], // Specify allowed headers
}));
app.use(express.json());
app.use(cookieParser());
app.use('/uploads', express.static(__dirname + '/uploads'));

// Connect to MongoDB
mongoose.connect('mongodb+srv://user:drowssap@cluster0.sjitezo.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log('Connected to MongoDB');
  createAdminUser(); // Create admin user if it doesn't exist
}).catch((err) => {
  console.error('Error connecting to MongoDB:', err);
});

// Function to create an admin user if it doesn't exist
async function createAdminUser() {
  const adminUsername = 'admin';
  const adminPassword = 'admin';
  const adminRole = 'admin';

  try {
    const existingAdmin = await User.findOne({ username: adminUsername });
    if (!existingAdmin) {
      const hashedPassword = bcrypt.hashSync(adminPassword, salt);
      const adminUser = new User({
        username: adminUsername,
        password: hashedPassword,
        role: adminRole,
      });

      await adminUser.save();
      console.log('Admin user created with username:', adminUsername);
    } else {
      console.log('Admin user already exists.');
    }
  } catch (error) {
    console.error('Error creating admin user:', error);
  }
}

// Register route
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    const userDoc = await User.create({
      username,
      password: bcrypt.hashSync(password, salt),
      role: 'user',
    });
    res.json(userDoc);
  } catch (e) {
    console.error('Error registering user:', e);
    res.status(400).json({ error: 'User registration failed' });
  }
});

// Login route
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const userDoc = await User.findOne({ username });
    if (!userDoc) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    const passOk = bcrypt.compareSync(password, userDoc.password);
    if (passOk) {
      jwt.sign({ username, id: userDoc._id, role: userDoc.role }, secret, {}, (err, token) => {
        if (err) {
          console.error('Error creating token:', err);
          res.status(500).json({ error: 'Internal server error' });
          return;
        }
        res.cookie('token', token).json({ id: userDoc._id, username, role: userDoc.role });
      });
    } else {
      res.status(400).json({ error: 'Invalid username or password' });
    }
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Profile route
app.get('/profile', (req, res) => {
  const { token } = req.cookies;
  jwt.verify(token, secret, {}, (err, info) => {
    if (err) {
      console.error('Error verifying token:', err);
      return res.status(401).json({ error: 'Invalid token' });
    }
    res.json(info);
  });
});

// Logout route
app.post('/logout', (req, res) => {
  res.cookie('token', '').json('ok');
});

// Post creation route
app.post('/post', uploadMiddleware.single('file'), async (req, res) => {
  const { originalname, path } = req.file;
  const ext = originalname.split('.').pop();
  const newPath = `${path}.${ext}`;
  fs.renameSync(path, newPath);

  const { token } = req.cookies;
  jwt.verify(token, secret, {}, async (err, info) => {
    if (err) {
      console.error('Error verifying token:', err);
      return res.status(401).json({ error: 'Invalid token' });
    }

    try {
      const { title, summary, content } = req.body;
      const postDoc = await Post.create({
        title,
        summary,
        content,
        cover: newPath,
        author: info.id,
      });
      res.json(postDoc);
    } catch (error) {
      console.error('Error creating post:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
});

// Get all posts route
app.get('/post', async (req, res) => {
  try {
    const posts = await Post.find()
      .populate('author', ['username'])
      .sort({ createdAt: -1 })
      .limit(20);
    res.json(posts);
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Post update route
app.put('/post', uploadMiddleware.single('file'), async (req, res) => {
  let newPath = null;
  if (req.file) {
    const { originalname, path } = req.file;
    const ext = originalname.split('.').pop();
    newPath = `${path}.${ext}`;
    fs.renameSync(path, newPath);
  }

  const { token } = req.cookies;
  jwt.verify(token, secret, {}, async (err, info) => {
    if (err) {
      console.error('Error verifying token:', err);
      return res.status(401).json({ error: 'Invalid token' });
    }

    try {
      const { id, title, summary, content } = req.body;
      const postDoc = await Post.findById(id);
      if (!postDoc) {
        return res.status(404).json({ error: 'Post not found' });
      }

      if (String(postDoc.author) !== String(info.id)) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      postDoc.title = title;
      postDoc.summary = summary;
      postDoc.content = content;
      if (newPath) {
        postDoc.cover = newPath;
      }
      await postDoc.save();
      res.json(postDoc);
    } catch (error) {
      console.error('Error updating post:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
});

// Get single post by id route
app.get('/post/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const post = await Post.findById(id).populate('author', ['username']);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    res.json(post);
  } catch (error) {
    console.error('Error fetching post:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Define the isAdmin middleware
function isAdmin(req, res, next) {
  const { token } = req.cookies;
  if (!token) {
    return res.status(401).json({ error: 'Not authorized' });
  }

  jwt.verify(token, secret, (err, userInfo) => {
    if (err) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    if (userInfo.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    req.userInfo = userInfo;
    next();
  });
}

// Define the route for deleting a post
app.delete('/post/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const postDoc = await Post.findByIdAndDelete(id);

    if (!postDoc) {
      return res.status(404).json({ error: 'Post not found' });
    }

    res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    console.error('Error deleting post:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start the server
app.listen(4000, () => {
  console.log('Server running on http://localhost:4000');
});
