const express = require('express');
const router = express.Router();
const { listTags } = require('../controllers/tagController');

router.get('/', listTags);

module.exports = router;
