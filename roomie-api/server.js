require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { PrismaClient } = require("@prisma/client");
const { randomBytes } = require("crypto");
const { GoogleGenAI } = require("@google/genai");
const multer = require("multer");

const app = express();
const prisma = new PrismaClient();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

const gemini = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

app.use(cors());
app.use(express.json());

app.post("/api/test-connection", (req, res) => {
  console.log("POST TEST REQUEST RECEIVED");
  res.json({ success: true, message: "Phone connected to Roomie API" });
});

// -------------------- Helpers --------------------

function parseCents(value) {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    String(value).trim() === ""
  ) {
    return null;
  }

  const amount = Number(value);

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  // Accept currency amounts with no more than two decimal places.
  if (!/^\d+(\.\d{1,2})?$/.test(String(value).trim())) {
    return null;
  }

  return Math.round(amount * 100);
}

function formatAmount(cents) {
  return Number((cents / 100).toFixed(2));
}

function toCents(value) {
  return Math.round(Number(value) * 100);
}

function errorResponse(res, error, message) {
  console.error(message, error);
  return res.status(500).json({ error: message });
}

// -------------------- Test API --------------------

app.get("/", (req, res) => {
  res.json({ message: "Roomie API is running!" });
});

// -------------------- Create Apartment --------------------

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

    let code;
    let exists = true;

    while (exists) {
      code = randomBytes(4).toString("hex").toUpperCase();

      exists = Boolean(
        await prisma.apartment.findUnique({ where: { code } })
      );
    }

    const apartment = await prisma.apartment.create({
      data: {
        name: apartmentName.trim(),
        code,
        members: {
          create: { name: memberName.trim() },
        },
      },
      include: { members: true },
    });

    res.status(201).json({
      message: "Apartment created successfully!",
      apartment,
    });
  } catch (error) {
    return errorResponse(res, error, "Could not create apartment.");
  }
});

// -------------------- Join Apartment --------------------

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
      where: { code: code.trim().toUpperCase() },
    });

    if (!apartment) {
      return res.status(404).json({
        error: "Apartment not found. Check the joining code.",
      });
    }

    const existingMember = await prisma.member.findFirst({
      where: {
        apartmentId: apartment.id,
        name: {
          equals: memberName.trim(),
          mode: "insensitive",
        },
      },
    });

    if (existingMember) {
      return res.status(409).json({
        error: "Username already exists. Please log in instead.",
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
    return errorResponse(res, error, "Could not join apartment.");
  }
});

// -------------------- Get Money Dashboard --------------------


