const Poll = require("../models/Poll");
const { POLL_STATUS } = require("../models/Poll");
const User = require("../models/User");
const sendMail = require("../utils/mailer");
const { parseDate } = require("../utils/dates");
const { schedulePoll, clearPollTimers } = require("../utils/scheduler");

exports.createPoll = async (req, res) => {
  try {
    const { title, description, choices, endsAt, startsAt, status } = req.body;

    if (!title || !description || !Array.isArray(choices) || choices.length < 2) {
      return res.status(400).json({ error: "Invalid poll data" });
    }

    const now = Date.now();

    const end = parseDate(endsAt);
    if (!end) {
      return res.status(400).json({ error: "Invalid end date" });
    }
    if (end.getTime() <= now) {
      return res.status(400).json({ error: "End date must be in the future" });
    }

    let start = null;
    if (startsAt !== undefined && startsAt !== null && startsAt !== "") {
      start = parseDate(startsAt);
      if (!start) {
        return res.status(400).json({ error: "Invalid start date" });
      }
      if (end.getTime() <= start.getTime()) {
        return res
          .status(400)
          .json({ error: "End date must be after the start date" });
      }
    }

    // Resolve the initial status:
    //  - explicit "draft"            -> draft (manual save, never auto-opens)
    //  - future startsAt             -> draft, auto-opens at startsAt (scheduled)
    //  - otherwise (default)         -> open (publish immediately)
    const isManualDraft = status === POLL_STATUS.DRAFT;
    const isScheduled = !isManualDraft && start && start.getTime() > now;

    let finalStatus;
    if (isManualDraft) {
      finalStatus = POLL_STATUS.DRAFT;
    } else if (isScheduled) {
      finalStatus = POLL_STATUS.DRAFT;
    } else {
      finalStatus = POLL_STATUS.OPEN;
    }

    const finalStartsAt = isManualDraft
      ? new Date(now)
      : isScheduled
        ? start
        : start || new Date(now);

    const poll = await Poll.create({
      title,
      description,
      choices: choices.map((c) => ({ text: c.text })),
      createdBy: req.user.id,
      startsAt: finalStartsAt,
      endsAt: end,
      status: finalStatus,
    });

    schedulePoll(req.app.get("io"), poll);

    // Only announce polls that are actually available for voting.
    if (poll.status === POLL_STATUS.OPEN) {
      const users = await User.find({ role: "user" }).select("email name");

      for (const u of users) {
        const html = `
          <h2>🗳️ New Poll Available!</h2>
          <p>Hello ${u.name},</p>

          <p>A new poll titled <strong>${poll.title}</strong> has been created.</p>

          <p>${poll.description}</p>

          <p><strong>Poll Ends:</strong> ${new Date(poll.endsAt).toLocaleString()}</p>

          <p>Log in to <strong>VoteX</strong> to participate.</p>

          <hr />
          <p style="font-size:12px;color:#777">
            You are receiving this email because you have an account on VoteX.
          </p>
        `;

        sendMail(u.email, "🗳️ New Poll Created", html);
      }
    }

    if (process.env.ADMIN_EMAIL) {
      const adminHtml = `
        <h2>🛠️ New Poll Created</h2>

        <p>A new poll has been created by an admin.</p>

        <ul>
          <li><strong>Title:</strong> ${poll.title}</li>
          <li><strong>Description:</strong> ${poll.description}</li>
          <li><strong>Status:</strong> ${poll.status}</li>
          <li><strong>Ends At:</strong> ${new Date(poll.endsAt).toLocaleString()}</li>
        </ul>

        <p>Login to the Admin Dashboard to manage this poll.</p>
      `;

      sendMail(
        process.env.ADMIN_EMAIL,
        `🛠️ New Poll Created: ${poll.title}`,
        adminHtml
      );
    }

    res.status(201).json({ ok: true, poll });
  } catch (err) {
    console.error("CREATE POLL ERROR:", err);
    res.status(500).json({ error: "Failed to create poll" });
  }
};

exports.getPolls = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = 5;
    const search = req.query.search || "";

    const query = search
      ? { title: { $regex: search, $options: "i" } }
      : {};

    const total = await Poll.countDocuments(query);

    const polls = await Poll.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({ polls, page, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: "Failed to load polls" });
  }
};

exports.getActivePolls = async (req, res) => {
  try {
    const now = new Date();

    const polls = await Poll.find({
      status: POLL_STATUS.OPEN,
      startsAt: { $lte: now },
      endsAt: { $gt: now },
    }).sort({ createdAt: -1 });

    res.json({ polls });
  } catch (err) {
    res.status(500).json({ error: "Failed to load polls" });
  }
};

