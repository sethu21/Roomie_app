
module.exports = function registerChoresRoutes(app, prisma) {
  const base = '/api/apartments/:code';

  async function context(req, res) {
    const apartment = await prisma.apartment.findUnique({
      where: { code: String(req.params.code).trim().toUpperCase() },
      include: { members: { select: { id: true, name: true } } },
    });

    if (!apartment) {
      res.status(404).json({ error: 'Apartment not found.' });
      return null;
    }

    return apartment;
  }

  function validMember(apartment, id) {
    return apartment.members.some(m => m.id === id);
  }

  function fail(res, err) {
    console.error('Chores/board error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }

  const includeChore = {
    assignedTo: { select: { id: true, name: true } },
    createdBy: { select: { id: true, name: true } },
  };

  // GET ALL CHORES
  app.get(base + '/chores', async (req, res) => {
    try {
      const apartment = await context(req, res);
      if (!apartment) return;

      const chores = await prisma.chore.findMany({
        where: { apartmentId: apartment.id },
        include: includeChore,
        orderBy: { createdAt: 'desc' },
      });

      res.json({ chores, members: apartment.members });
    } catch (err) {
      fail(res, err);
    }
  });

  // CREATE CHORE
  app.post(base + '/chores', async (req, res) => {
    try {
      const apartment = await context(req, res);
      if (!apartment) return;

      const {
        title,
        memberId,
        assignment = 'RANDOM',
        assignedToId,
        frequency = 'ONCE',
      } = req.body;

      if (!validMember(apartment, memberId)) {
        return res.status(403).json({ error: 'Invalid roommate.' });
      }

      if (
        typeof title !== 'string' ||
        !title.trim() ||
        title.trim().length > 120
      ) {
        return res.status(400).json({
          error: 'Enter a title (up to 120 characters).',
        });
      }

      if (
        !['RANDOM', 'OPEN', 'MANUAL'].includes(assignment) ||
        !['ONCE', 'DAILY', 'WEEKLY'].includes(frequency)
      ) {
        return res.status(400).json({
          error: 'Invalid assignment or frequency.',
        });
      }

      let chosen = null;

      if (assignment === 'MANUAL') {
        if (!validMember(apartment, assignedToId)) {
          return res.status(400).json({
            error: 'Select a roommate.',
          });
        }

        chosen = assignedToId;
      } else if (assignment === 'RANDOM') {
        // Choose randomly among roommates with the fewest
        // unfinished assigned chores.
        const counts = await prisma.chore.groupBy({
          by: ['assignedToId'],
          where: {
            apartmentId: apartment.id,
            isCompleted: false,
            assignedToId: { not: null },
          },
          _count: { _all: true },
        });

        const byId = new Map(
          counts.map(c => [c.assignedToId, c._count._all])
        );

        const minimum = Math.min(
          ...apartment.members.map(m => byId.get(m.id) || 0)
        );

        const eligible = apartment.members.filter(
          m => (byId.get(m.id) || 0) === minimum
        );

        chosen =
          eligible[Math.floor(Math.random() * eligible.length)].id;
      }

      const chore = await prisma.chore.create({
        data: {
          title: title.trim(),
          frequency,
          apartmentId: apartment.id,
          createdById: memberId,
          assignedToId: chosen,
        },
        include: includeChore,
      });

      // Create a notification for the assigned roommate.
      if (chosen && chosen !== memberId) {
        try {
          await prisma.notification.create({
            data: {
              apartmentId: apartment.id,
              recipientId: chosen,
              type: 'CHORE_ASSIGNED',
              title: 'New chore assigned',
              message: `You have been assigned: ${chore.title}`,
              targetScreen: 'chores',
              targetId: chore.id,
            },
          });
        } catch (e) {
          console.error(
            'Chore created but notification failed:',
            e
          );
        }
      }

      res.status(201).json({ chore });
    } catch (err) {
      fail(res, err);
    }
  });

  // CLAIM, COMPLETE OR REOPEN A CHORE
  app.patch(base + '/chores/:id', async (req, res) => {
    try {
      const apartment = await context(req, res);
      if (!apartment) return;

      const { memberId, action } = req.body;

      if (!validMember(apartment, memberId)) {
        return res.status(403).json({
          error: 'Invalid roommate.',
        });
      }

      const chore = await prisma.chore.findFirst({
        where: {
          id: req.params.id,
          apartmentId: apartment.id,
        },
      });

      if (!chore) {
        return res.status(404).json({
          error: 'Chore not found.',
        });
      }

      let data;

      if (action === 'CLAIM') {
        if (chore.assignedToId || chore.isCompleted) {
          return res.status(409).json({
            error: 'Chore is no longer available.',
          });
        }

        // Prevent two roommates from claiming simultaneously.
        const updated = await prisma.chore.updateMany({
          where: {
            id: chore.id,
            assignedToId: null,
            isCompleted: false,
          },
          data: { assignedToId: memberId },
        });

        if (!updated.count) {
          return res.status(409).json({
            error: 'Someone already claimed this chore.',
          });
        }

        return res.json({
          chore: await prisma.chore.findUnique({
            where: { id: chore.id },
            include: includeChore,
          }),
        });
      } else if (action === 'COMPLETE') {
        if (chore.assignedToId !== memberId) {
          return res.status(403).json({
            error: 'Only the assigned roommate can complete this chore.',
          });
        }

        data = {
          isCompleted: true,
          completedAt: new Date(),
        };
      } else if (action === 'REOPEN') {
        if (
          chore.assignedToId !== memberId &&
          chore.createdById !== memberId
        ) {
          return res.status(403).json({
            error: 'Not allowed.',
          });
        }

        data = {
          isCompleted: false,
          completedAt: null,
        };
      } else {
        return res.status(400).json({
          error: 'Invalid action.',
        });
      }

      res.json({
        chore: await prisma.chore.update({
          where: { id: chore.id },
          data,
          include: includeChore,
        }),
      });
    } catch (err) {
      fail(res, err);
    }
  });

  // DELETE CHORE
  app.delete(base + '/chores/:id', async (req, res) => {
    try {
      const apartment = await context(req, res);
      if (!apartment) return;

      const memberId = req.body?.memberId;

      if (!validMember(apartment, memberId)) {
        return res.status(403).json({
          error: 'Invalid roommate.',
        });
      }

      const result = await prisma.chore.deleteMany({
        where: {
          id: req.params.id,
          apartmentId: apartment.id,
          createdById: memberId,
        },
      });

      if (!result.count) {
        return res.status(403).json({
          error: 'Only the creator can delete this chore.',
        });
      }

      res.json({ success: true });
    } catch (err) {
      fail(res, err);
    }
  });

  // GET APARTMENT BOARD NOTES
  app.get(base + '/board', async (req, res) => {
    try {
      const apartment = await context(req, res);
      if (!apartment) return;

      const notes = await prisma.boardNote.findMany({
        where: { apartmentId: apartment.id },
        include: {
          author: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      res.json({ notes });
    } catch (err) {
      fail(res, err);
    }
  });

  // CREATE STICKY NOTE
  app.post(base + '/board', async (req, res) => {
    try {
      const apartment = await context(req, res);
      if (!apartment) return;

      const {
        memberId,
        text,
        type = 'REMINDER',
      } = req.body;

      if (!validMember(apartment, memberId)) {
        return res.status(403).json({
          error: 'Invalid roommate.',
        });
      }

      if (
        typeof text !== 'string' ||
        !text.trim() ||
        text.trim().length > 500 ||
        !['NOTICE', 'REMINDER', 'QUESTION'].includes(type)
      ) {
        return res.status(400).json({
          error: 'Enter a note (up to 500 characters) and valid type.',
        });
      }

      const note = await prisma.boardNote.create({
        data: {
          apartmentId: apartment.id,
          authorId: memberId,
          text: text.trim(),
          type,
        },
        include: {
          author: { select: { id: true, name: true } },
        },
      });

      res.status(201).json({ note });
    } catch (err) {
      fail(res, err);
    }
  });

  // DELETE STICKY NOTE
  app.delete(base + '/board/:id', async (req, res) => {
    try {
      const apartment = await context(req, res);
      if (!apartment) return;

      const memberId = req.body?.memberId;

      if (!validMember(apartment, memberId)) {
        return res.status(403).json({
          error: 'Invalid roommate.',
        });
      }

      const result = await prisma.boardNote.deleteMany({
        where: {
          id: req.params.id,
          apartmentId: apartment.id,
          authorId: memberId,
        },
      });

      if (!result.count) {
        return res.status(403).json({
          error: 'Only the author can delete this note.',
        });
      }

      res.json({ success: true });
    } catch (err) {
      fail(res, err);
    }
  });
};