app.get("/api/apartments/:code/money", async (req, res) => {
  try {
    const code = req.params.code.trim().toUpperCase();

    const apartment = await prisma.apartment.findUnique({
      where: { code },
      include: {
        members: {
          orderBy: { joinedAt: "asc" },
        },
        expenses: {
          orderBy: { createdAt: "desc" },
          include: {
            paidBy: true,
            shares: {
              include: { member: true },
            },
            contributionRequest: {
              include: {
                createdBy: true,
                contributions: {
                  include: { member: true },
                  orderBy: { createdAt: "asc" },
                },
              },
            },
          },
        },
        contributionRequests: {
          orderBy: { createdAt: "desc" },
          include: {
            createdBy: true,
            contributions: {
              include: { member: true },
              orderBy: { createdAt: "asc" },
            },
          },
        },
        receipts: {
          orderBy: { createdAt: "desc" },
          include: {
            uploader: {
              select: { id: true, name: true },
            },
            items: {
              orderBy: { createdAt: "asc" },
              include: {
                claims: {
                  include: {
                    member: {
                      select: { id: true, name: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!apartment) {
      return res.status(404).json({
        error: "Apartment not found.",
      });
    }

    // Format expenses without changing existing structures.
    const expenses = apartment.expenses.map((expense) => {
      const shares = expense.shares.map((share) => ({
        ...share,
        amount: Number(share.amount),
      }));

      let contributionRequest = null;

      if (expense.contributionRequest) {
        const request = expense.contributionRequest;

        const contributedCents = request.contributions.reduce(
          (sum, item) => sum + toCents(item.amount),
          0
        );

        const targetCents = toCents(request.targetAmount);

        contributionRequest = {
          ...request,
          currency: expense.currency,
          targetAmount: formatAmount(targetCents),
          contributedAmount: formatAmount(contributedCents),
          remainingAmount: formatAmount(
            Math.max(0, targetCents - contributedCents)
          ),
          contributions: request.contributions.map((item) => ({
            ...item,
            amount: Number(item.amount),
          })),
        };
      }

      return {
        ...expense,
        currency: expense.currency || "EUR",
        amount: Number(expense.amount),
        shares,
        contributionRequest,
      };
    });

    const contributionRequests = apartment.contributionRequests.map(
      (request) => {
        const contributedCents = request.contributions.reduce(
          (sum, item) => sum + toCents(item.amount),
          0
        );

        const targetCents = toCents(request.targetAmount);

        return {
          ...request,
          currency: request.currency || "EUR",
          targetAmount: formatAmount(targetCents),
          contributedAmount: formatAmount(contributedCents),
          remainingAmount: formatAmount(
            Math.max(0, targetCents - contributedCents)
          ),
          contributions: request.contributions.map((item) => ({
            ...item,
            amount: Number(item.amount),
          })),
        };
      }
    );

    const receipts = apartment.receipts.map((receipt) => ({
      ...receipt,
      currency: receipt.currency || "EUR",
      total: Number(receipt.total),
      items: receipt.items.map((item) => ({
        ...item,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        totalPrice: Number(item.totalPrice),
      })),
    }));

    // Separate records by currency.
    const currencyAccounts = {};

    for (const currency of ["EUR", "CZK"]) {
      const currencyExpenses = expenses.filter(
        (expense) => expense.currency === currency
      );

      const currencyRequests = contributionRequests.filter(
        (request) => request.currency === currency
      );

      const currencyReceipts = receipts.filter(
        (receipt) => receipt.currency === currency
      );

      // Calculate each member's net expense balance.
      // Positive = owed to member; negative = member owes.
      const memberBalances = apartment.members.map((member) => {
        let paidCents = 0;
        let shareCents = 0;

        for (const expense of currencyExpenses) {
          if (expense.paidById === member.id) {
            paidCents += toCents(expense.amount);
          }

          for (const share of expense.shares) {
            if (share.memberId === member.id) {
              shareCents += toCents(share.amount);
            }
          }
        }

        return {
          memberId: member.id,
          memberName: member.name,
          paidAmount: formatAmount(paidCents),
          shareAmount: formatAmount(shareCents),
          netBalance: formatAmount(paidCents - shareCents),
        };
      });

      currencyAccounts[currency] = {
        currency,
        expenses: currencyExpenses,
        contributionRequests: currencyRequests,
        receipts: currencyReceipts,
        memberBalances,
      };
    }

    return res.json({
      apartment: {
        id: apartment.id,
        name: apartment.name,
        code: apartment.code,
      },
      members: apartment.members,

      // Keep existing fields for compatibility.
      expenses,
      contributionRequests,
      receipts,

      // New currency-separated data.
      currencyAccounts,
    });
  } catch (error) {
    return errorResponse(
      res,
      error,
      "Could not load Money dashboard."
    );
  }
});

// -------------------- Add Expense --------------------

app.post("/api/apartments/:code/expenses", async (req, res) => {
  try {
    const code = req.params.code.trim().toUpperCase();
    const {
      title,
      amount,
      paidById,
      splitType = "EQUAL",
      customShares,
      currency = "EUR",
    } = req.body;
    if (!["EUR", "CZK"].includes(currency)) {
      return res.status(400).json({
        error: "Currency must be EUR or CZK.",
      });
    }

    if (typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ error: "Expense title is required." });
    }

    const totalCents = parseCents(amount);

    if (totalCents === null) {
      return res.status(400).json({
        error: "Enter a valid positive amount with up to two decimal places.",
      });
    }

    if (!["EQUAL", "CUSTOM"].includes(splitType)) {
      return res.status(400).json({
        error: "Split type must be EQUAL or CUSTOM.",
      });
    }

    const apartment = await prisma.apartment.findUnique({
      where: { code },
      include: { members: true },
    });

    if (!apartment) {
      return res.status(404).json({ error: "Apartment not found." });
    }

    const payer = apartment.members.find((member) => member.id === paidById);

    if (!payer) {
      return res.status(400).json({
        error: "The person who paid must belong to this apartment.",
      });
    }

    let shares = [];

    if (splitType === "EQUAL") {
      const members = apartment.members;

      if (members.length === 0) {
        return res.status(400).json({
          error: "Add roommates before splitting an expense.",
        });
      }

      const baseCents = Math.floor(totalCents / members.length);
      const remainder = totalCents % members.length;

      shares = members.map((member, index) => ({
        memberId: member.id,
        amount: formatAmount(baseCents + (index < remainder ? 1 : 0)),
      }));
    } else {
      if (!Array.isArray(customShares) || customShares.length === 0) {
        return res.status(400).json({
          error: "Provide the custom amount for each participating roommate.",
        });
      }

      const seen = new Set();

      for (const share of customShares) {
        if (
          !share ||
          typeof share.memberId !== "string" ||
          seen.has(share.memberId)
        ) {
          return res.status(400).json({
            error: "Each roommate can appear only once in custom shares.",
          });
        }

        seen.add(share.memberId);

        // Zero is allowed for a roommate who owes nothing.
        const raw = share.amount;
        const text = String(raw ?? "").trim();

        if (
          (typeof raw !== "number" && typeof raw !== "string") ||
          !/^\d+(\.\d{1,2})?$/.test(text) ||
          !Number.isFinite(Number(raw)) ||
          Number(raw) < 0
        ) {
          return res.status(400).json({
            error: "Custom shares must be valid amounts of zero or more.",
          });
        }

        if (!apartment.members.some((member) => member.id === share.memberId)) {
          return res.status(400).json({
            error: "Every selected roommate must belong to this apartment.",
          });
        }

        shares.push({
          memberId: share.memberId,
          amount: formatAmount(Math.round(Number(raw) * 100)),
        });
      }

      const sharesCents = shares.reduce(
        (sum, share) => sum + toCents(share.amount),
        0
      );

      if (sharesCents !== totalCents) {
        return res.status(400).json({
          error: "Custom shares must add up exactly to the expense total.",
          expenseAmount: formatAmount(totalCents),
          sharesTotal: formatAmount(sharesCents),
        });
      }
    }

    const expense = await prisma.expense.create({
      data: {
        title: title.trim(),
        amount: formatAmount(totalCents),
        currency,
        splitType,
        apartmentId: apartment.id,
        paidById: payer.id,
        shares: {
          create: shares,
        },
      },
      include: {
        paidBy: true,
        shares: { include: { member: true } },
      },
    });
    
    // Notify roommates who owe a share of this expense.
    // Notification failures must not undo a successful expense.
    try {
      const notifications = expense.shares
        .filter(
          (share) =>
            share.memberId !== payer.id &&
            Number(share.amount) > 0
        )
        .map((share) => ({
          apartmentId: apartment.id,
          recipientId: share.memberId,
          type: "EXPENSE_ADDED",
          title: "New shared expense",
          message:
            `${payer.name} added "${expense.title}" ` +
            `(${currency} ${Number(expense.amount).toFixed(2)}). ` +
            `Your share is ${currency} ${Number(share.amount).toFixed(2)}.`,
          targetScreen: "money",
          targetId: expense.id,
          isRead: false,
        }));

      if (notifications.length > 0) {
        await prisma.notification.createMany({
          data: notifications,
        });
      }
    } catch (notificationError) {
      console.error(
        "Expense saved, but notifications could not be created:",
        notificationError
      );
    }


    res.status(201).json({
      message: "Expense added successfully.",
      expense: {
        ...expense,
        amount: Number(expense.amount),
        shares: expense.shares.map((share) => ({
          ...share,
          amount: Number(share.amount),
        })),
      },
    });
  } catch (error) {
    return errorResponse(res, error, "Could not add expense.");
  }
});

// -------------------- Create Contribution Request --------------------

app.post(
  "/api/apartments/:code/contribution-requests",
  async (req, res) => {
    try {
      const code = req.params.code.trim().toUpperCase();
      const {
        title,
        targetAmount,
        createdById,
        currency = "EUR",
      } = req.body;

      if (!["EUR", "CZK"].includes(currency)) {
        return res.status(400).json({
          error: "Currency must be EUR or CZK.",
        });
      }
      const targetCents = parseCents(targetAmount);

      if (typeof title !== "string" || !title.trim()) {
        return res.status(400).json({
          error: "Contribution request title is required.",
        });
      }

      if (targetCents === null) {
        return res.status(400).json({
          error: "Enter a valid positive target amount.",
        });
      }

      const apartment = await prisma.apartment.findUnique({
        where: { code },
        include: { members: true },
      });

      if (!apartment) {
        return res.status(404).json({ error: "Apartment not found." });
      }

      const creator = apartment.members.find(
        (member) => member.id === createdById
      );

      if (!creator) {
        return res.status(400).json({
          error: "The creator must belong to this apartment.",
        });
      }

      const request = await prisma.$transaction(async (tx) => {
        const expense = await tx.expense.create({
          data: {
            title: title.trim(),
            amount: formatAmount(targetCents),
            currency,
            splitType: "CUSTOM",
            apartmentId: apartment.id,
            paidById: creator.id,
          },
        });

        return tx.contributionRequest.create({
          data: {
            title: title.trim(),
            targetAmount: formatAmount(targetCents),
            currency,
            apartmentId: apartment.id,
            createdById: creator.id,
            expenseId: expense.id,
          },
          include: {
            createdBy: true,
            contributions: true,
          },
        });
      });

      res.status(201).json({
        message: "Contribution request created successfully.",
        request: {
          ...request,
          targetAmount: Number(request.targetAmount),
          contributedAmount: 0,
          remainingAmount: formatAmount(targetCents),
        },
      });
    } catch (error) {
      return errorResponse(
        res,
        error,
        "Could not create contribution request."
      );
    }
  }
);

// -------------------- Add Contribution --------------------

app.post(
  "/api/apartments/:code/contribution-requests/:requestId/contributions",
  async (req, res) => {
    try {
      const code = req.params.code.trim().toUpperCase();
      const { requestId } = req.params;
      const { memberId, amount } = req.body;
      const contributionCents = parseCents(amount);

      if (contributionCents === null) {
        return res.status(400).json({
          error: "Enter a valid positive contribution amount.",
        });
      }

      const apartment = await prisma.apartment.findUnique({
        where: { code },
      });

      if (!apartment) {
        return res.status(404).json({ error: "Apartment not found." });
      }

      const member = await prisma.member.findFirst({
        where: {
          id: memberId,
          apartmentId: apartment.id,
        },
      });

      if (!member) {
        return res.status(400).json({
          error: "The contributor must belong to this apartment.",
        });
      }

      const result = await prisma.$transaction(
        async (tx) => {
          const request = await tx.contributionRequest.findFirst({
            where: {
              id: requestId,
              apartmentId: apartment.id,
            },
            include: { contributions: true },
          });

          if (!request) {
            throw new Error("CONTRIBUTION_REQUEST_NOT_FOUND");
          }

          const targetCents = toCents(request.targetAmount);
          const alreadyContributed = request.contributions.reduce(
            (sum, item) => sum + toCents(item.amount),
            0
          );
          const remainingCents = targetCents - alreadyContributed;

          if (remainingCents <= 0) {
            throw new Error("CONTRIBUTION_TARGET_REACHED");
          }

          if (contributionCents > remainingCents) {
            throw new Error("CONTRIBUTION_EXCEEDS_REMAINING");
          }

          const contribution = await tx.contribution.create({
            data: {
              requestId: request.id,
              memberId: member.id,
              amount: formatAmount(contributionCents),
            },
            include: { member: true },
          });

          const contributedCents = alreadyContributed + contributionCents;

          return {
            contribution,
            targetAmount: formatAmount(targetCents),
            contributedAmount: formatAmount(contributedCents),
            remainingAmount: formatAmount(targetCents - contributedCents),
          };
        },
        { isolationLevel: "Serializable" }
      );

      res.status(201).json({
        message: "Contribution recorded successfully.",
        ...result,
        contribution: {
          ...result.contribution,
          amount: Number(result.contribution.amount),
        },
      });
    } catch (error) {
      if (error.message === "CONTRIBUTION_REQUEST_NOT_FOUND") {
        return res.status(404).json({
          error: "Contribution request not found in this apartment.",
        });
      }

      if (error.message === "CONTRIBUTION_TARGET_REACHED") {
        return res.status(400).json({
          error: "This contribution target has already been reached.",
        });
      }

      if (error.message === "CONTRIBUTION_EXCEEDS_REMAINING") {
        return res.status(400).json({
          error: "That amount exceeds the remaining contribution target.",
        });
      }

      if (error.code === "P2034") {
        return res.status(409).json({
          error: "Another contribution was recorded at the same time. Please retry.",
        });
      }

      return errorResponse(res, error, "Could not record contribution.");
    }
  }
);

app.post("/api/apartments/login", async (req, res) => {
  try {
    const { code, memberName } = req.body;

    if (
      typeof code !== "string" ||
      !code.trim() ||
      typeof memberName !== "string" ||
      !memberName.trim()
    ) {
      return res.status(400).json({
        message: "Apartment code and username are required.",
      });
    }

    const apartment = await prisma.apartment.findUnique({
      where: {
        code: code.trim().toUpperCase(),
      },
    });

    if (!apartment) {
      return res.status(404).json({
        message: "Apartment not found. Check the apartment code.",
      });
    }

    const member = await prisma.member.findFirst({
      where: {
        apartmentId: apartment.id,
        name: {
          equals: memberName.trim(),
          mode: "insensitive",
        },
      },
    });

    if (!member) {
      return res.status(404).json({
        message: "Username not found in this apartment. Please join first.",
      });
    }

    return res.status(200).json({
      message: "Login successful!",
      apartment: {
        id: apartment.id,
        name: apartment.name,
        code: apartment.code,
      },
      member: {
        id: member.id,
        name: member.name,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      message: "Something went wrong while logging in.",
    });
  }
});
app.post(
  "/api/test-receipt-upload",
  (req, res, next) => {
    console.log("1. Receipt upload request reached Express");
    console.log("Content-Type:", req.headers["content-type"]);
    next();
  },
  upload.single("receipt"),
  (req, res) => {
    console.log("2. Multer finished processing the upload");

    if (!req.file) {
      console.log("No file received");
      return res.status(400).json({
        success: false,
        error: "No image file received",
      });
    }

    console.log({
      name: req.file.originalname,
      type: req.file.mimetype,
      size: req.file.size,
    });

    res.json({
      success: true,
      name: req.file.originalname,
      type: req.file.mimetype,
      size: req.file.size,
    });
  }
);



async function matchShoppingItemsWithGemini(shoppingItems, receiptItems) {
  if (!shoppingItems.length || !receiptItems.length) {
    return [];
  }

  console.log("\n===== GEMINI SHOPPING MATCH START =====");

  console.log(
    "Shopping items:",
    JSON.stringify(shoppingItems, null, 2)
  );

  console.log(
    "Receipt items:",
    JSON.stringify(receiptItems, null, 2)
  );

  const interaction = await gemini.interactions.create({
    model: "gemini-3.8-flash",
    input: [
      {
        type: "text",
        text: `
You are a multilingual product-matching assistant for
a shared apartment shopping application.

Your ONLY task is to identify which receipt products
correspond to products on the shopping list.

Shopping list:
${JSON.stringify(
          shoppingItems.map((item) => ({
            id: item.id,
            name: item.name,
            quantity: item.quantity,
          }))
        )}

Receipt products:
${JSON.stringify(
          receiptItems.map((item) => ({
            id: item.id,
            name: item.name,
            quantity: Number(item.quantity),
          }))
        )}

MATCHING RULES:

1. Match products by their meaning, not exact spelling.

2. Translate Czech, English, and other languages
   when necessary.

3. Ignore irrelevant descriptions such as weight,
   packaging size, and supermarket abbreviations,
   unless they distinguish different products.

4. Examples:
   - "Donut" matches "Donut s polevou čokoládovou | 55 g"
   - "Milk" matches "Mléko polotučné"
   - "Bread" matches "Chléb"
   - "Eggs" matches "Vejce"

5. A general shopping item can match a more specific product.
   Example: "Donut" can match "Chocolate Donut".

6. Do not match unrelated products.
   Example: "Chocolate" must not automatically
   match "Chocolate Donut".

7. Match products regardless of which roommate added
   the shopping item or uploaded the receipt.

8. Partial purchases are allowed.
   If the shopping list requests 3 donuts and
   the receipt contains 2 donuts, return the match.

9. Do NOT calculate remaining quantities.
   The backend handles quantity calculations.

10. Each receipt item can match at most one shopping item.
    Each shopping item can match at most one receipt item
    in this response.

11. Return only exact IDs from the supplied data.

12. If there is no reasonable match, return an empty array.

Return ONLY valid JSON:
{
  "matches": [
    {
      "shoppingItemId": "shopping item ID",
      "receiptItemId": "receipt product ID"
    }
  ]
}
        `,
      },
    ],
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: {
        type: "object",
        properties: {
          matches: {
            type: "array",
            items: {
              type: "object",
              properties: {
                shoppingItemId: { type: "string" },
                receiptItemId: { type: "string" },
              },
              required: ["shoppingItemId", "receiptItemId"],
            },
          },
        },
        required: ["matches"],
      },
    },
  });

  if (!interaction.output_text) {
    throw new Error("Gemini returned no shopping matches.");
  }

  console.log(
    "Raw Gemini response:",
    interaction.output_text
  );

  const result = JSON.parse(interaction.output_text);

  console.log(
    "Gemini proposed matches:",
    JSON.stringify(result.matches, null, 2)
  );

  console.log("===== GEMINI SHOPPING MATCH END =====\n");

  return Array.isArray(result.matches) ? result.matches : [];
}




// -------------------- Smart Receipt: Product Claims --------------------

app.post("/api/receipts/:id/finalize", async (req, res) => {
  try {
    const {
      apartmentCode,
      memberId,
      paidById,
    } = req.body;

    if (
      typeof apartmentCode !== "string" ||
      !apartmentCode.trim() ||
      typeof memberId !== "string" ||
      typeof paidById !== "string"
    ) {
      return res.status(400).json({
        error: "Apartment code, member ID, and payer are required.",
      });
    }

    const receipt = await prisma.receipt.findUnique({
      where: { id: req.params.id },
      include: {
        apartment: {
          include: { members: true },
        },
        items: {
          include: {
            claims: true,
          },
        },
        adjustments: true,
      },
    });

    if (!receipt) {
      return res.status(404).json({
        error: "Receipt not found.",
      });
    }

    if (
      receipt.apartment.code !==
      apartmentCode.trim().toUpperCase()
    ) {
      return res.status(403).json({
        error: "Receipt belongs to another apartment.",
      });
    }

    if (receipt.uploaderId !== memberId) {
      return res.status(403).json({
        error: "Only the receipt uploader can finalize it.",
      });
    }

    if (receipt.status !== "OPEN") {
      return res.status(409).json({
        error: "This receipt has already been finalized.",
      });
    }

    const payer = receipt.apartment.members.find(
      (member) => member.id === paidById
    );

    if (!payer) {
      return res.status(400).json({
        error: "Select a valid roommate who paid.",
      });
    }

    const rawCurrency = String(receipt.currency || "")
      .trim()
      .toUpperCase();

    let currency;

    if (["EUR", "€", "EURO", "EUROS"].includes(rawCurrency)) {
      currency = "EUR";
    } else if (
      ["CZK", "KČ", "KČ.", "KC", "CZ", "CZECH KORUNA"].includes(rawCurrency)
    ) {
      currency = "CZK";
    } else {
      return res.status(400).json({
        error: `Unsupported receipt currency: ${receipt.currency || "missing"}. Please correct the saved receipt currency.`,
      });
    }

    const totalCents = toCents(receipt.total);

    if (!Number.isSafeInteger(totalCents) || totalCents <= 0) {
      return res.status(400).json({
        error: "Receipt total is invalid.",
      });
    }

    const memberIds = new Set(
      receipt.apartment.members.map((member) => member.id)
    );

    const sharesByMember = new Map();
    let allocatedCents = 0;

    for (const item of receipt.items) {
      const itemCents = toCents(item.totalPrice);

      if (
        !Number.isSafeInteger(itemCents) ||
        itemCents < 0
      ) {
        return res.status(400).json({
          error: "Receipt contains an invalid product price.",
        });
      }

      const claimants = [
        ...new Set(
          item.claims.map((claim) => claim.memberId)
        ),
      ];

      if (claimants.some((id) => !memberIds.has(id))) {
        return res.status(400).json({
          error: "A product has an invalid claimant.",
        });
      }

      // Unclaimed products belong to the uploader.
      const participants = claimants.length
        ? claimants.sort()
        : [receipt.uploaderId];

      const baseCents = Math.floor(
        itemCents / participants.length
      );

      const remainder = itemCents % participants.length;

      participants.forEach((id, index) => {
        const amount =
          baseCents + (index < remainder ? 1 : 0);

        sharesByMember.set(
          id,
          (sharesByMember.get(id) || 0) + amount
        );
      });

      allocatedCents += itemCents;
    }

    // Receipt totals may include taxes, bags or rounding
    // not represented by individual scanned products.
    // Reconcile the actual amount paid with product allocations.
    // Calculate saved receipt adjustments.
    // Negative = discount, positive = additional charge.
    const adjustmentCents = receipt.adjustments.reduce(
      (sum, adjustment) => {
        if (adjustment.alreadyIncluded) return sum;
        return sum + toCents(adjustment.amount);
      },
      0
    );

    // Check whether products + adjustments match the actual payment.
    const expectedTotalCents = allocatedCents + adjustmentCents;

    if (expectedTotalCents !== totalCents) {
      return res.status(409).json({
        code: "RECEIPT_TOTAL_MISMATCH",
        error:
          "Product totals and saved adjustments do not match the receipt total. Please review the receipt.",
        productsTotal: formatAmount(allocatedCents),
        adjustmentsTotal: formatAmount(adjustmentCents),
        expectedTotal: formatAmount(expectedTotalCents),
        receiptTotal: formatAmount(totalCents),
      });
    }

    if (allocatedCents <= 0) {
      return res.status(400).json({
        error: "Cannot split a receipt without priced products.",
      });
    }

    // Distribute the final amount proportionally among roommates.
    const allocations = [...sharesByMember.entries()]
      .filter(([, cents]) => cents > 0)
      .map(([memberId, originalCents]) => {
        const exact = (originalCents * totalCents) / allocatedCents;
        const cents = Math.floor(exact);

        return {
          memberId,
          cents,
          fraction: exact - cents,
        };
      });

    let remaining =
      totalCents -
      allocations.reduce((sum, item) => sum + item.cents, 0);

    // Distribute remaining cents fairly.
    allocations.sort(
      (a, b) =>
        b.fraction - a.fraction ||
        a.memberId.localeCompare(b.memberId)
    );

    for (let i = 0; i < remaining; i++) {
      allocations[i].cents += 1;
    }

    sharesByMember.clear();

    for (const allocation of allocations) {
      sharesByMember.set(allocation.memberId, allocation.cents);
    }

    const shares = [...sharesByMember.entries()]
      .filter(([, cents]) => cents > 0)
      .map(([memberId, cents]) => ({
        memberId,
        amount: formatAmount(cents),
      }));

    if (
      shares.reduce(
        (sum, share) => sum + toCents(share.amount),
        0
      ) !== totalCents
    ) {
      return res.status(400).json({
        error: "Expense shares do not match receipt total.",
      });
    }

    const result = await prisma.$transaction(
      async (tx) => {
        // Claim the OPEN receipt inside the transaction.
        // A second simultaneous finalization cannot succeed.
        const updated = await tx.receipt.updateMany({
          where: {
            id: receipt.id,
            status: "OPEN",
          },
          data: {
            status: "FINALIZED",
          },
        });

        if (updated.count !== 1) {
          throw new Error("RECEIPT_ALREADY_FINALIZED");
        }

        const expense = await tx.expense.create({
          data: {
            title: receipt.store
              ? `Receipt - ${receipt.store}`
              : "Smart Receipt",
            amount: formatAmount(totalCents),
            currency,
            splitType: "CUSTOM",
            apartmentId: receipt.apartmentId,
            paidById: payer.id,
            shares: {
              create: shares,
            },
          },
          include: {
            paidBy: true,
            shares: {
              include: { member: true },
            },
          },
        });

        await tx.receipt.update({
          where: { id: receipt.id },
          data: {
            expenseId: expense.id,
          },
        });

        return expense;
      },
      { isolationLevel: "Serializable" }
    );

    return res.status(201).json({
      success: true,
      message: "Receipt finalized successfully.",
      expense: {
        ...result,
        amount: Number(result.amount),
        shares: result.shares.map((share) => ({
          ...share,
          amount: Number(share.amount),
        })),
      },
    });
  } catch (error) {
    if (error.message === "RECEIPT_ALREADY_FINALIZED") {
      return res.status(409).json({
        error: "This receipt has already been finalized.",
      });
    }

    if (error.code === "P2034") {
      return res.status(409).json({
        error: "Receipt was updated. Please try again.",
      });
    }

    console.error("Finalize receipt error:", error);

    return res.status(500).json({
      error: "Could not finalize receipt.",
    });
  }
});


app.post(
  "/api/receipts/:id/items/:itemId/claim",
  async (req, res) => {
    try {
      const { apartmentCode, memberId } = req.body;

      if (!apartmentCode || !memberId) {
        return res.status(400).json({
          error: "Apartment code and member ID are required.",
        });
      }

      const receipt = await prisma.receipt.findUnique({
        where: { id: req.params.id },
        include: {
          apartment: { include: { members: true } },
        },
      });

      if (!receipt) {
        return res.status(404).json({ error: "Receipt not found." });
      }

      if (
        receipt.apartment.code !==
        String(apartmentCode).trim().toUpperCase()
      ) {
        return res.status(403).json({
          error: "This receipt belongs to another apartment.",
        });
      }

      if (receipt.status !== "OPEN") {
        return res.status(409).json({
          error: "This receipt has already been finalized.",
        });
      }

      const member = receipt.apartment.members.find(
        (m) => m.id === memberId
      );

      if (!member) {
        return res.status(403).json({
          error: "You are not a member of this apartment.",
        });
      }

      const item = await prisma.receiptItem.findFirst({
        where: {
          id: req.params.itemId,
          receiptId: receipt.id,
        },
      });

      if (!item) {
        return res.status(404).json({
          error: "Product not found on this receipt.",
        });
      }

      const claim = await prisma.receiptClaim.upsert({
        where: {
          receiptItemId_memberId: {
            receiptItemId: item.id,
            memberId: member.id,
          },
        },
        update: {},
        create: {
          receiptItemId: item.id,
          memberId: member.id,
        },
        include: {
          member: { select: { id: true, name: true } },
        },
      });

      return res.status(200).json({
        success: true,
        message: "Product claimed successfully.",
        claim,
      });
    } catch (error) {
      console.error("Claim product error:", error);
      return res.status(500).json({
        error: "Could not claim this product.",
      });
    }
  }
);

app.delete(
  "/api/receipts/:id/items/:itemId/claim",
  async (req, res) => {
    try {
      const { apartmentCode, memberId } = req.body;

      if (!apartmentCode || !memberId) {
        return res.status(400).json({
          error: "Apartment code and member ID are required.",
        });
      }

      const receipt = await prisma.receipt.findUnique({
        where: { id: req.params.id },
        include: {
          apartment: { include: { members: true } },
        },
      });

      if (!receipt) {
        return res.status(404).json({ error: "Receipt not found." });
      }

      if (
        receipt.apartment.code !==
        String(apartmentCode).trim().toUpperCase()
      ) {
        return res.status(403).json({
          error: "This receipt belongs to another apartment.",
        });
      }

      if (receipt.status !== "OPEN") {
        return res.status(409).json({
          error: "This receipt has already been finalized.",
        });
      }

      const member = receipt.apartment.members.find(
        (m) => m.id === memberId
      );

      if (!member) {
        return res.status(403).json({
          error: "You are not a member of this apartment.",
        });
      }

      const result = await prisma.receiptClaim.deleteMany({
        where: {
          receiptItemId: req.params.itemId,
          memberId: member.id,
          receiptItem: {
            receiptId: receipt.id,
          },
        },
      });

      return res.json({
        success: true,
        message: result.count
          ? "Product claim removed."
          : "You had not claimed this product.",
      });
    } catch (error) {
      console.error("Remove product claim error:", error);
      return res.status(500).json({
        error: "Could not remove this product claim.",
      });
    }
  }
);

app.post("/api/receipts", async (req, res) => {
  try {
    const {
      apartmentCode,
      uploaderId,
      store,
      currency,
      total,
      items,
      adjustments = [],
    } = req.body;
    if (
      !apartmentCode ||
      !uploaderId ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      return res.status(400).json({
        error: "Apartment code, uploader, and receipt items are required.",
      });
    }

    const parsedTotal = Number(total);

    if (!Number.isFinite(parsedTotal) || parsedTotal <= 0) {
      return res.status(400).json({ error: "Invalid receipt total." });
    }

    const validItems = items.every((item) => {
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.unitPrice);
      const totalPrice = Number(item.totalPrice);

      return (
        typeof item.name === "string" &&
        item.name.trim().length > 0 &&
        Number.isFinite(quantity) &&
        quantity > 0 &&
        Number.isFinite(unitPrice) &&
        unitPrice >= 0 &&
        Number.isFinite(totalPrice) &&
        totalPrice >= 0
      );
    });

    if (!validItems) {
      return res.status(400).json({ error: "Invalid receipt products." });
    }
    if (!Array.isArray(adjustments)) {
      return res.status(400).json({
        error: "Receipt adjustments must be an array.",
      });
    }

    const allowedTypes = [
      "DISCOUNT",
      "REFUND",
      "DEPOSIT",
      "CHARGE",
      "TAX_ADJUSTMENT",
      "OTHER",
    ];

    const validAdjustments = adjustments.every((adjustment) =>
      adjustment &&
      typeof adjustment.description === "string" &&
      adjustment.description.trim().length > 0 &&
      allowedTypes.includes(adjustment.type) &&
      typeof adjustment.amount === "number" &&
      Number.isFinite(adjustment.amount) &&
      Math.abs(adjustment.amount) <= 99999999.99 &&
      typeof adjustment.alreadyIncluded === "boolean"
    );

    if (!validAdjustments) {
      return res.status(400).json({
        error: "Invalid receipt adjustment.",
      });
    }

    const apartment = await prisma.apartment.findUnique({
      where: { code: String(apartmentCode).trim().toUpperCase() },
      include: { members: true },
    });

    if (!apartment) {
      return res.status(404).json({ error: "Apartment not found." });
    }

    const uploader = apartment.members.find(
      (member) => member.id === uploaderId
    );

    if (!uploader) {
      return res.status(403).json({
        error: "Uploader is not a member of this apartment.",
      });
    }

    const receipt = await prisma.receipt.create({
      data: {
        store: typeof store === "string" ? store : null,
        currency: typeof currency === "string" ? currency : "EUR",
        total: parsedTotal.toFixed(2),
        apartmentId: apartment.id,
        uploaderId: uploader.id,
        items: {
          create: items.map((item) => ({
            name: item.name.trim(),
            quantity: Number(item.quantity).toFixed(3),
            unitPrice: Number(item.unitPrice).toFixed(2),
            totalPrice: Number(item.totalPrice).toFixed(2),
          })),
        },
        adjustments: {
          create: adjustments.map((adjustment) => ({
            description: adjustment.description.trim(),
            type: adjustment.type,
            amount: Number(adjustment.amount).toFixed(2),
            alreadyIncluded: adjustment.alreadyIncluded,
          })),
        },
      },
      include: {
        uploader: {
          select: { id: true, name: true },
        },
        items: true,
        adjustments: true,
      },
    });



    // Match receipt products to shopping items and track quantities.
    // Receipt saving must succeed even if matching fails.
    let shoppingMatches = [];
    let shoppingMatchingStatus = "completed";

    try {
      const pendingShoppingItems = await prisma.shoppingItem.findMany({
        where: {
          apartmentId: apartment.id,
          isPurchased: false,
          manuallyCompleted: false,
        },
        select: {
          id: true,
          name: true,
          quantity: true,
          requiredQuantity: true,
          purchasedQuantity: true,
        },
      });

      if (pendingShoppingItems.length > 0) {
        const proposedMatches = await matchShoppingItemsWithGemini(
          pendingShoppingItems,
          receipt.items
        );

        const validShoppingIds = new Set(
          pendingShoppingItems.map((item) => item.id)
        );

        const receiptItemsById = new Map(
          receipt.items.map((item) => [item.id, item])
        );

        const usedShoppingIds = new Set();
        const usedReceiptIds = new Set();

        for (const match of proposedMatches) {
          if (
            !match ||
            !validShoppingIds.has(match.shoppingItemId) ||
            !receiptItemsById.has(match.receiptItemId) ||
            usedShoppingIds.has(match.shoppingItemId) ||
            usedReceiptIds.has(match.receiptItemId)
          ) {
            continue;
          }

          const shoppingItem = pendingShoppingItems.find(
            (item) => item.id === match.shoppingItemId
          );

          const receiptItem = receiptItemsById.get(match.receiptItemId);

          const required = Number(shoppingItem.requiredQuantity);
          const previouslyPurchased = Number(shoppingItem.purchasedQuantity);
          const receiptQuantity = Number(receiptItem.quantity);

          if (
            !Number.isFinite(required) ||
            required <= 0 ||
            !Number.isFinite(receiptQuantity) ||
            receiptQuantity <= 0
          ) {
            continue;
          }

          const remaining = Math.max(0, required - previouslyPurchased);
          const quantityToApply = Math.min(remaining, receiptQuantity);
          console.log("Shopping quantity calculation:", {
            shoppingItemId: shoppingItem.id,
            required,
            previouslyPurchased,
            receiptQuantity,
            remaining,
            quantityToApply,
          });

          if (quantityToApply <= 0) continue;

          const newPurchasedQuantity =
            previouslyPurchased + quantityToApply;

          const completed = newPurchasedQuantity >= required;

          await prisma.$transaction(async (tx) => {
            await tx.shoppingPurchase.create({
              data: {
                shoppingItemId: shoppingItem.id,
                receiptItemId: receiptItem.id,
                quantity: quantityToApply,
              },
            });

            await tx.shoppingItem.update({
              where: { id: shoppingItem.id },
              data: {
                purchasedQuantity: newPurchasedQuantity,
                isPurchased: completed,
                purchasedAt: completed ? new Date() : null,
                matchedReceiptItemId: receiptItem.id,
              },
            });
          });

          usedShoppingIds.add(match.shoppingItemId);
          usedReceiptIds.add(match.receiptItemId);

          shoppingMatches.push({
            shoppingItemId: shoppingItem.id,
            receiptItemId: receiptItem.id,
            purchasedQuantity: quantityToApply,
            remainingQuantity: Math.max(
              0,
              required - newPurchasedQuantity
            ),
            completed,
          });
        }
      }
    } catch (matchingError) {
      console.error("Shopping list auto-match error:", matchingError);
      shoppingMatchingStatus = "failed";
    }



    return res.status(201).json({
      success: true,
      receipt,
      shoppingMatches,
      shoppingMatchingStatus,
    });

  } catch (error) {
    console.error("Create receipt error:", error);
    return res.status(500).json({ error: "Could not save receipt." });
  }
});

app.get("/api/receipts/:id", async (req, res) => {
  try {
    const { apartmentCode, memberId } = req.query;

    if (!apartmentCode || !memberId) {
      return res.status(400).json({
        error: "Apartment code and member ID are required.",
      });
    }

    const receipt = await prisma.receipt.findUnique({
      where: { id: req.params.id },
      include: {
        apartment: { select: { code: true, members: true } },
        uploader: { select: { id: true, name: true } },
        adjustments: {
          orderBy: { createdAt: "asc" },
        },
        items: {
          orderBy: { createdAt: "asc" },
          include: {
            claims: {
              include: {
                member: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });

    if (
      !receipt ||
      receipt.apartment.code !==
      String(apartmentCode).trim().toUpperCase()
    ) {
      return res.status(404).json({ error: "Receipt not found." });
    }

    const isMember = receipt.apartment.members.some(
      (member) => member.id === String(memberId)
    );

    if (!isMember) {
      return res.status(403).json({
        error: "You are not a member of this apartment.",
      });
    }

    return res.json({
      success: true,
      receipt: {
        ...receipt,
        apartment: { code: receipt.apartment.code },
      },
    });
  } catch (error) {
    console.error("Get receipt error:", error);
    return res.status(500).json({ error: "Could not load receipt." });
  }
});


app.delete("/api/receipts/:id", async (req, res) => {
  try {
    const { apartmentCode, memberId } = req.body;

    if (!apartmentCode || !memberId) {
      return res.status(400).json({
        error: "Apartment code and member ID are required.",
      });
    }

    const receipt = await prisma.receipt.findUnique({
      where: { id: req.params.id },
      include: {
        apartment: {
          select: {
            code: true,
            members: {
              select: { id: true },
            },
          },
        },
      },
    });

    if (!receipt) {
      return res.status(404).json({
        error: "Receipt not found.",
      });
    }

    if (
      receipt.apartment.code !==
      String(apartmentCode).trim().toUpperCase()
    ) {
      return res.status(403).json({
        error: "This receipt belongs to another apartment.",
      });
    }

    const isMember = receipt.apartment.members.some(
      (member) => member.id === memberId
    );

    if (!isMember) {
      return res.status(403).json({
        error: "You are not a member of this apartment.",
      });
    }

    if (receipt.uploaderId !== memberId) {
      return res.status(403).json({
        error: "Only the person who uploaded this receipt can delete it.",
      });
    }

    if (receipt.status !== "OPEN") {
      return res.status(409).json({
        error: "Only receipts with open claims can be deleted.",
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.receiptClaim.deleteMany({
        where: {
          receiptItem: {
            receiptId: receipt.id,
          },
        },
      });

      await tx.receiptItem.deleteMany({
        where: {
          receiptId: receipt.id,
        },
      });

      await tx.receipt.delete({
        where: { id: receipt.id },
      });
    });

    return res.json({
      success: true,
      message: "Receipt and its claims deleted successfully.",
    });
  } catch (error) {
    console.error("Delete receipt error:", error);

    return res.status(500).json({
      error: "Could not delete receipt.",
    });
  }
});



// ========================================
// SHARED SHOPPING LIST API
// ========================================

// Get all shopping items for an apartment
app.get("/api/apartments/:code/shopping", async (req, res) => {
  try {
    const apartment = await prisma.apartment.findUnique({
      where: { code: req.params.code.trim().toUpperCase() },
      include: {
        shoppingItems: {
          include: {
            addedBy: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!apartment) {
      return res.status(404).json({ error: "Apartment not found." });
    }

    return res.json({
      apartmentId: apartment.id,
      apartmentName: apartment.name,
      items: apartment.shoppingItems,
    });
  } catch (error) {
    console.error("Get shopping list error:", error);
    return res.status(500).json({ error: "Could not load shopping list." });
  }
});


// Add a new shopping item
app.post("/api/apartments/:code/shopping", async (req, res) => {
  try {
    const { name, quantity, memberId } = req.body;

    if (typeof name !== "string" || !name.trim() || !memberId) {
      return res.status(400).json({
        error: "Product name and member ID are required.",
      });
    }

    // Convert the entered quantity into a number.
    // Examples: "3" -> 3, "2 litres" -> 2, "1.5 kg" -> 1.5
    const quantityText = String(quantity ?? "1").trim() || "1";
    const quantityMatch = quantityText.match(/^(\d+(?:[.,]\d+)?)/);

    if (!quantityMatch) {
      return res.status(400).json({
        error: "Quantity must start with a number, for example 3 or 2 litres.",
      });
    }

    const requiredQuantity = Number(
      quantityMatch[1].replace(",", ".")
    );

    if (
      !Number.isFinite(requiredQuantity) ||
      requiredQuantity <= 0 ||
      requiredQuantity > 9999999.999
    ) {
      return res.status(400).json({
        error: "Enter a valid quantity greater than zero.",
      });
    }

    const apartment = await prisma.apartment.findUnique({
      where: { code: req.params.code.trim().toUpperCase() },
      include: { members: { select: { id: true } } },
    });

    if (!apartment) {
      return res.status(404).json({
        error: "Apartment not found.",
      });
    }

    if (!apartment.members.some((member) => member.id === memberId)) {
      return res.status(403).json({
        error: "You are not a member of this apartment.",
      });
    }

    const item = await prisma.shoppingItem.create({
      data: {
        name: name.trim(),
        quantity: quantityText,
        requiredQuantity: requiredQuantity,
        purchasedQuantity: 0,
        isPurchased: false,
        apartmentId: apartment.id,
        addedById: memberId,
      },
    });

    return res.status(201).json(item);
  } catch (error) {
    console.error("Add shopping item error:", error);
    return res.status(500).json({
      error: "Could not add shopping item.",
    });
  }
});


// Update product name, quantity, or purchased status

app.patch("/api/apartments/:code/shopping/:itemId", async (req, res) => {
  try {
    const { memberId, name, quantity, isPurchased } = req.body;

    const apartment = await prisma.apartment.findUnique({
      where: { code: req.params.code.trim().toUpperCase() },
      include: { members: { select: { id: true } } },
    });

    if (!apartment) {
      return res.status(404).json({ error: "Apartment not found." });
    }

    if (!apartment.members.some((member) => member.id === memberId)) {
      return res.status(403).json({ error: "Not an apartment member." });
    }

    const existingItem = await prisma.shoppingItem.findFirst({
      where: {
        id: req.params.itemId,
        apartmentId: apartment.id,
      },
    });

    if (!existingItem) {
      return res.status(404).json({ error: "Shopping item not found." });
    }

    const updates = {};

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ error: "Invalid product name." });
      }

      updates.name = name.trim();
    }

    if (quantity !== undefined) {
      const quantityText = String(quantity).trim();
      const match = quantityText.match(/^(\d+(?:[.,]\d+)?)/);

      if (!match) {
        return res.status(400).json({
          error: "Quantity must start with a number.",
        });
      }

      const required = Number(match[1].replace(",", "."));

      if (
        !Number.isFinite(required) ||
        required <= 0 ||
        required > 9999999.999
      ) {
        return res.status(400).json({
          error: "Invalid quantity.",
        });
      }

      updates.quantity = quantityText;
      updates.requiredQuantity = required;
    }

    if (isPurchased !== undefined) {
      if (typeof isPurchased !== "boolean") {
        return res.status(400).json({
          error: "Invalid purchased status.",
        });
      }

      // Manual completion is separate from receipt purchases.
      updates.manuallyCompleted = isPurchased;
    }

    const item = await prisma.$transaction(async (tx) => {
      // Lock the item against concurrent manual updates.
      await tx.$queryRaw`
        SELECT id FROM "ShoppingItem"
        WHERE id = ${existingItem.id}
        FOR UPDATE
      `;

      const current = await tx.shoppingItem.findUniqueOrThrow({
        where: { id: existingItem.id },
      });

      const required = Number(
        updates.requiredQuantity ?? current.requiredQuantity
      );

      // Preserve all quantities already recorded by receipts.
      const receiptTotals = await tx.shoppingPurchase.aggregate({
        where: { shoppingItemId: current.id },
        _sum: { quantity: true },
      });

      const receiptPurchased = Number(
        receiptTotals._sum.quantity ?? 0
      );

      const hasValidRequired =
        Number.isFinite(required) && required > 0;

      const manuallyCompleted =
        updates.manuallyCompleted ?? current.manuallyCompleted;

      const completedByReceipt =
        hasValidRequired && receiptPurchased >= required;

      const completed =
        manuallyCompleted || completedByReceipt;

      const purchasedQuantity = hasValidRequired
        ? completed
          ? required
          : Math.min(required, receiptPurchased)
        : receiptPurchased;

      const purchasedAt = completed
        ? current.purchasedAt ?? new Date()
        : null;

      return tx.shoppingItem.update({
        where: { id: current.id },
        data: {
          ...updates,
          isPurchased: completed,
          purchasedQuantity,
          purchasedAt,
        },
      });
    });

    return res.json(item);
  } catch (error) {
    console.error("Update shopping item error:", error);

    return res.status(500).json({
      error: "Could not update shopping item.",
    });
  }
});

// Delete a shopping item
app.delete("/api/apartments/:code/shopping/:itemId", async (req, res) => {
  try {
    const { memberId } = req.body;

    const apartment = await prisma.apartment.findUnique({
      where: { code: req.params.code.trim().toUpperCase() },
      include: { members: { select: { id: true } } },
    });

    if (!apartment) {
      return res.status(404).json({ error: "Apartment not found." });
    }

    if (!apartment.members.some((member) => member.id === memberId)) {
      return res.status(403).json({ error: "Not an apartment member." });
    }

    const result = await prisma.shoppingItem.deleteMany({
      where: {
        id: req.params.itemId,
        apartmentId: apartment.id,
      },
    });

    if (result.count === 0) {
      return res.status(404).json({ error: "Shopping item not found." });
    }

    return res.json({ success: true, message: "Shopping item deleted." });
  } catch (error) {
    console.error("Delete shopping item error:", error);
    return res.status(500).json({ error: "Could not delete shopping item." });
  }
});



// -------------------- Who Owes Whom / Repayments --------------------

app.get('/api/apartments/:code/debts', async (req, res) => {
  try {
    const code = String(req.params.code || '').trim().toUpperCase();
    const memberId = String(req.query.memberId || '');

    const apartment = await prisma.apartment.findUnique({
      where: { code },
      include: {
        members: { select: { id: true, name: true } },
      },
    });

    if (!apartment) {
      return res.status(404).json({ error: 'Apartment not found.' });
    }

    if (!apartment.members.some(m => m.id === memberId)) {
      return res.status(403).json({
        error: 'Member does not belong to this apartment.',
      });
    }

    const expenses = await prisma.expense.findMany({
      where: {
        apartmentId: apartment.id,
        contributionRequest: { is: null },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        paidBy: { select: { id: true, name: true } },
        shares: {
          include: {
            member: { select: { id: true, name: true } },
          },
        },
        repayments: {
          orderBy: { createdAt: 'desc' },
          include: {
            fromMember: { select: { id: true, name: true } },
            toMember: { select: { id: true, name: true } },
          },
        },
      },
    });

    const debts = [];

    for (const expense of expenses) {
      for (const share of expense.shares) {
        if (share.memberId === expense.paidById) continue;

        const originalCents = toCents(share.amount);

        const payments = expense.repayments.filter(
          r => r.fromMemberId === share.memberId
        );

        const repaidCents = payments
          .filter(r => r.status === 'CONFIRMED')
          .reduce((sum, r) => sum + toCents(r.amount), 0);

        const pendingCents = payments
          .filter(r => r.status === 'PENDING')
          .reduce((sum, r) => sum + toCents(r.amount), 0);

        debts.push({
          expenseId: expense.id,
          expenseTitle: expense.title,
          currency: expense.currency || 'EUR',
          createdAt: expense.createdAt,
          fromMember: share.member,
          toMember: expense.paidBy,
          originalAmount: formatAmount(originalCents),
          repaidAmount: formatAmount(repaidCents),
          pendingAmount: formatAmount(pendingCents),
          remainingAmount: formatAmount(
            Math.max(0, originalCents - repaidCents)
          ),
          repayments: payments.map(r => ({
            id: r.id,
            status: r.status,
            amount: Number(r.amount),
            createdAt: r.createdAt,
            fromMember: r.fromMember,
            toMember: r.toMember,
          })),
        });
      }
    }

    return res.json({ debts });
  } catch (error) {
    return errorResponse(
      res,
      error,
      'Could not load roommate debts.'
    );
  }
});

// -------------------- Submit Repayment --------------------

app.post(
  '/api/apartments/:code/expenses/:expenseId/repayments',
  async (req, res) => {
    const amountCents = parseCents(req.body?.amount);
    const fromMemberId = req.body?.fromMemberId;
    const actingMemberId = req.body?.memberId;

    if (amountCents === null) {
      return res.status(400).json({
        error: 'Enter a positive repayment amount with up to two decimals.',
      });
    }

    if (
      typeof fromMemberId !== 'string' ||
      typeof actingMemberId !== 'string'
    ) {
      return res.status(400).json({
        error: 'Member ID and repaying roommate ID are required.',
      });
    }

    if (actingMemberId !== fromMemberId) {
      return res.status(403).json({
        error: 'Only the debtor can record this repayment.',
      });
    }

    try {
      const code = String(req.params.code || '')
        .trim()
        .toUpperCase();

      const result = await prisma.$transaction(
        async tx => {
          const apartment = await tx.apartment.findUnique({
            where: { code },
          });

          if (!apartment) {
            throw new Error('APARTMENT_NOT_FOUND');
          }

          const expense = await tx.expense.findFirst({
            where: {
              id: req.params.expenseId,
              apartmentId: apartment.id,
              contributionRequest: { is: null },
            },
            include: {
              shares: true,
              repayments: true,
            },
          });

          if (!expense) {
            throw new Error('EXPENSE_NOT_FOUND');
          }

          if (expense.paidById === fromMemberId) {
            throw new Error('PAYER_CANNOT_REPAY');
          }

          const share = expense.shares.find(
            s => s.memberId === fromMemberId
          );

          if (!share) {
            throw new Error('DEBT_NOT_FOUND');
          }

          const reservedCents = expense.repayments
            .filter(
              r =>
                r.fromMemberId === fromMemberId &&
                ['PENDING', 'CONFIRMED'].includes(r.status)
            )
            .reduce(
              (sum, r) => sum + toCents(r.amount),
              0
            );

          const availableCents =
            toCents(share.amount) - reservedCents;

          if (amountCents > availableCents) {
            throw new Error('REPAYMENT_EXCEEDS_DEBT');
          }

          const repayment = await tx.expenseRepayment.create({
            data: {
              expenseId: expense.id,
              fromMemberId,
              toMemberId: expense.paidById,
              amount: formatAmount(amountCents),
              status: 'PENDING',
            },
          });
          const sender = await tx.member.findUnique({
            where: { id: fromMemberId },
            select: { name: true },
          });

          await tx.notification.create({
            data: {
              apartmentId: apartment.id,
              recipientId: expense.paidById,
              type: "REPAYMENT_REQUEST",
              title: "Payment awaiting confirmation",
              message: `${sender?.name || "A roommate"} recorded a repayment of ${expense.currency === "CZK" ? "Kč" : "€"
                }${formatAmount(amountCents)} for ${expense.title}.`,
              targetScreen: "debts",
              targetId: repayment.id,
            },
          });

          return {
            repayment: {
              ...repayment,
              amount: Number(repayment.amount),
            },
            currency: expense.currency || 'EUR',
            remainingAmount: formatAmount(availableCents),
          };
        },
        { isolationLevel: 'Serializable' }
      );

      return res.status(201).json({
        message: 'Repayment submitted for payer confirmation.',
        ...result,
      });
    } catch (error) {
      const errors = {
        APARTMENT_NOT_FOUND: [404, 'Apartment not found.'],
        EXPENSE_NOT_FOUND: [404, 'Expense not found or is a contribution target.'],
        PAYER_CANNOT_REPAY: [400, 'The original payer cannot repay themselves.'],
        DEBT_NOT_FOUND: [400, 'This roommate has no share in the expense.'],
        REPAYMENT_EXCEEDS_DEBT: [400, 'Repayment exceeds the remaining debt.'],
      };

      if (errors[error.message]) {
        const [status, message] = errors[error.message];
        return res.status(status).json({ error: message });
      }

      if (error.code === 'P2034') {
        return res.status(409).json({
          error: 'Debt changed during repayment. Please retry.',
        });
      }

      return errorResponse(
        res,
        error,
        'Could not record repayment.'
      );
    }
  }
);

// -------------------- Confirm or Reject Repayment --------------------

app.patch(
  '/api/apartments/:code/repayments/:repaymentId/decision',
  async (req, res) => {
    const memberId = String(req.body?.memberId || '');
    const decision = String(req.body?.decision || '').toUpperCase();

    if (!['CONFIRMED', 'REJECTED'].includes(decision)) {
      return res.status(400).json({
        error: 'Decision must be CONFIRMED or REJECTED.',
      });
    }

    try {
      const result = await prisma.$transaction(
        async tx => {
          const apartment = await tx.apartment.findUnique({
            where: {
              code: String(req.params.code || '')
                .trim()
                .toUpperCase(),
            },
          });

          if (!apartment) {
            throw new Error('APARTMENT_NOT_FOUND');
          }

          const repayment = await tx.expenseRepayment.findFirst({
            where: {
              id: req.params.repaymentId,
              expense: {
                apartmentId: apartment.id,
              },
            },
          });

          if (!repayment) {
            throw new Error('REPAYMENT_NOT_FOUND');
          }

          if (repayment.toMemberId !== memberId) {
            throw new Error('NOT_PAYER');
          }

          if (repayment.status !== 'PENDING') {
            throw new Error('ALREADY_DECIDED');
          }

          const updated = await tx.expenseRepayment.updateMany({
            where: {
              id: repayment.id,
              status: 'PENDING',
            },
            data: { status: decision },
          });

          if (updated.count !== 1) {
            throw new Error('ALREADY_DECIDED');
          }
          const expense = await tx.expense.findUnique({
            where: { id: repayment.expenseId },
            select: {
              title: true,
              currency: true,
            },
          });

          const payer = await tx.member.findUnique({
            where: { id: repayment.toMemberId },
            select: { name: true },
          });

          const confirmed = decision === "CONFIRMED";

          await tx.notification.create({
            data: {
              apartmentId: apartment.id,
              recipientId: repayment.fromMemberId,
              type: confirmed
                ? "REPAYMENT_CONFIRMED"
                : "REPAYMENT_REJECTED",
              title: confirmed
                ? "Repayment confirmed"
                : "Repayment rejected",
              message: `${payer?.name || "Your roommate"} ${confirmed ? "confirmed" : "rejected"
                } your repayment of ${expense?.currency === "CZK" ? "Kč" : "€"
                }${Number(repayment.amount).toFixed(2)} for ${expense?.title || "an expense"
                }.`,
              targetScreen: "debts",
              targetId: repayment.id,
            },
          });

          return {
            repaymentId: repayment.id,
            status: decision,
          };
        },
        { isolationLevel: 'Serializable' }
      );

      return res.json(result);
    } catch (error) {
      const errors = {
        APARTMENT_NOT_FOUND: [404, 'Apartment not found.'],
        REPAYMENT_NOT_FOUND: [404, 'Repayment not found.'],
        NOT_PAYER: [403, 'Only the original expense payer can decide.'],
        ALREADY_DECIDED: [409, 'This repayment has already been decided.'],
      };

      if (errors[error.message]) {
        const [status, message] = errors[error.message];
        return res.status(status).json({ error: message });
      }

      if (error.code === 'P2034') {
        return res.status(409).json({
          error: 'Please retry.',
        });
      }

      return errorResponse(
        res,
        error,
        'Could not decide repayment.'
      );
    }
  }
);

// -------------------- Notification Center --------------------

// Verify that the requested member belongs to the apartment.
async function findNotificationMember(code, memberId) {
  if (typeof memberId !== "string" || !memberId.trim()) {
    return null;
  }

  const apartment = await prisma.apartment.findUnique({
    where: { code: String(code).trim().toUpperCase() },
  });

  if (!apartment) return null;

  const member = await prisma.member.findFirst({
    where: {
      id: memberId,
      apartmentId: apartment.id,
    },
  });

  return member ? { apartment, member } : null;
}

// GET notifications
app.get("/api/apartments/:code/notifications", async (req, res) => {
  try {
    const context = await findNotificationMember(
      req.params.code,
      req.query.memberId
    );

    if (!context) {
      return res.status(403).json({
        error: "Invalid apartment or member.",
      });
    }

    const where = {
      apartmentId: context.apartment.id,
      recipientId: context.member.id,
    };

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.notification.count({
        where: { ...where, isRead: false },
      }),
    ]);

    return res.json({ notifications, unreadCount });
  } catch (error) {
    return errorResponse(res, error, "Could not load notifications.");
  }
});

// Mark one notification as read
app.patch(
  "/api/apartments/:code/notifications/:id/read",
  async (req, res) => {
    try {
      const context = await findNotificationMember(
        req.params.code,
        req.body?.memberId
      );

      if (!context) {
        return res.status(403).json({
          error: "Invalid apartment or member.",
        });
      }

      const result = await prisma.notification.updateMany({
        where: {
          id: req.params.id,
          apartmentId: context.apartment.id,
          recipientId: context.member.id,
        },
        data: { isRead: true },
      });

      if (result.count === 0) {
        return res.status(404).json({
          error: "Notification not found.",
        });
      }

      return res.json({ success: true });
    } catch (error) {
      return errorResponse(res, error, "Could not update notification.");
    }
  }
);

// Mark all notifications as read
app.patch(
  "/api/apartments/:code/notifications/read-all",
  async (req, res) => {
    try {
      const context = await findNotificationMember(
        req.params.code,
        req.body?.memberId
      );

      if (!context) {
        return res.status(403).json({
          error: "Invalid apartment or member.",
        });
      }

      const result = await prisma.notification.updateMany({
        where: {
          apartmentId: context.apartment.id,
          recipientId: context.member.id,
          isRead: false,
        },
        data: { isRead: true },
      });

      return res.json({
        success: true,
        updatedCount: result.count,
      });
    } catch (error) {
      return errorResponse(res, error, "Could not mark notifications as read.");
    }
  }
);

app.post(
  "/api/receipts/read",
  upload.single("receipt"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: "No receipt image uploaded.",
        });
      }

      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
      });

      console.time("FAST_GEMINI_SCAN");

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash-lite",
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: req.file.mimetype,
                  data: req.file.buffer.toString("base64"),
                },
              },
              {
                text: `
Read this shopping receipt carefully.

Extract:
1. Store name and currency.
2. Every purchased item, quantity, unit price, and line total.
3. Final amount payable.
4. Discounts, coupons, refunds, deposits, and extra charges.
5. Tax information shown on the receipt.

IMPORTANT RULES:
- Extract every purchased product and its final charged line price.
- Product-specific discounts must be reflected in the affected
  product's totalPrice.
- Do not report a product-specific discount as an additional
  receipt-wide adjustment.
- Only include separate receipt-wide discounts, refunds,
  deposits, and charges in adjustments.
- If a discount is already reflected in product prices,
  do not subtract it again.
- VAT/DPH already included in prices is informational only.
- Use negative amounts for deductions and positive amounts
  for additional charges.
- Set alreadyIncluded to true when an adjustment is
  already reflected in the extracted product totals.
- Do not invent missing values.
- Use null for unknown prices.
- Return valid JSON matching the supplied schema.
                `,
              },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              store: { type: "STRING", nullable: true },
              currency: { type: "STRING", nullable: true },

              items: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    name: { type: "STRING" },
                    quantity: { type: "NUMBER", nullable: true },
                    unitPrice: { type: "NUMBER", nullable: true },
                    totalPrice: { type: "NUMBER", nullable: true },
                  },
                  required: [
                    "name",
                    "quantity",
                    "unitPrice",
                    "totalPrice",
                  ],
                },
              },

              adjustments: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    description: { type: "STRING" },
                    type: {
                      type: "STRING",
                      enum: [
                        "DISCOUNT",
                        "REFUND",
                        "DEPOSIT",
                        "CHARGE",
                        "TAX_ADJUSTMENT",
                        "OTHER",
                      ],
                    },
                    amount: { type: "NUMBER" },
                    alreadyIncluded: { type: "BOOLEAN" },
                  },
                  required: [
                    "description",
                    "type",
                    "amount",
                    "alreadyIncluded",
                  ],
                },
              },

              tax: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    rate: { type: "NUMBER", nullable: true },
                    amount: { type: "NUMBER", nullable: true },
                    includedInTotal: { type: "BOOLEAN" },
                  },
                  required: ["rate", "amount", "includedInTotal"],
                },
              },

              total: { type: "NUMBER", nullable: true },
            },

            required: [
              "store",
              "currency",
              "items",
              "adjustments",
              "tax",
              "total",
            ],
          },
          temperature: 0,
          maxOutputTokens: 4096,
        },
      });

      console.timeEnd("FAST_GEMINI_SCAN");

      const receipt = JSON.parse(response.text);
      function validateReceipt(receipt) {
        const round = (value) =>
          Math.round((value + Number.EPSILON) * 100) / 100;

        const items = receipt.items || [];
        const adjustments = receipt.adjustments || [];

        const hasUnknownPrices = items.some(
          (item) =>
            typeof item.totalPrice !== "number" ||
            !Number.isFinite(item.totalPrice)
        );

        const itemsTotal = round(
          items.reduce(
            (sum, item) =>
              sum +
              (Number.isFinite(item.totalPrice)
                ? item.totalPrice
                : 0),
            0
          )
        );

        const adjustmentsTotal = round(
          adjustments.reduce((sum, adjustment) => {
            if (adjustment.alreadyIncluded) return sum;

            const amount = Number(adjustment.amount);

            return sum + (Number.isFinite(amount) ? amount : 0);
          }, 0)
        );

        const calculatedTotal = round(
          itemsTotal + adjustmentsTotal
        );

        const receiptTotal = receipt.total;

        const hasInvalidAdjustments = adjustments.some(
          (adjustment) =>
            typeof adjustment.amount !== "number" ||
            !Number.isFinite(adjustment.amount) ||
            typeof adjustment.alreadyIncluded !== "boolean"
        );

        const canValidate =
          items.length > 0 &&
          !hasUnknownPrices &&
          !hasInvalidAdjustments &&
          typeof receiptTotal === "number" &&
          Number.isFinite(receiptTotal);

        const difference = canValidate
          ? round(calculatedTotal - receiptTotal)
          : null;

        return {
          status: !canValidate
            ? "REVIEW_REQUIRED"
            : Math.abs(difference) <= 0.02
              ? "MATCHED"
              : "MISMATCH",

          itemsTotal,
          adjustmentsTotal,
          calculatedTotal,
          receiptTotal,
          difference,
        };
      }

      receipt.validation = validateReceipt(receipt);

      return res.json({
        success: true,
        receipt,
      });
    } catch (error) {
      console.error("Fast receipt error:", error);

      return res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : "Fast receipt scanning failed.",
      });
    }
  }
);
// -------------------- Profile Photo Routes --------------------
const profilePhotoRoutes = require('./roomie_profile_photo_routes');
app.use('/uploads', express.static('uploads'));

