
const express = require("express");
const cors = require("cors");
const { PrismaClient } = require("@prisma/client");
const { randomBytes } = require("crypto");

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

// Test whether the API is running
app.get("/", (req, res) => {
  res.json({ message: "Roomie API is running!" });
});

// Create an apartment
app.post("/api/apartments", async (req, res) => {
  try {
    const { apartmentName, memberName } = req.body;

    if (
      typeof apartmentName !== "string" ||
      !apartmentName.trim() ||
      typeof memberName !== "string" ||
      !memberName.trim()
    ) {
      return res.status(400).json({
        error: "Apartment name and your name are required.",
      });
    }

    // Generate a unique apartment joining code
    let code;
    let exists = true;

    while (exists) {
      code = randomBytes(4).toString("hex").toUpperCase();

      exists = Boolean(
        await prisma.apartment.findUnique({
          where: { code },
        })
      );
    }

    // Create apartment and first member together
    const apartment = await prisma.apartment.create({
      data: {
        name: apartmentName.trim(),
        code,
        members: {
          create: {
            name: memberName.trim(),
          },
        },
      },
      include: {
        members: true,
      },
    });

    res.status(201).json({
      message: "Apartment created successfully!",
      apartment,
    });
  } catch (error) {
    console.error("Create apartment error:", error);
    res.status(500).json({
      error: "Could not create apartment.",
    });
  }
});

// Join an existing apartment
app.post("/api/apartments/join", async (req, res) => {
  try {
    const { code, memberName } = req.body;

    if (
      typeof code !== "string" ||
      !code.trim() ||
      typeof memberName !== "string" ||
      !memberName.trim()
    ) {
      return res.status(400).json({
        error: "Apartment code and your name are required.",
      });
    }

    const apartment = await prisma.apartment.findUnique({
      where: {
        code: code.trim().toUpperCase(),
      },
    });

    if (!apartment) {
      return res.status(404).json({
        error: "Apartment not found. Check the joining code.",
      });
    }

    const member = await prisma.member.create({
      data: {
        name: memberName.trim(),
        apartmentId: apartment.id,
      },
    });

    res.status(201).json({
      message: "You joined the apartment successfully!",
      apartment: {
        id: apartment.id,
        name: apartment.name,
        code: apartment.code,
      },
      member,
    });
  } catch (error) {
    console.error("Join apartment error:", error);
    res.status(500).json({
      error: "Could not join apartment.",
    });
  }
});

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`Roomie API running at http://localhost:${PORT}`);
});

// Close database connections gracefully
async function shutdown() {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);