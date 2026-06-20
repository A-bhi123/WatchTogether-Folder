const express = require('express');
const { body } = require('express-validator');
const { createRoom, getRoom, getUserRooms, closeRoom } = require('../controllers/roomController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.post('/', [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Room name must be 2-100 characters'),
], createRoom);

router.get('/my', getUserRooms);
router.get('/:code', getRoom);
router.delete('/:code', closeRoom);

module.exports = router;