exports.getHistoryPolls = async (req, res) => {
  try {
    const now = new Date();

    const polls = await Poll.find({
      status: { $ne: POLL_STATUS.DRAFT },
      $or: [
        { status: POLL_STATUS.CLOSED },
        { endsAt: { $lte: now } },
      ],
    }).sort({ createdAt: -1 });

    res.json({ polls });
  } catch (err) {
    res.status(500).json({ error: "Failed to load poll history" });
  }
};

exports.getPollById = async (req, res) => {
  try {
    const poll = await Poll.findById(req.params.id).populate(
      "votes.user",
      "name email"
    );

    if (!poll) return res.status(404).json({ error: "Poll not found" });

    res.json({ poll });
  } catch (err) {
    res.status(500).json({ error: "Failed to load poll" });
  }
};

exports.votePoll = async (req, res) => {
  try {
    const { choiceIndex } = req.body;
    const userId = req.user.id;

    const poll = await Poll.findById(req.params.id);
    if (!poll) return res.status(404).json({ error: "Poll not found" });

    const now = Date.now();

    if (poll.status === POLL_STATUS.DRAFT) {
      return res.status(400).json({ error: "Poll is not available yet" });
    }
    if (poll.status === POLL_STATUS.CLOSED) {
      return res.status(400).json({ error: "Poll closed" });
    }

    if (new Date(poll.startsAt).getTime() > now) {
      return res.status(400).json({ error: "Poll has not opened yet" });
    }
    if (new Date(poll.endsAt).getTime() <= now) {
      poll.status = POLL_STATUS.CLOSED;
      await poll.save();
      return res.status(400).json({ error: "Poll closed" });
    }

    if (
      typeof choiceIndex !== "number" ||
      choiceIndex < 0 ||
      choiceIndex >= poll.choices.length
    ) {
      return res.status(400).json({ error: "Invalid choice" });
    }

    if (poll.votes.some((v) => v.user.toString() === userId)) {
      return res.status(400).json({ error: "You already voted" });
    }

    poll.votes.push({ user: userId, choiceIndex });
    await poll.save();

    const user = await User.findByIdAndUpdate(
      userId,
      {
        $push: {
          voteHistory: {
            pollId: poll._id,
            choiceIndex,
          },
        },
      },
      { new: true }
    );

    const html = `
      <h2> Vote Confirmed</h2>

      <p>Hello ${user.name},</p>

      <p>Your vote has been successfully recorded.</p>

      <p><strong>Poll:</strong> ${poll.title}</p>
      <p><strong>Your Choice:</strong> ${poll.choices[choiceIndex].text}</p>

      <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>

      <hr />
      <p style="font-size:12px;color:#777">
        This email confirms your participation in a VoteX poll.
      </p>
    `;

    sendMail(user.email, " Vote Confirmed", html);

    const io = req.app.get("io");
    if (io) {
      const results = poll.choices.map(
        (_, i) => poll.votes.filter((v) => v.choiceIndex === i).length
      );
      io.to(poll._id.toString()).emit("voteUpdate", {
        pollId: poll._id.toString(),
        results,
      });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("VOTE ERROR:", err);
    res.status(500).json({ error: "Vote failed" });
  }
};

/* ======================
   UPDATE POLL
====================== */
exports.updatePoll = async (req, res) => {
  try {
    const poll = await Poll.findById(req.params.id);
    if (!poll) return res.status(404).json({ error: "Poll not found" });

    const { title, description, choices, endsAt, startsAt, status } = req.body;

    if (title) poll.title = title;
    if (description) poll.description = description;

    if (Array.isArray(choices) && choices.length >= 2) {
      poll.choices = choices.map((c) => ({ text: c.text }));
    }

    if (startsAt !== undefined) {
      const start = startsAt ? parseDate(startsAt) : null;
      if (startsAt && !start) {
        return res.status(400).json({ error: "Invalid start date" });
      }
      poll.startsAt = start || new Date();
    }

    if (endsAt !== undefined && endsAt !== null && endsAt !== "") {
      const end = parseDate(endsAt);
      if (!end) {
        return res.status(400).json({ error: "Invalid end date" });
      }
      poll.endsAt = end;
    }

    if (poll.endsAt && poll.endsAt.getTime() <= poll.startsAt.getTime()) {
      return res.status(400).json({ error: "End date must be after the start date" });
    }

    if (status !== undefined) {
      if (!Object.values(POLL_STATUS).includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }
      poll.status = status;
    }

    await poll.save();

    clearPollTimers(poll._id);
    schedulePoll(req.app.get("io"), poll);

    res.json({ ok: true, poll });
  } catch (err) {
    console.error("UPDATE POLL ERROR:", err);
    res.status(500).json({ error: "Update failed" });
  }
};

exports.deletePoll = async (req, res) => {
  try {
    const poll = await Poll.findByIdAndDelete(req.params.id);
    if (!poll) return res.status(404).json({ error: "Poll not found" });

    clearPollTimers(poll._id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Delete failed" });
  }
};
