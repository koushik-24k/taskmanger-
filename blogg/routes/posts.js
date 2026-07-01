const express = require('express');
const db = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Slug helpers
function slugify(title) {
  return title.toLowerCase().trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function uniqueSlug(title) {
  let slug = slugify(title);
  let existing = await db.posts.findOneAsync({ slug });
  let counter = 1;
  while (existing) {
    slug = `${slugify(title)}-${counter++}`;
    existing = await db.posts.findOneAsync({ slug });
  }
  return slug;
}

// Enrich a post with author info and comment count
async function enrichPost(post) {
  const author = await db.users.findOneAsync({ _id: post.author_id });
  const commentCount = await db.comments.countAsync({ post_id: post._id });
  return {
    ...post,
    id: post._id,
    author_name: author ? author.username : 'Unknown',
    author_avatar: author ? author.avatar : '',
    author_bio: author ? author.bio : '',
    comment_count: commentCount
  };
}

// GET /api/posts — all posts newest first
router.get('/', async (req, res) => {
  try {
    const posts = await db.posts.findAsync({}).sort({ created_at: -1 });
    const enriched = await Promise.all(posts.map(enrichPost));
    res.json({ posts: enriched });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

// GET /api/posts/user/:userId — posts by user
router.get('/user/:userId', async (req, res) => {
  try {
    const posts = await db.posts.findAsync({ author_id: req.params.userId }).sort({ created_at: -1 });
    const enriched = await Promise.all(posts.map(enrichPost));
    res.json({ posts: enriched });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

// GET /api/posts/:slug — single post
router.get('/:slug', async (req, res) => {
  try {
    const post = await db.posts.findOneAsync({ slug: req.params.slug });
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const enriched = await enrichPost(post);
    res.json({ post: enriched });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch post' });
  }
});

// POST /api/posts — create
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { title, content, excerpt, cover_image } = req.body;
    if (!title || !content || !excerpt)
      return res.status(400).json({ error: 'Title, content, and excerpt are required' });

    const slug = await uniqueSlug(title);
    const now = new Date().toISOString();
    const post = await db.posts.insertAsync({
      title, slug, content, excerpt,
      cover_image: cover_image || '',
      author_id: req.user.id,
      created_at: now,
      updated_at: now
    });
    const enriched = await enrichPost(post);
    res.status(201).json({ post: enriched });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// PUT /api/posts/:id — update (owner only)
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const post = await db.posts.findOneAsync({ _id: req.params.id });
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.author_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });

    const { title, content, excerpt, cover_image } = req.body;
    if (!title || !content || !excerpt)
      return res.status(400).json({ error: 'Title, content, and excerpt are required' });

    // Regenerate slug only if title changed
    let slug = post.slug;
    if (title !== post.title) slug = await uniqueSlug(title);

    await db.posts.updateAsync(
      { _id: req.params.id },
      { $set: { title, slug, content, excerpt, cover_image: cover_image || '', updated_at: new Date().toISOString() } }
    );
    const updated = await db.posts.findOneAsync({ _id: req.params.id });
    const enriched = await enrichPost(updated);
    res.json({ post: enriched });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update post' });
  }
});

// DELETE /api/posts/:id — delete (owner only)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const post = await db.posts.findOneAsync({ _id: req.params.id });
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.author_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });

    await db.posts.removeAsync({ _id: req.params.id });
    await db.comments.removeAsync({ post_id: req.params.id }, { multi: true });
    res.json({ message: 'Post deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

module.exports = router;
