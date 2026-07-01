const express = require('express');
const db = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/comments/:postId — comments for a post
router.get('/:postId', async (req, res) => {
  try {
    const comments = await db.comments.findAsync({ post_id: req.params.postId }).sort({ created_at: 1 });

    // Enrich with author info
    const enriched = await Promise.all(comments.map(async (c) => {
      const author = await db.users.findOneAsync({ _id: c.author_id });
      return {
        ...c,
        id: c._id,
        author_name: author ? author.username : 'Unknown',
        author_avatar: author ? author.avatar : ''
      };
    }));

    res.json({ comments: enriched });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// POST /api/comments — add a comment (auth required)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { post_id, content } = req.body;
    if (!post_id || !content)
      return res.status(400).json({ error: 'Post ID and content are required' });
    if (!content.trim())
      return res.status(400).json({ error: 'Comment cannot be empty' });

    // Verify post exists
    const post = await db.posts.findOneAsync({ _id: post_id });
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const comment = await db.comments.insertAsync({
      post_id,
      author_id: req.user.id,
      content: content.trim(),
      created_at: new Date().toISOString()
    });

    const author = await db.users.findOneAsync({ _id: req.user.id });
    res.status(201).json({
      comment: {
        ...comment,
        id: comment._id,
        author_name: author ? author.username : 'Unknown',
        author_avatar: author ? author.avatar : ''
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to post comment' });
  }
});

// DELETE /api/comments/:id — delete (owner only)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const comment = await db.comments.findOneAsync({ _id: req.params.id });
    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    if (comment.author_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });

    await db.comments.removeAsync({ _id: req.params.id });
    res.json({ message: 'Comment deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

module.exports = router;
