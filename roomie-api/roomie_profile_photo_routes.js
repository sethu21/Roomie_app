
// Express router: mount at /api/apartments, after defining prisma and auth.
// IMPORTANT: This sample is suitable for a trusted prototype ONLY.
// Production must authenticate the caller and verify they own the memberId.

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const router = express.Router();

const uploadDir = path.join(process.cwd(), 'uploads', 'avatars');

fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),

  filename: (_req, file, cb) => {
    const ext = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
    }[file.mimetype] || '.bin';

    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 3 * 1024 * 1024,
  },

  fileFilter: (_req, file, cb) => {
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)
    ) {
      return cb(
        new Error('Only JPEG, PNG or WebP photos are supported')
      );
    }

    cb(null, true);
  },
});

// NOTE: Uploaded bytes are not transcoded or inspected.
// For production, use sharp to validate, re-encode,
// and strip metadata before public serving.

async function findMember(req) {
  return prisma.member.findFirst({
    where: {
      id: req.params.memberId,
      apartment: {
        code: req.params.code,
      },
    },
  });
}

// GET ALL ROOMMATES
router.get('/:code/members', async (req, res) => {
  try {
    const members = await prisma.member.findMany({
      where: {
        apartment: {
          code: req.params.code,
        },
      },

      select: {
        id: true,
        name: true,
        photoUrl: true,
      },

      orderBy: {
        name: 'asc',
      },
    });

    res.json({ members });
  } catch (err) {
    res.status(500).json({
      error: 'Could not load members',
    });
  }
});

// UPLOAD OR CHANGE PROFILE PHOTO
router.put(
  '/:code/members/:memberId/photo',
  upload.single('photo'),
  async (req, res) => {
    try {
      const member = await findMember(req);

      if (!member || !req.file) {
        if (req.file) {
          fs.unlink(req.file.path, () => {});
        }

        return res.status(404).json({
          error: 'Member or photo not found',
        });
      }

      const photoUrl =
        `/uploads/avatars/${req.file.filename}`;

      const updated = await prisma.member.update({
        where: {
          id: member.id,
        },

        data: {
          photoUrl,
        },
      });

      res.json({
        id: updated.id,
        photoUrl: updated.photoUrl,
      });
    } catch (err) {
      if (req.file) {
        fs.unlink(req.file.path, () => {});
      }

      res.status(500).json({
        error: 'Could not save profile photo',
      });
    }
  }
);

// REMOVE PROFILE PHOTO
router.delete(
  '/:code/members/:memberId/photo',
  async (req, res) => {
    try {
      const member = await findMember(req);

      if (!member) {
        return res.status(404).json({
          error: 'Member not found',
        });
      }

      await prisma.member.update({
        where: {
          id: member.id,
        },

        data: {
          photoUrl: null,
        },
      });

      res.json({
        photoUrl: null,
      });
    } catch (err) {
      res.status(500).json({
        error: 'Could not remove photo',
      });
    }
  }
);

module.exports = router;