app.use('/api/apartments', profilePhotoRoutes);

/* =========================================================
   ROOMIE - APARTMENT ACTIVITY FEED
   GET /api/apartments/:code/activity
   ========================================================= */

app.get('/api/apartments/:code/activity', async (req, res) => {
  try {
    const apartment = await prisma.apartment.findUnique({
      where: {
        code: req.params.code,
      },
      select: {
        id: true,
      },
    });

    if (!apartment) {
      return res.status(404).json({
        error: 'Apartment not found',
      });
    }

    // Fetch recent apartment activities
    const [expenses, receipts, shopping, repayments] =
      await Promise.all([
        prisma.expense.findMany({
          where: {
            apartmentId: apartment.id,
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 12,
          select: {
            id: true,
            title: true,
            createdAt: true,
            paidBy: {
              select: {
                name: true,
              },
            },
          },
        }),

        prisma.receipt.findMany({
          where: {
            apartmentId: apartment.id,
            status: 'FINALIZED',
          },
          orderBy: {
            updatedAt: 'desc',
          },
          take: 12,
          select: {
            id: true,
            store: true,
            updatedAt: true,
            uploader: {
              select: {
                name: true,
              },
            },
          },
        }),

        prisma.shoppingItem.findMany({
          where: {
            apartmentId: apartment.id,
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 12,
          select: {
            id: true,
            name: true,
            createdAt: true,
            addedBy: {
              select: {
                name: true,
              },
            },
          },
        }),

        prisma.expenseRepayment.findMany({
          where: {
            expense: {
              apartmentId: apartment.id,
            },
            status: 'CONFIRMED',
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 12,
          select: {
            id: true,
            createdAt: true,
            fromMember: {
              select: {
                name: true,
              },
            },
          },
        }),
      ]);

    // Convert records into activity events
    const activity = [
      ...expenses.map((x) => ({
        id: `expense:${x.id}`,
        type: 'expense',
        title: `${x.paidBy.name} added an expense`,
        detail: x.title,
        createdAt: x.createdAt,
        screen: 'money',
      })),

      ...receipts.map((x) => ({
        id: `receipt:${x.id}`,
        type: 'receipt',
        title: `${x.uploader.name} finalized a receipt`,
        detail: x.store || 'Receipt',
        createdAt: x.updatedAt,
        screen: 'receipt',
      })),

      ...shopping.map((x) => ({
        id: `shopping:${x.id}`,
        type: 'shopping',
        title: `${x.addedBy.name} added to shopping`,
        detail: x.name,
        createdAt: x.createdAt,
        screen: 'shopping',
      })),

      ...repayments.map((x) => ({
        id: `repayment:${x.id}`,
        type: 'repayment',
        title: `${x.fromMember.name}'s repayment was confirmed`,
        detail: 'Payment confirmed',
        createdAt: x.createdAt,
        screen: 'money',
      })),
    ];

    // Newest activities first
    activity.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() -
        new Date(a.createdAt).getTime()
    );

    return res.json({
      activity: activity.slice(0, 15),
    });
  } catch (err) {
    console.error('Apartment activity error:', err);

    return res.status(500).json({
      error: 'Could not load apartment activity',
    });
  }
});

require('./chores_routes')(app, prisma);



// -------------------- Start Server --------------------

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`Roomie API running at http://localhost:${PORT}`);
});

async function shutdown() {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
