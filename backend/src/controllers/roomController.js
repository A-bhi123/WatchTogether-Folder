const { validationResult } = require('express-validator');
const Room = require('../models/Room');

// Generate a unique 6-character room code
const generateRoomCode = async () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code;
  let exists = true;
  while (exists) {
    code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    exists = await Room.findOne({ code });
  }
  return code;
};

const createRoom = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    const { name, isPrivate } = req.body;
    const code = await generateRoomCode();

    const room = await Room.create({
      name,
      code,
      host: req.user._id,
      isPrivate: isPrivate || false,
      participants: [{
        user: req.user._id,
        isHost: true,
      }],
    });

    await room.populate('host', 'name avatar avatarColor');

    res.status(201).json({ room });
  } catch (error) {
    next(error);
  }
};

const getRoom = async (req, res, next) => {
  try {
    const { code } = req.params;

    const room = await Room.findOne({ code: code.toUpperCase(), isActive: true })
      .populate('host', 'name avatar avatarColor')
      .populate('participants.user', 'name avatar avatarColor');

    if (!room) {
      return res.status(404).json({ message: 'Room not found or no longer active' });
    }

    res.json({ room });
  } catch (error) {
    next(error);
  }
};

const getUserRooms = async (req, res, next) => {
  try {
    const rooms = await Room.find({
      $or: [
        { host: req.user._id },
        { 'participants.user': req.user._id },
      ],
      isActive: true,
    })
      .populate('host', 'name avatar avatarColor')
      .sort({ updatedAt: -1 })
      .limit(20);

    res.json({ rooms });
  } catch (error) {
    next(error);
  }
};

const closeRoom = async (req, res, next) => {
  try {
    const { code } = req.params;
    const room = await Room.findOne({ code: code.toUpperCase() });

    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    if (room.host.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the host can close the room' });
    }

    room.isActive = false;
    await room.save();

    res.json({ message: 'Room closed successfully' });
  } catch (error) {
    next(error);
  }
};

module.exports = { createRoom, getRoom, getUserRooms, closeRoom };
